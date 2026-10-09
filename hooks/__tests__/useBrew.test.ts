/**
 * The one retry the brew path gives itself.
 *
 * #199: "at brew time, it often takes a few tries to connect and brew, even
 * when the machine is awake and already connected". Nobody has a reliable
 * repro, but the reports share a shape: the second or third press works with
 * nothing changed in between. The retry is deliberately narrow, and these
 * cases are mostly about what it refuses to retry.
 */
import {act, cleanup, renderHook} from "@testing-library/react-native";
import {AppState, type AppStateStatus} from "react-native";

import {useBrew} from "@/hooks/useBrew";
import {useBrewRun} from "@/hooks/useBrewRun";
import {BluetoothPermissionError, RadioUnavailableError} from "@/library/machine/errors";
import Machine from "@/library/machine/Machine";
import type {BrewPhase} from "@/library/machine/Machine";
import {FakeTransport, machineInfoFrame} from "@/library/machine/__tests__/FakeTransport";
import {event, float32, notification, status} from "@/library/machine/__tests__/protocolFixtures";
import Pour from "@/library/Pour";
import Recipe from "@/library/Recipe";

jest.mock("@/hooks/useSetting", () => ({
    useSetting: (key: string) => [key === "machineAutoStart" ? true : "", () => undefined]
}));

const mockConnect = jest.fn(async () => {});
let mockSharedMachine: Machine;

jest.mock("@/hooks/useMachine", () => ({
    __esModule: true,
    useMachine: (injected: unknown) => ({
        machine: injected ?? mockSharedMachine,
        connect: mockConnect,
        status: "connected",
        error: null,
        remembered: "",
        forget: jest.fn()
    })
}));

type FakeMachine = Machine & {
    attempts: number;
    disconnects: number;
    phase: BrewPhase;
};

/**
 * A machine whose `brew` fails for a stated reason the first time.
 *
 * `outcome` is what the first attempt does; the second always succeeds, so a
 * test that sees two attempts has seen the retry and a test that sees one has
 * seen it declined.
 */
function fake(options: {
    phaseAfterFailure: BrewPhase;
    thrown?: Error;
    connected?: boolean;
}): FakeMachine {
    const m = {
        attempts: 0,
        disconnects: 0,
        phase: {name: "idle"} as BrewPhase,
        isConnected: () => options.connected ?? true,
        onPhase: () => () => undefined,
        setBypassTempEncoding: () => undefined,
        setAutoStart: () => undefined,
        disconnect: async () => { m.disconnects++; },
        brew: async () => {
            m.attempts++;
            if (m.attempts > 1) return;
            m.phase = options.phaseAfterFailure;
            throw options.thrown ?? new Error("it did not go");
        }
    };
    return m as unknown as FakeMachine;
}

function brewable(): Recipe {
    const r = new Recipe();
    r.pours = [new Pour(1, 240, 93, 40, 0, 0, 0)];
    return r;
}

async function run(machine: FakeMachine) {
    const {result} = await renderHook(() => useBrew(machine));
    await act(async () => { await result.current.brew(brewable()); });
    return result;
}

beforeEach(() => mockConnect.mockClear());

describe("ordinary user pause, resume and cancel errors", () => {
    it.each(["pauseBrew", "resumeBrew", "cancelBrew"] as const)(
        "keeps %s failures in the existing user error path", async command => {
            const machine = fake({phaseAfterFailure: {name: "idle"}});
            const sent = jest.fn(async () => { throw new Error(`failed ${command}`); });
            machine[command] = sent;
            const {result} = await renderHook(() => useBrew(machine));
            await act(async () => { await result.current[command](); });
            expect(sent).toHaveBeenCalledWith();
            expect(result.current.error).toBe(`failed ${command}`);
        }
    );
});

describe("a brew that failed on the link", () => {
    it("drops the link and tries once more", async () => {
        const machine = fake({
            phaseAfterFailure: {
                name: "failed", reason: "blocked",
                detail: "The machine is not connected.", block: "notConnected"
            }
        });

        const result = await run(machine);

        expect(machine.attempts).toBe(2);
        expect(machine.disconnects).toBe(1);
        expect(result.current.error).toBeNull();
    });

    it("tries again when the attempt died before the machine said anything", async () => {
        // The connect threw, or a write did. Either way nothing was refused.
        const machine = fake({phaseAfterFailure: {name: "idle"}});

        await run(machine);

        expect(machine.attempts).toBe(2);
    });

    it("tries again when the machine never said how it was doing", async () => {
        const machine = fake({
            phaseAfterFailure: {
                name: "failed", reason: "blocked",
                detail: "The machine has not answered yet.", block: "noVitals"
            }
        });

        await run(machine);

        expect(machine.attempts).toBe(2);
    });
});

describe("overflow protection through useBrew's real preflight retry", () => {
    const appStateDescriptor = Object.getOwnPropertyDescriptor(AppState, "currentState")!;
    let appListeners: Set<(state: AppStateStatus) => void>;

    beforeEach(() => {
        jest.useFakeTimers();
        Object.defineProperty(AppState, "currentState", {configurable: true, value: "active"});
        appListeners = new Set();
        jest.spyOn(AppState, "addEventListener").mockImplementation((_event, listener) => {
            appListeners.add(listener);
            return {remove: () => { appListeners.delete(listener); }};
        });
    });

    afterEach(async () => {
        await cleanup();
        jest.restoreAllMocks();
        mockConnect.mockReset();
        Object.defineProperty(AppState, "currentState", appStateDescriptor);
        jest.useRealTimers();
    });

    async function setup(block?: "noVitals" | "notConnected", configured = true) {
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0, infoWaitMs: 1});
        await machine.connect("AA:BB");
        mockSharedMachine = machine;
        mockConnect.mockImplementation(async () => { await machine.connect("AA:BB"); });
        const r = brewable();
        r.cupType = 1;
        r.dosage = 15;
        r.ratio = 16;
        r.grindSize = 60;
        r.pours[0].flowRate = 30;
        if (configured) r.overflowProtection = {retainedGrams: 50, checkSeconds: 15};
        const phases: BrewPhase[] = [];
        machine.onPhase(phase => {
            phases.push(phase);
            if (phase.name === "failed" && phase.reason === "blocked") {
                transport.infoReply = machineInfoFrame();
                if (configured) r.overflowProtection = {retainedGrams: 200, checkSeconds: 45};
            }
        });
        if (block === "noVitals") {
            machine.info = null;
            transport.infoReply = null;
        } else if (block === "notConnected") {
            // Lose the link during the real preflight question, before brewBlock.
            jest.spyOn(machine, "askHowItIsDoing").mockImplementationOnce(async () => {
                transport.drop();
                return false;
            });
        }
        const pause = jest.spyOn(machine, "pauseBrew");
        const resume = jest.spyOn(machine, "resumeBrew");
        const store = {insert: jest.fn()};
        const hook = await renderHook(() => useBrewRun(r, store, 7));
        return {transport, machine, r, phases, pause, resume, ...hook};
    }

    async function pair(transport: FakeTransport, water = 100, cup = 0) {
        await act(async () => {
            transport.emit(notification(0x4B, 0x9E, float32(water * 1000)));
            transport.emit(notification(0x15, 0x9E, float32(cup)));
        });
    }

    async function advance(ms: number) {
        await act(async () => { await jest.advanceTimersByTimeAsync(ms); });
    }

    it.each(["noVitals", "notConnected"] as const)(
        "protects the successful second attempt after %s on the same machine/runId", async block => {
            const h = await setup(block);
            const attempts = jest.spyOn(h.machine, "brew");
            const disconnect = jest.spyOn(h.machine, "disconnect");
            await act(async () => {
                const brewing = h.result.current.brew(h.r);
                await jest.advanceTimersByTimeAsync(100);
                await brewing;
            });
            expect(h.phases).toContainEqual(expect.objectContaining({
                name: "failed", reason: "blocked", block
            }));
            expect(attempts).toHaveBeenCalledTimes(2);
            expect(disconnect).toHaveBeenCalledTimes(1);
            expect(h.result.current.error).toBeNull();
            expect(h.transport.sent.filter(code => code === 8002)).toHaveLength(1);
            expect(h.result.current.machine).toBe(h.machine);
            const retriedSnapshot = h.result.current.overflow;
            await act(async () => {
                h.transport.emit(status(0x22));
                h.transport.emit(event(40507));
            });
            await pair(h.transport);
            await advance(500);
            await pair(h.transport);
            expect(h.pause).toHaveBeenCalledTimes(1);
            expect(h.pause).toHaveBeenCalledWith("overflow");
            expect(retriedSnapshot).toEqual({
                mode: "armed", retainedGrams: null, nextCheckAt: null, telemetryAvailable: false
            });
            expect(h.result.current.overflow?.mode).toBe("requesting");
            await act(async () => { h.transport.emit(event(40515)); });
            expect(h.result.current.overflow?.nextCheckAt).toBe(Date.now() + 15_000);
        }
    );

    it.each(["noVitals", "notConnected"] as const)(
        "keeps an unconfigured %s retry without a protection owner", async block => {
            const h = await setup(block, false);
            await act(async () => {
                const brewing = h.result.current.brew(h.r);
                await jest.advanceTimersByTimeAsync(100);
                await brewing;
                h.transport.emit(event(40507));
            });
            await pair(h.transport);
            await advance(500);
            await pair(h.transport);
            expect(h.result.current.overflow).toBeUndefined();
            expect(appListeners.size).toBe(0);
            expect(h.pause).not.toHaveBeenCalled();
            expect(h.transport.sent.filter(code => code === 8002)).toHaveLength(1);
        }
    );

    it.each(["background", "lostContact"] as const)(
        "does not re-arm after %s during an actual brew", async reason => {
            const h = await setup();
            await act(async () => {
                await h.result.current.brew(h.r);
                h.transport.emit(event(40507));
                if (reason === "background") {
                    appListeners.forEach(listener => listener("inactive"));
                    appListeners.forEach(listener => listener("active"));
                } else {
                    h.transport.drop();
                    await h.machine.connect("AA:BB");
                }
                h.transport.emit(event(40507));
            });
            await pair(h.transport);
            await advance(500);
            await pair(h.transport);
            expect(h.result.current.overflow?.disabledReason).toBe(reason);
            expect(h.pause).not.toHaveBeenCalled();
            expect(h.resume).not.toHaveBeenCalled();
        }
    );

    it("keeps an actual recipe-send fault ended and visible without an automatic retry", async () => {
        const h = await setup();
        const attempts = jest.spyOn(h.machine, "brew");
        h.transport.failWriteOf = {code: 8001, reason: "recipe write failed"};
        await act(async () => { await h.result.current.brew(h.r); });
        expect(attempts).toHaveBeenCalledTimes(1);
        expect(mockConnect).not.toHaveBeenCalled();
        expect(h.result.current.error).toBe("recipe write failed");
        expect(h.machine.phase).toMatchObject({name: "failed", reason: "rejected"});
        await act(async () => { h.transport.emit(event(40507)); });
        await pair(h.transport);
        await advance(500);
        await pair(h.transport);
        expect(h.result.current.overflow?.mode).toBe("ended");
        expect(h.pause).not.toHaveBeenCalled();
    });
});

describe("a brew the machine actually refused", () => {
    it("does not ask a low tank twice", async () => {
        // The answer will not change, and the second ask costs another beep.
        const machine = fake({
            phaseAfterFailure: {
                name: "failed", reason: "blocked",
                detail: "The tank will not cover this.", block: "notEnoughWater"
            }
        });

        const result = await run(machine);

        expect(machine.attempts).toBe(1);
        expect(result.current.error).toBe("it did not go");
    });

    it("does not retry a recipe the machine will not take", async () => {
        const machine = fake({
            phaseAfterFailure: {
                name: "failed", reason: "blocked",
                detail: "The dose is 0 g.", block: "recipe"
            }
        });

        await run(machine);

        expect(machine.attempts).toBe(1);
    });

    it("never sends a second dose after a brew has started", async () => {
        // The most important of these. A brew that got as far as grinding has
        // spent a dose, and a silent retry would spend another.
        const machine = fake({
            phaseAfterFailure: {name: "grinding"}
        });

        await run(machine);

        expect(machine.attempts).toBe(1);
    });

    it("never resends a recipe a write threw on", async () => {
        // The transport writes without response, so a write that threw does
        // not prove the frame missed the machine. The recipe may have landed
        // and be grinding; a resend there is a second dose.
        const machine = fake({
            phaseAfterFailure: {name: "failed", reason: "rejected"}
        });

        await run(machine);

        expect(machine.attempts).toBe(1);
    });

    it("does not ask for Bluetooth permission a second time", async () => {
        // `openLink` keeps the permission check outside its own retrying on
        // purpose, so that a declined prompt is not repeated.
        const machine = fake({
            phaseAfterFailure: {name: "idle"},
            thrown: new BluetoothPermissionError("Bluetooth permission is off.", true)
        });

        await run(machine);

        expect(machine.attempts).toBe(1);
    });

    it("does not retry a radio that is off", async () => {
        // A fact about the phone. A second attempt changes nothing.
        const machine = fake({
            phaseAfterFailure: {name: "idle"},
            thrown: new RadioUnavailableError("Bluetooth is off.")
        });

        const result = await run(machine);

        expect(machine.attempts).toBe(1);
        expect(result.current.error).toBe("Bluetooth is off.");
    });
});

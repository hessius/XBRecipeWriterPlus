/**
 * The one retry the brew path gives itself.
 *
 * #199: "at brew time, it often takes a few tries to connect and brew, even
 * when the machine is awake and already connected". Nobody has a reliable
 * repro, but the reports share a shape: the second or third press works with
 * nothing changed in between. The retry is deliberately narrow, and these
 * cases are mostly about what it refuses to retry.
 */
import {act, renderHook} from "@testing-library/react-native";

import {useBrew} from "@/hooks/useBrew";
import {RadioUnavailableError} from "@/library/machine/errors";
import type Machine from "@/library/machine/Machine";
import type {BrewPhase} from "@/library/machine/Machine";
import Pour from "@/library/Pour";
import Recipe from "@/library/Recipe";

jest.mock("@/hooks/useSetting", () => ({
    useSetting: (key: string) => [key === "machineAutoStart" ? true : "", () => undefined]
}));

const mockConnect = jest.fn(async () => {});

jest.mock("@/hooks/useMachine", () => ({
    __esModule: true,
    useMachine: (injected: unknown) => ({
        machine: injected,
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

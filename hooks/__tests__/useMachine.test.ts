import {act, renderHook} from "@testing-library/react-native";

import {
    applyMachineReading, connectRememberedMachine, holdLinkAcrossAppState, openLink, useMachine,
    __resetSharedMachine, type MachineReading
} from "@/hooks/useMachine";
import {CONNECT_DELAYS_MS, STUDIO_MODEL_STRINGS} from "@/constants/machine";
import {sharedSettings} from "@/hooks/useSetting";
import {DEFAULTS} from "@/library/Settings";
import {FakeTransport} from "@/library/machine/__tests__/FakeTransport";
import Machine, {isActiveBrewPhase, type BrewPhase} from "@/library/machine/Machine";
import {BluetoothPermissionError} from "@/library/machine/errors";
import type {BluetoothPermissionResult} from "@/library/machine/Transport";

// `library/machine/Transport` (imported transitively by the hook) builds a
// BleManager singleton at module load, which throws under Jest. These tests
// inject a fake transport and never touch the real radio, so a bare stand-in
// for the native module is all that is needed for the import to resolve.
jest.mock("react-native-ble-manager", () => ({__esModule: true, default: {}}));

// `useSetting` reaches for the shared SQLite-backed store, which cannot open
// under Jest. This file now needs `sharedSettings` as well, because the link
// records what the machine said through it -- and a per-hook stand-in would
// give the writer and the reader two different stores, so a correction would
// be invisible to every assertion here.
jest.mock("@/hooks/useSetting", () =>
    require("@/test-utils/settingsMock").settingsMock());

describe("the machine link", () => {
    beforeEach(() => {
        __resetSharedMachine();
        // The mock's store outlives each test, unlike the seed object it
        // replaced, so every key a test writes has to be put back by hand.
        for (const key of ["machineDeviceId", "machineModel",
                           "machineModelString", "machineName"] as const) {
            sharedSettings().set(key, DEFAULTS[key]);
        }
    });

    it("does not touch the radio until something asks it to", async () => {
        const transport = new FakeTransport();
        await renderHook(() => useMachine(new Machine(transport, {frameGapMs: 0})));

        // A beep at launch, for a user who opened the app to edit a recipe, is
        // the machine shouting about something nobody asked for.
        expect(transport.connectedTo).toBeNull();
    });

    it("starts idle — no attempt has been made, nothing is known about range", async () => {
        // "Disconnected" would be false: it implies we tried and the machine
        // was not reachable. "Idle" is the honest starting position.
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        const {result} = await renderHook(() => useMachine(machine, {wait: async () => {}}));

        expect(result.current.status).toBe("idle");
    });

    it("does not become disconnected if a link event fires before any connect", async () => {
        // onLink can fire whenever the Machine emits link history (e.g. note()).
        // If one fires while we are still idle, the status must not change to
        // "disconnected" — that would be a lie about what happened. The hook's
        // setStatus functional updater guards this by only moving to
        // "disconnected" from "connected".
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        const {result} = await renderHook(() => useMachine(machine, {wait: async () => {}}));
        expect(result.current.status).toBe("idle");

        // note() calls announceLink(), which fires the hook's onLink callback
        // with isConnected() === false — the idle case we are guarding.
        await act(async () => { machine.note("test"); });

        expect(result.current.status).toBe("idle");
    });

    it("connects on demand and stays connected", async () => {
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        const {result} = await renderHook(() => useMachine(machine, {wait: async () => {}}));

        await act(async () => { await result.current.connect(); });
        expect(result.current.status).toBe("connected");

        // A second ask must not reconnect: the machine beeps every time.
        transport.written = [];
        await act(async () => { await result.current.connect(); });
        expect(transport.sent).toEqual([]);
    });

    it("reports why it could not connect", async () => {
        const transport = new FakeTransport();
        transport.refuseConnection = true;
        const machine = new Machine(transport, {frameGapMs: 0});
        const {result} = await renderHook(() => useMachine(machine, {wait: async () => {}}));

        // Thrown as well as recorded: the brew path needs the reason, because
        // one line later it would only be able to say "not connected".
        await act(async () => {
            await expect(result.current.connect()).rejects.toThrow(/another app/i);
        });

        expect(result.current.status).toBe("failed");
        expect(result.current.error).toMatch(/another app/i);
    });

    it("says so when there is no machine to be found", async () => {
        const transport = new FakeTransport();
        transport.devices = [];
        const machine = new Machine(transport, {frameGapMs: 0});
        const {result} = await renderHook(() => useMachine(machine, {wait: async () => {}}));

        await act(async () => {
            await expect(result.current.connect()).rejects.toThrow(/could not find/i);
        });

        expect(result.current.status).toBe("failed");
        expect(result.current.error).toMatch(/could not find/i);
    });

    it("forgets the machine when asked", async () => {
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        const {result} = await renderHook(() => useMachine(machine, {wait: async () => {}}));
        await act(async () => { await result.current.connect(); });

        await act(async () => { await result.current.forget(); });

        expect(result.current.status).toBe("idle");
        expect(result.current.remembered).toBe("");
        expect(transport.connectedTo).toBeNull();
    });

    it("notices the link dropping, rather than going on saying connected", async () => {
        // The case that matters most produces no frame at all, so a hook
        // watching frames would sit there claiming the machine is connected.
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        const {result} = await renderHook(() => useMachine(machine, {wait: async () => {}}));
        await act(async () => { await result.current.connect(); });
        expect(result.current.status).toBe("connected");

        await act(async () => { transport.drop(); });

        expect(result.current.status).toBe("disconnected");
    });

    it("scans again when the remembered machine is not there any more", async () => {
        // A restored backup can carry an identifier from another phone. Without
        // this the only way out is the "forget this machine" button, which
        // nobody would think to look for.
        const transport = new FakeTransport();
        transport.devices = [{id: "NEW:ID", name: "XBLOOM TEST"}];
        transport.refuseIds = ["OLD:ID"];
        const machine = new Machine(transport, {frameGapMs: 0});

        sharedSettings().set("machineDeviceId", "OLD:ID");
        const {result} = await renderHook(() => useMachine(machine, {wait: async () => {}}));

        await act(async () => { await result.current.connect(); });

        expect(result.current.status).toBe("connected");
        expect(transport.connectedTo).toBe("NEW:ID");
        expect(result.current.remembered).toBe("NEW:ID");
    });

    it("records what the machine said, without touching the setting", async () => {
        const transport = new FakeTransport();
        transport.modelNumber = "XB-MYSTERY-9";
        transport.advertisedName = "XBLOOM-77";
        const recorded: MachineReading[] = [];
        const store = {
            rememberedId: () => "AA:BB",
            rememberId: () => {},
            recordMachine: (reading: MachineReading) => { recorded.push(reading); return false; }
        };

        await openLink(new Machine(transport, {frameGapMs: 0}), store, async () => ({granted: true} as const));

        expect(recorded).toEqual([{model: "XB-MYSTERY-9", name: "XBLOOM-77"}]);
    });

    it("records the reading even when the machine was already remembered", async () => {
        // Firmware can change under a machine whose identifier did not, so this
        // must not ride along on the "new machine" branch.
        const transport = new FakeTransport();
        transport.modelNumber = "XB-2";
        const recorded: MachineReading[] = [];
        const store = {
            rememberedId: () => "AA:BB",
            rememberId: () => { throw new Error("should not re-remember a known machine"); },
            recordMachine: (reading: MachineReading) => { recorded.push(reading); return false; }
        };

        await openLink(new Machine(transport, {frameGapMs: 0}), store, async () => ({granted: true} as const));

        expect(recorded).toHaveLength(1);
    });

    it("keeps a working link when it cannot write down what the machine is", async () => {
        // Writing the reading is a synchronous SQLite write and it can fail.
        // The link is open by then, so a throw here would report a failure over
        // a machine that is genuinely connected, and skip remembering it.
        const transport = new FakeTransport();
        const remembered: string[] = [];
        const store = {
            rememberedId: () => "",
            rememberId: (id: string) => { remembered.push(id); },
            recordMachine: () => { throw new Error("disk full"); }
        };
        const machine = new Machine(transport, {frameGapMs: 0});

        await expect(openLink(machine, store, async () => ({granted: true} as const))).resolves.toBeUndefined();

        expect(transport.connectedTo).not.toBeNull();
        expect(remembered).toHaveLength(1);
        expect(machine.linkHistory.some((event) => event.text.includes("disk full"))).toBe(true);
    });

    it("throws the readings away when the user unpairs", async () => {
        // The one place discarding is right: the stored string described the
        // machine being unpaired, not whatever gets paired next.
        sharedSettings().set("machineModelString", "X15");
        sharedSettings().set("machineName", "XBLOOM-77");
        const transport = new FakeTransport();

        const {result} = await renderHook(() => useMachine(new Machine(transport, {frameGapMs: 0})));
        await act(async () => { await result.current.forget(); });

        expect(sharedSettings().get("machineModelString")).toBe("");
        expect(sharedSettings().get("machineName")).toBe("");
    });

    it("leaves the setting alone for a machine it does not recognise", async () => {
        sharedSettings().set("machineModel", "original");
        const transport = new FakeTransport();
        transport.modelNumber = "XB-MYSTERY-9";

        const {result} = await renderHook(() => useMachine(new Machine(transport, {frameGapMs: 0})));
        await act(async () => { await result.current.connect(); });

        // Unrecognised is not evidence of anything. The user's answer stands.
        expect(result.current.machineModel).toBe("original");
        // But it is still written down, which is the whole point of collecting it.
        expect(sharedSettings().get("machineModelString")).toBe("XB-MYSTERY-9");
    });

    it("corrects the setting when the machine is certainly a Studio", async () => {
        sharedSettings().set("machineModel", "original");
        const transport = new FakeTransport();
        transport.modelNumber = STUDIO_MODEL_STRINGS[0] ?? "nothing matches an empty list";

        const {result} = await renderHook(() => useMachine(new Machine(transport, {frameGapMs: 0})));
        await act(async () => { await result.current.connect(); });

        // Written so it passes with STUDIO_MODEL_STRINGS empty and starts asserting
        // real behaviour the moment Task 11 fills it in, without being edited.
        const expected = STUDIO_MODEL_STRINGS.length > 0 ? "studio" : "original";
        expect(result.current.machineModel).toBe(expected);
    });

    it("keeps what an earlier connect learned when this one learns nothing", async () => {
        // The returning user's case: no scan, so no advertised name, and firmware
        // that does not carry the Device Information Service says nothing either.
        const settings = sharedSettings();
        settings.set("machineModelString", "X15");
        settings.set("machineName", "XBLOOM-77");

        applyMachineReading(settings, {model: "", name: ""});

        expect(settings.get("machineModelString")).toBe("X15");
        expect(settings.get("machineName")).toBe("XBLOOM-77");
    });

    it("takes each half of a reading on its own", async () => {
        // A returning user learns a model and no name, because the scan was
        // skipped. Half a reading must not be thrown away with the other half.
        const settings = sharedSettings();
        settings.set("machineName", "XBLOOM-77");

        applyMachineReading(settings, {model: "X15", name: ""});

        expect(settings.get("machineModelString")).toBe("X15");
        expect(settings.get("machineName")).toBe("XBLOOM-77");
    });
});

describe("holding the link across the app going away", () => {
    /** An AppState a test can drive, in place of the platform's. */
    function fakeAppState() {
        const handlers = new Set<(state: string) => void>();
        const remove = jest.fn();
        return {
            addEventListener(_type: "change", handler: (state: string) => void) {
                handlers.add(handler);
                return {
                    remove: () => {
                        handlers.delete(handler);
                        remove();
                    }
                };
            },
            async go(state: string) {
                handlers.forEach((handler) => handler(state));
                for (let i = 0; i < 20; i++) await Promise.resolve();
            },
            listenerCount: () => handlers.size,
            remove
        };
    }

    function lifecycleMachine(initialPhase: BrewPhase = {name: "idle"}) {
        const listeners = new Set<(phase: BrewPhase) => void>();
        let connected = true;
        const machine = {
            phase: initialPhase,
            isConnected: () => connected,
            disconnect: jest.fn(async () => { connected = false; }),
            note: jest.fn(),
            onPhase(listener: (phase: BrewPhase) => void) {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
            emitPhase(phase: BrewPhase) {
                machine.phase = phase;
                listeners.forEach((listener) => listener(phase));
            },
            reconnect() {
                connected = true;
            },
            drop() {
                connected = false;
            },
            phaseListenerCount: () => listeners.size
        };
        return machine;
    }

    async function held() {
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        const appState = fakeAppState();
        const reconnect = jest.fn(async () => { await machine.connect("AA:BB"); });
        holdLinkAcrossAppState(machine, reconnect, {appState});
        return {transport, machine, appState, reconnect};
    }

    it("keeps the link through a transient interruption", async () => {
        // iOS fires `inactive` for notification centre, the app switcher and
        // every system alert. Dropping the link for those is why the machine
        // kept going away for no reason the user could see.
        const {transport, machine, appState} = await held();
        await machine.connect("AA:BB");

        await appState.go("inactive");

        expect(transport.connectedTo).toBe("AA:BB");
    });

    it("gives the slot back when the app really goes away", async () => {
        // The machine permits one link, and an app iOS has suspended is not
        // using the one it holds.
        const {transport, machine, appState} = await held();
        await machine.connect("AA:BB");

        await appState.go("background");

        expect(transport.connectedTo).toBeNull();
    });

    it("takes the link back when the app comes to the front again", async () => {
        const {transport, machine, appState} = await held();
        await machine.connect("AA:BB");

        await appState.go("background");
        await appState.go("active");

        expect(transport.connectedTo).toBe("AA:BB");
    });

    it("does not reach for a link the user never asked for", async () => {
        // A beep at launch, for somebody who opened the app to edit a recipe,
        // is the machine shouting about something nobody asked for. Coming back
        // to the front is not a request.
        const {transport, appState, reconnect} = await held();

        await appState.go("background");
        await appState.go("active");

        expect(reconnect).not.toHaveBeenCalled();
        expect(transport.connectedTo).toBeNull();
    });

    it("tries again next time the app comes back, having failed this time", async () => {
        const {transport, machine, appState, reconnect} = await held();
        await machine.connect("AA:BB");
        await appState.go("background");
        transport.refuseConnection = true;
        await appState.go("active");
        reconnect.mockClear();

        transport.refuseConnection = false;
        await appState.go("inactive");
        await appState.go("active");

        expect(reconnect).toHaveBeenCalled();
        expect(transport.connectedTo).toBe("AA:BB");
    });

    it("does not run two reconnections at once", async () => {
        const {machine, appState, reconnect} = await held();
        await machine.connect("AA:BB");
        await appState.go("background");

        // Two `active` events in a row, as the platform will happily deliver.
        await Promise.all([appState.go("active"), appState.go("active")]);

        expect(reconnect).toHaveBeenCalledTimes(1);
    });

    it.each([
        "waking", "sending", "readyToStart", "armed", "pressPlay",
        "grinding", "pouring", "bypass", "settling"
    ] satisfies BrewPhase["name"][])("retains the link during background %s", async (name) => {
        const phase: BrewPhase = name === "pouring"
            ? {name: "pouring", pour: 1, pours: 2}
            : {name} as BrewPhase;
        const machine = lifecycleMachine(phase);
        const appState = fakeAppState();
        const reconnect = jest.fn(async () => machine.reconnect());

        holdLinkAcrossAppState(machine, reconnect, {appState});
        await appState.go("background");

        expect(isActiveBrewPhase(machine.phase)).toBe(true);
        expect(machine.disconnect).not.toHaveBeenCalled();
        expect(machine.isConnected()).toBe(true);
    });

    it("disconnects once when a retained brew becomes terminal in background", async () => {
        const machine = lifecycleMachine({name: "pouring", pour: 1, pours: 2});
        const appState = fakeAppState();
        const reconnect = jest.fn(async () => machine.reconnect());

        holdLinkAcrossAppState(machine, reconnect, {appState});
        await appState.go("background");
        machine.emitPhase({name: "done"});
        machine.emitPhase({name: "cancelled"});
        await Promise.resolve();

        expect(machine.disconnect).toHaveBeenCalledTimes(1);
        expect(machine.isConnected()).toBe(false);
    });

    it("does not reconnect or replace a retained link on foreground", async () => {
        const machine = lifecycleMachine({name: "grinding"});
        const appState = fakeAppState();
        const reconnect = jest.fn(async () => machine.reconnect());

        holdLinkAcrossAppState(machine, reconnect, {appState});
        await appState.go("background");
        await appState.go("active");

        expect(reconnect).not.toHaveBeenCalled();
        expect(machine.isConnected()).toBe(true);
    });

    it("does not reconnect after genuine transport loss during a background brew", async () => {
        const machine = lifecycleMachine({name: "pouring", pour: 1, pours: 2});
        const appState = fakeAppState();
        const reconnect = jest.fn(async () => machine.reconnect());

        holdLinkAcrossAppState(machine, reconnect, {appState});
        await appState.go("background");
        machine.drop();
        machine.emitPhase({name: "lostContact"});
        await appState.go("active");

        expect(reconnect).not.toHaveBeenCalled();
    });

    it("waits for its background disconnect before reconnecting on a fast return", async () => {
        const machine = lifecycleMachine({name: "idle"});
        const appState = fakeAppState();
        let finishDisconnect: (() => void) | undefined;
        machine.disconnect.mockImplementation(() => new Promise<void>((resolve) => {
            finishDisconnect = () => {
                machine.drop();
                resolve();
            };
        }));
        const reconnect = jest.fn(async () => machine.reconnect());

        holdLinkAcrossAppState(machine, reconnect, {appState});
        await appState.go("background");
        await appState.go("active");

        expect(reconnect).not.toHaveBeenCalled();
        finishDisconnect?.();
        for (let i = 0; i < 20; i++) await Promise.resolve();

        expect(reconnect).toHaveBeenCalledTimes(1);
        expect(machine.isConnected()).toBe(true);
    });

    it("releases an idle reconnect that finishes after the app backgrounds again", async () => {
        const machine = lifecycleMachine({name: "idle"});
        const appState = fakeAppState();
        let finishReconnect: (() => void) | undefined;
        const reconnect = jest.fn()
            .mockImplementationOnce(() => new Promise<void>((resolve) => {
                finishReconnect = () => {
                    machine.reconnect();
                    resolve();
                };
            }))
            .mockImplementation(async () => machine.reconnect());

        holdLinkAcrossAppState(machine, reconnect, {appState});
        await appState.go("background");
        await appState.go("active");
        await appState.go("background");
        finishReconnect?.();
        for (let i = 0; i < 20; i++) await Promise.resolve();

        expect(reconnect).toHaveBeenCalledTimes(1);
        expect(machine.disconnect).toHaveBeenCalledTimes(2);
        expect(machine.isConnected()).toBe(false);

        await appState.go("active");

        expect(reconnect).toHaveBeenCalledTimes(2);
        expect(machine.isConnected()).toBe(true);
    });

    it("records a failed lifecycle disconnect without an unhandled rejection", async () => {
        const machine = lifecycleMachine({name: "idle"});
        machine.disconnect.mockRejectedValueOnce(new Error("radio refused"));
        const appState = fakeAppState();

        holdLinkAcrossAppState(machine, async () => machine.reconnect(), {appState});
        await appState.go("background");

        expect(machine.note).toHaveBeenCalledWith(
            "could not give the link back — radio refused"
        );
    });

    it("removes both app-state and phase listeners during cleanup", () => {
        const machine = lifecycleMachine();
        const appState = fakeAppState();
        const cleanup = holdLinkAcrossAppState(
            machine, async () => machine.reconnect(), {appState}
        );

        expect(appState.listenerCount()).toBe(1);
        expect(machine.phaseListenerCount()).toBe(1);

        cleanup();

        expect(appState.listenerCount()).toBe(0);
        expect(machine.phaseListenerCount()).toBe(0);
        expect(appState.remove).toHaveBeenCalledTimes(1);
    });
});

describe("connecting to a machine that is already paired", () => {
    it("reaches for the machine at launch once one has been paired", async () => {
        // Asked for directly: having paired a machine, the user expects it to
        // be there. Making them press Connect every launch is a chore the app
        // can do for them, and the whole point of remembering the identifier.
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        const store = {
            rememberedId: () => "AA:BB",
            rememberId: jest.fn(),
            recordMachine: () => false
        };

        await connectRememberedMachine(machine, store, async () => ({granted: true} as const));

        expect(transport.connectedTo).toBe("AA:BB");
    });

    it("stays quiet when no machine has ever been paired", async () => {
        // A beep at launch, for somebody who opened the app to edit a recipe
        // and will never own a J15, is the machine shouting about something
        // nobody asked for. It also means no scan, and no Bluetooth prompt.
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        const permission = jest.fn(async () => ({granted: true} as const));
        const store = {
            rememberedId: () => "",
            rememberId: jest.fn(),
            recordMachine: () => false
        };

        await connectRememberedMachine(machine, store, permission);

        expect(transport.connectedTo).toBeNull();
        expect(permission).not.toHaveBeenCalled();
    });

    it("says nothing when the machine is switched off", async () => {
        // Nobody asked for this connection, so nobody should be shown an error
        // about it failing. The status line in Settings says it well enough.
        const transport = new FakeTransport();
        transport.refuseConnection = true;
        const machine = new Machine(transport, {frameGapMs: 0});
        const store = {
            rememberedId: () => "AA:BB",
            rememberId: jest.fn(),
            recordMachine: () => false
        };

        await expect(connectRememberedMachine(
            machine, store, async () => ({granted: true} as const), {wait: async () => {}}
        )).resolves.toBeUndefined();
    });
});

describe("opening a link that does not want to open", () => {
    const noWait = async () => {};
    const machine0 = (transport: FakeTransport) => new Machine(transport, {frameGapMs: 0});
    const store = () => ({
        rememberedId: () => "AA:BB",
        rememberId: jest.fn(),
        recordMachine: () => false
    });

    it("keeps trying, rather than making the user press Connect again", async () => {
        // On hardware this has taken up to five presses. Pressing a button over
        // and over is not a thing to ask of somebody stood at a coffee machine.
        const transport = new FakeTransport();
        transport.refuseNextConnections = 4;
        const machine = new Machine(transport, {frameGapMs: 0});

        await openLink(machine, store(), async () => ({granted: true} as const), {wait: noWait});

        expect(transport.connectedTo).toBe("AA:BB");
    });

    it("gives up eventually, and says why it could not", async () => {
        // A machine that is switched off should stop being asked about, and the
        // reason has to survive the retrying: "the machine is already in use by
        // another app" is far more use than "could not connect".
        const transport = new FakeTransport();
        transport.refuseConnection = true;
        const machine = new Machine(transport, {frameGapMs: 0});

        await expect(openLink(machine, store(), async () => ({granted: true} as const), {wait: noWait}))
            .rejects.toThrow(/another app/i);
    });

    it("stops the moment it succeeds", async () => {
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        const waited = jest.fn(async () => {});

        await openLink(machine, store(), async () => ({granted: true} as const), {wait: waited});

        expect(waited).not.toHaveBeenCalled();
        expect(transport.connectedTo).toBe("AA:BB");
    });

    it("does not retry a refusal the user has to act on", async () => {
        // Waiting fourteen seconds to be told the app needs permission it was
        // already denied helps nobody.
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        const permission = jest.fn(
            async (): Promise<BluetoothPermissionResult> =>
                ({granted: false, permanentlyDenied: false})
        );

        await expect(openLink(machine, store(), permission, {wait: noWait}))
            .rejects.toThrow(/permission/i);

        expect(permission).toHaveBeenCalledTimes(1);
    });

    it("sends a permanently denied user to Settings rather than asking again", async () => {
        // Android only. Refuse the system dialog twice and it never appears
        // again, so "grant permission" is advice the OS will now ignore.
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        const permission = async (): Promise<BluetoothPermissionResult> =>
            ({granted: false, permanentlyDenied: true});

        let failure: BluetoothPermissionError | undefined;
        await openLink(machine, store(), permission, {wait: noWait})
            .catch((e: unknown) => { failure = e as BluetoothPermissionError; });

        expect(failure).toBeInstanceOf(BluetoothPermissionError);
        expect(failure?.canOpenSettings).toBe(true);
        expect(failure?.message).toMatch(/settings/i);
    });

    it("does not send a first refusal to Settings", async () => {
        // The dialog will appear again, so asking again is the remedy and
        // Settings would be the long way round to the same place.
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        const permission = async (): Promise<BluetoothPermissionResult> =>
            ({granted: false, permanentlyDenied: false});

        let failure: BluetoothPermissionError | undefined;
        await openLink(machine, store(), permission, {wait: noWait})
            .catch((e: unknown) => { failure = e as BluetoothPermissionError; });

        expect(failure).toBeInstanceOf(BluetoothPermissionError);
        expect(failure?.canOpenSettings).toBe(false);
        expect(failure?.message).not.toMatch(/settings/i);
    });

    it("keeps trying at launch too, not only when a button was pressed", async () => {
        const transport = new FakeTransport();
        transport.refuseNextConnections = 3;
        const machine = new Machine(transport, {frameGapMs: 0});

        await connectRememberedMachine(machine, store(), async () => ({granted: true} as const), {wait: noWait});

        expect(transport.connectedTo).toBe("AA:BB");
    });

    it("stops when the user forgets the machine while it is still trying", async () => {
        // The retrying takes about fourteen seconds. Somebody who gives up on
        // it and presses "forget this machine" has said what they want, and
        // connecting anyway — to a machine the app has just been told to stop
        // remembering — is the app arguing with them.
        const transport = new FakeTransport();
        transport.refuseNextConnections = 2;
        let id = "AA:BB";
        const store = {
            rememberedId: () => id,
            rememberId: jest.fn(),
            recordMachine: () => false
        };

        const opening = openLink(machine0(transport), store, async () => ({granted: true} as const), {
            wait: async () => { id = ""; }
        });

        await expect(opening).rejects.toThrow();
        expect(transport.connectedTo).toBeNull();
    });

    it("has as many attempts as the constant says", async () => {
        const transport = new FakeTransport();
        transport.refuseNextConnections = CONNECT_DELAYS_MS.length;
        const machine = new Machine(transport, {frameGapMs: 0});

        await expect(openLink(machine, store(), async () => ({granted: true} as const), {wait: noWait}))
            .rejects.toThrow();
    });
});

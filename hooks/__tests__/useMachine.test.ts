import {act, renderHook} from "@testing-library/react-native";

import {
    connectRememberedMachine, holdLinkAcrossAppState, openLink, useMachine, warmConnect, __resetSharedMachine
} from "@/hooks/useMachine";
import {CONNECT_DELAYS_MS} from "@/constants/machine";
import {FakeTransport} from "@/library/machine/__tests__/FakeTransport";
import Machine from "@/library/machine/Machine";

// `library/machine/Transport` (imported transitively by the hook) builds a
// BleManager singleton at module load, which throws under Jest. These tests
// inject a fake transport and never touch the real radio, so a bare stand-in
// for the native module is all that is needed for the import to resolve.
jest.mock("react-native-ble-manager", () => ({__esModule: true, default: {}}));

// `useSetting` reaches for the shared SQLite-backed store, which cannot open
// under Jest. The settings tests avoid this by injecting an in-memory `Settings`,
// but `useMachine` takes no store to inject, so the store is mocked here instead
// with a per-hook in-memory value that starts at the real default. Same spirit
// as the `jest.mock("@/library/RecipeDatabase")` the other hook tests use.
const mockSeed: Record<string, unknown> = {};

jest.mock("@/hooks/useSetting", () => {
    const React = require("react");
    const {DEFAULTS} = require("@/library/Settings");
    const useSetting = (key: string) =>
        React.useState(key in mockSeed ? mockSeed[key] : DEFAULTS[key]);
    return {__esModule: true, default: useSetting, useSetting};
});

describe("the machine link", () => {
    beforeEach(() => {
        __resetSharedMachine();
        for (const key of Object.keys(mockSeed)) delete mockSeed[key];
    });

    it("does not touch the radio until something asks it to", async () => {
        const transport = new FakeTransport();
        await renderHook(() => useMachine(new Machine(transport, {frameGapMs: 0})));

        // A beep at launch, for a user who opened the app to edit a recipe, is
        // the machine shouting about something nobody asked for.
        expect(transport.connectedTo).toBeNull();
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

        expect(result.current.status).toBe("disconnected");
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

        mockSeed.machineDeviceId = "OLD:ID";
        const {result} = await renderHook(() => useMachine(machine, {wait: async () => {}}));

        await act(async () => { await result.current.connect(); });

        expect(result.current.status).toBe("connected");
        expect(transport.connectedTo).toBe("NEW:ID");
        expect(result.current.remembered).toBe("NEW:ID");
    });
});

describe("holding the link across the app going away", () => {
    /** An AppState a test can drive, in place of the platform's. */
    function fakeAppState() {
        const handlers: ((state: string) => void)[] = [];
        return {
            addEventListener(_type: "change", handler: (state: string) => void) {
                handlers.push(handler);
                return {remove() {}};
            },
            /** Move the app to a state and let the handlers finish. */
            async go(state: string) {
                for (const handler of handlers) handler(state);
                // The handlers are async inside; let their chains settle.
                for (let i = 0; i < 20; i++) await Promise.resolve();
            }
        };
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
});

describe("connecting to a machine that is already paired", () => {
    it("reaches for the machine at launch once one has been paired", async () => {
        // Asked for directly: having paired a machine, the user expects it to
        // be there. Making them press Connect every launch is a chore the app
        // can do for them, and the whole point of remembering the identifier.
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        const store = {rememberedId: () => "AA:BB", rememberId: jest.fn()};

        await connectRememberedMachine(machine, store, async () => true);

        expect(transport.connectedTo).toBe("AA:BB");
    });

    it("stays quiet when no machine has ever been paired", async () => {
        // A beep at launch, for somebody who opened the app to edit a recipe
        // and will never own a J15, is the machine shouting about something
        // nobody asked for. It also means no scan, and no Bluetooth prompt.
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        const permission = jest.fn(async () => true);
        const store = {rememberedId: () => "", rememberId: jest.fn()};

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
        const store = {rememberedId: () => "AA:BB", rememberId: jest.fn()};

        await expect(connectRememberedMachine(
            machine, store, async () => true, {wait: async () => {}}
        )).resolves.toBeUndefined();
    });
});

describe("opening a link that does not want to open", () => {
    const noWait = async () => {};
    const machine0 = (transport: FakeTransport) => new Machine(transport, {frameGapMs: 0});
    const store = () => ({rememberedId: () => "AA:BB", rememberId: jest.fn()});

    it("keeps trying, rather than making the user press Connect again", async () => {
        // On hardware this has taken up to five presses. Pressing a button over
        // and over is not a thing to ask of somebody stood at a coffee machine.
        const transport = new FakeTransport();
        transport.refuseNextConnections = 4;
        const machine = new Machine(transport, {frameGapMs: 0});

        await openLink(machine, store(), async () => true, {wait: noWait});

        expect(transport.connectedTo).toBe("AA:BB");
    });

    it("gives up eventually, and says why it could not", async () => {
        // A machine that is switched off should stop being asked about, and the
        // reason has to survive the retrying: "the machine is already in use by
        // another app" is far more use than "could not connect".
        const transport = new FakeTransport();
        transport.refuseConnection = true;
        const machine = new Machine(transport, {frameGapMs: 0});

        await expect(openLink(machine, store(), async () => true, {wait: noWait}))
            .rejects.toThrow(/another app/i);
    });

    it("stops the moment it succeeds", async () => {
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        const waited = jest.fn(async () => {});

        await openLink(machine, store(), async () => true, {wait: waited});

        expect(waited).not.toHaveBeenCalled();
        expect(transport.connectedTo).toBe("AA:BB");
    });

    it("does not retry a refusal the user has to act on", async () => {
        // Waiting fourteen seconds to be told the app needs permission it was
        // already denied helps nobody.
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        const permission = jest.fn(async () => false);

        await expect(openLink(machine, store(), permission, {wait: noWait}))
            .rejects.toThrow(/permission/i);

        expect(permission).toHaveBeenCalledTimes(1);
    });

    it("keeps trying at launch too, not only when a button was pressed", async () => {
        const transport = new FakeTransport();
        transport.refuseNextConnections = 3;
        const machine = new Machine(transport, {frameGapMs: 0});

        await connectRememberedMachine(machine, store(), async () => true, {wait: noWait});

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
        const store = {rememberedId: () => id, rememberId: jest.fn()};

        const opening = openLink(machine0(transport), store, async () => true, {
            wait: async () => { id = ""; }
        });

        await expect(opening).rejects.toThrow();
        expect(transport.connectedTo).toBeNull();
    });

    it("has as many attempts as the constant says", async () => {
        const transport = new FakeTransport();
        transport.refuseNextConnections = CONNECT_DELAYS_MS.length;
        const machine = new Machine(transport, {frameGapMs: 0});

        await expect(openLink(machine, store(), async () => true, {wait: noWait}))
            .rejects.toThrow();
    });
});

describe("warm connect at launch", () => {
    it("reaches for a remembered machine at launch", async () => {
        const connect = jest.fn(async () => {});
        warmConnect({rememberedId: () => "device-1", rememberId: jest.fn()}, connect);
        await Promise.resolve();
        expect(connect).toHaveBeenCalled();
    });

    it("does not scan when no machine has ever been seen", async () => {
        // A radio spinning for nobody, and a beep at launch for somebody who
        // opened the app to edit a recipe.
        const connect = jest.fn(async () => {});
        warmConnect({rememberedId: () => "", rememberId: jest.fn()}, connect);
        await Promise.resolve();
        expect(connect).not.toHaveBeenCalled();
    });

    it("swallows a failure to connect at launch", async () => {
        // The machine being off is the ordinary case, not an error worth
        // surfacing before the user has asked for anything.
        const connect = jest.fn(async () => { throw new Error("out of range"); });
        expect(() => warmConnect(
            {rememberedId: () => "device-1", rememberId: jest.fn()}, connect
        )).not.toThrow();
    });
});

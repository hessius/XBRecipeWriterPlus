import {act, renderHook} from "@testing-library/react-native";

import {useMachine, __resetSharedMachine} from "@/hooks/useMachine";
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
        const {result} = await renderHook(() => useMachine(machine));

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
        const {result} = await renderHook(() => useMachine(machine));

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
        const {result} = await renderHook(() => useMachine(machine));

        await act(async () => {
            await expect(result.current.connect()).rejects.toThrow(/could not find/i);
        });

        expect(result.current.status).toBe("failed");
        expect(result.current.error).toMatch(/could not find/i);
    });

    it("forgets the machine when asked", async () => {
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        const {result} = await renderHook(() => useMachine(machine));
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
        const {result} = await renderHook(() => useMachine(machine));
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
        const {result} = await renderHook(() => useMachine(machine));

        await act(async () => { await result.current.connect(); });

        expect(result.current.status).toBe("connected");
        expect(transport.connectedTo).toBe("NEW:ID");
        expect(result.current.remembered).toBe("NEW:ID");
    });
});

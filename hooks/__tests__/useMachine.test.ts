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
jest.mock("@/hooks/useSetting", () => {
    const React = require("react");
    const {DEFAULTS} = require("@/library/Settings");
    const useSetting = (key: string) => React.useState(DEFAULTS[key]);
    return {__esModule: true, default: useSetting, useSetting};
});

describe("the machine link", () => {
    beforeEach(() => __resetSharedMachine());

    it("does not touch the radio until something asks it to", async () => {
        const transport = new FakeTransport();
        await renderHook(() => useMachine(new Machine(transport)));

        // A beep at launch, for a user who opened the app to edit a recipe, is
        // the machine shouting about something nobody asked for.
        expect(transport.connectedTo).toBeNull();
    });

    it("connects on demand and stays connected", async () => {
        const transport = new FakeTransport();
        const machine = new Machine(transport);
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
        const machine = new Machine(transport);
        const {result} = await renderHook(() => useMachine(machine));

        await act(async () => { await result.current.connect(); });

        expect(result.current.status).toBe("failed");
        expect(result.current.error).toMatch(/another app/i);
    });

    it("says so when there is no machine to be found", async () => {
        const transport = new FakeTransport();
        transport.devices = [];
        const machine = new Machine(transport);
        const {result} = await renderHook(() => useMachine(machine));

        await act(async () => { await result.current.connect(); });

        expect(result.current.status).toBe("failed");
        expect(result.current.error).toMatch(/could not find/i);
    });

    it("forgets the machine when asked", async () => {
        const transport = new FakeTransport();
        const machine = new Machine(transport);
        const {result} = await renderHook(() => useMachine(machine));
        await act(async () => { await result.current.connect(); });

        await act(async () => { await result.current.forget(); });

        expect(result.current.status).toBe("disconnected");
        expect(result.current.remembered).toBe("");
        expect(transport.connectedTo).toBeNull();
    });
});

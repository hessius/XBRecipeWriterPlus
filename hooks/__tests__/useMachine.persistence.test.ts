import {act, renderHook} from "@testing-library/react-native";

import {useMachine} from "@/hooks/useMachine";
import {FakeTransport} from "@/library/machine/__tests__/FakeTransport";
import Machine from "@/library/machine/Machine";
import {Settings, type SettingsStorage} from "@/library/Settings";

jest.mock("react-native-ble-manager", () => ({__esModule: true, default: {}}));

/**
 * A store that really stores, unlike the `useSetting` stand-in the other hook
 * tests use.
 *
 * Those mock `useSetting` with `React.useState`, which is enough to exercise
 * the connect algorithm but says nothing at all about whether the identifier
 * survives — a hook-local `useState` "persists" perfectly and loses everything
 * on reload, which is exactly the failure this file exists to catch.
 */
function memoryStorage(): SettingsStorage {
    const rows = new Map<string, string>();
    return {
        read: (key) => rows.get(key) ?? null,
        write: (key, value) => { rows.set(key, value); }
    };
}

describe("remembering which machine this is", () => {
    it("writes the identifier to the settings store, not merely to React", async () => {
        // Without this the app scans on every single connect — ten seconds of
        // it — and never connects at launch, because the launch path has
        // nothing to connect to.
        const storage = memoryStorage();
        const settings = new Settings(storage);
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        const {result} = await renderHook(() =>
            useMachine(machine, {settings, wait: async () => {}}));

        await act(async () => { await result.current.connect(); });

        expect(settings.get("machineDeviceId")).toBe("AA:BB");
        expect(storage.read("machineDeviceId")).toBe(JSON.stringify("AA:BB"));
    });

    it("still knows the machine after everything is built again", async () => {
        // A reload throws away every hook and rebuilds from the store. What is
        // read back here is what the user sees: a remembered machine is what
        // puts "forget this machine" on screen and what the launch connect
        // reaches for.
        const storage = memoryStorage();
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        const {result} = await renderHook(() => useMachine(machine, {
            settings: new Settings(storage), wait: async () => {}
        }));
        await act(async () => { await result.current.connect(); });

        const afterReload = await renderHook(() => useMachine(
            new Machine(new FakeTransport(), {frameGapMs: 0}),
            {settings: new Settings(storage), wait: async () => {}}
        ));

        expect(afterReload.result.current.remembered).toBe("AA:BB");
    });

    it("forgets it from the store too, not only from this screen", async () => {
        const storage = memoryStorage();
        const settings = new Settings(storage);
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        const {result} = await renderHook(() =>
            useMachine(machine, {settings, wait: async () => {}}));
        await act(async () => { await result.current.connect(); });

        await act(async () => { await result.current.forget(); });

        expect(settings.get("machineDeviceId")).toBe("");
    });
});

import {act, renderHook} from "@testing-library/react-native";

import {useSetting} from "@/hooks/useSetting";
import {Settings, type SettingsStorage} from "@/library/Settings";

function memoryStorage(): SettingsStorage {
    const values = new Map<string, string>();
    return {
        read:  (key) => values.get(key) ?? null,
        write: (key, value) => {
            values.set(key, value);
        }
    };
}

describe("useSetting", () => {
    it("starts at the stored default", async () => {
        const settings = new Settings(memoryStorage());
        const {result} = await renderHook(() => useSetting("showCoffeeMarker", settings));
        expect(result.current[0]).toBe(true);
    });

    it("reports a value written before the hook mounted", async () => {
        const settings = new Settings(memoryStorage());
        settings.set("showCoffeeMarker", false);
        const {result} = await renderHook(() => useSetting("showCoffeeMarker", settings));
        expect(result.current[0]).toBe(false);
    });

    it("re-renders with the new value when set", async () => {
        const settings = new Settings(memoryStorage());
        const {result} = await renderHook(() => useSetting("showCoffeeMarker", settings));

        await act(async () => result.current[1](false));

        expect(result.current[0]).toBe(false);
    });

    it("persists the new value, not just the React state", async () => {
        const storage = memoryStorage();
        const settings = new Settings(storage);
        const {result} = await renderHook(() => useSetting("showCoffeeMarker", settings));

        await act(async () => result.current[1](false));

        // A fresh Settings over the same storage: this is what the next launch
        // sees, and it is the half that a state-only implementation loses.
        expect(new Settings(storage).get("showCoffeeMarker")).toBe(false);
    });

    it("repaints every reader of the key, not only the one that changed it", async () => {
        // The settings screen and each RecipeCard are separate call sites over
        // one store. Per-instance state leaves the cards showing the old value
        // until they happen to remount, which on the home screen means "until
        // the app is reloaded".
        const settings = new Settings(memoryStorage());
        const toggler = await renderHook(() => useSetting("showCoffeeMarker", settings));
        const reader = await renderHook(() => useSetting("showCoffeeMarker", settings));

        await act(async () => toggler.result.current[1](false));

        expect(reader.result.current[0]).toBe(false);
    });

    it("stops listening once unmounted", async () => {
        const settings = new Settings(memoryStorage());
        const {result, unmount} = await renderHook(() => useSetting("showCoffeeMarker", settings));

        unmount();

        // Not an assertion about the value — it is that notifying a store with
        // no live readers must not try to update an unmounted one.
        expect(() => settings.set("showCoffeeMarker", false)).not.toThrow();
        expect(result.current[0]).toBe(true);
    });
});

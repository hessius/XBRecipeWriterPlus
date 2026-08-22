import {DEFAULTS, Settings, type SettingsStorage} from "../Settings";

/** A storage backend that keeps everything in memory. */
function fakeStorage(seed: Record<string, string> = {}): SettingsStorage {
    const map = new Map(Object.entries(seed));
    return {
        read:  (key) => map.get(key) ?? null,
        write: (key, value) => {
            map.set(key, value);
        }
    };
}

describe("Settings", () => {
    it("returns the default for a setting that was never written", () => {
        expect(new Settings(fakeStorage()).get("showCoffeeMarker"))
            .toBe(DEFAULTS.showCoffeeMarker);
    });

    it("returns a stored value", () => {
        const settings = new Settings(fakeStorage());
        settings.set("showCoffeeMarker", false);
        expect(settings.get("showCoffeeMarker")).toBe(false);
    });

    it("round-trips false rather than treating it as unset", () => {
        // The bug this guards: `stored ?? default` is correct, `stored ||
        // default` is not, and for a boolean setting whose default is true the
        // difference is that turning it off does nothing.
        const settings = new Settings(fakeStorage());
        settings.set("showCoffeeMarker", false);
        expect(new Settings(fakeStorage({showCoffeeMarker: "false"}))
            .get("showCoffeeMarker")).toBe(false);
    });

    it("falls back to the default when a stored value is corrupt", () => {
        const settings = new Settings(fakeStorage({showCoffeeMarker: "not json"}));
        expect(settings.get("showCoffeeMarker")).toBe(DEFAULTS.showCoffeeMarker);
    });

    it("falls back to the default when a stored value is the wrong type", () => {
        // Parseable but nonsense: a settings row edited by hand, or written by
        // a future version that changed the type.
        const settings = new Settings(fakeStorage({showCoffeeMarker: '"yes"'}));
        expect(settings.get("showCoffeeMarker")).toBe(DEFAULTS.showCoffeeMarker);
    });

    it("persists through the storage backend, not just in memory", () => {
        const map: Record<string, string> = {};
        const storage: SettingsStorage = {
            read:  (key) => map[key] ?? null,
            write: (key, value) => {
                map[key] = value;
            }
        };
        new Settings(storage).set("showCoffeeMarker", false);
        expect(map.showCoffeeMarker).toBe("false");
    });
});

/**
 * An in-memory stand-in for the settings store, for component tests.
 *
 * `useSetting` reaches for the shared SQLite-backed store, which cannot open
 * under Jest — `NativeDatabase is not a constructor`. A screen that reads one
 * setting would otherwise be untestable, so the mock puts the same two exports
 * over a plain object, seeded from the real `DEFAULTS` so a test only has to
 * say the one key it cares about.
 *
 * Used from a `jest.mock` factory, which may not close over anything not named
 * `mock*` but may `require` — hence a module rather than a value:
 *
 * ```ts
 * jest.mock("@/hooks/useSetting", () =>
 *     require("@/test-utils/settingsMock").settingsMock());
 * ```
 */
export function settingsMock() {
    const React = require("react");
    const {DEFAULTS} = require("@/library/Settings");
    const store: Record<string, unknown> = {...DEFAULTS};
    const listeners = new Set<() => void>();
    const settings = {
        get: (key: string) => store[key],
        set: (key: string, value: unknown) => {
            store[key] = value;
            listeners.forEach((notify) => notify());
        },
        subscribe: (notify: () => void) => {
            listeners.add(notify);
            return () => listeners.delete(notify);
        }
    };
    const sharedSettings = () => settings;
    const useSetting = (key: string) => {
        const value = React.useSyncExternalStore(
            settings.subscribe, () => settings.get(key)
        );
        return [value, (next: unknown) => settings.set(key, next)];
    };
    return {__esModule: true, default: useSetting, useSetting, sharedSettings};
}

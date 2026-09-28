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
    // The second parameter is the real hook's injection seam, which several
    // screens use to hand a test its own store. A mock that ignored it would
    // quietly answer from this module's store instead, and the test would be
    // asserting against settings it never wrote.
    const useSetting = (key: string, injected = settings) => {
        const value = React.useSyncExternalStore(
            injected.subscribe, () => injected.get(key)
        );
        return [value, (next: unknown) => injected.set(key, next)];
    };
    return {__esModule: true, default: useSetting, useSetting, sharedSettings};
}

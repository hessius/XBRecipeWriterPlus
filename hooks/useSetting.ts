import {useSyncExternalStore} from "react";

import {Settings, type SettingKey, type SettingValue} from "@/library/Settings";

/**
 * The app's settings store.
 *
 * Created on first use rather than at import time: constructing it opens the
 * SQLite database, which must not happen merely because a module was imported —
 * not least in tests, which pass their own store instead.
 */
let shared: Settings | undefined;

export function sharedSettings(): Settings {
    shared ??= new Settings();
    return shared;
}

/**
 * Read and write one setting, as React state.
 *
 * Subscribed to the store rather than holding its own copy: the settings screen
 * and every `RecipeCard` read the same key, and per-instance state would leave
 * the cards showing the old value until they next remounted.
 *
 * Reads are synchronous, so there is no loading state and no flash of the
 * default: `Settings` is backed by expo-sqlite's synchronous API. That is also
 * what makes `get` safe to use as the snapshot.
 *
 * @param settings Injected by tests. Production call sites omit it.
 */
export function useSetting<K extends SettingKey>(
    key: K,
    settings: Settings = sharedSettings()
): [SettingValue<K>, (value: SettingValue<K>) => void] {
    const value = useSyncExternalStore(
        settings.subscribe,
        // Returns a primitive, so it is a new call but never a new identity,
        // and React's snapshot comparison stays stable.
        () => settings.get(key)
    );

    function update(next: SettingValue<K>) {
        // No local state to set: the store notifies, this hook re-reads, and
        // every other reader of the key does the same.
        settings.set(key, next);
    }

    return [value, update];
}

export default useSetting;

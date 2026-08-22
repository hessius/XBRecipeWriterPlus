import {useState} from "react";

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
 * Reads are synchronous, so there is no loading state and no flash of the
 * default: `Settings` is backed by expo-sqlite's synchronous API.
 *
 * @param settings Injected by tests. Production call sites omit it.
 */
export function useSetting<K extends SettingKey>(
    key: K,
    settings: Settings = sharedSettings()
): [SettingValue<K>, (value: SettingValue<K>) => void] {
    const [value, setValue] = useState<SettingValue<K>>(() => settings.get(key));

    function update(next: SettingValue<K>) {
        // Written before the state changes. If the write throws, the UI must not
        // be left showing a value that was never stored.
        settings.set(key, next);
        setValue(next);
    }

    return [value, update];
}

export default useSetting;

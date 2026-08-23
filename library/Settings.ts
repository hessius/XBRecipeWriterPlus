import * as SQLite from 'expo-sqlite';

/**
 * Every setting, with its default.
 *
 * This map is the single source of both the key list and the value types — a
 * key that is not here is a compile error at the call site, so there is no
 * stringly-typed lookup to typo.
 */
export const DEFAULTS = {
    /**
     * The `TEA` marker is always shown; `COFFEE` is redundant in a mostly-coffee
     * library, so it can be turned off.
     */
    showCoffeeMarker: true,
    /**
     * Fill the pour profile with a screen of dots instead of a flat tint.
     *
     * Off by default: the two read differently at card size and which is better
     * is a matter of taste, so the quieter one is what arrives unasked for.
     */
    dotMatrixProfile: false,
    /**
     * How the long-form field explanations are delivered.
     *
     * Two modes ship because which reads better is a question a mockup cannot
     * answer. `explain` is the default: its resting state is the calmer of the
     * two, and one visible control is more discoverable than a marker beside
     * every label. Expected to resolve to one mode after device testing.
     */
    helpStyle: "explain"
} as const;

export type SettingKey = keyof typeof DEFAULTS;

/**
 * Widen a literal type (as produced by `DEFAULTS`'s `as const`) back to its
 * base primitive type, so `set()` accepts any `boolean`/`number`/`string`
 * rather than only the exact literal default value.
 */
type Widen<T> = T extends boolean ? boolean
    : T extends number ? number
    : T extends string ? string
    : T;

export type SettingValue<K extends SettingKey> = Widen<(typeof DEFAULTS)[K]>;

/**
 * Where settings are kept.
 *
 * An interface rather than a hard dependency on SQLite so the store can be
 * tested without a database: `RecipeDatabase` has no tests and no mock, and
 * introducing one to check a defaults map would be a poor trade.
 */
export interface SettingsStorage {
    read(key: string): string | null;
    write(key: string, value: string): void;
}

/** The real backend: a table alongside `recipes` in the app's database. */
export class SqliteSettingsStorage implements SettingsStorage {
    private db: SQLite.SQLiteDatabase;

    constructor() {
        this.db = SQLite.openDatabaseSync('xbrecipewriter.db');
        this.db.execSync(`
            CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT);`
        );
    }

    public read(key: string): string | null {
        const row = this.db.getFirstSync<{value: string | null}>(
            `SELECT value FROM settings WHERE key = ?;`, [key]
        );
        return row?.value ?? null;
    }

    public write(key: string, value: string): void {
        this.db.runSync(
            `INSERT INTO settings (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
            [key, value]
        );
    }
}

export class Settings {
    private storage: SettingsStorage;
    private listeners = new Set<() => void>();

    constructor(storage: SettingsStorage = new SqliteSettingsStorage()) {
        this.storage = storage;
    }

    /**
     * Watch for changes to any setting.
     *
     * A bound property rather than a method so its identity is stable per
     * store: `useSyncExternalStore` re-subscribes whenever the function it is
     * given changes, which for a method reference recreated each render would
     * be every render.
     *
     * Deliberately not per-key. There is one setting today and a handful
     * foreseen, so every reader re-reading its own key on any change is
     * cheaper than the bookkeeping to avoid it — `get` is a single indexed
     * SELECT.
     *
     * @returns The unsubscribe function.
     */
    public subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };

    public get<K extends SettingKey>(key: K): SettingValue<K> {
        const raw = this.storage.read(key);
        if (raw === null) {
            return DEFAULTS[key] as SettingValue<K>;
        }

        try {
            const parsed: unknown = JSON.parse(raw);
            // Type-check against the default rather than trusting what is
            // stored. A row edited by hand, or written by a version that
            // changed this setting's type, must not propagate as the wrong
            // type into the rest of the app.
            //
            // Sound only for primitive defaults. `typeof` collapses arrays,
            // plain objects and null to "object", so a setting whose default
            // is an object or array needs a real shape check here rather than
            // this one.
            if (typeof parsed !== typeof DEFAULTS[key]) {
                return DEFAULTS[key] as SettingValue<K>;
            }
            return parsed as SettingValue<K>;
        } catch {
            return DEFAULTS[key] as SettingValue<K>;
        }
    }

    public set<K extends SettingKey>(key: K, value: SettingValue<K>): void {
        this.storage.write(key, JSON.stringify(value));
        // After the write, never before: a listener that re-reads the store
        // must not be able to observe the old value.
        for (const listener of this.listeners) {
            listener();
        }
    }
}

/** The two help deliveries. */
export const HELP_STYLES = ["explain", "markers"] as const;

export type HelpStyle = (typeof HELP_STYLES)[number];

/**
 * Narrow a stored setting back to a `HelpStyle`.
 *
 * `SettingValue` widens a string default to `string`, which is right for the
 * store — it must accept whatever is in the database — and wrong for a consumer
 * that has exactly two branches. Anything unrecognised falls back to the
 * default rather than throwing: a bad row in SQLite should not take the screen
 * down.
 */
export function asHelpStyle(value: string): HelpStyle {
    return (HELP_STYLES as readonly string[]).includes(value)
        ? (value as HelpStyle)
        : "explain";
}

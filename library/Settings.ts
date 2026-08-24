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
     * Draw the one-line hint under every label on the BREW deck.
     *
     * Off by default. On a real phone the deck explained more than it needed
     * to: with a hint under all nine labels the screen is mostly prose about
     * fields whose captions already say what they are, and the values you came
     * to edit are what gets pushed off the bottom. The long form is in the help
     * sheet either way.
     */
    showHints: false,
    /**
     * How opening a recipe is animated. See `TRANSITIONS`.
     *
     * `slide` by default: it is what the platform draws everywhere else, so it
     * is the one a user already knows, and the three alternatives all replace a
     * transition the system owns with one this app has to get right on every
     * device. They are offered rather than imposed, for the same reason
     * `dotMatrixProfile` is.
     */
    transition: "slide"
} as const;

/**
 * The ways a recipe can open.
 *
 * The card on the list and the hero at the top of the editor are the same
 * object drawn at two sizes, in the same accent colour, so the question each of
 * these answers differently is what to do with that colour across the seam.
 *
 * - `slide`   the platform's push. The accent is on both screens but plays no
 *             part in the motion.
 * - `morph`   the tapped card's rectangle grows into the hero's. The accent is
 *             the mechanism, and the two surfaces read as one object resized.
 * - `container` the same journey with its details finished: the card's name
 *             travels and cross-fades into the hero's, and the deck below rises
 *             into place behind it.
 * - `reveal`  a disc of the recipe's accent opens from the point that was
 *             touched and floods the screen. Pure colour, and it says nothing
 *             about the card's shape -- drama rather than continuity.
 */
export const TRANSITIONS = ["slide", "morph", "container", "reveal"] as const;

export type Transition = (typeof TRANSITIONS)[number];

/**
 * Read a stored transition, falling back to the default.
 *
 * Settings are stored as text and the store cannot know what any given key's
 * values mean, so a value written by an older build -- or by a newer one, on a
 * database that has been downgraded -- arrives here as an arbitrary string.
 */
export function asTransition(value: string): Transition {
    return (TRANSITIONS as readonly string[]).includes(value)
        ? (value as Transition)
        : DEFAULTS.transition;
}

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

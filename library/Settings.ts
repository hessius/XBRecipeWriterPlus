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
     * The unit temperatures are shown and entered in.
     *
     * Celsius by default, and Celsius canonically: the card stores one byte of
     * whole Celsius and every value behind `library/units.ts` is in it. This
     * setting changes what is drawn on a field and what a stepper walks, and
     * nothing else.
     *
     * Only temperature converts. The dose is in grams — which is how coffee is
     * weighed everywhere it is taken seriously, the United States included —
     * and the ratio is dimensionless, so a volume shown in fluid ounces would
     * make the ratio beside it correspond to nothing on screen.
     */
    temperatureUnit: "C" as "C" | "F",
    /**
     * Which of the two candidate tea steep encodings to send.
     *
     * The protocol's least-settled corner: HomoLand derives the encoding from
     * the official app's own transform, saya6k derives it from two stopwatch
     * readings and says so. They are not variants of one scheme, and a wrong
     * choice produces no error at all — the tea simply steeps for the wrong
     * length. HomoLand's wins on provenance and is the default; the other is
     * reachable from the machine console so a stopwatch can settle it.
     */
    teaSteepEncoding: "homoland" as "homoland" | "saya6k",
    /**
     * The last machine that connected, so later sessions reconnect directly
     * rather than scanning. Empty until one has.
     *
     * This is also what the editor's action bar reads to decide whether to
     * offer BREW at all: an empty string means nobody here owns a J15, and a
     * dead button on every recipe would be worse than no button.
     */
    machineDeviceId: "",
    /**
     * Whether a brew has ever run from this phone.
     *
     * The cup-and-pod reminder is said once and then never again. None of it is
     * detectable — the machine cannot tell us whether a cup is under the spout
     * — so it is stated rather than checked, and stating it every time would
     * train people to stop reading it.
     */
    firstBrewDone: false,
    /**
     * Whether the machine console's warning has been read and accepted.
     *
     * The console sends unverified commands to a hot, motorised appliance. The
     * acknowledgement is stored so it is asked once rather than nagged, and it
     * is a separate key from the per-command confirmations below because they
     * answer different questions: may I be here at all, and may I send this.
     */
    machineConsoleAcknowledged: false,
    /**
     * Whether the console still asks before each command that moves hardware.
     *
     * On by default and deliberately awkward to turn off. Somebody deep in a
     * debugging session will want it gone; somebody who opened the console once
     * by accident should not be one tap from spinning a burr.
     */
    machineConsoleConfirmations: true
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

import * as SQLite from 'expo-sqlite';

import {DEFAULT_BREW_SHORTCUT} from "@/library/brewShortcut";

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
    machineConsoleConfirmations: true,
    /**
     * Whether BREW commits the recipe itself, or waits for one more press.
     *
     * Off by default. Committing is the frame that starts a burr spinning, and
     * on hardware the machine goes from committed to grinding with nothing in
     * between and no confirmation of its own — so somebody who tapped BREW to
     * see what the screen looked like would be standing over a running
     * grinder. With this off the recipe is uploaded and the brew route offers
     * START; the machine holds the recipe quite happily until then.
     */
    machineAutoStart: false,
    /**
     * Whether every recipe row carries a BREW capsule.
     *
     * On by default: reaching the machine from the library is the whole point
     * of the milestone, and a shortcut nobody can see is not a shortcut. It is
     * also a permanent mark on every card, and somebody who brews rarely will
     * want it gone.
     */
    showBrewOnRecipeRows: true,
    /**
     * Which shape that shortcut takes.
     *
     * A second key rather than five values on the boolean above. `get` falls
     * back to `DEFAULTS[key]` for an absent row and there is no migration
     * machinery here, so folding the two together would quietly switch the
     * shortcut back on for anybody who had turned it off. When one shape wins,
     * this key goes and the boolean stays.
     *
     * Read through `asBrewShortcut`: `get` only compares `typeof` against the
     * default, which cannot tell one string from another.
     */
    brewShortcut: DEFAULT_BREW_SHORTCUT as string,
    /**
     * Whether the brew chart animates between phases.
     *
     * On by default, and layered on top of the system Reduced Motion
     * preference rather than replacing it: the system switch is about
     * vestibular safety and this one is about taste, and answering the first
     * should not require answering the second. When either is off, each
     * animation holds its end state rather than disappearing.
     */
    animateBrewChart: true,
    /**
     * How many brews keep their raw sample stream.
     *
     * A stream is about 2 400 samples — some tens of kilobytes — and only the
     * brews you are still dialling in are worth that. The records themselves
     * are never swept: history stays complete, and only the detail behind it
     * expires. Zero is a real choice and means zero.
     */
    brewTraceRetention: 50
} as const;

export type SettingKey = keyof typeof DEFAULTS;

/**
 * Preferences a backup deliberately does not carry.
 *
 * `machineDeviceId` is a Bluetooth peripheral identifier, and on iOS the
 * operating system mints a different one for every phone that has ever seen
 * the machine. It is not a fact about the machine, it is a fact about this
 * phone's relationship with it. Restored onto a second phone it names nothing
 * that phone's radio has ever issued, so the app would sit reaching for a
 * machine that, as far as it is concerned, does not exist -- and it would have
 * displaced whatever pairing that phone had made for itself.
 *
 * Named here rather than simply omitted from the snapshot so that the
 * exhaustiveness test still holds every other key to account: a key is either
 * in a backup or on this list, never quietly missing from both.
 */
export type BackupExcluded = "machineDeviceId";
export const NOT_IN_BACKUP: readonly SettingKey[] = ["machineDeviceId"];

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

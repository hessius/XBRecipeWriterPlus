import * as SQLite from 'expo-sqlite';
import type {SortAxis, SortDirection} from './librarySort';
import type {LibraryView} from './libraryView';

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
     * Draw the picture a recipe arrived with, where there is one.
     *
     * Off by default, because this is here to find out whether a face or a pod
     * photo helps at all. A 40 pt mark is a far smaller promise than the recipe
     * images the roadmap deferred, and anything that will not load falls back
     * to the accent mark without saying a word about it.
     */
    showRecipeAvatars: false,
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
     * Which reading of the bypass temperature argument to send.
     *
     * The command descriptor calls the argument "bypass temp x10", which is
     * either tenths of a degree or a scale factor nobody has confirmed. A wrong
     * choice raises no error: the bypass simply arrives at the wrong
     * temperature. The scaled reading is the one the descriptor implies and is
     * the default; the other is reachable from the machine console so a
     * thermometer can settle it.
     */
    bypassTempEncoding: "scaled" as "scaled" | "plain",
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
    brewTraceRetention: 50,
    /**
     * How the library is ordered, and which way.
     *
     * Global rather than per shelf, on purpose: a per-shelf order would change
     * under the user for a reason the chip cannot show, and the chip would then
     * report a state belonging to something other than the thing they last
     * touched. Name is the default the sort chip stays a bare glyph for; any
     * other axis takes the accent fill and names itself.
     *
     * A `SortAxis` union documents the intended values, but it cannot enforce
     * them at the read boundary: `SettingValue` widens the union back to
     * `string` and `get()` checks only `typeof`, so a stale or hand-edited row
     * can still return an axis this build has no fragment for. The real guard is
     * `asSortAxis` in `librarySort.ts`, which every reader narrows through
     * before an axis reaches an ORDER BY, so a bad value sorts by name rather
     * than crashing the query. The list is `librarySort.ts`'s, imported rather
     * than restated, so the two cannot drift into disagreeing about which axes
     * exist.
     */
    librarySort: "name" as SortAxis,
    /**
     * Which way `librarySort` runs.
     *
     * Its meaning belongs to the axis, not to a fixed ascending or descending:
     * NEWEST and LONGEST AGO are opposite directions of different axes. Kept
     * beside the axis rather than folded into it so choosing an axis can apply
     * that axis's sensible default without inheriting the direction the previous
     * axis happened to be running in.
     */
    librarySortDirection: "asc" as SortDirection,
    /**
     * Whether favourites are held at the top, above the chosen order.
     *
     * A modifier and not a sixth axis: it composes with the sort rather than
     * replacing it, so favourites keep the same order the rest are in. Off by
     * default because a library nobody has starred yet would draw a FAVOURITES
     * and an ALL RECIPES heading over one populated section, which is a heading
     * over nothing.
     */
    libraryFavouritesFirst: false,
    /**
     * Which of the two library views was last used.
     *
     * Global rather than per shelf or per session, per the design: a ten recipe
     * library and a hundred and eighty recipe library want different front
     * doors, and the app should not have an opinion about which one a person is.
     * Remembered so the choice survives a relaunch, because a view that reset
     * itself would teach the user their choice did not take.
     *
     * Defaults to the list, which is the view that works at any library size.
     * As with `librarySort`, the `LibraryView` union documents the intent but
     * cannot enforce it at the read boundary; `asLibraryView` is the guard every
     * reader narrows through, so an unknown value draws the list rather than
     * lighting neither half of the segmented pair.
     */
    libraryView: "list" as LibraryView,
    /**
     * Whether the LABS section is visible in settings.
     *
     * Off until somebody taps the version string on the about screen seven
     * times. There is no hint, no caption and no affordance pointing at it, on
     * purpose: LABS holds things that are unfinished and unsupported, and
     * anybody who needs to be told where it is should not be in it.
     *
     * Its own key rather than folding it into the flag above, because it is a
     * general mechanism and not this feature's front door. M5 already plans a
     * shelf mark variant switch for the tester build, and inventing a second
     * way in at that point would be worse than building one now.
     *
     * Turning it off again hides the section but changes nothing inside it. A
     * user who unlocked LABS, enabled something and then re-hid it keeps what
     * they enabled, which is the honest reading of two separate switches.
     */
    labsUnlocked: false,
    /**
     * Auto shelves the user has put away, as a comma-separated list of ids.
     *
     * A string rather than an array because this table stores strings, and the
     * same reason the rest of the module does not pretend otherwise. Empty by
     * default: the grid offers every shelf it can fill, and a library that
     * makes a shelf meaningless is a better judge of that than a default.
     *
     * Only auto shelves. A manual shelf is the user's own and has a delete; an
     * auto shelf is a rule the app wrote, and the only thing the user can say
     * about a rule that does not describe how they brew is "not for me".
     */
    hiddenShelves: "",
    /**
     * Draw an auto shelf's tile the other way round: the accent fills the card
     * and the glyph's square takes the quiet background.
     *
     * Off by default, and a matter of taste rather than a correction, which is
     * why it is offered rather than chosen. The grid at present is a field of
     * quiet cards with a small accented square on each; inverted, it is a field
     * of colour, which reads as a bookshelf and is louder in exactly the way
     * some people want a library to be.
     */
    invertAutoShelves: false,
    /**
     * The raw bytes of the last card read, kept so a crash cannot lose them.
     *
     * Not a preference — a diagnostic. A genuine "bypass water" card read to
     * apparent success and then took the app down, on a phone whose owner
     * cannot see a console, and `parseData` is the suspect. So the bytes are
     * captured *before* they are parsed and written here straight away: if the
     * parse throws a millisecond later, the evidence is already on disk and the
     * settings screen can hand it back as copyable text.
     *
     * A serialised `CardCapture` (see `library/cardDiagnostics.ts`), or empty
     * until a card has been read. Held out of backups below: it is potentially
     * large and it describes one scan on one phone, not a choice worth carrying.
     */
    lastCardRead: ""
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
 * `labsUnlocked` is held out for a different reason: a backup file is not
 * private. It goes to the share sheet, and the whole point of the seven taps
 * is that an unfinished feature is off for everybody who has not deliberately
 * gone looking for it. A tester's backup restored by an ordinary user would
 * hand them the switch without their ever having asked, and they asked for
 * their recipes back, not for LABS. The cost of holding it out is that a new
 * phone needs seven taps again.
 *
 * Named here rather than simply omitted from the snapshot so that the
 * exhaustiveness test still holds every other key to account: a key is either
 * in a backup or on this list, never quietly missing from both.
 */
export type BackupExcluded =
    "machineDeviceId" | "lastCardRead" | "labsUnlocked";
export const NOT_IN_BACKUP: readonly SettingKey[] = [
    "machineDeviceId", "lastCardRead", "labsUnlocked"
];

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

import {isRating, type BrewRecord} from "./brew/BrewRecord";
import Recipe, {MAX_DESCRIPTION} from "./Recipe";
import {XBLOOM_SHARE_HOST} from "./shareLink";

/**
 * The backup file, and the only door it comes back in through.
 *
 * Pure and free of React, so the format can be tested as a format. A backup is a
 * document from anywhere — mailed, AirDropped, edited by hand — so nothing here
 * trusts its input, and nothing here throws: every failure is a sentence the
 * user has to be able to act on, and an exception crossing a screen boundary
 * becomes a generic apology.
 */

export const BACKUP_FORMAT = "xbrw-backup";

/**
 * Bumped only for a change this app could not read.
 *
 * Its purpose is to let a future format be recognised and refused by name rather
 * than silently misread into a broken library.
 */
export const BACKUP_VERSION = 1;

export type BackupSettings = Record<string, unknown>;

export type BackupPayload = {
    recipes: Recipe[];
    /**
     * Brew history, records only.
     *
     * The sample streams stay behind on purpose: they are some 2 400 rows a
     * brew, they are already subject to a retention sweep the user chose, and
     * a backup whose size is dominated by traces that expire is a backup that
     * becomes too big to mail for the sake of data the app itself throws away.
     * What survives is what the history list draws and what a verdict is
     * attached to.
     */
    brews: BrewRecord[];
    settings: BackupSettings;
    /** Entries that were present but unreadable. Reported, not hidden. */
    skipped: number;
    /**
     * Brews that were present but unreadable, counted apart from `skipped`.
     *
     * A malformed brew must not read as a lost recipe: the two are restored by
     * different code into different tables, and a single tally would make a
     * file whose history is damaged look like a file whose library is.
     */
    skippedBrews: number;
    appVersion: string;
    exportedAt: string;
};

export type ParseResult =
    | {ok: true; payload: BackupPayload}
    | {ok: false; reason: string};

/** The envelope, as a string ready to be written to a file. */
export function buildBackup(
    recipes: readonly Recipe[],
    settings: BackupSettings,
    appVersion = "unknown",
    brews: readonly (BrewRecord & {hasStream?: boolean})[] = []
): string {
    return JSON.stringify({
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        appVersion,
        // Recipes are already whole JSON blobs keyed by UUID in the database, so
        // the envelope is a container rather than a translation. Nothing here
        // reshapes a recipe, which is what keeps the format honest across a
        // change to the model.
        recipes: recipes.map((recipe) => JSON.parse(JSON.stringify(recipe))),
        // `hasStream` is deliberately not written: it describes this device's
        // copy of a trace, and no trace is carried. A restored record says it
        // has none, which is the truth on the machine it lands on. The caller
        // hands us `BrewDatabase.all()`, whose rows are `StoredBrew` and do
        // carry the flag, so it is named here and dropped rather than left to
        // a spread that would copy it straight through.
        brews: brews.map(({hasStream: _ignored, ...record}) => record),
        settings
    }, null, 2);
}

/** A validated payload, or a reason. Never throws. */
export function parseBackup(text: string): ParseResult {
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch {
        return {ok: false, reason: "That file could not be read. It is not valid JSON."};
    }

    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        return {ok: false, reason: "That file is not an XBRW++ backup."};
    }

    const envelope = raw as Record<string, unknown>;

    if (envelope.format !== BACKUP_FORMAT) {
        return {ok: false, reason: "That file is not an XBRW++ backup."};
    }

    // Checked before the contents, so a file this app genuinely cannot read is
    // named as such rather than reported as a pile of unreadable recipes. A
    // version that is present but not a number is the same problem wearing a
    // different hat: the field exists precisely to be compared, and one that
    // cannot be compared is not a version this app should parse past.
    if (typeof envelope.version !== "number") {
        return {ok: false, reason: "That file is not an XBRW++ backup."};
    }

    if (envelope.version > BACKUP_VERSION) {
        return {
            ok: false,
            reason: "That backup was made by a newer version of XBRW++. Update the app and try again."
        };
    }

    if (!Array.isArray(envelope.recipes)) {
        return {ok: false, reason: "That file is not an XBRW++ backup."};
    }

    const brews: BrewRecord[] = [];
    let skippedBrews = 0;
    // Absent is not an error: every backup written before this existed has no
    // `brews` key at all, and a file with none is a file from an older app
    // rather than a broken one.
    if (Array.isArray(envelope.brews)) {
        for (const entry of envelope.brews) {
            const brew = reviveBrew(entry);
            if (brew === null) skippedBrews += 1;
            else brews.push(brew);
        }
    }

    const recipes: Recipe[] = [];
    let skipped = 0;
    for (const entry of envelope.recipes) {
        const recipe = reviveRecipe(entry);
        if (recipe === null) skipped += 1;
        else recipes.push(recipe);
    }

    if (recipes.length === 0) {
        // "Empty" and "full of things this app could not read" are opposite
        // messages. The first says nothing was lost; the second says keep this
        // file, because the restore did not happen. Reporting the second as the
        // first is the most dangerous sentence this module could say.
        if (skipped > 0) {
            return {
                ok: false,
                reason: skipped === 1
                    ? "The one recipe in that backup could not be read. Keep the file."
                    : `None of the ${skipped} recipes in that backup could be read. Keep the file.`
            };
        }
        return {ok: false, reason: "There are no recipes in that backup."};
    }

    return {
        ok: true,
        payload: {
            recipes,
            brews,
            skippedBrews,
            settings: isPlainObject(envelope.settings) ? envelope.settings : {},
            skipped,
            appVersion: typeof envelope.appVersion === "string" ? envelope.appVersion : "unknown",
            exportedAt: typeof envelope.exportedAt === "string" ? envelope.exportedAt : ""
        }
    };
}

/**
 * What a restore would add, and what is already there.
 *
 * Matched on UUID and never overwriting. A merge that replaced a matching
 * recipe would silently discard an edit the user made after the backup, which is
 * a data loss dressed up as a restore.
 */
export function mergeRecipes(
    existing: readonly Recipe[],
    incoming: readonly Recipe[]
): {toAdd: Recipe[]; alreadyPresent: number} {
    const known = new Set(existing.map((recipe) => recipe.uuid));
    const toAdd: Recipe[] = [];
    let alreadyPresent = 0;

    for (const recipe of incoming) {
        if (known.has(recipe.uuid)) alreadyPresent += 1;
        else {
            toAdd.push(recipe);
            // Guards a backup that contains the same UUID twice, which would
            // otherwise be inserted twice and break the library's key. The
            // second copy is counted with the ones already present rather than
            // dropped from both tallies: it will be in the library once the
            // restore is done, and a summary the user is asked to judge the
            // restore by has to add up to the number of entries in the file.
            known.add(recipe.uuid);
        }
    }

    return {toAdd, alreadyPresent};
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A number the model can do arithmetic with. Rejects NaN, Infinity and null. */
function isNumber(value: unknown): boolean {
    return typeof value === "number" && Number.isFinite(value);
}

function isNumberArray(value: unknown): boolean {
    return Array.isArray(value) && value.every(isNumber);
}

/**
 * The type each field must have *if it is present at all*.
 *
 * Presence is deliberately not required. The `Recipe` constructor supports a
 * long tail of legacy omissions on purpose — a missing uuid is minted, a
 * pre-rename `title` becomes the local `name`, three obsolete cup-type
 * encodings are migrated — and this feature exists so that a user does not lose
 * recipes. Rejecting a record for a field the model can regenerate would throw
 * away the very thing the backup was made to protect.
 *
 * What is checked is that a field which *is* there holds the kind of value the
 * rest of the app will assume it holds.
 */
/**
 * A share URL from a backup file, which is untrusted input.
 *
 * Any string used to be accepted here, and `useShareRecipe` hands a stored URL
 * straight back to the system share sheet when the snapshot still matches. A
 * crafted backup could therefore make the Share button distribute an arbitrary
 * link — one the app never contacted the mint service to obtain, and which the
 * user would reasonably read as an xBloom recipe. So the host is pinned, the
 * scheme must be HTTPS, and the `id` the importer reads must actually be there.
 */
function isShareUrl(value: unknown): boolean {
    if (typeof value !== "string") return false;
    // Empty is legitimate: a recipe that has never been shared.
    if (value === "") return true;
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return false;
    }
    return url.protocol === "https:"
        && url.hostname === XBLOOM_SHARE_HOST
        && (url.searchParams.get("id") ?? "") !== "";
}

/** A plausible display name. Long enough for any real one, short enough that a
 * backup cannot smuggle a document in through it. */
const MAX_SHARED_BY = 120;

/**
 * An HTTPS URL, and nothing else.
 *
 * These two are the only fields in a backup that the app will hand to an image
 * loader, so they are the only ones where a bad value becomes a request. A
 * `http://` avatar would be a downgrade a user cannot see, and the other
 * schemes are worse: `file://` aims the loader at the device's own storage and
 * `data:` lets the file carry its own payload. The host is deliberately not
 * pinned the way `isShareUrl` pins it -- xBloom serves this artwork from at
 * least one S3 bucket that is not theirs to promise, and a wrongly-pinned host
 * would silently drop every legitimate avatar.
 */
function isHttpsUrl(value: unknown): boolean {
    if (typeof value !== "string" || value === "") return false;
    try {
        return new URL(value).protocol === "https:";
    } catch {
        return false;
    }
}

/**
 * Fields a bad value costs, rather than costing the recipe.
 *
 * Everything in `RECIPE_FIELDS` is load-bearing: a malformed one means the file
 * is not what it claims, and `looksLikeRecipe` rejects the whole entry. These
 * three are different in kind. They are decoration -- who shared a recipe and
 * what the pod looked like -- and they arrive from a third party's server, so a
 * value that fails here is a plausible thing to find in an honest file, not
 * evidence of tampering. Rejecting the recipe over an avatar would lose a real
 * recipe, with real card bytes, over a picture.
 *
 * So these are stripped and the recipe is kept. That asymmetry is the point,
 * and it is why they are not simply added to the map above.
 */
const DROPPABLE_RECIPE_FIELDS: Record<string, (value: unknown) => boolean> = {
    sharedBy:       (v) => typeof v === "string" && v.length <= MAX_SHARED_BY,
    sharedByAvatar: isHttpsUrl,
    imageURL:       isHttpsUrl,
    // Both authored, both droppable: a malformed one costs a note or a star,
    // and dropping the whole recipe would cost the recipe. They are not alike
    // in what the validator here actually buys: the description cap is
    // enforced only at this boundary, Recipe accepts any string, so removing
    // it would let an unbounded description through. Recipe already treats a
    // non-boolean favourite as false, so this entry defends the boundary
    // rather than discriminating any input Recipe would not already handle.
    description:    (v) => typeof v === "string" && v.length <= MAX_DESCRIPTION,
    favourite:      (v) => typeof v === "boolean"
};

const RECIPE_FIELDS: Record<string, (value: unknown) => boolean> = {
    uuid:        (v) => typeof v === "string",
    name:        (v) => typeof v === "string",
    title:       (v) => typeof v === "string",
    xbloomName:  (v) => typeof v === "string",
    xid:         (v) => typeof v === "string",
    source:      (v) => typeof v === "string",
    shareId:     (v) => typeof v === "string",
    shareUrl:    isShareUrl,
    shareSnapshot: (v) => typeof v === "string",
    // Sanitised, not rejected — deliberately unlike every other entry here.
    // This file is severe because a bad recipe's next stop is a genuine card
    // and a malformed write is not trivially recoverable. A tag reaches no
    // card, no machine and no share payload, so refusing an otherwise-perfect
    // recipe over a decorative field would be the harm rather than the guard.
    // `Recipe.normaliseTags` drops whatever it cannot use, so any shape is
    // acceptable here and the constructor decides what survives.
    tags: () => true,
    sharedTableId: isNumber,
    // Stricter than the sibling ids: a tableId is an account row's primary
    // key, so a negative one is not a plausible value that happens to be
    // wrong, it is a file that has been tampered with or corrupted.
    cloudId:          (v) => isNumber(v) && (v as number) >= 0,
    cloudFingerprint: (v) => typeof v === "string",
    grinder:     (v) => typeof v === "boolean",
    dosage:      isNumber,
    ratio:       isNumber,
    grindSize:   isNumber,
    grindRPM:    isNumber,
    cupType:     isNumber,
    defaultCups: isNumber,
    accentIndex: isNumber,
    createdAt:   isNumber,
    checksum:    isNumber,
    backup:         isNumberArray,
    offline_backup: isNumberArray,
    uid:            isNumberArray
};

/**
 * The six fields every serialised pour carries.
 *
 * Required, unlike the recipe's own fields, because `Pour` holds all six as
 * plain properties and `JSON.stringify` therefore writes all six for any pour
 * this app has ever exported. A pour missing one did not come from here.
 *
 * The `Recipe` constructor would accept it regardless and hand `Pour` an
 * `undefined`, which becomes a stored `-1`. That is the shape of the real
 * hazard: not a crash, but a recipe that looks ordinary in the library, opens
 * in the editor, and is written to a genuine card as nonsense. A bad write to a
 * real card is not trivially recoverable, so the door is the place to stop it.
 */
const POUR_FIELDS = ["volume", "temperature", "flowRate", "agitation",
                     "pourPattern", "pauseTime"] as const;

/**
 * The two fields a recipe cannot reach a card without.
 *
 * `RECIPE_FIELDS` above checks a field's type only when it is present, on
 * purpose: the constructor repairs a long tail of legacy omissions and this
 * feature exists so a user does not lose recipes, so a field the model can
 * regenerate must never cost the recipe. These two are the exception, and the
 * reason the whole file is severe. The constructor assigns `jsonRecipe.grindSize`
 * and `jsonRecipe.ratio` straight through with no fallback, and `getData` does
 * unguarded arithmetic on the result on its way to a genuine card:
 * `this.grindSize - GRIND_SIZE_OFFSET` becomes NaN, and `this.ratio` is pushed
 * into the byte array as an undefined hole. A malformed write to a real card is
 * not trivially recoverable, so an absent one has to be stopped at the door
 * rather than repaired past it.
 *
 * Requiring presence cannot reject an honest file: both are plain `Recipe`
 * properties with numeric initialisers, so `JSON.stringify` emits them for every
 * recipe this app has ever exported, and even the oldest legacy blob in
 * RecipeDatabase.migration.test carries both. A file missing one did not come
 * from here.
 */
const REQUIRED_RECIPE_FIELDS = ["grindSize", "ratio"] as const;

/**
 * Whether an entry is shaped like a recipe.
 *
 * `new Recipe(...)` cannot be used as the validator, which is what this replaces.
 * It is written to be forgiving of anything it can repair, so it accepts
 * `{"name": 5, "pours": []}` and keeps the number, and accepts
 * `{"pours": [{"volume": "lots"}]}` and keeps the string — then mints a uuid,
 * at which point the old presence-of-a-uuid check declared the result valid. An
 * untrusted file was being reported as readable and its contents inserted.
 */
function looksLikeRecipe(entry: Record<string, unknown>): boolean {
    for (const [field, ok] of Object.entries(RECIPE_FIELDS)) {
        if (entry[field] !== undefined && !ok(entry[field])) return false;
    }

    // Presence, not just type. The loop above lets an absent field through
    // because for almost every field that is the safe and correct thing to do;
    // for these two it is the bug, so they are checked a second time for being
    // there at all. `RECIPE_FIELDS` already has their type, so once present
    // that check confirms it is a real number.
    for (const field of REQUIRED_RECIPE_FIELDS) {
        if (entry[field] === undefined) return false;
    }

    if (!Array.isArray(entry.pours)) return false;

    for (const raw of entry.pours) {
        // Pours were stored as JSON strings by an older version, and the
        // constructor still parses that form, so it has to be unwrapped here
        // too rather than rejected as "not an object".
        let pour: unknown = raw;
        if (typeof raw === "string") {
            try {
                pour = JSON.parse(raw);
            } catch {
                return false;
            }
        }
        if (!isPlainObject(pour)) return false;
        if (pour.pourNumber !== undefined && !isNumber(pour.pourNumber)) return false;
        for (const field of POUR_FIELDS) {
            if (!isNumber(pour[field])) return false;
        }
    }

    return true;
}

function reviveRecipe(entry: unknown): Recipe | null {
    if (!isPlainObject(entry)) return null;
    if (!looksLikeRecipe(entry)) return null;

    // Strip the droppable fields before the constructor sees them, not after:
    // the constructor is deliberately forgiving and, for most of these fields,
    // would keep whatever it was given.
    //
    // The copy is hygiene rather than a guarantee anyone can observe, and no
    // test covers it: `parseBackup` takes a string, so the object being
    // stripped was parsed here and is discarded when the loop ends. It is kept
    // because `reviveRecipe` reads as though it takes someone else's object,
    // and the day it does, deleting from it would mean reading a backup
    // quietly rewrote it.
    let cleaned = entry;
    for (const [field, ok] of Object.entries(DROPPABLE_RECIPE_FIELDS)) {
        if (cleaned[field] !== undefined && !ok(cleaned[field])) {
            if (cleaned === entry) cleaned = {...entry};
            delete cleaned[field];
        }
    }

    try {
        // The constructor's `json` parameter is a string, not the parsed
        // object the envelope already gives us — re-stringifying here is
        // cheaper than reshaping the constructor for a caller of one.
        //
        // A missing UUID is not a reason to throw the recipe away: the
        // constructor mints one, and this whole feature exists so a user does
        // not lose recipes. A duplicate on a second restore is an annoyance
        // they can delete; a recipe dropped for a field the model can
        // regenerate is gone. The shape has already been checked above, so
        // what survives this call is a recipe rather than merely an object
        // that did not make the constructor throw.
        const recipe = new Recipe(undefined, JSON.stringify(cleaned));
        return typeof recipe.uuid === "string" && recipe.uuid !== "" ? recipe : null;
    } catch {
        return null;
    }
}

/** The outcomes a record may claim. A brew that ended some other way did not
 * come from this app. */
const BREW_OUTCOMES = new Set([
    "done", "endedOnMachine", "cancelled", "lostContact", "failed"
]);

/**
 * A note long enough for anything a person types about a cup of coffee, and
 * short enough that a backup cannot smuggle a document in through it.
 *
 * The field itself has no ceiling in the app -- a user typing into their own
 * database is not a threat to themselves -- but an untrusted file is a
 * different author, and this is the boundary where that difference is decided.
 *
 * Over-length is truncated rather than refused, which is the opposite of every
 * other rule in this file and deliberately so. The note is the one brew field
 * a person wrote by hand, so a long one is an honest thing to find in an
 * honest file; dropping the record would lose a brew, its figures and its
 * rating over the length of a sentence about it.
 */
export const MAX_BACKUP_NOTE = 4000;

/**
 * The fields a brew record must have, and the type each one must hold.
 *
 * Required rather than optional, unlike a recipe's: `BrewDatabase.insert`
 * writes every one of these for every brew, so a record missing one did not
 * come from here. A recipe is forgiving because the constructor can repair a
 * legacy shape and a lost recipe is a real loss; a brew has no migrations to
 * be forgiving of.
 */
const BREW_FIELDS: Record<string, (value: unknown) => boolean> = {
    id:          (v) => typeof v === "string" && v !== "",
    recipeUuid:  (v) => typeof v === "string",
    recipeName:  (v) => typeof v === "string",
    accent:      (v) => typeof v === "string",
    startedAt:   isNumber,
    endedAt:     isNumber,
    outcome:     (v) => typeof v === "string" && BREW_OUTCOMES.has(v),
    pours:       isNumber,
    waterTotal:  isNumber,
    cupTotal:    isNumber,
    heldSeconds: isNumber
};

/**
 * The fields a record may omit, checked only when present.
 *
 * Every one of them was added to `BrewRecord` after the table existed, so a
 * row written by an older build genuinely has none of them and draws exactly
 * as it always did. The judgement fields are here for the same reason and not
 * for a softer one: an unrated brew has no rating, and that is not damage.
 *
 * A present-but-wrong value costs the record rather than being dropped, which
 * is the opposite of `DROPPABLE_RECIPE_FIELDS`. Nothing in a brew is
 * decoration arriving from a third party's server: every field here was
 * written by this app or typed by the user, so a bad one is evidence about the
 * file rather than a plausible thing to find in an honest one.
 */
const OPTIONAL_BREW_FIELDS: Record<string, (value: unknown) => boolean> = {
    pouringAt:  isNumber,
    failure:    (v) => v === null || typeof v === "string",
    // A stall is `{atMl, seconds}`, not a number: one list of them per stage.
    // Checked to that shape rather than to a list of numbers, because a
    // validator that is merely stricter than the truth is not safe here -- it
    // rejected every brew that had ever stalled, which is to say every
    // interesting one, and took its rating with it.
    stalls:     (v) => Array.isArray(v) && v.every((stage) =>
        Array.isArray(stage) && stage.every((stall) =>
            isPlainObject(stall) && isNumber(stall.atMl) && isNumber(stall.seconds))),
    plan:       (v) => Array.isArray(v),
    stageWater: isNumberArray,
    bypass:     isPlainObject,
    // Whole, on the scale, and nothing else: `isRating` is the same predicate
    // the database refuses a write with, so the door and the table cannot come
    // to disagree about what a star means. A 9 and a "5" are both refused.
    rating:     (v) => isRating(v),
    note:       (v) => typeof v === "string",
    pinned:     (v) => typeof v === "boolean"
};

/** A record from a backup file, or null. Never throws. */
export function reviveBrew(entry: unknown): BrewRecord | null {
    if (!isPlainObject(entry)) return null;

    for (const [field, ok] of Object.entries(BREW_FIELDS)) {
        if (!ok(entry[field])) return null;
    }
    for (const [field, ok] of Object.entries(OPTIONAL_BREW_FIELDS)) {
        if (entry[field] !== undefined && !ok(entry[field])) return null;
    }

    // Rebuilt field by field rather than passed through, so a file carrying
    // extra keys cannot put them in the table: the insert names its columns,
    // but the record is also handed to the screens, and a backup should not be
    // able to decide what a brew record contains.
    const record = entry as unknown as BrewRecord;
    return {
        id: record.id,
        recipeUuid: record.recipeUuid,
        recipeName: record.recipeName,
        accent: record.accent,
        startedAt: record.startedAt,
        pouringAt: record.pouringAt,
        endedAt: record.endedAt,
        outcome: record.outcome,
        failure: record.failure ?? null,
        pours: record.pours,
        waterTotal: record.waterTotal,
        cupTotal: record.cupTotal,
        heldSeconds: record.heldSeconds,
        stalls: record.stalls,
        plan: record.plan,
        stageWater: record.stageWater,
        bypass: record.bypass,
        rating: record.rating ?? 0,
        note: (record.note ?? "").slice(0, MAX_BACKUP_NOTE),
        pinned: record.pinned ?? false
    };
}

/**
 * What a restore would add to the history, and what is already there.
 *
 * Matched on `id` and never overwriting, for a sharper reason than
 * `mergeRecipes` has: the row already on this device may carry a rating and a
 * note the user gave it after the backup was made, and a restore that replaced
 * it would delete a verdict to put back the absence of one.
 */
export function mergeBrews(
    existing: readonly {id: string}[],
    incoming: readonly BrewRecord[]
): {toAdd: BrewRecord[]; alreadyPresent: number} {
    const known = new Set(existing.map((brew) => brew.id));
    const toAdd: BrewRecord[] = [];
    let alreadyPresent = 0;

    for (const brew of incoming) {
        if (known.has(brew.id)) alreadyPresent += 1;
        else {
            toAdd.push(brew);
            known.add(brew.id);
        }
    }

    return {toAdd, alreadyPresent};
}

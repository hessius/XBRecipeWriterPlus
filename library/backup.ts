import Recipe from "./Recipe";

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
    settings: BackupSettings;
    /** Entries that were present but unreadable. Reported, not hidden. */
    skipped: number;
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
    appVersion = "unknown"
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
const RECIPE_FIELDS: Record<string, (value: unknown) => boolean> = {
    uuid:        (v) => typeof v === "string",
    name:        (v) => typeof v === "string",
    title:       (v) => typeof v === "string",
    xbloomName:  (v) => typeof v === "string",
    xid:         (v) => typeof v === "string",
    source:      (v) => typeof v === "string",
    shareId:     (v) => typeof v === "string",
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
        const recipe = new Recipe(undefined, JSON.stringify(entry));
        return typeof recipe.uuid === "string" && recipe.uuid !== "" ? recipe : null;
    } catch {
        return null;
    }
}

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

function reviveRecipe(entry: unknown): Recipe | null {
    if (!isPlainObject(entry)) return null;
    try {
        // The constructor's `json` parameter is a string, not the parsed
        // object the envelope already gives us — re-stringifying here is
        // cheaper than reshaping the constructor for a caller of one.
        //
        // A missing UUID is not a reason to throw the recipe away: the
        // constructor mints one, and this whole feature exists so a user does
        // not lose recipes. A duplicate on a second restore is an annoyance
        // they can delete; a recipe dropped for a field the model can
        // regenerate is gone.
        const recipe = new Recipe(undefined, JSON.stringify(entry));
        return typeof recipe.uuid === "string" && recipe.uuid !== "" ? recipe : null;
    } catch {
        return null;
    }
}

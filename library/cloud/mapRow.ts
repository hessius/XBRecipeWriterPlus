import type Recipe from "@/library/Recipe";
import {XBloomRecipe} from "@/library/XBloomRecipe";
import type {CloudRow} from "./cloudLibrary";

/**
 * A recipe, and the colour it wore in xBloom.
 *
 * The colour rides beside the recipe rather than on it. `Recipe` is persisted
 * by a blanket `JSON.stringify`, with no allowlist, into both the database and
 * backup files -- so a transient field hung on it is not transient, it is a
 * foreign hex written to disk that survives only because nothing reads it back
 * yet. The alternative was to remember to strip it before every save, which is
 * the same shape as the bug that once lost `showHints` from backups. Here it
 * cannot leak, because there is nowhere for it to leak from.
 */
export type MappedRow = {
    recipe: Recipe;
    /** xBloom's own hex, for `matchAccent`. Never one of our palette values. */
    color?: string;
};

/**
 * One account row, one `Recipe` — or nothing.
 *
 * There is no mapping code here on purpose. `XBloomRecipe.getRecipe` already
 * reads this shape, and has been hardened against every out-of-range value
 * their API has produced; a second mapper would be a second place for those
 * lessons to be forgotten.
 *
 * `null` rather than a partial recipe: the next stop for one of these is a
 * write to a genuine card, and a recipe assembled from a row the mapper could
 * not read is not something to hand to that.
 *
 * A dropped row is invisible from here, and a list that is quietly one short
 * is worse than an error -- the user can count their own recipes. Callers must
 * reconcile what they mapped against what they fetched and say so;
 * `importPlan` does this as its `unreadable` count, and `cloudLibrary` refuses
 * a partial walk outright for the same reason.
 */
export function mapRow(row: CloudRow): MappedRow | null {
    // Zero is not a row id, it is the design's sentinel for "did not come from
    // an account" (spec 3.0.1). A row claiming it is a row we cannot identify,
    // and letting one through would mint a recipe whose id matches every
    // hand-made recipe in the library.
    if (typeof row.tableId !== "number" || row.tableId <= 0) return null;

    const recipe = XBloomRecipe.fromAccountRow(row).getRecipe();
    if (!recipe) return null;

    // `getRecipe` is deliberately forgiving so it can migrate its own old
    // shapes, which makes it useless as a validator: a row missing the fields
    // that make a brew -- no pours, no dose -- yields a recipe with an empty
    // pour list and a NaN ratio rather than a thrown error. The next stop for
    // one of these is a write to a genuine card, so a structurally empty
    // recipe is rejected here rather than handed on.
    // Not "is this writable to a card" -- that is `cardWriteProblems`, at
    // write time, and an account recipe ground for espresso is perfectly
    // normal and perfectly fixable in the editor. This asks only whether the
    // row was read at all. A dose of zero or less is not one field to correct;
    // it is a row we did not understand, and `fixRatio` turns it into a
    // negative ratio rather than failing.
    const coherent = recipe.pours.length > 0 && recipe.dosage > 0 && recipe.ratio > 0;
    if (!coherent) return null;

    recipe.cloudId = row.tableId;
    if (typeof row.theName === "string" && row.theName) {
        recipe.name = row.theName;
    }

    return {
        recipe,
        color: typeof row.theColor === "string" ? row.theColor : undefined,
    };
}

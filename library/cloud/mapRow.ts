import type Recipe from "@/library/Recipe";
import {XBloomRecipe} from "@/library/XBloomRecipe";
import type {CloudRow} from "./cloudLibrary";

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
 */
export function mapRow(row: CloudRow): Recipe | null {
    if (typeof row.tableId !== "number") return null;

    const recipe = XBloomRecipe.fromAccountRow(row).getRecipe();
    if (!recipe) return null;

    // `getRecipe` is deliberately forgiving so it can migrate its own old
    // shapes, which makes it useless as a validator: a row missing the fields
    // that make a brew -- no pours, no dose -- yields a recipe with an empty
    // pour list and a NaN ratio rather than a thrown error. The next stop for
    // one of these is a write to a genuine card, so a structurally empty
    // recipe is rejected here rather than handed on.
    if (recipe.pours.length === 0 || !Number.isFinite(recipe.dosage) || !Number.isFinite(recipe.ratio)) {
        return null;
    }

    recipe.cloudId = row.tableId;
    if (typeof row.theName === "string" && row.theName) {
        recipe.name = row.theName;
    }
    if (typeof row.theColor === "string") {
        recipe.cloudColor = row.theColor;
    }
    return recipe;
}

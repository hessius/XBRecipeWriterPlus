import type {BeanField} from "@/library/brew/beanTags";

/**
 * What a recipe has been brewed with, derived from brew rows alone.
 *
 * Pure: no SQL, no React, no `expo-sqlite`. `BrewDatabase` fills these types in
 * and the components draw them, which is the split `recipeEvidence.ts` already
 * uses. It means the ordering rule below can be tested without a database and
 * the types can be imported anywhere without dragging a native module in.
 */

/**
 * `BeanField` is the four preset columns on `brews`. The profile has a fifth
 * case, the free-form custom tags, so it extends rather than redeclares: a
 * second type of the same name with a different arm is how the two come to
 * disagree about what a field is.
 */
export type ProfileField = BeanField | "custom";

export type BeanProfileRow = {
    field: ProfileField;
    /** The value as the user recorded it, for display. */
    value: string;
    /** Counted brews carrying this value. */
    brews: number;
    /** Of those, how many carry a rating. The floor is applied to this. */
    rated: number;
    /** The average over the rated ones, or 0 where there are none. */
    avgRating: number;
};

export type BeanProfileTotals = {
    brews: number;
    rated: number;
    avgRating: number;
};

export type BeanProfile = {
    rows: BeanProfileRow[];
    /** Counted brews carrying no preset field and no custom tag. */
    untagged: BeanProfileTotals;
    /**
     * Every counted brew for the recipe.
     *
     * `rows` overlap -- one brew contributes to its roast row, its process row
     * and its origin row -- so they do not sum to this and no surface may imply
     * that they do.
     */
    counted: number;
};

/**
 * Rated brews a row needs before its average may rank it.
 *
 * Counted brews would be the intuitive choice and is wrong: a row with eleven
 * brews and one rating would then rank on an average of one number, which is
 * the whole error this floor exists to prevent.
 *
 * This leaves a known wart. The row displays its *counted* brews, so `4.5 · 11`
 * can fail a floor of 3 with nothing on screen saying why. That was weighed
 * against printing a third figure (`4.5 · 11 · 2 rated`) and shipped
 * deliberately. See the design note before changing it; quietly moving the
 * floor onto counted brews undoes the decision rather than revisiting it.
 */
export const PROFILE_FLOOR = 3;

/** Where "this worked" starts, for the library filter. */
export const HIGHLY_RATED = 4;

/** Rows shown before the ledger asks to be opened in full. */
export const PROFILE_CAP = 5;

/**
 * What each field is called in the ledger's Doto column.
 *
 * FERMENT rather than FERMENTATION: the column is a fixed width beside a value
 * that is often long, and the full word crowds it out. TAG for the custom
 * field, because "custom" is the app's word for its own storage and the user
 * called it a tag when they typed it.
 */
export const PROFILE_FIELD_LABEL: Record<ProfileField, string> = {
    origin:       "ORIGIN",
    roast:        "ROAST",
    process:      "PROCESS",
    fermentation: "FERMENT",
    custom:       "TAG"
};

/**
 * Plain codepoint order, not `localeCompare`.
 *
 * The tie-break only has to be *total and stable*, so that a list of rows has
 * exactly one order however many times it is drawn. A locale comparison brings
 * in Hermes' Intl support and a collation that can differ between platforms,
 * which would make the same library sort two ways on two phones for no reason
 * the user can see.
 */
function compare(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The ledger's order: evidenced rows first, by how well they did.
 *
 * Rows at or above the floor lead, ordered by average descending. Rows below it
 * follow, keeping their figures and their place in the list; they are not
 * hidden and not blanked, they simply cannot outrank a row that has evidence.
 *
 * Three tie-breakers after the average, and every one of them earns its line.
 * Without them SQLite's row order leaks into the UI and the list reshuffles
 * between renders. `field` is last because two rows can genuinely tie on rating,
 * brews and value: a roast called Light and a custom tag called Light are
 * different rows that print the same word.
 *
 * Returns a new array. The caller holds the database's rows, and sorting them
 * in place would reorder somebody else's array as a side effect of rendering.
 */
export function rankProfileRows(rows: readonly BeanProfileRow[]): BeanProfileRow[] {
    const byWeight = (a: BeanProfileRow, b: BeanProfileRow) =>
        b.brews - a.brews || compare(a.value, b.value) || compare(a.field, b.field);

    const ranked = rows.filter((row) => row.rated >= PROFILE_FLOOR)
        .sort((a, b) => b.avgRating - a.avgRating || byWeight(a, b));
    const rest = rows.filter((row) => row.rated < PROFILE_FLOOR).sort(byWeight);

    return [...ranked, ...rest];
}

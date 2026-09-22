import type Recipe from "@/library/Recipe";
import type {PodCoffee} from "@/library/podCoffee";
import {type BrewRecord, numeric} from "@/library/brew/BrewRecord";

export type BackfilledField = "dose" | "ratio" | "grindSize" | "grinderRpm" | "grinderUsed";
export type Backfill<T extends BrewRecord = BrewRecord> = {record: T; filled: BackfilledField[]};

/**
 * Stable order for user-facing copy that names which recipe values were used.
 */
const BACKFILL_ORDER: BackfilledField[] = [
    "dose",
    "ratio",
    "grindSize",
    "grinderRpm",
    "grinderUsed"
];

export function backfillFromRecipe<T extends BrewRecord>(record: T, recipe: Recipe): Backfill<T> {
    const filled: BackfilledField[] = [];
    const updates: Partial<BrewRecord> = {};

    if (!numeric(record.dose) && recipe.dosage > 0) {
        updates.dose = recipe.dosage;
        filled.push("dose");
    }
    if (!numeric(record.ratio) && recipe.ratio > 0) {
        updates.ratio = recipe.ratio;
        filled.push("ratio");
    }
    if (recipe.grinder !== false) {
        if (!numeric(record.grindSize) && recipe.grindSize > 0) {
            updates.grindSize = recipe.grindSize;
            filled.push("grindSize");
        }
        if (!numeric(record.grinderRpm) && recipe.grindRPM > 0) {
            updates.grinderRpm = recipe.grindRPM;
            filled.push("grinderRpm");
        }
    }
    if (record.grinderUsed === undefined && recipe.grindSize > 0) {
        updates.grinderUsed = recipe.grinder;
        filled.push("grinderUsed");
    }
    // A pod's coffee reached brew records later than the pods themselves did,
    // so a brew recorded before that column existed has none even though its
    // recipe does. Without this the envelope carries a guessed name instead of
    // the coffee the machine actually read, and Beanconqueror has nothing
    // detailed enough to offer to create.
    //
    // Deliberately not a `BackfilledField`: that list names the figures the
    // note tells the user were read from the recipe rather than measured. The
    // coffee is the same coffee either way, so saying so would be noise.
    if (record.coffee === undefined && recipe.coffee !== undefined) {
        updates.coffee = {...recipe.coffee};
    }

    return {
        record: {...record, ...updates},
        filled: BACKFILL_ORDER.filter((field) => filled.includes(field))
    };
}

/**
 * The pod coffee a handoff would carry for this brew.
 *
 * The same fallback `backfillFromRecipe` applies, exposed on its own so a
 * screen can ask the question before building an envelope. A screen that asks
 * the record alone would prompt for a bean name on a pod brew recorded before
 * brews carried a coffee, and then send the typed guess in place of the coffee
 * the machine read off the pod.
 */
export function handoffCoffee(record: BrewRecord, recipe: Recipe | null): PodCoffee | undefined {
    return record.coffee ?? recipe?.coffee;
}

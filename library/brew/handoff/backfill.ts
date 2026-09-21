import type Recipe from "@/library/Recipe";
import {type BrewRecord, numeric} from "@/library/brew/BrewRecord";

export type BackfilledField = "dose" | "ratio" | "grindSize" | "grinderRpm" | "grinderUsed";
export type Backfill = {record: BrewRecord; filled: BackfilledField[]};

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

export function backfillFromRecipe(record: BrewRecord, recipe: Recipe): Backfill {
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

    return {
        record: {...record, ...updates},
        filled: BACKFILL_ORDER.filter((field) => filled.includes(field))
    };
}

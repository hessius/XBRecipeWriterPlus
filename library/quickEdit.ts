import {
    cardWriteProblems,
    DOSE,
    GRIND_SIZE,
    RATIO,
    TEMPERATURE,
    type Range,
} from "@/library/cardLimits";
import Recipe, {GRINDER_OFF_VALUE} from "@/library/Recipe";
import type {TemperatureUnit} from "@/library/units";

export type QuickEditAdjustments = {
    dose?: number;
    ratio?: number;
    grind?: number;
    tempOffset?: number;
};

export type QuickEditBounds = {
    dose: Range;
    ratio: Range | null;
    grind: Range & {off: typeof GRINDER_OFF_VALUE};
    tempOffset: Range;
};

export function cloneRecipe(recipe: Recipe): Recipe {
    // Good enough for quick edits: a zero dose would migrate to the default,
    // but zero is already invalid and cannot reach a real brew or card write.
    return new Recipe(undefined, JSON.stringify(recipe));
}

function clamp(value: number, range: Range): number {
    return Math.min(range.max, Math.max(range.min, value));
}

export function applyQuickEdit(recipe: Recipe, adjustments: QuickEditAdjustments): Recipe {
    const edited = cloneRecipe(recipe);

    if (adjustments.grind !== undefined) {
        edited.grindSize = adjustments.grind;
        edited.grinder = adjustments.grind !== GRINDER_OFF_VALUE;
    }

    if (adjustments.tempOffset !== undefined) {
        for (const pour of edited.pours) {
            pour.temperature = clamp(pour.temperature + adjustments.tempOffset, TEMPERATURE);
        }
    }

    if (adjustments.dose !== undefined) {
        edited.dosage = adjustments.dose;
    }
    if (adjustments.ratio !== undefined && !edited.isTea()) {
        edited.ratio = adjustments.ratio;
    }
    if (adjustments.dose !== undefined || (adjustments.ratio !== undefined && !edited.isTea())) {
        edited.autoFixPourVolumes();
    }

    return edited;
}

export function quickEditBounds(recipe: Recipe): QuickEditBounds {
    const temperatures = recipe.pours.map((pour) => pour.temperature);
    const minTemperature = temperatures.length > 0 ? Math.min(...temperatures) : TEMPERATURE.min;
    const maxTemperature = temperatures.length > 0 ? Math.max(...temperatures) : TEMPERATURE.max;

    return {
        // These are the per-knob travel limits. Dose, ratio and stage volumes
        // interact after auto-fix, so quickEditProblems reports whether a
        // chosen combination still makes a brewable recipe.
        dose: {
            min: DOSE.min,
            max: recipe.isTea() ? 10 : DOSE.max,
        },
        ratio: recipe.isTea() ? null : RATIO,
        grind: {
            ...GRIND_SIZE,
            off: GRINDER_OFF_VALUE,
        },
        // Deliberately the range where moving the knob still changes at least
        // one stage. Partial saturation inside that range is intended; the
        // tighter shape-preserving range was considered and rejected.
        tempOffset: {
            min: TEMPERATURE.min - maxTemperature,
            max: TEMPERATURE.max - minTemperature,
        },
    };
}

export function quickEditProblems(
    recipe: Recipe,
    adjustments: QuickEditAdjustments,
    temperatureUnit?: TemperatureUnit
): string[] {
    return cardWriteProblems(applyQuickEdit(recipe, adjustments), temperatureUnit);
}

export function describeAdjustment(
    recipe: Recipe,
    adjustments: QuickEditAdjustments
): string | null {
    const changesDose = adjustments.dose !== undefined;
    const changesRatio = adjustments.ratio !== undefined && !recipe.isTea();

    if (!changesDose && !changesRatio) {
        return null;
    }

    const edited = applyQuickEdit(recipe, adjustments);
    const target = edited.getStageTargetVolume();
    const subject = changesDose && changesRatio
        ? "new dose and ratio"
        : changesDose ? "new dose" : "new ratio";
    return `Stage volumes rescale to ${target} ml to match the ${subject}.`;
}

export function describeTemperatureBaseline(recipe: Recipe, fontScale: number): string {
    const temperatures = recipe.pours.map((pour) => pour.temperature);
    if (temperatures.length === 0) {
        return "recipe";
    }

    const minTemperature = Math.min(...temperatures);
    const maxTemperature = Math.max(...temperatures);

    if (temperatures.length >= 4 && minTemperature !== maxTemperature) {
        return `recipe ${minTemperature} to ${maxTemperature}`;
    }

    // A fully identical list reads as one baseline; a partially repeated list
    // keeps every stage visible because the repetition is part of the recipe.
    const values = minTemperature === maxTemperature
        ? `${minTemperature}`
        : temperatures.join(", ");
    return fontScale >= 1.4 ? values : `recipe ${values}`;
}

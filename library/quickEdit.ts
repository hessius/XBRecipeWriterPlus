import {
    cardWriteProblems,
    DOSE,
    GRIND_SIZE,
    RATIO,
    TEMPERATURE,
    type Range,
} from "@/library/cardLimits";
import Recipe, {GRINDER_OFF_VALUE} from "@/library/Recipe";
import {toDisplay, unitSuffix, type TemperatureUnit} from "@/library/units";

export type QuickEditAdjustments = {
    dose?: number;
    ratio?: number;
    grind?: number;
    tempOffset?: number;
};

export type QuickEditRecordAdjustments = {
    adjustedFromDose?: number;
    adjustedFromRatio?: number;
    adjustedFromGrind?: number;
    adjustedTempOffset?: number;
};

export type QuickEditBounds = {
    dose: Range;
    ratio: Range | null;
    grind: (Range & {off: typeof GRINDER_OFF_VALUE}) | null;
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

    if (adjustments.grind !== undefined && !edited.isTea()) {
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

export function quickEditRecordAdjustments(
    saved: Recipe,
    adjustments: QuickEditAdjustments
): QuickEditRecordAdjustments | undefined {
    const record: QuickEditRecordAdjustments = {};

    if (adjustments.dose !== undefined && adjustments.dose !== saved.dosage) {
        record.adjustedFromDose = saved.dosage;
    }
    if (adjustments.ratio !== undefined && !saved.isTea() && adjustments.ratio !== saved.ratio) {
        record.adjustedFromRatio = saved.ratio;
    }
    const savedGrind = effectiveGrind(saved);
    if (adjustments.grind !== undefined && !saved.isTea() && adjustments.grind !== savedGrind) {
        record.adjustedFromGrind = savedGrind;
    }
    if (adjustments.tempOffset !== undefined && adjustments.tempOffset !== 0) {
        record.adjustedTempOffset = adjustments.tempOffset;
    }

    return Object.keys(record).length === 0 ? undefined : record;
}

export function effectiveGrind(recipe: Recipe): number {
    return recipe.grinder ? recipe.grindSize : GRINDER_OFF_VALUE;
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
        grind: recipe.isTea() ? null : {
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

type TemperatureBaseline = {pours: {temperature: number}[]};

export function describeTemperatureList(temperatures: number[]): string {
    if (temperatures.length === 0) {
        return "";
    }

    const minTemperature = Math.min(...temperatures);
    const maxTemperature = Math.max(...temperatures);

    if (temperatures.length >= 4 && minTemperature !== maxTemperature) {
        return `${minTemperature} to ${maxTemperature}`;
    }

    // A fully identical list reads as one value; a partially repeated list
    // keeps every stage visible because the repetition is part of the shape.
    return minTemperature === maxTemperature
        ? `${minTemperature}`
        : temperatures.join(", ");
}

export function describeTemperatureBaseline(
    recipe: Recipe | TemperatureBaseline,
    fontScale: number,
    temperatureUnit: TemperatureUnit = "C"
): string {
    const temperatures = recipe.pours.map((pour) => toDisplay(pour.temperature, temperatureUnit));
    if (temperatures.length === 0) {
        return "recipe";
    }

    const values = describeTemperatureList(temperatures);
    const minTemperature = Math.min(...temperatures);
    const maxTemperature = Math.max(...temperatures);
    const rangeSummary = temperatures.length >= 4 && minTemperature !== maxTemperature;
    const valueText = `${values} ${unitSuffix(temperatureUnit)}`;
    return fontScale >= 1.4 && !rangeSummary ? valueText : `recipe ${valueText}`;
}

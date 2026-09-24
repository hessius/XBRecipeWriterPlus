import {stageSpans, type Box} from "@/library/brew/brewShape";
import type Pour from "@/library/Pour";

/**
 * The temperature band, and where each stage's mark sits inside it.
 *
 * Pure, and deliberately beside `brewShape.ts` rather than inside `BrewTrace`:
 * the chart and its tests must agree about where a mark goes, and a number
 * computed in a render body cannot be checked without rendering.
 *
 * A stage temperature is a **setpoint**, not a measurement. The machine never
 * reports temperature during a recipe brew, so nothing here interpolates and
 * nothing here varies between two brews of the same unedited recipe.
 */

/** The coolest a card can carry, and the printable top edge the band may use. */
export const BAND_MIN = 39;
export const BAND_MAX = 100;

/**
 * The narrowest band that may be drawn.
 *
 * A recipe that holds one temperature throughout would otherwise produce a band
 * of nothing, in which every mark sits at the same arbitrary height and the
 * rounding noise of a single degree fills the plot. Fifteen degrees is the
 * span a 94/92/90 recipe needs to read clearly, so a flat recipe gets the same
 * scale a stepped one would and the two look comparable.
 */
export const MIN_SPAN = 15;

/** Breathing room either side of the recipe's own extremes. */
const PAD = 2;

/** Bands land on fives, so the printed edge labels are numbers a person uses. */
const STEP = 5;

export type TempBand = {min: number; max: number};

export function hasSetTemperature(temp: number): boolean {
    return temp > 0;
}

/**
 * The band a set of stage temperatures should be drawn against.
 *
 * Adaptive rather than fixed because an honest axis over 39..99 draws every
 * coffee recipe as a flat line: a 94/92/90 spread lands under three pixels
 * apart. The cost of adapting is that heights are not comparable between two
 * recipes, which is why the caller must always print both edges.
 */
export function temperatureBand(temps: number[]): TempBand | undefined {
    // `Pour.temperature` defaults to -1, meaning unset. An unset stage is not a
    // cool stage; it has no setpoint, so it contributes nothing to the scale
    // rather than dragging every real temperature into a flattened band.
    const setTemps = temps.filter(hasSetTemperature);
    if (setTemps.length === 0) return undefined;

    let min = Math.floor((Math.min(...setTemps) - PAD) / STEP) * STEP;
    let max = Math.ceil((Math.max(...setTemps) + PAD) / STEP) * STEP;

    if (max - min < MIN_SPAN) {
        const middle = (min + max) / 2;
        min = Math.floor((middle - MIN_SPAN / 2) / STEP) * STEP;
        max = min + MIN_SPAN;
    }

    // Shift rather than shrink. A band that gave up span at the edges would
    // draw a cool recipe flatter than a hot one for no reason but its position.
    if (min < BAND_MIN) {
        max += BAND_MIN - min;
        min = BAND_MIN;
    }
    if (max > BAND_MAX) {
        min = Math.max(min - (max - BAND_MAX), BAND_MIN);
        max = BAND_MAX;
    }

    return {min, max};
}

/**
 * The vertical region the band occupies, as fractions of the plot height.
 *
 * Fixed even though the degrees it spans are not, so the marks never wander
 * into the busy lower half where the water fill and the cup line live. The
 * top also reserves the chart label's row, so every rule can keep its reading
 * above it and vertical order always means temperature.
 */
export const BAND_TOP = 0.13;
export const BAND_FLOOR = 0.45;

/**
 * The narrowest a mark may be drawn.
 *
 * A 5 ml rinse on a five minute recipe is a fraction of a pixel wide. A later
 * drawing task should import this rather than keep a matching literal.
 */
export const MIN_MARK_WIDTH = 2;

export type TempMark = {
    x: number;
    width: number;
    y: number;
    temperature: number;
};

/** Where a temperature sits in the plot. Screen coordinates, so downward. */
export function bandY(temp: number, band: TempBand, height: number): number {
    const top = height * BAND_TOP;
    const floor = height * BAND_FLOOR;
    const span = band.max - band.min;
    if (span <= 0) return top;
    return top + ((band.max - temp) / span) * (floor - top);
}

/** Whether a setpoint can be drawn against this band without extrapolating. */
export function temperatureInBand(temp: number, band: TempBand): boolean {
    return hasSetTemperature(temp) && temp >= band.min && temp <= band.max;
}

/**
 * One mark per stage, spanning that stage's **pour only**.
 *
 * Not the whole stage: a stage is mostly waiting, and a mark drawn across the
 * wait asserts a water temperature at a moment when no water is moving. The
 * gaps between marks are therefore the pauses, which is the recipe's rhythm
 * drawn for free.
 */
export function temperatureMarks(
    stages: Pour[], band: TempBand, box: Box
): TempMark[] {
    if (stages.length === 0 || box.maxT <= 0) return [];
    const marks: TempMark[] = [];
    stageSpans(stages).forEach((span, i) => {
        const temperature = stages[i].temperature;
        // `Pour.temperature` defaults to -1, meaning unset. Letting that value
        // draw would put the mark outside the band and letting it scale would
        // flatten every set stage around it, so an unset stage contributes
        // nothing to the temperature overlay.
        if (!hasSetTemperature(temperature)) return;
        const x = (span.start / box.maxT) * box.width;
        const end = (span.pourEnd / box.maxT) * box.width;
        marks.push({
            x,
            width: Math.max(end - x, MIN_MARK_WIDTH),
            y: bandY(temperature, band, box.height),
            temperature
        });
    });
    return marks;
}

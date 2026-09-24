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

/** The coolest and hottest a card can carry. Mirrors `cardLimits.TEMPERATURE`. */
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

/**
 * The band a set of stage temperatures should be drawn against.
 *
 * Adaptive rather than fixed because an honest axis over 39..99 draws every
 * coffee recipe as a flat line: a 94/92/90 spread lands under three pixels
 * apart. The cost of adapting is that heights are not comparable between two
 * recipes, which is why the caller must always print both edges.
 */
export function temperatureBand(temps: number[]): TempBand | undefined {
    if (temps.length === 0) return undefined;

    let min = Math.floor((Math.min(...temps) - PAD) / STEP) * STEP;
    let max = Math.ceil((Math.max(...temps) + PAD) / STEP) * STEP;

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

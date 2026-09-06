import {NOTCH_OVERHANG} from "./rungGeometry";

/**
 * How the brew screen's flexible height is shared out.
 *
 * The screen was a stack of constants inside a flexible space: a 150 pt trace,
 * a 120 pt lane and a ladder given `flex: 1` with nothing to grow with, which
 * on a four-stage recipe left roughly 230 pt of black. Every band now has a
 * floor and a cap, and the leftover height is offered to them in order.
 *
 * All figures are points.
 */

/** The trace takes the first of the slack: it is the thing worth looking at. */
export const TRACE_FLOOR = 120;
export const TRACE_CAP = 200;
export const TRACE_MAX = 300;

/** Then the rung bars thicken. */
export const BAR_FLOOR = 9;
export const BAR_CAP = 28;
export const BAR_MAX = 44;

/**
 * Then the rungs spread out.
 *
 * The floor is the notch's clearance rather than a chosen number: the
 * agitation mark overhangs its bar top and bottom, so any thinner gap and two
 * neighbouring rungs cut into each other's marks. It costs at most three
 * points of bar height on the tallest recipes.
 *
 * It does move the point at which a ladder starts to scroll, by three points
 * per stage: nine stages now scroll at a flexible height of 228-254, and
 * twelve at 264-299, where before they just fit. That is the price of drawing
 * the mark at all, and it is paid in a narrow band of window heights rather
 * than in bar height everywhere -- but it is a real change, not a free one.
 */
export const GAP_FLOOR = 2 * NOTCH_OVERHANG;
export const GAP_CAP = 20;
export const GAP_MAX = 34;

export type Bands = {
    traceHeight: number;
    barHeight: number;
    rungGap: number;
    /** True when even the floors do not fit, so the ladder must scroll. */
    scrolls: boolean;
};

/**
 * The bar thickness and rung spacing for a ladder that sizes to its content.
 *
 * `allocateBands` shares out a *measured* flexible height, thickening the bars
 * as slack allows. A `BrewSummary` has no such height: it renders inside a
 * `ViewShot` with `fill={false}`, an auto-height container with no slack to
 * divide, so there is nothing to measure and `allocateBands` cannot be called.
 *
 * It still has to look like the same ladder the live screen draws. So it takes
 * the two bands' *soft caps* — the thickness and spacing the live screen holds
 * a comfortably-filled ladder at before it starts spending leftover height on
 * a second helping. At a mid-range phone height a four-to-nine stage brew
 * settles at exactly these values, so the frozen summary and the live screen
 * read as the same app rather than two.
 *
 * Derived from the caps rather than restated as literals, because that drift is
 * precisely the bug this replaces: the summary carried its own `11`/`8` from
 * before #88 thickened the caps to `28`/`20`, so a brew watched with thick bars
 * reopened from history with thin ones.
 */
export const SUMMARY_BANDS = {
    barHeight: BAR_CAP,
    rungGap:   GAP_CAP
} as const;

/**
 * Share `flexHeight` between the trace and the ladder.
 *
 * @param flexHeight the measured height available to the trace and the ladder
 *                   together, with the nav row, figures, now card and action
 *                   already taken out
 * @param stages     how many rungs the ladder will draw
 */
export function allocateBands(flexHeight: number, stages: number): Bands {
    if (stages <= 0) {
        return {
            traceHeight: Math.min(TRACE_MAX, Math.max(TRACE_FLOOR, flexHeight)),
            barHeight: BAR_FLOOR, rungGap: GAP_FLOOR, scrolls: false
        };
    }

    const floors = TRACE_FLOOR + stages * (BAR_FLOOR + GAP_FLOOR);
    let slack = flexHeight - floors;
    if (slack < 0) {
        return {
            traceHeight: TRACE_FLOOR, barHeight: BAR_FLOOR, rungGap: GAP_FLOOR,
            scrolls: true
        };
    }

    // Pass one, in priority order, up to each band's soft cap. The caps are
    // what stop the first band in the queue from taking everything.
    let traceHeight = Math.min(TRACE_CAP, TRACE_FLOOR + slack);
    slack -= traceHeight - TRACE_FLOOR;

    let barHeight = Math.min(BAR_CAP, BAR_FLOOR + Math.floor(slack / stages));
    slack -= (barHeight - BAR_FLOOR) * stages;

    let rungGap = Math.min(GAP_CAP, GAP_FLOOR + Math.floor(slack / stages));
    slack -= (rungGap - GAP_FLOOR) * stages;

    // Pass two, same order, against hard ceilings. Without it every point the
    // soft caps refused fell out of the bottom of the screen as black -- which
    // is #88 in one sentence: BAR_CAP saturated at 15 and the rest went to a
    // gap that had no cap at all, so a 15 pt bar sat in an 85 pt row.
    const traceMore = Math.min(TRACE_MAX - traceHeight, slack);
    traceHeight += traceMore;
    slack -= traceMore;

    const barMore = Math.min(BAR_MAX - barHeight, Math.floor(slack / stages));
    barHeight += barMore;
    slack -= barMore * stages;

    const gapMore = Math.min(GAP_MAX - rungGap, Math.floor(slack / stages));
    rungGap += gapMore;

    // Anything still left is breathing room. The ladder is centred in it by
    // `BrewStageLadder`: space around well-proportioned content reads as
    // deliberate, where stretched content reads as a fault.
    return {traceHeight, barHeight, rungGap, scrolls: false};
}

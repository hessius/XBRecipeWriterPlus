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

/** Then the rung bars thicken. */
export const BAR_FLOOR = 9;
export const BAR_CAP = 15;

/** Then the rungs spread out, without limit, until the ladder fills its box. */
export const GAP_FLOOR = 3;

export type Bands = {
    traceHeight: number;
    barHeight: number;
    rungGap: number;
    /** True when even the floors do not fit, so the ladder must scroll. */
    scrolls: boolean;
};

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
            traceHeight: Math.min(TRACE_CAP, Math.max(TRACE_FLOOR, flexHeight)),
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

    const traceHeight = Math.min(TRACE_CAP, TRACE_FLOOR + slack);
    slack -= traceHeight - TRACE_FLOOR;

    const barHeight = Math.min(BAR_CAP, BAR_FLOOR + Math.floor(slack / stages));
    slack -= (barHeight - BAR_FLOOR) * stages;

    const rungGap = GAP_FLOOR + Math.floor(slack / stages);

    return {traceHeight, barHeight, rungGap, scrolls: false};
}

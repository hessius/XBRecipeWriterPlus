import type {BrewSample} from "./BrewRecord";
import {NOISE_FLOOR_ML} from "./stalls";

/**
 * How long brew water must stay below a new high before the live clock opens.
 *
 * The machine reports around ten scale frames a second, and `NOISE_FLOOR_ML`
 * is the channel's half millilitre floor. One second means ten consecutive
 * readings have failed to exceed that floor, while adding only the first
 * second of drawdown latency to a clock that otherwise cannot be stable.
 */
export const DRAWDOWN_OPEN_MARGIN_MS = 1000;

export type LiveDrawdown = {
    /** Boundary in milliseconds on the sample clock, or 0 before it exists. */
    drawdownAt: number;
    /** Seconds since the boundary, or null until the clock may be shown. */
    drawdown: number | null;
    /** Whether the live figures should hold the drawdown row's height. */
    reserveDrawdown: boolean;
};

/**
 * Where the live final-stage drawdown began, in milliseconds, or 0.
 *
 * Unlike the finished record's `drawdownFrom`, this is asked on every render
 * against a growing stream. A rise has to clear the scale's noise floor before
 * it can retake the boundary, so a plateau wobbling by a few tenths of a
 * millilitre cannot make the clock run backwards.
 */
export function liveDrawdownFrom(samples: BrewSample[], stages: number): number {
    let at = 0;
    let highest = 0;
    for (const sample of samples) {
        if (sample.pour !== stages) continue;
        if (sample.water - highest > NOISE_FLOOR_ML) {
            highest = sample.water;
            at = sample.at;
        }
    }
    return at;
}

/**
 * The live drawdown row state for the brew screen.
 *
 * The boundary is final-stage only, so planned pauses between earlier stages
 * cannot open the row. Bypass samples still advance `elapsedSeconds`, because
 * the hardware fires the bypass inside the drawdown and the bed keeps draining
 * while plain water is being added to the same cup scale.
 */
export function liveDrawdown(
    samples: BrewSample[],
    stages: number,
    elapsedSeconds: number,
    running: boolean
): LiveDrawdown {
    const drawdownAt = liveDrawdownFrom(samples, stages);
    const reserveDrawdown = running && drawdownAt > 0;
    const elapsedMs = elapsedSeconds * 1000;
    const open = reserveDrawdown
        && elapsedMs - drawdownAt >= DRAWDOWN_OPEN_MARGIN_MS;
    return {
        drawdownAt,
        drawdown: open ? Math.max(0, elapsedSeconds - drawdownAt / 1000) : null,
        reserveDrawdown,
    };
}

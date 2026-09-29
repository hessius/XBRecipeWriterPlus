import type {BrewSample} from "./BrewRecord";
import {NOISE_FLOOR_ML} from "./stalls";
import type {BrewPhase} from "@/library/machine/Machine";

/**
 * How long brew water must stay below a new high before the live clock opens.
 *
 * The machine reports around ten scale frames a second. One second leaves
 * enough room for the final water boundary to settle before the clock is
 * revealed, while adding only that first second of drawdown latency to a clock
 * that otherwise cannot be stable.
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
 * it can move the boundary, but the retake threshold is measured from the
 * highest level actually seen. That leaves the full noise floor above a legal
 * 3 ml/s pour whose last frame did not itself clear the ratchet.
 */
export function liveDrawdownFrom(samples: BrewSample[], stages: number): number {
    let at = 0;
    let boundaryLevel = 0;
    let seenHighest = 0;
    let plateauBase = 0;
    let plateauSeen = false;
    for (const sample of samples) {
        if (sample.pour !== stages) continue;

        if (sample.water <= seenHighest) {
            plateauSeen = true;
            plateauBase = seenHighest;
            continue;
        }

        if (plateauSeen) {
            if (sample.water - plateauBase > NOISE_FLOOR_ML) {
                seenHighest = sample.water;
                boundaryLevel = sample.water;
                at = sample.at;
                plateauSeen = false;
            } else {
                seenHighest = sample.water;
            }
            continue;
        }

        seenHighest = sample.water;
        if (sample.water - boundaryLevel > NOISE_FLOOR_ML) {
            boundaryLevel = sample.water;
            at = sample.at;
        }
    }
    return at;
}

/**
 * The live drawdown row state for the brew screen.
 *
 * The boundary is final-stage only, so planned pauses between earlier stages
 * cannot open the row. The row opens only after the machine leaves `pouring`,
 * because a flat second inside the final pour is a stall, not drawdown. Bypass
 * and settling both keep it open, because the hardware fires bypass inside the
 * drawdown and the bed keeps draining in both phases.
 */
export function liveDrawdown(
    samples: BrewSample[],
    stages: number,
    elapsedSeconds: number,
    phaseName: BrewPhase["name"],
    running: boolean
): LiveDrawdown {
    const drawdownAt = liveDrawdownFrom(samples, stages);
    const reserveDrawdown = running && drawdownAt > 0;
    const elapsedMs = elapsedSeconds * 1000;
    const finalPourEnded = phaseName === "bypass" || phaseName === "settling";
    const open = reserveDrawdown
        && finalPourEnded
        && elapsedMs - drawdownAt >= DRAWDOWN_OPEN_MARGIN_MS;
    return {
        drawdownAt,
        drawdown: open ? Math.max(0, elapsedSeconds - drawdownAt / 1000) : null,
        reserveDrawdown,
    };
}

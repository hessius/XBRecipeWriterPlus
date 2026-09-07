import type {BrewSample} from "./BrewRecord";
import {stageSpans} from "./brewShape";
import type Pour from "@/library/Pour";

/** One stage's extent along the trace's own axis, in seconds from the first drop. */
export type StageBound = {start: number; end: number};

/**
 * Where each stage actually sat on the time axis.
 *
 * Taken from the stream when there is one, because that is what the trace is
 * drawn from: a brew held by overflow protection ends right of its plan by
 * exactly the time it lost, so a tap resolved against the *planned* spans would
 * name the wrong stage by however far the brew had drifted — and drift is
 * precisely what a user taps a late stage to ask about.
 *
 * Falls back to the plan when the stream has been swept, where the plan is the
 * only account of the brew that survives. Index-aligned with `pours`.
 */
export function stageBounds(samples: BrewSample[], pours: Pour[]): StageBound[] {
    const planned = stageSpans(pours).map((span) => ({start: span.start, end: span.end}));
    if (samples.length === 0) return planned;

    const bounds = planned.map(() => ({start: NaN, end: NaN}));
    for (const sample of samples) {
        // `pour` is 1-based, and 0 before the first drop.
        const i = sample.pour - 1;
        if (i < 0 || i >= bounds.length) continue;
        const seconds = sample.at / 1000;
        if (Number.isNaN(bounds[i].start)) bounds[i].start = seconds;
        bounds[i].end = seconds;
    }

    // A stage the stream never mentions — one that never ran, or ran between
    // two samples — keeps its planned extent rather than becoming a hole that
    // swallows taps.
    return bounds.map((bound, i) =>
        Number.isNaN(bound.start) ? planned[i] : bound);
}

/**
 * Which stage a moment belongs to, or null.
 *
 * Scans forward and takes the first stage whose end is not yet passed, rather
 * than requiring `start <= t <= end`. The bounds derived from a stream have
 * gaps — the sample rate leaves a fraction of a second between one stage's last
 * reading and the next stage's first — and a strict test would drop a tap that
 * landed in one, which reads as the graph simply ignoring you.
 */
export function stageAtSeconds(bounds: StageBound[], seconds: number): number | null {
    if (bounds.length === 0) return null;
    if (seconds < bounds[0].start) return null;
    for (let i = 0; i < bounds.length; i++) {
        if (seconds <= bounds[i].end) return i;
    }
    // Past the last sample: the tail of the chart belongs to the final stage,
    // which is where an overrun is drawn and the most likely thing to ask about.
    return bounds.length - 1;
}

/**
 * Which stage a tap at `x` fell on.
 *
 * `maxT` is the trace's own axis maximum — the same `box.maxT` the paths are
 * drawn against, which is the longer of the plan and the run. Passing the
 * planned duration instead would resolve taps against a shorter axis than the
 * one on screen and name a stage too early by the length of the overrun.
 */
export function stageAtX(
    bounds: StageBound[], x: number, width: number, maxT: number
): number | null {
    if (width <= 0 || maxT <= 0) return null;
    return stageAtSeconds(bounds, (x / width) * maxT);
}

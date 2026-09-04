import type {BrewFailure} from "@/library/machine/Machine";

import {stallsInStage, type Stall} from "./stalls";

/**
 * One instant of a brew, as the machine reported it.
 *
 * `at` is milliseconds since the brew started rather than a wall clock: a
 * record is replayed against its own timeline, and a stream of absolute
 * timestamps would have to be re-based on every read.
 */
export type BrewSample = {
    at: number;
    /** Water dispensed, ml. The machine reports grams; for water they are one. */
    water: number;
    /** Weight in the cup, g. */
    cup: number;
    /** Which pour was running, 1-based. 0 before the first drop. */
    pour: number;
};

/** How a brew ended. `failed` carries the reason separately. */
export type BrewOutcome = "done" | "cancelled" | "lostContact" | "failed";

/**
 * One brew that happened.
 *
 * `recipeName` and `accent` are **copied, not joined**. A brew is a record of
 * an event; renaming a recipe must not rewrite history, and deleting one must
 * not erase it.
 */
export type BrewRecord = {
    id: string;
    recipeUuid: string;
    recipeName: string;
    accent: string;
    startedAt: number;
    /**
     * Wall clock of the first drop. Absent on rows written before it existed,
     * and 0 on a brew that was refused or stopped before it poured.
     *
     * Kept apart from `startedAt` because the sample stream is zeroed here,
     * not there. Measuring the plan from `startedAt` folded waking and
     * grinding into it, which squeezed the trace against a longer axis than
     * the one it was drawn on and understated the overrun by exactly the time
     * the grinder took.
     */
    pouringAt?: number;
    endedAt: number;
    outcome: BrewOutcome;
    failure: BrewFailure | null;
    pours: number;
    waterTotal: number;
    cupTotal: number;
    /** Seconds the brew ran beyond its plan — overflow protection, mostly. */
    heldSeconds: number;
    /**
     * Where each stage stopped pouring, one list per stage, index-aligned with
     * the recipe's pours.
     *
     * Kept on the record rather than recomputed from the samples on read: the
     * definition of a stall may be tuned, and a brew from last month should go
     * on saying what it said at the time. Absent on rows written before it
     * existed.
     */
    stalls?: Stall[][];
};

export type BrewSummary = Pick<BrewRecord, "waterTotal" | "cupTotal" | "heldSeconds">;

/**
 * Derive the figures a record keeps from the stream it keeps them for.
 *
 * Held time is the overrun against the plan rather than a search for flat runs
 * in the water curve, because a planned pause and an unplanned hold look
 * identical in the stream — the plan is the only thing that can tell them
 * apart, and the difference in totals is exactly the unplanned part.
 */
export function summarise(samples: BrewSample[], plannedSeconds: number): BrewSummary {
    const last = samples[samples.length - 1];
    if (last === undefined) return {waterTotal: 0, cupTotal: 0, heldSeconds: 0};
    const elapsed = last.at / 1000;
    return {
        waterTotal: last.water,
        cupTotal: last.cup,
        heldSeconds: Math.max(0, Math.round(elapsed - plannedSeconds)),
    };
}

/**
 * Every stage's stalls, from the stream.
 *
 * @param targets each stage's planned volume, index-aligned with the pours
 */
export function stallsFromSamples(samples: BrewSample[], targets: number[]): Stall[][] {
    return targets.map((target, i) => stallsInStage(samples, i + 1, target));
}

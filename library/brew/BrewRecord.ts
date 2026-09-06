import type {BrewFailure} from "@/library/machine/Machine";
import Pour from "@/library/Pour";

import {stageWaterFrom, stallsInStage, type Stall} from "./stalls";

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

/**
 * How a brew ended. `failed` carries the reason separately.
 *
 * `endedOnMachine` is a brew the machine reported as complete but which
 * delivered materially less water than the plan asked for -- what happens when
 * somebody adjusts the ratio or the dose on the machine mid-brew, or the beans
 * run out. We cannot say *why*: a mid-brew ratio change is not observable over
 * BLE at all, as there is no event, no readable characteristic, and the
 * pour-start frames carry only an index. So the outcome reports the
 * observation and stops there rather than inventing a cause.
 */
export type BrewOutcome =
    "done" | "endedOnMachine" | "cancelled" | "lostContact" | "failed";

/**
 * How far below plan a brew must land before it is called short, in ml.
 *
 * Below this the difference is scale noise and the last drops still in the
 * brewer, not a decision somebody made on the machine.
 */
export const ENDED_EARLY_ML = 15;

/**
 * The outcome to record, given how the machine said the brew ended.
 *
 * Only a brew the machine called complete can be `endedOnMachine`; a cancelled
 * or failed brew is already described by how it stopped, and is short for a
 * reason that is already known.
 *
 * @param plannedWater the sum of the plan's pour volumes, ml
 */
export function finalOutcome(
    phaseName: string, waterTotal: number, plannedWater: number
): BrewOutcome {
    if (phaseName !== "done") return phaseName as BrewOutcome;
    if (plannedWater <= 0) return "done";
    return plannedWater - waterTotal > ENDED_EARLY_ML ? "endedOnMachine" : "done";
}

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
    /**
     * The plan this brew was started from.
     *
     * Copied for the same reason `recipeName` and `accent` are: a brew is a
     * record of an event, and editing or deleting the recipe afterwards must
     * not rewrite it. Absent on rows written before it existed, which fall
     * back to the live recipe as they always did.
     */
    plan?: PlanStage[];
    /**
     * What each stage actually delivered, index-aligned with `plan`.
     *
     * Stored rather than recomputed on read, like `stalls`: the stream is
     * subject to retention, and a record whose samples have been swept would
     * silently go back to drawing the plan as though it had all poured.
     */
    stageWater?: number[];
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

/**
 * One stage of the plan a brew was started from.
 *
 * A structural copy of `Pour`'s fields rather than the object, because this
 * goes through JSON into a database column and comes back without methods.
 */
export type PlanStage = {
    pourNumber: number;
    volume: number;
    temperature: number;
    flowRate: number;
    agitation: number;
    pourPattern: number;
    pauseTime: number;
};

/** The plan as it stood when the brew began. */
export function planFromPours(pours: Pour[]): PlanStage[] {
    return pours.map((pour) => ({
        pourNumber: pour.pourNumber,
        volume: pour.volume,
        temperature: pour.temperature,
        flowRate: pour.flowRate,
        agitation: pour.agitation,
        pourPattern: pour.pourPattern,
        pauseTime: pour.pauseTime
    }));
}

/**
 * Back into `Pour`s, because the ladder calls `getAgitationBefore` and friends.
 *
 * Anything that is not a plan reads as no plan, which falls back to the live
 * recipe. A half-understood plan drawn as a ladder would be a lie with a
 * shape, and this column can hold whatever an older version wrote.
 */
export function poursFromPlan(plan: PlanStage[] | undefined): Pour[] {
    if (!Array.isArray(plan)) return [];
    const numeric = (value: unknown): value is number =>
        typeof value === "number" && Number.isFinite(value);
    if (!plan.every((stage) => stage !== null && typeof stage === "object"
        && numeric(stage.volume) && numeric(stage.temperature)
        && numeric(stage.agitation) && numeric(stage.pourPattern))) {
        return [];
    }
    return plan.map((stage, index) => new Pour(
        numeric(stage.pourNumber) ? stage.pourNumber : index + 1,
        stage.volume, stage.temperature,
        numeric(stage.flowRate) ? stage.flowRate : 0,
        stage.agitation, stage.pourPattern,
        numeric(stage.pauseTime) ? stage.pauseTime : 0
    ));
}

/**
 * What each stage actually delivered, from the stream.
 *
 * `water` is cumulative across the brew, so a stage's own delivery is the
 * difference across it. A stage that never ran contributes 0 rather than the
 * running total, which is the whole point: a brew that died in stage 2 of 4
 * used to draw stages 3 and 4 full to the brim.
 *
 * Clamped at 0 because the firmware auto-tares during the bloom (#90) and a
 * negative bar would draw backwards.
 */
export function stageWaterFromSamples(samples: BrewSample[], stages: number): number[] {
    return Array.from({length: stages}, (_unused, index) =>
        stageWaterFrom(samples, index + 1));
}

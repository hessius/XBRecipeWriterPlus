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
 * @param waterTotal brew water only, ml — must exclude any bypass water that
 *   the scale captured alongside the pour water, or the bypass will silently
 *   forgive a brew that ended short
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
 * The bypass, as a brew remembers it.
 *
 * The asked-for figures are copied at brew time rather than joined to the
 * recipe, for the same reason `recipeName`, `accent` and `plan` are: a brew is
 * a record of an event, and editing the recipe afterwards must not rewrite it.
 *
 * `startedAt` is milliseconds into the brew, on the same clock as
 * `BrewSample.at`, and `null` when the machine never dispensed — older
 * firmware, or a brew that ended first. `delivered` is then 0, and the rung
 * says so rather than claiming a completed bypass of nothing.
 */
export type BypassRecord = {
    volume: number;
    temperature: number;
    delivered: number;
    startedAt: number | null;
};

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
    /**
     * The bypass, if the recipe had one.
     *
     * Absent on rows written before it existed and on every recipe without a
     * bypass, exactly like `pouringAt`, `stalls`, `plan` and `stageWater` — so
     * an old record draws precisely as it always did.
     *
     * Kept out of `stageWater`, which stays index-aligned with `plan`. The
     * bypass is not a stage, and widening that array by one would have made
     * every existing reader of it wrong by one.
     */
    bypass?: BypassRecord;
    /**
     * The user's own verdict, 1 to 5 whole stars.
     *
     * 0, and absent, both mean unrated, and unrated is not nought: every brew
     * recorded before this existed is unrated, and an average that counted them
     * as bad would rank a much-brewed recipe below a once-brewed one for no
     * reason but silence. Every average filters `rating > 0`.
     */
    rating?: number;
    /** What the user said about the cup. Empty is no note; there is no flag. */
    note?: string;
    /**
     * Kept back from the retention sweep.
     *
     * Set by judging rather than by a control of its own: a user who has just
     * said a brew was good has already said it is worth keeping, and a
     * judgement whose trace has been swept is one that cannot be acted on.
     */
    pinned?: boolean;
    /**
     * Whether the app saw this brew happen. Absent means it did.
     *
     * False only on a brew a person logged by hand, which has no stream, no
     * samples and no figures -- only a rating. Absent rather than `true` on
     * every other record, so a brew written before this existed does not have
     * to be migrated to go on saying what it always said.
     *
     * Explicit, rather than inferred from `waterTotal 0 and heldSeconds 0`: a
     * brew refused for want of water has both of those at zero too, and the app
     * watched it closely enough to know why it stopped.
     */
    watched?: boolean;
};

/** The ceiling of the scale, decided once in the design and read from here. */
export const MAX_RATING = 5;

/** A rating the database will accept: a whole 0..5, where 0 means unrated. */
export function isRating(value: unknown): value is number {
    return typeof value === "number"
        && Number.isInteger(value)
        && value >= 0
        && value <= MAX_RATING;
}

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

/**
 * An id for a brew.
 *
 * Time in base 36 and a little noise. Shared with the recorder rather than
 * copied so that a hand-logged brew and a watched one cannot come to disagree
 * about what a brew id looks like.
 */
export function newBrewId(): string {
    return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/**
 * A brew that happened where the app could not see it.
 *
 * A user who writes cards and brews at the machine never produces a Bluetooth
 * brew, so the rating axis would ship permanently empty for them. Rather than
 * give the recipe a rating field of its own -- which #95 forbids, because the
 * brew is the observation and the recipe is the inference -- they get the thing
 * they actually have: a record carrying only what a person put there.
 *
 * `watched: false` is set explicitly rather than inferred from the zeros. A
 * brew refused for want of water has no water and no held time either, and it
 * is a brew the app watched closely enough to know why it stopped; filing that
 * as something somebody typed would be a lie about both.
 *
 * Pinned on arrival, on the rule that keeps a judged brew: this record is
 * nothing but a judgement. It has no samples for a sweep to take, so the pin
 * costs nothing and says what it is.
 */
export function unobservedBrew(input: {
    recipeUuid: string;
    recipeName: string;
    accent: string;
    rating: number;
    /** Injected by tests; the wall clock otherwise. */
    at?: number;
    id?: string;
}): BrewRecord {
    const at = input.at ?? Date.now();
    return {
        id: input.id ?? newBrewId(),
        recipeUuid: input.recipeUuid,
        recipeName: input.recipeName,
        accent: input.accent,
        startedAt: at,
        // Zero, the app's own word for "it never poured". A first drop would
        // be an invention, and the record draws from this.
        pouringAt: 0,
        endedAt: at,
        outcome: "done",
        failure: null,
        pours: 0,
        waterTotal: 0,
        cupTotal: 0,
        heldSeconds: 0,
        rating: input.rating,
        pinned: true,
        watched: false
    };
}

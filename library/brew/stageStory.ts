import type Pour from "@/library/Pour";

import type {BrewSample} from "./BrewRecord";
import type {Stall} from "./stalls";

/**
 * How far below its plan a single stage must land before it is called short,
 * in ml.
 *
 * The brew as a whole uses `ENDED_EARLY_ML` = 15 (see `BrewRecord.ts`): below
 * that the difference is scale noise and the last drops still in the brewer,
 * not a decision somebody made on the machine. A stage is not the same
 * measurement and cannot borrow the same number. Fifteen millilitres is a
 * whole-brew allowance spread across every stage; applied to one stage of four
 * it would let a stage quietly deliver ten millilitres under and still call it
 * complete — which is exactly the "where did my water go" question this panel
 * exists to answer.
 *
 * Five millilitres: comfortably above the stalls module's
 * `TARGET_TOLERANCE_ML` of 1 (a stage that lands within a millilitre of target
 * has met it, so anything at or under that is not short at all) and above the
 * ~0.5 ml scale noise floor, yet a third of the whole-brew figure. At the
 * machine's ~3.2 ml/s that is over a second of pour that never happened —
 * something the machine was told to do and did not, rather than the tail of a
 * pour that did. Like the brew-level figure it wants confirming against a real
 * machine; it is a judgement about hardware, not arithmetic.
 */
export const STAGE_SHORT_ML = 5;

/**
 * When a stage happened, in seconds from the first drop.
 *
 * `available` is false when the sample stream was swept by the retention
 * setting: the record still knows what the stage delivered and where it held,
 * but not the second-by-second timing, so the panel says so plainly rather
 * than printing zeros.
 */
export type StageTiming =
    | {available: true; startSec: number; endSec: number}
    | {available: false};

/**
 * Everything the detail panel says about one stage, derived once from the
 * record so the component only lays it out.
 */
export type StageStory = {
    /** 1-based, for the heading. */
    stageNumber: number;
    plannedMl: number;
    deliveredMl: number;
    /** Planned minus delivered, never negative. */
    shortfallMl: number;
    /** The stage delivered materially less than planned. */
    stoppedShort: boolean;
    temperature: number;
    /** The holds recorded for the stage, as stored. */
    holds: Stall[];
    totalHeldSeconds: number;
    timing: StageTiming;
};

type StageStoryInput = {
    /** Zero-based index of the stage. */
    index: number;
    stage: Pour;
    deliveredMl: number;
    stalls: Stall[];
    /** The whole brew's stream; this filters by `pour` itself. */
    samples: BrewSample[];
    /** False when the stream was not kept; `samples` is then empty. */
    hasStream: boolean;
};

/** One decimal. Held times arrive already rounded, but a sum reopens the float. */
function round1(n: number): number {
    return Math.round(n * 10) / 10;
}

/**
 * The prose and figures for one recorded stage.
 *
 * Pure so it can be pinned without a renderer: the panel's judgements — did it
 * stop short, how long did it hold, when did it run — are exactly the parts
 * worth guarding, and a component test cannot pin an integer against the
 * threshold that produced it.
 */
export function stageStory({
    index, stage, deliveredMl, stalls, samples, hasStream
}: StageStoryInput): StageStory {
    const plannedMl = Math.max(stage.volume, 0);
    const shortfallMl = Math.max(0, plannedMl - deliveredMl);
    const stoppedShort = shortfallMl > STAGE_SHORT_ML;

    const totalHeldSeconds = round1(
        stalls.reduce((total, stall) => total + stall.seconds, 0)
    );

    // The stage's own samples, `pour` being 1-based. Empty whenever the stream
    // was swept, and then the timing is simply not knowable.
    const mine = hasStream ? samples.filter((s) => s.pour === index + 1) : [];
    const timing: StageTiming = mine.length === 0
        ? {available: false}
        : {
            available: true,
            startSec: mine[0].at / 1000,
            endSec: mine[mine.length - 1].at / 1000
        };

    return {
        stageNumber: index + 1,
        plannedMl,
        deliveredMl,
        shortfallMl,
        stoppedShort,
        temperature: Math.max(stage.temperature, 0),
        holds: stalls,
        totalHeldSeconds,
        timing
    };
}

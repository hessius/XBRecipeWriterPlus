import type {BrewSample} from "./BrewRecord";
import {MIN_STALL_SECONDS, NOISE_FLOOR_ML, stageWaterFrom} from "./stalls";
import type {BrewPhase} from "@/library/machine/Machine";

/**
 * How long brew water must be quiet before a post-pour phase can open the
 * live clock for a stage that ended short of its target.
 *
 * `MIN_STALL_SECONDS` is the floor for recognising a real in-pour stall, not a
 * ceiling on how long one can last. This margin is therefore not allowed to
 * open the clock while the machine is still in `pouring`; it only keeps a
 * post-pour backstop from reacting to one quiet frame.
 */
export const DRAWDOWN_OPEN_MARGIN_MS = (MIN_STALL_SECONDS * 1000) + 100;

type DrawdownPhaseGate = "veto" | "water" | "backstop";

const DRAWDOWN_PHASES = {
    idle: "veto",
    waking: "veto",
    sending: "veto",
    readyToStart: "veto",
    armed: "veto",
    pressPlay: "veto",
    grinding: "veto",
    pouring: "water",
    bypass: "backstop",
    settling: "backstop",
    done: "veto",
    cancelled: "veto",
    lostContact: "veto",
    failed: "veto",
} satisfies Record<BrewPhase["name"], DrawdownPhaseGate>;

export type LiveDrawdown = {
    /** Boundary in milliseconds on the sample clock, or 0 before it exists. */
    drawdownAt: number;
    /** Seconds since the boundary, or null until the clock may be shown. */
    drawdown: number | null;
    /** Whether the live figures should hold the drawdown row's height. */
    reserveDrawdown: boolean;
};

export type LiveDrawdownOptions = {
    samples: BrewSample[];
    stages: number;
    elapsedSeconds: number;
    phaseName: BrewPhase["name"];
    running: boolean;
    /** Planned millilitres for the final brew stage, if the caller has them. */
    finalStageTargetMl?: number;
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
 * cannot open the row. Hitting the final stage's planned volume opens the
 * clock even while the machine still calls the phase `pouring`, which is where
 * the verified drawdown occurs. Bypass and settling are only a backstop for a
 * final stage that stopped short, because quiet water below the target is
 * indistinguishable from a real in-pour stall while `pouring` is still active.
 */
export function liveDrawdown({
    samples,
    stages,
    elapsedSeconds,
    phaseName,
    running,
    finalStageTargetMl,
}: LiveDrawdownOptions): LiveDrawdown {
    const drawdownAt = liveDrawdownFrom(samples, stages);
    const reserveDrawdown = running && drawdownAt > 0;
    const elapsedMs = elapsedSeconds * 1000;
    const phaseGate = DRAWDOWN_PHASES[phaseName];
    const finalStageTarget = finalStageTargetMl === undefined
        ? null
        : Math.max(finalStageTargetMl, 0);
    const plannedVolumeDelivered = finalStageTarget !== null
        && finalStageTarget > 0
        && stageWaterFrom(samples, stages) >= finalStageTarget;
    const quietLongEnough = elapsedMs - drawdownAt >= DRAWDOWN_OPEN_MARGIN_MS;
    const phaseBackstop = phaseGate === "backstop" && quietLongEnough;
    const open = reserveDrawdown
        && phaseGate !== "veto"
        && (plannedVolumeDelivered || phaseBackstop);
    return {
        drawdownAt,
        drawdown: open ? Math.max(0, elapsedSeconds - drawdownAt / 1000) : null,
        reserveDrawdown,
    };
}

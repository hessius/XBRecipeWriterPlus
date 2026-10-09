import {drawdownFrom, type BrewSample} from "./BrewRecord";
import {MIN_STALL_SECONDS, TARGET_TOLERANCE_ML, stageWaterFrom} from "./stalls";
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
    // A paused brew's water stopped because somebody stopped it, not because
    // the bed is draining. Opening the drawdown clock here would start timing
    // a drawdown that has not begun, and the figure would go on climbing for
    // as long as the pause lasted.
    paused: "veto",
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
 * The same noise-aware boundary the recorder persists, asked on every render
 * against a growing stream.
 */
export function liveDrawdownFrom(samples: BrewSample[], stages: number): number {
    return drawdownFrom(samples, stages, true);
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
    /*
     * The same predicate `stalledNow` uses, deliberately. A stage that lands
     * within a millilitre of target has met it, and if the two disagreed the
     * screen could show no HOLDING warning and no drawdown clock at once,
     * one saying the stage finished and the other saying it had not.
     */
    const plannedVolumeDelivered = finalStageTarget !== null
        && finalStageTarget > 0
        && stageWaterFrom(samples, stages) + TARGET_TOLERANCE_ML >= finalStageTarget;
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

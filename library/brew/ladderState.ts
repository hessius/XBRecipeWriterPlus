import type {BrewOutcome} from "./BrewRecord";

/**
 * How far a finished brew's ladder got.
 *
 * The ladder draws stages below this index as done, the one at it as the stage
 * in progress, and the rest as never reached. A record has nothing in
 * progress, so the frontier is the stage the brew stopped in -- which for a
 * brew that finished is past the end, leaving every stage done.
 *
 * A brew that was cancelled after its last drop poured everything, so it is
 * not treated as stopping short: the count of stages that delivered water is
 * what decides, not the outcome alone.
 */
export function ladderFrontier(outcome: BrewOutcome, stageWater: number[]): number {
    const poured = stageWater.filter((ml) => ml > 0).length;
    if (outcome === "done" || poured === stageWater.length) return stageWater.length;
    // The *last* stage that delivered anything, by index rather than by count:
    // a zero-volume stage in the middle would otherwise pull the frontier back
    // behind stages that had already poured.
    const last = stageWater.reduce((seen, ml, index) => (ml > 0 ? index : seen), -1);
    // A brew that poured nothing has no last stage and points at the first,
    // which draws as the one it died in.
    return Math.max(0, last);
}

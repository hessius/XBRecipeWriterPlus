import type {StoredBrew} from "@/library/BrewDatabase";

import {countsAsBrewed} from "./brewPopulation";

/**
 * Two brews of one recipe, held against each other.
 *
 * Pure, and pointedly so: everything on this screen that can be got wrong can
 * be got wrong here, where a test can catch it without a machine. The drawing
 * is the part that needs real brews, so as little as possible of the thinking
 * happens there.
 *
 * `StoredBrew` is imported as a type only. `BrewDatabase` pulls in expo-sqlite,
 * and this module must stay importable by a plain node test.
 */

/**
 * How far two brews' water may differ and still count as the same pour.
 *
 * Six times the scale's 0.5 ml noise floor. Whether it is the right number is
 * a hardware question rather than an arithmetic one, exactly as
 * `TARGET_TOLERANCE_ML` in `stalls.ts` says of its own figure. It wants
 * checking against two real brews of one recipe.
 */
export const COMPARE_WATER_TOLERANCE_ML = 3;

/** The same disclaimer, for the clock. */
export const COMPARE_TIME_TOLERANCE_SECONDS = 5;

export type PourVerdict = "same" | "stalled" | "differed" | "incomplete";

/**
 * How long the pour took.
 *
 * From the first drop, not from waking: grinding is not pouring, and a brew
 * that ground for a minute longer poured no differently. The same fallback the
 * record screen uses, for rows written before `pouringAt` existed.
 */
export function pourDurationSeconds(record: StoredBrew): number {
    const pouredFrom = (record.pouringAt ?? 0) > 0
        ? record.pouringAt
        : record.startedAt;
    return Math.max(0, (record.endedAt - pouredFrom) / 1000);
}

function stalled(record: StoredBrew): boolean {
    return (record.stalls ?? []).some((stage) => stage.length > 0);
}

/**
 * Whether the two brews poured alike, and what to say about it.
 *
 * The order of the tests is the point. A brew that stopped is not a brew that
 * differed, and saying "these differed by 90 ml" about a cancelled brew is
 * true and useless. A stall is likewise its own answer rather than a cause of
 * a difference in the totals.
 */
export function pourVerdict(
    subject: StoredBrew, reference: StoredBrew
): {verdict: PourVerdict; why: string} {
    const unfinished = [subject, reference].filter((r) => !countsAsBrewed(r));
    if (unfinished.length > 0) {
        return {
            verdict: "incomplete",
            why: unfinished.length === 2
                ? "Neither brew finished, so there is no pour to compare."
                : "One brew did not finish, so the pours cannot be compared."
        };
    }

    const stalls = [subject, reference].filter(stalled);
    if (stalls.length > 0) {
        return {
            verdict: "stalled",
            why: stalls.length === 2
                ? "Both brews stalled, so neither poured to plan."
                : "One brew stalled, so it did not pour to plan."
        };
    }

    const water = Math.abs(subject.waterTotal - reference.waterTotal);
    if (water > COMPARE_WATER_TOLERANCE_ML) {
        return {
            verdict: "differed",
            why: `The brews delivered ${Math.round(water)} ml of water apart.`
        };
    }

    const seconds = Math.abs(
        pourDurationSeconds(subject) - pourDurationSeconds(reference)
    );
    if (seconds > COMPARE_TIME_TOLERANCE_SECONDS) {
        return {
            verdict: "differed",
            why: `One brew poured for ${Math.round(seconds)} seconds longer.`
        };
    }

    return {
        verdict: "same",
        why: "Both brews poured the same water on the same schedule."
    };
}

import {
    OVERFLOW_CROSSING_MS,
    OVERFLOW_PAIR_MAX_SKEW_MS,
    OVERFLOW_READING_MAX_AGE_MS
} from "@/constants/overflow";

export type Reading = {grams: number; at: number};
export type RetainedPair = {grams: number; at: number};
export type Crossing = {since: number | null; lastAt: number | null; sustained: boolean};

const NO_CROSSING: Crossing = {since: null, lastAt: null, sustained: false};

const usable = (reading: Reading): boolean =>
    Number.isFinite(reading.grams) && reading.grams >= 0 && Number.isFinite(reading.at);

/**
 * Water still in the dripper: the water poured minus the cup's reading, taken
 * at one instant. `null` means nobody can say, never zero. Absorption by the
 * coffee bed is deliberately not corrected for.
 */
export function pairedRetained(
    water: Reading | undefined,
    cup: Reading | undefined,
    now: number
): RetainedPair | null {
    if (!water || !cup || !Number.isFinite(now)) return null;
    if (!usable(water) || !usable(cup)) return null;
    for (const at of [water.at, cup.at]) {
        const age = now - at;
        if (!Number.isFinite(age) || age < 0 || age > OVERFLOW_READING_MAX_AGE_MS) return null;
    }
    const skew = Math.abs(water.at - cup.at);
    if (!Number.isFinite(skew) || skew > OVERFLOW_PAIR_MAX_SKEW_MS) return null;
    const grams = water.grams - cup.grams;
    if (!Number.isFinite(grams)) return null;
    return {grams: Math.max(0, grams), at: Math.min(water.at, cup.at)};
}

/**
 * Advances a debounce span by one retained pair. A hit is `>= limit` for
 * "above" and `< limit` for "below"; anything else, including an unusable pair
 * or limit, resets the span (fail closed).
 *
 * A pair no newer than `lastAt` is ignored before it is compared with the
 * limit: polling one sample, or replaying an older one, can neither extend nor
 * break the span. The state's `since`/`lastAt` are trusted only as a valid
 * ordered pair; otherwise it counts as no evidence.
 *
 * Caller responsibility: the controller must reset (pass `null`) on stale
 * readings, on phase changes and backgrounding, and on observed data gaps. A
 * long gap between two distinct, valid samples is treated as continuous.
 */
export function crossingAt(
    since: number | null,
    lastAt: number | null,
    pair: RetainedPair | null,
    limit: number,
    direction: "above" | "below"
): Crossing {
    if (!Number.isFinite(limit) || limit < 0) return NO_CROSSING;
    if (!pair || !usable(pair)) return NO_CROSSING;

    const spanValid = since !== null && lastAt !== null
        && Number.isFinite(since) && Number.isFinite(lastAt) && since <= lastAt;
    const start = spanValid ? since : null;

    if (spanValid && pair.at <= lastAt) {
        const held = lastAt - since;
        if (!Number.isFinite(held)) return NO_CROSSING;
        return {since, lastAt, sustained: held >= OVERFLOW_CROSSING_MS};
    }

    const hit = direction === "above" ? pair.grams >= limit : pair.grams < limit;
    if (!hit) return NO_CROSSING;

    const from = start ?? pair.at;
    const span = pair.at - from;
    if (!Number.isFinite(span)) return NO_CROSSING;
    return {since: from, lastAt: pair.at, sustained: span >= OVERFLOW_CROSSING_MS};
}

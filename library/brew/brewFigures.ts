import {formatBrewClock} from "@/library/brew/brewFormat";

/**
 * How long it took and what landed in the cup, as one line.
 *
 * The figures a recipe cannot claim. A recipe name does not identify a brew
 * when the same recipe was made three times this week, so anywhere the app has
 * to say which cup it means, it says this and puts the name second.
 *
 * Timed from the first drop where one was recorded, falling back to the start
 * for a row written before `pouringAt` existed. That fallback is a display
 * convenience and nothing aggregates on it, which is why `TIMED_SQL` refuses
 * the same rows this function still draws.
 */
export function brewFigures(brew: {
    startedAt: number;
    pouringAt?: number | null;
    endedAt: number;
    cupTotal: number;
}): string {
    const from = brew.pouringAt !== undefined && brew.pouringAt !== null
        && brew.pouringAt > 0
        ? brew.pouringAt
        : brew.startedAt;
    return `${formatBrewClock((brew.endedAt - from) / 1000)} · ${Math.round(brew.cupTotal)} G`;
}

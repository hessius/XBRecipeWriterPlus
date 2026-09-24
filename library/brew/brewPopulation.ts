import type {BrewOutcome} from "./BrewRecord";

/**
 * Outcomes that are evidence of a cup.
 *
 * A clean `done` brew plainly counts. `endedOnMachine` counts too: the machine
 * said the brew completed, and the shortfall is the user's deliberate stop or
 * adjustment at the brewer rather than the app losing the event. The other
 * outcomes are rows worth keeping in history, but they are not cups and must
 * not inflate a recipe's evidence line.
 */
export const COUNTED_OUTCOMES: readonly BrewOutcome[] = ["done", "endedOnMachine"];

const quotedCountedOutcomes = COUNTED_OUTCOMES
    .map((outcome) => `'${outcome}'`)
    .join(", ");

/**
 * SQL boolean expressions over `brews`.
 *
 * They are fragments rather than statements so aggregate queries can splice
 * several populations out of one scan. They deliberately compose from the
 * counted population: a hand-logged brew is a real cup and rating, so it counts
 * and may be rated, but it carries no measured water or time. Averaging its
 * zeroes into measured figures would drag every recipe's mean toward nought.
 * A row with no first-drop timestamp may still have measured cup figures,
 * while timing it from `startedAt` would average a display fallback rather than
 * an observation. Ratings stay on the counted population too: the evidence
 * line prints the average beside the count, and two figures drawn from
 * different sets would quietly lie about each other.
 */
export const COUNTED_SQL = `(outcome IN (${quotedCountedOutcomes}))`;
export const MEASURED_SQL = `(${COUNTED_SQL} AND watched = 1)`;
export const TIMED_SQL = `(${MEASURED_SQL} AND pouringAt > 0)`;
export const RATED_SQL = `(${COUNTED_SQL} AND rating > 0)`;

type CountedFields = {
    /** Raw SQLite rows hydrate `outcome` from TEXT before it is narrowed. */
    outcome: string;
};

type MeasuredFields = CountedFields & {
    watched?: boolean | number | null;
};

type TimedFields = MeasuredFields & {
    pouringAt?: number | null;
};

type RatedFields = CountedFields & {
    rating?: number | null;
};

/**
 * Whether the row is evidence that the recipe produced a cup.
 *
 * History keeps every outcome, but recipe evidence starts here: only a normal
 * completion and a machine-ended completion answer "how many times was this
 * recipe brewed?" with a cup the user could drink.
 */
export function countsAsBrewed({outcome}: CountedFields): boolean {
    return COUNTED_OUTCOMES.includes(outcome as BrewOutcome);
}

/**
 * Whether this row carries observed machine figures.
 *
 * `watched` is the one optional field whose absence means yes: rows written
 * before hand logging existed were all watched by the app, and the SQLite
 * column's default is 1 for the same reason. That is intentionally unlike
 * `pouringAt` and `rating`, where absence reads as the stored zero sentinel.
 */
export function isMeasured(fields: MeasuredFields): boolean {
    return countsAsBrewed(fields)
        && (fields.watched === undefined
            || fields.watched === true
            || fields.watched === 1);
}

/**
 * Whether this row can contribute a duration.
 *
 * A measured brew with `pouringAt` missing or 0 still says something about cup
 * volume. It says nothing about time: display code may fall back to
 * `startedAt`, but an aggregate cannot turn that fallback into an observation.
 */
export function isTimed(fields: TimedFields): boolean {
    return isMeasured(fields)
        && typeof fields.pouringAt === "number"
        && fields.pouringAt > 0;
}

/**
 * Whether this row can contribute to the rating average.
 *
 * A cancelled brew can carry a number in the column after a bad call site or a
 * restore, but the recipe card prints average rating beside counted brews. A
 * verdict on a non-cup must not move the average next to a count it did not
 * join.
 */
export function isRated(fields: RatedFields): boolean {
    return countsAsBrewed(fields)
        && typeof fields.rating === "number"
        && fields.rating > 0;
}

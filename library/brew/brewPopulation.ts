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
 * and may be rated, but it carries no measured water or time. A row with no
 * first-drop timestamp may still have measured cup figures, while timing it
 * from `startedAt` would average a display fallback rather than an observation.
 */
export const COUNTED_SQL = `(outcome IN (${quotedCountedOutcomes}))`;
export const MEASURED_SQL = `(${COUNTED_SQL} AND watched = 1)`;
export const TIMED_SQL = `(${MEASURED_SQL} AND pouringAt > 0)`;
export const RATED_SQL = `(${COUNTED_SQL} AND rating > 0)`;

type CountedFields = {
    outcome: BrewOutcome | string;
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

export function countsAsBrewed({outcome}: CountedFields): boolean {
    return COUNTED_OUTCOMES.includes(outcome as BrewOutcome);
}

export function isMeasured(fields: MeasuredFields): boolean {
    return countsAsBrewed(fields)
        && (fields.watched === undefined
            || fields.watched === true
            || fields.watched === 1);
}

export function isTimed(fields: TimedFields): boolean {
    return isMeasured(fields)
        && typeof fields.pouringAt === "number"
        && fields.pouringAt > 0;
}

export function isRated(fields: RatedFields): boolean {
    return countsAsBrewed(fields)
        && typeof fields.rating === "number"
        && fields.rating > 0;
}

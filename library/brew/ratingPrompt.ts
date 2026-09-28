import {isMeasured} from "@/library/brew/brewPopulation";
import type {StoredBrew} from "@/library/BrewDatabase";

/**
 * How long a brew is still worth asking about.
 *
 * Sixteen hours: long enough that a brew made at breakfast is still asked
 * about in the evening, short enough that yesterday's is not. A question that
 * outlives the memory of the cup is a question nobody can answer.
 */
export const RATING_PROMPT_WINDOW_MS = 16 * 60 * 60 * 1000;

export type RatingPromptInput = {
    /** The most recent brew the app watched, whatever state it is in. */
    brew: StoredBrew | null;
    now: number;
    /** The id whose question was already dismissed. Empty when none was. */
    dismissedId: string;
    /** The user's `askForRatings` preference. */
    enabled: boolean;
};

/**
 * The brew worth asking about, if there is one.
 *
 * Given the most recent watched brew rather than a filtered candidate, so that
 * "only the most recent brew is ever asked about" is a property of this
 * function rather than of a query somewhere else. A recent brew that was
 * already rated therefore ends the matter: it does not fall through to an
 * older unrated one, and that is the intended behaviour, not an omission. What
 * is being fixed is a badly timed question, not a backlog of unanswered ones.
 */
export function brewToRate(input: RatingPromptInput): StoredBrew | null {
    const {brew, now, dismissedId, enabled} = input;
    if (!enabled || brew === null) return null;
    // `isMeasured` is countable and watched together: a refusal before anything
    // was sent writes no row at all, a cancelled brew is history but not a cup,
    // and a hand-logged row was rated at the moment somebody created it.
    if (!isMeasured(brew)) return null;
    if ((brew.rating ?? 0) > 0) return null;
    if (brew.id === dismissedId) return null;
    // A row that claims the future is a clock that moved, not a brew that has
    // not happened. Asking about it would leave the question up for sixteen
    // hours past whenever the clock settles.
    if (brew.endedAt > now) return null;
    if (now - brew.endedAt >= RATING_PROMPT_WINDOW_MS) return null;
    return brew;
}

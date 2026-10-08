/**
 * When to demonstrate the swipe trays, and when to stop.
 *
 * Pure arithmetic over a small record so the whole cadence can be read as one
 * truth table. The state lives in the settings database and the stagger lives
 * in `constants/motion.ts`; neither belongs here.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** At most one demonstration every three days. */
export const DRAWER_HINT_INTERVAL_MS = 3 * DAY_MS;

/**
 * Manual opens after which the hint retires.
 *
 * Somebody who has opened a tray by hand three times has learned the gesture,
 * and a demonstration is then just a thing their list does without being asked.
 */
export const DRAWER_HINT_MANUAL_CAP = 3;

/**
 * Appearances after which the hint retires regardless.
 *
 * Six demonstrations is a fair attempt. Somebody who has not taken it by then
 * is not going to, and continuing reads as nagging.
 */
export const DRAWER_HINT_SHOWN_CAP = 6;

/** Absence after which the app assumes the trays have been forgotten. */
export const DRAWER_HINT_DORMANCY_MS = 60 * DAY_MS;

/**
 * What the trays currently offer.
 *
 * A change here re-arms the hint, because a tray whose contents changed is
 * genuinely a new thing to learn. A test in
 * `components/__tests__/SwipeableRecipeRow.test.tsx` asserts the rendered tiles
 * match this list, so the two cannot drift: add an action without updating this
 * and that test fails.
 */
export const DRAWER_ACTIONS = [
    "brew", "share", "write",
    "copy", "delete", "favourite"
] as const;

export const DRAWER_ACTION_SIGNATURE = DRAWER_ACTIONS.join(",");

export type DrawerHintState = {
    /** Epoch ms of the last demonstration. 0 means it has never run. */
    lastShownAt: number;
    shownCount: number;
    manualOpens: number;
    /** The tray signature in force when these counters were last meaningful. */
    signature: string;
    /** Epoch ms the app was last opened, which is how dormancy is measured. */
    lastSeenAt: number;
};

/**
 * Clear the counters if the lesson has become worth giving again.
 *
 * Separate from `shouldShowDrawerHint` because re-arming *writes* and deciding
 * does not, and a decision that quietly rewrote its own inputs would be very
 * hard to reason about at the call site.
 */
export function rearmDrawerHint(
    state: DrawerHintState, now: number, signature: string
): DrawerHintState {
    const changed = state.signature !== signature;
    const dormant = now - state.lastSeenAt >= DRAWER_HINT_DORMANCY_MS;
    if (!changed && !dormant) return state;

    return {
        lastShownAt: 0,
        shownCount:  0,
        manualOpens: 0,
        signature,
        lastSeenAt:  now
    };
}

/** Whether to demonstrate now. Assumes `rearmDrawerHint` has already run. */
export function shouldShowDrawerHint(state: DrawerHintState, now: number): boolean {
    if (state.manualOpens >= DRAWER_HINT_MANUAL_CAP) return false;
    if (state.shownCount >= DRAWER_HINT_SHOWN_CAP) return false;
    if (state.lastShownAt === 0) return true;
    return now - state.lastShownAt >= DRAWER_HINT_INTERVAL_MS;
}

export function noteHintShown(state: DrawerHintState, now: number): DrawerHintState {
    return {...state, shownCount: state.shownCount + 1, lastShownAt: now};
}

/**
 * Count a tray the user opened themselves.
 *
 * Stops counting at the cap so the number cannot run away on somebody who uses
 * the trays constantly, which would make the stored value meaningless if the
 * cap were ever raised.
 */
export function noteManualOpen(state: DrawerHintState): DrawerHintState {
    if (state.manualOpens >= DRAWER_HINT_MANUAL_CAP) return state;
    return {...state, manualOpens: state.manualOpens + 1};
}

import type {GlyphKind} from "@/components/PourGlyph";
import {AGITATION} from "@/library/Pour";

/** What each phase says. The wording is the feature. */
export const PHASE_COPY: Record<string, string> = {
    idle:        "Ready when you are.",
    /**
     * Commanded, but the machine has not moved yet.
     *
     * Not a phase — there is no `{name: "connecting"}` in `BrewPhase`. It is
     * the copy the brew screen substitutes for `idle` when a run has been
     * asked for, because "Ready when you are." claimed the run was finished at
     * the exact moment it had not begun. Task 14 does the substituting.
     */
    connecting:  "Connecting to the machine…",
    // The machine loses the question rather than refusing it, and each retry
    // opens a fresh session, which beeps. Saying so explains the beeping.
    waking:      "Waiting for the machine to answer…",
    // Deliberately slow: the frames are spaced two seconds apart, because the
    // machine drops a burst. Saying so stops this reading as a hang.
    sending:     "Sending the recipe… this takes a few seconds.",
    readyToStart: "Recipe loaded. Ready when you are.",
    armed:       "Recipe loaded.",
    // The app never sends 40518, so this is where a parked machine ends up.
    // A notice, not a button: the normal path is START in the app, and this
    // one used to look pressable while doing nothing.
    pressPlay:   "PRESS ▶ ON THE MACHINE",
    grinding:    "Grinding…",
    done:        "Enjoy.",
    cancelled:   "Stopped.",
    lostContact: "Lost contact. The machine is still brewing."
};

export const FAILURE_COPY: Record<string, string> = {
    // The machine stopped mid-brew. Rare, and not the same event as a refusal:
    // this one costs a dose.
    noWater:      "The machine ran out of water.",
    noBeans:      "The machine stopped during grinding. Check there are beans in the hopper.",
    gearPosition: "The grinder could not find its gear position.",
    doseMismatch: "The machine would not accept that dose and water volume.",
    idling:       "The machine went idle before the brew started.",
    rejected:     "The machine would not take the recipe."
};

/**
 * The refusal, which is the common one.
 *
 * Almost daily, where the machine stopping mid-brew has happened twice. The
 * volume is the recipe's own total, not a constant, and the last clause is the
 * point of the whole message: it tells the user their dose is safe.
 */
export function blockedWaterCopy(totalMl: number): string {
    return `The tank will not cover this recipe's ${totalMl} ml. `
        + "Fill it and try again. No recipe was sent. Your dose is still in the hopper.";
}

export const BLOCKED_WATER_HEADLINE = "NOT ENOUGH WATER FOR THIS BREW";

/**
 * The headline for each kind of pre-flight refusal.
 *
 * Water is the one that happens almost daily and gets the sentence that names
 * the recipe's own volume; the rest are rarer but must not borrow its copy,
 * because "not enough water" is a specific instruction to go and fill the tank
 * and it is wrong for a machine that is simply busy.
 */
export const BLOCKED_HEADLINE: Record<string, string> = {
    notEnoughWater: BLOCKED_WATER_HEADLINE,
    notConnected:   "THE MACHINE IS NOT CONNECTED",
    noVitals:       "THE MACHINE HAS NOT ANSWERED YET",
    noWater:        "THE MACHINE'S TANK IS EMPTY",
    noBeans:        "THE HOPPER IS EMPTY",
    busy:           "THE MACHINE IS BUSY",
    recipe:         "THIS RECIPE WILL NOT GO ON A CARD"
};

/**
 * Said once, on a user's first brew, and never again.
 *
 * None of it is detectable — the machine cannot tell us whether a cup is under
 * the spout, whether the pod is loaded, or whether the beans in the hopper are
 * the ones the recipe was written for. So it is stated rather than checked, and
 * stating it every time would train people to stop reading it.
 */
export const FIRST_BREW_REMINDER =
    "Check there is a cup under the spout and a pod in the holder.";

/** The offer to escape EASY mode, when a send has gone nowhere because of it. */
export const PRO_MODE_PROMPT =
    "Your machine is in Easy mode. Switch it to Pro and try again?";

/** The phases during which stopping the machine is still a meaningful thing. */
export const RUNNING = new Set([
    "waking", "sending", "readyToStart", "armed", "pressPlay", "grinding", "pouring"
]);

/** The phases a brew can end in: nothing more will arrive from the machine. */
export const OVER: ReadonlySet<string> = new Set([
    "done", "cancelled", "failed", "lostContact"
]);

/**
 * Failures after which TRY AGAIN would be a lie about what one press costs.
 *
 * The dose is ground and the water is spent. Offering a retry here would read
 * as "this one is free".
 */
export const NO_RETRY: ReadonlySet<string> = new Set(["noWater"]);

/**
 * The mid-brew failures in three or four words, for the bar.
 *
 * `FAILURE_COPY` above is a sentence, which is right on the brew screen and
 * too long for a bar that has one line. Every mid-brew reason needs an entry:
 * without one they all fell through to "lost contact", which named the wrong
 * event and sent people looking at their Bluetooth.
 */
export const MINI_FAILURE_WHY: Record<string, string> = {
    noWater:      "no water",
    noBeans:      "no beans",
    gearPosition: "the grinder jammed",
    doseMismatch: "the dose was refused",
    idling:       "it went idle",
    rejected:     "the recipe was refused"
};

/**
 * What each pour pattern is doing, in one clause.
 *
 * The brew screen used to list all four of these at once, whether or not the
 * stage in front of the user was any of them. It names the live one instead.
 */
export const PATTERN_SENTENCE: Record<GlyphKind, string> = {
    centered: "Straight down onto the middle of the bed",
    circular: "Round the bed in a steady ring",
    spiral: "Out from the centre and back",
    /**
     * Unreachable through `glyphForPattern`, which only ever returns the three
     * above -- agitation is a separate field on the pour, not a pattern, and
     * only `StageTile` ever asks for this glyph by name. The key stays so the
     * table is total over `GlyphKind` and an index can never come back
     * undefined and print "POURING · undefined · 92°".
     */
    agitation: "It stirs the bed rather than pouring"
};

/**
 * The stirring, which the pour pattern cannot tell you about.
 *
 * `Pour.agitation` is its own field with its own four values, so a stage that
 * both spirals and stirs was described only as a spiral. Keyed by
 * `AGITATION.*`; `ALL_OFF` is deliberately absent, because saying nothing is
 * the right thing to say about a stage that does not stir.
 */
export const AGITATION_SENTENCE: Record<number, string> = {
    [AGITATION.BEFORE_ON_AFTER_OFF]: "It stirs the bed first.",
    [AGITATION.BEFORE_OFF_AFTER_ON]: "It stirs the bed afterwards.",
    [AGITATION.BEFORE_ON_AFTER_ON]:  "It stirs the bed before and after."
};

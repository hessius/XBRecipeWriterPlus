import type {GlyphKind} from "@/components/PourGlyph";
import {ACTIVE_BREW_PHASE_NAMES} from "@/library/machine/Machine";
import {AGITATION} from "@/library/Pour";
import {
    PLAN_STAGE_COUNT_FIELD,
    type PlanDrift,
    type PlanStageField,
    type PourVerdict
} from "@/library/brew/compare";

/** What each phase says. The wording is the feature. */
export const PHASE_COPY: Record<string, string> = {
    idle:        "Preparing recipe.",
    /**
     * Commanded, but the machine has not moved yet.
     *
     * Not a phase — there is no `{name: "connecting"}` in `BrewPhase`. It is
     * the copy the brew screen substitutes for `idle` when a run has been
     * asked for, because "Ready when you are." claimed the run was finished at
     * the exact moment it had not begun. `app/brew.tsx` does the substituting.
     */
    connecting:  "Connecting to the machine…",
    // The machine loses the question rather than refusing it, and each retry
    // opens a fresh session, which beeps. Saying so explains the beeping.
    waking:      "Waking up machine…",
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
    // After the last stage. The machine waits for the dripper to finish before
    // it dispenses, and that wait is not a fault — the copy has to say so, or
    // a legitimate minute of silence reads as a hang.
    bypass:      "Adding bypass water…",
    // Water is done, but coffee is still dripping from the brewer onto the
    // scale. The brew is not over until that drawdown stops, so this is a
    // distinct, non-terminal status between the last pour and "Enjoy."
    //
    // Named for what it is. "Draining" was a plumbing word for a thing that
    // has a coffee name and a purpose: drawdown is not the brew running down,
    // it is part of the brew, and how long it takes is one of the figures a
    // person dials a recipe in by.
    settling:    "Drawdown…",
    done:        "Enjoy.",
    // Every other ending here is a sentence saying what happened --
    // "The machine ran out of water.", "Lost contact. …". This one said
    // only "Stopped.", so the mini bar's "Stopped: you stopped it" was
    // explaining more than the full screen it stands in for.
    cancelled:   "You stopped the brew.",
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
    rejected:     "The machine would not take the recipe.",
    // Deliberately says only what was seen. The machine goes back to its
    // loaded screen and sends no fault, so a cause here would be a guess: the
    // field report was a tank two grams short, but somebody reaching over and
    // stopping it looks identical from the radio.
    stopped:      "The machine stopped the brew before it finished."
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
    "Check that there is a cup under the spout and a pod or brewer in the holder.";

/** The offer to escape EASY mode, when a send has gone nowhere because of it. */
export const PRO_MODE_PROMPT =
    "Your machine is in Easy mode. Switch it to Pro and try again?";

/**
 * The note shown on a brew the machine finished well short of its plan.
 *
 * It states what was observed and nothing more. A mid-brew ratio or dose
 * change is not observable over BLE — no event carries it, no characteristic
 * exposes it, and the pour-start frames give only an index — so naming a cause
 * would be a guess dressed as a reading.
 */
export const ENDED_ON_MACHINE_NOTE = "ENDED ON THE MACHINE";

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
export const NO_RETRY: ReadonlySet<string> = new Set(["noWater", "stopped"]);

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
    rejected:     "the recipe was refused",
    stopped:      "the machine stopped"
};

/**
 * What each pour pattern is doing, in one clause.
 *
 * The brew screen used to list all four of these at once, whether or not the
 * stage in front of the user was any of them. It names the live one instead.
 */
export const PATTERN_SENTENCE: Record<GlyphKind, string> = {
    centered: "Centre pour",
    circular: "Circular pour",
    spiral: "Spiral pour",
    /**
     * Unreachable through `glyphForPattern`, which only ever returns the three
     * above -- agitation is a separate field on the pour, not a pattern, and
     * only `StageTile` ever asks for this glyph by name. The key stays so the
     * table is total over `GlyphKind` and an index can never come back
     * undefined and print "POURING · undefined · 92°".
     */
    agitation: "Agitates the bed by shaking it slightly"
};

/**
 * The stage detail panel on a recorded brew — the chrome labels above each
 * part of the story. Doto, so uppercase and terminal-full-stop-free.
 *
 * Kept apart from the prose below because these name what a value *is* (a
 * machine label) where the prose *says* what happened (Inter). Splitting them
 * is the two-register rule `DotMatrixText` exists to enforce.
 */
export const STAGE_DETAIL_LABEL = {
    askedFor:  "ASKED FOR",
    delivered: "DELIVERED",
    held:      "HELD",
    when:      "WHEN"
} as const;

/** The Doto note on a stage that landed short. `${shortfall}` is whole ml. */
export function stageShortLine(shortfallMl: number): string {
    return `STOPPED ${shortfallMl} ML SHORT`;
}

/**
 * Why a stage came in short, said once the figure above has shown by how much.
 *
 * A cancelled brew is short because somebody stopped it, which is a different
 * fact from a stage the machine under-delivered on its own, and the two must
 * not borrow each other's sentence.
 */
export const STAGE_SHORT_CANCELLED =
    "The brew was stopped before this stage finished.";
export const STAGE_SHORT_UNDERDELIVERED =
    "It delivered less water than the plan asked for.";

/** The stage met its planned volume. */
export const STAGE_POURED_IN_FULL = "It poured in full.";

/** No stall in the stage: the water never stood still while it owed millilitres. */
export const STAGE_NO_HOLD = "The water never stopped moving.";

/**
 * Said when the stream was swept by the retention setting.
 *
 * What the stage delivered and where it held live on the record itself and
 * survive the sweep; only the second-by-second timing is gone. So the panel
 * names exactly the missing part rather than printing zeros that would read as
 * "it started and ended at the first drop".
 */
export const STAGE_TIMING_UNAVAILABLE =
    "Detailed timing wasn't kept for this brew.";

/**
 * The stirring, which the pour pattern cannot tell you about.
 *
 * `Pour.agitation` is its own field with its own four values, so a stage that
 * both spirals and stirs was described only as a spiral. Keyed by
 * `AGITATION.*`; `ALL_OFF` is deliberately absent, because saying nothing is
 * the right thing to say about a stage that does not stir.
 */
export const AGITATION_SENTENCE: Record<number, string> = {
    [AGITATION.BEFORE_ON_AFTER_OFF]: "Agitates the bed before pouring.",
    [AGITATION.BEFORE_OFF_AFTER_ON]: "Agitates the bed after pouring.",
    [AGITATION.BEFORE_ON_AFTER_ON]:  "Agitates the bed before and after pouring."
};

/**
 * The longest sentence a brew in progress can put in the headline.
 *
 * The headline sits beside the measured band region, so a phase whose copy
 * wraps to a second line takes that height out of the ladder and every rung
 * changes thickness in the middle of a brew, which is what the drawdown line
 * did at the end of every recipe when it was a full sentence. `app/brew.tsx`
 * reserves this while a brew is live.
 *
 * Derived from the phase table and the machine's own list of active phases, so
 * neither a longer sentence nor a new phase can be added without the reserve
 * growing with it. Terminal phases are deliberately excluded: their sentences
 * are longer, and by the time one is said a single reflow costs nothing.
 */
export const LONGEST_ACTIVE_HEADLINE = [...ACTIVE_BREW_PHASE_NAMES]
    .map((name) => PHASE_COPY[name] ?? "")
    .reduce((longest, copy) => (copy.length > longest.length ? copy : longest), "");

/**
 * The most a now-card can ever be asked to say.
 *
 * `BrewNowCard` renders this at `opacity: 0` to reserve its height, because
 * the card sits below the measured band region: a stage whose sentence wraps
 * to a third line steals that height from the ladder, and every rung in the
 * brew thins for the duration of that one stage.
 *
 * Derived from the tables rather than restated, so a longer sentence cannot be
 * added to one without the reserve growing with it. The rest is spelled with
 * three digits because that is the widest the byte format can carry.
 */
export const LONGEST_NOW_SENTENCE =
    `${PATTERN_SENTENCE.circular}, then it rests 000 s. `
    + AGITATION_SENTENCE[AGITATION.BEFORE_ON_AFTER_ON];

/**
 * What the comparison screen says about the two pours.
 *
 * `tone` names a palette entry rather than holding a colour, because colour
 * lives in `constants/colors.ts` and a hex here would be outside it.
 *
 * Only `same` is a success. The other readings are amber rather than red:
 * none of them is a fault, they are all just reasons the water channel cannot
 * carry the comparison, and a red chip on a perfectly good pair of brews would
 * send somebody looking for a problem that is not there.
 */
export const COMPARE_COPY: Record<
    PourVerdict,
    {chip: string; tone: "success" | "warn"}
> = {
    same:       {chip: "POURED THE SAME", tone: "success"},
    stalled:    {chip: "ONE STALLED",     tone: "warn"},
    differed:   {chip: "THEY DIFFERED",   tone: "warn"},
    incomplete: {chip: "ONE DID NOT FINISH", tone: "warn"},
    unwatched:  {chip: "ONE WAS LOGGED BY HAND", tone: "warn"}
};

/** What the screen says when it cannot draw one or both traces. */
export const COMPARE_DEGRADED = {
    /** One stream survived the retention sweep and the other did not. */
    one: "One of these brews has lost its trace to the retention sweep, so the"
        + " chart shows the other alone. Pin a brew to keep its trace.",
    /** Neither did. The chart is not drawn at all. */
    both: "Both of these brews have lost their traces to the retention sweep."
        + " The figures below are all that remain."
};

export const COMPARE_GUARD = {
    missing: {
        title: "BREW NOT FOUND",
        body: "One of these brews is no longer here."
    },
    same: {
        title: "SAME BREW",
        body: "Choose two different brews to compare. One brew can only repeat itself."
    },
    recipe: {
        title: "DIFFERENT RECIPES",
        body: "Choose two brews of the same recipe. Cross recipe comparison has no shared plan."
    }
} as const;

export const COMPARE_SELECTION_COPY = {
    notComparable: "These brews are of different recipes, so there is nothing to compare."
} as const;

export const COMPARE_PINNED = "Trace pinned";

export const PLAN_FIELD_WORD: Record<PlanStageField, string> = {
    pourNumber: "stage number",
    volume: "volume",
    temperature: "temperature",
    flowRate: "flow rate",
    agitation: "agitation",
    pourPattern: "pour pattern",
    pauseTime: "rest time",
    [PLAN_STAGE_COUNT_FIELD]: "stage count"
};

function sentenceList(words: string[]): string {
    if (words.length <= 1) return words[0] ?? "";
    if (words.length === 2) return `${words[0]} and ${words[1]}`;
    return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

export function compareDriftSentence(
    grade: Exclude<PlanDrift, "none">,
    fields: PlanStageField[]
): string {
    if (fields.includes(PLAN_STAGE_COUNT_FIELD)) {
        return "The plans have different numbers of stages. Read the chart with care.";
    }
    const words = sentenceList(fields.map((field) => PLAN_FIELD_WORD[field]));
    if (grade === "shape") {
        return `The plan shapes differ in ${words}. Read the chart with care.`;
    }
    return `The plans differ in ${words}, but the chart shape is the same.`;
}

/**
 * The line under the stars on the finished brew screen.
 *
 * The screen asks at the moment the machine stops, which is the moment the user
 * has least to say: the cup is under the spout and has not been tasted. The
 * control stays because somebody who does have an opinion should not have to
 * go looking for a history screen to give it. This line is what makes walking
 * away a choice rather than a loss.
 */
export const RATING_CAN_WAIT = "No rush. You can rate it later.";

/** Drawn on the rating bar's second row, after the recipe name. */
export const RATING_PROMPT_QUESTION = "HOW WAS IT";

/**
 * The accessibility label for the rating bar's left hand tap target, which
 * opens the brew record.
 */
export const RATING_PROMPT_OPEN_LABEL = "Open the last brew";

/**
 * The accessibility label for the rating bar's close control.
 *
 * Not visible text: the control is an icon.
 */
export const RATING_PROMPT_DISMISS_LABEL = "Not now";

/** The title of the rating sheet that opens behind a star. */
export const RATING_SHEET_TITLE = "How was it?";

/** Visible text on the rating sheet's confirm control. */
export const RATING_SHEET_DONE = "DONE";

/**
 * What the Beanconqueror door says once a brew has gone over.
 *
 * Phrased as what this app did rather than what the other app received:
 * opening a deep link proves nothing about installation, understanding or the
 * user cancelling out of it. The second sentence is the honest description of
 * an envelope with no brew id in it, which is why the button is never disabled.
 * It stays conditional because the first envelope may not have reached
 * Beanconqueror at all.
 */
export function HANDOFF_ALREADY_SENT(when: string): string {
    return `Sent ${when}. Sending again will add another brew rather than update the one you sent.`;
}

/**
 * What the editor's fields mean.
 *
 * The long text here was carried over from the tooltips it replaces. Some of it
 * — the grinder-off workaround in particular — describes machine behaviour that
 * is documented nowhere else, in this app or outside it, and was learned the
 * hard way. Do not shorten it without knowing what you are throwing away.
 *
 * Data rather than JSX so that both help deliveries render the same words, and
 * so the copy can be read as prose when it is being edited.
 */

export type HelpEntry = {
    /** The field's own label. */
    title: string;
    /**
     * The short note under the label, where the screen has room for it.
     *
     * Optional, because a field can be self-explanatory: `dose` is a weight in
     * grams next to the word "Dose", and a note under it said nothing the label
     * had not. A hint that restates its label is worse than no hint, since it
     * teaches the reader that the notes are not worth reading.
     */
    hint?: string;
    /**
     * How the help sheet heads the long form.
     *
     * A question rather than the field's name, because the sheet is read by
     * someone who has one -- they are scanning for the thing they wanted to
     * know, not for a glossary entry they already found on the screen. Required
     * wherever there is a `detail` for it to head; `DETAILED_TOPICS` is what
     * enforces that.
     */
    question?: string;
    /** The long form. Undefined means the hint is the whole story. */
    detail?: string;
};

const ENTRIES = {
    dose: {
        title: "Dose"
    },
    ratio: {
        title:  "Ratio",
        hint:   "Whole numbers only. Sets the target volume.",
        question: "What does the ratio set?",
        detail: "The target volume is the dose multiplied by the ratio. The " +
                "stage volumes have to add up to it exactly or the machine " +
                "will refuse the card. Half ratios cannot be stored on a card."
    },
    grindSize: {
        title: "Grind size",
        hint:  "40 to 80. Lower is finer."
    },
    grindSpeed: {
        title: "Grind speed",
        hint:  "60 to 120 rpm, in tens."
    },
    grinder: {
        title:  "Grinder",
        hint:   "Turning it off is experimental.",
        question: "Can I turn the grinder off?",
        detail: "Turning the grinder off writes grind size 81, one past the " +
                "maximum, and the machine will refuse a card in that state " +
                "outright. The workaround is to load any other recipe with the " +
                "grinder enabled first — a shortcut button, another card, or " +
                "the xBloom app — after " +
                "which this card will be accepted and the machine will show " +
                "'--' for the grind size. There is no better way to disable " +
                "the grinder from a recipe card."
    },
    cup: {
        title:  "Cup",
        hint:   "Omni turns overflow protection off.",
        question: "Which cup type should I pick?",
        detail: "Omni disables overflow protection. Other is for " +
                "third-party brewers."
    },
    xid: {
        title:  "Recipe ID",
        hint:   "xBloom online lookup ID. Without one, a written card reads " +
                "back nameless (but works the same).",
        question: "What is the recipe ID for?",
        detail: "The recipe ID is how the app finds a recipe online. It is a " +
                "three-letter vendor code, an optional T for tea, then two or " +
                "three digits — CGL12, CGLT123. The card stores this ID and " +
                "not the name, so a card written without one will read back " +
                "nameless. Changing or clearing it stops the wrong recipe " +
                "being shown in the app; the machine brews the same either way."
    },
    name: {
        title: "Name",
        hint:  "For your own organization in this app. The xBloom name is " +
               "kept separate, derived from the XID."
    },
    volume: {
        title:  "Stage volume",
        hint:   "All stages together must equal the target.",
        question: "Why must the stage volumes add up?",
        detail: "The machine checks the stage volumes against the dose times " +
                "the ratio and refuses the card if they differ. Auto fix " +
                "rescales every stage to close the gap and spreads the " +
                "rounding error across the stages it fits worst. Manually " +
                "assigning volumes to stages is recommended. Changing the " +
                "dose or the ratio moves the target instead of the stages, " +
                "which is also often a better fix."
    },
    temperature: {
        title: "Temperature",
        hint:  "39 to 99 °C, or 102 to 210 °F."
    },
    flowRate: {
        title: "Flow rate",
        hint:  "3.0 to 3.5 ml per second."
    },
    pause: {
        title:  "Pause",
        hint:   "How long the machine waits once this stage has poured.",
        question: "Does the pause come before or after the pour?",
        detail: "The wait comes after the water, not before it: this is the " +
                "bloom on a first stage and the steep on a tea one, which is " +
                "why a coffee stage stops at 59 seconds and a tea steep goes " +
                "to 360."
    },
    pattern: {
        title:  "Pattern",
        hint:   "The path the water takes over the bed.",
        question: "What do the pour patterns do?",
        detail: "Centered holds the stream in one place. Circular walks it " +
                "round the bed at a fixed radius. Spiral works outward from " +
                "the middle."
    },
    agitation: {
        title:  "Agitation",
        hint:   "Shakes the basket, before this stage's pour or after it.",
        question: "What does agitation do?",
        detail: "Each stage can agitate, or shake the bed of coffee slightly " +
                "before it pours, after it pours, both or neither. Agitation " +
                "might provide a flatter, more evenly distributed bed of " +
                "coffee but might also contribute to fines migration and " +
                "slower drawdown."
    },
    tea: {
        title:  "Tea",
        hint:   "Steeps are capped at 90 ml.",
        question: "How is tea different?",
        detail: "A tea recipe shows 90 ml per steep, but roughly 30 ml more " +
                "than that reaches the cup: the machine adds it to trigger the " +
                "siphon, so a steep lands at about 120 ml. If the siphon " +
                "triggers early because the leaf has swollen, take volume off " +
                "the later steeps. Tea recipes are also limited to 3 steeps."
    }
} as const satisfies Record<string, HelpEntry>;

export type HelpTopic = keyof typeof ENTRIES;

/**
 * The copy, keyed by field.
 *
 * Declared through `ENTRIES` so the key union is exact while every value is a
 * plain `HelpEntry`. Exporting the `as const` object directly would give each
 * entry its own literal type, and `detail` would then not exist at all on the
 * entries that have no long form — so a consumer reading `entry.detail` to
 * decide whether to offer a "more" affordance would not compile.
 */
export const RECIPE_HELP: Record<HelpTopic, HelpEntry> = ENTRIES;

/**
 * An entry that has earned a place in the help sheet.
 *
 * Both halves or neither: a question with nothing under it is a heading, and a
 * paragraph with no question is something the reader has to identify for
 * themselves, which is the failure the sheet exists to fix.
 */
export type HelpQuestion = HelpEntry & {question: string; detail: string};

/** The topics with more to say, in the order the sheet asks them. */
export const DETAILED_TOPICS = (Object.keys(RECIPE_HELP) as HelpTopic[])
    .filter((topic) => RECIPE_HELP[topic].detail !== undefined);

/** The long form of one topic, if it has one. */
export function helpQuestion(topic: HelpTopic): HelpQuestion | undefined {
    const entry = RECIPE_HELP[topic];
    return entry.question !== undefined && entry.detail !== undefined
        ? {...entry, question: entry.question, detail: entry.detail}
        : undefined;
}

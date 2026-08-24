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
    /** Sheet heading, and the field's own label. */
    title: string;
    /** The one-line note under the label. Always shown, in both deliveries. */
    hint: string;
    /** The long form. Undefined means the hint is the whole story. */
    detail?: string;
};

const ENTRIES = {
    dose: {
        title: "Dose",
        hint:  "Coffee in the basket. Sets the target with the ratio."
    },
    ratio: {
        title:  "Ratio",
        hint:   "Whole numbers only. Sets the target volume.",
        detail: "The target volume is the dose multiplied by the ratio. The " +
                "stage volumes have to add up to it exactly or the machine " +
                "will refuse the card. Half ratios cannot be stored on a card."
    },
    grindSize: {
        title: "Grind size",
        hint:  "40 to 80. Lower is finer."
    },
    grindSpeed: {
        title:  "Grind speed",
        hint:   "60 to 120 rpm, in tens.",
        detail: "Only the first stage's speed is stored on the card, so this " +
                "is one setting for the whole recipe rather than one per stage."
    },
    grinder: {
        title:  "Grinder",
        hint:   "Turning it off is experimental.",
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
        detail: "XPod is the standard cup. Omni disables overflow protection, " +
                "which is what you want when the vessel is not the one the " +
                "machine expects. Other is for third-party brewers."
    },
    xid: {
        title:  "Recipe ID",
        hint:   "Without one, a written card reads back nameless.",
        detail: "The recipe ID is how the app finds a recipe online. It is a " +
                "three-letter vendor code, an optional T for tea, then two or " +
                "three digits — CGL12, CGLT123. The card stores this ID and " +
                "not the name, so a card written without one will read back " +
                "nameless. Changing or clearing it stops the wrong recipe " +
                "being shown in the app; the machine brews the same either way."
    },
    name: {
        title: "Name",
        hint:  "Yours. The xBloom name is kept separate and not overwritten."
    },
    volume: {
        title:  "Stage volume",
        hint:   "All stages together must equal the target.",
        detail: "The machine checks the stage volumes against the dose times " +
                "the ratio and refuses the card if they differ. Auto fix " +
                "rescales every stage to close the gap and spreads the " +
                "rounding error across the stages it fits worst. Changing the " +
                "dose or the ratio moves the target instead of the stages, " +
                "which is often the better fix."
    },
    temperature: {
        title: "Temperature",
        hint:  "39 to 99 °C."
    },
    flowRate: {
        title: "Flow rate",
        hint:  "3.0 to 3.5 ml per second."
    },
    pause: {
        title:  "Pause",
        hint:   "How long the machine waits once this stage has poured.",
        detail: "The wait comes after the water, not before it: this is the " +
                "bloom on a first stage and the steep on a tea one, which is " +
                "why a coffee stage stops at 59 seconds and a tea steep goes " +
                "to 360."
    },
    pattern: {
        title:  "Pattern",
        hint:   "The path the water takes over the bed.",
        detail: "Centered holds the stream in one place. Circular walks it " +
                "round the bed at a fixed radius. Spiral works outward from " +
                "the middle."
    },
    agitation: {
        title:  "Agitation",
        hint:   "Shakes the basket, before this stage's pour or after it.",
        detail: "Each stage can agitate before it pours, after it pours, both " +
                "or neither. Before settles the bed the last stage left; " +
                "after breaks up what this one has just built."
    },
    tea: {
        title:  "Tea",
        hint:   "Steeps are capped at 90 ml.",
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

/** The topics with more to say, in the order the sheet lists them. */
export const DETAILED_TOPICS = (Object.keys(RECIPE_HELP) as HelpTopic[])
    .filter((topic) => RECIPE_HELP[topic].detail !== undefined);

import {cupLineFor, palette} from "@/constants/colors";

/**
 * What the lines on a brew chart look like.
 *
 * Companion to `brewShape.ts`, which says where they go. The split matters
 * because two components draw these channels now: `BrewTrace` for one brew and
 * `CompareTrace` for two. A dash pattern that lives at its use site can be
 * retuned in one of them and not the other, and the two screens then disagree
 * about what dotted means.
 *
 * Same rule as `constants/colors.ts` and `constants/motion.ts`: a value that is
 * not in the module cannot take part when the thing is retuned.
 *
 * KEEP IN STEP WITH: `components/BrewTrace.tsx`, `components/CompareTrace.tsx`.
 */

export type Channel = "water" | "cup" | "plan";

/** Which of the two brews a line belongs to. Only `CompareTrace` sets this. */
export type Role = "subject" | "reference";

/**
 * The greys the reference brew borrows.
 *
 * Two different greys, and not interchangeable: the comparison screen is about
 * the cup, so the cup keeps the brighter one. Both clear the 3:1 floor for a
 * non-text graphic on `base`. The water grey collides with the plan stroke on
 * purpose; width and dashes separate those lines, not a third low-contrast grey.
 */
export const referenceCupColour = palette.dim;
export const referenceWaterColour = palette.muted;

/**
 * The attributes a channel's line carries.
 *
 * Deliberately closed, and deliberately without `fill` or `strokeOpacity`. Both
 * charts spread this **last** onto their `<Path>` elements so that a use site
 * cannot quietly override the grammar, which means any key added here silently
 * wins over the same attribute written at the site. `fill="none"` and the
 * animated `strokeOpacity` are set locally and must stay out of this type.
 */
export type ChannelStyle = {
    stroke: string;
    strokeWidth: number;
    strokeDasharray: string | undefined;
    strokeLinecap: "round" | undefined;
    strokeLinejoin: "round" | undefined;
};

export type ChannelInput = {
    accent: string;
    /** Overflow protection has stopped the water. Water only. */
    holding?: boolean;
    /** False once the recipe is in the machine and the plan's dashes fuse. */
    dashed?: boolean;
    /**
     * The plan line's colour, when a caller animates it.
     *
     * The live brew screen warms the plan from grey toward the accent as the
     * recipe lands in the machine, so unlike water and cup this channel's
     * colour is not a constant. It lives here rather than being overridden at
     * the use site because an override is exactly the drift this module
     * exists to prevent: `CompareTrace` would have no way to know the rule.
     */
    planColour?: string;
    role?: Role;
};

export function channelStyle(
    channel: Channel,
    {accent, holding = false, dashed = true, planColour, role = "subject"}: ChannelInput
): ChannelStyle {
    const reference = role === "reference";
    switch (channel) {
        case "water":
            return {
                // Reference water stays grey even if that brew was held; amber
                // was rejected because it reads as a live warning on the wrong brew.
                stroke: reference ? referenceWaterColour
                    : holding ? palette.warn : accent,
                strokeWidth:     2.5,
                strokeDasharray: undefined,
                strokeLinecap:   "round",
                strokeLinejoin:  "round"
            };
        case "cup":
            return {
                stroke:          reference ? referenceCupColour : cupLineFor(accent),
                strokeWidth:     2,
                strokeDasharray: "1 3",
                strokeLinecap:   "round",
                strokeLinejoin:  undefined
            };
        case "plan":
            return {
                // `planOpacity` is animation state, not drawing grammar, so it
                // stays with each chart rather than being shared here.
                stroke:          planColour ?? palette.muted,
                strokeWidth:     1.5,
                strokeDasharray: dashed ? "4 4" : undefined,
                strokeLinecap:   undefined,
                strokeLinejoin:  undefined
            };
    }
}

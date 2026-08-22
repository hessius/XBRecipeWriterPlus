/**
 * Single source of truth for every colour in the app.
 *
 * The app is dark-only, so there are no light/dark variants here. Colour lives
 * in a plain module rather than in Tamagui theme tokens because roughly half the
 * call sites are plain React Native, expo-router or SVG props that cannot accept
 * a `$token`, and Tamagui's theme proxy has no parent-theme fallback — a custom
 * key added to a theme would not resolve inside a sub-theme such as `dark_Button`.
 *
 * Add semantically named entries (`danger`, `surface`, `muted`), never literal
 * ones (`red`).
 */

/** The two halves of the accent palette. */
export type AccentGroup = "coffee" | "tea";

/** Surfaces, text and semantics. */
export const palette = {
    /** Screen background. `base` rather than `void`: `void` is a reserved word
     *  and cannot be shorthand-destructured. */
    base:    "#000000",
    /** Sheets and elevated panels. */
    surface: "#101010",
    /** CTA tiles, inputs, and cards that are not accent-filled. */
    raised:  "#161616",
    /** Hairlines and borders. */
    line:    "#262626",
    /**
     * Disabled controls and decorative marks.
     *
     * 4.12:1 on `base` — under AA, so this is not a text colour. It reads as the
     * obvious choice for a tertiary annotation and was used for the superscript
     * count until the measurement said otherwise; use `dim` for small text.
     */
    muted:   "#6E6E6E",
    /** Secondary text, including the superscript count. */
    dim:     "#A3A3A3",
    /** Primary text. */
    text:    "#FFFFFF",

    /** Confirmation, and the "reader ready" state. */
    success: "#5DDC8A",
    /** Destructive actions and validation errors. */
    danger:  "#FF6B5E",
    /** Recoverable problems and cautions. */
    warn:    "#F0C24A",
    /** Informational accents. */
    info:    "#7FB4FF"
} as const;

/**
 * Foregrounds drawn on top of an accent fill. Fixed rather than per-accent:
 * every accent is light enough to take the same dark ink.
 */
export const onAccent = {
    /** Recipe names and Doto values. */
    text:          "#0C0C0C",
    /**
     * Micro-labels above values.
     *
     * 0.65 rather than something lighter because these are 11 px: below that
     * alpha the label falls under 4.5:1 against the lighter accents, and it is
     * the only cue to what the number beneath it means. At 0.65 the darkest
     * pairing is 5.1:1.
     */
    label:         "rgba(0,0,0,0.65)",
    /**
     * Pour profile stroke.
     *
     * The profile is a watermark, so this alpha is doing the dimming that used
     * to be a group opacity on the wrapping view. A wrapper multiplied this
     * already-composited value, which put the rendered stroke at 2.72:1 on
     * Blossom while the colour suite measured the token at 8.46:1 and passed.
     * The floor for a non-text graphic is 3:1; 0.50 is the faintest value that
     * clears it on every accent, worst case 3.24:1 on Blossom.
     */
    profileStroke: "rgba(0,0,0,0.50)",
    /** Pour profile fill. Scaled with the stroke to keep the watermark's shape. */
    profileFill:   "rgba(0,0,0,0.15)",
    /** Beverage marker and contactless mark. */
    marker:        "rgba(0,0,0,0.70)"
} as const;

/**
 * Recipe accents, split by beverage. Colour is a redundant signal — a Doto
 * `TEA` / `COFFEE` marker carries the same information — because colour alone is
 * not an accessible signal.
 *
 * Deliberately NOT `as const`. Literal narrowing would type a group as a tuple
 * of specific hex strings, which no consumer wants and which breaks
 * lookup-by-value: on a union of two disjoint literal tuples, the parameter of
 * `indexOf` and `includes` collapses to `never`. Sub-project 2 needs exactly
 * that lookup to map a persisted colour back to an index.
 *
 * `Readonly<Record<...>>` rather than a bare `Record<...>`: the inner
 * `readonly string[]` only freezes the elements, and without the outer
 * `Readonly` the group properties themselves stay writable.
 */
export const accents: Readonly<Record<AccentGroup, readonly string[]>> = {
    coffee: [
        "#9FC3F0", // Sky
        "#F0B98E", // Peach
        "#F0A0AB", // Blossom
        "#B4D6A8", // Sage
        "#97D8C4", // Mint
        "#BDB2E8", // Lilac
        "#A6D6E8", // Ice
        "#E7A9C9"  // Rose
    ],
    tea:    [
        "#CFD6A3", // Sencha
        "#DCC194", // Oolong
        "#D9CF9A", // Jasmine
        "#E0AEA6"  // Hibiscus
    ]
};

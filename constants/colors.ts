/**
 * Single source of truth for every colour in the app.
 *
 * These values are a faithful capture of the colours that were previously
 * hardcoded across `app/` and `components/`. Nothing has been re-picked,
 * lightened or consolidated — the intent is that this file can be swapped
 * wholesale during the design overhaul without hunting call sites.
 *
 * Several oranges are near-duplicates of `brand` (`brandPressed`,
 * `brandIncrement`, `brandHelp`, `pressedBorder`). They are almost certainly
 * unintentional drift rather than deliberate design, but they are kept
 * distinct here so the overhaul can merge them on purpose.
 */
export const palette = {
    /** Primary orange: navigation header, primary buttons. */
    brand:          "#f4511e",
    /** Brand orange while pressed. */
    brandPressed:   "#de4f00",
    /** Brand orange for a disabled primary button. */
    brandDisabled:  "#f59d7d",
    /** Increment ("+") control. Near-duplicate of `brand`. */
    brandIncrement: "#ff5c00",
    /** Help / tooltip affordance. Near-duplicate of `brand`. */
    brandHelp:      "#ff783e",

    /** Hairline outline on recipe cards, circles and swipe actions. */
    outline: "#ffa592",

    /** Destructive actions and validation errors. */
    danger:      "red",
    /** Filled portion of the value slider. */
    dangerTrack: "rgba(255, 0, 0, 0.9)",
    /** Confirmation toasts and the "add pour" control. */
    success:     "green",
    /** Informational accent used by the Android NFC sheet. */
    info:        "blue",
    /** De-emphasised borders, icons and spinners. */
    muted:       "gray",

    /** Neutral raised surface (light screen background, secondary action). */
    surface:         "#dddddd",
    /** Background of a disabled text input. */
    surfaceDisabled: "#D3D3D3",

    /** Foreground on brand-coloured or otherwise dark surfaces. */
    onBrand: "#ffffff",
    /** Foreground on light surfaces. */
    onLight: "#000000",

    /** Heading text inside the Android NFC sheet. */
    dialogHeading: "#333333",
    /** Body text inside the Android NFC sheet. */
    dialogBody:    "#666666",

    /** React Navigation's own light background (kept in `rgb()` form). */
    navigationBackground: "rgb(221,221,221)"
} as const;

/** Screen background, one of the few genuinely theme-varying colours. */
export const screenBackground = {
    light: palette.surface,
    dark:  "black"
} as const;

/** Body text, which flips with the colour scheme. */
export const textColors = {
    light: {primary: palette.onLight, inverse: palette.onBrand},
    dark:  {primary: palette.onBrand, inverse: palette.onLight}
} as const;

/**
 * Recipe card fills and borders. Coffee and tea recipes are deliberately
 * distinct so a card's type is readable at a glance.
 */
export const cardColors = {
    light: {
        background:    "#d1d1d1",
        coffeeFill:    "#ffcfc5",
        coffeeBorder:  palette.outline,
        teaFill:       "#f0e7d2",
        teaBorder:     "#c7b995",
        pressedFill:   "#ffbaac",
        pressedBorder: "#ff6302"
    },
    dark:  {
        background:    "#d1d1d1",
        coffeeFill:    "#898989",
        coffeeBorder:  palette.brand,
        teaFill:       "#392F24",
        teaBorder:     "#7C5D40",
        pressedFill:   "#d44519",
        pressedBorder: "#ff6302"
    }
} as const;

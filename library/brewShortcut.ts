/**
 * Which shape the BREW shortcut takes on a recipe card.
 *
 * Five of them. `edge`, `tab` and `chip` are one idea at three sizes; `glyph`
 * is the quietest visible affordance — a bare play triangle, no label; and
 * `swipe` draws nothing on the card, leaving BREW to the swipe tray. They are
 * alternatives, never composed, and one will be chosen on a device and the rest
 * deleted. Whether there is a shortcut at all is a separate, older setting.
 */
export const BREW_SHORTCUTS = ["edge", "tab", "chip", "glyph", "swipe"] as const;

export type BrewShortcut = (typeof BREW_SHORTCUTS)[number];

/**
 * The trailing-edge band.
 *
 * Reached by the eye last, after the name and the figures, which is the right
 * order of importance for a shortcut. Its cost is that full bleed stacks the
 * bands into a near-continuous strip down a scrolling list, which is the thing
 * to watch for on a device and the reason `tab` exists.
 */
export const DEFAULT_BREW_SHORTCUT: BrewShortcut = "edge";

export function asBrewShortcut(value: unknown): BrewShortcut {
    return BREW_SHORTCUTS.includes(value as BrewShortcut)
        ? (value as BrewShortcut)
        : DEFAULT_BREW_SHORTCUT;
}

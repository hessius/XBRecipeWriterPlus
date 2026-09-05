/**
 * Which shape the BREW shortcut takes on a recipe card.
 *
 * Four of them, because the last one shipped on the strength of a mockup and
 * had five distinct faults in the hand. They are alternatives, never composed,
 * and one of them will be chosen on a device and the rest deleted. Whether
 * there is a shortcut at all is a separate, older setting.
 */
export const BREW_SHORTCUTS = ["edge", "tab", "chip", "swipe"] as const;

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

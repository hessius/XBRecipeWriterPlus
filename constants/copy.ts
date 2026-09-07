/**
 * The words more than one screen says.
 *
 * Everything here was found duplicated as independent literals during the copy
 * audit: three copies of "Already in your library", three of the card-placement
 * line, and two unrelated explanations of the same too-fine grind. A second
 * copy is not a bug on the day it is written — it is a bug on the day one of
 * them is reworded and the others are not.
 *
 * Screen-specific copy belongs with its screen. Only put a string here once a
 * second screen genuinely needs the same words.
 */

/**
 * Shown when an import or a card read turns out to be a recipe already saved.
 *
 * Said three ways before this: two toasts and a line in the import sheet.
 */
export const ALREADY_IN_LIBRARY = "Already in your library";

/**
 * The same fact when the saved copy has a name worth quoting back.
 *
 * Two forms, deliberately: the drawn line quotes the name so it does not run
 * into the sentence around it, and the spoken one does not, because a screen
 * reader pronounces the quote marks.
 */
export function alreadyInLibraryAs(name: string): string {
    return `${ALREADY_IN_LIBRARY} as "${name}"`;
}

/** The spoken form of {@link alreadyInLibraryAs}, without the quote marks. */
export function alreadyInLibraryAsSpoken(name: string): string {
    return `${ALREADY_IN_LIBRARY} as ${name}`;
}

/**
 * Where to hold the card.
 *
 * Appears on the Android overlay and inside Apple's own NFC sheet, for both
 * reading and writing — four places, one instruction.
 */
export const HOLD_CARD = "Hold the card to the top of the phone.";

/**
 * Why a grind is too fine to write, and what to do about it.
 *
 * The editor said only the rule ("A card cannot store a grind below 40.") and
 * the import sheet said only the remedy ("You will need to coarsen it to write
 * a card."). Both are true and neither is complete: a user meeting one had to
 * infer the other. This says both, so whichever screen you meet it on tells
 * you the whole thing.
 */
export function grindTooFine(min: number): string {
    return `A card cannot store a grind below ${min}, `
         + "so you will need to coarsen it to write one.";
}

/**
 * The two card failures, kept side by side.
 *
 * They are the same event in opposite directions, and only the read one used
 * to invite a retry — so the write failure read as final when it is just as
 * likely to be a card that moved.
 */
export const CARD_READ_FAILED  = "Could not read the card. Please try again.";
export const CARD_WRITE_FAILED =
    "Could not write the recipe to the card. Please try again.";

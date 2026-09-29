import type {BrewRecord} from "./BrewRecord";
import {resolvedOrigin, resolvedProcess} from "./beanTags";

/**
 * The shape of a story frame, as a ratio of width to height.
 *
 * 9:16 is what Instagram, TikTok and everything that copied them show
 * full-bleed. Anything else is letterboxed by the platform, which crops or
 * pads a picture somebody chose the composition of.
 */
export const STORY_ASPECT = 16 / 9;

/**
 * The share of the frame the platform's own furniture covers.
 *
 * A story is drawn edge to edge and then has an avatar, a caption box, a reply
 * field and a set of buttons laid over it. The numbers are the conservative
 * end of what the platforms publish: nothing that has to be read may sit in
 * these bands, and the card leaves them empty rather than merely dimmed.
 */
export const STORY_SAFE_TOP = 0.12;
export const STORY_SAFE_BOTTOM = 0.16;

/** A card's pixel frame, derived from the width it is drawn at. */
export type StoryFrame = {
    width: number;
    height: number;
    /** Points at the top no content may enter. */
    safeTop: number;
    /** And at the bottom. */
    safeBottom: number;
};

/**
 * The frame for a card drawn at this width.
 *
 * Rounded, because a fractional height is a fractional pixel row in the PNG
 * and the platforms scale the result: half a row at the bottom edge of a
 * story is a visible seam.
 */
export function storyFrame(width: number): StoryFrame {
    const height = Math.round(width * STORY_ASPECT);
    return {
        width,
        height,
        safeTop:    Math.round(height * STORY_SAFE_TOP),
        safeBottom: Math.round(height * STORY_SAFE_BOTTOM)
    };
}

/**
 * What the coffee was, as one line, or null when nobody has said.
 *
 * Built here rather than in the card for the reason `dialNote` is built in the
 * domain: the pod's origin and process are *resolved* values, and a component
 * that reached for `record.origin` directly would quietly print nothing for a
 * pod brew while the bean profile printed Huila.
 *
 * Null rather than an empty string, so the card can leave the row out
 * altogether. A line of separators with nothing between them is how a card for
 * a brew nobody described ends up looking broken.
 */
export function storyCoffeeLine(record: BrewRecord): string | null {
    const parts = [
        resolvedOrigin(record),
        record.roast,
        resolvedProcess(record),
        record.fermentation
    ].filter((part): part is string =>
        typeof part === "string" && part.trim() !== "");
    return parts.length === 0 ? null : parts.join(" · ");
}

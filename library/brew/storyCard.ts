import type {BrewRecord} from "./BrewRecord";
import {BAR_FLOOR, GAP_FLOOR} from "./bands";
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

export type StorySummaryBudgetInput = {
    width: number;
    stages: number;
    hasRateChart: boolean;
    hasCoffee: boolean;
    hasRating: boolean;
    tagCount: number;
};

export type StorySummaryBudget = {
    contentHeight: number;
    surroundingHeight: number;
    summaryAvailableHeight: number;
    minimumSummaryHeight: number;
    requiredHeight: number;
    traceHeight: number;
    rateHeight: number;
    capturePadding: number;
    ladderTopGap: number;
    rateLabelRowHeight: number;
};

const STORY_CAPTURE_PADDING = 7;
const STORY_TRACE_HEIGHT = 90;
const STORY_RATE_HEIGHT = 84;
const STORY_RATE_LABEL_ROW_MAX = 21;
const STORY_NAME_ROW = 31;
const STORY_FIGURES_BLOCK = 60;
const STORY_LADDER_TOP_GAP = 8;
const STORY_GAP = 8;
const STORY_HEADER_ROW = 31;
const STORY_COFFEE_ROW = 24;
const STORY_RATING_ROW = 16;
const STORY_TAG_ROW = 30;

export function storySummaryBudget(
    {
        width, stages, hasRateChart, hasCoffee, hasRating, tagCount
    }: StorySummaryBudgetInput
): StorySummaryBudget {
    const frame = storyFrame(width);
    const contentHeight = frame.height - frame.safeTop - frame.safeBottom;
    const optionalRows = [
        hasCoffee ? STORY_COFFEE_ROW : 0,
        hasRating ? STORY_RATING_ROW : 0,
        tagCount > 0 ? STORY_TAG_ROW : 0
    ].filter((row) => row > 0);
    const surroundingRows = [STORY_HEADER_ROW, ...optionalRows];
    const surroundingHeight = surroundingRows.reduce((sum, row) => sum + row, 0)
        + STORY_GAP * surroundingRows.length;
    const minimumSummaryHeight = STORY_CAPTURE_PADDING
        + STORY_CAPTURE_PADDING
        + STORY_NAME_ROW
        + STORY_TRACE_HEIGHT
        + (hasRateChart ? Math.max(STORY_RATE_HEIGHT, STORY_RATE_LABEL_ROW_MAX) : 0)
        + STORY_FIGURES_BLOCK
        + STORY_LADDER_TOP_GAP
        + stages * (BAR_FLOOR + GAP_FLOOR);

    return {
        contentHeight,
        surroundingHeight,
        summaryAvailableHeight: Math.max(0, contentHeight - surroundingHeight),
        minimumSummaryHeight,
        requiredHeight: surroundingHeight + minimumSummaryHeight,
        traceHeight: STORY_TRACE_HEIGHT,
        rateHeight: STORY_RATE_HEIGHT,
        capturePadding: STORY_CAPTURE_PADDING,
        ladderTopGap: STORY_LADDER_TOP_GAP,
        rateLabelRowHeight: STORY_RATE_LABEL_ROW_MAX
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

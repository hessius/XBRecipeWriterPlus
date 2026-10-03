import type {BrewRecord} from "./BrewRecord";
import {BAR_CAP, BAR_FLOOR, GAP_CAP, GAP_FLOOR} from "./bands";
import {resolvedOrigin, resolvedProcess} from "./beanTags";
import {
    RATE_BOTTOM_GAP,
    RATE_HEIGHT,
    TRACE_HEIGHT,
    RATE_TOP_GAP
} from "./rateChartGeometry";
import {formatBrewClock} from "@/library/brew/brewFormat";
import {formatFlowRate} from "@/library/brew/flowRate";
import {stageLadderRungMinHeight} from "./stageLadderGeometry";
import {
    BREW_FIGURE_DETAIL_VALUE_SIZE,
    BREW_FIGURE_INTERNAL_GAP,
    BREW_FIGURE_LABEL_SIZE,
    BREW_FIGURE_ROW_GAP,
    BREW_FIGURE_VALUE_SIZE,
    brewFigureBadgeGeometry,
    brewFigureBadgeWidth,
    brewFigureTextGeometry
} from "@/library/brew/figureGeometry";
import {BYPASS_VOLUME} from "@/library/bypassLimits";
import {
    COFFEE_POUR_PAUSE,
    COFFEE_POUR_VOLUME,
    FLOW_RATE
} from "@/library/cardLimits";
import {MACHINE_CARD_MAX_STAGES} from "@/library/cardWriteErrors";
import {
    dotoRowHeight,
    dotoTextWidth,
    DOTO_MAX_FONT_SCALE
} from "@/library/dotoMetrics";

/**
 * The shape of a story frame, as a ratio of width to height.
 *
 * 9:16 is what Instagram, TikTok and everything that copied them show
 * full-bleed. Anything else is letterboxed by the platform, which crops or
 * pads a picture somebody chose the composition of.
 */
export const STORY_ASPECT = 16 / 9;

/**
 * A near full bleed story card, chosen after the conservative bands made the
 * export read as letterboxed and left roughly a third of the image unused.
 *
 * Instagram's profile row and reply bar may graze the extreme top and bottom.
 * The trade is deliberate: a story that uses its height honestly reads more
 * like a card somebody meant to post than a picture framed by empty black.
 */
export const STORY_SAFE_TOP = 0.03;
export const STORY_SAFE_BOTTOM = 0.05;

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
    tags?: string[];
    tagCount?: number;
    hasBypass?: boolean;
    hasGrindRecipeBadge?: boolean;
    drawdownRate?: number | null;
    figureExtraRows?: number;
    hasSummaryNote?: boolean;
    stagesUnavailable?: boolean;
    fontScale?: number;
};

export const STORY_CONTENT_KEYS = [
    "coffee", "rating", "tags", "note", "details", "flow"
] as const;

export type StoryContentKey = (typeof STORY_CONTENT_KEYS)[number];

export type StoryContentFacts = Record<StoryContentKey, boolean>;

const STORY_CONTENT_SET = new Set<string>(STORY_CONTENT_KEYS);

export function storyContentFacts({
    hasRateChart, hasCoffee, hasRating, tags = [], tagCount = tags.length,
    figureExtraRows = 0, hasSummaryNote = false
}: Pick<
    StorySummaryBudgetInput,
    "hasRateChart" | "hasCoffee" | "hasRating" | "tags" | "tagCount" |
    "figureExtraRows" | "hasSummaryNote"
>): StoryContentFacts {
    return {
        coffee:  hasCoffee,
        rating:  hasRating,
        tags:    tagCount > 0,
        note:    hasSummaryNote,
        details: figureExtraRows > 0,
        flow:    hasRateChart
    };
}

export function offeredStoryContent(facts: StoryContentFacts): StoryContentKey[] {
    return STORY_CONTENT_KEYS.filter((key) => facts[key]);
}

export function storyHiddenFromSetting(value: string): Set<StoryContentKey> {
    if (value.trim() === "") return new Set();
    try {
        const parsed = JSON.parse(value) as unknown;
        if (!Array.isArray(parsed)) return new Set();
        return new Set(parsed.filter((key): key is StoryContentKey =>
            typeof key === "string" && STORY_CONTENT_SET.has(key)
        ));
    } catch {
        return new Set();
    }
}

export function storyHiddenToSetting(hidden: Iterable<StoryContentKey>): string {
    const hiddenSet = new Set(hidden);
    const ordered = STORY_CONTENT_KEYS.filter((key) => hiddenSet.has(key));
    return ordered.length === 0 ? "" : JSON.stringify(ordered);
}

export type StorySummaryBudget = {
    contentHeight: number;
    fontScale: number;
    surroundingHeight: number;
    requiredHeight: number;
    traceHeight: number;
    rateHeight: number;
    rateTopGap: number;
    rateBottomGap: number;
    sectionGap: number;
    gapSlots: number;
    capturePadding: number;
    ladderTopGap: number;
    barHeight: number;
    rungGap: number;
    showRateChart: boolean;
    showCoffee: boolean;
    showRating: boolean;
    shownTagCount: number;
    tagRows: number;
    showSummaryNote: boolean;
    showFigureDetails: boolean;
    showGrindRecipeBadge: boolean;
    showDrawdownRateBadge: boolean;
    showBypassBadge: boolean;
    showStages: boolean;
    declinedContent: StoryContentFacts;
    margin: number;
};

export const STORY_CAPTURE_PADDING = 7;
export const STORY_TRACE_HEIGHT = 90;
export const STORY_TRACE_MIN_HEIGHT = 44;
/**
 * A story trace can honestly grow well beyond the old compact height, but not
 * keep stretching. At 237 pt it is still under half the tallest tested content
 * band, and the temperature labels and legend leave it reading as a chart
 * rather than as a mostly empty poster.
 */
const STORY_TRACE_CAP = 237;
/**
 * Section gaps spend what the two charts should not take. Ninety points is
 * reserved for cases where the rate chart was dropped, matching the default
 * trace's weight without exceeding it, so it still reads as row grouping rather
 * than a blank band of its own.
 */
const STORY_SECTION_GAP_CAP = 90;
export const STORY_LADDER_TOP_GAP = 8;
export const STORY_GAP = 8;
export const STORY_TEST_WIDTHS = [
    185, 200, 220, 240, 270, 281, 300, 320, 343, 360, 375, 393, 430
];
export const STORY_TEST_FONT_SCALES = [0.85, 1, 1.2, DOTO_MAX_FONT_SCALE];
export const STORY_REFERENCE_WIDTH = 430;

const STORY_HEADER_MARK = 16;
const STORY_HEADER_DATE = 11;
const STORY_NAME_SIZE = 13;
const STORY_NAME_MARGIN = 12;
const STORY_COFFEE_SIZE = 12;
const STORY_RATING_SIZE = 16;
const STORY_TAG_SIZE = 10;
const STORY_TAG_PAD_X = 8;
const STORY_TAG_PAD_Y = 4;
const STORY_TAG_GAP = 8;
const STORY_TAG_MORE_CHARS = 3;
export const STORY_FIT_MARGIN = 0.75;
const STORY_DRAWDOWN_RATE_BADGE = "99.9 G/S";
const STORY_SLOWEST_FLOW_ML_S = FLOW_RATE.min / 10;
const STORY_RATE_MIN_HEIGHT = 32;
const STORY_RATE_TOP_MIN_GAP = 6;
const STORY_RATE_BOTTOM_MIN_GAP = 4;
const STORY_LADDER_TOP_MIN_GAP = 4;
const STORY_SECTION_MIN_GAP = 4;
const STORY_TRACE_MIN_FLOOR = 28;
const STORY_CHART_PAIR_MIN = Math.ceil(
    STORY_RATE_MIN_HEIGHT * (TRACE_HEIGHT + RATE_HEIGHT) / RATE_HEIGHT
);
const STORY_CHART_PAIR_CAP = Math.floor(
    STORY_TRACE_CAP * (TRACE_HEIGHT + RATE_HEIGHT) / TRACE_HEIGHT
);

type StoryFigureMaxima = {
    water: string;
    cup: string;
    clock: string;
    delay: string;
};

function storyFigureMaxima(stages: number): StoryFigureMaxima {
    const boundedStages = stages > 0
        ? Math.min(stages, MACHINE_CARD_MAX_STAGES)
        : MACHINE_CARD_MAX_STAGES;
    const water = boundedStages * COFFEE_POUR_VOLUME.max;
    const seconds = boundedStages * (
        COFFEE_POUR_VOLUME.max / STORY_SLOWEST_FLOW_ML_S + COFFEE_POUR_PAUSE.max
    );

    return {
        water: String(water),
        cup:   String(water + BYPASS_VOLUME.max),
        clock: formatBrewClock(seconds),
        delay: `+${Math.ceil(seconds)}`
    };
}

export function storyTextScale(width: number): number {
    return Math.min(1, width / STORY_REFERENCE_WIDTH);
}

export function storyTextContentWidth(
    width: number,
    capturePadding = STORY_CAPTURE_PADDING
): number {
    return width - capturePadding * 2;
}

export function storyChartWidth(width: number): number {
    return width;
}

function scaledSize(size: number, width: number): number {
    return size * storyTextScale(width);
}

function scaledTracking(tracking: number, width: number): number {
    return tracking * storyTextScale(width);
}

type StoryRows = {
    header: number;
    name: number;
    figures: number;
    coffee: number;
    rating: number;
    tag: number;
};

function figureRowHeight(valueSize: number, fontScale: number, width: number): number {
    return dotoRowHeight(scaledSize(BREW_FIGURE_LABEL_SIZE, width), fontScale)
        + BREW_FIGURE_INTERNAL_GAP
        + dotoRowHeight(scaledSize(valueSize, width), fontScale);
}

export type StoryHeaderLayout = {
    stacked: boolean;
    height: number;
    markSize: number;
    dateSize: number;
    markTracking: number;
    dateTracking: number;
    dateMaxFontSizeMultiplier: number;
    markWidth: number;
    dateWidth: number;
};

function boundedDateFontScale(
    when: string,
    dateSize: number,
    tracking: number,
    fontScale: number,
    limit: number
): number {
    if (limit <= 0 || fontScale <= 1) return DOTO_MAX_FONT_SCALE;
    if (dotoTextWidth(when, dateSize, fontScale, tracking) <= limit) return fontScale;
    if (dotoTextWidth(when, dateSize, 1, tracking) >= limit) return 1;

    let low = 1;
    let high = fontScale;
    for (let i = 0; i < 12; i += 1) {
        const mid = (low + high) / 2;
        if (dotoTextWidth(when, dateSize, mid, tracking) <= limit) {
            low = mid;
        } else {
            high = mid;
        }
    }
    return low;
}

export function storyHeaderLayout(
    width: number,
    fontScale: number,
    when = "2026-09-30 · 06:55"
): StoryHeaderLayout {
    const markSize = scaledSize(STORY_HEADER_MARK, width);
    const dateSize = scaledSize(STORY_HEADER_DATE, width);
    const markTracking = scaledTracking(1, width);
    const dateTracking = scaledTracking(1.4, width);
    const innerWidth = Math.max(0, width - 36);
    const markWidth = dotoTextWidth("XBRW++", markSize, fontScale, markTracking);
    const dateMaxFontSizeMultiplier = boundedDateFontScale(
        when, dateSize, dateTracking, fontScale, innerWidth
    );
    const dateWidth = dotoTextWidth(
        when,
        dateSize,
        Math.min(fontScale, dateMaxFontSizeMultiplier),
        dateTracking
    );
    const markHeight = dotoRowHeight(markSize, fontScale);
    const dateHeight = dotoRowHeight(dateSize, Math.min(fontScale, dateMaxFontSizeMultiplier));
    const stacked = markWidth + dateWidth > innerWidth;

    return {
        stacked,
        height: stacked ? markHeight + 2 + dateHeight : Math.max(markHeight, dateHeight),
        markSize,
        dateSize,
        markTracking,
        dateTracking,
        dateMaxFontSizeMultiplier,
        markWidth,
        dateWidth
    };
}

function storyRows(width: number, fontScale: number): StoryRows {
    return {
        header: storyHeaderLayout(width, fontScale).height,
        name: dotoRowHeight(scaledSize(STORY_NAME_SIZE, width), fontScale)
            + STORY_NAME_MARGIN * storyTextScale(width),
        figures: figureRowHeight(BREW_FIGURE_VALUE_SIZE, fontScale, width),
        coffee: dotoRowHeight(scaledSize(STORY_COFFEE_SIZE, width), fontScale),
        rating: Math.ceil(Math.max(STORY_RATING_SIZE, dotoRowHeight(11, fontScale))),
        tag: dotoRowHeight(scaledSize(STORY_TAG_SIZE, width), fontScale)
            + STORY_TAG_PAD_Y * 2 * storyTextScale(width)
    };
}

function scaledFloor(value: number, width: number, floor: number): number {
    return Math.max(floor, Math.round(value * storyTextScale(width)));
}

function tagWidth(tag: string, fontScale: number, width: number): number {
    const size = scaledSize(STORY_TAG_SIZE, width);
    const tracking = scaledTracking(1.2, width);
    return Math.ceil(
        dotoTextWidth(tag, size, fontScale, tracking)
        + STORY_TAG_PAD_X * 2 * storyTextScale(width)
    );
}

function tagRows(tags: string[], width: number, fontScale: number): number | null {
    if (tags.length === 0) return 0;
    const innerWidth = Math.max(0, width - 36);
    let rows = 1;
    let used = 0;
    const widths = tags.map((tag) => tagWidth(tag, fontScale, width));
    for (const next of widths) {
        if (next + STORY_FIT_MARGIN > innerWidth) return null;
        const spend = used === 0 ? next : next + STORY_TAG_GAP;
        if (used > 0 && used + spend > innerWidth) {
            rows += 1;
            used = next;
        } else {
            used += spend;
        }
    }
    return rows;
}

function surroundingHeight(rows: number[], sectionGap = STORY_GAP): number {
    return rows.reduce((sum, row) => sum + row, 0) + sectionGap * rows.length;
}

type GrowableAllowance = {
    id: string;
    floor: number;
    cap: number;
    share: number;
};

export type StoryHorizontalFit = {
    fits: boolean;
    widest: string;
    width: number;
    limit: number;
};

function fitResult(rows: {id: string; width: number; limit: number}[]): StoryHorizontalFit {
    const widest = rows.reduce(
        (best, row) => (row.width - row.limit > best.width - best.limit ? row : best),
        {id: "none", width: 0, limit: Number.POSITIVE_INFINITY}
    );
    return {
        fits: rows.every((row) => row.width + STORY_FIT_MARGIN <= row.limit),
        widest: widest.id,
        width: widest.width,
        limit: widest.limit
    };
}

function storyFigureColumnWidth(width: number): number {
    const figures = brewFigureTextGeometry(storyTextScale(width));
    return Math.max(
        0,
        (width - STORY_CAPTURE_PADDING * 2 - figures.columnGap * 2) / 3
    );
}

function waterBypassRow(
    width: number,
    fontScale: number,
    maxima: StoryFigureMaxima
): {id: string; width: number; limit: number} {
    const figures = brewFigureTextGeometry(storyTextScale(width));
    const badge = brewFigureBadgeGeometry(storyTextScale(width));
    const column = storyFigureColumnWidth(width);
    const waterWithBypass = dotoTextWidth(
        maxima.water, figures.valueSize, fontScale, figures.valueTracking
    ) + badge.gap + brewFigureBadgeWidth(
        `+${BYPASS_VOLUME.max}`, fontScale, storyTextScale(width)
    );

    return {
        id:    "water value and bypass",
        width: waterWithBypass,
        limit: column
    };
}

export function storyBypassBadgeFits(
    width: number,
    fontScale: number,
    stages = MACHINE_CARD_MAX_STAGES
): boolean {
    return fitResult([waterBypassRow(width, fontScale, storyFigureMaxima(stages))]).fits;
}

function storyFiguresFit(
    width: number,
    fontScale: number,
    hasBypass: boolean,
    showBypassBadge: boolean,
    maxima: StoryFigureMaxima
): StoryHorizontalFit {
    const figures = brewFigureTextGeometry(storyTextScale(width));
    const column = storyFigureColumnWidth(width);
    const rows = [
        {
            id:    "water label",
            width: dotoTextWidth("WATER", figures.labelSize, fontScale, figures.labelTracking),
            limit: column
        },
        {
            id:    "water value",
            width: dotoTextWidth(
                maxima.water,
                figures.valueSize,
                fontScale,
                figures.valueTracking
            ),
            limit: column
        },
        {
            id:    "cup label",
            width: dotoTextWidth("CUP", figures.labelSize, fontScale, figures.labelTracking),
            limit: column
        },
        {
            id:    "cup value",
            width: dotoTextWidth(
                maxima.cup, figures.valueSize, fontScale, figures.valueTracking
            ),
            limit: column
        },
        {
            id:    "time label",
            width: dotoTextWidth("TIME", figures.labelSize, fontScale, figures.labelTracking),
            limit: column
        },
        {
            id:    "time value",
            width: dotoTextWidth(
                maxima.clock, figures.valueSize, fontScale, figures.valueTracking
            ),
            limit: column
        }
    ];
    if (hasBypass && showBypassBadge) {
        rows.push(waterBypassRow(width, fontScale, maxima));
    }
    return fitResult(rows);
}

function grindRecipeBadgeRow(
    width: number,
    fontScale: number
): {id: string; width: number; limit: number} {
    const figures = brewFigureTextGeometry(storyTextScale(width));
    const badge = brewFigureBadgeGeometry(storyTextScale(width));
    const column = storyFigureColumnWidth(width);
    const grindWithRecipe = dotoTextWidth(
        "80", figures.detailValueSize, fontScale, figures.valueTracking
    ) + badge.gap + brewFigureBadgeWidth("RECIPE 80", fontScale, storyTextScale(width));

    return {
        id:    "grind value and recipe",
        width: grindWithRecipe,
        limit: column
    };
}

export function storyGrindRecipeBadgeFits(width: number, fontScale: number): boolean {
    return fitResult([grindRecipeBadgeRow(width, fontScale)]).fits;
}

function drawdownRateBadgeText(drawdownRate?: number | null): string | null {
    if (drawdownRate === null) return null;
    if (drawdownRate === undefined) return STORY_DRAWDOWN_RATE_BADGE;
    const formatted = formatFlowRate(drawdownRate);
    return formatted === null ? null : `${formatted} G/S`;
}

function drawdownRateBadgeRow(
    width: number,
    fontScale: number,
    maxima: StoryFigureMaxima,
    drawdownRate?: number | null
): {id: string; width: number; limit: number} | null {
    const figures = brewFigureTextGeometry(storyTextScale(width));
    const badge = brewFigureBadgeGeometry(storyTextScale(width));
    const column = storyFigureColumnWidth(width);
    const badgeText = drawdownRateBadgeText(drawdownRate);
    if (badgeText === null) return null;
    const drawdownWithRate = dotoTextWidth(
        maxima.clock, figures.detailValueSize, fontScale, figures.valueTracking
    ) + badge.gap + brewFigureBadgeWidth(badgeText, fontScale, storyTextScale(width));

    return {
        id:    "drawdown value and rate",
        width: drawdownWithRate,
        limit: column
    };
}

export function storyDrawdownRateBadgeFits(
    width: number,
    fontScale: number,
    drawdownRate?: number | null,
    stages = MACHINE_CARD_MAX_STAGES
): boolean {
    const row = drawdownRateBadgeRow(width, fontScale, storyFigureMaxima(stages), drawdownRate);
    return row !== null && fitResult([row]).fits;
}

function storyDetailsFit(
    width: number,
    fontScale: number,
    showGrindRecipeBadge: boolean,
    showDrawdownRateBadge: boolean,
    maxima: StoryFigureMaxima,
    drawdownRate?: number | null
): StoryHorizontalFit {
    const figures = brewFigureTextGeometry(storyTextScale(width));
    const column = storyFigureColumnWidth(width);
    const rows = [
        {
            id:    "grind label",
            width: dotoTextWidth("GRIND", figures.labelSize, fontScale, figures.labelTracking),
            limit: column
        },
        {
            id:    "grind value",
            width: dotoTextWidth("OFF", figures.detailValueSize, fontScale, figures.valueTracking),
            limit: column
        },
        {
            id:    "delay label",
            width: dotoTextWidth("DELAY", figures.labelSize, fontScale, figures.labelTracking),
            limit: column
        },
        {
            id:    "delay value",
            width: dotoTextWidth(
                maxima.delay, figures.detailValueSize, fontScale, figures.valueTracking
            ),
            limit: column
        },
        {
            id:    "drawdown label",
            width: dotoTextWidth("DRAWDOWN", figures.labelSize, fontScale, figures.labelTracking),
            limit: column
        },
        {
            id:    "drawdown value",
            width: dotoTextWidth(
                maxima.clock,
                figures.detailValueSize,
                fontScale,
                figures.valueTracking
            ),
            limit: column
        }
    ];
    if (showGrindRecipeBadge) {
        rows.push(grindRecipeBadgeRow(width, fontScale));
    }
    if (showDrawdownRateBadge) {
        const row = drawdownRateBadgeRow(width, fontScale, maxima, drawdownRate);
        if (row !== null) rows.push(row);
    }
    return fitResult(rows);
}

export function storyHorizontalFit(
    input: StorySummaryBudgetInput,
    budget: Pick<StorySummaryBudget, "showFigureDetails"> & {
        showGrindRecipeBadge?: boolean;
        showDrawdownRateBadge?: boolean;
        showBypassBadge?: boolean;
    }
): StoryHorizontalFit {
    const width = input.width;
    const fontScale = input.fontScale ?? 1;
    const maxima = storyFigureMaxima(input.stages);
    const showBypassBadge = budget.showBypassBadge
        ?? (input.hasBypass === true && storyBypassBadgeFits(width, fontScale, input.stages));
    const mainFigures = storyFiguresFit(
        width, fontScale, input.hasBypass === true, showBypassBadge, maxima
    );
    const showGrindRecipeBadge = budget.showGrindRecipeBadge
        ?? (
            budget.showFigureDetails
            && input.hasGrindRecipeBadge !== false
            && storyGrindRecipeBadgeFits(width, fontScale)
        );
    const showDrawdownRateBadge = budget.showDrawdownRateBadge
        ?? (
            budget.showFigureDetails
            && input.drawdownRate !== null
            && storyDrawdownRateBadgeFits(width, fontScale, input.drawdownRate, input.stages)
        );
    const details = budget.showFigureDetails
        ? storyDetailsFit(
            width, fontScale, showGrindRecipeBadge, showDrawdownRateBadge,
            maxima, input.drawdownRate
        )
        : {fits: true, widest: "none", width: 0, limit: Number.POSITIVE_INFINITY};

    return fitResult([
        {id: mainFigures.widest, width: mainFigures.width, limit: mainFigures.limit},
        {id: details.widest, width: details.width, limit: details.limit}
    ]);
}

function growAllowances(
    slack: number,
    allowances: GrowableAllowance[]
): {values: Map<string, number>; spent: number} {
    const values = new Map<string, number>();
    let remaining = Math.max(0, slack);
    let spent = 0;

    for (const {id, floor, cap, share} of allowances) {
        const usableShare = Math.max(1, share);
        const growBy = Math.min(
            Math.max(0, cap - floor),
            Math.floor(remaining / usableShare)
        );
        values.set(id, floor + growBy);
        const cost = growBy * usableShare;
        spent += cost;
        remaining -= cost;
    }

    return {values, spent};
}

function storyChartHeights(
    chartHeight: number,
    hasRateChart: boolean
): {trace: number; rate: number} {
    if (!hasRateChart) return {trace: chartHeight, rate: 0};

    const idealTrace = Math.round(
        chartHeight * TRACE_HEIGHT / (TRACE_HEIGHT + RATE_HEIGHT)
    );
    let trace = idealTrace;
    let rate = chartHeight - trace;

    if (rate < STORY_RATE_MIN_HEIGHT) {
        rate = STORY_RATE_MIN_HEIGHT;
        trace = chartHeight - rate;
    }
    if (trace < STORY_TRACE_MIN_FLOOR) {
        trace = STORY_TRACE_MIN_FLOOR;
        rate = Math.max(0, chartHeight - trace);
    }

    return {trace, rate};
}

function storyBands(
    margin: number,
    ladderRows: number
): {barHeight: number; rungGap: number; spent: number} {
    if (ladderRows <= 0 || margin <= 0) {
        return {barHeight: BAR_FLOOR, rungGap: GAP_FLOOR, spent: 0};
    }

    const grown = growAllowances(margin, [
        {id: "bar", floor: BAR_FLOOR, cap: BAR_CAP, share: ladderRows},
        {id: "gap", floor: GAP_FLOOR, cap: GAP_CAP, share: ladderRows}
    ]);

    return {
        barHeight: grown.values.get("bar") ?? BAR_FLOOR,
        rungGap:   grown.values.get("gap") ?? GAP_FLOOR,
        spent:     grown.spent
    };
}

export function storySummaryBudget(
    {
        width, stages, hasRateChart, hasCoffee, hasRating, tags = [],
        tagCount = tags.length, hasBypass = false, hasGrindRecipeBadge = undefined,
        drawdownRate = undefined, figureExtraRows = 0, hasSummaryNote = false,
        stagesUnavailable = false,
        fontScale = 1
    }: StorySummaryBudgetInput
): StorySummaryBudget {
    const frame = storyFrame(width);
    const contentHeight = frame.height - frame.safeTop - frame.safeBottom;
    const rows = storyRows(width, fontScale);
    const shownTags = tags.slice(0, Math.min(tagCount, 4));
    const moreTags = Math.max(0, tagCount - shownTags.length);
    const tagsForWidth = moreTags > 0
        ? [...shownTags, "+".repeat(STORY_TAG_MORE_CHARS)]
        : shownTags;
    const ladderRows = stages + (hasBypass ? 1 : 0);
    const requested: StoryContentFacts = {
        coffee:  hasCoffee,
        rating:  hasRating,
        tags:    tagCount > 0,
        note:    hasSummaryNote,
        details: figureExtraRows > 0,
        flow:    hasRateChart
    };
    const traceFull = scaledFloor(STORY_TRACE_HEIGHT, width, STORY_TRACE_MIN_FLOOR);
    const traceMin = Math.min(
        traceFull,
        scaledFloor(STORY_TRACE_MIN_HEIGHT, width, STORY_TRACE_MIN_FLOOR)
    );
    const chartPairFull = scaledFloor(
        TRACE_HEIGHT + RATE_HEIGHT,
        width,
        STORY_CHART_PAIR_MIN
    );
    const chartPairMin = Math.min(chartPairFull, STORY_CHART_PAIR_MIN);
    const rateTopGap = scaledFloor(RATE_TOP_GAP, width, STORY_RATE_TOP_MIN_GAP);
    const rateBottomGap = scaledFloor(RATE_BOTTOM_GAP, width, STORY_RATE_BOTTOM_MIN_GAP);
    const ladderTopGap = scaledFloor(STORY_LADDER_TOP_GAP, width, STORY_LADDER_TOP_MIN_GAP);
    const sectionGapFloor = scaledFloor(STORY_GAP, width, STORY_SECTION_MIN_GAP);
    const canShowGrindRecipeBadge = figureExtraRows > 0
        && hasGrindRecipeBadge !== false
        && storyGrindRecipeBadgeFits(width, fontScale);
    const canShowDrawdownRateBadge = figureExtraRows > 0
        && drawdownRate !== null
        && storyDrawdownRateBadgeFits(width, fontScale, drawdownRate, stages);
    const canShowBypassBadge = hasBypass && storyBypassBadgeFits(width, fontScale, stages);

    const build = (
        showCoffee: boolean,
        showRating: boolean,
        showTags: boolean,
        showRate: boolean,
        chartHeight: number,
        showStages: boolean,
        showNote: boolean,
        showDetails: boolean
    ) => {
        const charts = storyChartHeights(chartHeight, showRate);
        const tagLineCount = showTags ? tagRows(tagsForWidth, width, fontScale) : 0;
        const optionalRows = [
            showCoffee ? rows.coffee : 0,
            showRating ? rows.rating : 0,
            showTags && tagLineCount !== null ? rows.tag * tagLineCount : 0
        ].filter((row) => row > 0);
        const surroundingRows = [rows.header, ...optionalRows];
        const around = surroundingHeight(surroundingRows, sectionGapFloor);
        const ladder = showStages
            ? ladderTopGap
                + (stagesUnavailable
                    ? dotoRowHeight(11, fontScale)
                    : ladderRows * stageLadderRungMinHeight(fontScale, BAR_FLOOR, GAP_FLOOR))
            : 0;
        const figureBlock = rows.figures
            + (showDetails ? Math.max(0, figureExtraRows) * (
                BREW_FIGURE_ROW_GAP
                + figureRowHeight(BREW_FIGURE_DETAIL_VALUE_SIZE, fontScale, width)
            ) : 0)
            + (showNote ? dotoRowHeight(scaledSize(11, width), fontScale) + 8 : 0);
        const summary = STORY_CAPTURE_PADDING * 2
            + rows.name
            + charts.trace
            + (showRate ? rateTopGap + charts.rate + rateBottomGap : 0)
            + figureBlock
            + ladder;
        const budgetForFit = {
            showFigureDetails:    showDetails,
            showGrindRecipeBadge: showDetails && canShowGrindRecipeBadge,
            showDrawdownRateBadge: showDetails && canShowDrawdownRateBadge,
            showBypassBadge:      canShowBypassBadge
        };
        return {
            around,
            summary,
            required: around + summary,
            tagLineCount: tagLineCount ?? 0,
            gapSlots: surroundingRows.length,
            surroundingRows,
            horizontal: storyHorizontalFit(
                {
                    width, stages, hasRateChart: showRate, hasCoffee: showCoffee,
                    hasRating: showRating, tags, tagCount, hasBypass, hasGrindRecipeBadge,
                    figureExtraRows, hasSummaryNote: showNote, stagesUnavailable, fontScale,
                    drawdownRate
                },
                budgetForFit
            )
        };
    };

    type Attempt = {
        coffee: boolean;
        rating: boolean;
        tags: boolean;
        rate: boolean;
        chart: number;
        stages: boolean;
        note: boolean;
        details: boolean;
    };
    const baseAttempt: Attempt = {
        coffee: requested.coffee,
        rating: requested.rating,
        tags: requested.tags,
        rate: requested.flow,
        chart: requested.flow ? chartPairFull : traceFull,
        stages: true,
        note: requested.note,
        details: requested.details
    };
    const shrinkAttempt: Attempt = {
        ...baseAttempt,
        chart: requested.flow ? chartPairMin : traceMin
    };
    const attempts: Attempt[] = [baseAttempt, shrinkAttempt];
    const declineOrder: (keyof Pick<
        Attempt, "tags" | "rating" | "coffee" | "note" | "details" | "rate"
    >)[] = ["tags", "rating", "coffee", "note", "details", "rate"];
    const withoutStages: Attempt = {...shrinkAttempt, stages: false};
    attempts.push(withoutStages);
    let declining = withoutStages;
    for (const key of declineOrder) {
        if (!declining[key]) continue;
        declining = {
            ...declining,
            [key]: false,
            ...(key === "rate" ? {chart: traceMin} : {})
        };
        attempts.push(declining);
    }

    let chosen = attempts[attempts.length - 1];
    let measured = build(
        chosen.coffee, chosen.rating, chosen.tags, chosen.rate, chosen.chart, chosen.stages,
        chosen.note, chosen.details
    );
    for (const attempt of attempts) {
        const next = build(
            attempt.coffee, attempt.rating, attempt.tags, attempt.rate,
            attempt.chart, attempt.stages, attempt.note, attempt.details
        );
        if (
            next.required <= contentHeight
            && next.horizontal.fits
            && (attempt.tags === false || next.tagLineCount > 0)
        ) {
            chosen = attempt;
            measured = next;
            break;
        }
    }

    const margin = contentHeight - measured.required;
    const chartCap = chosen.rate ? STORY_CHART_PAIR_CAP : STORY_TRACE_CAP;
    const grownCharts = growAllowances(margin, [
        {id: "charts", floor: chosen.chart, cap: chartCap, share: 1}
    ]);
    const afterCharts = margin - grownCharts.spent;
    const bands = chosen.stages ? storyBands(afterCharts, ladderRows) : {
        barHeight: BAR_FLOOR, rungGap: GAP_FLOOR, spent: 0
    };
    const afterBands = afterCharts - bands.spent;
    const grownGaps = growAllowances(afterBands, [
        {id: "sectionGap", floor: sectionGapFloor, cap: STORY_SECTION_GAP_CAP,
         share: measured.gapSlots}
    ]);
    const charts = storyChartHeights(
        grownCharts.values.get("charts") ?? chosen.chart,
        chosen.rate
    );
    // If all caps are reached, the true remainder is deliberate breathing room
    // from the card's centred content stack. It must not enter the safe top or
    // bottom bands, which are reserved for platform story furniture.
    const requiredHeight = measured.required + grownCharts.spent + bands.spent + grownGaps.spent;

    return {
        contentHeight,
        fontScale,
        surroundingHeight: surroundingHeight(
            measured.surroundingRows,
            grownGaps.values.get("sectionGap") ?? sectionGapFloor
        ),
        requiredHeight,
        traceHeight: charts.trace,
        // The record screen already decided the hierarchy: the cumulative
        // trace is the thing somebody brewed, and the flow chart is evidence
        // beneath it. The story card scales that same 150:84 pair up or down
        // as one block instead of inventing a tighter composition that can
        // make the secondary chart taller than the primary one.
        rateHeight: chosen.rate ? charts.rate : 0,
        rateTopGap: chosen.rate ? rateTopGap : 0,
        rateBottomGap: chosen.rate ? rateBottomGap : 0,
        sectionGap: grownGaps.values.get("sectionGap") ?? sectionGapFloor,
        gapSlots: measured.gapSlots,
        capturePadding: STORY_CAPTURE_PADDING,
        ladderTopGap: chosen.stages ? ladderTopGap : 0,
        barHeight: bands.barHeight,
        rungGap: bands.rungGap,
        showRateChart: chosen.rate,
        showCoffee: chosen.coffee,
        showRating: chosen.rating,
        shownTagCount: chosen.tags ? shownTags.length : 0,
        tagRows: measured.tagLineCount,
        showSummaryNote: chosen.note,
        showFigureDetails: chosen.details,
        showGrindRecipeBadge: chosen.details && canShowGrindRecipeBadge,
        showDrawdownRateBadge: chosen.details && canShowDrawdownRateBadge,
        showBypassBadge: canShowBypassBadge,
        showStages: chosen.stages,
        declinedContent: {
            coffee:  requested.coffee && !chosen.coffee,
            rating:  requested.rating && !chosen.rating,
            tags:    requested.tags && !chosen.tags,
            note:    requested.note && !chosen.note,
            details: requested.details && !chosen.details,
            flow:    requested.flow && !chosen.rate
        },
        margin: contentHeight - requiredHeight
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

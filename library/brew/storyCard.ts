import type {BrewRecord} from "./BrewRecord";
import {BAR_CAP, BAR_FLOOR, GAP_CAP, GAP_FLOOR} from "./bands";
import {resolvedOrigin, resolvedProcess} from "./beanTags";
import {
    RATE_BOTTOM_GAP,
    RATE_HEIGHT,
    RATE_TOP_GAP
} from "./rateChartGeometry";
import {stageLadderRungMinHeight} from "./stageLadderGeometry";
import {
    BREW_FIGURE_DETAIL_VALUE_SIZE,
    BREW_FIGURE_INTERNAL_GAP,
    BREW_FIGURE_LABEL_SIZE,
    BREW_FIGURE_ROW_GAP,
    BREW_FIGURE_VALUE_SIZE
} from "@/library/brew/figureGeometry";
import {dotoRowHeight, DOTO_MAX_FONT_SCALE} from "@/library/dotoMetrics";

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
    tags?: string[];
    tagCount?: number;
    hasBypass?: boolean;
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
    const ordered = STORY_CONTENT_KEYS.filter((key) => {
        for (const hiddenKey of hidden) {
            if (hiddenKey === key) return true;
        }
        return false;
    });
    return ordered.length === 0 ? "" : JSON.stringify(ordered);
}

export type StorySummaryBudget = {
    contentHeight: number;
    surroundingHeight: number;
    requiredHeight: number;
    traceHeight: number;
    rateHeight: number;
    rateTopGap: number;
    rateBottomGap: number;
    sectionGap: number;
    capturePadding: number;
    ladderTopGap: number;
    barHeight: number;
    rungGap: number;
    showRateChart: boolean;
    showCoffee: boolean;
    showRating: boolean;
    shownTagCount: number;
    tagRows: number;
    showStages: boolean;
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
 * The flow chart is a secondary chart with one label row and no stage detail.
 * Five thirds of its shared 84 pt record-screen height keeps flat rates
 * from being magnified into drama while still making the line easier to read.
 */
const STORY_RATE_CAP = 140;
/**
 * Section gaps spend what the two charts should not take. Ninety points is
 * reserved for cases where the rate chart was dropped, matching the default
 * trace's weight without exceeding it, so it still reads as row grouping rather
 * than a blank band of its own.
 */
const STORY_SECTION_GAP_CAP = 90;
export const STORY_LADDER_TOP_GAP = 8;
export const STORY_GAP = 8;
export const STORY_TEST_WIDTHS = [270, 281, 300, 320, 343, 360, 375, 393, 430];
export const STORY_TEST_FONT_SCALES = [1, 1.2, DOTO_MAX_FONT_SCALE];

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
type StoryRows = {
    header: number;
    name: number;
    figures: number;
    coffee: number;
    rating: number;
    tag: number;
};

function figureRowHeight(valueSize: number, fontScale: number): number {
    return dotoRowHeight(BREW_FIGURE_LABEL_SIZE, fontScale)
        + BREW_FIGURE_INTERNAL_GAP
        + dotoRowHeight(valueSize, fontScale);
}

function storyRows(fontScale: number): StoryRows {
    return {
        header: Math.max(
            dotoRowHeight(STORY_HEADER_MARK, fontScale),
            dotoRowHeight(STORY_HEADER_DATE, fontScale)
        ),
        name: dotoRowHeight(STORY_NAME_SIZE, fontScale) + STORY_NAME_MARGIN,
        figures: figureRowHeight(BREW_FIGURE_VALUE_SIZE, fontScale),
        coffee: dotoRowHeight(STORY_COFFEE_SIZE, fontScale),
        rating: Math.ceil(Math.max(STORY_RATING_SIZE, dotoRowHeight(11, fontScale))),
        tag: dotoRowHeight(STORY_TAG_SIZE, fontScale) + STORY_TAG_PAD_Y * 2
    };
}

function tagWidth(tag: string, fontScale: number): number {
    const size = Math.max(11, STORY_TAG_SIZE) * Math.min(fontScale, DOTO_MAX_FONT_SCALE);
    const glyphs = tag.length * size * 0.75;
    const tracking = Math.max(0, tag.length - 1) * 1.2;
    return Math.ceil(glyphs + tracking + STORY_TAG_PAD_X * 2);
}

function tagRows(tags: string[], width: number, fontScale: number): number {
    if (tags.length === 0) return 0;
    const innerWidth = Math.max(0, width - 32);
    let rows = 1;
    let used = 0;
    const widths = tags.map((tag) => tagWidth(tag, fontScale));
    for (const next of widths) {
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
        tagCount = tags.length, hasBypass = false, figureExtraRows = 0,
        hasSummaryNote = false, stagesUnavailable = false,
        fontScale = 1
    }: StorySummaryBudgetInput
): StorySummaryBudget {
    const frame = storyFrame(width);
    const contentHeight = frame.height - frame.safeTop - frame.safeBottom;
    const rows = storyRows(fontScale);
    const shownTags = tags.slice(0, Math.min(tagCount, 4));
    const moreTags = Math.max(0, tagCount - shownTags.length);
    const tagsForWidth = moreTags > 0
        ? [...shownTags, "+".repeat(STORY_TAG_MORE_CHARS)]
        : shownTags;
    const ladderRows = stages + (hasBypass ? 1 : 0);

    const build = (
        showCoffee: boolean,
        showRating: boolean,
        showTags: boolean,
        showRate: boolean,
        traceHeight: number,
        showStages: boolean
    ) => {
        const tagLineCount = showTags ? tagRows(tagsForWidth, width, fontScale) : 0;
        const optionalRows = [
            showCoffee ? rows.coffee : 0,
            showRating ? rows.rating : 0,
            showTags ? rows.tag * tagLineCount : 0
        ].filter((row) => row > 0);
        const surroundingRows = [rows.header, ...optionalRows];
        const around = surroundingHeight(surroundingRows);
        const ladder = showStages
            ? STORY_LADDER_TOP_GAP
                + (stagesUnavailable
                    ? dotoRowHeight(11, fontScale)
                    : ladderRows * stageLadderRungMinHeight(fontScale, BAR_FLOOR, GAP_FLOOR))
            : 0;
        const figureBlock = rows.figures
            + Math.max(0, figureExtraRows) * (
                BREW_FIGURE_ROW_GAP
                + figureRowHeight(BREW_FIGURE_DETAIL_VALUE_SIZE, fontScale)
            )
            + (hasSummaryNote ? dotoRowHeight(11, fontScale) + 8 : 0);
        const summary = STORY_CAPTURE_PADDING * 2
            + rows.name
            + traceHeight
            + (showRate ? RATE_TOP_GAP + RATE_HEIGHT + RATE_BOTTOM_GAP : 0)
            + figureBlock
            + ladder;
        return {
            around,
            summary,
            required: around + summary,
            tagLineCount,
            gapSlots: surroundingRows.length
        };
    };

    const attempts: {
        coffee: boolean;
        rating: boolean;
        tags: boolean;
        rate: boolean;
        trace: number;
        stages: boolean;
    }[] = [
        {coffee: hasCoffee, rating: hasRating, tags: tagCount > 0, rate: hasRateChart,
         trace: STORY_TRACE_HEIGHT, stages: true},
        {coffee: hasCoffee, rating: hasRating, tags: false, rate: hasRateChart,
         trace: STORY_TRACE_HEIGHT, stages: true},
        {coffee: hasCoffee, rating: false, tags: false, rate: hasRateChart,
         trace: STORY_TRACE_HEIGHT, stages: true},
        {coffee: false, rating: false, tags: false, rate: hasRateChart,
         trace: STORY_TRACE_HEIGHT, stages: true},
        {coffee: false, rating: false, tags: false, rate: false,
         trace: STORY_TRACE_HEIGHT, stages: true},
        {coffee: false, rating: false, tags: false, rate: false,
         trace: STORY_TRACE_MIN_HEIGHT, stages: true},
        {coffee: false, rating: false, tags: false, rate: false,
         trace: STORY_TRACE_MIN_HEIGHT, stages: false}
    ];

    let chosen = attempts[attempts.length - 1];
    let measured = build(
        chosen.coffee, chosen.rating, chosen.tags, chosen.rate, chosen.trace, chosen.stages
    );
    for (const attempt of attempts) {
        const next = build(
            attempt.coffee, attempt.rating, attempt.tags, attempt.rate,
            attempt.trace, attempt.stages
        );
        if (next.required <= contentHeight) {
            chosen = attempt;
            measured = next;
            break;
        }
    }

    const margin = contentHeight - measured.required;
    const bands = chosen.stages ? storyBands(margin, ladderRows) : {
        barHeight: BAR_FLOOR, rungGap: GAP_FLOOR, spent: 0
    };
    const afterBands = margin - bands.spent;
    const grown = growAllowances(afterBands, [
        {id: "trace", floor: chosen.trace, cap: STORY_TRACE_CAP, share: 1},
        ...(chosen.rate
            ? [{id: "rate", floor: RATE_HEIGHT, cap: STORY_RATE_CAP, share: 1}]
            : []),
        {id: "sectionGap", floor: STORY_GAP, cap: STORY_SECTION_GAP_CAP,
         share: measured.gapSlots}
    ]);
    // If all caps are reached, the true remainder is deliberate breathing room
    // from the card's centred content stack. It must not enter the safe top or
    // bottom bands, which are reserved for platform story furniture.
    const requiredHeight = measured.required + bands.spent + grown.spent;

    return {
        contentHeight,
        surroundingHeight: measured.around
            + ((grown.values.get("sectionGap") ?? STORY_GAP) - STORY_GAP)
              * measured.gapSlots,
        requiredHeight,
        traceHeight: grown.values.get("trace") ?? chosen.trace,
        rateHeight: chosen.rate ? grown.values.get("rate") ?? RATE_HEIGHT : 0,
        rateTopGap: chosen.rate ? RATE_TOP_GAP : 0,
        rateBottomGap: chosen.rate ? RATE_BOTTOM_GAP : 0,
        sectionGap: grown.values.get("sectionGap") ?? STORY_GAP,
        capturePadding: STORY_CAPTURE_PADDING,
        ladderTopGap: chosen.stages ? STORY_LADDER_TOP_GAP : 0,
        barHeight: bands.barHeight,
        rungGap: bands.rungGap,
        showRateChart: chosen.rate,
        showCoffee: chosen.coffee,
        showRating: chosen.rating,
        shownTagCount: chosen.tags ? shownTags.length : 0,
        tagRows: measured.tagLineCount,
        showStages: chosen.stages,
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

import {
    STORY_ASPECT, STORY_SAFE_BOTTOM, STORY_SAFE_TOP,
    STORY_CAPTURE_PADDING,
    STORY_CONTENT_KEYS,
    STORY_FIT_MARGIN,
    STORY_TRACE_HEIGHT,
    STORY_TEST_FONT_SCALES, STORY_TEST_WIDTHS,
    offeredStoryContent,
    storyCoffeeLine,
    storyContentFacts,
    storyFrame,
    storyChartWidth,
    storyHeaderLayout,
    storyHiddenFromSetting,
    storyHiddenToSetting,
    storyHorizontalFit,
    storySummaryBudget,
    storyTextContentWidth,
    storyTextScale,
    type StorySummaryBudget
} from "../storyCard";
import {BAR_FLOOR, GAP_FLOOR} from "../bands";
import type {BrewRecord} from "../BrewRecord";
import {RATE_BOTTOM_GAP, RATE_HEIGHT, RATE_TOP_GAP, TRACE_HEIGHT} from "../rateChartGeometry";
import {
    BREW_FIGURE_DETAIL_VALUE_SIZE,
    BREW_FIGURE_ADJUSTMENT_ROW_GAP,
    BREW_FIGURE_INTERNAL_GAP,
    BREW_FIGURE_LABEL_SIZE,
    BREW_FIGURE_ROW_GAP,
    BREW_FIGURE_VALUE_SIZE,
    brewFigureBadgeGeometry,
    brewFigureBadgeWidth,
    brewFigureTextGeometry,
    brewFigureUsesFourColumns,
    brewRecipeUnits,
    type BrewRecipeInputs
} from "../figureGeometry";
import {formatBrewDate, formatBrewTime} from "../brewFormat";
import {MACHINE_CARD_MAX_STAGES} from "@/library/cardWriteErrors";
import {dotoRowHeight, dotoTextWidth, DOTO_MAX_FONT_SCALE, DOTO_MIN_FONT_SIZE} from "@/library/dotoMetrics";
import {stageLadderRungMinHeight} from "../stageLadderGeometry";

const brew = (over: Partial<BrewRecord> = {}) =>
    ({id: "a", ...over}) as BrewRecord;

const STORY_NAME_SIZE = 13;
const STORY_NAME_MARGIN = 12;

type SweepInput = Parameters<typeof storySummaryBudget>[0];
const SWEEP_MAX_STAGES = 17;
const RECIPE_CONTEXTS: (BrewRecipeInputs | undefined)[] = [
    undefined,
    {dose: 31},
    {ratio: 100},
    {dose: 31, ratio: 100},
    {dose: 15.5, ratio: 17, adjustedFromDose: 31, adjustedFromRatio: 100}
];

function storyMaskInputs(width: number, stages: number, fontScale: number): SweepInput[] {
    return RECIPE_CONTEXTS.flatMap((recipeInputs) => Array.from({length: 128}, (_, mask) => ({
        width,
        stages,
        recipeInputs,
        hasCoffee:      (mask & 1) !== 0,
        hasRating:      (mask & 2) !== 0,
        tags:           (mask & 4) !== 0
            ? ["Ethiopia", "washed", "late drawdown", "long tag wraps"]
            : [],
        hasSummaryNote: (mask & 8) !== 0,
        figureExtraRows: (mask & 16) !== 0 ? 1 : 0,
        hasRateChart:   (mask & 32) !== 0,
        hasBypass:      (mask & 64) !== 0,
        hasGrindRecipeBadge: (mask & 16) !== 0,
        drawdownRate:   (mask & 16) !== 0 ? 2.1 : null,
        fontScale
    })));
}

function trueRecipeHeight(input: SweepInput, budget: StorySummaryBudget): number {
    const units = budget.showRecipeInputs ? brewRecipeUnits(input.recipeInputs) : [];
    if (units.length === 0) return 0;
    const scale = storyTextScale(input.width);
    const fontScale = input.fontScale ?? 1;
    const badge = brewFigureBadgeGeometry(scale);
    const segments = units.map((unit) => ({
        base: dotoTextWidth(unit.label, 12 * scale, fontScale, 1.2 * scale)
            + 4 * scale + dotoTextWidth(unit.value, 12 * scale, fontScale, 1.2 * scale),
        badge: unit.badge === null ? 0 : brewFigureBadgeWidth(unit.badge, fontScale, scale),
        hasBadge: unit.badge !== null
    }));
    const twoColumnWidth = (storyTextContentWidth(input.width) - 16 * scale) / 2;
    const columns = units.length === 2 && segments.every((unit) =>
        Math.max(unit.base, unit.badge) + STORY_FIT_MARGIN <= twoColumnWidth) ? 2 : 1;
    const columnWidth = columns === 2 ? twoColumnWidth : storyTextContentWidth(input.width);
    const lineHeight = dotoRowHeight(12 * scale, fontScale);
    const badgeHeight = dotoRowHeight(badge.fontSize, fontScale, DOTO_MIN_FONT_SIZE * scale)
        + 2 * (badge.paddingVertical + badge.borderWidth);
    const heights = segments.map((unit) => !unit.hasBadge ? lineHeight
        : unit.base + badge.gap + unit.badge + STORY_FIT_MARGIN <= columnWidth
            ? Math.max(lineHeight, badgeHeight)
            : lineHeight + badge.gap + badgeHeight);
    return columns === 2 ? Math.max(...heights) + 8 * scale
        : heights.reduce((sum, height) => sum + height, 0)
            + (units.length - 1) * 6 * scale + 8 * scale;
}

function trueDrawnHeight(input: SweepInput, budget: ReturnType<typeof storySummaryBudget>) {
    const fontScale = input.fontScale ?? 1;
    const textScale = storyTextScale(input.width);
    const nameHeight = dotoRowHeight(STORY_NAME_SIZE * textScale, fontScale)
        + STORY_NAME_MARGIN * textScale;
    const baseFigures = dotoRowHeight(BREW_FIGURE_LABEL_SIZE * textScale, fontScale)
        + BREW_FIGURE_INTERNAL_GAP
        + dotoRowHeight(BREW_FIGURE_VALUE_SIZE * textScale, fontScale);
    const detailsUseFourColumns = brewFigureUsesFourColumns(
        fontScale,
        input.width - STORY_CAPTURE_PADDING * 2
    );
    const hasQuietLine = budget.showGrindRecipeBadge
        || (
            budget.showDrawdownRateBadge
            && (!detailsUseFourColumns || budget.showGrindRecipeBadge)
        );
    const quietLineHeight = hasQuietLine
        ? BREW_FIGURE_INTERNAL_GAP + Math.max(
            dotoRowHeight(11 * textScale, fontScale, 11 * textScale)
                + (1 * textScale + 1 * textScale) * 2,
            dotoRowHeight(11 * textScale, fontScale)
        )
        : 0;
    const detailFigures = budget.showFigureDetails !== false
        ? Math.max(0, input.figureExtraRows ?? 0) * (
            BREW_FIGURE_ROW_GAP
            + dotoRowHeight(BREW_FIGURE_LABEL_SIZE * textScale, fontScale)
            + BREW_FIGURE_INTERNAL_GAP
            + dotoRowHeight(BREW_FIGURE_DETAIL_VALUE_SIZE * textScale, fontScale)
            + quietLineHeight
        )
        : 0;
    const adjustmentFigures = budget.showFigureDetails !== false
        ? Math.max(0, input.figureAdjustmentRows ?? 0) * (
            BREW_FIGURE_ADJUSTMENT_ROW_GAP
            + dotoRowHeight(BREW_FIGURE_LABEL_SIZE * textScale, fontScale)
            + BREW_FIGURE_INTERNAL_GAP
            + dotoRowHeight(BREW_FIGURE_DETAIL_VALUE_SIZE * textScale, fontScale)
            + BREW_FIGURE_INTERNAL_GAP
            + Math.max(
                dotoRowHeight(11 * textScale, fontScale, 11 * textScale)
                    + (1 * textScale + 1 * textScale) * 2,
                dotoRowHeight(11 * textScale, fontScale)
            )
        )
        : 0;
    const noteHeight = budget.showSummaryNote !== false && input.hasSummaryNote === true
        ? dotoRowHeight(11 * textScale, fontScale) + 8
        : 0;
    const ladderRows = input.stages + (input.hasBypass === true ? 1 : 0);
    const ladderHeight = budget.showStages
        ? budget.ladderTopGap
            + (input.stagesUnavailable === true
                ? dotoRowHeight(11, fontScale)
                : ladderRows * stageLadderRungMinHeight(
                    fontScale, budget.barHeight, budget.rungGap
                ))
        : 0;
    const rateHeight = budget.showRateChart
        ? budget.rateTopGap + budget.rateHeight + budget.rateBottomGap
        : 0;

    return budget.surroundingHeight
        + STORY_CAPTURE_PADDING * 2
        + nameHeight
        + trueRecipeHeight(input, budget)
        + budget.traceHeight
        + rateHeight
        + baseFigures
        + detailFigures
        + adjustmentFigures
        + noteHeight
        + ladderHeight;
}

type StorySweep = {worst: number; cell: SweepInput; visited: number; widths: Set<number>};
let cachedSweep: StorySweep | undefined;

function storySweep(): StorySweep {
    if (cachedSweep !== undefined) return cachedSweep;
    let worst = -1;
    let cell: SweepInput | null = null;
    let visited = 0;
    const widths = new Set<number>();
    for (let stages = 1; stages <= SWEEP_MAX_STAGES; stages += 1) {
        for (const fontScale of STORY_TEST_FONT_SCALES) {
            for (const width of STORY_TEST_WIDTHS) {
                widths.add(width);
                for (const input of storyMaskInputs(width, stages, fontScale)) {
                    visited += 1;
                    const budget = storySummaryBudget(input);
                    const drawn = trueDrawnHeight(input, budget);
                    const horizontal = storyHorizontalFit(input, budget);
                    const optionalRows = [
                        budget.showCoffee, budget.showRating, budget.shownTagCount > 0
                    ].filter(Boolean).length;
                    if (!(drawn <= budget.contentHeight) || !(budget.requiredHeight + 0.001 >= drawn)
                        || !(budget.margin >= 0) || !horizontal.fits
                        || budget.gapSlots !== 1 + optionalRows) {
                        throw new Error(`Story sweep fit failure: ${JSON.stringify({
                            input, budget, drawn, horizontal
                        })}`);
                    }
                    if (budget.declinedContent.recipe && (
                        budget.showRecipeInputs || budget.showStages || budget.showRateChart
                        || budget.showFigureDetails || budget.showCoffee || budget.showRating
                        || budget.showSummaryNote || budget.shownTagCount !== 0
                    )) {
                        throw new Error(`Recipe declined before optional content: ${JSON.stringify(input)}`);
                    }
                    if (budget.margin > worst) {
                        worst = budget.margin;
                        cell = input;
                    }
                }
            }
        }
    }
    if (cell === null) throw new Error("story slack sweep visited no cells");
    cachedSweep = {worst, cell, visited, widths};
    return cachedSweep;
}

function expectAllMasksFit(widths: number[]) {
    const sweep = storySweep();
    for (const width of widths) {
        expect(sweep.widths.has(width)).toBe(true);
    }
}

describe("the frame", () => {
    it("is nine by sixteen", () => {
        const frame = storyFrame(1080);
        expect(frame.width).toBe(1080);
        expect(frame.height).toBe(1920);
        expect(frame.height / frame.width).toBeCloseTo(STORY_ASPECT, 6);
    });

    it("rounds the height, so the bottom edge is a whole pixel row", () => {
        const frame = storyFrame(393);
        expect(Number.isInteger(frame.height)).toBe(true);
        expect(frame.height).toBe(Math.round(393 * STORY_ASPECT));
    });

    it("pins the near full bleed safe bands", () => {
        expect(STORY_SAFE_TOP).toBe(0.03);
        expect(STORY_SAFE_BOTTOM).toBe(0.05);
    });

    it("reserves only the narrow bands this near full bleed card accepts", () => {
        const frame = storyFrame(1080);
        expect(frame.safeTop).toBe(Math.round(1920 * STORY_SAFE_TOP));
        expect(frame.safeBottom).toBe(Math.round(1920 * STORY_SAFE_BOTTOM));
    });

    it("leaves the middle of the frame for the brew", () => {
        const frame = storyFrame(1080);
        const content = frame.height - frame.safeTop - frame.safeBottom;
        expect(content).toBeGreaterThan(frame.height / 2);
    });

    it("gives the bottom band more room than the top", () => {
        // The reply field and the action row still live down there, even when
        // the card deliberately lets them graze the very edge.
        const frame = storyFrame(1080);
        expect(frame.safeBottom).toBeGreaterThan(frame.safeTop);
    });

    it("makes story charts wider than the text content width", () => {
        expect(storyChartWidth(342)).toBeGreaterThan(storyTextContentWidth(342));
    });

    it("keeps a two stage story card inside the readable band", () => {
        const budget = storySummaryBudget({
            width: 360,
            stages: 2,
            hasRateChart: true,
            hasCoffee: true,
            hasRating: true,
            tags: ["a", "b", "c", "d"],
            fontScale: 1
        });

        expect(budget.requiredHeight).toBeLessThanOrEqual(budget.contentHeight);
    });

    it("grants the flow chart at a real height-constrained phone card width", () => {
        const budget = storySummaryBudget({
            width: 349,
            stages: 4,
            hasRateChart: true,
            hasCoffee: true,
            hasRating: true,
            tags: ["filter", "washed"],
            hasBypass: true,
            figureExtraRows: 1,
            fontScale: 1
        });

        expect(budget.requiredHeight).toBeLessThanOrEqual(budget.contentHeight);
        expect(budget.showFigureDetails).toBe(true);
        expect(budget.showRateChart).toBe(true);
    });

    it("shrinks the trace before it drops an enabled flow chart", () => {
        const budget = storySummaryBudget({
            width: 270,
            stages: 4,
            hasRateChart: true,
            hasCoffee: true,
            hasRating: true,
            tags: ["filter", "washed"],
            hasBypass: true,
            figureExtraRows: 1,
            fontScale: 1
        });

        expect(budget.showRateChart).toBe(true);
        expect(budget.traceHeight).toBeLessThan(STORY_TRACE_HEIGHT);
    });

    it("keeps the story charts in the record screen's proportion", () => {
        const budget = storySummaryBudget({
            width: 342,
            stages: 4,
            hasRateChart: true,
            hasCoffee: true,
            hasRating: true,
            tags: ["filter", "washed"],
            hasBypass: true,
            figureExtraRows: 1,
            fontScale: 1
        });

        expect(budget.showRateChart).toBe(true);
        expect(budget.traceHeight / budget.rateHeight)
            .toBeCloseTo(TRACE_HEIGHT / RATE_HEIGHT, 1);
    });

    it("keeps the primary trace taller than the secondary flow chart", () => {
        for (let stages = 1; stages <= MACHINE_CARD_MAX_STAGES; stages += 1) {
            for (const fontScale of STORY_TEST_FONT_SCALES) {
                for (const width of STORY_TEST_WIDTHS) {
                    for (const input of storyMaskInputs(width, stages, fontScale)) {
                        const budget = storySummaryBudget(input);

                        if (budget.showRateChart) {
                            expect(budget.traceHeight).toBeGreaterThan(budget.rateHeight);
                        }
                    }
                }
            }
        }
    });

    it("keeps content the user turned off out even when there is room", () => {
        const budget = storySummaryBudget({
            width: 600,
            stages: 4,
            hasRateChart: false,
            hasCoffee: true,
            hasRating: true,
            tags: ["filter", "washed"],
            hasBypass: true,
            figureExtraRows: 1,
            fontScale: 1
        });

        expect(budget.showRateChart).toBe(false);
        expect(budget.rateHeight).toBe(0);
        expect(budget.declinedContent.flow).toBe(false);
    });

    it("reports enabled content that cannot fit at its minimum", () => {
        const budget = storySummaryBudget({
            width: 120,
            stages: 10,
            hasRateChart: true,
            hasCoffee: true,
            hasRating: true,
            tags: ["filter", "washed"],
            hasBypass: true,
            figureExtraRows: 1,
            hasSummaryNote: true,
            fontScale: DOTO_MAX_FONT_SCALE
        });

        expect(budget.showRateChart).toBe(false);
        expect(budget.declinedContent.flow).toBe(true);
    });

    it("spends spare story room on the ladder bands", () => {
        const budget = storySummaryBudget({
            width: 600,
            stages: 2,
            hasRateChart: true,
            hasCoffee: true,
            hasRating: true,
            tags: ["a", "b", "c", "d"],
            fontScale: 1
        });

        expect(budget.barHeight).toBeGreaterThan(BAR_FLOOR);
        expect(budget.rungGap).toBeGreaterThan(GAP_FLOOR);
        expect(budget.requiredHeight).toBeLessThanOrEqual(budget.contentHeight);
    });

    it("fits every story sheet width, card stage count and bounded font scale", () => {
        for (let stages = 1; stages <= MACHINE_CARD_MAX_STAGES; stages += 1) {
            for (const fontScale of STORY_TEST_FONT_SCALES) {
                for (const width of STORY_TEST_WIDTHS) {
                    const budget = storySummaryBudget({
                        width,
                        stages,
                        hasRateChart: true,
                        hasCoffee: true,
                        hasRating: true,
                        tags: ["Ethiopia", "washed", "late drawdown", "long tag wraps"],
                        fontScale,
                        hasBypass: true,
                        figureExtraRows: 1,
                        drawdownRate: 2.1
                    });
                    expect(budget.requiredHeight).toBeLessThanOrEqual(budget.contentHeight);
                }
            }
        }
    });

    it("keeps the budget's section gap slots in step with the rendered card", () => {
        expect(storySweep().visited).toBe(565_760);
    });

    it("keeps the height the story card really draws inside the safe band", () => {
        expectAllMasksFit(STORY_TEST_WIDTHS);
    });

    /**
     * The cell count is stated as a literal rather than derived from the same
     * lists the sweep walks. Derived from them it would be a tautology: cutting
     * STORY_TEST_WIDTHS to one entry shrinks both sides and still passes, which
     * is how a sweep silently stops covering anything. These literals are the
     * coverage this proof claims, so narrowing a list has to be deliberate.
     */
    it("keeps every drawn story row inside the card width", () => {
        const sweep = storySweep();

        expect(STORY_TEST_WIDTHS.length).toBe(13);
        expect(STORY_TEST_FONT_SCALES.length).toBe(4);
        expect(MACHINE_CARD_MAX_STAGES).toBe(10);
        expect(SWEEP_MAX_STAGES).toBe(17);
        expect(RECIPE_CONTEXTS).toHaveLength(5);
        expect(sweep.visited).toBe(565_760);
    });

    it("uses an explicit horizontal fit tolerance", () => {
        expect(STORY_FIT_MARGIN).toBeGreaterThan(0);
    });

    it("keeps the drawdown rate when the new rate column fits", () => {
        const budget = storySummaryBudget({
            width: 430,
            stages: 3,
            hasRateChart: true,
            hasCoffee: true,
            hasRating: true,
            tags: ["Ethiopia", "washed", "late drawdown", "long tag wraps"],
            hasSummaryNote: true,
            figureExtraRows: 1,
            hasBypass: true,
            drawdownRate: 2.1,
            fontScale: 1.2
        });

        expect(budget.showFigureDetails).toBe(true);
        expect(budget.showSummaryNote).toBe(true);
        expect(budget.showRateChart).toBe(true);
        expect(budget.showDrawdownRateBadge).toBe(true);
        expect(budget.margin).toBeGreaterThanOrEqual(0);
    });

    it("suppresses an oversized drawdown rate badge on the story card only", () => {
        const budget = storySummaryBudget({
            width: 430,
            stages: 2,
            hasRateChart: false,
            hasCoffee: false,
            hasRating: false,
            figureExtraRows: 1,
            drawdownRate: 999999999.9,
            fontScale: 1
        });

        expect(budget.showFigureDetails).toBe(true);
        expect(budget.showDrawdownRateBadge).toBe(false);
    });

    it("drops tags when one legal tag cannot fit a row by itself", () => {
        const budget = storySummaryBudget({
            width: 220,
            stages: 0,
            hasRateChart: false,
            hasCoffee: false,
            hasRating: false,
            tags: ["W".repeat(32)],
            fontScale: DOTO_MAX_FONT_SCALE
        });

        expect(budget.shownTagCount).toBe(0);
        expect(budget.tagRows).toBe(0);
    });

    it("suppresses the bypass badge when card-limit figures would overflow the story cell", () => {
        const input = {
            width: 185,
            stages: MACHINE_CARD_MAX_STAGES,
            hasRateChart: false,
            hasCoffee: false,
            hasRating: false,
            hasBypass: true,
            fontScale: DOTO_MAX_FONT_SCALE
        };
        const budget = storySummaryBudget(input);
        const fit = storyHorizontalFit(input, budget);

        expect((budget as StorySummaryBudget & {showBypassBadge: boolean}).showBypassBadge)
            .toBe(false);
        expect(fit).toEqual(expect.objectContaining({fits: true}));
        expect(fit.widest).not.toBe("water value and bypass");
    });

    it("keeps the bypass badge when the actual stage-count maxima fit", () => {
        const budget = storySummaryBudget({
            width: 430,
            stages: 2,
            hasRateChart: false,
            hasCoffee: false,
            hasRating: false,
            hasBypass: true,
            fontScale: 1.2
        });
        const maxStageBudget = storySummaryBudget({
            width: 430,
            stages: MACHINE_CARD_MAX_STAGES,
            hasRateChart: false,
            hasCoffee: false,
            hasRating: false,
            hasBypass: true,
            fontScale: 1.2
        });

        expect(budget.showBypassBadge).toBe(true);
        expect(maxStageBudget.showBypassBadge).toBe(false);
    });

    it("counts the bypass badge beside the water figure", () => {
        const input = {
            width: 185,
            stages: 2,
            hasRateChart: false,
            hasCoffee: false,
            hasRating: false,
            hasBypass: true,
            fontScale: 1
        };
        const budget = storySummaryBudget(input);
        const fit = storyHorizontalFit(input, budget);

        expect(fit).toEqual(expect.objectContaining({
            fits: true,
            widest: "water value and bypass"
        }));
        expect(fit.width).toBeGreaterThan(30);
        expect(fit.width).toBeLessThanOrEqual(fit.limit);
    });

    it("counts the drawdown rate in its own detail column", () => {
        const input = {
            width: 430,
            stages: 2,
            hasRateChart: false,
            hasCoffee: false,
            hasRating: false,
            hasBypass: false,
            hasGrindRecipeBadge: false,
            figureExtraRows: 1,
            fontScale: 1
        };
        const budget = storySummaryBudget(input);
        const fit = storyHorizontalFit(input, budget);

        expect(budget.showFigureDetails).toBe(true);
        expect(budget.showDrawdownRateBadge).toBe(true);
        expect(fit).toEqual(expect.objectContaining({fits: true}));
        expect(fit.widest).not.toBe("drawdown value and rate");
        expect(fit.width).toBeLessThan(80);
        expect(fit.width + STORY_FIT_MARGIN).toBeLessThanOrEqual(fit.limit);
    });

    it("does not hand React Native an invalid reduced date font multiplier", () => {
        const header = storyHeaderLayout(185, 0.85);

        expect(header.dateMaxFontSizeMultiplier).toBe(DOTO_MAX_FONT_SCALE);
        expect(header.dateWidth).toBeLessThanOrEqual(185 - 36);
    });

    it("budgets figure badges with the same sub-one Doto floor the card draws", () => {
        const scale = storyTextScale(220);
        const badge = brewFigureBadgeGeometry(scale);
        const withoutFloor = dotoTextWidth(
            "RECIPE 80",
            badge.fontSize,
            0.85,
            badge.tracking,
            0
        ) + (badge.paddingHorizontal + badge.borderWidth) * 2;

        expect(brewFigureBadgeWidth("RECIPE 80", 0.85, scale)).toBeGreaterThan(withoutFloor);
    });

    it("reserves the date row height at the multiplier it can draw", () => {
        const header = storyHeaderLayout(185, 1);

        expect(header.stacked).toBe(true);
        expect(header.height).toBe(
            dotoRowHeight(header.markSize, 1)
            + 2
            + dotoRowHeight(header.dateSize, 1)
        );
    });

    it("keeps the default story date length tied to the real date formatters", () => {
        const when = `${formatBrewDate(new Date(2026, 8, 30, 6, 55).getTime())} · ${
            formatBrewTime(new Date(2026, 8, 30, 6, 55).getTime())
        }`;

        expect(when).toHaveLength("2026-09-30 · 06:55".length);
    });

    it("does not use the header's self-clamped date as horizontal proof", () => {
        const fit = storyHorizontalFit({
            width: 137,
            stages: 2,
            hasRateChart: false,
            hasCoffee: false,
            hasRating: false,
            hasBypass: false,
            fontScale: 1.4
        }, {showFigureDetails: false});

        expect(fit.widest).not.toMatch(/^header/);
    });

    it("keeps the real narrow-phone story width band inside the safe band", () => {
        expectAllMasksFit([185, 200, 220, 240]);
    });

    it("bounds slack after growing every story content mask", () => {
        const sweep = storySweep();

        expect(sweep.visited).toBe(565_760);
        expect(sweep.cell).toMatchObject({
            width: 430,
            stages: 8,
            fontScale: 1.2,
            hasCoffee: false,
            hasRating: false,
            tags: [],
            hasSummaryNote: false,
            figureExtraRows: 1,
            hasRateChart: false,
            hasBypass: false
        });
        // In the sparsest no-rate story, the trace cap now binds before the
        // near full bleed frame runs out of room. That remainder is centered
        // breathing room, not a failure to fit the rows that were requested.
        expect(sweep.worst).toBeLessThanOrEqual(236);
    });

    it("fits every story sheet width with no retained rate chart", () => {
        for (const width of STORY_TEST_WIDTHS) {
            for (let stages = 1; stages <= MACHINE_CARD_MAX_STAGES; stages += 1) {
                for (const fontScale of STORY_TEST_FONT_SCALES) {
                    const budget = storySummaryBudget({
                        width,
                        stages,
                        hasRateChart: false,
                        hasCoffee: true,
                        hasRating: true,
                        tags: ["Ethiopia", "washed", "late drawdown", "long tag wraps"],
                        fontScale,
                        hasBypass: true,
                        figureExtraRows: 1
                    });

                    expect(budget.requiredHeight).toBeLessThanOrEqual(budget.contentHeight);
                    expect(budget.showRateChart).toBe(false);
                }
            }
        }
    });

    it("budgets the deleted-recipe row when no stage snapshot is available", () => {
        const withoutNote = storySummaryBudget({
            width: 600,
            stages: 0,
            hasRateChart: false,
            hasCoffee: false,
            hasRating: false,
            stagesUnavailable: false
        });
        const withUnavailableRow = storySummaryBudget({
            width: 600,
            stages: 0,
            hasRateChart: false,
            hasCoffee: false,
            hasRating: false,
            stagesUnavailable: true
        });

        expect(withUnavailableRow.requiredHeight - withoutNote.requiredHeight)
            .toBe(dotoRowHeight(11, 1));
    });

    it("budgets the ended-on-machine note at narrow story widths", () => {
        const budget = storySummaryBudget({
            width: 270,
            stages: 0,
            hasRateChart: false,
            hasCoffee: false,
            hasRating: false,
            stagesUnavailable: true,
            hasSummaryNote: true,
            fontScale: 1.2
        });

        expect(budget.requiredHeight).toBeLessThanOrEqual(budget.contentHeight);
    });

    it("budgets the rate chart's top gap, drawn height and bottom gap separately", () => {
        const width = 600;
        const withRate = storySummaryBudget({
            width,
            stages: 0,
            hasRateChart: true,
            hasCoffee: false,
            hasRating: false
        });

        expect(withRate.rateHeight).toBe(132);
        expect(withRate.rateTopGap).toBe(RATE_TOP_GAP);
        expect(withRate.rateBottomGap).toBe(RATE_BOTTOM_GAP);

        const withoutRate = storySummaryBudget({
            width,
            stages: 0,
            hasRateChart: false,
            hasCoffee: false,
            hasRating: false
        });
        expect(withRate.requiredHeight - withoutRate.requiredHeight)
            .toBe(RATE_TOP_GAP + 132 + RATE_BOTTOM_GAP);
    });

    it("budgets one smaller figure row instead of the removed caption lines", () => {
        const withoutSecondRow = storySummaryBudget({
            width: 600,
            stages: 0,
            hasRateChart: false,
            hasCoffee: false,
            hasRating: false
        });
        const withSecondRow = storySummaryBudget({
            width: 600,
            stages: 0,
            hasRateChart: false,
            hasCoffee: false,
            hasRating: false,
            figureExtraRows: 1,
            hasGrindRecipeBadge: false,
            drawdownRate: null
        });

        expect(withSecondRow.requiredHeight - withoutSecondRow.requiredHeight)
            .toBe(BREW_FIGURE_ROW_GAP
                + dotoRowHeight(BREW_FIGURE_LABEL_SIZE, 1)
                + BREW_FIGURE_INTERNAL_GAP
                + dotoRowHeight(BREW_FIGURE_DETAIL_VALUE_SIZE, 1));
    });

    it("counts every wrapped adjustment row before keeping story details", () => {
        const base = {
            width:               240,
            stages:              1,
            fontScale:           1.2,
            hasRateChart:        true,
            hasCoffee:           false,
            hasRating:           false,
            tags:                [],
            hasSummaryNote:      false,
            hasBypass:           true,
            hasGrindRecipeBadge: true,
            drawdownRate:        2.1
        };
        const oldOneBlockCount = storySummaryBudget({
            ...base,
            figureExtraRows: 2
        });
        const measuredRows = storySummaryBudget({
            ...base,
            figureExtraRows:     1,
            figureAdjustmentRows: 4
        });

        expect(oldOneBlockCount.showFigureDetails).toBe(true);
        expect(oldOneBlockCount.declinedContent.details).toBe(false);
        expect(measuredRows.showFigureDetails).toBe(false);
        expect(measuredRows.declinedContent.details).toBe(true);
        expect(measuredRows.requiredHeight).toBeLessThanOrEqual(measuredRows.contentHeight);
    });

    it("budgets adjustment rows with the same vertical gap the wrapped row renders", () => {
        const input = {
            width:               600,
            stages:              0,
            hasRateChart:        false,
            hasCoffee:           false,
            hasRating:           false,
            figureAdjustmentRows: 1
        };
        const withoutAdjustment = storySummaryBudget({...input, figureAdjustmentRows: 0});
        const withAdjustment = storySummaryBudget(input);
        const renderedRowGap = brewFigureTextGeometry(storyTextScale(input.width))
            .adjustmentRowGap;

        expect(withAdjustment.requiredHeight - withoutAdjustment.requiredHeight)
            .toBe(renderedRowGap
                + dotoRowHeight(BREW_FIGURE_LABEL_SIZE, 1)
                + BREW_FIGURE_INTERNAL_GAP
                + dotoRowHeight(BREW_FIGURE_DETAIL_VALUE_SIZE, 1)
                + BREW_FIGURE_INTERNAL_GAP
                + Math.max(
                    dotoRowHeight(11, 1, 11) + 4,
                    dotoRowHeight(11, 1)
                ));
    });
});

describe("the coffee line", () => {
    it("says nothing at all when nobody has described the coffee", () => {
        expect(storyCoffeeLine(brew())).toBeNull();
    });

    it("joins what was said, in the order the vocabulary lists", () => {
        expect(storyCoffeeLine(brew({
            origin:       "Huila",
            roast:        "Medium",
            process:      "Washed",
            fermentation: "Lactic"
        }))).toBe("Huila · Medium · Washed · Lactic");
    });

    it("prints only the fields that were given", () => {
        expect(storyCoffeeLine(brew({roast: "Dark"}))).toBe("Dark");
    });

    it("counts the pod's origin, which the record never holds itself", () => {
        expect(storyCoffeeLine(brew({
            coffee: {name: "A pod", origin: "Yirgacheffe"}
        } as Partial<BrewRecord>))).toBe("Yirgacheffe");
    });

    it("prefers what the user asserted over what the pod claims", () => {
        expect(storyCoffeeLine(brew({
            origin: "Huila",
            coffee: {name: "A pod", origin: "Yirgacheffe"}
        } as Partial<BrewRecord>))).toBe("Huila");
    });

    it("reads a process out of the pod's free text when it plainly says one", () => {
        expect(storyCoffeeLine(brew({
            coffee: {name: "A pod", processing: "fully washed"}
        } as Partial<BrewRecord>))).toBe("Washed");
    });

    it("ignores a field that is only whitespace", () => {
        expect(storyCoffeeLine(brew({origin: "   "}))).toBeNull();
    });
});

describe("the story content chooser", () => {
    it.each([
        [{dose: 31}, true],
        [{ratio: 100}, true],
        [{dose: 15.5, ratio: 17, adjustedFromDose: 31, adjustedFromRatio: 100}, true],
        [undefined, false],
        [{dose: 0, ratio: NaN}, false],
        [{dose: -1, ratio: Infinity}, false]
    ] satisfies [BrewRecipeInputs | undefined, boolean][])(
        "offers only finite positive recipe inputs: %j", (recipeInputs, available) => {
            const input = {
                width: 600, stages: 0, fontScale: 1.4,
                hasRateChart: false, hasCoffee: false, hasRating: false, recipeInputs
            };
            const facts = storyContentFacts(input);
            expect(facts.recipe).toBe(available);
            expect(facts.details).toBe(false);
            const budget = storySummaryBudget(input);
            expect(budget.showRecipeInputs).toBe(available);
            expect(budget.declinedContent.recipe).toBe(false);
            expect(budget.requiredHeight).toBeCloseTo(trueDrawnHeight(input, budget), 6);
            const hidden = storySummaryBudget({...input, recipeInputs: undefined});
            expect(budget.requiredHeight - hidden.requiredHeight)
                .toBeCloseTo(trueRecipeHeight(input, budget), 6);
            expect(hidden.showRecipeInputs).toBe(false);
        }
    );

    it("keeps the content key vocabulary and old fixture refusals explicit", () => {
        expect(STORY_CONTENT_KEYS).toEqual([
            "coffee", "rating", "tags", "note", "details", "flow", "recipe"
        ]);
        expect(storySummaryBudget({
            width: 600, stages: 0,
            hasRateChart: false, hasCoffee: false, hasRating: false
        }).declinedContent).toEqual({
            coffee: false, rating: false, tags: false, note: false,
            details: false, flow: false, recipe: false
        });
    });

    it("offers recipe inputs independently of details", () => {
        const facts = storyContentFacts({
            hasRateChart: false, hasCoffee: false, hasRating: false,
            recipeInputs: {dose: 15, ratio: 16}
        });
        expect(offeredStoryContent(facts)).toEqual(["recipe"]);
        expect(storyHiddenFromSetting('["details"]').has("recipe")).toBe(false);
        expect(storyHiddenToSetting(["recipe"])).toBe('["recipe"]');
    });

    it("retains actual adjusted recipe inputs at large text when they fit", () => {
        const input = {
            width: 375, stages: 3, fontScale: 1.4,
            hasRateChart: false, hasCoffee: false, hasRating: false,
            recipeInputs: {dose: 31, ratio: 100, adjustedFromDose: 15, adjustedFromRatio: 16}
        };
        const budget = storySummaryBudget(input);
        expect(budget.showRecipeInputs).toBe(true);
        expect(budget.declinedContent.recipe).toBe(false);
        expect(budget.requiredHeight).toBeLessThanOrEqual(budget.contentHeight);
        expect(storyHorizontalFit(input, budget).fits).toBe(true);
    });

    it("declines recipe inputs last without changing the stored preference", () => {
        const setting = '["details"]';
        const input = {
            width: 120, stages: 3, fontScale: 1.4,
            hasRateChart: true, hasCoffee: true, hasRating: true,
            tags: ["washed"], hasSummaryNote: true, figureExtraRows: 1,
            recipeInputs: {dose: 31, ratio: 100}
        };
        const budget = storySummaryBudget(input);
        expect(budget.showRecipeInputs).toBe(false);
        expect(budget.declinedContent.recipe).toBe(true);
        expect(storyHiddenToSetting(storyHiddenFromSetting(setting))).toBe(setting);
        expect(budget).toMatchObject({
            showStages: false, showRateChart: false, showFigureDetails: false,
            showCoffee: false, showRating: false, showSummaryNote: false, shownTagCount: 0
        });
    });

    it("offers only the content the budget input says exists", () => {
        const facts = storyContentFacts({
            hasRateChart: true,
            hasCoffee: false,
            hasRating: true,
            tags: [],
            hasSummaryNote: false,
            figureExtraRows: 1
        });

        expect(offeredStoryContent(facts)).toEqual(["rating", "details", "flow"]);
    });

    it("round trips the hidden sections through one setting string", () => {
        const setting = storyHiddenToSetting(["note", "coffee", "flow"]);

        expect(setting).toBe("[\"coffee\",\"note\",\"flow\"]");
        expect([...storyHiddenFromSetting(setting)]).toEqual(["coffee", "note", "flow"]);
    });

    it("serializes every hidden section from a one-shot iterator", () => {
        function* hiddenSections() {
            yield "rating" as const;
            yield "details" as const;
            yield "flow" as const;
            yield "coffee" as const;
            yield "tags" as const;
            yield "note" as const;
            yield "recipe" as const;
        }

        const setting = storyHiddenToSetting(hiddenSections());

        expect(JSON.parse(setting)).toEqual([...STORY_CONTENT_KEYS]);
    });

    it("ignores unknown hidden sections from an old or edited setting", () => {
        expect([...storyHiddenFromSetting("[\"coffee\",\"likes\",\"tags\"]")])
            .toEqual(["coffee", "tags"]);
    });

    it("ignores a stored hidden-section setting that is not JSON", () => {
        expect([...storyHiddenFromSetting("not json")]).toEqual([]);
    });
});

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
    storyHeaderLayout,
    storyHiddenFromSetting,
    storyHiddenToSetting,
    storyHorizontalFit,
    storySummaryBudget,
    storyTextScale,
    type StorySummaryBudget
} from "../storyCard";
import {BAR_FLOOR, GAP_FLOOR} from "../bands";
import type {BrewRecord} from "../BrewRecord";
import {RATE_BOTTOM_GAP, RATE_HEIGHT, RATE_TOP_GAP, TRACE_HEIGHT} from "../rateChartGeometry";
import {
    BREW_FIGURE_DETAIL_VALUE_SIZE,
    BREW_FIGURE_INTERNAL_GAP,
    BREW_FIGURE_LABEL_SIZE,
    BREW_FIGURE_ROW_GAP,
    BREW_FIGURE_VALUE_SIZE,
    brewFigureBadgeGeometry,
    brewFigureBadgeWidth
} from "../figureGeometry";
import {formatBrewDate, formatBrewTime} from "../brewFormat";
import {MACHINE_CARD_MAX_STAGES} from "@/library/cardWriteErrors";
import {dotoRowHeight, dotoTextWidth, DOTO_MAX_FONT_SCALE} from "@/library/dotoMetrics";
import {stageLadderRungMinHeight} from "../stageLadderGeometry";

const brew = (over: Partial<BrewRecord> = {}) =>
    ({id: "a", ...over}) as BrewRecord;

const STORY_NAME_SIZE = 13;
const STORY_NAME_MARGIN = 12;

type SweepInput = Parameters<typeof storySummaryBudget>[0];

function storyMaskInputs(width: number, stages: number, fontScale: number): SweepInput[] {
    return Array.from({length: 128}, (_, mask) => ({
        width,
        stages,
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
    }));
}

function trueDrawnHeight(input: SweepInput, budget: ReturnType<typeof storySummaryBudget>) {
    const fontScale = input.fontScale ?? 1;
    const textScale = storyTextScale(input.width);
    const nameHeight = dotoRowHeight(STORY_NAME_SIZE * textScale, fontScale)
        + STORY_NAME_MARGIN * textScale;
    const baseFigures = dotoRowHeight(BREW_FIGURE_LABEL_SIZE * textScale, fontScale)
        + BREW_FIGURE_INTERNAL_GAP
        + dotoRowHeight(BREW_FIGURE_VALUE_SIZE * textScale, fontScale);
    const detailFigures = budget.showFigureDetails !== false
        ? Math.max(0, input.figureExtraRows ?? 0) * (
            BREW_FIGURE_ROW_GAP
            + dotoRowHeight(BREW_FIGURE_LABEL_SIZE * textScale, fontScale)
            + BREW_FIGURE_INTERNAL_GAP
            + dotoRowHeight(BREW_FIGURE_DETAIL_VALUE_SIZE * textScale, fontScale)
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
        + budget.traceHeight
        + rateHeight
        + baseFigures
        + detailFigures
        + noteHeight
        + ladderHeight;
}

function storySweepWorstSlack(): {worst: number; cell: SweepInput; visited: number} {
    let worst = -1;
    let cell: SweepInput | null = null;
    let visited = 0;
    for (let stages = 1; stages <= MACHINE_CARD_MAX_STAGES; stages += 1) {
        for (const fontScale of STORY_TEST_FONT_SCALES) {
            for (const width of STORY_TEST_WIDTHS) {
                for (const input of storyMaskInputs(width, stages, fontScale)) {
                    visited += 1;
                    const budget = storySummaryBudget(input);
                    if (budget.margin > worst) {
                        worst = budget.margin;
                        cell = input;
                    }
                }
            }
        }
    }
    if (cell === null) throw new Error("story slack sweep visited no cells");
    return {worst, cell, visited};
}

function storyHorizontalSweep(): {visited: number} {
    let visited = 0;
    for (let stages = 1; stages <= MACHINE_CARD_MAX_STAGES; stages += 1) {
        for (const fontScale of STORY_TEST_FONT_SCALES) {
            for (const width of STORY_TEST_WIDTHS) {
                for (const input of storyMaskInputs(width, stages, fontScale)) {
                    visited += 1;
                    const budget = storySummaryBudget(input);

                    expect(storyHorizontalFit(input, budget)).toEqual(
                        expect.objectContaining({fits: true})
                    );
                }
            }
        }
    }
    return {visited};
}

function expectAllMasksFit(widths: number[]) {
    for (let stages = 1; stages <= MACHINE_CARD_MAX_STAGES; stages += 1) {
        for (const fontScale of STORY_TEST_FONT_SCALES) {
            for (const width of widths) {
                for (const input of storyMaskInputs(width, stages, fontScale)) {
                    const budget = storySummaryBudget(input);

                    expect(trueDrawnHeight(input, budget))
                        .toBeLessThanOrEqual(budget.contentHeight);
                }
            }
        }
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

    it("reserves the bands the platform's own furniture covers", () => {
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
        // The reply field and the action row both live down there.
        const frame = storyFrame(1080);
        expect(frame.safeBottom).toBeGreaterThan(frame.safeTop);
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
        const visibleRows = (budget: ReturnType<typeof storySummaryBudget>) =>
            Number(budget.showCoffee)
            + Number(budget.showRating)
            + Number(budget.shownTagCount > 0)
            + Number(budget.showSummaryNote === true)
            + Number(budget.showFigureDetails === true)
            + Number(budget.showRateChart)
            + Number(budget.showStages);

        for (let stages = 1; stages <= MACHINE_CARD_MAX_STAGES; stages += 1) {
            for (const fontScale of STORY_TEST_FONT_SCALES) {
                let rowsAtPreviousWidth = 0;
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
                        figureExtraRows: 1
                    });
                    expect(budget.requiredHeight).toBeLessThanOrEqual(budget.contentHeight);
                    expect(visibleRows(budget)).toBeGreaterThanOrEqual(rowsAtPreviousWidth);
                    rowsAtPreviousWidth = visibleRows(budget);
                }
            }
        }
    });

    it("keeps the budget's section gap slots in step with the rendered card", () => {
        for (let stages = 1; stages <= MACHINE_CARD_MAX_STAGES; stages += 1) {
            for (const fontScale of STORY_TEST_FONT_SCALES) {
                for (const width of STORY_TEST_WIDTHS) {
                    for (const input of storyMaskInputs(width, stages, fontScale)) {
                        const budget = storySummaryBudget(input);
                        const optionalRows = [
                            budget.showCoffee,
                            budget.showRating,
                            budget.shownTagCount > 0
                        ].filter(Boolean).length;

                        expect(budget.gapSlots).toBe(1 + optionalRows);
                        expect(budget.requiredHeight + 0.001)
                            .toBeGreaterThanOrEqual(trueDrawnHeight(input, budget));
                    }
                }
            }
        }
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
        const sweep = storyHorizontalSweep();

        expect(STORY_TEST_WIDTHS.length).toBe(13);
        expect(STORY_TEST_FONT_SCALES.length).toBe(4);
        expect(MACHINE_CARD_MAX_STAGES).toBe(10);
        expect(sweep.visited).toBe(66_560);
    });

    it("uses an explicit horizontal fit tolerance", () => {
        expect(STORY_FIT_MARGIN).toBeGreaterThan(0);
    });

    it("keeps the horizontal drawdown badge decision out of the vertical ladder", () => {
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
        expect(budget.showDrawdownRateBadge).toBe(false);
    });

    it("suppresses an oversized drawdown rate badge on the story card only", () => {
        const budget = storySummaryBudget({
            width: 430,
            stages: 2,
            hasRateChart: false,
            hasCoffee: false,
            hasRating: false,
            figureExtraRows: 1,
            drawdownRate: 9999.9,
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

    it("counts the drawdown rate badge beside the drawdown figure", () => {
        const input = {
            width: 600,
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
        expect(fit.width).toBeGreaterThan(80);
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
        const sweep = storySweepWorstSlack();

        expect(sweep.visited).toBe(66_560);
        expect(sweep.cell).toMatchObject({
            width: 430,
            stages: 1,
            fontScale: 0.85,
            hasCoffee: false,
            hasRating: false,
            tags: [],
            hasSummaryNote: false,
            figureExtraRows: 0,
            hasRateChart: false,
            hasBypass: false
        });
        // Trace and section gap have hit their composition caps, so the rest
        // is centered-card breathing room rather than a fit failure.
        expect(sweep.worst).toBeLessThanOrEqual(51);
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
            figureExtraRows: 1
        });

        expect(withSecondRow.requiredHeight - withoutSecondRow.requiredHeight)
            .toBe(BREW_FIGURE_ROW_GAP
                + dotoRowHeight(BREW_FIGURE_LABEL_SIZE, 1)
                + BREW_FIGURE_INTERNAL_GAP
                + dotoRowHeight(BREW_FIGURE_DETAIL_VALUE_SIZE, 1));
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

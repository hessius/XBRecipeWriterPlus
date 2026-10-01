import {
    STORY_ASPECT, STORY_SAFE_BOTTOM, STORY_SAFE_TOP,
    STORY_CAPTURE_PADDING,
    STORY_LADDER_TOP_GAP,
    STORY_TEST_FONT_SCALES, STORY_TEST_WIDTHS,
    offeredStoryContent,
    storyCoffeeLine,
    storyContentFacts,
    storyFrame,
    storyHiddenFromSetting,
    storyHiddenToSetting,
    storySummaryBudget
} from "../storyCard";
import {BAR_FLOOR, GAP_FLOOR} from "../bands";
import type {BrewRecord} from "../BrewRecord";
import {RATE_BOTTOM_GAP, RATE_HEIGHT, RATE_TOP_GAP} from "../rateChartGeometry";
import {
    BREW_FIGURE_DETAIL_VALUE_SIZE,
    BREW_FIGURE_INTERNAL_GAP,
    BREW_FIGURE_LABEL_SIZE,
    BREW_FIGURE_ROW_GAP,
    BREW_FIGURE_VALUE_SIZE
} from "../figureGeometry";
import {MACHINE_CARD_MAX_STAGES} from "@/library/cardWriteErrors";
import {dotoRowHeight} from "@/library/dotoMetrics";
import {stageLadderRungMinHeight} from "../stageLadderGeometry";

const brew = (over: Partial<BrewRecord> = {}) =>
    ({id: "a", ...over}) as BrewRecord;

const STORY_NAME_SIZE = 13;
const STORY_NAME_MARGIN = 12;

type SweepInput = Parameters<typeof storySummaryBudget>[0];

function storyMaskInputs(width: number, stages: number, fontScale: number): SweepInput[] {
    return Array.from({length: 64}, (_, mask) => ({
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
        hasBypass:      true,
        fontScale
    }));
}

function trueDrawnHeight(input: SweepInput, budget: ReturnType<typeof storySummaryBudget>) {
    const fontScale = input.fontScale ?? 1;
    const nameHeight = dotoRowHeight(STORY_NAME_SIZE, fontScale) + STORY_NAME_MARGIN;
    const baseFigures = dotoRowHeight(BREW_FIGURE_LABEL_SIZE, fontScale)
        + BREW_FIGURE_INTERNAL_GAP
        + dotoRowHeight(BREW_FIGURE_VALUE_SIZE, fontScale);
    const detailFigures = budget.showFigureDetails !== false
        ? Math.max(0, input.figureExtraRows ?? 0) * (
            BREW_FIGURE_ROW_GAP
            + dotoRowHeight(BREW_FIGURE_LABEL_SIZE, fontScale)
            + BREW_FIGURE_INTERNAL_GAP
            + dotoRowHeight(BREW_FIGURE_DETAIL_VALUE_SIZE, fontScale)
        )
        : 0;
    const noteHeight = budget.showSummaryNote !== false && input.hasSummaryNote === true
        ? dotoRowHeight(11, fontScale) + 8
        : 0;
    const ladderRows = input.stages + (input.hasBypass === true ? 1 : 0);
    const ladderHeight = budget.showStages
        ? STORY_LADDER_TOP_GAP
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

function storySweepWorstSlack(): number {
    let worst = 0;
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
                    figureExtraRows: 1
                });
                worst = Math.max(worst, budget.margin);
            }
        }
    }
    return worst;
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
                        expect(budget.requiredHeight)
                            .toBeGreaterThanOrEqual(trueDrawnHeight(input, budget));
                    }
                }
            }
        }
    });

    it("keeps the height the story card really draws inside the safe band", () => {
        expectAllMasksFit(STORY_TEST_WIDTHS);
    });

    it("keeps the real narrow-phone story width band inside the safe band", () => {
        expectAllMasksFit([185, 200, 220, 240]);
    });

    it("leaves only integer rounding slack after growing the story content", () => {
        expect(storySweepWorstSlack()).toBeLessThanOrEqual(6);
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
        const withRate = storySummaryBudget({
            width: 600,
            stages: 0,
            hasRateChart: true,
            hasCoffee: false,
            hasRating: false
        });

        expect(withRate.rateHeight).toBe(RATE_HEIGHT);
        expect(withRate.rateTopGap).toBe(RATE_TOP_GAP);
        expect(withRate.rateBottomGap).toBe(RATE_BOTTOM_GAP);

        const withoutRate = storySummaryBudget({
            width: 600,
            stages: 0,
            hasRateChart: false,
            hasCoffee: false,
            hasRating: false
        });
        expect(withRate.requiredHeight - withoutRate.requiredHeight)
            .toBe(RATE_TOP_GAP + RATE_HEIGHT + RATE_BOTTOM_GAP);
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

    it("ignores unknown hidden sections from an old or edited setting", () => {
        expect([...storyHiddenFromSetting("[\"coffee\",\"likes\",\"tags\"]")])
            .toEqual(["coffee", "tags"]);
    });

    it("ignores a stored hidden-section setting that is not JSON", () => {
        expect([...storyHiddenFromSetting("not json")]).toEqual([]);
    });
});

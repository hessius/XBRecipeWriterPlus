import {
    STORY_ASPECT, STORY_SAFE_BOTTOM, STORY_SAFE_TOP,
    STORY_TEST_FONT_SCALES, STORY_TEST_WIDTHS,
    storyCoffeeLine, storyFrame, storySummaryBudget
} from "../storyCard";
import {BAR_FLOOR, GAP_FLOOR} from "../bands";
import type {BrewRecord} from "../BrewRecord";
import {RATE_BOTTOM_GAP, RATE_HEIGHT, RATE_TOP_GAP} from "../rateChartGeometry";
import {MACHINE_CARD_MAX_STAGES} from "@/library/cardWriteErrors";
import {dotoRowHeight} from "@/library/dotoMetrics";

const brew = (over: Partial<BrewRecord> = {}) =>
    ({id: "a", ...over}) as BrewRecord;

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
        const withoutRate = storySummaryBudget({
            width: 600,
            stages: 0,
            hasRateChart: false,
            hasCoffee: false,
            hasRating: false
        });
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
            .toBe(6 + dotoRowHeight(10, 1) + 4 + dotoRowHeight(20, 1));
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

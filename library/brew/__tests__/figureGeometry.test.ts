import {
    BREW_FIGURE_COLUMN_GAP,
    BREW_FIGURE_DELAY_FLEX,
    BREW_FIGURE_DRAWDOWN_FLEX,
    BREW_FIGURE_GRIND_FLEX,
    brewFigureAdjustmentColumns,
    brewFigureAdjustmentColumnWidth,
    brewFigureBadgeWidth,
    brewFigureColumnWidths,
    brewFigureTextGeometry,
    brewFigureUsesFourColumns,
    STORY_FIT_MARGIN
} from "@/library/brew/figureGeometry";
import {SCREEN_PADDING} from "@/constants/layout";
import {
    dotoTextWidth,
    DOTO_MAX_FONT_SCALE,
    DOTO_MIN_FONT_SIZE
} from "@/library/dotoMetrics";

const CAPTURE_PADDING = SCREEN_PADDING + 12;
const ADJUSTMENT_BADGES = ["RECIPE 31", "RECIPE 100", "RECIPE OFF", "RECIPE 80 to 90"];

function labelWidth(text: string, fontScale: number): number {
    const geometry = brewFigureTextGeometry();
    return dotoTextWidth(
        text, geometry.labelSize, fontScale, geometry.labelTracking, DOTO_MIN_FONT_SIZE
    );
}

function expectFit(width: number, limit: number): void {
    expect(width + STORY_FIT_MARGIN).toBeLessThanOrEqual(limit);
}

function contentWidth(screenWidth: number): number {
    return screenWidth - CAPTURE_PADDING * 2;
}

function recipeBadgeFits(screenWidth: number, fontScale: number): boolean {
    const flex = [
        BREW_FIGURE_GRIND_FLEX,
        BREW_FIGURE_DELAY_FLEX,
        BREW_FIGURE_DRAWDOWN_FLEX,
        1
    ];
    const free = contentWidth(screenWidth) - BREW_FIGURE_COLUMN_GAP * (flex.length - 1);
    const grind = free * BREW_FIGURE_GRIND_FLEX / flex.reduce((sum, share) => sum + share, 0);
    return brewFigureBadgeWidth("RECIPE 58", fontScale) + STORY_FIT_MARGIN <= grind;
}

describe("detail row columns", () => {
    it("gives four columns at the default text size on common capture widths", () => {
        for (const width of [375, 393, 402, 430]) {
            expect(brewFigureUsesFourColumns(1, contentWidth(width))).toBe(true);
            expect(brewFigureColumnWidths(contentWidth(width), 1)).toHaveLength(4);
        }
    });

    it("measures the recipe badge before allowing four columns at larger text", () => {
        expect(brewFigureUsesFourColumns(1.2, contentWidth(375))).toBe(false);
        expect(brewFigureUsesFourColumns(1.2, contentWidth(393))).toBe(false);
        expect(brewFigureUsesFourColumns(1.2, contentWidth(402))).toBe(true);
        expect(brewFigureUsesFourColumns(1.2, contentWidth(430))).toBe(true);
    });

    it("pins the real badge fit behind the four-column decision", () => {
        expect(recipeBadgeFits(375, 1.2)).toBe(false);
        expect(recipeBadgeFits(393, 1.2)).toBe(false);
        expect(recipeBadgeFits(402, 1.2)).toBe(true);
        expect(recipeBadgeFits(430, 1.2)).toBe(true);
    });

    it("fits every label in four columns at the default size", () => {
        const [grind, delay, drawdown, rate] = brewFigureColumnWidths(contentWidth(393), 1);
        expectFit(labelWidth("GRIND", 1), grind);
        expectFit(labelWidth("DELAY", 1), delay);
        expectFit(labelWidth("DRAWDOWN", 1), drawdown);
        expectFit(labelWidth("RATE", 1), rate);
    });

    it("fits DRAWDOWN at the largest four-column common capture width", () => {
        const [, , drawdown] = brewFigureColumnWidths(contentWidth(430), 1.2);
        expectFit(labelWidth("DRAWDOWN", 1.2), drawdown);
    });

    it("is the recipe badge that forces the fallback", () => {
        const scale = DOTO_MAX_FONT_SCALE;
        const fourWide = brewFigureColumnWidths(contentWidth(430), 1)[0];
        expect(brewFigureBadgeWidth("RECIPE 58", scale)).toBeGreaterThan(fourWide);

        const [grind] = brewFigureColumnWidths(contentWidth(430), scale);
        expectFit(brewFigureBadgeWidth("RECIPE 58", scale), grind);
    });

    it("fits every label in the three column fallback at the cap", () => {
        const scale = DOTO_MAX_FONT_SCALE;
        const [grind, delay, drawdown] = brewFigureColumnWidths(contentWidth(375), scale);
        expectFit(labelWidth("GRIND", scale), grind);
        expectFit(labelWidth("DELAY", scale), delay);
        expectFit(labelWidth("DRAWDOWN", scale), drawdown);
    });

    it("assumes four columns before the first layout pass", () => {
        expect(brewFigureUsesFourColumns(1, 0)).toBe(true);
        expect(brewFigureColumnWidths(0, 1)).toEqual([0, 0, 0, 0]);
    });

    it("fits four quick-edit recipe badges at common capture widths and the font cap", () => {
        for (const width of [375, 393, 402, 430]) {
            const column = brewFigureAdjustmentColumnWidth(
                contentWidth(width),
                DOTO_MAX_FONT_SCALE,
                ADJUSTMENT_BADGES
            );
            for (const badge of ADJUSTMENT_BADGES) {
                expectFit(brewFigureBadgeWidth(badge, DOTO_MAX_FONT_SCALE), column);
            }
        }
    });

    it("keeps two quick-edit columns when the badges fit and falls back when they do not", () => {
        expect(brewFigureAdjustmentColumns(contentWidth(430), 1, ADJUSTMENT_BADGES))
            .toBe(2);
        expect(brewFigureAdjustmentColumns(contentWidth(375), DOTO_MAX_FONT_SCALE, ADJUSTMENT_BADGES))
            .toBe(1);
    });
});

import {
    brewFigureColumnWidths,
    brewFigureUsesFourColumns,
    BREW_FIGURE_FOUR_COLUMN_MAX_SCALE,
    brewFigureTextGeometry,
    brewFigureBadgeWidth
} from "@/library/brew/figureGeometry";
import {dotoTextWidth, DOTO_MIN_FONT_SIZE, DOTO_MAX_FONT_SCALE} from "@/library/dotoMetrics";

/**
 * The detail row on the narrowest screen the app supports: 402 pt of device
 * with 16 pt of padding each side.
 *
 * Measured rather than asserted as a magic number, because the whole defect
 * this pins was a column that was 0.0 pt too narrow. A snapshot test would
 * have passed happily while the text clipped, which is how it shipped.
 */
const CONTENT_WIDTH = 402 - 16 * 2;

function labelWidth(text: string, fontScale: number): number {
    const geometry = brewFigureTextGeometry();
    return dotoTextWidth(
        text, geometry.labelSize, fontScale, geometry.labelTracking, DOTO_MIN_FONT_SIZE
    );
}

describe("detail row columns", () => {
    it("gives four columns at the default text size", () => {
        expect(brewFigureUsesFourColumns(1)).toBe(true);
        expect(brewFigureColumnWidths(CONTENT_WIDTH, 1)).toHaveLength(4);
    });

    it("falls back to three above the threshold, and not at it", () => {
        expect(brewFigureUsesFourColumns(BREW_FIGURE_FOUR_COLUMN_MAX_SCALE)).toBe(true);
        expect(brewFigureUsesFourColumns(BREW_FIGURE_FOUR_COLUMN_MAX_SCALE + 0.01))
            .toBe(false);
        expect(brewFigureColumnWidths(CONTENT_WIDTH, DOTO_MAX_FONT_SCALE))
            .toHaveLength(3);
    });

    it("fits every label in four columns at the default size", () => {
        const [grind, delay, drawdown, rate] = brewFigureColumnWidths(CONTENT_WIDTH, 1);
        expect(labelWidth("GRIND", 1)).toBeLessThanOrEqual(grind);
        expect(labelWidth("DELAY", 1)).toBeLessThanOrEqual(delay);
        expect(labelWidth("DRAWDOWN", 1)).toBeLessThanOrEqual(drawdown);
        expect(labelWidth("RATE", 1)).toBeLessThanOrEqual(rate);
    });

    it("fits DRAWDOWN at the threshold, which is why it is wider", () => {
        const scale = BREW_FIGURE_FOUR_COLUMN_MAX_SCALE;
        const [, , drawdown] = brewFigureColumnWidths(CONTENT_WIDTH, scale);
        expect(labelWidth("DRAWDOWN", scale)).toBeLessThanOrEqual(drawdown);
    });

    it("fits the recipe badge in four columns at the default size", () => {
        const [grind] = brewFigureColumnWidths(CONTENT_WIDTH, 1);
        expect(brewFigureBadgeWidth("RECIPE 58", 1)).toBeLessThanOrEqual(grind);
    });

    it("is the recipe badge that forces the fallback", () => {
        // The reason the threshold exists at all. If this ever passes, the
        // badge got shorter or the row got wider and the fallback could go.
        const scale = DOTO_MAX_FONT_SCALE;
        const fourWide = brewFigureColumnWidths(CONTENT_WIDTH, 1)[0];
        expect(brewFigureBadgeWidth("RECIPE 58", scale)).toBeGreaterThan(fourWide);

        const [grind] = brewFigureColumnWidths(CONTENT_WIDTH, scale);
        expect(brewFigureBadgeWidth("RECIPE 58", scale)).toBeLessThanOrEqual(grind);
    });

    it("fits every label in the three column fallback at the cap", () => {
        const scale = DOTO_MAX_FONT_SCALE;
        const [grind, delay, drawdown] = brewFigureColumnWidths(CONTENT_WIDTH, scale);
        expect(labelWidth("GRIND", scale)).toBeLessThanOrEqual(grind);
        expect(labelWidth("DELAY", scale)).toBeLessThanOrEqual(delay);
        expect(labelWidth("DRAWDOWN", scale)).toBeLessThanOrEqual(drawdown);
    });
});

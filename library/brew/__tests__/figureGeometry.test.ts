import {
    BREW_FIGURE_COLUMN_GAP,
    BREW_FIGURE_DELAY_FLEX,
    BREW_FIGURE_DRAWDOWN_FLEX,
    BREW_FIGURE_GRIND_FLEX,
    BREW_RECIPE_AFTER_GAP,
    BREW_RECIPE_LABEL_GAP,
    BREW_RECIPE_ROW_GAP,
    BREW_RECIPE_SIZE,
    BREW_RECIPE_TRACKING,
    BREW_RECIPE_UNIT_GAP,
    brewFigureAdjustmentColumns,
    brewFigureAdjustmentColumnWidth,
    brewFigureAdjustmentLayout,
    brewFigureAdjustmentWidth,
    brewFigureBadgeGeometry,
    brewFigureBadgeWidth,
    brewFigureColumnWidths,
    brewFigureTextGeometry,
    brewFigureUsesFourColumns,
    brewRecipeContextLayout,
    brewRecipeUnits,
    STORY_FIT_MARGIN
} from "@/library/brew/figureGeometry";
import {SCREEN_PADDING} from "@/constants/layout";
import {
    dotoRowHeight,
    dotoTextWidth,
    DOTO_MAX_FONT_SCALE,
    DOTO_MIN_FONT_SIZE
} from "@/library/dotoMetrics";

const CAPTURE_PADDING = SCREEN_PADDING + 12;
const ADJUSTMENT_FIGURES = [
    {label: "DOSE", value: "31", badge: "RECIPE 31"},
    {label: "RATIO", value: "1:100", badge: "RECIPE 100"},
    {label: "TEMP", value: "39 to 99", badge: "OFFSET +60"},
    {label: "GRIND", value: "OFF", badge: "RECIPE OFF"}
];

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

describe("brew recipe units", () => {
    it("omits missing inputs", () => {
        expect(brewRecipeUnits()).toEqual([]);
        expect(brewRecipeUnits(undefined)).toEqual([]);
        expect(brewRecipeUnits({adjustedFromDose: 15, adjustedFromRatio: 16})).toEqual([]);
    });

    it.each([0, NaN, Infinity, -Infinity, -1])("omits invalid input %s", (value) => {
        expect(brewRecipeUnits({dose: value, ratio: value})).toEqual([]);
    });

    it("preserves decimal doses and formats ratios with saved comparisons", () => {
        expect(brewRecipeUnits({
            dose: 15.5, ratio: 17, adjustedFromDose: 15, adjustedFromRatio: 16
        })).toEqual([
            {
                key: "dose",
                label: "DOSE",
                value: "15.5 G",
                badge: "RECIPE 15",
                accessibilityLabel: "Recipe dose, 15.5 grams, saved recipe 15 grams"
            },
            {
                key: "ratio",
                label: "RATIO",
                value: "1:17",
                badge: "RECIPE 1:16",
                accessibilityLabel: "Recipe ratio, 1 to 17, saved recipe 1 to 16"
            }
        ]);
    });

    it("keeps a dose when the ratio is missing or invalid", () => {
        const expected = [{
            key: "dose", label: "DOSE", value: "15 G", badge: null,
            accessibilityLabel: "Recipe dose, 15 grams"
        }];
        expect(brewRecipeUnits({dose: 15})).toEqual(expected);
        expect(brewRecipeUnits({dose: 15, ratio: NaN})).toEqual(expected);
    });

    it("keeps a ratio when the dose is missing or invalid", () => {
        const expected = [{
            key: "ratio", label: "RATIO", value: "1:16", badge: null,
            accessibilityLabel: "Recipe ratio, 1 to 16"
        }];
        expect(brewRecipeUnits({ratio: 16})).toEqual(expected);
        expect(brewRecipeUnits({dose: -1, ratio: 16})).toEqual(expected);
    });

    it("suppresses equal baselines", () => {
        expect(brewRecipeUnits({
            dose: 15.5, ratio: 17, adjustedFromDose: 15.5, adjustedFromRatio: 17
        })).toEqual(brewRecipeUnits({dose: 15.5, ratio: 17}));
    });

    it.each([0, NaN, Infinity, -Infinity, -1])("omits invalid baseline %s", (value) => {
        expect(brewRecipeUnits({
            dose: 15, ratio: 16, adjustedFromDose: value, adjustedFromRatio: value
        })).toEqual(brewRecipeUnits({dose: 15, ratio: 16}));
    });
});

describe("brew recipe context layout", () => {
    const inputs = {dose: 31, ratio: 100, adjustedFromDose: 15, adjustedFromRatio: 16};

    function baseWidth(label: string, value: string, fontScale: number, scale = 1): number {
        return dotoTextWidth(label, BREW_RECIPE_SIZE * scale, fontScale, BREW_RECIPE_TRACKING * scale)
            + BREW_RECIPE_LABEL_GAP * scale
            + dotoTextWidth(value, BREW_RECIPE_SIZE * scale, fontScale, BREW_RECIPE_TRACKING * scale);
    }

    it("pins the compact context geometry", () => {
        expect([
            BREW_RECIPE_SIZE, BREW_RECIPE_TRACKING, BREW_RECIPE_LABEL_GAP,
            BREW_RECIPE_UNIT_GAP, BREW_RECIPE_ROW_GAP, BREW_RECIPE_AFTER_GAP
        ]).toEqual([12, 1.2, 4, 16, 6, 8]);
    });

    it("measures two inline units in one row when both fit", () => {
        const layout = brewRecipeContextLayout(inputs, 600, 1);
        const badge = brewFigureBadgeGeometry();
        const badgeHeight = dotoRowHeight(badge.fontSize, 1, DOTO_MIN_FONT_SIZE)
            + 2 * (badge.paddingVertical + badge.borderWidth);
        const widths = [
            baseWidth("DOSE", "31 G", 1) + badge.gap + brewFigureBadgeWidth("RECIPE 15", 1),
            baseWidth("RATIO", "1:100", 1) + badge.gap + brewFigureBadgeWidth("RECIPE 1:16", 1)
        ];
        expect(layout.columnWidth).toBe((600 - BREW_RECIPE_UNIT_GAP) / 2);
        expect(layout.rows).toHaveLength(1);
        expect(layout.rows[0].units.map(({unit}) => unit)).toEqual(brewRecipeUnits(inputs));
        expect(layout.rows[0].units.map(({badgeBelow}) => badgeBelow)).toEqual([false, false]);
        expect(layout.rows[0].units.map(({width}) => width)).toEqual(widths);
        expect(layout.rows[0].height).toBe(Math.max(dotoRowHeight(12, 1), badgeHeight));
        expect(layout.maxWidth).toBe(Math.max(...widths));
        expect(layout.totalHeight).toBe(layout.rows[0].height + BREW_RECIPE_AFTER_GAP);
        expect(layout.fits).toBe(true);
    });

    it("wraps whole units and places badges below at narrow widths", () => {
        const layout = brewRecipeContextLayout(inputs, 190, 1.4);
        const badge = brewFigureBadgeGeometry();
        const badgeHeight = dotoRowHeight(badge.fontSize, 1.4, DOTO_MIN_FONT_SIZE)
            + 2 * (badge.paddingVertical + badge.borderWidth);
        const height = dotoRowHeight(12, 1.4) + badge.gap + badgeHeight;
        expect(layout.columnWidth).toBe(190);
        expect(layout.rows.map(({units}) => units.map(({unit}) => unit.key)))
            .toEqual([["dose"], ["ratio"]]);
        for (const row of layout.rows) {
            expect(row.height).toBe(height);
            expect(row.units[0].height).toBe(height);
            expect(row.units[0].badgeBelow).toBe(true);
            const {unit, width} = row.units[0];
            expect(width).toBe(Math.max(
                baseWidth(unit.label, unit.value, 1.4),
                brewFigureBadgeWidth(unit.badge!, 1.4)
            ));
            expectFit(width, layout.columnWidth);
        }
        expect(layout.maxWidth).toBe(Math.max(...layout.rows.map(({units}) => units[0].width)));
        expect(layout.totalHeight).toBe(height * 2 + BREW_RECIPE_ROW_GAP + BREW_RECIPE_AFTER_GAP);
        expect(layout.totalHeight).toBeGreaterThan(brewRecipeContextLayout(inputs, 600, 1).totalHeight);
        expect(layout.fits).toBe(true);
    });

    it("allows two columns only when both minimum widths include the fit margin", () => {
        const minimum = Math.max(...brewRecipeUnits(inputs).map((unit) => Math.max(
            baseWidth(unit.label, unit.value, 1.4),
            brewFigureBadgeWidth(unit.badge!, 1.4)
        )));
        const width = 2 * (minimum + STORY_FIT_MARGIN) + BREW_RECIPE_UNIT_GAP;
        const layout = brewRecipeContextLayout(inputs, width, 1.4);
        expect(layout.rows).toHaveLength(1);
        expect(layout.rows[0].units).toHaveLength(2);
        expect(layout.rows[0].units.every(({badgeBelow}) => badgeBelow)).toBe(true);
        expect(layout.fits).toBe(true);
        expect(brewRecipeContextLayout(inputs, width - 0.01, 1.4).rows).toHaveLength(2);
    });

    it.each([{dose: 15.5}, {ratio: 16}])("uses the full column for a single input %j", (input) => {
        const layout = brewRecipeContextLayout(input, 190, 1.4);
        const unit = brewRecipeUnits(input)[0];
        const height = dotoRowHeight(12, 1.4);
        expect(layout).toEqual({
            rows: [{
                units: [{unit, badgeBelow: false, width: baseWidth(unit.label, unit.value, 1.4), height}],
                height
            }],
            columnWidth: 190,
            maxWidth: baseWidth(unit.label, unit.value, 1.4),
            totalHeight: height + BREW_RECIPE_AFTER_GAP,
            fits: true
        });
    });

    it("scales spacing and badges while retaining the context text's default Doto floor", () => {
        const scale = 0.5;
        const layout = brewRecipeContextLayout(inputs, 600, 0.8, scale);
        const badge = brewFigureBadgeGeometry(scale);
        const badgeHeight = dotoRowHeight(badge.fontSize, 0.8, DOTO_MIN_FONT_SIZE * scale)
            + 2 * (badge.paddingVertical + badge.borderWidth);
        expect(layout.columnWidth).toBe((600 - BREW_RECIPE_UNIT_GAP * scale) / 2);
        for (const {unit, width, height} of layout.rows[0].units) {
            expect(width).toBe(baseWidth(unit.label, unit.value, 0.8, scale)
                + badge.gap + brewFigureBadgeWidth(unit.badge!, 0.8, scale));
            expect(height).toBe(Math.max(dotoRowHeight(12 * scale, 0.8), badgeHeight));
        }
        expect(layout.totalHeight).toBe(layout.rows[0].height + BREW_RECIPE_AFTER_GAP * scale);
        expect(layout.fits).toBe(true);
    });

    it.each([20, 0, -10])("reports overflow without inventing space at width %s", (width) => {
        const layout = brewRecipeContextLayout(inputs, width, 1.4);
        expect(layout.columnWidth).toBe(Math.max(0, width));
        expect(layout.rows).toHaveLength(2);
        expect(layout.maxWidth + STORY_FIT_MARGIN).toBeGreaterThan(layout.columnWidth);
        expect(layout.fits).toBe(false);
    });

    it.each([undefined, {}, {dose: 0, ratio: NaN}])("has no height for empty inputs %j", (input) => {
        expect(brewRecipeContextLayout(input, 20, 1.4)).toEqual({
            rows: [], columnWidth: 20, maxWidth: 0, totalHeight: 0, fits: true
        });
    });
});

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

    it("fits four quick-edit figures at common capture widths and the font cap", () => {
        for (const width of [375, 393, 402, 430]) {
            const column = brewFigureAdjustmentColumnWidth(
                contentWidth(width),
                DOTO_MAX_FONT_SCALE,
                ADJUSTMENT_FIGURES
            );
            for (const figure of ADJUSTMENT_FIGURES) {
                expectFit(
                    brewFigureAdjustmentWidth(figure, DOTO_MAX_FONT_SCALE),
                    column
                );
            }
        }
    });

    it("uses the one-column fallback for the widest quick-edit values", () => {
        expect(brewFigureAdjustmentColumns(
            contentWidth(375), DOTO_MAX_FONT_SCALE, ADJUSTMENT_FIGURES
        )).toBe(1);
        expect(brewFigureAdjustmentLayout(
            contentWidth(375), DOTO_MAX_FONT_SCALE, ADJUSTMENT_FIGURES
        )).toMatchObject({columns: 1, rows: 4});

        expect(brewFigureAdjustmentColumns(
            contentWidth(430), DOTO_MAX_FONT_SCALE, ADJUSTMENT_FIGURES
        )).toBe(1);
    });
});

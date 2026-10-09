import React from "react";
import {screen, within} from "@testing-library/react-native";
import {Dimensions} from "react-native";

import BrewRecipeContext from "@/components/BrewRecipeContext";
import {DOTO_FAMILIES} from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import {
    brewFigureBadgeGeometry,
    brewRecipeContextLayout,
    type BrewRecipeInputs
} from "@/library/brew/figureGeometry";
import {dotoRequestedSize, DOTO_MIN_FONT_SIZE} from "@/library/dotoMetrics";
import {renderWithProviders} from "@/test-utils/render";

const DEFAULT_WINDOW = {width: 393, height: 852, scale: 3, fontScale: 1};
const ADJUSTED_INPUTS = {dose: 16, ratio: 17, adjustedFromDose: 15, adjustedFromRatio: 16};

function setFontScale(fontScale: number): void {
    const window = {...DEFAULT_WINDOW, fontScale};
    Dimensions.set({window, screen: window});
}

describe("BrewRecipeContext", () => {
    beforeEach(() => {
        setFontScale(1);
    });

    it("shows planned dose and ratio with spoken units", async () => {
        await renderWithProviders(
            <BrewRecipeContext inputs={{dose: 15.5, ratio: 16}} contentWidth={333}/>
        );

        expect(screen.getByText("15.5 G")).toBeOnTheScreen();
        expect(screen.getByText("1:16")).toBeOnTheScreen();
        expect(screen.getByLabelText("Recipe dose, 15.5 grams")).toBeOnTheScreen();
        expect(screen.getByLabelText("Recipe ratio, 1 to 16")).toBeOnTheScreen();
        expect(screen.queryAllByRole("button")).toHaveLength(0);
        expect(screen.queryByTestId("brew-recipe-dose-comparison")).toBeNull();
        expect(screen.queryByTestId("brew-recipe-ratio-comparison")).toBeNull();
    });

    it.each([
        {inputs: {dose: 15.5}, present: "dose", missing: "ratio", value: "15.5 G"},
        {inputs: {ratio: 16}, present: "ratio", missing: "dose", value: "1:16"}
    ])("shows only the supplied $present input", async ({inputs, present, missing, value}) => {
        await renderWithProviders(<BrewRecipeContext inputs={inputs} contentWidth={333}/>);

        expect(within(screen.getByTestId(`brew-recipe-${present}`)).getByText(value))
            .toBeOnTheScreen();
        expect(screen.queryByTestId(`brew-recipe-${missing}`)).toBeNull();
        expect(screen.getAllByTestId("brew-recipe-row")).toHaveLength(1);
        expect(screen.getByTestId(`brew-recipe-${present}`)).toHaveStyle({width: 333});
    });

    it.each<BrewRecipeInputs | undefined>([
        undefined, {}, {dose: 0, ratio: NaN}, {dose: -1, ratio: Infinity},
        {dose: NaN, ratio: -1}, {adjustedFromDose: 15, adjustedFromRatio: 16}
    ])("omits the entire line and its spacing for absent or invalid inputs %j", async (inputs) => {
        await renderWithProviders(<BrewRecipeContext inputs={inputs} contentWidth={333}/>);

        expect(screen.queryByTestId("brew-recipe-context")).toBeNull();
        expect(screen.queryAllByTestId("brew-recipe-row")).toHaveLength(0);
    });

    it("keeps each saved comparison with its actual input", async () => {
        await renderWithProviders(
            <BrewRecipeContext inputs={ADJUSTED_INPUTS} contentWidth={333}/>
        );

        const dose = within(screen.getByTestId("brew-recipe-dose"));
        const ratio = within(screen.getByTestId("brew-recipe-ratio"));
        expect(dose.getByText("16 G")).toBeOnTheScreen();
        expect(dose.getByText("RECIPE 15")).toBeOnTheScreen();
        expect(dose.queryByText("RECIPE 1:16")).toBeNull();
        expect(ratio.getByText("1:17")).toBeOnTheScreen();
        expect(ratio.getByText("RECIPE 1:16")).toBeOnTheScreen();
        expect(ratio.queryByText("RECIPE 15")).toBeNull();
        expect(screen.getByLabelText("Recipe dose, 16 grams, saved recipe 15 grams"))
            .toBeOnTheScreen();
        expect(screen.getByLabelText("Recipe ratio, 1 to 17, saved recipe 1 to 16"))
            .toBeOnTheScreen();
    });

    it.each([190, 333, 600])("renders badge placement and dimensions measured at width %s", async (width) => {
        setFontScale(1.4);
        const layout = brewRecipeContextLayout(ADJUSTED_INPUTS, width, 1.4);
        const badge = brewFigureBadgeGeometry();
        await renderWithProviders(
            <BrewRecipeContext inputs={ADJUSTED_INPUTS} contentWidth={width}/>
        );

        const rows = screen.getAllByTestId("brew-recipe-row");
        expect(rows).toHaveLength(layout.rows.length);
        expect(screen.getByTestId("brew-recipe-context")).toHaveStyle({gap: 6, marginBottom: 8});
        layout.rows.forEach((row, index) => {
            expect(rows[index]).toHaveStyle({gap: 16, minHeight: row.height});
            row.units.forEach((entry) => {
                const input = within(rows[index]).getByTestId(`brew-recipe-${entry.unit.key}`);
                expect(input).toHaveStyle({width: layout.columnWidth, minHeight: entry.height});
                const comparison = within(input).getByTestId(`brew-recipe-${entry.unit.key}-comparison`);
                expect(comparison).toHaveStyle({
                    borderStyle: "dashed",
                    borderTopColor: palette.line,
                    borderBottomColor: palette.line,
                    borderLeftColor: palette.line,
                    borderRightColor: palette.line,
                    borderTopWidth: badge.borderWidth,
                    borderBottomWidth: badge.borderWidth,
                    borderLeftWidth: badge.borderWidth,
                    borderRightWidth: badge.borderWidth,
                    borderTopLeftRadius: badge.borderRadius,
                    borderTopRightRadius: badge.borderRadius,
                    borderBottomLeftRadius: badge.borderRadius,
                    borderBottomRightRadius: badge.borderRadius,
                    paddingLeft: badge.paddingHorizontal,
                    paddingRight: badge.paddingHorizontal,
                    paddingTop: badge.paddingVertical,
                    paddingBottom: badge.paddingVertical,
                    alignSelf: "flex-start"
                });
                expect(comparison.parent).toHaveStyle({
                    flexDirection: entry.badgeBelow ? "column" : "row",
                    gap: badge.gap,
                    ...(!entry.badgeBelow ? {alignItems: "center"} : {})
                });
                expect(within(comparison).getByText(entry.unit.badge!)).toHaveStyle({
                    fontSize: badge.fontSize,
                    letterSpacing: badge.tracking,
                    fontFamily: DOTO_FAMILIES.bold,
                    color: palette.dim
                });
                expect(within(input).getByText(entry.unit.label).parent).toHaveStyle({
                    gap: 4, alignItems: "center"
                });
            });
        });
    });

    it("wraps maximum planned inputs without losing values at larger OS text size", async () => {
        setFontScale(1.4);
        await renderWithProviders(
            <BrewRecipeContext inputs={{dose: 31, ratio: 100}} contentWidth={190}/>
        );

        expect(screen.getAllByTestId("brew-recipe-row")).toHaveLength(2);
        expect(screen.getByText("31 G")).toBeOnTheScreen();
        expect(screen.getByText("1:100")).toBeOnTheScreen();
    });

    it.each([0, 20])("keeps live inputs visible even when geometry refuses width %s", async (width) => {
        expect(brewRecipeContextLayout(ADJUSTED_INPUTS, width, 1).fits).toBe(false);
        await renderWithProviders(
            <BrewRecipeContext inputs={ADJUSTED_INPUTS} contentWidth={width}/>
        );

        expect(screen.getByTestId("brew-recipe-context")).toBeOnTheScreen();
        expect(screen.getByText("16 G")).toBeOnTheScreen();
        expect(screen.getByText("1:17")).toBeOnTheScreen();
        expect(screen.getByText("RECIPE 15")).toBeOnTheScreen();
        expect(screen.getByText("RECIPE 1:16")).toBeOnTheScreen();
    });

    it.each([0.8, 1, 1.4, 2])("uses OS fontScale %s for layout and preserves text semantics", async (fontScale) => {
        setFontScale(fontScale);
        const layout = brewRecipeContextLayout({dose: 15.5, ratio: 16}, 260, fontScale);
        await renderWithProviders(
            <BrewRecipeContext inputs={{dose: 15.5, ratio: 16}} contentWidth={260}/>
        );

        expect(screen.getAllByTestId("brew-recipe-row")).toHaveLength(layout.rows.length);
        for (const label of ["DOSE", "RATIO"]) {
            expect(screen.getByText(label)).toHaveStyle({
                fontSize: dotoRequestedSize(12, fontScale),
                letterSpacing: 1.2, fontFamily: DOTO_FAMILIES.bold, color: palette.dim
            });
        }
        for (const value of ["15.5 G", "1:16"]) {
            expect(screen.getByText(value)).toHaveStyle({
                fontSize: dotoRequestedSize(12, fontScale),
                letterSpacing: 1.2, fontFamily: DOTO_FAMILIES.bold, color: palette.text
            });
        }
    });

    it.each([0.8, 1, 1.4])("scales artwork spacing while retaining the context font floor at OS scale %s", async (fontScale) => {
        setFontScale(fontScale);
        const textScale = 0.5;
        const layout = brewRecipeContextLayout(ADJUSTED_INPUTS, 186, fontScale, textScale);
        const badge = brewFigureBadgeGeometry(textScale);
        await renderWithProviders(
            <BrewRecipeContext inputs={ADJUSTED_INPUTS} contentWidth={186} textScale={textScale}/>
        );

        expect(screen.getByTestId("brew-recipe-context")).toHaveStyle({gap: 3, marginBottom: 4});
        const rows = screen.getAllByTestId("brew-recipe-row");
        expect(rows).toHaveLength(layout.rows.length);
        layout.rows.forEach((row, index) => {
            expect(rows[index]).toHaveStyle({gap: 8, minHeight: row.height});
            row.units.forEach(({unit, height}) => {
                const input = screen.getByTestId(`brew-recipe-${unit.key}`);
                expect(input).toHaveStyle({width: layout.columnWidth, minHeight: height});
                expect(within(input).getByText(unit.value)).toHaveStyle({
                    fontSize: dotoRequestedSize(6, fontScale), letterSpacing: 0.6, color: palette.text
                });
                expect(within(input).getByText(unit.label).parent).toHaveStyle({gap: 2});
                const comparison = within(input).getByTestId(`brew-recipe-${unit.key}-comparison`);
                expect(comparison).toHaveStyle({
                    borderTopWidth: badge.borderWidth,
                    borderBottomWidth: badge.borderWidth,
                    borderLeftWidth: badge.borderWidth,
                    borderRightWidth: badge.borderWidth,
                    borderTopLeftRadius: badge.borderRadius,
                    borderTopRightRadius: badge.borderRadius,
                    borderBottomLeftRadius: badge.borderRadius,
                    borderBottomRightRadius: badge.borderRadius,
                    paddingLeft: badge.paddingHorizontal,
                    paddingRight: badge.paddingHorizontal,
                    paddingTop: badge.paddingVertical,
                    paddingBottom: badge.paddingVertical
                });
                expect(within(comparison).getByText(unit.badge!)).toHaveStyle({
                    fontSize: dotoRequestedSize(badge.fontSize, fontScale, DOTO_MIN_FONT_SIZE * textScale),
                    letterSpacing: badge.tracking, color: palette.dim
                });
            });
        });
    });
});

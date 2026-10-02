import React from "react";
import {
    StyleSheet,
    Text,
    type StyleProp,
    type TextStyle,
    type ViewStyle
} from "react-native";
import {screen} from "@testing-library/react-native";

import BrewFigures from "@/components/BrewFigures";
import {
    BREW_FIGURE_BADGE_FONT_SIZE,
    BREW_FIGURE_BADGE_GAP,
    BREW_FIGURE_BADGE_TRACKING,
    BREW_FIGURE_COLUMN_GAP,
    BREW_FIGURE_DETAIL_VALUE_SIZE,
    BREW_FIGURE_LABEL_SIZE,
    BREW_FIGURE_LABEL_TRACKING,
    BREW_FIGURE_VALUE_SIZE
} from "@/library/brew/figureGeometry";
import {DOTO_MIN_FONT_SIZE} from "@/library/dotoMetrics";
import {renderWithProviders} from "@/test-utils/render";

const MockText = Text;
type MockTextStyle = TextStyle & {minFontSize?: number};

jest.mock("@/components/DotMatrixText", () => ({
    __esModule: true,
    drawnFontSize: (fontSize: number) => fontSize,
    default: ({children, fontSize, letterSpacing, minFontSize}: {
        children: string | number;
        fontSize?: number;
        letterSpacing?: number;
        minFontSize?: number;
    }) => (
        <MockText style={{fontSize, letterSpacing, minFontSize} as MockTextStyle}>
            {children}
        </MockText>
    )
}));

function fontSizeOf(text: string): number {
    const style = StyleSheet.flatten(
        screen.getByText(text).props.style as StyleProp<TextStyle>
    );
    return style?.fontSize ?? 0;
}

function textStyleOf(text: string): MockTextStyle {
    return (StyleSheet.flatten(
        screen.getByText(text).props.style as StyleProp<TextStyle>
    ) ?? {}) as MockTextStyle;
}

function viewStyleOf(testID: string): ViewStyle {
    return StyleSheet.flatten(
        screen.getByTestId(testID).props.style as StyleProp<ViewStyle>
    ) ?? {};
}

describe("BrewFigures story scaling", () => {
    it("passes the story text scale to both value and label text", async () => {
        await renderWithProviders(
            <BrewFigures water={240} cup={200} seconds={196}
                         accent="#8ab4f8" textScale={0.5} />
        );

        expect(fontSizeOf("240")).toBeLessThan(BREW_FIGURE_VALUE_SIZE);
        expect(fontSizeOf("WATER")).toBeLessThan(BREW_FIGURE_LABEL_SIZE);
        expect(textStyleOf("WATER").letterSpacing)
            .toBeCloseTo(BREW_FIGURE_LABEL_TRACKING * 0.5, 6);
        expect(viewStyleOf("figures-main-row").gap)
            .toBeCloseTo(BREW_FIGURE_COLUMN_GAP * 0.5, 6);
    });

    it("scales the bypass badge text and chrome with the story card", async () => {
        await renderWithProviders(
            <BrewFigures water={240} cup={200} seconds={196}
                         accent="#8ab4f8" bypass={60} textScale={0.5} />
        );

        expect(fontSizeOf("+60")).toBeLessThan(11);
        expect(screen.getByTestId("figures-bypass")).toHaveStyle({
            paddingLeft:    2,
            paddingRight:   2,
            borderTopWidth: 0.5
        });
        expect(textStyleOf("+60").letterSpacing)
            .toBeCloseTo(BREW_FIGURE_BADGE_TRACKING * 0.5, 6);
        expect(textStyleOf("+60").minFontSize)
            .toBeCloseTo(DOTO_MIN_FONT_SIZE * 0.5, 6);
    });

    it("scales every second-row value and badge gap with the story card", async () => {
        await renderWithProviders(
            <BrewFigures water={240} cup={200} seconds={196}
                         accent="#8ab4f8" drawdown={32}
                         drawdownRate={2.1} delay={5}
                         grind={{kind: "dial", dial: 53, recipe: 60}}
                         textScale={0.5} />
        );

        expect(fontSizeOf("53")).toBeCloseTo(BREW_FIGURE_DETAIL_VALUE_SIZE * 0.5, 6);
        expect(fontSizeOf("+5")).toBeCloseTo(BREW_FIGURE_DETAIL_VALUE_SIZE * 0.5, 6);
        expect(fontSizeOf("0:32")).toBeCloseTo(BREW_FIGURE_DETAIL_VALUE_SIZE * 0.5, 6);
        expect(fontSizeOf("2.1 G/S")).toBeCloseTo(BREW_FIGURE_BADGE_FONT_SIZE * 0.5, 6);
        expect(fontSizeOf("RECIPE 60")).toBeCloseTo(BREW_FIGURE_BADGE_FONT_SIZE * 0.5, 6);
        expect(textStyleOf("RECIPE 60").letterSpacing)
            .toBeCloseTo(BREW_FIGURE_BADGE_TRACKING * 0.5, 6);
        expect(viewStyleOf("figures-detail-row").gap)
            .toBeCloseTo(BREW_FIGURE_COLUMN_GAP * 0.5, 6);
        expect(screen.getByTestId("figures-drawdown-value-row")).toHaveStyle({
            gap: BREW_FIGURE_BADGE_GAP * 0.5
        });
        expect(screen.getByTestId("figures-grind-value-row")).toHaveStyle({
            gap: BREW_FIGURE_BADGE_GAP * 0.5
        });
    });
});

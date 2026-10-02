import React from "react";
import {
    StyleSheet,
    Text,
    type StyleProp,
    type TextStyle,
    type ViewStyle
} from "react-native";
import {screen} from "@testing-library/react-native";

import BrewStoryCard from "@/components/BrewStoryCard";
import {storySummaryBudget} from "@/library/brew/storyCard";
import {renderWithProviders} from "@/test-utils/render";

const MockText = Text;

jest.mock("@/components/DotMatrixText", () => ({
    __esModule: true,
    default: ({children, fontSize, letterSpacing, testID}: {
        children: string | number;
        fontSize?: number;
        letterSpacing?: number;
        testID?: string;
    }) => (
        <MockText testID={testID} style={{fontSize, letterSpacing}}>
            {children}
        </MockText>
    )
}));

function textStyleOf(text: string): TextStyle {
    return (StyleSheet.flatten(
        screen.getByText(text).props.style as StyleProp<TextStyle>
    ) ?? {}) as TextStyle;
}

function viewStyleOf(testID: string): ViewStyle {
    return (StyleSheet.flatten(
        screen.getByTestId(testID).props.style as StyleProp<ViewStyle>
    ) ?? {}) as ViewStyle;
}

describe("BrewStoryCard story scaling", () => {
    it("scales coffee and tag typography and tag padding from the story width", async () => {
        const width = 300;
        const scale = width / 430;
        const coffee = "Huila · Washed";
        const tags = ["filter", "sweet", "balanced", "washed", "extra", "hidden"];
        const budget = storySummaryBudget({
            width,
            stages: 2,
            hasRateChart: false,
            hasCoffee: true,
            hasRating: false,
            tags
        });

        await renderWithProviders(
            <BrewStoryCard
                width={width}
                budget={budget}
                summary={<Text>the brew</Text>}
                when="2026-09-30 · 06:55"
                accent="#8ab4f8"
                rating={0}
                coffee={coffee}
                tags={tags}
            />
        );

        expect(textStyleOf("Huila · Washed").fontSize).toBeCloseTo(12 * scale, 6);
        expect(textStyleOf("Huila · Washed").letterSpacing).toBeCloseTo(1.4 * scale, 6);
        expect(textStyleOf("filter").fontSize).toBeCloseTo(10 * scale, 6);
        expect(textStyleOf("filter").letterSpacing).toBeCloseTo(1.2 * scale, 6);
        expect(textStyleOf("+2").fontSize).toBeCloseTo(10 * scale, 6);
        expect(textStyleOf("+2").letterSpacing).toBeCloseTo(1.2 * scale, 6);
        expect(viewStyleOf("story-tag-filter").paddingLeft).toBeCloseTo(8 * scale, 6);
        expect(viewStyleOf("story-tag-filter").paddingTop).toBeCloseTo(4 * scale, 6);
    });
});

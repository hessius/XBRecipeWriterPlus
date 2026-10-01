import React from "react";
import {StyleSheet, Text, type StyleProp, type TextStyle} from "react-native";
import {screen} from "@testing-library/react-native";

import BrewSummary from "@/components/BrewSummary";
import {palette} from "@/constants/colors";
import type {BrewSample} from "@/library/brew/BrewRecord";
import {renderWithProviders} from "@/test-utils/render";

const MockText = Text;

jest.mock("@/components/DotMatrixText", () => ({
    __esModule: true,
    drawnFontSize: (fontSize: number) => fontSize,
    default: ({children, fontSize, letterSpacing, style, testID}: {
        children: string | number;
        fontSize?: number;
        letterSpacing?: number;
        style?: StyleProp<TextStyle>;
        testID?: string;
    }) => (
        <MockText testID={testID}
                  style={[{fontSize, letterSpacing}, style]}>
            {children}
        </MockText>
    )
}));

const samples: BrewSample[] = [
    {at: 0, water: 0, cup: 0, pour: 1},
    {at: 60_000, water: 80, cup: 76, pour: 1}
];

function textStyleOf(text: string): TextStyle {
    return (StyleSheet.flatten(
        screen.getByText(text).props.style as StyleProp<TextStyle>
    ) ?? {}) as TextStyle;
}

describe("BrewSummary story scaling", () => {
    it("scales the recipe name typography and spacing from the story width", async () => {
        await renderWithProviders(
            <BrewSummary
                recipeName="Ethiopia Guji"
                hasStream={false}
                samples={samples}
                stages={[]}
                accent={palette.brand}
                width={215}
                plannedSeconds={120}
                water={250}
                cup={244}
                seconds={126}
                activeIndex={0}
                stageWater={[]}
                stalls={[]}
                stagesUnavailable={true}
                showStages={false}
                drawdown={32}
                drawdownRate={2.1}
                delay={5}
                grind={{kind: "dial", dial: 53, recipe: 60}}
                textScale={0.5}
            />
        );

        const style = textStyleOf("Ethiopia Guji");
        expect(style.fontSize).toBeCloseTo(6.5, 6);
        expect(style.letterSpacing).toBeCloseTo(0.7, 6);
        expect(style.marginBottom).toBeCloseTo(6, 6);
        expect(textStyleOf("RECIPE 60").fontSize).toBeCloseTo(5.5, 6);
        expect(textStyleOf("RECIPE 60").letterSpacing).toBeCloseTo(0.25, 6);
    });
});

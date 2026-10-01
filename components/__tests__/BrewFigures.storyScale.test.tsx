import React from "react";
import {StyleSheet, Text, type StyleProp, type TextStyle} from "react-native";
import {screen} from "@testing-library/react-native";

import BrewFigures from "@/components/BrewFigures";
import {
    BREW_FIGURE_LABEL_SIZE,
    BREW_FIGURE_VALUE_SIZE
} from "@/library/brew/figureGeometry";
import {renderWithProviders} from "@/test-utils/render";

const MockText = Text;

jest.mock("@/components/DotMatrixText", () => ({
    __esModule: true,
    default: ({children, fontSize, letterSpacing}: {
        children: string | number;
        fontSize?: number;
        letterSpacing?: number;
    }) => (
        <MockText style={{fontSize, letterSpacing}}>{children}</MockText>
    )
}));

function fontSizeOf(text: string): number {
    const style = StyleSheet.flatten(
        screen.getByText(text).props.style as StyleProp<TextStyle>
    );
    return style?.fontSize ?? 0;
}

describe("BrewFigures story scaling", () => {
    it("passes the story text scale to both value and label text", async () => {
        await renderWithProviders(
            <BrewFigures water={240} cup={200} seconds={196}
                         accent="#8ab4f8" textScale={0.5} />
        );

        expect(fontSizeOf("240")).toBeLessThan(BREW_FIGURE_VALUE_SIZE);
        expect(fontSizeOf("WATER")).toBeLessThan(BREW_FIGURE_LABEL_SIZE);
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
    });
});

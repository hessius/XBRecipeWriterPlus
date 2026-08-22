import React from "react";
import {screen} from "@testing-library/react-native";
import {StyleSheet} from "react-native";

import DotMatrixText, {DOTO_MIN_FONT_SIZE} from "@/components/DotMatrixText";
import {renderWithProviders} from "@/test-utils/render";

function styleOf(testID: string): Record<string, unknown> {
    return StyleSheet.flatten(screen.getByTestId(testID).props.style) ?? {};
}

describe("DotMatrixText", () => {
    it("renders its content", async () => {
        await renderWithProviders(<DotMatrixText>255</DotMatrixText>);
        expect(screen.getByText("255")).toBeTruthy();
    });

    it("uses the Doto family", async () => {
        await renderWithProviders(<DotMatrixText testID="dm">255</DotMatrixText>);
        expect(styleOf("dm").fontFamily).toMatch(/^Doto-/);
    });

    it("raises a font size below the floor", async () => {
        await renderWithProviders(
            <DotMatrixText testID="dm" fontSize={6}>255</DotMatrixText>
        );
        expect(styleOf("dm").fontSize).toBe(DOTO_MIN_FONT_SIZE);
    });

    it("leaves a font size at or above the floor alone", async () => {
        await renderWithProviders(
            <DotMatrixText testID="dm" fontSize={18}>255</DotMatrixText>
        );
        expect(styleOf("dm").fontSize).toBe(18);
    });

    it("maps the weight onto the matching static instance", async () => {
        await renderWithProviders(
            <DotMatrixText testID="dm" weight="extrabold">255</DotMatrixText>
        );
        expect(styleOf("dm").fontFamily).toBe("Doto-ExtraBold");
    });
});

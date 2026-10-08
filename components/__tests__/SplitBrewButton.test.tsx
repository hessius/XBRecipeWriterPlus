import React from "react";
import {StyleSheet} from "react-native";
import {screen} from "@testing-library/react-native";

import SplitBrewButton from "@/components/SplitBrewButton";
import {palette} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";

const ACCENT = "#FF8A3D";

function flattenStyle(testID: string): Record<string, unknown> {
    return (
        StyleSheet.flatten(screen.getByTestId(testID).props.style) ?? {}
    ) as Record<string, unknown>;
}

describe("SplitBrewButton", () => {
    it("draws a divider that contrasts with the fill it sits on", async () => {
        await renderWithProviders(
            <SplitBrewButton enabled accent={ACCENT} flex={2} quickEditOpen={false}
                             onBrew={jest.fn()} onToggleQuickEdit={jest.fn()}/>
        );

        const divider = flattenStyle("split-brew-divider");
        expect(divider.borderLeftWidth).toBe(1);
        expect(divider.borderLeftColor).toBe(palette.base);
        // The point of the whole fix: a hairline the same colour as the fill
        // it is drawn on is not a hairline.
        expect(divider.borderLeftColor).not.toBe(divider.backgroundColor);
    });

    it("fills the arrow half to the height of the control", async () => {
        await renderWithProviders(
            <SplitBrewButton enabled accent={ACCENT} flex={2} quickEditOpen={false}
                             onBrew={jest.fn()} onToggleQuickEdit={jest.fn()}/>
        );

        // Sized to its own glyph, the arrow half is shorter than BREW and the
        // control's dark backing shows through under it as a stray line.
        const divider = flattenStyle("split-brew-divider");
        expect(divider.flex).toBe(1);
        expect(divider.justifyContent).toBe("center");
    });

    it("still contrasts when BREW is disabled", async () => {
        await renderWithProviders(
            <SplitBrewButton enabled={false} accent={ACCENT} flex={2} quickEditOpen={false}
                             onBrew={jest.fn()} onToggleQuickEdit={jest.fn()}/>
        );

        const divider = flattenStyle("split-brew-divider");
        expect(divider.borderLeftColor).not.toBe(divider.backgroundColor);
    });
});

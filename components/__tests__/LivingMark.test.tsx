import React from "react";
import {screen, fireEvent} from "@testing-library/react-native";

import LivingMark from "@/components/LivingMark";
import {useReducedMotion} from "@/constants/motion";
import {renderWithProviders} from "@/test-utils/render";

jest.mock("@/constants/motion", () => ({
    ...jest.requireActual("@/constants/motion"),
    useReducedMotion: jest.fn(() => false)
}));

const mockReducedMotion = jest.mocked(useReducedMotion);

// Each plus glyph lights 11 cells of its 9x9 bitmap; the mark is two glyphs
// side by side, so this is the one count that means "the whole mark drew".
const DOT_COUNT = 22;

describe("LivingMark", () => {
    beforeEach(() => mockReducedMotion.mockReturnValue(false));

    it("draws the mark as dots", async () => {
        await renderWithProviders(<LivingMark size={120}/>);
        expect(screen.getAllByTestId("living-mark-dot")).toHaveLength(DOT_COUNT);
    });

    it("names itself for a screen reader, which cannot see dots", async () => {
        await renderWithProviders(<LivingMark size={120}/>);
        expect(screen.getByLabelText("XBRW++")).toBeTruthy();
    });

    it("still draws the mark under Reduce Motion", async () => {
        // The requirement is that it renders static, not that it disappears.
        mockReducedMotion.mockReturnValue(true);
        await renderWithProviders(<LivingMark size={120}/>);
        expect(screen.getAllByTestId("living-mark-dot")).toHaveLength(DOT_COUNT);
        expect(screen.getByLabelText("XBRW++")).toBeTruthy();
    });

    it("survives a tap", async () => {
        // The scatter is a Reanimated shared value, which a unit test cannot
        // observe. What it can prove is that the gesture is wired and does not
        // throw, which is the failure that would take the screen down.
        await renderWithProviders(<LivingMark size={120}/>);
        await fireEvent.press(screen.getByLabelText("XBRW++"));
        expect(screen.getAllByTestId("living-mark-dot")).toHaveLength(DOT_COUNT);
    });

    it("freezes every dot at the neutral frame under Reduce Motion", async () => {
        // Regression guard: `breath.value === 0` is a point mid-ripple, not
        // a neutral one, so a naive fix leaves a quarter of the dots dim and
        // shrunken and three quarters at two other distinct frames. The
        // static mark requires every dot to land on the same neutral frame.
        mockReducedMotion.mockReturnValue(true);
        await renderWithProviders(<LivingMark size={120}/>);
        const dots = screen.getAllByTestId("living-mark-dot");
        const opacities = new Set(dots.map((dot) => {
            const style = [dot.props.style].flat(Infinity);
            const merged = Object.assign({}, ...style);
            return merged.opacity;
        }));
        expect(opacities).toEqual(new Set([0.72]));
    });
});

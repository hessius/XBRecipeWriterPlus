import React from "react";
import {screen, fireEvent} from "@testing-library/react-native";

import LivingMark from "@/components/LivingMark";
import {palette} from "@/constants/colors";
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

    it("draws the disc the mark is punched out of", async () => {
        // The mark is the app icon, not a bare `++`: without the surrounding
        // field of dots it is a different logo from the one on the home screen.
        await renderWithProviders(<LivingMark size={120}/>);
        expect(screen.getAllByTestId("living-mark-field-dot").length)
            .toBeGreaterThan(DOT_COUNT * 5);
    });

    it("keeps the disc clear of the `++`, so no dot is drawn twice", async () => {
        // Two dots stacked in one cell read as a brighter dot, which would show
        // as a blemish on the field at exactly the mark's corners.
        await renderWithProviders(<LivingMark size={120}/>);
        const field = screen.getAllByTestId("living-mark-field-dot");
        const marks = screen.getAllByTestId("living-mark-dot");
        const position = (node: {props: Record<string, unknown>}) => {
            const merged = Object.assign({}, ...[node.props.style].flat(Infinity));
            return `${merged.left}-${merged.top}`;
        };
        const taken = new Set(marks.map(position));
        expect(field.some((dot) => taken.has(position(dot)))).toBe(false);
    });

    it("picks the `++` out in the brand colour, as the icon does", async () => {
        // The one place the app's own colour appears. Drawn in `text` it is a
        // white-on-white mark and the icon's identity is gone.
        await renderWithProviders(<LivingMark size={120}/>);
        const merged = Object.assign(
            {}, ...[screen.getAllByTestId("living-mark-dot")[0].props.style].flat(Infinity)
        );
        expect(merged.backgroundColor).toBe(palette.brand);
    });
});

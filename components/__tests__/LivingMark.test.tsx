import React from "react";
import {screen, fireEvent} from "@testing-library/react-native";
import {StyleSheet} from "react-native";

import LivingMark, {VARIANTS, nextVariant} from "@/components/LivingMark";
import {palette} from "@/constants/colors";
import {useReducedMotion} from "@/constants/motion";
import {renderWithProviders} from "@/test-utils/render";

jest.mock("@/constants/motion", () => ({
    ...jest.requireActual("@/constants/motion"),
    useReducedMotion: jest.fn(() => false)
}));

const mockReducedMotion = jest.mocked(useReducedMotion);

/** Styles arrive as arrays once a dot is animated; this reads them either way. */
/** The colour's red, green and blue, whatever notation it was written in. */
function channels(colour: unknown): [number, number, number] {
    const value = String(colour);
    const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
    if (hex) return [1, 2, 3].map((part) => parseInt(hex[part], 16)) as [number, number, number];
    const rgb = /rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/.exec(value);
    if (rgb) return [1, 2, 3].map((part) => Number(rgb[part])) as [number, number, number];
    throw new Error(`unrecognised colour: ${value}`);
}

const flatten = (style: unknown) => StyleSheet.flatten(style as never) as Record<string, number>;

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
        // Reanimated composites the colour now that a tap can flash it, so it
        // comes back as rgba rather than the hex it went in as. Compared by
        // channel rather than by string: the same colour in a different
        // notation is not a regression, a different colour is.
        expect(channels(merged.backgroundColor)).toEqual(channels(palette.brand));
    });

    it("groups the field into bands, rather than animating every dot", async () => {
        // The whole point of the banding: the glimmer runs on a few dozen
        // animated views instead of 255 style worklets per frame. If a future
        // change gives each dot its own wrapper, this catches it.
        await renderWithProviders(<LivingMark size={120}/>);
        const bands = screen.getAllByTestId("living-mark-band").length;
        const dots = screen.getAllByTestId("living-mark-field-dot").length;
        expect(bands).toBeLessThan(dots / 4);
    });

    it("still draws every field dot once, now they are grouped", async () => {
        // Grouping is a refactor of where the dots live, not of how many there
        // are; a band that dropped its cells would quietly shrink the disc.
        await renderWithProviders(<LivingMark size={120}/>);
        const dots = screen.getAllByTestId("living-mark-field-dot");
        const places = new Set(dots.map((dot) => {
            const style = flatten(dot.props.style);
            return `${style.left}-${style.top}`;
        }));
        expect(places.size).toBe(dots.length);
    });

    it("never gives the same tap response twice running", async () => {
        // Independent picks would repeat one tap in five, and a repeat reads as
        // the mark having one trick that intermittently fails to fire.
        for (const previous of Object.values(VARIANTS)) {
            for (const roll of [0, 0.25, 0.5, 0.75, 0.999]) {
                expect(nextVariant(() => roll, previous)).not.toBe(previous);
            }
        }
    });

    it("can still reach every response from any starting point", async () => {
        // A skip implemented by clamping rather than shifting would make one
        // variant unreachable, which is invisible until someone counts.
        for (const previous of Object.values(VARIANTS)) {
            const reached = new Set<number>();
            for (let roll = 0; roll < 1; roll += 0.05) {
                reached.add(nextVariant(() => roll, previous));
            }
            expect(reached.size).toBe(Object.keys(VARIANTS).length - 1);
        }
    });
});

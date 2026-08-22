import React from "react";
import {AccessibilityInfo, PixelRatio} from "react-native";
import {act, screen} from "@testing-library/react-native";

import DigitRoll from "@/components/DigitRoll";
import {DURATION} from "@/constants/motion";
import {renderWithProviders} from "@/test-utils/render";

jest.useFakeTimers();

/** The clip box for a digit position. */
function column(index: number) {
    return screen.getAllByTestId("digit-roll-column")[index];
}

/** The height of the clip box — one row of the strip. */
function rowHeight(index: number): number {
    return (column(index).props.style as {height: number}).height;
}

/**
 * How far the strip inside a column is currently translated. This is the only
 * thing that distinguishes a roll from static text, so the tests read it
 * directly rather than trusting that an animation was configured.
 */
function offsetOf(index: number): number {
    const strip = column(index).children[0] as never as {
        props: {jestAnimatedStyle: {value: {transform: {translateY: number}[]}}};
    };
    return strip.props.jestAnimatedStyle.value.transform[0].translateY;
}

/** The laid-out height of each glyph on the strip. */
function rowPitchOf(index: number): number[] {
    const strip = column(index).children[0] as never as {
        children: {props: {style: {height: number; lineHeight: number}[]}}[];
    };
    return strip.children.flatMap((text) =>
        text.props.style.filter((s) => s?.height !== undefined).map((s) => s.height));
}

/** The glyphs on the strip in the order they are stacked. */
function stripOf(index: number): string[] {
    const strip = column(index).children[0] as never as {children: {children: string[]}[]};
    return strip.children.map((text) => text.children[0]);
}

async function advance(ms: number) {
    await act(async () => {
        jest.advanceTimersByTime(ms);
    });
}

describe("DigitRoll", () => {
    it("renders one column per digit", async () => {
        await renderWithProviders(<DigitRoll value={255}/>);
        expect(screen.getAllByTestId("digit-roll-column")).toHaveLength(3);
    });

    it("renders the current value as text", async () => {
        await renderWithProviders(<DigitRoll value={255}/>);
        expect(screen.getByLabelText("255")).toBeTruthy();
    });

    it("pads to the requested minimum width", async () => {
        await renderWithProviders(<DigitRoll value={7} minDigits={3}/>);
        expect(screen.getAllByTestId("digit-roll-column")).toHaveLength(3);
        expect(screen.getByLabelText("007")).toBeTruthy();
    });

    it("appends a suffix outside the rolling columns", async () => {
        await renderWithProviders(<DigitRoll value={255} suffix="ml"/>);
        expect(screen.getAllByTestId("digit-roll-column")).toHaveLength(3);
        expect(screen.getByText("ml")).toBeTruthy();
    });

    it("announces the readout once, with its unit, and hides the strip", async () => {
        await renderWithProviders(<DigitRoll value={255} suffix="ml"/>);

        // The unit is part of the value being announced, not decoration: "255"
        // alone loses the one thing a sighted user reads for free.
        expect(screen.getByLabelText("255ml")).toBeTruthy();

        // A label on a bare View is inert without this — React Native does not
        // promote the node to an accessibility element implicitly.
        expect(screen.getByLabelText("255ml").props.accessible).toBe(true);

        // Otherwise all thirty off-screen glyphs are individually focusable and
        // a three-digit readout is announced as "0 1 2 ... 9", three times.
        for (const col of screen.getAllByTestId("digit-roll-column")) {
            const strip = col.children[0] as never as {props: Record<string, unknown>};
            expect(strip.props.accessibilityElementsHidden).toBe(true);
            expect(strip.props.importantForAccessibility).toBe("no-hide-descendants");
        }
    });

    it("sizes the clip box from the height the glyphs are actually drawn at", async () => {
        const scaleSpy = jest.spyOn(PixelRatio, "getFontScale").mockReturnValue(1);
        await renderWithProviders(<DigitRoll value={5} fontSize={20}/>);
        expect(rowHeight(0)).toBe(Math.round(20 * 1.35));
        scaleSpy.mockRestore();
    });

    it("grows the clip box with the OS font scale, up to the cap", async () => {
        // The glyphs are drawn at fontSize x the OS scale, so a box sized from
        // the *requested* size crops them for exactly the user who turned
        // accessibility text sizing on because they could not read it.
        const scaleSpy = jest.spyOn(PixelRatio, "getFontScale").mockReturnValue(1.4);
        await renderWithProviders(<DigitRoll value={5} fontSize={20}/>);
        expect(rowHeight(0)).toBe(Math.round(20 * 1.4 * 1.35));
        scaleSpy.mockRestore();
    });

    it("stops growing the clip box where DotMatrixText stops scaling", async () => {
        // Scaling is bounded at DOTO_MAX_FONT_SCALE, so past it the box must
        // stop too rather than opening a gap under the glyphs.
        const scaleSpy = jest.spyOn(PixelRatio, "getFontScale").mockReturnValue(3);
        await renderWithProviders(<DigitRoll value={5} fontSize={20}/>);
        expect(rowHeight(0)).toBe(Math.round(20 * 1.4 * 1.35));
        scaleSpy.mockRestore();
    });

    it("grows the column count when the value gains a digit", async () => {
        const {rerender} = await renderWithProviders(<DigitRoll value={9}/>);
        expect(screen.getAllByTestId("digit-roll-column")).toHaveLength(1);

        await rerender(<DigitRoll value={10}/>);
        expect(screen.getAllByTestId("digit-roll-column")).toHaveLength(2);
    });

    it("stacks the whole 0-9 strip in each column, in order", async () => {
        await renderWithProviders(<DigitRoll value={40}/>);

        // Not just the current glyph: the neighbours are what is visible mid-roll.
        expect(stripOf(0)).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
        expect(stripOf(1)).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    });

    it("clips each column to a single row", async () => {
        await renderWithProviders(<DigitRoll value={5}/>);

        // Without this the other nine glyphs are on screen at once.
        expect(column(0).props.style).toMatchObject({overflow: "hidden"});
        expect(rowHeight(0)).toBeGreaterThan(0);

        // Every glyph occupies exactly one clip box, or the offsets — which are
        // multiples of the clip box height — land between digits.
        expect(rowPitchOf(0)).toEqual(new Array(10).fill(rowHeight(0)));
    });

    it("offsets each column to its own digit", async () => {
        await renderWithProviders(<DigitRoll value={123}/>);

        expect(offsetOf(0)).toBe(-1 * rowHeight(0));
        expect(offsetOf(1)).toBe(-2 * rowHeight(1));
        expect(offsetOf(2)).toBe(-3 * rowHeight(2));
    });

    it("rolls through the intermediate glyphs instead of cutting to the new digit", async () => {
        const {rerender} = await renderWithProviders(<DigitRoll value={1}/>);
        expect(offsetOf(0)).toBe(-1 * rowHeight(0));

        await rerender(<DigitRoll value={8}/>);
        await advance(16);

        // One frame in: moving, but nowhere near arrived. A column that remounts
        // (a value-derived key) or never animates lands on its target instantly.
        const midRoll = offsetOf(0);
        expect(midRoll).toBeLessThan(-1 * rowHeight(0));
        expect(midRoll).toBeGreaterThan(-8 * rowHeight(0));

        await advance(DURATION.base);
        expect(offsetOf(0)).toBe(-8 * rowHeight(0));
    });

    it("leaves a digit that did not change where it is", async () => {
        const {rerender} = await renderWithProviders(<DigitRoll value={255}/>);

        await rerender(<DigitRoll value={265}/>);
        await advance(16);

        // The hundreds column holds a 2 before and after, so it must not move.
        expect(offsetOf(0)).toBe(-2 * rowHeight(0));
        expect(offsetOf(1)).not.toBe(-6 * rowHeight(1));

        await advance(DURATION.base);
        expect(offsetOf(0)).toBe(-2 * rowHeight(0));
        expect(offsetOf(1)).toBe(-6 * rowHeight(1));
    });

    it("rounds and clamps out-of-contract values", async () => {
        const {rerender} = await renderWithProviders(<DigitRoll value={254.6}/>);
        expect(screen.getByLabelText("255")).toBeTruthy();
        expect(offsetOf(2)).toBe(-5 * rowHeight(2));

        await rerender(<DigitRoll value={-5}/>);
        await advance(DURATION.base);
        expect(screen.getByLabelText("0")).toBeTruthy();
        expect(screen.getAllByTestId("digit-roll-column")).toHaveLength(1);
        expect(offsetOf(0)).toBeCloseTo(0);
    });

    // Last in the file on purpose: `useReducedMotion` seeds from a module-level
    // cache, so flipping the setting on leaks into every later test in the file.
    it("snaps rather than rolls under Reduce Motion", async () => {
        jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);

        const {rerender} = await renderWithProviders(<DigitRoll value={1}/>);
        await rerender(<DigitRoll value={8}/>);
        await advance(16);

        // Arrived on the first frame, and still shows the new value.
        expect(offsetOf(0)).toBe(-8 * rowHeight(0));
        expect(screen.getByLabelText("8")).toBeTruthy();
    });
});

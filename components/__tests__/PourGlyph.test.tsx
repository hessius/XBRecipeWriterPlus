// components/__tests__/PourGlyph.test.tsx
import React from "react";
import {processColor} from "react-native";

import PourGlyph from "@/components/PourGlyph";
import {accents} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";

// A real accent colour from the palette — used as a stand-in for any accent.
const accent = accents.coffee[0];

describe("PourGlyph", () => {
    it("labels each pattern for a screen reader", async () => {
        const {getByLabelText} = await renderWithProviders(
            <PourGlyph kind="spiral" accent={accent} />
        );
        expect(getByLabelText("Spiral pour")).toBeTruthy();
    });

    it("labels the agitation mark", async () => {
        const {getByLabelText} = await renderWithProviders(
            <PourGlyph kind="agitation" accent={accent} />
        );
        // "Agitation", not "shake". The app's word for this is agitation
        // everywhere else, including the editor and the card format.
        expect(getByLabelText("Agitation")).toBeTruthy();
    });

    it("draws the spiral as one open path", async () => {
        const {getByTestId} = await renderWithProviders(
            <PourGlyph kind="spiral" accent={accent} testID="glyph" />
        );
        const path = getByTestId("glyph-spiral").props.d as string;
        expect(path.startsWith("M")).toBe(true);
        expect(path).not.toContain("Z");
        expect(path.split("L")).toHaveLength(120);
    });

    it("keeps the spiral inside its box", async () => {
        // A spiral that overflows the viewBox is clipped on one side only,
        // which reads as a drawing mistake rather than as a spiral.
        const {getByTestId} = await renderWithProviders(
            <PourGlyph kind="spiral" accent={accent} testID="glyph" />
        );
        const path = getByTestId("glyph-spiral").props.d as string;
        const numbers = path.match(/-?\d+(\.\d+)?/g)!.map(Number);
        expect(Math.min(...numbers)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...numbers)).toBeLessThanOrEqual(9);
    });

    it("draws five tremor strokes of unequal height", async () => {
        const {getByTestId} = await renderWithProviders(
            <PourGlyph kind="agitation" accent={accent} testID="glyph" />
        );
        const heights = [0, 1, 2, 3, 4].map(
            (i) => getByTestId(`glyph-tremor-${i}`).props.height as number
        );
        expect(heights).toHaveLength(5);
        // Three distinct heights, symmetric about the middle: a shake meter,
        // not a barcode and not a staircase.
        expect(new Set(heights).size).toBe(3);
        expect(heights).toEqual([...heights].reverse());
    });

    it("draws the centred target as two rings and a bullseye", async () => {
        const {getByTestId} = await renderWithProviders(
            <PourGlyph kind="centered" accent={accent} testID="glyph" />
        );
        expect(getByTestId("glyph-ring")).toBeTruthy();
        expect(getByTestId("glyph-inner")).toBeTruthy();
        expect(getByTestId("glyph-dot")).toBeTruthy();
    });

    it("draws the circular pattern as one ring, with no target inside it", async () => {
        const {getByTestId, queryByTestId} = await renderWithProviders(
            <PourGlyph kind="circular" accent={accent} testID="glyph" />
        );
        expect(getByTestId("glyph-ring")).toBeTruthy();
        expect(queryByTestId("glyph-inner")).toBeNull();
        expect(queryByTestId("glyph-dot")).toBeNull();
    });

    it("takes its colour from the accent it is given", async () => {
        const testAccent = "#C86A3B";
        const {getByTestId} = await renderWithProviders(
            <PourGlyph kind="circular" accent={testAccent} testID="glyph" />
        );
        // react-native-svg normalises colour strings to {type, payload} objects.
        // Round-trip through processColor to get the expected payload value.
        expect(getByTestId("glyph-ring").props.stroke).toEqual(
            expect.objectContaining({payload: processColor(testAccent)})
        );
    });
});

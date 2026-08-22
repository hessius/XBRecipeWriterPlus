import fs from "fs";
import path from "path";
import React from "react";
import {screen} from "@testing-library/react-native";
import {PixelRatio, StyleSheet} from "react-native";

import DotMatrixText, {
    DOTO_FAMILIES,
    DOTO_MAX_FONT_SCALE,
    DOTO_MIN_FONT_SIZE
} from "@/components/DotMatrixText";
import {renderWithProviders} from "@/test-utils/render";

function styleOf(testID: string): Record<string, unknown> {
    return StyleSheet.flatten(screen.getByTestId(testID).props.style) ?? {};
}

describe("DotMatrixText", () => {
    it("renders its content", async () => {
        await renderWithProviders(<DotMatrixText>255</DotMatrixText>);
        expect(screen.getByText("255")).toBeTruthy();
    });

    it("defaults to the bold Doto instance", async () => {
        await renderWithProviders(<DotMatrixText testID="dm">255</DotMatrixText>);
        // Exact, not /^Doto-/. A prefix match passes for all three families, so
        // it would leave the default — the weight nearly every call site gets —
        // unpinned.
        expect(styleOf("dm").fontFamily).toBe("Doto-Bold");
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

    // The design spec puts Doto's floor at "11 px, and always at weight 700 or
    // heavier", and names this component as the thing that enforces it. The
    // size half of that is covered above; this is the weight half. A 600
    // instance offered here is not a call-site mistake, it is the primitive
    // handing out a weight the spec forbids.
    it("offers no weight below 700", () => {
        expect(Object.values(DOTO_FAMILIES)).toEqual(["Doto-Bold", "Doto-ExtraBold"]);
    });

    // Registration and use can drift in either direction: a family requested
    // but never loaded falls back to the system font silently, and one loaded
    // but never requested is dead weight in the bundle. Reading the layout is
    // the only way to catch either from here.
    it("requests exactly the Doto families the app registers", () => {
        const layout = fs.readFileSync(
            path.join(__dirname, "..", "..", "app", "_layout.tsx"),
            "utf8"
        );
        const registered = [...layout.matchAll(/"(Doto-[A-Za-z]+)":/g)]
            .map((match) => match[1])
            .sort();

        expect(registered).toEqual([...Object.values(DOTO_FAMILIES)].sort());
    });

    it("lets style carry layout", async () => {
        await renderWithProviders(
            <DotMatrixText testID="dm" style={{marginTop: 4}}>255</DotMatrixText>
        );
        expect(styleOf("dm").marginTop).toBe(4);
    });

    it("does not let style defeat the floor or the family", async () => {
        // The executable form of this component's mandate. `style` is applied
        // after the caller's other props, so without deliberate ordering it wins
        // the flatten and a call site can render Inter at 4px through the
        // dot-matrix component. TypeScript rejects these keys, hence the cast —
        // this pins the runtime behaviour for JavaScript callers and for anyone
        // who reaches for `as any` to make a label fit.
        await renderWithProviders(
            <DotMatrixText
                testID="dm"
                fontSize={20}
                style={{fontSize: 4, fontFamily: "Inter-Regular"} as never}>
                255
            </DotMatrixText>
        );
        expect(styleOf("dm").fontSize).toBe(20);
        expect(styleOf("dm").fontFamily).toBe("Doto-Bold");
    });

    it("passes numberOfLines through", async () => {
        await renderWithProviders(
            <DotMatrixText testID="dm" numberOfLines={1}>255</DotMatrixText>
        );
        // A dropped passthrough would silently reflow a dense layout rather than
        // truncating, which is the kind of regression nothing else notices.
        expect(screen.getByTestId("dm").props.numberOfLines).toBe(1);
    });

    it("compensates when the OS is scaling text down", async () => {
        // React Native multiplies fontSize by the font scale after the clamp, so
        // a user on Android "Small" or iOS xSmall would see the 11px floor
        // render at about 9px — below the size at which Doto stops reading as
        // characters, which is the entire reason the floor exists.
        jest.spyOn(PixelRatio, "getFontScale").mockReturnValue(0.85);

        await renderWithProviders(
            <DotMatrixText testID="dm" fontSize={6}>255</DotMatrixText>
        );

        const size = styleOf("dm").fontSize as number;
        expect(size * 0.85).toBeGreaterThanOrEqual(DOTO_MIN_FONT_SIZE);
        jest.restoreAllMocks();
    });

    it("bounds how far the OS may scale text up", async () => {
        // Fixed-width readouts in dense layouts. Scaling is honoured, not
        // refused — a user who needs larger text needs it here too — but
        // unbounded growth truncates the pour profile and the digit column.
        await renderWithProviders(<DotMatrixText testID="dm">255</DotMatrixText>);
        expect(screen.getByTestId("dm").props.maxFontSizeMultiplier).toBe(
            DOTO_MAX_FONT_SCALE
        );
    });
});

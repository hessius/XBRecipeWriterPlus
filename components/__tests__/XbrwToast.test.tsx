import React from "react";
import {screen} from "@testing-library/react-native";

import {XbrwToast} from "@/components/XbrwToast";
import {DOT_ICONS, litCells} from "@/constants/dotIcons";
import {renderWithProviders} from "@/test-utils/render";

/** The face a node is set in. Tamagui flattens its style; RN keeps the array. */
function fontFamilyOf(text: string): string {
    const style = screen.getByText(text).props.style;
    const list = (Array.isArray(style) ? style : [style]) as {fontFamily?: string}[];
    return String(list.reduce<string | undefined>(
        (found, entry) => entry?.fontFamily ?? found, undefined
    ));
}

describe("XbrwToast", () => {
    it("shows the message as prose", async () => {
        await renderWithProviders(
            <XbrwToast type="error" message="Could not read card"/>
        );
        expect(screen.getByText("Could not read card")).toBeTruthy();
    });

    it("draws the glyph for the tone the library tagged the toast with", async () => {
        await renderWithProviders(<XbrwToast type="success" message="Saved"/>);
        const dots = screen.getAllByTestId("dot-icon-dot", {includeHiddenElements: true});
        expect(dots.length).toBeGreaterThan(0);
        // Ties the dot count to the tone's own glyph, not just "some dots
        // rendered" — success (7 dots) and the info fallback (8 dots) differ,
        // so this fails if the tone routing is ever short-circuited.
        expect(dots.length).toBe(litCells(DOT_ICONS.success).length);
    });

    it("announces itself, since a toast is not reachable by touch", async () => {
        await renderWithProviders(<XbrwToast type="blank" message="Already in your library"/>);
        expect(screen.getByLabelText("Already in your library")).toBeTruthy();
    });

    it("takes the width the toast library measured for it", async () => {
        // The library renders `customToast` inside a wrapper with no width of
        // its own, so the toast is shrink-to-fit. A message set to flex:1 has a
        // flex basis of zero, contributes nothing to the parent's intrinsic
        // width, and is laid out at zero width -- which showed on device as a
        // toast with a glyph and a border and no text at all.
        await renderWithProviders(
            <XbrwToast type="error" message="Could not read card" width={320}/>
        );
        const style = screen.getByRole("alert").props.style as {width?: number};
        expect(style.width).toBe(320);
    });

    it("names the tone in dot matrix above the prose", async () => {
        await renderWithProviders(
            <XbrwToast type="error" message="Could not read card"/>
        );
        expect(screen.getByText("ERROR")).toBeTruthy();
    });

    it("keeps the sentence in prose and only the label in dot matrix", async () => {
        await renderWithProviders(
            <XbrwToast type="success" message="Recipe saved"/>
        );
        // The typography rule: Doto is for machine-derived values. A tone is
        // one; a sentence written for a person is not.
        expect(fontFamilyOf("DONE")).toMatch(/Doto/);
        expect(fontFamilyOf("Recipe saved")).not.toMatch(/Doto/);
    });

    it("renders a library type it did not dispatch without crashing", async () => {
        await renderWithProviders(<XbrwToast type="loading" message="Working"/>);
        expect(screen.getByText("Working")).toBeTruthy();
    });
});

import React from "react";
import {screen} from "@testing-library/react-native";

import {XbrwToast} from "@/components/XbrwToast";
import {DOT_ICONS, litCells} from "@/constants/dotIcons";
import {renderWithProviders} from "@/test-utils/render";

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

    it("renders a library type it did not dispatch without crashing", async () => {
        await renderWithProviders(<XbrwToast type="loading" message="Working"/>);
        expect(screen.getByText("Working")).toBeTruthy();
    });
});

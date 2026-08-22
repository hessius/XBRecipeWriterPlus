import React from "react";
import {screen} from "@testing-library/react-native";

import Wordmark from "@/components/Wordmark";
import {palette} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";

function styleOf(text: string): {fontFamily?: string; fontSize?: number; color?: string}[] {
    return screen.getByText(text).props.style as
        {fontFamily?: string; fontSize?: number; color?: string}[];
}

function valueOf(text: string, key: "fontFamily" | "fontSize" | "color") {
    return styleOf(text).reduce<unknown>((found, s) => s?.[key] ?? found, undefined);
}

describe("Wordmark", () => {
    it("renders the product name", async () => {
        await renderWithProviders(<Wordmark/>);
        expect(screen.getByLabelText("XBRW++")).toBeTruthy();
    });

    it("sets the plus signs apart from the letters", async () => {
        await renderWithProviders(<Wordmark/>);
        expect(screen.getByText("XBRW")).toBeTruthy();
        expect(screen.getByText("++")).toBeTruthy();
    });

    it("tints the plus signs without touching the letters", async () => {
        // The `++` carries the fork's identity, so it is the part that may be
        // tinted. Colouring the whole lockup would be a different mark.
        await renderWithProviders(<Wordmark plusColor={palette.success}/>);
        expect(valueOf("++", "color")).toBe(palette.success);
        expect(valueOf("XBRW", "color")).toBe(palette.text);
    });

    it("is one accessibility element, announced as the whole name", async () => {
        // A label on a View is inert unless the View is an element in its own
        // right; without that the lockup reads as "XBRW" then "++".
        await renderWithProviders(<Wordmark/>);
        expect(screen.getByRole("header", {name: "XBRW++"})).toBeTruthy();
    });

    it("recolours the letters as well as the plus signs", async () => {
        await renderWithProviders(<Wordmark color={palette.success}/>);
        expect(valueOf("XBRW", "color")).toBe(palette.success);
        // Unset plusColor follows the letters rather than falling back to white.
        expect(valueOf("++", "color")).toBe(palette.success);
    });

    it("defaults to a size that fits in a header", async () => {
        // The default is what every header call site gets, and it is the one
        // size no explicit-prop test covers.
        await renderWithProviders(<Wordmark/>);
        expect(valueOf("XBRW", "fontSize")).toBe(15);
    });

    it("keeps the two halves the same size and weight", async () => {
        // They are one word set in two Text nodes; any drift shows as a seam.
        await renderWithProviders(<Wordmark fontSize={22}/>);
        expect(valueOf("XBRW", "fontSize")).toBe(valueOf("++", "fontSize"));
        expect(valueOf("XBRW", "fontFamily")).toBe(valueOf("++", "fontFamily"));
        expect(valueOf("XBRW", "fontSize")).toBe(22);
    });

    it("is set in dot matrix", async () => {
        // Allowed in Doto because it is an abbreviation and a version marker —
        // a label on a machine — rather than prose.
        await renderWithProviders(<Wordmark/>);
        expect(valueOf("XBRW", "fontFamily")).toBe("Doto-ExtraBold");
    });
});

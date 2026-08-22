import React from "react";
import {screen} from "@testing-library/react-native";

import ScreenTitle from "@/components/ScreenTitle";
import {palette} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";

/** Whatever the queries hand back; RNTL does not export the type by name. */
type Node = ReturnType<typeof screen.getByText>;

type Style = Record<string, unknown> | undefined;

/**
 * A node's style, always as a list. Tamagui's `Text` flattens its style into a
 * single object while a plain React Native `Text` keeps the array, and this
 * component renders one of each.
 */
function stylesOf(node: Node): Style[] {
    return Array.isArray(node.props.style) ? node.props.style as Style[] : [node.props.style as Style];
}

/** Whether a node is set in the dot-matrix face. */
function isDoto(node: Node): boolean {
    return String(styleValue(node, "fontFamily")).startsWith("Doto-");
}

/** The last value set for a style property, which is the one that wins. */
function styleValue(node: Node, key: string): unknown {
    return stylesOf(node).reduce<unknown>((found, s) => s?.[key] ?? found, undefined);
}

describe("ScreenTitle", () => {
    it("renders the title", async () => {
        await renderWithProviders(<ScreenTitle title="Recipes" count={12}/>);
        expect(screen.getByText("Recipes")).toBeTruthy();
    });

    it("renders the count as a superscript", async () => {
        await renderWithProviders(<ScreenTitle title="Recipes" count={12}/>);
        expect(screen.getByText("12")).toBeTruthy();

        // Smaller than the title and lifted off the baseline, or it reads as a
        // second word rather than an annotation on the first.
        const count = screen.getByTestId("screen-title-count");
        const title = screen.getByText("Recipes");
        expect(styleValue(count, "fontSize") as number)
            .toBeLessThan((styleValue(title, "fontSize") as number) / 2);
        expect(styleValue(count, "marginTop")).toBeGreaterThan(0);
        expect(styleValue(count, "color")).toBe(palette.muted);
    });

    it("keeps prose in Inter and the number in dot matrix", async () => {
        // The typography rule in miniature: the word is prose, the number is a
        // machine-derived value. A title in Doto is the failure mode here.
        await renderWithProviders(<ScreenTitle title="Recipes" count={12}/>);
        // The title's family comes from the Tamagui font config rather than an
        // inline style, so it reads as undefined here; what matters is that it
        // is not Doto, which is the failure this rule exists to prevent.
        expect(isDoto(screen.getByText("Recipes"))).toBe(false);
        expect(isDoto(screen.getByText("12"))).toBe(true);
    });

    it("sets the title in prose, at prose weight", async () => {
        // Absolute, not relative to the count: a title that shrinks to muted
        // light grey is indistinguishable from its own superscript.
        await renderWithProviders(<ScreenTitle title="Recipes" count={12}/>);
        const title = screen.getByText("Recipes");
        expect(styleValue(title, "fontSize")).toBe(28);
        expect(styleValue(title, "fontWeight")).toBe("700");
        expect(styleValue(title, "color")).toBe(palette.text);
    });

    it("keeps a long title from pushing the count off the screen", async () => {
        await renderWithProviders(
            <ScreenTitle title={"Very ".repeat(20) + "Long Title"} count={12}/>
        );
        const title = screen.getByText(/Long Title$/);
        // Flex defaults to no shrinking, so without these the title takes its
        // full measured width and the count is drawn past the container edge.
        expect(styleValue(title, "flexShrink")).toBe(1);
        expect(title.props.numberOfLines).toBe(1);
        expect(screen.getByTestId("screen-title-count")).toBeTruthy();
    });

    it("hangs the count from the top of the line, not the bottom", async () => {
        // A bottom-aligned row would turn the same positive marginTop into a
        // subscript.
        await renderWithProviders(<ScreenTitle title="Recipes" count={12}/>);
        const row = screen.getByText("Recipes").parent!;
        expect(styleValue(row, "alignItems")).toBe("flex-start");
    });

    it("shows the count it was given", async () => {
        await renderWithProviders(<ScreenTitle title="Recipes" count={7}/>);
        expect(screen.getByTestId("screen-title-count").props.children).toBe(7);
    });

    it("omits the count when there is none", async () => {
        await renderWithProviders(<ScreenTitle title="Recipes"/>);
        expect(screen.queryByTestId("screen-title-count")).toBeNull();
    });

    it("omits the count when it is zero, because the empty state says it better", async () => {
        await renderWithProviders(<ScreenTitle title="Recipes" count={0}/>);
        expect(screen.queryByTestId("screen-title-count")).toBeNull();
    });
});

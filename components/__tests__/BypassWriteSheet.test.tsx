import React from "react";
import {screen} from "@testing-library/react-native";

import BypassWriteSheet from "@/components/BypassWriteSheet";
import Recipe from "@/library/Recipe";
import {AA_TEXT, contrast} from "@/test-utils/contrast";
import {renderWithProviders} from "@/test-utils/render";

/** Whatever the queries hand back; RNTL does not export the type by name. */
type Node = ReturnType<typeof screen.getByText>;

/** The last value set for a style property, which is the one that wins. */
function styleValueOf(node: Node, key: string): unknown {
    const style = node.props.style;
    const list = (Array.isArray(style) ? style : [style]) as
        Record<string, unknown>[];
    return list.reduce<unknown>((found, s) => s?.[key] ?? found, undefined);
}

function normaliseHex(colour: string): string {
    return colour.replace(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i, "#$1$1$2$2$3$3");
}

function bypassRecipe(): Recipe {
    const recipe = new Recipe();
    recipe.bypassEnabled = true;
    recipe.bypassVolume = 23;
    return recipe;
}

describe("BypassWriteSheet", () => {
    it("explains that the card copy loses bypass while the saved recipe keeps it", async () => {
        await renderWithProviders(
            <BypassWriteSheet open recipe={bypassRecipe()}
                              onCancel={() => {}} onConfirm={() => {}}/>
        );

        expect(screen.getByText("BYPASS ON CARD")).toBeTruthy();
        expect(screen.getByText(/will brew without the 23 ml bypass/i)).toBeTruthy();
        expect(screen.getByText(/the saved recipe on this phone keeps it/i)).toBeTruthy();
        expect(screen.getByRole("button", {name: "Write without bypass"})).toBeTruthy();
        expect(screen.getByRole("button", {name: "Do not write to the card"})).toBeTruthy();
    });

    it("keeps the warning confirmation label above AA contrast on its rendered button", async () => {
        await renderWithProviders(
            <BypassWriteSheet open recipe={bypassRecipe()}
                              onCancel={() => {}} onConfirm={() => {}}/>
        );

        const button = screen.getByRole("button", {name: "Write without bypass"});
        const label = screen.getByText("Write without bypass");

        const foreground = normaliseHex(styleValueOf(label, "color") as string);
        const background = normaliseHex(styleValueOf(button, "backgroundColor") as string);

        expect(contrast(foreground, background)).toBeGreaterThanOrEqual(AA_TEXT);
    });
});

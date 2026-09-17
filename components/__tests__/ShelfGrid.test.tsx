import React from "react";
import {screen} from "@testing-library/react-native";

import ShelfGrid from "@/components/ShelfGrid";
import type {Shelf} from "@/library/shelves";
import {renderWithProviders} from "@/test-utils/render";

function shelf(over: Partial<Shelf> = {}): Shelf {
    return {id: "tea", label: "TEA", kind: "auto", count: 4, ...over};
}

describe("ShelfGrid", () => {
    it("draws a heading only over a section that has shelves", async () => {
        await renderWithProviders(
            <ShelfGrid shelves={[shelf()]} onOpen={jest.fn()}/>
        );

        expect(screen.getByText("AUTO SHELVES")).toBeTruthy();
        expect(screen.queryByText("YOUR SHELVES")).toBeNull();
    });

    it("puts the shelves a person made above the ones the app invented", async () => {
        await renderWithProviders(
            <ShelfGrid onOpen={jest.fn()} shelves={[
                shelf({id: "tag:morning", label: "morning", kind: "manual", count: 2}),
                shelf()
            ]}/>
        );

        expect(screen.getByText("YOUR SHELVES")).toBeTruthy();
        expect(screen.getByText("AUTO SHELVES")).toBeTruthy();
    });

    it("explains what a shelf is rather than drawing an empty grid", async () => {
        await renderWithProviders(<ShelfGrid shelves={[]} onOpen={jest.fn()}/>);

        expect(screen.getByTestId("shelves-empty")).toBeTruthy();
        expect(screen.queryByTestId("shelf-grid")).toBeNull();
    });

    // The count is spoken as part of the shelf rather than as a second element,
    // because "morning, your shelf, 2 recipes" is one fact and two elements
    // would make a reader swipe twice to learn it.
    it("names the shelf, its kind and its size in one label", async () => {
        await renderWithProviders(
            <ShelfGrid onOpen={jest.fn()} shelves={[
                shelf({id: "tag:morning", label: "morning", kind: "manual", count: 2})
            ]}/>
        );

        expect(screen.getByRole("button", {name: "morning, your shelf, 2 recipes"}))
            .toBeTruthy();
    });

    it("says one recipe rather than 1 recipes", async () => {
        await renderWithProviders(
            <ShelfGrid shelves={[shelf({count: 1})]} onOpen={jest.fn()}/>
        );

        expect(screen.getByRole("button", {name: "TEA, auto shelf, 1 recipe"})).toBeTruthy();
    });
});

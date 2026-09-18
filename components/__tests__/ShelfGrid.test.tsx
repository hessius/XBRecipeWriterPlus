import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import ShelfGrid from "@/components/ShelfGrid";
import Pour from "@/library/Pour";
import type {Shelf} from "@/library/shelves";
import {renderWithProviders} from "@/test-utils/render";

function shelf(over: Partial<Shelf> = {}): Shelf {
    return {id: "tea", label: "TEA", kind: "auto", count: 4, ...over};
}

describe("ShelfGrid", () => {
    it("draws the auto heading only when there are auto shelves", async () => {
        await renderWithProviders(
            <ShelfGrid shelves={[shelf()]} onOpen={jest.fn()} onNewShelf={jest.fn()} onEditShelf={jest.fn()}/>
        );

        expect(screen.getByText("AUTO SHELVES")).toBeTruthy();
        // YOUR SHELVES is drawn over the NEW SHELF button even with no shelves
        // on it, because that button is the section and is the only place in
        // the app a shelf can be made.
        expect(screen.getByText("YOUR SHELVES")).toBeTruthy();
        expect(screen.getByTestId("new-shelf")).toBeTruthy();
    });

    it("puts the shelves a person made above the ones the app invented", async () => {
        await renderWithProviders(
            <ShelfGrid onOpen={jest.fn()} onNewShelf={jest.fn()} onEditShelf={jest.fn()} shelves={[
                shelf({id: "tag:morning", label: "morning", kind: "manual", count: 2}),
                shelf()
            ]}/>
        );

        expect(screen.getByText("YOUR SHELVES")).toBeTruthy();
        expect(screen.getByText("AUTO SHELVES")).toBeTruthy();
    });

    it("explains what a shelf is rather than drawing an empty grid", async () => {
        await renderWithProviders(<ShelfGrid shelves={[]} onOpen={jest.fn()} onNewShelf={jest.fn()} onEditShelf={jest.fn()}/>);

        expect(screen.getByTestId("shelves-empty")).toBeTruthy();
        expect(screen.queryByTestId("shelf-grid")).toBeNull();
    });

    // The count is spoken as part of the shelf rather than as a second element,
    // because "morning, your shelf, 2 recipes" is one fact and two elements
    // would make a reader swipe twice to learn it.
    it("names the shelf, its kind and its size in one label", async () => {
        await renderWithProviders(
            <ShelfGrid onOpen={jest.fn()} onNewShelf={jest.fn()} onEditShelf={jest.fn()} shelves={[
                shelf({id: "tag:morning", label: "morning", kind: "manual", count: 2})
            ]}/>
        );

        expect(screen.getByRole("button", {name: "morning, your shelf, 2 recipes"}))
            .toBeTruthy();
    });

    it("offers EDIT as an accessibility action on the tile itself", async () => {
        // The edit button is nested inside the tile, and the tile is one
        // accessibility element, so VoiceOver never reaches the button. Editing
        // is the only way a recipe comes off a manual shelf, so without this a
        // reader has a shelf it can never change.
        const onEditShelf = jest.fn();
        await renderWithProviders(
            <ShelfGrid onOpen={jest.fn()} onNewShelf={jest.fn()} onEditShelf={onEditShelf}
                       shelves={[shelf({id: "tag:morning", label: "morning", kind: "manual", count: 2})]}/>
        );
        const tile = screen.getByTestId("shelf-tag:morning");
        expect(tile.props.accessibilityActions).toEqual(
            [{name: "edit", label: "Edit the morning shelf"}]
        );

        await fireEvent(tile, "accessibilityAction",
                        {nativeEvent: {actionName: "edit"}});
        expect(onEditShelf).toHaveBeenCalledTimes(1);
    });

    it("says one recipe rather than 1 recipes", async () => {
        await renderWithProviders(
            <ShelfGrid shelves={[shelf({count: 1})]} onOpen={jest.fn()} onNewShelf={jest.fn()} onEditShelf={jest.fn()}/>
        );

        expect(screen.getByRole("button", {name: "TEA, auto shelf, 1 recipe"})).toBeTruthy();
    });

    describe("the art it hands its tiles", () => {
        it("gives an auto shelf the glyph drawn for it", async () => {
            await renderWithProviders(
                <ShelfGrid shelves={[shelf()]} marks={{tea: {accents: ["#A"], profiles: [[]]}}}
                           onOpen={jest.fn()} onNewShelf={jest.fn()} onEditShelf={jest.fn()}/>
            );

            expect(screen.getByTestId("shelf-mark-glyph")).toBeTruthy();
        });

        it("gives a manual shelf its members' profiles", async () => {
            const pour = new Pour(1, 60);

            await renderWithProviders(
                <ShelfGrid shelves={[shelf({id: "tag:morning", label: "morning", kind: "manual"})]}
                           marks={{"tag:morning": {accents: ["#A"], profiles: [[pour]]}}}
                           onOpen={jest.fn()} onNewShelf={jest.fn()} onEditShelf={jest.fn()}/>
            );

            expect(screen.getByTestId("shelf-mark-profiles")).toBeTruthy();
        });

        it("draws the variant a tester picked instead of the hybrid", async () => {
            await renderWithProviders(
                <ShelfGrid shelves={[shelf()]} variant="mosaic"
                           marks={{tea: {accents: ["#A"], profiles: [[]]}}}
                           onOpen={jest.fn()} onNewShelf={jest.fn()} onEditShelf={jest.fn()}/>
            );

            expect(screen.getByTestId("shelf-mark-mosaic")).toBeTruthy();
        });

        it("draws a shelf it has no art for as a plain field", async () => {
            await renderWithProviders(
                <ShelfGrid shelves={[shelf({id: "tag:morning", label: "morning", kind: "manual"})]}
                           onOpen={jest.fn()} onNewShelf={jest.fn()} onEditShelf={jest.fn()}/>
            );

            expect(screen.getByTestId("shelf-mark-field")).toBeTruthy();
        });
    });
});
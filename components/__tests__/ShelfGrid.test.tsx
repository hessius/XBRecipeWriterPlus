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
            <ShelfGrid shelves={[shelf()]} onOpen={jest.fn()} onNewShelf={jest.fn()} onShelfActions={jest.fn()}/>
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
            <ShelfGrid onOpen={jest.fn()} onNewShelf={jest.fn()} onShelfActions={jest.fn()} shelves={[
                shelf({id: "tag:morning", label: "morning", kind: "manual", count: 2}),
                shelf()
            ]}/>
        );

        expect(screen.getByText("YOUR SHELVES")).toBeTruthy();
        expect(screen.getByText("AUTO SHELVES")).toBeTruthy();
    });

    it("explains what a shelf is rather than drawing an empty grid", async () => {
        await renderWithProviders(<ShelfGrid shelves={[]} onOpen={jest.fn()} onNewShelf={jest.fn()} onShelfActions={jest.fn()}/>);

        expect(screen.getByTestId("shelves-empty")).toBeTruthy();
        expect(screen.queryByTestId("shelf-grid")).toBeNull();
    });

    // The count is spoken as part of the shelf rather than as a second element,
    // because "morning, your shelf, 2 recipes" is one fact and two elements
    // would make a reader swipe twice to learn it.
    it("names the shelf, its kind and its size in one label", async () => {
        await renderWithProviders(
            <ShelfGrid onOpen={jest.fn()} onNewShelf={jest.fn()} onShelfActions={jest.fn()} shelves={[
                shelf({id: "tag:morning", label: "morning", kind: "manual", count: 2})
            ]}/>
        );

        expect(screen.getByRole("button", {name: "morning, your shelf, 2 recipes"}))
            .toBeTruthy();
    });

    it("offers the shelf's actions as an accessibility action on the tile", async () => {
        // The glyph is nested inside the tile, and the tile is one
        // accessibility element, so VoiceOver never reaches the glyph. Editing
        // is the only way a recipe comes off a manual shelf, so without this a
        // reader has a shelf it can never change.
        const onShelfActions = jest.fn();
        await renderWithProviders(
            <ShelfGrid onOpen={jest.fn()} onNewShelf={jest.fn()} onShelfActions={onShelfActions}
                       shelves={[shelf({id: "tag:morning", label: "morning", kind: "manual", count: 2})]}/>
        );
        const tile = screen.getByTestId("shelf-tag:morning");
        expect(tile.props.accessibilityActions).toEqual(
            [{name: "edit", label: "Actions for the morning shelf"}]
        );

        await fireEvent(tile, "accessibilityAction",
                        {nativeEvent: {actionName: "edit"}});
        expect(onShelfActions).toHaveBeenCalledTimes(1);
    });

    it("opens the same actions from a long press on the tile", async () => {
        // The shortcut, for the hand that already knows where it is. It is
        // never the only door: the glyph above draws the same menu.
        const onShelfActions = jest.fn();
        await renderWithProviders(
            <ShelfGrid onOpen={jest.fn()} onNewShelf={jest.fn()} onShelfActions={onShelfActions}
                       shelves={[shelf({id: "tag:morning", label: "morning", kind: "manual", count: 2})]}/>
        );

        await fireEvent(screen.getByTestId("shelf-tag:morning"), "longPress");
        expect(onShelfActions).toHaveBeenCalledTimes(1);
    });

    it("gives an auto shelf no actions and no long press", async () => {
        // An auto shelf is a rule the app wrote: no name of the user's to
        // change, nothing of theirs to delete.
        const onShelfActions = jest.fn();
        await renderWithProviders(
            <ShelfGrid onOpen={jest.fn()} onNewShelf={jest.fn()} onShelfActions={onShelfActions}
                       shelves={[shelf({id: "tea", label: "TEA", kind: "auto", count: 2})]}/>
        );
        const tile = screen.getByTestId("shelf-tea");
        expect(tile.props.accessibilityActions).toBeUndefined();

        await fireEvent(tile, "longPress");
        expect(onShelfActions).not.toHaveBeenCalled();
    });

    it("drives the screen's collapsing header from its own scroll", async () => {
        // The grid is the one view whose content is already tiles, so it is
        // where the wordmark and the CTA tiles cost the most. They stayed up.
        const onScroll = jest.fn();
        await renderWithProviders(
            <ShelfGrid shelves={[shelf({count: 1})]} onOpen={jest.fn()}
                       onNewShelf={jest.fn()} onShelfActions={jest.fn()}
                       onScroll={onScroll}/>
        );

        await fireEvent.scroll(screen.getByTestId("shelf-grid"), {
            nativeEvent: {
                contentOffset:     {y: 200},
                contentSize:       {height: 2000},
                layoutMeasurement: {height: 800}
            }
        });
        expect(onScroll).toHaveBeenCalledTimes(1);
    });

    it("says one recipe rather than 1 recipes", async () => {
        await renderWithProviders(
            <ShelfGrid shelves={[shelf({count: 1})]} onOpen={jest.fn()} onNewShelf={jest.fn()} onShelfActions={jest.fn()}/>
        );

        expect(screen.getByRole("button", {name: "TEA, auto shelf, 1 recipe"})).toBeTruthy();
    });

    describe("the art it hands its tiles", () => {
        it("gives an auto shelf the glyph drawn for it", async () => {
            await renderWithProviders(
                <ShelfGrid shelves={[shelf()]} marks={{tea: {accents: ["#A"], profiles: [[]]}}}
                           onOpen={jest.fn()} onNewShelf={jest.fn()} onShelfActions={jest.fn()}/>
            );

            expect(screen.getByTestId("shelf-mark-glyph")).toBeTruthy();
        });

        it("gives a manual shelf its members' profiles", async () => {
            const pour = new Pour(1, 60);

            await renderWithProviders(
                <ShelfGrid shelves={[shelf({id: "tag:morning", label: "morning", kind: "manual"})]}
                           marks={{"tag:morning": {accents: ["#A"], profiles: [[pour]]}}}
                           onOpen={jest.fn()} onNewShelf={jest.fn()} onShelfActions={jest.fn()}/>
            );

            expect(screen.getByTestId("shelf-mark-profiles")).toBeTruthy();
        });

        it("draws the variant a tester picked instead of the hybrid", async () => {
            await renderWithProviders(
                <ShelfGrid shelves={[shelf()]} variant="mosaic"
                           marks={{tea: {accents: ["#A"], profiles: [[]]}}}
                           onOpen={jest.fn()} onNewShelf={jest.fn()} onShelfActions={jest.fn()}/>
            );

            expect(screen.getByTestId("shelf-mark-mosaic")).toBeTruthy();
        });

        it("draws a shelf it has no art for as a plain field", async () => {
            await renderWithProviders(
                <ShelfGrid shelves={[shelf({id: "tag:morning", label: "morning", kind: "manual"})]}
                           onOpen={jest.fn()} onNewShelf={jest.fn()} onShelfActions={jest.fn()}/>
            );

            expect(screen.getByTestId("shelf-mark-field")).toBeTruthy();
        });
    });

    describe("shelves the user has put away", () => {
        it("keeps a hidden auto shelf off the grid", async () => {
            await renderWithProviders(
                <ShelfGrid onOpen={jest.fn()} onNewShelf={jest.fn()}
                           onShelfActions={jest.fn()} onHideShelf={jest.fn()}
                           hidden={["tea"]} shelves={[
                    shelf(),
                    shelf({id: "single", label: "SINGLE POUR"})
                ]}/>
            );

            // By tile rather than by name: the footer under the grid names it
            // too, which is the point of the footer.
            expect(screen.queryByRole("button", {name: "TEA, auto shelf, 4 recipes"}))
                .toBeNull();
            expect(screen.getByRole("button", {name: "SINGLE POUR, auto shelf, 4 recipes"}))
                .toBeTruthy();
        });

        it("says how many are hidden and offers each one back", async () => {
            const onHideShelf = jest.fn();
            await renderWithProviders(
                <ShelfGrid onOpen={jest.fn()} onNewShelf={jest.fn()}
                           onShelfActions={jest.fn()} onHideShelf={onHideShelf}
                           hidden={["tea"]} shelves={[shelf()]}/>
            );

            expect(screen.getByText("1 HIDDEN")).toBeTruthy();
            fireEvent.press(screen.getByTestId("shelf-show-tea"));
            expect(onHideShelf).toHaveBeenCalledWith("tea");
        });

        it("draws no footer when nothing is hidden", async () => {
            await renderWithProviders(
                <ShelfGrid onOpen={jest.fn()} onNewShelf={jest.fn()}
                           onShelfActions={jest.fn()} onHideShelf={jest.fn()}
                           shelves={[shelf()]}/>
            );

            expect(screen.queryByTestId("hidden-shelves")).toBeNull();
        });

        // A shelf hidden while it had members and since emptied is not on the
        // grid to begin with, so offering it back would show the user nothing.
        it("counts only the hidden shelves that still exist", async () => {
            await renderWithProviders(
                <ShelfGrid onOpen={jest.fn()} onNewShelf={jest.fn()}
                           onShelfActions={jest.fn()} onHideShelf={jest.fn()}
                           hidden={["tea", "gone"]} shelves={[
                    shelf(),
                    shelf({id: "single", label: "SINGLE POUR"})
                ]}/>
            );

            expect(screen.getByText("1 HIDDEN")).toBeTruthy();
            expect(screen.queryByTestId("shelf-show-gone")).toBeNull();
        });

        // The heading is what tells a reader the footer under it is about auto
        // shelves. With every one of them hidden it is the only thing left.
        it("keeps the auto heading when every auto shelf is hidden", async () => {
            await renderWithProviders(
                <ShelfGrid onOpen={jest.fn()} onNewShelf={jest.fn()}
                           onShelfActions={jest.fn()} onHideShelf={jest.fn()}
                           hidden={["tea"]} shelves={[shelf()]}/>
            );

            expect(screen.getByText("AUTO SHELVES")).toBeTruthy();
            expect(screen.getByTestId("hidden-shelves")).toBeTruthy();
        });

        it("hides an auto shelf from its own accessibility action", async () => {
            const onHideShelf = jest.fn();
            await renderWithProviders(
                <ShelfGrid onOpen={jest.fn()} onNewShelf={jest.fn()}
                           onShelfActions={jest.fn()} onHideShelf={onHideShelf}
                           shelves={[shelf()]}/>
            );

            // Both halves, because `fireEvent` will run the handler whether or
            // not the action was declared: a tile that answers an action it
            // never offered is unreachable in the app.
            const tile = screen.getByRole("button", {name: "TEA, auto shelf, 4 recipes"});
            expect(tile.props.accessibilityActions)
                .toEqual([{name: "hide", label: "Hide the TEA shelf"}]);
            fireEvent(tile, "accessibilityAction", {nativeEvent: {actionName: "hide"}});
            expect(onHideShelf).toHaveBeenCalledWith("tea");
        });

        // A manual shelf has a menu with a delete in it. Hiding is the answer
        // to a shelf the user cannot delete, so it is not offered on one they
        // can, and a long press there must keep opening the menu.
        it("puts a long press on an auto tile onto hiding it", async () => {
            const onHideShelf = jest.fn();
            await renderWithProviders(
                <ShelfGrid onOpen={jest.fn()} onNewShelf={jest.fn()}
                           onShelfActions={jest.fn()} onHideShelf={onHideShelf}
                           shelves={[shelf()]}/>
            );

            fireEvent(screen.getByRole("button", {name: "TEA, auto shelf, 4 recipes"}),
                      "longPress");
            expect(onHideShelf).toHaveBeenCalledWith("tea");
        });

        it("does not offer to hide a shelf the user made", async () => {
            await renderWithProviders(
                <ShelfGrid onOpen={jest.fn()} onNewShelf={jest.fn()}
                           onShelfActions={jest.fn()} onHideShelf={jest.fn()}
                           shelves={[
                    shelf({id: "tag:morning", label: "morning", kind: "manual", count: 2})
                ]}/>
            );

            const tile = screen.getByRole("button", {name: "morning, your shelf, 2 recipes"});
            expect(tile.props.accessibilityActions)
                .toEqual([{name: "edit", label: "Actions for the morning shelf"}]);
        });
    });

    // The point of inverting is that the shelf's colour moves off the small
    // square and onto the whole tile. Asserted by test id, because Tamagui
    // resolves colour to a class and a test cannot read a background back.
    describe("inverted auto tiles", () => {
        it("leaves the colour on the glyph square when upright", async () => {
            await renderWithProviders(
                <ShelfGrid shelves={[shelf()]}
                           marks={{tea: {accents: ["#A1B2C3"], profiles: [[]]}}}
                           onOpen={jest.fn()} onNewShelf={jest.fn()}
                           onShelfActions={jest.fn()}/>
            );

            expect(screen.getByTestId("shelf-mark-glyph")).toBeTruthy();
        });

        it("takes the colour off the glyph square when inverted", async () => {
            await renderWithProviders(
                <ShelfGrid shelves={[shelf()]}
                           marks={{tea: {accents: ["#A1B2C3"], profiles: [[]]}}}
                           invertAuto onOpen={jest.fn()} onNewShelf={jest.fn()}
                           onShelfActions={jest.fn()}/>
            );

            expect(screen.getByTestId("shelf-mark-glyph-inverted")).toBeTruthy();
            expect(screen.queryByTestId("shelf-mark-glyph")).toBeNull();
        });
    });
});

// Author shelves are grouped on a folded key but their id carries whichever
// spelling the representative recipe used. Comparing ids exactly meant a
// library whose representative changed case brought a put-away shelf back.
describe("an author shelf whose spelling changes", () => {
    it("stays put away", async () => {
        await renderWithProviders(
            <ShelfGrid
                shelves={[{id: "sharedBy:CAFÉ", label: "CAFÉ", kind: "auto",
                           count: 4}]}
                hidden={["sharedBy:café"]}
                onOpen={jest.fn()} onNewShelf={jest.fn()}
                onShelfActions={jest.fn()} onHideShelf={jest.fn()}/>
        );

        // Off the grid and in the footer, which is where a put-away shelf
        // says its name.
        expect(screen.queryByTestId("shelf-sharedBy:CAFÉ")).toBeNull();
        expect(screen.getByText("1 HIDDEN")).toBeTruthy();
        expect(screen.getByTestId("shelf-show-sharedBy:CAFÉ")).toBeTruthy();
    });
});

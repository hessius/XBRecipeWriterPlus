import React from "react";
import {fireEvent, screen, waitFor, within} from "@testing-library/react-native";
import {renderWithProviders} from "@/test-utils/render";
import SwipeableRecipeRow from "@/components/SwipeableRecipeRow";
import {View as RNView} from "react-native";
import Recipe from "@/library/Recipe";
import {palette} from "@/constants/colors";
import {DOT_ICONS, litCells} from "@/constants/dotIcons";

/** The colour a dot icon's dots are drawn in. */
function dotColourOf(testID: string): string {
    const dot = within(screen.getByTestId(testID, {includeHiddenElements: true}))
        .getAllByTestId("dot-icon-dot", {includeHiddenElements: true})[0];
    const list = (Array.isArray(dot.props.style) ? dot.props.style : [dot.props.style]) as
        {backgroundColor?: string}[];
    return String(list.reduce<string | undefined>(
        (found, entry) => entry?.backgroundColor ?? found, undefined
    ));
}

function makeRecipe(title = "Ethiopia Guji") {
    const recipe = new Recipe();
    recipe.name = title;
    return recipe;
}

function recipe(): Recipe {
    const r = new Recipe();
    r.name = "Ethiopia Guji";
    r.dosage = 18;
    r.ratio = 16;
    r.grindSize = 62;
    return r;
}

function props(overrides = {}) {
    return {
        recipe: recipe(),
        onPress: jest.fn(),
        onDelete: jest.fn(),
        onDuplicate: jest.fn(),
        ...overrides
    };
}

describe("SwipeableRecipeRow", () => {
    it("leaves a gap between the card and the first revealed action", async () => {
        // Without it the copy tile butts straight up against the card's edge and
        // reads as part of it, rather than as something the card slid off.
        await renderWithProviders(<SwipeableRecipeRow {...props()}/>);
        const actions = screen.getByTestId("row-actions", {includeHiddenElements: true});
        const style = actions.props.style as {paddingLeft?: number};

        expect(style.paddingLeft).toBeGreaterThan(0);
    });

    it("renders the recipe", async () => {
        await renderWithProviders(
            <SwipeableRecipeRow recipe={makeRecipe()} onPress={jest.fn()} onDelete={jest.fn()}
                                onDuplicate={jest.fn()}/>
        );

        expect(screen.getByText("Ethiopia Guji")).toBeTruthy();
    });

    // Several tests below stand in for the native measurement, which is a
    // prototype method shared by every View in the run.
    afterEach(() => jest.restoreAllMocks());

    it("calls onPress when the row is tapped", async () => {
        const onPress = jest.fn();
        await renderWithProviders(
            <SwipeableRecipeRow recipe={makeRecipe()} onPress={onPress} onDelete={jest.fn()}
                                onDuplicate={jest.fn()}/>
        );

        await fireEvent.press(screen.getByText("Ethiopia Guji"));

        // No measurement comes back under the test renderer, which is exactly
        // the case the deadline exists for: the recipe still opens.
        await waitFor(() => expect(onPress).toHaveBeenCalledWith(undefined));
    });

    it("hands the editor the rectangle the card was at, so it can open out of it", async () => {
        const onPress = jest.fn();
        const rect = {x: 12, y: 300, width: 360, height: 120};
        jest.spyOn(RNView.prototype, "measureInWindow").mockImplementation(
            (callback: (x: number, y: number, width: number, height: number) => void) => {
                callback(rect.x, rect.y, rect.width, rect.height);
            }
        );

        await renderWithProviders(
            <SwipeableRecipeRow recipe={makeRecipe()} onPress={onPress} onDelete={jest.fn()}
                                onDuplicate={jest.fn()}/>
        );

        await fireEvent.press(screen.getByText("Ethiopia Guji"));

        expect(onPress).toHaveBeenCalledWith(rect);
    });

    it("opens without a rectangle rather than animating from a card of no size", async () => {
        const onPress = jest.fn();
        jest.spyOn(RNView.prototype, "measureInWindow").mockImplementation(
            (callback: (x: number, y: number, width: number, height: number) => void) => {
                callback(0, 0, 0, 0);
            }
        );

        await renderWithProviders(
            <SwipeableRecipeRow recipe={makeRecipe()} onPress={onPress} onDelete={jest.fn()}
                                onDuplicate={jest.fn()}/>
        );

        await fireEvent.press(screen.getByText("Ethiopia Guji"));

        expect(onPress).toHaveBeenCalledWith(undefined);
    });

    it("fires delete and duplicate from the swipe actions", async () => {
        const onDelete = jest.fn();
        const onDuplicate = jest.fn();
        await renderWithProviders(
            <SwipeableRecipeRow recipe={makeRecipe()} onPress={jest.fn()} onDelete={onDelete}
                                onDuplicate={onDuplicate}/>
        );

        await fireEvent.press(screen.getByLabelText("Delete Ethiopia Guji"));
        expect(onDelete).toHaveBeenCalled();

        await fireEvent.press(screen.getByLabelText("Duplicate Ethiopia Guji"));
        expect(onDuplicate).toHaveBeenCalled();
    });

    it("labels the actions with the recipe title so they are distinguishable in a list", async () => {
        await renderWithProviders(
            <SwipeableRecipeRow recipe={makeRecipe("Kenya AA")} onPress={jest.fn()} onDelete={jest.fn()}
                                onDuplicate={jest.fn()}/>
        );

        expect(screen.getByLabelText("Delete Kenya AA")).toBeTruthy();
        expect(screen.getByLabelText("Duplicate Kenya AA")).toBeTruthy();
    });

    it("draws the swipe actions as dot glyphs", async () => {
        await renderWithProviders(<SwipeableRecipeRow {...props()}/>);

        const dots = (testID: string) =>
            within(screen.getByTestId(testID, {includeHiddenElements: true}))
                .getAllByTestId("dot-icon-dot", {includeHiddenElements: true});

        expect(dots("row-action-duplicate"))
            .toHaveLength(litCells(DOT_ICONS.duplicate).length);
        expect(dots("row-action-delete"))
            .toHaveLength(litCells(DOT_ICONS.delete).length);
    });

    it("spends colour as ink rather than as fill", async () => {
        await renderWithProviders(<SwipeableRecipeRow {...props()}/>);

        // The tiles are the app's own surface colour. A solid red block beside
        // a saturated accent card was three loud things in a row; here the tone
        // is carried entirely by the glyph and its caption.
        const tile = screen.getByLabelText("Delete Ethiopia Guji")
            .props.style as {backgroundColor?: string};
        expect(tile.backgroundColor).toBe(palette.surface);

        expect(dotColourOf("row-action-delete")).toBe(palette.danger);
        expect(dotColourOf("row-action-duplicate")).toBe(palette.success);
    });

    it("captions the actions, since a glyph alone is a guess", async () => {
        await renderWithProviders(<SwipeableRecipeRow {...props()}/>);

        expect(screen.getByText("DELETE")).toBeTruthy();
        expect(screen.getByText("COPY")).toBeTruthy();
    });

    it("renders the recipe as a card", async () => {
        await renderWithProviders(<SwipeableRecipeRow {...props()}/>);
        expect(screen.getByTestId("recipe-card")).toBeTruthy();
        expect(screen.getByText("Ethiopia Guji")).toBeTruthy();
    });

    it("keeps the destructive actions hidden until asked", async () => {
        await renderWithProviders(<SwipeableRecipeRow {...props({editing: false})}/>);
        // Hidden elements are included on purpose: the glyph is hidden from the
        // accessibility tree, so a bare query would report it absent whether it
        // had been rendered or not.
        expect(screen.queryByTestId("recipe-card-delete", {includeHiddenElements: true}))
            .toBeNull();
    });

    it("reveals them inline while editing", async () => {
        // The swipe gesture is a shortcut. It may not be the only route to a
        // destructive action, and it is not available to a screen reader at all.
        await renderWithProviders(<SwipeableRecipeRow {...props({editing: true})}/>);
        expect(screen.getByTestId("recipe-card-delete", {includeHiddenElements: true}))
            .toBeTruthy();
        expect(screen.getByTestId("recipe-card-duplicate", {includeHiddenElements: true}))
            .toBeTruthy();
    });

    it("deletes from the inline action", async () => {
        const handlers = props({editing: true});
        await renderWithProviders(<SwipeableRecipeRow {...handlers}/>);
        // Pressed by its accessible name rather than the glyph's testID: the
        // glyph is no longer the pressable, the labelled key around it is.
        await fireEvent.press(screen.getByRole("button", {name: "Delete recipe"}));
        expect(handlers.onDelete).toHaveBeenCalledTimes(1);
    });

    it("passes the coffee marker setting through to the card", async () => {
        await renderWithProviders(
            <SwipeableRecipeRow {...props({showCoffeeMarker: false})}/>
        );
        expect(screen.queryByText("COFFEE")).toBeNull();
    });
});

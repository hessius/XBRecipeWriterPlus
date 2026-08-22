import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";
import {renderWithProviders} from "@/test-utils/render";
import SwipeableRecipeRow from "@/components/SwipeableRecipeRow";
import Recipe from "@/library/Recipe";

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
    it("renders the recipe", async () => {
        await renderWithProviders(
            <SwipeableRecipeRow recipe={makeRecipe()} onPress={jest.fn()} onDelete={jest.fn()}
                                onDuplicate={jest.fn()}/>
        );

        expect(screen.getByText("Ethiopia Guji")).toBeTruthy();
    });

    it("calls onPress when the row is tapped", async () => {
        const onPress = jest.fn();
        await renderWithProviders(
            <SwipeableRecipeRow recipe={makeRecipe()} onPress={onPress} onDelete={jest.fn()}
                                onDuplicate={jest.fn()}/>
        );

        await fireEvent.press(screen.getByText("Ethiopia Guji"));

        expect(onPress).toHaveBeenCalled();
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

    it("renders the recipe as a card", async () => {
        await renderWithProviders(<SwipeableRecipeRow {...props()}/>);
        expect(screen.getByTestId("recipe-card")).toBeTruthy();
        expect(screen.getByText("Ethiopia Guji")).toBeTruthy();
    });

    it("keeps the destructive actions hidden until asked", async () => {
        await renderWithProviders(<SwipeableRecipeRow {...props({editing: false})}/>);
        expect(screen.queryByTestId("recipe-card-delete")).toBeNull();
    });

    it("reveals them inline while editing", async () => {
        // The swipe gesture is a shortcut. It may not be the only route to a
        // destructive action, and it is not available to a screen reader at all.
        await renderWithProviders(<SwipeableRecipeRow {...props({editing: true})}/>);
        expect(screen.getByTestId("recipe-card-delete")).toBeTruthy();
        expect(screen.getByTestId("recipe-card-duplicate")).toBeTruthy();
    });

    it("deletes from the inline action", async () => {
        const handlers = props({editing: true});
        await renderWithProviders(<SwipeableRecipeRow {...handlers}/>);
        await fireEvent.press(screen.getByTestId("recipe-card-delete"));
        expect(handlers.onDelete).toHaveBeenCalledTimes(1);
    });

    it("passes the coffee marker setting through to the card", async () => {
        await renderWithProviders(
            <SwipeableRecipeRow {...props({showCoffeeMarker: false})}/>
        );
        expect(screen.queryByText("COFFEE")).toBeNull();
    });
});

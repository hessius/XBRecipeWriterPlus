import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import ShelfRoom, {type RoomRecipeActions} from "@/components/ShelfRoom";
import Recipe from "@/library/Recipe";
import {renderWithProviders} from "@/test-utils/render";

function named(name: string): Recipe {
    const r = new Recipe();
    r.name = name;
    return r;
}

function actionsFor(overrides: Partial<RoomRecipeActions> = {}) {
    return (): RoomRecipeActions => ({
        onOpen:       jest.fn(),
        onLongPress:  jest.fn(),
        onShare:      jest.fn(),
        onWrite:      jest.fn(),
        onDuplicate:  jest.fn(),
        onDelete:     jest.fn(),
        onHistory:    jest.fn(),
        ...overrides
    });
}

describe("ShelfRoom", () => {
    it("names the shelf and counts its recipes", async () => {
        await renderWithProviders(
            <ShelfRoom label="MORNINGS"
                       recipes={[named("Ethiopia"), named("Kenya"), named("Yirgacheffe")]}
                       onBack={jest.fn()} actionsFor={actionsFor()}/>
        );

        expect(screen.getByTestId("shelf-room-title").props.children).toBe("MORNINGS");
        expect(screen.getByTestId("shelf-room-count").props.children).toBe("3 recipes");
    });

    it("says '1 recipe' for a shelf of one", async () => {
        await renderWithProviders(
            <ShelfRoom label="RARE" recipes={[named("Gesha")]}
                       onBack={jest.fn()} actionsFor={actionsFor()}/>
        );
        expect(screen.getByTestId("shelf-room-count").props.children).toBe("1 recipe");
    });

    it("draws a tile for every recipe on the shelf", async () => {
        await renderWithProviders(
            <ShelfRoom label="MORNINGS"
                       recipes={[named("Ethiopia"), named("Kenya"), named("Yirgacheffe")]}
                       onBack={jest.fn()} actionsFor={actionsFor()}/>
        );
        expect(screen.getAllByTestId("recipe-tile")).toHaveLength(3);
    });

    it("leaves the room when back is pressed", async () => {
        const onBack = jest.fn();
        await renderWithProviders(
            <ShelfRoom label="MORNINGS" recipes={[named("Ethiopia")]}
                       onBack={onBack} actionsFor={actionsFor()}/>
        );
        await fireEvent.press(screen.getByTestId("shelf-room-back"));
        expect(onBack).toHaveBeenCalledTimes(1);
    });

    it("opens a recipe's actions on a long press", async () => {
        const onLongPress = jest.fn();
        const recipe = named("Ethiopia");
        await renderWithProviders(
            <ShelfRoom label="MORNINGS" recipes={[recipe]}
                       onBack={jest.fn()} actionsFor={actionsFor({onLongPress})}/>
        );
        await fireEvent(screen.getByTestId(`recipe-tile-${recipe.uuid}`), "longPress");
        expect(onLongPress).toHaveBeenCalledTimes(1);
    });
});

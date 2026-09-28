import React from "react";
import {StyleSheet} from "react-native";
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
    it("drives the screen's collapsing header from its own scroll", async () => {
        // A room is a scrolling view like the list, and the header treated it
        // as if it never moved.
        const onScroll = jest.fn();
        await renderWithProviders(
            <ShelfRoom label="MORNINGS" recipes={[named("Ethiopia")]}
                       onBack={jest.fn()} actionsFor={actionsFor()}
                       onScroll={onScroll}/>
        );

        await fireEvent.scroll(screen.getByTestId("shelf-room"), {
            nativeEvent: {
                contentOffset:     {y: 200},
                contentSize:       {height: 2000},
                layoutMeasurement: {height: 800}
            }
        });
        expect(onScroll).toHaveBeenCalledTimes(1);
    });

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

    it("keeps a tag shelf's own spelling in its title", async () => {
        // A tag is a word the user typed, and the matrix face is drawn in caps:
        // rendering one in it hands back a recasing of their own word. The room
        // used to ask whether the shelf was manual, which a tag shelf is not,
        // so every promoted-in-waiting shelf was titled in the wrong voice.
        await renderWithProviders(
            <ShelfRoom label="Mornings" recipes={[named("Ethiopia")]}
                       onBack={jest.fn()} actionsFor={actionsFor()} namedByUser/>
        );

        const style = StyleSheet.flatten(
            screen.getByTestId("shelf-room-title").props.style
        );
        expect(style?.fontFamily).toBeUndefined();
    });

    it("draws an auto shelf's title in the matrix face", async () => {
        await renderWithProviders(
            <ShelfRoom label="TEA" recipes={[named("Sencha")]}
                       onBack={jest.fn()} actionsFor={actionsFor()}/>
        );

        const style = StyleSheet.flatten(
            screen.getByTestId("shelf-room-title").props.style
        );
        expect(style?.fontFamily).toMatch(/Doto/i);
    });

    it("draws a tile for every recipe on the shelf", async () => {
        await renderWithProviders(
            <ShelfRoom label="MORNINGS"
                       recipes={[named("Ethiopia"), named("Kenya"), named("Yirgacheffe")]}
                       onBack={jest.fn()} actionsFor={actionsFor()}/>
        );
        expect(screen.getAllByTestId("recipe-tile")).toHaveLength(3);
    });

    it("shows each recipe's name in the room", async () => {
        await renderWithProviders(
            <ShelfRoom label="MORNINGS" recipes={[named("Ethiopia")]}
                       onBack={jest.fn()} actionsFor={actionsFor()}/>
        );
        expect(screen.getByText("Ethiopia")).toBeTruthy();
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

import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import RecipeShelfTile from "@/components/RecipeShelfTile";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import Pour, {POUR_PATTERN} from "@/library/Pour";
import {renderWithProviders} from "@/test-utils/render";

function named(name: string): Recipe {
    const r = new Recipe();
    r.name = name;
    return r;
}

/** A recipe a card can actually hold, so the WRITE action is offered. */
function writable(name: string): Recipe {
    const r = named(name);
    r.cupType = CUP_TYPE.XPOD;
    r.dosage = 15;
    r.ratio = 15;
    r.grindSize = 60;
    r.grindRPM = 90;
    r.pours = [new Pour(0, 225, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0)];
    return r;
}

const HANDLERS = {
    onPress:           jest.fn(),
    onLongPress:       jest.fn(),
    onShare:           jest.fn(),
    onDuplicate:       jest.fn(),
    onDelete:          jest.fn()
};

describe("RecipeShelfTile", () => {
    beforeEach(() => jest.clearAllMocks());

    it("draws the recipe's name", async () => {
        await renderWithProviders(
            <RecipeShelfTile recipe={named("Ethiopia")} {...HANDLERS}/>
        );
        expect(screen.getByText("Ethiopia")).toBeTruthy();
    });

    it("opens the editor on a tap", async () => {
        const onPress = jest.fn();
        const recipe = named("Ethiopia");
        await renderWithProviders(
            <RecipeShelfTile recipe={recipe} {...HANDLERS} onPress={onPress}/>
        );
        await fireEvent.press(screen.getByTestId(`recipe-tile-${recipe.uuid}`));
        expect(onPress).toHaveBeenCalledTimes(1);
    });

    it("opens the actions on a long press", async () => {
        const onLongPress = jest.fn();
        const recipe = named("Ethiopia");
        await renderWithProviders(
            <RecipeShelfTile recipe={recipe} {...HANDLERS} onLongPress={onLongPress}/>
        );
        await fireEvent(screen.getByTestId(`recipe-tile-${recipe.uuid}`), "longPress");
        expect(onLongPress).toHaveBeenCalledTimes(1);
    });

    // A long press is not something a screen reader can perform, so the same
    // acts the sheet offers are carried as accessibility actions. Without them
    // the tile's whole action set would be unreachable to those users.
    it("carries the recipe's actions for a screen reader", async () => {
        const recipe = writable("Ethiopia");
        await renderWithProviders(
            <RecipeShelfTile recipe={recipe} {...HANDLERS}
                             onBrew={jest.fn()} onWrite={jest.fn()}
                             onToggleFavourite={jest.fn()}/>
        );
        const names = (screen.getByTestId(`recipe-tile-${recipe.uuid}`)
            .props.accessibilityActions as {name: string}[]).map((a) => a.name);
        expect(names).toEqual(
            ["brew", "share", "write", "duplicate", "favourite", "delete"]
        );
    });

    // The write action mirrors the sheet's write row: present only on a recipe
    // a card can hold, because an accessibility action has no disabled state and
    // withdrawing it is the only way to say a recipe cannot be written.
    it("withdraws write on a recipe no card can hold", async () => {
        const recipe = named("Ethiopia");
        await renderWithProviders(
            <RecipeShelfTile recipe={recipe} {...HANDLERS} onWrite={jest.fn()}/>
        );
        const names = (screen.getByTestId(`recipe-tile-${recipe.uuid}`)
            .props.accessibilityActions as {name: string}[]).map((a) => a.name);
        expect(names).not.toContain("write");
    });

    it("carries the sheet's brew history row, which no tray mirrors", async () => {
        // The tile's other actions all mirror a verb a list row can be swiped
        // to. The history is only ever reached by the long press, which is a
        // gesture a screen reader cannot make.
        const onHistory = jest.fn();
        const recipe = named("Ethiopia");
        await renderWithProviders(
            <RecipeShelfTile recipe={recipe} {...HANDLERS} onHistory={onHistory}/>
        );
        const tile = screen.getByTestId(`recipe-tile-${recipe.uuid}`);
        expect((tile.props.accessibilityActions as {name: string}[])
            .map((a) => a.name)).toContain("history");

        await fireEvent(tile, "accessibilityAction",
                        {nativeEvent: {actionName: "history"}});
        expect(onHistory).toHaveBeenCalledTimes(1);
    });

    it("routes an accessibility action to its handler", async () => {
        const onDelete = jest.fn();
        const recipe = named("Ethiopia");
        await renderWithProviders(
            <RecipeShelfTile recipe={recipe} {...HANDLERS} onDelete={onDelete}/>
        );
        await fireEvent(screen.getByTestId(`recipe-tile-${recipe.uuid}`),
                        "accessibilityAction", {nativeEvent: {actionName: "delete"}});
        expect(onDelete).toHaveBeenCalledTimes(1);
    });
});

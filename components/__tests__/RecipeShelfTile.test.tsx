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

    it("draws the card's own three figures", async () => {
        // The tile stopped being a name on a colour: a recipe in a shelf room
        // is the same recipe as the one in the list, and a user who moves
        // between the two views should not lose what it is made of.
        await renderWithProviders(
            <RecipeShelfTile recipe={writable("Ethiopia")} {...HANDLERS}/>
        );
        expect(screen.getByTestId("recipe-tile-figures"))
            .toHaveTextContent("15G · 1:15 · 60");
    });

    it("leaves out a figure the recipe has not got", async () => {
        // A sentinel drawn through would say the ratio is 0, which is not a
        // possible value and is indistinguishable from a real reading.
        const bare = named("Ethiopia");
        bare.dosage = 15;
        await renderWithProviders(
            <RecipeShelfTile recipe={bare} {...HANDLERS}/>
        );
        expect(screen.getByTestId("recipe-tile-figures")).toHaveTextContent("15G");
    });

    it("draws nothing at all for a recipe with no figures yet", async () => {
        // Every figure is still a sentinel, and a line reading "0G · 1:0 · 0"
        // would be three lies rather than one.
        const bare = named("Ethiopia");
        bare.dosage = -1;
        bare.grinder = false;
        await renderWithProviders(
            <RecipeShelfTile recipe={bare} {...HANDLERS}/>
        );
        // The grinder being off is still a figure, so it is the one thing left.
        expect(screen.getByTestId("recipe-tile-figures")).toHaveTextContent("OFF");
    });

    it("says the grinder is off rather than printing its last size", async () => {
        const off = writable("Ethiopia");
        off.grinder = false;
        await renderWithProviders(
            <RecipeShelfTile recipe={off} {...HANDLERS}/>
        );
        expect(screen.getByTestId("recipe-tile-figures"))
            .toHaveTextContent("15G · 1:15 · OFF");
    });

    it("leaves grind out for tea", async () => {
        // A tea card always writes the default grind, so the number is the
        // app's rather than the user's.
        const tea = writable("Sencha");
        tea.cupType = CUP_TYPE.TEA;
        await renderWithProviders(
            <RecipeShelfTile recipe={tea} {...HANDLERS}/>
        );
        expect(screen.getByTestId("recipe-tile-figures"))
            .toHaveTextContent("15G · 1:15");
    });

    it("draws how the recipe has gone, when it has gone at all", async () => {
        await renderWithProviders(
            <RecipeShelfTile recipe={writable("Ethiopia")} {...HANDLERS}
                             evidence={{
                                 brews: 6, avgRating: 4.25, lastBrewedAt: 0
                             }}/>
        );
        expect(screen.getByTestId("recipe-tile-evidence")).toHaveTextContent("4.3 · 6");
    });

    it("draws no evidence line for a recipe that has never been brewed", async () => {
        await renderWithProviders(
            <RecipeShelfTile recipe={writable("Ethiopia")} {...HANDLERS}
                             evidence={{brews: 0, avgRating: 0, lastBrewedAt: 0}}/>
        );
        expect(screen.queryByTestId("recipe-tile-evidence")).toBeNull();
    });

    it("speaks the figures in words rather than as the drawn line", async () => {
        // "15G · 1:15 · 60" is a glance's shorthand and reads as noise aloud.
        await renderWithProviders(
            <RecipeShelfTile recipe={writable("Ethiopia")} {...HANDLERS}
                             evidence={{brews: 1, avgRating: 0, lastBrewedAt: 0}}/>
        );
        expect(screen.getByLabelText(
            "Ethiopia, coffee, 15 grams, ratio 1 to 15, grind 60, brewed once"
        )).toBeTruthy();
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

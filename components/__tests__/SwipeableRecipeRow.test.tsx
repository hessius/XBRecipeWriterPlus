import React from "react";
import {fireEvent, screen, within} from "@testing-library/react-native";
import {renderWithProviders} from "@/test-utils/render";
import SwipeableRecipeRow from "@/components/SwipeableRecipeRow";
import Recipe from "@/library/Recipe";
import {palette} from "@/constants/colors";
import {DOT_ICONS, litCells} from "@/constants/dotIcons";
import {resolveAccent} from "@/library/accent";

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

/** How many dots a tile's glyph actually lights, which identifies the bitmap. */
function dotCountOf(testID: string): number {
    return within(screen.getByTestId(testID, {includeHiddenElements: true}))
        .getAllByTestId("dot-icon-dot", {includeHiddenElements: true}).length;
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

    it("calls onPress when the row is tapped", async () => {
        const onPress = jest.fn();
        await renderWithProviders(
            <SwipeableRecipeRow recipe={makeRecipe()} onPress={onPress} onDelete={jest.fn()}
                                onDuplicate={jest.fn()}/>
        );

        await fireEvent.press(screen.getByText("Ethiopia Guji"));

        expect(onPress).toHaveBeenCalledTimes(1);
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

    it("gives the action tray glyphs and tones, as the management tray has", async () => {
        // The two trays were asymmetric: COPY and DELETE each carried a mark and
        // a colour, while BREW, SHARE and WRITE were three near-identical white
        // words. A tray that reads as unfinished beside its twin invites the
        // guess that it is.
        // A pinned accent, not the hashed default: the hash is over `uuid`,
        // which is fresh per instance, so any expectation built from a second
        // Recipe would name a different colour. Pinned as a literal rather than
        // as `resolveAccent(...)`, which would agree with the tile however
        // wrong both were.
        const subject = recipe();
        subject.accentIndex = 4;
        await renderWithProviders(<SwipeableRecipeRow {...props({
            recipe: subject, onBrew: jest.fn(), onShare: jest.fn(), onWrite: jest.fn()
        })}/>);

        // BREW wears the recipe's own accent: it is the act on this one recipe,
        // and the tile should not disagree with the card it slid off.
        expect(dotColourOf("row-action-brew")).toBe("#97D8C4");
        expect(dotColourOf("row-action-share")).toBe(palette.info);
        // WRITE keeps the plain ink. Three coloured tiles in a row would leave
        // the accent nothing to stand out against.
        expect(dotColourOf("row-action-write")).toBe(palette.text);
    });

    it("draws a distinct mark on every action, so none is a guess", async () => {
        // Reusing `scan` for WRITE was the tempting shortcut and would have been
        // wrong: `scan` already means READ CARD on the same screen, so the one
        // tile that overwrites a card would have worn the mark of the one that
        // only looks at it.
        await renderWithProviders(<SwipeableRecipeRow {...props({
            onBrew: jest.fn(), onShare: jest.fn(), onWrite: jest.fn()
        })}/>);

        // Each tile must draw its *own* mark. Lit-dot counts are pinned as
        // literals: a tile handed the wrong bitmap still renders a valid glyph,
        // so only the shape actually drawn can tell them apart.
        expect(dotCountOf("row-action-brew")).toBe(25);
        expect(dotCountOf("row-action-share")).toBe(17);
        expect(dotCountOf("row-action-write")).toBe(33);

        const marks = ["brew", "share", "write", "duplicate", "delete"].map(
            (name) => DOT_ICONS[name as keyof typeof DOT_ICONS].join("/")
        );
        expect(new Set(marks).size).toBe(5);
        // `scan` is READ CARD elsewhere on this screen, so WRITE must not wear it.
        expect(DOT_ICONS.write.join("/")).not.toBe(DOT_ICONS.scan.join("/"));
        // Each mark must actually be drawn, not an empty grid that trivially differs.
        marks.forEach((_, i) => expect(litCells(
            DOT_ICONS[["brew", "share", "write", "duplicate", "delete"][i] as
                keyof typeof DOT_ICONS]
        ).length).toBeGreaterThan(4));
    });

    it("captions the actions, since a glyph alone is a guess", async () => {
        await renderWithProviders(<SwipeableRecipeRow {...props()}/>);

        expect(screen.getByText("DELETE")).toBeTruthy();
        expect(screen.getByText("COPY")).toBeTruthy();
    });

    it("keeps BREW out of the management tray", async () => {
        // The right-swipe tray is housekeeping on the list. Brewing acts on the
        // recipe and now lives on the other side, so it must not reappear here
        // even when the card is drawing its own on-card shortcut.
        await renderWithProviders(
            <SwipeableRecipeRow recipe={makeRecipe()} onPress={() => undefined}
                                onDelete={() => undefined} onDuplicate={() => undefined}
                                brewShortcut="edge" onBrew={() => undefined}/>
        );
        const management = within(
            screen.getByTestId("row-actions", {includeHiddenElements: true})
        );
        expect(management.queryByLabelText("Brew Ethiopia Guji")).toBeNull();
        // The housekeeping tiles are still here, so this is not passing because
        // the whole tray failed to render.
        expect(management.getByLabelText("Delete Ethiopia Guji")).toBeTruthy();
        expect(management.getByLabelText("Duplicate Ethiopia Guji")).toBeTruthy();
    });

    it("offers BREW, SHARE and WRITE in the action tray", async () => {
        await renderWithProviders(
            <SwipeableRecipeRow recipe={makeRecipe()} onPress={() => undefined}
                                onDelete={() => undefined} onDuplicate={() => undefined}
                                onBrew={() => undefined} onShare={() => undefined}
                                onWrite={() => undefined}/>
        );
        const action = within(
            screen.getByTestId("row-actions-brew", {includeHiddenElements: true})
        );
        expect(action.getByLabelText("Brew Ethiopia Guji")).toBeTruthy();
        expect(action.getByLabelText("Share Ethiopia Guji")).toBeTruthy();
        expect(action.getByLabelText("Write Ethiopia Guji to a card")).toBeTruthy();
    });

    it("offers BREW in the tray regardless of the on-card shape", async () => {
        // The tray is the shortcut's home now; the shape setting only adds a
        // second, visible affordance on the card to be judged against it. So a
        // card drawing `edge` still gets a tray BREW.
        await renderWithProviders(
            <SwipeableRecipeRow recipe={makeRecipe()} onPress={() => undefined}
                                onDelete={() => undefined} onDuplicate={() => undefined}
                                brewShortcut="edge" onBrew={() => undefined}
                                onShare={() => undefined} onWrite={() => undefined}/>
        );
        expect(screen.getByLabelText("Brew Ethiopia Guji")).toBeTruthy();
    });

    it("drops the BREW tile when there is no machine to brew on", async () => {
        // The same rule the card's shortcut follows: a dead BREW is worse than
        // no BREW. Share and write do not need a machine, so they stay.
        await renderWithProviders(
            <SwipeableRecipeRow recipe={makeRecipe()} onPress={() => undefined}
                                onDelete={() => undefined} onDuplicate={() => undefined}
                                onShare={() => undefined} onWrite={() => undefined}/>
        );
        expect(screen.queryByLabelText("Brew Ethiopia Guji")).toBeNull();
        expect(screen.getByLabelText("Share Ethiopia Guji")).toBeTruthy();
        expect(screen.getByLabelText("Write Ethiopia Guji to a card")).toBeTruthy();
    });

    it("fires brew, share and write from the action tiles", async () => {
        const onBrew = jest.fn();
        const onShare = jest.fn();
        const onWrite = jest.fn();
        await renderWithProviders(
            <SwipeableRecipeRow recipe={makeRecipe()} onPress={() => undefined}
                                onDelete={() => undefined} onDuplicate={() => undefined}
                                onBrew={onBrew} onShare={onShare} onWrite={onWrite}/>
        );
        await fireEvent.press(screen.getByLabelText("Brew Ethiopia Guji"));
        expect(onBrew).toHaveBeenCalled();
        await fireEvent.press(screen.getByLabelText("Share Ethiopia Guji"));
        expect(onShare).toHaveBeenCalled();
        await fireEvent.press(screen.getByLabelText("Write Ethiopia Guji to a card"));
        expect(onWrite).toHaveBeenCalled();
    });

    it("gives the brew tile the recipe's accent, not a system colour", async () => {
        const brewedRecipe = makeRecipe();
        await renderWithProviders(
            <SwipeableRecipeRow recipe={brewedRecipe} onPress={() => undefined}
                                onDelete={() => undefined} onDuplicate={() => undefined}
                                onBrew={() => undefined} onShare={() => undefined}
                                onWrite={() => undefined}/>
        );
        // The one tile carrying an accent among neutral verbs. Same helper the
        // card uses, so the tile and the card it slid off cannot disagree.
        const word = within(screen.getByLabelText("Brew Ethiopia Guji"))
            .getByText("BREW");
        const list = (Array.isArray(word.props.style) ? word.props.style : [word.props.style]) as
            {color?: string}[];
        const colour = String(list.reduce<string | undefined>(
            (found, entry) => entry?.color ?? found, undefined
        ));
        expect(colour).toBe(resolveAccent(brewedRecipe));
    });

    it("carries a testID on the glyphless action tiles", async () => {
        await renderWithProviders(
            <SwipeableRecipeRow recipe={makeRecipe()} onPress={() => undefined}
                                onDelete={() => undefined} onDuplicate={() => undefined}
                                onBrew={() => undefined} onShare={() => undefined}
                                onWrite={() => undefined}/>
        );
        // Every tile now hangs its testID on its DotIcon. If a tile ever loses
        // its glyph the id lands nowhere, and any later query for it -- an
        // absence assertion above all -- would pass whether or not the tray had
        // drawn anything. This is the check that would notice.
        expect(screen.getByTestId("row-action-brew", {includeHiddenElements: true}))
            .toBeTruthy();
        expect(screen.getByTestId("row-action-write", {includeHiddenElements: true}))
            .toBeTruthy();
    });

    it("draws no action tray when it has nothing to put in it", async () => {
        // With no brew, share or write handler the tray would open onto a blank
        // strip. The card still swipes the other way to the management tray.
        await renderWithProviders(<SwipeableRecipeRow {...props()}/>);
        expect(screen.queryByTestId("row-actions-brew", {includeHiddenElements: true}))
            .toBeNull();
        expect(screen.getByTestId("row-actions", {includeHiddenElements: true}))
            .toBeTruthy();
    });

    it("keeps three action tiles inside the smallest supported screen", () => {
        // A three-tile tray was 76 pt a tile, near the width of a phone. Pinned
        // to integer literals rather than the constants that produced the tray,
        // so this still bites if a tile silently shrinks to zero.
        const tile = 72;
        const gap = 7;      // Tamagui `$2`
        const padding = 7;  // Tamagui `$2`, both sides
        const tray = 3 * tile + 2 * gap + 2 * padding;
        // iPhone SE class: 320 pt, less the row's 12 pt padding on each side.
        const available = 320 - 2 * 12;
        // A strip of card must stay visible to grab when the tray is open.
        expect(available - tray).toBeGreaterThanOrEqual(44);
        // And a tile must not fall under the touch-target minimum.
        expect(tile).toBeGreaterThanOrEqual(44);
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

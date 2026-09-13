import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import RecipeOverflowSheet, {OVERFLOW_HEIGHT} from "@/components/RecipeOverflowSheet";
import {HELP_HEIGHT} from "@/components/HelpSheet";
import {palette} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
    router: {push: (...args: unknown[]) => mockPush(...args)}
}));

const ACTIONS = {
    showHints:         false,
    onShowHintsChange: jest.fn(),
    onShare:           jest.fn(),
    onDuplicate:       jest.fn(),
    onRefreshName:     jest.fn(),
    onRevert:          jest.fn(),
    onDelete:          jest.fn(),
    onOpenChange:      jest.fn()
};

describe("RecipeOverflowSheet", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockPush.mockReset();
    });

    it("is sized to the handful of rows it holds", async () => {
        // Nothing in here scrolls -- one switch and four rows -- so it has no
        // use for the room the help sheet needs, and standing as tall as one
        // left most of it empty.
        expect(OVERFLOW_HEIGHT).toBeLessThan(HELP_HEIGHT);
    });

    it("offers the five recipe operations that are not write or save", async () => {
        await renderWithProviders(
            <RecipeOverflowSheet open canRefreshName {...ACTIONS}/>
        );

        expect(screen.getByLabelText("Share")).toBeTruthy();
        expect(screen.getByLabelText("Duplicate")).toBeTruthy();
        expect(screen.getByLabelText("Refresh name from xBloom")).toBeTruthy();
        expect(screen.getByLabelText("Revert")).toBeTruthy();
        expect(screen.getByLabelText("Delete")).toBeTruthy();

        // Help is not one of them. The caret holds things done *to* the recipe;
        // help is reading matter, and sits in the hero's chrome row instead.
        expect(screen.queryByLabelText("Help")).toBeNull();
    });

    it("calls onShare and closes the sheet", async () => {
        const onShare = jest.fn();
        const onOpenChange = jest.fn();
        await renderWithProviders(
            <RecipeOverflowSheet open canRefreshName {...ACTIONS}
                                 onShare={onShare} onOpenChange={onOpenChange}/>
        );
        await fireEvent.press(screen.getByLabelText("Share"));
        expect(onShare).toHaveBeenCalledTimes(1);
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("draws the share row as a normal action, not a destructive one", async () => {
        // Delete is the only red row. Sharing creates something permanent in a
        // shared account, which is worth a moment's thought, but it is not a
        // destruction and must not borrow the warning that means one.
        await renderWithProviders(<RecipeOverflowSheet open canRefreshName {...ACTIONS}/>);
        expect(screen.getByTestId("overflow-share-label").props.style)
            .toEqual(expect.arrayContaining([
                expect.objectContaining({color: palette.text})
            ]));
    });

    it("toggles the deck's hints without dismissing itself", async () => {
        // Unlike every other row here, this one has a state to show. Closing on
        // the tap -- which is what `pick` does for the actions -- would take the
        // answer off the screen at the moment it changed.
        await renderWithProviders(
            <RecipeOverflowSheet open canRefreshName {...ACTIONS} showHints={false}/>
        );

        await fireEvent.press(screen.getByLabelText("Show hints"));

        expect(ACTIONS.onShowHintsChange).toHaveBeenCalledWith(true);
        expect(ACTIONS.onOpenChange).not.toHaveBeenCalled();
    });

    it("shows which way the hints switch is set", async () => {
        await renderWithProviders(
            <RecipeOverflowSheet open canRefreshName {...ACTIONS} showHints/>
        );

        expect(screen.getByTestId("show-hints-state").props.children).toBe("ON");
        expect(screen.getByLabelText("Show hints").props.accessibilityState)
            .toEqual(expect.objectContaining({checked: true}));
    });

    it("turns the hints back off", async () => {
        await renderWithProviders(
            <RecipeOverflowSheet open canRefreshName {...ACTIONS} showHints/>
        );

        await fireEvent.press(screen.getByLabelText("Show hints"));

        expect(ACTIONS.onShowHintsChange).toHaveBeenCalledWith(false);
    });

    it("leaves the name refresh out when there is nothing to refresh from", async () => {
        await renderWithProviders(
            <RecipeOverflowSheet open canRefreshName={false} {...ACTIONS}/>
        );

        expect(screen.queryByLabelText("Refresh name from xBloom")).toBeNull();
    });

    it("closes itself before handing over", async () => {
        await renderWithProviders(
            <RecipeOverflowSheet open canRefreshName {...ACTIONS}/>
        );

        await fireEvent.press(screen.getByLabelText("Revert"));

        expect(ACTIONS.onOpenChange).toHaveBeenCalledWith(false);
        expect(ACTIONS.onRevert).toHaveBeenCalled();
    });

    it("marks delete as the dangerous one", async () => {
        await renderWithProviders(
            <RecipeOverflowSheet open canRefreshName {...ACTIONS}/>
        );

        // Tamagui and DotMatrixText both compile a colour into `style`; there
        // is no `color` prop on the host node to read.
        expect(screen.getByTestId("overflow-delete-label").props.style)
            .toEqual(expect.arrayContaining([
                expect.objectContaining({color: palette.danger})
            ]));
    });

    it("speaks the name refresh in full but captions it short", async () => {
        // The other four captions are one word. A sentence set in uppercase
        // Doto beside them reads as a different kind of thing.
        await renderWithProviders(
            <RecipeOverflowSheet open canRefreshName {...ACTIONS}/>
        );

        expect(screen.getByText("REFRESH NAME")).toBeTruthy();
        expect(screen.queryByText("REFRESH NAME FROM XBLOOM")).toBeNull();
    });

    it("says out loud that delete cannot be undone", async () => {
        // It is the only row here with no second question after it.
        await renderWithProviders(
            <RecipeOverflowSheet open canRefreshName {...ACTIONS}/>
        );

        expect(screen.getByLabelText("Delete").props.accessibilityHint)
            .toMatch(/cannot be undone/);
    });

    it("offers a Brew history row", async () => {
        await renderWithProviders(
            <RecipeOverflowSheet open canRefreshName {...ACTIONS}/>
        );
        expect(screen.getByLabelText("Brew history")).toBeTruthy();
    });

    it("navigates to the full history list when no recipe is specified", async () => {
        await renderWithProviders(
            <RecipeOverflowSheet open canRefreshName {...ACTIONS}/>
        );
        await fireEvent.press(screen.getByLabelText("Brew history"));
        expect(mockPush).toHaveBeenCalledWith("/brewHistory");
    });

    it("navigates to the recipe-filtered history when a recipeUuid is given", async () => {
        await renderWithProviders(
            <RecipeOverflowSheet open canRefreshName recipeUuid="uuid-99" {...ACTIONS}/>
        );
        await fireEvent.press(screen.getByLabelText("Brew history"));
        expect(mockPush).toHaveBeenCalledWith("/brewHistory?recipeUuid=uuid-99");
    });
});

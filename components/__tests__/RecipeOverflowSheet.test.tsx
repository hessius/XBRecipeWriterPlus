import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import RecipeOverflowSheet from "@/components/RecipeOverflowSheet";
import {palette} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";

const ACTIONS = {
    onDuplicate: jest.fn(),
    onRefreshName: jest.fn(),
    onRevert: jest.fn(),
    onHelp: jest.fn(),
    onDelete: jest.fn(),
    onOpenChange: jest.fn()
};

describe("RecipeOverflowSheet", () => {
    beforeEach(() => jest.clearAllMocks());

    it("offers the four recipe operations that are not write or save", async () => {
        await renderWithProviders(
            <RecipeOverflowSheet open canRefreshName {...ACTIONS}/>
        );

        expect(screen.getByLabelText("Duplicate")).toBeTruthy();
        expect(screen.getByLabelText("Refresh name from xBloom")).toBeTruthy();
        expect(screen.getByLabelText("Revert")).toBeTruthy();
        expect(screen.getByLabelText("Delete")).toBeTruthy();

        // Help is not one of them. The caret holds things done *to* the recipe;
        // help is reading matter, and sits in the hero's chrome row instead.
        expect(screen.queryByLabelText("Help")).toBeNull();
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
});

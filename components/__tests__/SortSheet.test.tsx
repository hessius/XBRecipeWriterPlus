import React from "react";
import {fireEvent, screen, within} from "@testing-library/react-native";

import SortSheet from "@/components/SortSheet";
import {renderWithProviders} from "@/test-utils/render";

const NOOP = {
    onOpenChange:            jest.fn(),
    onSortChange:            jest.fn(),
    onFavouritesFirstChange: jest.fn()
};

describe("SortSheet", () => {
    beforeEach(() => jest.clearAllMocks());

    it("words the direction pair by the chosen axis", async () => {
        // The words belong to the axis: date added reads NEWEST/OLDEST, and the
        // same control under last brewed reads RECENT/LONGEST AGO. This is the
        // whole reason the design refuses arrows.
        const {rerender} = await renderWithProviders(
            <SortSheet open sort="added" direction="desc" favouritesFirst={false}
                       {...NOOP}/>
        );

        const added = within(screen.getByLabelText("Sort direction"));
        expect(added.getByText("NEWEST")).toBeTruthy();
        expect(added.getByText("OLDEST")).toBeTruthy();
        expect(added.queryByText("RECENT")).toBeNull();

        await rerender(
            <SortSheet open sort="lastBrewed" direction="desc" favouritesFirst={false}
                       {...NOOP}/>
        );

        const brewed = within(screen.getByLabelText("Sort direction"));
        expect(brewed.getByText("RECENT")).toBeTruthy();
        expect(brewed.getByText("LONGEST AGO")).toBeTruthy();
        expect(brewed.queryByText("NEWEST")).toBeNull();
    });

    it("applies the axis's default direction when an axis is chosen", async () => {
        // One tap, not two: choosing an axis carries its sensible default
        // direction. Date added defaults to NEWEST (desc), so the whole sort is
        // written at once.
        await renderWithProviders(
            <SortSheet open sort="name" direction="asc" favouritesFirst={false}
                       {...NOOP}/>
        );

        await fireEvent.press(within(screen.getByLabelText("Sort by")).getByLabelText("ADDED"));

        expect(NOOP.onSortChange).toHaveBeenCalledTimes(1);
        expect(NOOP.onSortChange).toHaveBeenCalledWith("added", "desc");
    });

    it("reverses within the chosen axis without changing it", async () => {
        await renderWithProviders(
            <SortSheet open sort="added" direction="desc" favouritesFirst={false}
                       {...NOOP}/>
        );

        await fireEvent.press(within(screen.getByLabelText("Sort direction")).getByText("OLDEST"));

        expect(NOOP.onSortChange).toHaveBeenCalledWith("added", "asc");
    });

    it("marks the selected axis and only that one", async () => {
        await renderWithProviders(
            <SortSheet open sort="ratio" direction="asc" favouritesFirst={false}
                       {...NOOP}/>
        );

        const list = within(screen.getByLabelText("Sort by"));
        expect(list.getByLabelText("RATIO").props.accessibilityState)
            .toEqual(expect.objectContaining({checked: true}));
        expect(list.getByLabelText("NAME").props.accessibilityState)
            .toEqual(expect.objectContaining({checked: false}));
    });

    it("toggles favourites first without touching the sort", async () => {
        // A modifier, not an axis: flipping it composes with the order and must
        // not rewrite the axis or direction.
        await renderWithProviders(
            <SortSheet open sort="name" direction="asc" favouritesFirst={false}
                       {...NOOP}/>
        );

        await fireEvent.press(screen.getByLabelText("Favourites first"));

        expect(NOOP.onFavouritesFirstChange).toHaveBeenCalledWith(true);
        expect(NOOP.onSortChange).not.toHaveBeenCalled();
    });

    it("shows the switch state to assistive tech", async () => {
        await renderWithProviders(
            <SortSheet open sort="name" direction="asc" favouritesFirst
                       {...NOOP}/>
        );

        expect(screen.getByLabelText("Favourites first").props.accessibilityState)
            .toEqual(expect.objectContaining({checked: true}));
    });
});

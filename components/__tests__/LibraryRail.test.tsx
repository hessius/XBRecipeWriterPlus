import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import LibraryRail, {type RailFilter} from "@/components/LibraryRail";
import {CHIP_HEIGHT} from "@/components/RailChip";
import {palette} from "@/constants/colors";
import {chipLabel} from "@/library/librarySort";
import {renderWithProviders} from "@/test-utils/render";

const TOUCH = {
    nativeEvent: {
        touches:        [],
        changedTouches: [],
        locationX:      1,
        locationY:      1,
        pageX:          1,
        pageY:          1,
        timestamp:      0
    }
};

async function press(element: Parameters<typeof fireEvent>[0]) {
    await fireEvent(element, "responderGrant", TOUCH);
    await fireEvent(element, "responderRelease", TOUCH);
}

const FILTERS: RailFilter[] = [
    {id: "tea", label: "TEA", active: false},
    {id: "singlePour", label: "SINGLE POUR", active: true}
];

function railProps(overrides: Partial<React.ComponentProps<typeof LibraryRail>> = {}) {
    return {
        collapsed:     false,
        onSearchPress: jest.fn(),
        sort:          "name" as const,
        direction:     "asc" as const,
        onSortPress:   jest.fn(),
        filters:       FILTERS,
        onFilterPress: jest.fn(),
        ...overrides
    };
}

describe("LibraryRail", () => {
    it("draws the divider that tells a user part of the row scrolls", async () => {
        await renderWithProviders(<LibraryRail {...railProps()}/>);
        const divider = screen.getByTestId("rail-divider");
        const style = divider.props.style as Record<string, unknown>;
        expect(style.backgroundColor).toBe(palette.line);
        expect(style.width).toBe(1);
    });

    it("keeps its chips at 44 while expanded", async () => {
        await renderWithProviders(<LibraryRail {...railProps({collapsed: false})}/>);
        const style = screen.getByTestId("rail-search").props.style as Record<string, unknown>;
        expect(style.height).toBe(CHIP_HEIGHT);
    });

    it("keeps its chips at 44 once the rail has shrunk", async () => {
        // A forward guard, not a proof: chip height does not read `collapsed`
        // today, so this asserts nothing the expanded case does not. It is here
        // so that the day someone ties chip size to the shrink, a test says no.
        await renderWithProviders(<LibraryRail {...railProps({collapsed: true})}/>);
        const style = screen.getByTestId("rail-search").props.style as Record<string, unknown>;
        expect(style.height).toBe(CHIP_HEIGHT);
    });

    it("draws a chip for each filter it was handed", async () => {
        await renderWithProviders(<LibraryRail {...railProps()}/>);
        expect(screen.getByText("TEA")).toBeTruthy();
        expect(screen.getByText("SINGLE POUR")).toBeTruthy();
    });

    it("fills the active filter chip and leaves the inactive one an outline", async () => {
        await renderWithProviders(<LibraryRail {...railProps()}/>);
        const active = screen.getByTestId("rail-filter-singlePour").props.style as Record<string, unknown>;
        const inactive = screen.getByTestId("rail-filter-tea").props.style as Record<string, unknown>;
        expect(active.backgroundColor).toBe(palette.text);
        expect(inactive.backgroundColor).toBe("transparent");
    });

    it("names its axis on the sort chip once the sort leaves the default", async () => {
        await renderWithProviders(
            <LibraryRail {...railProps({sort: "added", direction: "desc"})}/>
        );
        expect(screen.getByText(chipLabel("added"))).toBeTruthy();
        const style = screen.getByTestId("rail-sort").props.style as Record<string, unknown>;
        expect(style.backgroundColor).toBe(palette.text);
    });

    it("keeps the sort chip a bare glyph at the default sort", async () => {
        await renderWithProviders(
            <LibraryRail {...railProps({sort: "name", direction: "asc"})}/>
        );
        expect(screen.queryByText(chipLabel("name"))).toBeNull();
        const style = screen.getByTestId("rail-sort").props.style as Record<string, unknown>;
        expect(style.backgroundColor).toBe("transparent");
    });

    it("reports a search tap", async () => {
        const onSearchPress = jest.fn();
        await renderWithProviders(<LibraryRail {...railProps({onSearchPress})}/>);
        await press(screen.getByTestId("rail-search"));
        expect(onSearchPress).toHaveBeenCalledTimes(1);
    });

    it("reports a sort tap", async () => {
        const onSortPress = jest.fn();
        await renderWithProviders(<LibraryRail {...railProps({onSortPress})}/>);
        await press(screen.getByTestId("rail-sort"));
        expect(onSortPress).toHaveBeenCalledTimes(1);
    });

    it("reports which filter was tapped", async () => {
        const onFilterPress = jest.fn();
        await renderWithProviders(<LibraryRail {...railProps({onFilterPress})}/>);
        await press(screen.getByTestId("rail-filter-tea"));
        expect(onFilterPress).toHaveBeenCalledWith("tea");
    });
});

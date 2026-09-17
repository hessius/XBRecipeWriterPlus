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
        collapsed:         false,
        onSearchChange:    jest.fn(),
        sort:              "name" as const,
        direction:         "asc" as const,
        onSortPress:       jest.fn(),
        filters:           FILTERS,
        onFilterPress:     jest.fn(),
        activeFilterCount: 1,
        filtersOpen:       true,
        onFilterToggle:    jest.fn(),
        ...overrides
    };
}

describe("LibraryRail", () => {
    it("announces the filter chips as selected through state, not duplicated in the label", async () => {
        await renderWithProviders(
            <LibraryRail {...railProps({sort: "added", direction: "desc"})}/>
        );

        expect(screen.getByRole("button", {name: "Tea filter"}).props.accessibilityState)
            .toEqual({selected: false});
        expect(screen.getByRole("button", {name: "Single pour filter"}).props.accessibilityState)
            .toEqual({selected: true});
    });

    it("keeps the brand lowercase when its label opens the sentence", async () => {
        // "XBLOOM PODS" is the one label whose first word must not be
        // capitalised. Fixing the brand before building the sentence gets it
        // capitalised right back, and a reader announces "XBloom".
        await renderWithProviders(
            <LibraryRail {...railProps({
                filters: [{id: "pods", label: "XBLOOM PODS", active: false}]
            })}/>
        );

        expect(screen.getByRole("button", {name: "xBloom pods filter"})).toBeTruthy();
    });

    it("keeps the filter row visible to screen readers as one reachable group", async () => {
        await renderWithProviders(<LibraryRail {...railProps()}/>);

        const row = screen.getByTestId("rail-filter-row");
        expect(row.props.accessibilityLabel).toBe("Recipe filters");
        expect(row.props.accessibilityRole).toBe("list");
        expect(row.props.accessibilityElementsHidden).not.toBe(true);
        expect(row.props.importantForAccessibility).not.toBe("no-hide-descendants");
    });

    it("describes shared-by filters as recipes that arrived from someone", async () => {
        await renderWithProviders(
            <LibraryRail {...railProps({
                filters: [{id: "sharedBy:Guji Roasters", label: "GUJI ROASTERS", active: false}]
            })}/>
        );

        expect(screen.getByRole("button", {
            name: "Recipes that arrived from Guji Roasters"
        })).toBeTruthy();
    });

    it("uses natural state words for every sort direction", async () => {
        const {rerender} = await renderWithProviders(
            <LibraryRail {...railProps({sort: "ratio", direction: "asc"})}/>
        );

        expect(screen.getByRole("button", {name: "Sort by ratio, low to high"})).toBeTruthy();

        await rerender(
            <LibraryRail {...railProps({sort: "timesBrewed", direction: "desc"})}/>
        );

        expect(screen.getByRole("button", {name: "Sort by times brewed, most brewed first"}))
            .toBeTruthy();
    });

    it("no longer draws the divider that once split the row", async () => {
        // The divider marked where the pinned cluster stopped and the scrolling
        // filters began. The filters moved to a second rail, so the top rail is
        // pinned end to end and the line would be ornament.
        await renderWithProviders(<LibraryRail {...railProps()}/>);
        expect(screen.queryByTestId("rail-divider")).toBeNull();
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

    it("expands the search chip into a field when tapped", async () => {
        await renderWithProviders(<LibraryRail {...railProps()}/>);
        expect(screen.queryByTestId("rail-search-field")).toBeNull();
        await press(screen.getByTestId("rail-search"));
        expect(screen.getByTestId("rail-search-field")).toBeTruthy();
    });

    it("drops the sort chip's word while a term is held, keeping its label", async () => {
        // Work item 3: the field flexes into whatever the pinned controls leave,
        // and the sort chip gives up its visible word to make that room. The
        // spoken label is unchanged -- only the word on screen goes.
        await renderWithProviders(
            <LibraryRail {...railProps({sort: "added", direction: "desc"})}/>
        );
        expect(screen.getByText(chipLabel("added"))).toBeTruthy();

        await press(screen.getByTestId("rail-search"));
        await fireEvent.changeText(screen.getByTestId("rail-search-input"), "eth");

        expect(screen.queryByText(chipLabel("added"))).toBeNull();
        expect(screen.getByTestId("rail-sort").props.accessibilityLabel)
            .toBe("Sort by date added, newest first");
    });

    it("keeps the sort word when search is merely open with nothing typed", async () => {
        // Opening the field takes no width from anything: search is flexed idle
        // and live alike, so a tap that changes nothing about the library must
        // not move the rail. It also kept the word away until the field was
        // cleared, which read as clearing the search having rearranged the sort.
        await renderWithProviders(
            <LibraryRail {...railProps({sort: "added", direction: "desc"})}/>
        );

        await press(screen.getByTestId("rail-search"));

        expect(screen.getByTestId("rail-search-field")).toBeTruthy();
        expect(screen.getByText(chipLabel("added"))).toBeTruthy();
    });

    it("gives the sort word back when the term is cleared outright", async () => {
        // Clearing does not go through the text handler, so it is the one path
        // that must report for itself. Left unreported, the word stays gone
        // after the field has collapsed and the library has gone unfiltered:
        // the exact symptom keying this to the term was meant to end.
        await renderWithProviders(
            <LibraryRail {...railProps({sort: "added", direction: "desc"})}/>
        );
        await press(screen.getByTestId("rail-search"));
        await fireEvent.changeText(screen.getByTestId("rail-search-input"), "eth");
        expect(screen.queryByText(chipLabel("added"))).toBeNull();

        await fireEvent.press(screen.getByTestId("rail-search-clear"));

        expect(screen.getByText(chipLabel("added"))).toBeTruthy();
    });

    it("gives the sort word back when the term is typed away", async () => {
        await renderWithProviders(
            <LibraryRail {...railProps({sort: "added", direction: "desc"})}/>
        );
        await press(screen.getByTestId("rail-search"));
        await fireEvent.changeText(screen.getByTestId("rail-search-input"), "eth");
        expect(screen.queryByText(chipLabel("added"))).toBeNull();

        await fireEvent.changeText(screen.getByTestId("rail-search-input"), "");

        expect(screen.getByText(chipLabel("added"))).toBeTruthy();
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

    describe("filter button", () => {
        it("shows the applied count as its label and fills when a filter is on", async () => {
            await renderWithProviders(
                <LibraryRail {...railProps({activeFilterCount: 2})}/>
            );
            const toggle = screen.getByTestId("rail-filter-toggle");
            expect(screen.getByText("2")).toBeTruthy();
            expect((toggle.props.style as Record<string, unknown>).backgroundColor)
                .toBe(palette.text);
        });

        it("shows a zero count and no fill when nothing is applied", async () => {
            // The count is always drawn, "0" included: a hidden filter is worse
            // than a visible one, so the button never falls back to a bare glyph.
            // The fill still means something is filtered, so at zero it is off.
            await renderWithProviders(
                <LibraryRail {...railProps({activeFilterCount: 0, filtersOpen: false})}/>
            );
            const toggle = screen.getByTestId("rail-filter-toggle");
            expect(screen.getByText("0")).toBeTruthy();
            expect((toggle.props.style as Record<string, unknown>).backgroundColor)
                .toBe("transparent");
        });

        it("names one applied filter in the singular", async () => {
            await renderWithProviders(
                <LibraryRail {...railProps({activeFilterCount: 1, filtersOpen: false})}/>
            );
            expect(screen.getByTestId("rail-filter-toggle").props.accessibilityLabel)
                .toBe("1 filter applied. Tap to show the filter row.");
        });

        it("names several applied filters in the plural", async () => {
            await renderWithProviders(
                <LibraryRail {...railProps({activeFilterCount: 3})}/>
            );
            expect(screen.getByTestId("rail-filter-toggle").props.accessibilityLabel)
                .toBe("3 filters applied. Tap to hide the filter row.");
        });

        it("offers to open the row when it is closed and empty", async () => {
            await renderWithProviders(
                <LibraryRail {...railProps({activeFilterCount: 0, filtersOpen: false})}/>
            );
            expect(screen.getByTestId("rail-filter-toggle").props.accessibilityLabel)
                .toBe("No filters applied. Tap to show the filter row.");
        });

        it("announces its expanded state instead of a selected one", async () => {
            const {rerender} = await renderWithProviders(
                <LibraryRail {...railProps({activeFilterCount: 0, filtersOpen: false})}/>
            );
            expect(screen.getByTestId("rail-filter-toggle").props.accessibilityState)
                .toEqual({expanded: false});

            await rerender(<LibraryRail {...railProps({activeFilterCount: 0, filtersOpen: true})}/>);
            expect(screen.getByTestId("rail-filter-toggle").props.accessibilityState)
                .toEqual({expanded: true});
        });

        it("reports a tap so the owner can reveal the rail", async () => {
            const onFilterToggle = jest.fn();
            await renderWithProviders(
                <LibraryRail {...railProps({filtersOpen: false, onFilterToggle})}/>
            );
            await press(screen.getByTestId("rail-filter-toggle"));
            expect(onFilterToggle).toHaveBeenCalledTimes(1);
        });

        it("is absent when there are no filters to show", async () => {
            await renderWithProviders(
                <LibraryRail {...railProps({filters: [], activeFilterCount: 0, filtersOpen: false})}/>
            );
            expect(screen.queryByTestId("rail-filter-toggle")).toBeNull();
        });
    });

    describe("the filter rail", () => {
        it("is drawn only when open", async () => {
            const {rerender} = await renderWithProviders(
                <LibraryRail {...railProps({filtersOpen: false, activeFilterCount: 0})}/>
            );
            expect(screen.queryByTestId("rail-filter-row")).toBeNull();

            await rerender(<LibraryRail {...railProps({filtersOpen: true, activeFilterCount: 0})}/>);
            expect(screen.getByTestId("rail-filter-row")).toBeTruthy();
        });

        it("stays absent when open but there are no filters at all", async () => {
            await renderWithProviders(
                <LibraryRail {...railProps({filters: [], filtersOpen: true, activeFilterCount: 0})}/>
            );
            expect(screen.queryByTestId("rail-filter-row")).toBeNull();
        });
    });
});

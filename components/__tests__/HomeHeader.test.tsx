import React from "react";
import {screen, fireEvent} from "@testing-library/react-native";

import HomeHeader from "@/components/HomeHeader";
import {renderWithProviders} from "@/test-utils/render";

function props(overrides = {}) {
    return {
        count:        7,
        collapsed:    false,
        editing:      false,
        showEdit:     true,
        onToggleEdit: jest.fn(),
        onScan:       jest.fn(),
        onImport:     jest.fn(),
        onSettings:   jest.fn(),
        ...overrides
    };
}

describe("HomeHeader", () => {
    it("shows the title and the recipe count", async () => {
        await renderWithProviders(<HomeHeader {...props()}/>);
        expect(screen.getByText("Recipes")).toBeTruthy();
        expect(screen.getByText("7")).toBeTruthy();
    });

    it("leaves scan and import to the tiles while expanded", async () => {
        // Expanded, the two primary actions are the CTA tiles below. Repeating
        // them in the header would be two affordances for one job.
        await renderWithProviders(<HomeHeader {...props({collapsed: false})}/>);
        expect(screen.queryByLabelText("Read a card")).toBeNull();
        expect(screen.queryByLabelText("Import a recipe")).toBeNull();
    });

    it("takes scan and import in once the tiles are gone", async () => {
        await renderWithProviders(<HomeHeader {...props({collapsed: true})}/>);
        expect(screen.getByLabelText("Read a card")).toBeTruthy();
        expect(screen.getByLabelText("Import a recipe")).toBeTruthy();
    });

    it("keeps the glyphs mounted while expanded so they can travel", async () => {
        // A fade alone gave the width away instantly: the glyphs appeared in a
        // slot that had been zero wide the frame before, so they popped while
        // the title eased. They stay mounted and are animated to width instead.
        await renderWithProviders(<HomeHeader {...props({collapsed: false})}/>);
        expect(screen.getByLabelText("Read a card", {includeHiddenElements: true}))
            .toBeTruthy();
    });

    it("gives the parked glyphs no width and the arrived ones their full width", async () => {
        const expanded = await renderWithProviders(<HomeHeader {...props({collapsed: false})}/>);
        const parked = expanded.getByTestId("home-header-slide", {includeHiddenElements: true});
        expect(parked.props.jestAnimatedStyle.value.width).toBe(0);

        const collapsed = await renderWithProviders(<HomeHeader {...props({collapsed: true})}/>);
        const arrived = collapsed.getByTestId("home-header-slide");
        expect(arrived.props.jestAnimatedStyle.value.width).toBeGreaterThan(0);
    });

    it("keeps the parked glyphs out of reach", async () => {
        // Zero width is a visual fact. Without these they would still be
        // focusable by a screen reader and still take a tap at the group's edge.
        await renderWithProviders(<HomeHeader {...props({collapsed: false})}/>);
        const parked = screen.getByTestId("home-header-slide", {includeHiddenElements: true});
        expect(parked.props.accessibilityElementsHidden).toBe(true);
        expect(parked.props.pointerEvents).toBe("none");
    });

    it("keeps settings reachable in both states", async () => {
        const expanded = await renderWithProviders(<HomeHeader {...props({collapsed: false})}/>);
        expect(expanded.getByLabelText("Settings")).toBeTruthy();

        const collapsed = await renderWithProviders(<HomeHeader {...props({collapsed: true})}/>);
        expect(collapsed.getByLabelText("Settings")).toBeTruthy();
    });

    it("shrinks the title when collapsed", async () => {
        // Each render is queried through its own utilities rather than the
        // shared `screen` binding. `screen` tracks only the most recently
        // rendered tree, so re-querying it after a second render finds one tree,
        // not two.
        const expanded = await renderWithProviders(<HomeHeader {...props({collapsed: false})}/>);
        const big = expanded.getByText("Recipes").props.jestAnimatedStyle.value.fontSize;

        const collapsed = await renderWithProviders(<HomeHeader {...props({collapsed: true})}/>);
        const small = collapsed.getByText("Recipes").props.jestAnimatedStyle.value.fontSize;

        expect(small).toBeLessThan(big);
    });

    it("puts the arriving glyphs left of the ones already there", async () => {
        // Edit and settings are present in both states. The action group is
        // right-aligned, so inserting the new glyphs at its left edge grows it
        // leftwards and leaves those two exactly where they were; inserting in
        // the middle would slide them sideways on every collapse.
        await renderWithProviders(<HomeHeader {...props({collapsed: true})}/>);
        const order = screen.getAllByTestId("home-header-action")
            .map((node) => node.props.accessibilityLabel);

        expect(order).toEqual([
            "Read a card", "Import a recipe", "Edit recipes", "Settings"
        ]);
    });

    it("leaves the settled glyphs in the same order when expanded", async () => {
        await renderWithProviders(<HomeHeader {...props({collapsed: false})}/>);
        const order = screen.getAllByTestId("home-header-action")
            .map((node) => node.props.accessibilityLabel);

        expect(order).toEqual(["Edit recipes", "Settings"]);
    });

    it("hides the edit toggle when there is nothing to edit", async () => {
        await renderWithProviders(<HomeHeader {...props({showEdit: false, count: 0})}/>);
        expect(screen.queryByLabelText("Edit recipes")).toBeNull();
    });

    it("says which way the edit toggle will go", async () => {
        await renderWithProviders(<HomeHeader {...props({editing: true})}/>);
        expect(screen.getByLabelText("Done editing")).toBeTruthy();
    });

    it("reports each action", async () => {
        const handlers = props({collapsed: true});
        await renderWithProviders(<HomeHeader {...handlers}/>);

        await fireEvent.press(screen.getByLabelText("Read a card"));
        await fireEvent.press(screen.getByLabelText("Import a recipe"));
        await fireEvent.press(screen.getByLabelText("Settings"));
        await fireEvent.press(screen.getByLabelText("Edit recipes"));

        expect(handlers.onScan).toHaveBeenCalledTimes(1);
        expect(handlers.onImport).toHaveBeenCalledTimes(1);
        expect(handlers.onSettings).toHaveBeenCalledTimes(1);
        expect(handlers.onToggleEdit).toHaveBeenCalledTimes(1);
    });
});

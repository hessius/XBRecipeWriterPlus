import React from "react";
import {View} from "react-native";
import {screen, fireEvent} from "@testing-library/react-native";

import HomeHeader from "@/components/HomeHeader";
import {renderWithProviders, TEST_INSETS} from "@/test-utils/render";

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

function tintOpacity(): number {
    return screen.getByTestId("machine-dot-tint").props.jestAnimatedStyle.value.opacity;
}

describe("HomeHeader", () => {
    it("shows the title and the recipe count", async () => {
        await renderWithProviders(<HomeHeader {...props()}/>);
        expect(screen.getByLabelText("XBRW++")).toBeTruthy();
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
        const big = expanded.getByText("XBRW").props.jestAnimatedStyle.value.fontSize;

        const collapsed = await renderWithProviders(<HomeHeader {...props({collapsed: true})}/>);
        const small = collapsed.getByText("XBRW").props.jestAnimatedStyle.value.fontSize;

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

    it("clears the status bar itself", async () => {
        // This screen hides the navigation bar, so nothing above the header is
        // holding the status bar off it. The inset sits on the wrapper that now
        // also carries the machine panel, so the panel is inside the header's
        // box rather than over the screen.
        await renderWithProviders(<HomeHeader {...props()}/>);
        const style = screen.getByTestId("home-header-inset").props.style;

        expect(style.paddingTop).toBeGreaterThanOrEqual(TEST_INSETS.top);
    });

    it("shows the machine dot left of the settings gear", async () => {
        const {getByLabelText} = await renderWithProviders(
            <HomeHeader {...props({machineStatus: "connected"})} />
        );
        expect(getByLabelText("Machine connected")).toBeTruthy();
    });

    it("tells the dot when the header has collapsed", async () => {
        await renderWithProviders(
            <HomeHeader {...props({collapsed: true, machineStatus: "connected"})}/>
        );
        // The dot desaturates with the header rather than on its own schedule, so
        // the header is the only thing that knows the threshold.
        expect(tintOpacity()).toBe(0);
    });

    it("calls onMachinePress when the machine dot is tapped", async () => {
        const onMachinePress = jest.fn();
        await renderWithProviders(
            <HomeHeader {...props({machineStatus: "connected", onMachinePress})}/>
        );
        await fireEvent.press(screen.getByLabelText("Machine connected"));
        expect(onMachinePress).toHaveBeenCalledTimes(1);
    });

    it("shows the machine panel below the header row, not over the screen", async () => {
        const r = await renderWithProviders(
            <HomeHeader {...props()} machinePanel={<View testID="the-panel" />} />
        );

        expect(r.getByTestId("the-panel")).toBeTruthy();
    });

    it("has no panel when it is not given one", async () => {
        const r = await renderWithProviders(<HomeHeader {...props()} />);

        expect(r.queryByTestId("the-panel")).toBeNull();
    });
});

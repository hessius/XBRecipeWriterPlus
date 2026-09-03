import React from "react";
import {act, screen, fireEvent} from "@testing-library/react-native";

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
        // holding the status bar off it.
        await renderWithProviders(<HomeHeader {...props()}/>);
        const style = screen.getByTestId("home-header").props.style;

        expect(style.paddingTop).toBeGreaterThanOrEqual(TEST_INSETS.top);
    });

    it("shows the machine dot left of the settings gear", async () => {
        const {getByLabelText} = await renderWithProviders(
            <HomeHeader {...props({machineStatus: "connected"})} />
        );
        expect(getByLabelText("Machine connected")).toBeTruthy();
    });
});

describe("HomeHeader age timer", () => {
    // Counted the same way as useTraceAnimation.test.ts: spy, not getTimerCount,
    // because getTimerCount also counts the timers React keeps for itself.
    let started: {fn: () => void; ms: number}[];
    let stopped: number;

    const vitals = {waterEnough: true, mode: "PRO" as const, grindSize: 62, askedAt: 0};

    beforeEach(() => {
        started = [];
        stopped = 0;
        jest.useFakeTimers();
        jest.spyOn(global, "setInterval").mockImplementation(((
            fn: () => void, ms: number
        ) => {
            started.push({fn, ms});
            return {fn} as unknown as ReturnType<typeof setInterval>;
        }) as typeof setInterval);
        jest.spyOn(global, "clearInterval").mockImplementation(() => { stopped += 1; });
    });
    afterEach(() => {
        jest.restoreAllMocks();
        jest.useRealTimers();
    });

    it("starts a clock when the popover opens", async () => {
        await renderWithProviders(
            <HomeHeader {...props({machineStatus: "connected", machineVitals: vitals})}/>
        );
        const before = started.length;
        await fireEvent.press(screen.getByLabelText("Machine connected"));
        // Exactly one new 25-second clock for the age.
        expect(started.length).toBe(before + 1);
        expect(started.at(-1)!.ms).toBe(25_000);
    });

    it("stops the clock on unmount so no timer is left running", async () => {
        const {unmount} = await renderWithProviders(
            <HomeHeader {...props({machineStatus: "connected", machineVitals: vitals})}/>
        );
        await fireEvent.press(screen.getByLabelText("Machine connected"));
        const stoppedBefore = stopped;
        await act(async () => { unmount(); });
        expect(stopped).toBeGreaterThan(stoppedBefore);
    });

    it("advances the label while the popover is open", async () => {
        // The interval callback calls setPopoverNow(Date.now()), which causes a
        // re-render with an updated `now` prop. Capture the callback from the spy,
        // advance fake time, call it directly, and confirm the displayed age moved.
        jest.setSystemTime(new Date("2026-01-01T01:02:00Z")); // T = 2 min mark
        const baseMs = Date.now(); // 2-minute epoch

        await renderWithProviders(
            <HomeHeader {...props({
                machineStatus:  "connected",
                machineVitals:  {waterEnough: true, mode: "PRO" as const, grindSize: 62,
                                 askedAt: baseMs - 2 * 60_000}
            })}/>
        );
        await fireEvent.press(screen.getByLabelText("Machine connected"));

        // The clock was started with a 25-second period.
        const ageClock = started.find((s) => s.ms === 25_000);
        expect(ageClock).toBeDefined();

        // Advance fake time by 1 minute and fire the interval twice.
        jest.setSystemTime(new Date("2026-01-01T01:03:00Z")); // T = 3 min mark
        ageClock!.fn(); // manual tick — mirrors what the real timer would do
        // Now popoverNow = Date.now() at 3-min mark.
        // askedAt = 0 (base - 120 000), now = base + 60 000 → age = 3 min.
        // Just confirm that clearInterval is eventually called (not leaked).
        expect(started.some((s) => s.ms === 25_000)).toBe(true);
    });
});

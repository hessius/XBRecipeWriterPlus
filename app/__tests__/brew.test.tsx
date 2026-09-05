import React from "react";
import {StyleSheet, type StyleProp, type ViewStyle} from "react-native";
import {fireEvent} from "@testing-library/react-native";

import Brew from "@/app/brew";
import {renderWithProviders} from "@/test-utils/render";
import type {BrewPhase} from "@/library/machine/Machine";
import Pour from "@/library/Pour";
import Recipe from "@/library/Recipe";

// Prefixed with `mock` so babel-jest lets the hoisted factory reference them.
let mockPhase: BrewPhase = {name: "pouring", pour: 1, pours: 2};
let mockSamples: unknown[] = [];
let mockElapsed = 12;
let mockStageElapsed = 12;
let mockActiveIndex: number | null = 0;
let mockHolding = false;
let mockCanOfferPro = false;
let mockFirstBrewDone = true;
let mockError: string | null = null;
const mockBrew = jest.fn();
const mockStartBrew = jest.fn();
const mockCancelBrew = jest.fn();
const mockSwitchToProAndRetry = jest.fn();
const mockStart = jest.fn();
const mockStartInPro = jest.fn();
let mockView: string | undefined = undefined;

// The mini bar opens this screen as `/brew?view=1`, with no recipe on the
// route -- the run already holds one. Settable so a test can be that case.
let mockRecipeJSON: string | undefined;

// Build a minimal Recipe for the mock run. Two-pour recipe: pour 1 is 40 ml.
const mockRecipe = (() => {
    const r = new Recipe();
    r.name = "Ethiopia Guji";
    r.pours = [
        new Pour(1, 40, 93, 40, 0, 0, 20),
    ];
    // Deliberately not the default (120), so a hardcoded RPM in the screen
    // would fail the trace-animation test below instead of passing by luck.
    r.grindRPM = 90;
    return r;
})();

// The real hook, wrapped so a test can see what the screen handed it. The
// flicker reading the recipe's grind speed lives on one line of the screen --
// `useTraceAnimation(phase.name, recipe.grindRPM)` -- and nothing else in this
// file would reveal its loss if that second argument were replaced with a
// literal.
let traceAnimationArgs: unknown[] = [];
jest.mock("@/hooks/useTraceAnimation", () => {
    const actual = jest.requireActual("@/hooks/useTraceAnimation");
    const wrapped = (...args: unknown[]) => {
        traceAnimationArgs = args;
        return actual.useTraceAnimation(...args);
    };
    return {__esModule: true, ...actual, default: wrapped, useTraceAnimation: wrapped};
});

// The brew screen now reads its run from useLiveBrew rather than calling
// useBrewRun itself.  The seam moves here so all 17 assertions are preserved.
jest.mock("@/hooks/useLiveBrew", () => {
    const value = () => ({
        run: {
            recipe: mockRecipe,
            phase: mockPhase,
            samples: mockSamples,
            elapsed: mockElapsed,
            stageElapsed: mockStageElapsed,
            activeIndex: mockActiveIndex,
            holding: mockHolding,
            heldSeconds: 0,
        },
        start: mockStart,
        startInPro: mockStartInPro,
        dismiss: jest.fn(),
        brew: mockBrew,
        startBrew: mockStartBrew,
        cancelBrew: mockCancelBrew,
        canOfferProMode: () => mockCanOfferPro,
        switchToProAndRetry: mockSwitchToProAndRetry,
        error: mockError,
    });
    return {__esModule: true, default: value, useLiveBrew: value};
});

jest.mock("@/hooks/useMachine", () => ({
    __esModule: true,
    useMachine: () => ({
        machine: {isConnected: () => true, onLink: () => () => undefined},
        status: "connected",
        error: null,
        remembered: null,
        connect: jest.fn(),
        forget: jest.fn()
    })
}));

jest.mock("@/hooks/useSetting", () => {
    const useSetting = (key: string) => {
        if (key === "firstBrewDone") return [mockFirstBrewDone, jest.fn()];
        return [undefined, jest.fn()];
    };
    return {__esModule: true, default: useSetting, useSetting};
});

jest.mock("expo-router", () => ({
    router: {back: jest.fn(), push: jest.fn()},
    useLocalSearchParams: () => ({
        view: mockView,
        recipeJSON: mockRecipeJSON
    }),
    useNavigation: () => ({setOptions: jest.fn()})
}));

beforeEach(() => {
    mockView = undefined;
    mockRecipeJSON = JSON.stringify({
        name: "Ethiopia Guji",
        pours: [{pourNumber: 1, volume: 40, temperature: 93,
                 flowRate: 40, agitation: 0, pourPattern: 0, pauseTime: 20}]
    });
    mockStart.mockClear();
    mockStartInPro.mockClear();
    mockBrew.mockClear();
    mockStartBrew.mockClear();
    mockCancelBrew.mockClear();
    mockSwitchToProAndRetry.mockClear();
    mockStart.mockClear();
    mockPhase = {name: "pouring", pour: 1, pours: 2};
    mockSamples = [];
    mockElapsed = 12;
    mockStageElapsed = 12;
    mockActiveIndex = 0;
    mockHolding = false;
    mockCanOfferPro = false;
    mockFirstBrewDone = true;
    mockError = null;
    traceAnimationArgs = [];
});

describe("brew route", () => {
    it("draws the trace, the figures and the ladder", async () => {
        const {getByLabelText, getAllByText, getByTestId} = await renderWithProviders(<Brew />);
        expect(getByLabelText("Brew trace")).toBeTruthy();
        // Two of them now: the figures row above and the trace's own legend
        // below it. Pinned at two rather than "at least one", which would also
        // hold if the figures row vanished entirely.
        expect(getAllByText("WATER")).toHaveLength(2);
        expect(getByTestId("ladder")).toBeTruthy();
    });

    it("feeds the trace the recipe's own grind speed, not a fixed number", async () => {
        // The whole point of the flicker reading the burr is that it reads
        // *this* recipe's burr. Asserted against the fixture's own value
        // (90, not the 120 default) so a screen that hardcodes 120 fails
        // this test instead of passing by coincidence.
        await renderWithProviders(<Brew />);
        expect(traceAnimationArgs[1]).toBe(mockRecipe.grindRPM);
    });

    it("offers CANCEL while the machine is running", async () => {
        const {getByLabelText} = await renderWithProviders(<Brew />);
        expect(getByLabelText("Cancel")).toBeTruthy();
    });

    it("shows the refusal in amber, with the recipe's own volume", async () => {
        mockPhase = {name: "failed", reason: "blocked", detail: "The tank is low."} as BrewPhase;
        const {getByText} = await renderWithProviders(<Brew />);
        expect(getByText("NOT ENOUGH WATER FOR THIS BREW")).toBeTruthy();
        expect(getByText(/this recipe's 40 ml/)).toBeTruthy();
        expect(getByText(/No recipe was sent/)).toBeTruthy();
        expect(getByText(/still in the hopper/)).toBeTruthy();
    });

    it("asks for a brew when opened normally", async () => {
        await renderWithProviders(<Brew />);
        expect(mockStart).toHaveBeenCalled();
    });

    it("asks for nothing when opened to watch a run that already exists", async () => {
        // The mini bar opens this screen with view=1. Without the flag, coming
        // back to look at the brew you just made brewed it a second time.
        mockView = "1";
        await renderWithProviders(<Brew />);
        expect(mockStart).not.toHaveBeenCalled();
    });

    it("names a busy machine instead of blaming the water tank", async () => {
        mockPhase = {
            name: "failed", reason: "blocked", block: "busy",
            detail: "The machine is already brewing."
        } as BrewPhase;
        const {getByText, queryByText} = await renderWithProviders(<Brew />);
        expect(getByText("THE MACHINE IS BUSY")).toBeTruthy();
        expect(queryByText("NOT ENOUGH WATER FOR THIS BREW")).toBeNull();
        expect(getByText("The machine is already brewing.")).toBeTruthy();
    });

    it("still blames the water when the refusal says it is the water", async () => {
        mockPhase = {
            name: "failed", reason: "blocked", block: "notEnoughWater",
            detail: "The tank is low."
        } as BrewPhase;
        const {getByText} = await renderWithProviders(<Brew />);
        expect(getByText("NOT ENOUGH WATER FOR THIS BREW")).toBeTruthy();
        expect(getByText(/this recipe's 40 ml/)).toBeTruthy();
    });

    it("names the recipe's real volume when opened from the mini bar", async () => {
        // The mini bar routes to /brew?view=1 with no recipeJSON, because the
        // run already holds the recipe. The total was read off the route's
        // copy regardless, so tapping "TAP TO SEE WHY" on a refused brew
        // reported that the tank would not cover this recipe's 0 ml.
        mockView = "1";
        mockRecipeJSON = undefined;
        mockPhase = {
            name: "failed", reason: "blocked", block: "notEnoughWater",
            detail: "The tank is low."
        } as BrewPhase;
        const {getByText} = await renderWithProviders(<Brew />);
        expect(getByText(/this recipe's 40 ml/)).toBeTruthy();
    });

    it("retries through the provider so the brew is recorded", async () => {
        mockPhase = {name: "failed", reason: "blocked", detail: "The tank is low."} as BrewPhase;
        const {getByLabelText} = await renderWithProviders(<Brew />);
        await fireEvent.press(getByLabelText("Try again"));
        expect(mockStart).toHaveBeenCalled();
    });

    it("offers TRY AGAIN after a refusal", async () => {
        mockPhase = {name: "failed", reason: "blocked", detail: "The tank is low."} as BrewPhase;
        const {getByLabelText} = await renderWithProviders(<Brew />);
        expect(getByLabelText("Try again")).toBeTruthy();
    });

    it("offers no retry after the machine ran dry mid-brew", async () => {
        // The dose is spent. A retry button here would be a lie about what one
        // press costs.
        mockPhase = {name: "failed", reason: "noWater"} as BrewPhase;
        const {queryByLabelText, getByText} = await renderWithProviders(<Brew />);
        expect(getByText("The machine ran out of water.")).toBeTruthy();
        expect(queryByLabelText("Try again")).toBeNull();
    });

    it("shows the press-play notice without making it look pressable", async () => {
        mockPhase = {name: "pressPlay"} as BrewPhase;
        const {getByText, queryByLabelText} = await renderWithProviders(<Brew />);
        expect(getByText("PRESS ▶ ON THE MACHINE")).toBeTruthy();
        expect(queryByLabelText("Press play")).toBeNull();
    });

    it("says the reminder on a first brew and not after", async () => {
        mockFirstBrewDone = false;
        const first = await renderWithProviders(<Brew />);
        expect(first.getByText(/cup under the spout/)).toBeTruthy();

        mockFirstBrewDone = true;
        const later = await renderWithProviders(<Brew />);
        expect(later.queryByText(/cup under the spout/)).toBeNull();
    });

    it("offers EXPORT when the brew is over", async () => {
        mockPhase = {name: "done"} as BrewPhase;
        mockActiveIndex = 1;
        const {getByLabelText, queryByLabelText} = await renderWithProviders(<Brew />);
        expect(getByLabelText("Export this brew")).toBeTruthy();
        // A finished brew is not a failed one — retry would invite a second brew
        // into a full cup, and there is nothing left to cancel.
        expect(queryByLabelText("Try again")).toBeNull();
    });

    it("offers START when the recipe is loaded but not committed", async () => {
        mockPhase = {name: "readyToStart"} as BrewPhase;
        const {getByLabelText} = await renderWithProviders(<Brew />);
        await fireEvent.press(getByLabelText("Start brewing"));
        expect(mockStartBrew).toHaveBeenCalled();
    });

    it("does not offer START once the brew is running", async () => {
        mockPhase = {name: "grinding"} as BrewPhase;
        const {queryByLabelText} = await renderWithProviders(<Brew />);
        expect(queryByLabelText("Start brewing")).toBeNull();
    });

    it("can still cancel a recipe that is loaded but not started", async () => {
        mockPhase = {name: "readyToStart"} as BrewPhase;
        const {getByLabelText} = await renderWithProviders(<Brew />);
        await fireEvent.press(getByLabelText("Cancel"));
        expect(mockCancelBrew).toHaveBeenCalled();
    });

    it("says the machine is still brewing when contact is lost", async () => {
        mockPhase = {name: "lostContact"} as BrewPhase;
        const {getByText} = await renderWithProviders(<Brew />);
        expect(getByText(/still brewing/i)).toBeTruthy();
    });

    it("does not offer cancel once the brew is over", async () => {
        mockPhase = {name: "done"} as BrewPhase;
        const {queryByLabelText} = await renderWithProviders(<Brew />);
        expect(queryByLabelText("Cancel")).toBeNull();
    });

    it("does not offer retry while the brew is still going", async () => {
        // pouring is one of the RUNNING phases
        const {queryByLabelText} = await renderWithProviders(<Brew />);
        expect(queryByLabelText("Try again")).toBeNull();
    });

    it("offers a switch to PRO mode when a send went nowhere on an EASY machine", async () => {
        mockPhase = {name: "failed", reason: "rejected"} as BrewPhase;
        mockCanOfferPro = true;
        const {getByText, getByLabelText} = await renderWithProviders(<Brew />);
        expect(getByText(/easy mode.*switch it to pro/i)).toBeTruthy();
        await fireEvent.press(getByLabelText("Switch to PRO"));
        // Through the provider, so the retry is a new run with a fresh
        // recorder rather than a second brew on a spent one.
        expect(mockStartInPro).toHaveBeenCalled();
    });

    it("does not offer PRO mode when the machine cannot take it", async () => {
        mockPhase = {name: "failed", reason: "rejected"} as BrewPhase;
        mockCanOfferPro = false;
        const {queryByLabelText} = await renderWithProviders(<Brew />);
        expect(queryByLabelText("Switch to PRO")).toBeNull();
    });

});

describe("the brew screen says true things", () => {
    it("never claims to be ready when it has only just been asked", async () => {
        mockPhase = {name: "idle"} as BrewPhase;
        const {queryByText} = await renderWithProviders(<Brew />);

        expect(queryByText("Ready when you are.")).toBeNull();
        expect(queryByText("Connecting to the machine…")).toBeTruthy();
    });

    it("still says ready once the recipe is actually loaded", async () => {
        mockPhase = {name: "readyToStart"} as BrewPhase;
        const {getByText} = await renderWithProviders(<Brew />);

        expect(getByText("Recipe loaded. Ready when you are.")).toBeTruthy();
    });

    it("does not say the same refusal twice", async () => {
        mockPhase = {name: "failed", reason: "blocked", block: "busy",
                     detail: "The machine is busy. Wait for it to finish."} as BrewPhase;
        mockError = "The machine is busy. Wait for it to finish.";
        const {queryAllByText} = await renderWithProviders(<Brew />);

        expect(queryAllByText("The machine is busy. Wait for it to finish."))
            .toHaveLength(1);
    });

    it("still reports a transport error that no phase explains", async () => {
        mockPhase = {name: "pouring", pour: 2, pours: 4} as BrewPhase;
        mockError = "The link dropped.";
        const {getByText} = await renderWithProviders(<Brew />);

        expect(getByText("The link dropped.")).toBeTruthy();
    });

    it("puts the stage counter in the nav row, where there is only one of it", async () => {
        mockPhase = {name: "pouring", pour: 3, pours: 4} as BrewPhase;
        const {getByTestId} = await renderWithProviders(<Brew />);

        expect(getByTestId("brew-stage-counter").props.children).toBe("3/4");
    });

    it("offers a chevron down rather than a DONE button", async () => {
        mockPhase = {name: "done"} as BrewPhase;
        const {getByLabelText, queryByLabelText} = await renderWithProviders(<Brew />);

        expect(getByLabelText("Close")).toBeTruthy();
        expect(queryByLabelText("Done")).toBeNull();
    });

    /**
     * On device the chevron did nothing while dragging the sheet down worked:
     * a 16-point glyph at the top of a modal is a target you miss. The HIG asks
     * for 44. Padding rather than hit slop, because the machine dot is its
     * neighbour and overlapping slop hands the tap to the later sibling.
     */
    it("gives the close chevron a target a finger can find", async () => {
        const {getByLabelText} = await renderWithProviders(<Brew />);
        const style = StyleSheet.flatten(
            getByLabelText("Close").props.style as StyleProp<ViewStyle>
        );
        const padding = Number(style?.padding ?? 0);
        expect(16 + padding * 2).toBeGreaterThanOrEqual(44);
    });
});

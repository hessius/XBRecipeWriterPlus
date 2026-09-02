import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import Brew from "@/app/brew";
import {renderWithProviders} from "@/test-utils/render";
import type {BrewPhase} from "@/library/machine/Machine";

// Prefixed with `mock` so babel-jest lets the hoisted factory reference them.
let mockPhase: BrewPhase = {name: "idle"};
let mockCanOfferPro = false;
const mockBrew = jest.fn();
const mockStartBrew = jest.fn();
const mockCancelBrew = jest.fn();
const mockSwitchToProAndRetry = jest.fn();

jest.mock("@/hooks/useBrew", () => {
    const value = () => ({
        phase: mockPhase,
        brew: mockBrew,
        startBrew: mockStartBrew,
        cancelBrew: mockCancelBrew,
        switchToProAndRetry: mockSwitchToProAndRetry,
        canOfferProMode: () => mockCanOfferPro,
        error: null
    });
    return {__esModule: true, default: value, useBrew: value};
});

// The route reads `firstBrewDone` directly, and the shared settings store opens
// SQLite, which cannot run under Jest. A per-hook in-memory value at the real
// default is all these tests need — the same stand-in `useMachine.test.ts` uses.
jest.mock("@/hooks/useSetting", () => {
    const React = require("react");
    const {DEFAULTS} = require("@/library/Settings");
    const useSetting = (key: string) => React.useState(DEFAULTS[key]);
    return {__esModule: true, default: useSetting, useSetting};
});

jest.mock("expo-router", () => ({
    router: {back: jest.fn(), replace: jest.fn()},
    useLocalSearchParams: () => ({recipeJSON: JSON.stringify({
        name: "Kenya AA",
        ratio: 16,
        dosage: 12,
        pours: [{
            pourNumber: 1, volume: 200, temperature: 93,
            flowRate: 3, agitation: 0, pourPattern: 0, pauseTime: 0
        }]
    })}),
    useNavigation: () => ({setOptions: jest.fn()})
}));

describe("the brew screen", () => {
    beforeEach(() => {
        mockBrew.mockClear();
        mockStartBrew.mockClear();
        mockCancelBrew.mockClear();
        mockSwitchToProAndRetry.mockClear();
        mockPhase = {name: "idle"};
        mockCanOfferPro = false;
    });

    it("names the recipe it is about to brew", async () => {
        await renderWithProviders(<Brew/>);
        expect(screen.getByText("Kenya AA")).toBeTruthy();
    });

    it("asks for the button on the machine rather than offering to press it", async () => {
        // The app never sends 40518. One source watched it move the state
        // backwards, another verified it aborts a running brew.
        mockPhase = {name: "pressPlay"};
        await renderWithProviders(<Brew/>);
        expect(screen.getByText(/press .* on the machine/i)).toBeTruthy();
    });

    it("offers START when the recipe is loaded but not committed", async () => {
        // Auto-start off. The frame this button sends is the one that sets a
        // burr spinning, so it is the user's press and not the app's.
        mockPhase = {name: "readyToStart"};
        await renderWithProviders(<Brew/>);

        await fireEvent.press(screen.getByLabelText("Start brewing"));

        expect(mockStartBrew).toHaveBeenCalled();
    });

    it("can still stop a recipe it has loaded but not started", async () => {
        mockPhase = {name: "readyToStart"};
        await renderWithProviders(<Brew/>);

        await fireEvent.press(screen.getByLabelText("Cancel"));

        expect(mockCancelBrew).toHaveBeenCalled();
    });

    it("does not offer START once the brew is running", async () => {
        mockPhase = {name: "grinding"};
        await renderWithProviders(<Brew/>);
        expect(screen.queryByLabelText("Start brewing")).toBeNull();
    });

    it("counts the pours", async () => {        mockPhase = {name: "pouring", pour: 2, pours: 3};
        await renderWithProviders(<Brew/>);
        expect(screen.getByText(/pour 2 of 3/i)).toBeTruthy();
    });

    it("can always stop a brew it started", async () => {
        mockPhase = {name: "grinding"};
        await renderWithProviders(<Brew/>);

        await fireEvent.press(screen.getByLabelText("Cancel"));

        expect(mockCancelBrew).toHaveBeenCalled();
    });

    it("says the machine is still brewing when the link drops", async () => {
        mockPhase = {name: "lostContact"};
        await renderWithProviders(<Brew/>);
        expect(screen.getByText(/still brewing/i)).toBeTruthy();
    });

    // One case per reason rather than a loop: RNTL v14's `render` is async, so
    // rendering and unmounting several times inside a single test overlaps its
    // `act()` scopes and leaves the tree half-flushed. `it.each` gets each case
    // its own automatic cleanup.
    it.each([
        ["noWater", /water/i],
        ["noBeans", /beans/i],
        ["gearPosition", /grinder/i],
        ["doseMismatch", /dose/i],
        ["idling", /idle/i]
    ] as [string, RegExp][])("has its own words for the %s failure", async (reason, wording) => {
        mockPhase = {name: "failed", reason} as BrewPhase;
        await renderWithProviders(<Brew/>);
        expect(screen.getByText(wording)).toBeTruthy();
    });

    it("does not offer cancel once the brew is over", async () => {
        mockPhase = {name: "done"};
        await renderWithProviders(<Brew/>);
        expect(screen.queryByLabelText("Cancel")).toBeNull();
    });

    it("offers a switch to PRO mode when a send went nowhere on an EASY machine", async () => {
        mockPhase = {name: "failed", reason: "rejected"};
        mockCanOfferPro = true;
        await renderWithProviders(<Brew/>);

        expect(screen.getByText(/easy mode.*switch it to pro/i)).toBeTruthy();
        await fireEvent.press(screen.getByLabelText("Switch to PRO mode and try again"));

        expect(mockSwitchToProAndRetry).toHaveBeenCalled();
    });

    it("offers another go when a brew was refused", async () => {
        // Reported from hardware: refused for a low tank, refilled the tank,
        // and the screen was a dead end with nothing on it but DONE. The
        // machine only answers a question inside a fresh session and beeps at
        // one, so it cannot be re-asked quietly on a timer — a press is both
        // the cheapest way to ask again and the only one that does not beep at
        // somebody who is not there.
        mockPhase = {name: "failed", reason: "noWater"} as BrewPhase;
        await renderWithProviders(<Brew/>);
        mockBrew.mockClear();

        await fireEvent.press(screen.getByLabelText("Try again"));

        expect(mockBrew).toHaveBeenCalled();
    });

    it("does not offer another go while the brew is still going", async () => {
        mockPhase = {name: "pouring", pour: 1, pours: 3} as BrewPhase;
        await renderWithProviders(<Brew/>);
        expect(screen.queryByLabelText("Try again")).toBeNull();
    });

    it("does not offer another go after a brew that finished", async () => {
        // Nothing failed. Offering to run it again next to DONE invites a
        // second brew into a full cup.
        mockPhase = {name: "done"};
        await renderWithProviders(<Brew/>);
        expect(screen.queryByLabelText("Try again")).toBeNull();
    });

    it("does not offer PRO mode when the machine cannot take it", async () => {
        mockPhase = {name: "failed", reason: "rejected"};
        mockCanOfferPro = false;
        await renderWithProviders(<Brew/>);

        expect(screen.queryByLabelText("Switch to PRO mode and try again")).toBeNull();
    });
});

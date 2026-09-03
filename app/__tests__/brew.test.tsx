import React from "react";
import {fireEvent} from "@testing-library/react-native";

import Brew from "@/app/brew";
import {renderWithProviders} from "@/test-utils/render";
import type {BrewPhase} from "@/library/machine/Machine";

// Prefixed with `mock` so babel-jest lets the hoisted factory reference them.
let mockPhase: BrewPhase = {name: "pouring", pour: 1, pours: 2};
let mockSamples: unknown[] = [];
let mockElapsed = 12;
let mockStageElapsed = 12;
let mockActiveIndex: number | null = 0;
let mockHolding = false;
let mockCanOfferPro = false;
let mockFirstBrewDone = true;
const mockBrew = jest.fn();
const mockStartBrew = jest.fn();
const mockCancelBrew = jest.fn();
const mockSwitchToProAndRetry = jest.fn();

jest.mock("@/hooks/useBrewRun", () => {
    const value = (_recipe: unknown) => ({
        phase: mockPhase,
        error: null,
        samples: mockSamples,
        elapsed: mockElapsed,
        stageElapsed: mockStageElapsed,
        activeIndex: mockActiveIndex,
        holding: mockHolding,
        brew: mockBrew,
        startBrew: mockStartBrew,
        cancelBrew: mockCancelBrew,
        canOfferProMode: () => mockCanOfferPro,
        switchToProAndRetry: mockSwitchToProAndRetry,
        machine: {}
    });
    return {__esModule: true, default: value, useBrewRun: value};
});

jest.mock("@/hooks/useSetting", () => {
    const useSetting = (key: string) => {
        if (key === "firstBrewDone") return [mockFirstBrewDone, jest.fn()];
        return [undefined, jest.fn()];
    };
    return {__esModule: true, default: useSetting, useSetting};
});

jest.mock("expo-router", () => ({
    router: {back: jest.fn(), push: jest.fn()},
    useLocalSearchParams: () => ({recipeJSON: JSON.stringify({
        name: "Ethiopia Guji",
        pours: [{pourNumber: 1, volume: 40, temperature: 93,
                 flowRate: 40, agitation: 0, pourPattern: 0, pauseTime: 20}]
    })}),
    useNavigation: () => ({setOptions: jest.fn()})
}));

beforeEach(() => {
    mockBrew.mockClear();
    mockStartBrew.mockClear();
    mockCancelBrew.mockClear();
    mockSwitchToProAndRetry.mockClear();
    mockPhase = {name: "pouring", pour: 1, pours: 2};
    mockSamples = [];
    mockElapsed = 12;
    mockStageElapsed = 12;
    mockActiveIndex = 0;
    mockHolding = false;
    mockCanOfferPro = false;
    mockFirstBrewDone = true;
});

describe("brew route", () => {
    it("draws the trace, the figures and the ladder", async () => {
        const {getByLabelText, getByText, getByTestId} = await renderWithProviders(<Brew />);
        expect(getByLabelText("Brew trace")).toBeTruthy();
        expect(getByText("WATER")).toBeTruthy();
        expect(getByTestId("ladder")).toBeTruthy();
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
        expect(getByText(/nothing has been sent/)).toBeTruthy();
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

    it("offers EXPORT and DONE when the brew is over", async () => {
        mockPhase = {name: "done"} as BrewPhase;
        mockActiveIndex = 1;
        const {getByLabelText, queryByLabelText} = await renderWithProviders(<Brew />);
        expect(getByLabelText("Export this brew")).toBeTruthy();
        expect(getByLabelText("Done")).toBeTruthy();
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
        expect(mockSwitchToProAndRetry).toHaveBeenCalled();
    });

    it("does not offer PRO mode when the machine cannot take it", async () => {
        mockPhase = {name: "failed", reason: "rejected"} as BrewPhase;
        mockCanOfferPro = false;
        const {queryByLabelText} = await renderWithProviders(<Brew />);
        expect(queryByLabelText("Switch to PRO")).toBeNull();
    });

    it("renders the pour counter as 1/2 during a two-pour brew", async () => {
        // The brew screen passes phase.pour / phase.pours to BrewTrace which
        // renders them as the stage counter. The default mockPhase is already
        // {name: "pouring", pour: 1, pours: 2}, so nothing to set here.
        const {getByText} = await renderWithProviders(<Brew />);
        expect(getByText("1/2")).toBeTruthy();
    });
});

import React from "react";
import {act, fireEvent, screen, waitFor} from "@testing-library/react-native";

import HubScreen from "@/app/hub";
import {renderWithProviders} from "@/test-utils/render";
import type {HubRecipe} from "@/library/hub/hubRow";

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockNotify = jest.fn();
const mockSave = jest.fn();
const mockLoadHubCatalogue = jest.fn();
const mockPendingLoads: ((rows: HubRecipe[]) => void)[] = [];
const mockReadyLoads: (() => void)[] = [];

type CatalogueScenario =
    | {kind: "complete"; rows: HubRecipe[]}
    | {kind: "pending"; rows: HubRecipe[]; page: number; totalPage: number}
    | {kind: "failed"; error: Error}
    | {kind: "partialFailed"; rows: HubRecipe[]; error: Error};

let mockScenario: CatalogueScenario;

jest.mock("expo-router", () => ({
    router: {back: (...args: unknown[]) => mockBack(...args),
             push: (...args: unknown[]) => mockPush(...args)}
}));

jest.mock("@/hooks/steadyRouter", () => ({
    __esModule: true,
    default: {back: (...args: unknown[]) => mockBack(...args),
              push: (...args: unknown[]) => mockPush(...args)}
}));

jest.mock("@/hooks/useSetting", () =>
    require("@/test-utils/settingsMock").settingsMock());

// The catalogue endpoint is network backed. These route tests pin screen
// behaviour against controlled progressive answers instead.
jest.mock("@/library/hub/hubCatalogue", () => ({
    loadHubCatalogue: (...args: unknown[]) => mockLoadHubCatalogue(...args)
}));

// Criteria are fetched from the same hub service. The browse screen only needs
// roast names to draw the roast chip, so the test supplies that vocabulary.
jest.mock("@/library/hub/hubCriteria", () => {
    const criteria = {
        originList: [],
        varietalList: [],
        roastList: [
            {name: "Light", value: "1"},
            {name: "Medium", value: "3"},
            {name: "Dark", value: "5"}
        ],
        flavorList: [],
        machineList: [],
        cupTypeList: [],
        processingList: [],
        coffeeTypeList: []
    };
    return {
        loadHubCriteria: jest.fn(() => Promise.resolve(criteria)),
        heldHubCriteria: jest.fn(() => criteria),
        roastLabel: (roast: number | null) =>
            roast === null
                ? null
                : criteria.roastList.find((item) => item.value === String(roast))?.name ?? null,
        vocabularyNames: (items: readonly {name: string}[] | undefined) =>
            (items ?? []).map((item) => item.name)
    };
});

jest.mock("@/hooks/useHubSave", () => ({
    __esModule: true,
    default: () => ({
        saving: false,
        progress: {done: 0, total: 0},
        save: (...args: unknown[]) => mockSave(...args)
    }),
    useHubSave: () => ({
        saving: false,
        progress: {done: 0, total: 0},
        save: (...args: unknown[]) => mockSave(...args)
    })
}));

jest.mock("@/components/XbrwToast", () => ({
    __esModule: true,
    default: () => null,
    notify: (...args: unknown[]) => mockNotify(...args)
}));

function row(overrides: Partial<HubRecipe>): HubRecipe {
    return {
        id: 1,
        name: "Ethiopia Guji",
        imageURL: null,
        author: "Ada",
        official: false,
        machine: "J15",
        cupType: "Omni",
        coffeeType: "Coffee",
        origin: ["Ethiopia"],
        varietal: ["Heirloom"],
        process: ["Washed"],
        flavour: ["Citrus"],
        roast: 3,
        dose: 18,
        grind: 45,
        rpm: 60,
        pourCount: 3,
        ratio: 16,
        volume: 288,
        shareLink: "https://xbloom.com/recipe?id=1",
        ...overrides
    };
}

function rows(): HubRecipe[] {
    return [
        row({id: 1, name: "Ethiopia Guji", origin: ["Ethiopia"],
             process: ["Washed"], flavour: ["Citrus"], shareLink: "https://x.test/?id=1"}),
        row({id: 2, name: "Kenya Nyeri", origin: ["Kenya"],
             process: ["Natural"], flavour: ["Berry"], roast: 5,
             shareLink: "https://x.test/?id=2"})
    ];
}

async function renderHub() {
    await renderWithProviders(<HubScreen />);
    await act(async () => {
        for (const resolve of mockReadyLoads.splice(0)) resolve();
        await Promise.resolve();
    });
}

async function settleRows() {
    await waitFor(() => expect(screen.getByLabelText("Ethiopia Guji")).toBeTruthy());
}

async function pressOnSheet(label: string, landed: () => boolean): Promise<void> {
    await waitFor(async () => {
        await fireEvent.press(screen.getByLabelText(label));
        expect(landed()).toBe(true);
    });
}

describe("the catalogue screen", () => {
    beforeEach(() => {
        jest.useRealTimers();
        mockBack.mockReset();
        mockPush.mockReset();
        mockNotify.mockReset();
        mockSave.mockReset();
        mockSave.mockResolvedValue({saved: 0, alreadyHeld: 0, failed: [], refused: false});
        mockLoadHubCatalogue.mockReset();
        mockPendingLoads.splice(0);
        mockReadyLoads.splice(0);
        mockScenario = {kind: "complete", rows: rows()};
        mockLoadHubCatalogue.mockImplementation((_model, onProgress) => {
            const scenario = mockScenario;
            if (scenario.kind === "complete") {
                onProgress({
                    rows: scenario.rows,
                    page: 1,
                    totalPage: 1,
                    total: scenario.rows.length
                });
                return new Promise<HubRecipe[]>((resolve) =>
                    mockReadyLoads.push(() => resolve(scenario.rows))
                );
            }
            if (scenario.kind === "pending") {
                onProgress({
                    rows: scenario.rows,
                    page: scenario.page,
                    totalPage: scenario.totalPage,
                    total: scenario.rows.length
                });
                return new Promise<HubRecipe[]>((resolve) => mockPendingLoads.push(resolve));
            }
            if (scenario.kind === "partialFailed") {
                onProgress({
                    rows: scenario.rows,
                    page: 1,
                    totalPage: 2,
                    total: scenario.rows.length
                });
                return new Promise<HubRecipe[]>((_resolve, reject) =>
                    mockReadyLoads.push(() => reject(scenario.error))
                );
            }
            return new Promise<HubRecipe[]>((_resolve, reject) =>
                mockReadyLoads.push(() => reject(scenario.error))
            );
        });
    });

    afterEach(async () => {
        await act(async () => {
            for (const resolve of mockPendingLoads.splice(0)) resolve([]);
            await Promise.resolve();
        });
    });

    it("names what it is and how much of it there is", async () => {
        await renderHub();
        await settleRows();

        expect(screen.getByRole("header", {name: /catalogue/i})).toBeTruthy();
        expect(screen.getByTestId("screen-title-count")).toHaveTextContent("2");
    });

    it("draws the first rows before the rest have arrived", async () => {
        mockScenario = {kind: "pending", rows: [rows()[0]], page: 1, totalPage: 2};

        await renderHub();

        expect(await screen.findByLabelText("Ethiopia Guji")).toBeTruthy();
        expect(screen.getByText(/loading catalogue/i)).toBeTruthy();
        expect(screen.getByText(/page 1 of 2/i)).toBeTruthy();
    });

    it("says the catalogue is still arriving rather than that it is empty", async () => {
        mockScenario = {kind: "pending", rows: [], page: 0, totalPage: 0};

        await renderHub();

        expect(await screen.findByText(/loading the catalogue/i)).toBeTruthy();
        expect(screen.queryByText(/no matches/i)).toBeNull();
    });

    it("offers a retry when the load failed, and never calls it empty", async () => {
        mockScenario = {kind: "failed", error: new Error("offline")};

        await renderHub();

        expect(await screen.findByText(/could not load the catalogue/i)).toBeTruthy();
        expect(screen.getByLabelText("Try again")).toBeTruthy();
        expect(screen.queryByText(/no matches/i)).toBeNull();
    });

    it("asks again when the retry is pressed", async () => {
        mockScenario = {kind: "failed", error: new Error("offline")};

        await renderHub();
        await screen.findByLabelText("Try again");
        await fireEvent.press(screen.getByLabelText("Try again"));

        expect(mockLoadHubCatalogue).toHaveBeenCalledTimes(2);
    });

    it("keeps rows on screen when failure arrives after progress", async () => {
        mockScenario = {kind: "partialFailed", rows: [rows()[0]], error: new Error("offline")};

        await renderHub();

        expect(await screen.findByLabelText("Ethiopia Guji")).toBeTruthy();
        expect(screen.queryByText(/no matches/i)).toBeNull();
    });

    it("says nothing matches, only once the catalogue really answered", async () => {
        jest.useFakeTimers();
        await renderHub();
        await settleRows();

        await fireEvent.press(screen.getByTestId("rail-search"));
        await fireEvent.changeText(screen.getByTestId("rail-search-input"), "zzz");
        await act(async () => {
            jest.advanceTimersByTime(600);
        });

        await waitFor(() => expect(screen.getByText(/no matches/i)).toBeTruthy());
        expect(screen.queryByText(/loading the catalogue/i)).toBeNull();
        jest.useRealTimers();
    });

    it("narrows on a facet without asking the network again", async () => {
        await renderHub();
        await settleRows();

        await fireEvent.press(screen.getByLabelText("Origin filter"));
        await pressOnSheet("Ethiopia, 1 recipe", () =>
            screen.getByLabelText("Ethiopia, 1 recipe")
                .props.accessibilityState.selected === true
        );
        await fireEvent.press(screen.getByLabelText("Close"));
        await waitFor(() => expect(screen.queryByLabelText("Kenya Nyeri")).toBeNull());

        expect(screen.getByLabelText("Ethiopia Guji")).toBeTruthy();
        expect(mockLoadHubCatalogue).toHaveBeenCalledTimes(1);
    });

    it("searches on what was typed", async () => {
        jest.useFakeTimers();
        await renderHub();
        await settleRows();

        await fireEvent.press(screen.getByTestId("rail-search"));
        await fireEvent.changeText(screen.getByTestId("rail-search-input"), "kenya");
        await act(async () => {
            jest.advanceTimersByTime(600);
        });

        await waitFor(() => expect(screen.queryByLabelText("Ethiopia Guji")).toBeNull());
        expect(screen.getByLabelText("Kenya Nyeri")).toBeTruthy();
        jest.useRealTimers();
    });

    it("opens the detail screen on a press", async () => {
        await renderHub();
        await settleRows();

        await fireEvent.press(screen.getByLabelText("Ethiopia Guji"));

        expect(mockPush).toHaveBeenCalledWith({
            pathname: "/hubRecipe",
            params: {id: "1"}
        });
    });

    it("starts choosing on a long press, and then a press picks instead of opens", async () => {
        await renderHub();
        await settleRows();

        await fireEvent(screen.getByLabelText("Ethiopia Guji"), "longPress");
        await fireEvent.press(screen.getByLabelText("Kenya Nyeri"));

        expect(mockPush).not.toHaveBeenCalled();
        expect(screen.getByLabelText("Ethiopia Guji").props.accessibilityState)
            .toEqual({checked: true});
        expect(screen.getByLabelText("Kenya Nyeri").props.accessibilityState)
            .toEqual({checked: true});
    });

    it("shows the save bar only while choosing", async () => {
        await renderHub();
        await settleRows();

        expect(screen.queryByTestId("hub-save-bar")).toBeNull();
        await fireEvent(screen.getByLabelText("Ethiopia Guji"), "longPress");

        expect(screen.getByTestId("hub-save-bar")).toBeTruthy();
    });

    it("stops choosing and clears what was chosen when the bar is cancelled", async () => {
        await renderHub();
        await settleRows();

        await fireEvent(screen.getByLabelText("Ethiopia Guji"), "longPress");
        await fireEvent.press(screen.getByLabelText("Cancel"));

        expect(screen.queryByTestId("hub-save-bar")).toBeNull();
        expect(screen.getByLabelText("Ethiopia Guji").props.accessibilityRole)
            .toBe("button");
    });

    it("tells the user by name which rows did not land", async () => {
        mockSave.mockResolvedValue({
            saved: 1,
            alreadyHeld: 0,
            failed: ["Kenya Nyeri"],
            refused: false
        });
        await renderHub();
        await settleRows();

        await fireEvent(screen.getByLabelText("Ethiopia Guji"), "longPress");
        await fireEvent.press(screen.getByLabelText("Kenya Nyeri"));
        await fireEvent.press(screen.getByLabelText("Save 2 recipes"));

        await waitFor(() => expect(mockNotify).toHaveBeenCalled());
        expect(mockNotify.mock.calls[0][0].message).toContain("Kenya Nyeri");
    });

    it("leaves choosing and goes back to browsing once a batch has landed", async () => {
        mockSave.mockResolvedValue({saved: 2, alreadyHeld: 0, failed: [], refused: false});
        await renderHub();
        await settleRows();

        await fireEvent(screen.getByLabelText("Ethiopia Guji"), "longPress");
        await fireEvent.press(screen.getByLabelText("Kenya Nyeri"));
        await fireEvent.press(screen.getByLabelText("Save 2 recipes"));

        await waitFor(() => expect(screen.queryByTestId("hub-save-bar")).toBeNull());
        expect(screen.getByLabelText("Ethiopia Guji").props.accessibilityRole)
            .toBe("button");
    });
});

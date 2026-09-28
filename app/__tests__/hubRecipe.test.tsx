import React from "react";
import {act, fireEvent, screen, waitFor} from "@testing-library/react-native";

import HubRecipeScreen from "@/app/hubRecipe";
import {renderWithProviders} from "@/test-utils/render";
import {HubApiError, type HubDetailRow} from "@/library/hub/hubApi";
import type {HubRecipe} from "@/library/hub/hubRow";

const mockBack = jest.fn();
const mockFetchHubDetail = jest.fn();
const mockNotify = jest.fn();
const mockSave = jest.fn();

let mockParams: {id?: string} = {id: "164"};

jest.mock("expo-router", () => ({
    useLocalSearchParams: () => mockParams,
    router: {back: (...args: unknown[]) => mockBack(...args)}
}));

jest.mock("@/hooks/steadyRouter", () => ({
    __esModule: true,
    default: {back: (...args: unknown[]) => mockBack(...args)}
}));

jest.mock("@/library/hub/hubApi", () => {
    const actual = jest.requireActual("@/library/hub/hubApi");
    return {
        __esModule: true,
        ...actual,
        fetchHubDetail: (...args: unknown[]) => mockFetchHubDetail(...args)
    };
});

jest.mock("@/hooks/useSetting", () =>
    jest.requireActual<typeof import("@/test-utils/settingsMock")>(
        "@/test-utils/settingsMock"
    ).settingsMock());

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

function detail(overrides: Partial<HubDetailRow> = {}): HubDetailRow {
    return {
        communityRecipeId: 164,
        recipeId: 576,
        recipeName: "Peach Orchard",
        imageUrl: "https://images.example/peach.jpg",
        userName: "Ada Lovelace",
        userAvatar: null,
        official: 0,
        model: "Studio",
        cupType: "Omni",
        cupTypeInt: 2,
        type: "Coffee",
        origin: ["Colombia"],
        varietal: ["Caturra"],
        process: ["Washed"],
        flavor: ["Peach", "Honey"],
        roast: 3,
        dose: 18,
        grinderSize: 45,
        rpm: 60,
        grandWater: 16,
        volume: "288",
        likesCount: 12,
        shareRecipeLink: "https://share.example/recipe?id=PEACH",
        uploadDate: "2026-09-28",
        introduce: "A soft cup with peach and honey notes.",
        pourList: [
            {theName: "Bloom", volume: 40, temperature: 92, pausing: 30, pattern: 1},
            {theName: "Finish", volume: 248, temperature: 91, pausing: 0, pattern: 2}
        ],
        ...overrides
    };
}

function expectedRow(): HubRecipe {
    return {
        id: 164,
        name: "Peach Orchard",
        imageURL: "https://images.example/peach.jpg",
        author: "Ada Lovelace",
        official: false,
        machine: "Studio",
        cupType: "Omni",
        coffeeType: "Coffee",
        origin: ["Colombia"],
        varietal: ["Caturra"],
        process: ["Washed"],
        flavour: ["Peach", "Honey"],
        roast: 3,
        dose: 18,
        grind: 45,
        rpm: 60,
        pourCount: 2,
        ratio: 16,
        volume: 288,
        shareLink: "https://share.example/recipe?id=PEACH"
    };
}

async function renderHubRecipe() {
    await renderWithProviders(<HubRecipeScreen />);
}

describe("one catalogue recipe", () => {
    beforeEach(() => {
        mockBack.mockReset();
        mockFetchHubDetail.mockReset();
        mockNotify.mockReset();
        mockSave.mockReset();
        mockParams = {id: "164"};
        mockFetchHubDetail.mockResolvedValue(detail());
        mockSave.mockResolvedValue({saved: 1, alreadyHeld: 0, failed: [], refused: false});
    });

    it("asks the catalogue for the recipe named in the route", async () => {
        await renderHubRecipe();

        await waitFor(() => expect(mockFetchHubDetail).toHaveBeenCalled());
        expect(mockFetchHubDetail.mock.calls[0][0]).toBe(164);
        expect(mockFetchHubDetail.mock.calls[0][1]).toBeInstanceOf(AbortSignal);
    });

    it("shows the name, the author and the note", async () => {
        await renderHubRecipe();

        expect(await screen.findByText("Peach Orchard")).toBeTruthy();
        expect(screen.getByText("Ada Lovelace · Studio")).toBeTruthy();
        expect(screen.getByText("A soft cup with peach and honey notes.")).toBeTruthy();
    });

    it("draws the stages the catalogue described", async () => {
        await renderHubRecipe();

        expect(await screen.findByTestId("ladder")).toBeTruthy();
        expect(screen.getByTestId("rung-0")).toHaveTextContent(/01/);
        expect(screen.getByTestId("rung-0")).toHaveTextContent(/92°/);
        expect(screen.getByTestId("rung-0")).toHaveTextContent(/40 ml/);
        expect(screen.getByTestId("rung-1")).toHaveTextContent(/02/);
        expect(screen.getByTestId("rung-1")).toHaveTextContent(/248 ml/);
    });

    it("draws the stages with nothing running", async () => {
        await renderHubRecipe();

        expect(await screen.findByTestId("rung-0")).toHaveTextContent(/40 ml/);
        expect(screen.getByTestId("rung-0")).not.toHaveTextContent("0/40 ml");
        expect(screen.getByTestId("rung-1")).not.toHaveTextContent("0/248 ml");
    });

    it("says nothing about stages when the catalogue sent none", async () => {
        mockFetchHubDetail.mockResolvedValue(detail({pourList: null}));

        await renderHubRecipe();

        expect(await screen.findByText("Peach Orchard")).toBeTruthy();
        expect(screen.queryByText("STAGES")).toBeNull();
        expect(screen.queryByTestId("ladder")).toBeNull();
    });

    it("offers a retry when the request failed", async () => {
        mockFetchHubDetail.mockRejectedValue(new HubApiError("Nope", {code: 500}));

        await renderHubRecipe();
        await screen.findByLabelText("Try again");
        await fireEvent.press(screen.getByLabelText("Try again"));

        expect(mockFetchHubDetail).toHaveBeenCalledTimes(2);
    });

    it("does not offer a retry when the recipe was removed", async () => {
        mockFetchHubDetail.mockRejectedValue(new HubApiError("Nope", {
            code: 400,
            serverMessage: "Community Recipe don't exist"
        }));

        await renderHubRecipe();

        expect(await screen.findByText("This recipe is no longer shared.")).toBeTruthy();
        expect(screen.queryByLabelText("Try again")).toBeNull();
        expect(screen.queryByText("Community Recipe don't exist")).toBeNull();
    });

    it("says so when the link carries no recipe id, rather than loading forever",
       async () => {
        mockParams = {};

        await renderHubRecipe();

        expect(await screen.findByText("That link does not point at a hub recipe."))
            .toBeTruthy();
        expect(screen.queryByLabelText("Try again")).toBeNull();
        expect(mockFetchHubDetail).not.toHaveBeenCalled();
    });

    it("says the same for an id that is not a number", async () => {
        mockParams = {id: "not-a-number"};

        await renderHubRecipe();

        expect(await screen.findByText("That link does not point at a hub recipe."))
            .toBeTruthy();
        expect(mockFetchHubDetail).not.toHaveBeenCalled();
    });

    it("saves this one recipe", async () => {
        await renderHubRecipe();
        await screen.findByLabelText("Save recipe");
        await fireEvent.press(screen.getByLabelText("Save recipe"));

        await waitFor(() => expect(mockSave).toHaveBeenCalledWith([expectedRow()]));
    });

    it("says so when the save failed rather than going quiet", async () => {
        mockSave.mockResolvedValue({
            saved: 0,
            alreadyHeld: 0,
            failed: ["Peach Orchard"],
            refused: false
        });

        await renderHubRecipe();
        await screen.findByLabelText("Save recipe");
        await fireEvent.press(screen.getByLabelText("Save recipe"));

        await waitFor(() => expect(mockNotify).toHaveBeenCalled());
        expect(mockNotify.mock.calls[0][0]).toEqual({
            tone: "error",
            message: "Could not save Peach Orchard."
        });
        expect(mockBack).not.toHaveBeenCalled();
    });

    it("goes back once it has landed", async () => {
        await renderHubRecipe();
        await screen.findByLabelText("Save recipe");
        await fireEvent.press(screen.getByLabelText("Save recipe"));

        await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    });

    it("does not set state after unmounting an aborted request", async () => {
        const aborts: AbortSignal[] = [];
        mockFetchHubDetail.mockImplementation((_id, signal: AbortSignal) => {
            aborts.push(signal);
            return new Promise(() => {});
        });

        const rendered = await renderWithProviders(<HubRecipeScreen />);
        await act(async () => {
            rendered.unmount();
        });

        expect(aborts[0].aborted).toBe(true);
    });
});

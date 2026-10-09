import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";
import {renderWithProviders} from "@/test-utils/render";
import {coffee} from "@/library/slots/__tests__/fixtures";
import {emptySlotRecord} from "@/library/slots/slotModel";
import EasyModeScreen from "@/app/easyMode";

const mockAllRecipes = [coffee("Whole library recipe")];
const mockRecord = emptySlotRecord();
let mockParams: {recipeJSON?: string} = {};
jest.mock("expo-router", () => ({
    useLocalSearchParams: () => mockParams,
    router: {push: jest.fn(), back: jest.fn(), canGoBack: () => true},
    useRouter: () => ({back: jest.fn()})
}));
jest.mock("@/hooks/useMachine", () => ({
    useMachine: () => ({
        remembered: "one", status: "connected", machine: {info: {serial: "serial"}}
    })
}));
jest.mock("@/hooks/useEasyModeSlots", () => ({
    ...jest.requireActual("@/hooks/useEasyModeSlots"),
    useEasyModeSlots: () => ({
        record: mockRecord, error: null, running: false,
        available: false, assign: jest.fn(), write: jest.fn(), recover: jest.fn()
    })
}));
jest.mock("@/hooks/useRecipeLibrary", () => ({
    useRecipeLibrary: () => ({allRecipes: () => mockAllRecipes})
}));

beforeEach(() => { mockParams = {}; });

it("renders the canonical route with its own header and production block", async () => {
    await renderWithProviders(<EasyModeScreen/>);
    expect(screen.getByRole("header", {name: /Easy Mode/i})).toBeOnTheScreen();
    expect(screen.getByText(/shared machine transport/i)).toBeOnTheScreen();
});

it("shows invalid incoming route data explicitly instead of seeding an invented recipe", async () => {
    mockParams = {recipeJSON: "{bad"};
    await renderWithProviders(<EasyModeScreen/>);
    expect(screen.getByText(/Incoming recipe could not be opened/i)).toBeOnTheScreen();
    expect(screen.queryByText(/Choose a slot for/i)).toBeNull();
});

it.each(["uuid", "grindRPM", "grinder", "cupType", "bypassEnabled"])("refuses incoming recipes missing %s instead of inventing defaults", async (field) => {
    const json = JSON.parse(JSON.stringify(mockAllRecipes[0]));
    delete json[field];
    mockParams = {recipeJSON: JSON.stringify(json)};
    await renderWithProviders(<EasyModeScreen/>);
    expect(screen.getByText(/Incoming recipe could not be opened/i)).toBeOnTheScreen();
});

it("hides the route header and pinned action from screen readers while the picker is open", async () => {
    await renderWithProviders(<EasyModeScreen/>);
    await fireEvent.press(screen.getByRole("button", {name: "Change slot A recipe"}));
    expect(screen.queryByRole("header", {name: /Easy Mode/i})).toBeNull();
    expect(screen.queryByRole("button", {name: "Write all three slots"})).toBeNull();
    expect(await screen.findByRole("button", {name: "Choose Whole library recipe"})).toBeOnTheScreen();
});

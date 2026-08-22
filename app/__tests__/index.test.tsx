import React from "react";
import {screen, fireEvent} from "@testing-library/react-native";

import HomeScreen from "@/app/index";
import Recipe from "@/library/Recipe";
import {renderWithProviders} from "@/test-utils/render";
import {Settings, type SettingsStorage} from "@/library/Settings";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
    useRouter:      () => ({push: mockPush}),
    useNavigation:  () => ({setOptions: jest.fn()}),
    useFocusEffect: jest.fn()
}));

jest.mock("expo-share-intent", () => ({
    useShareIntentContext: () => ({
        hasShareIntent:   false,
        shareIntent:      {},
        resetShareIntent: jest.fn()
    })
}));

jest.mock("@/library/RecipeDatabase");

// react-native-nfc-manager reaches for a NativeEventEmitter that does not
// exist under jest, and throws merely by being imported — so an automock
// (which still evaluates the real module to learn its shape) is not enough.
// None of these tests exercise the read path, so a plain stub suffices.
jest.mock("@/library/NFC", () => ({
    __esModule:    true,
    default:       jest.fn().mockImplementation(() => ({
        getIsClosed: jest.fn(() => true),
        close:       jest.fn(),
        readCard:    jest.fn()
    })),
    setNfcAlertIOS: jest.fn()
}));

function memoryStorage(): SettingsStorage {
    const values = new Map<string, string>();
    return {
        read:  (key) => values.get(key) ?? null,
        write: (key, value) => {
            values.set(key, value);
        }
    };
}

function named(name: string): Recipe {
    const r = new Recipe();
    r.name = name;
    return r;
}

function store(recipes: Recipe[]) {
    return {
        retrieveAllRecipes: jest.fn(() => (recipes.length > 0 ? recipes : null)),
        deleteRecipe:       jest.fn(),
        cloneRecipe:        jest.fn()
    };
}

beforeEach(() => mockPush.mockClear());

describe("HomeScreen", () => {
    it("lists the saved recipes as cards", async () => {
        await renderWithProviders(<HomeScreen db={store([named("Ethiopia"), named("Kenya")])} settings={new Settings(memoryStorage())}/>);
        expect(screen.getAllByTestId("recipe-card")).toHaveLength(2);
    });

    it("counts them in the title", async () => {
        await renderWithProviders(<HomeScreen db={store([named("Ethiopia"), named("Kenya")])} settings={new Settings(memoryStorage())}/>);
        expect(screen.getByText("2")).toBeTruthy();
    });

    it("shows the empty state instead of the list when there is nothing saved", async () => {
        await renderWithProviders(<HomeScreen db={store([])} settings={new Settings(memoryStorage())}/>);
        expect(screen.getByText("No recipes yet")).toBeTruthy();
        expect(screen.queryByTestId("recipe-card")).toBeNull();
    });

    it("keeps both actions available when the library is empty", async () => {
        // The empty state replaces the list only. If the tiles vanished with it,
        // a new user would see an app with nothing to do.
        await renderWithProviders(<HomeScreen db={store([])} settings={new Settings(memoryStorage())}/>);
        expect(screen.getByLabelText("Read a card")).toBeTruthy();
        expect(screen.getByLabelText("Import a recipe")).toBeTruthy();
    });

    it("opens a recipe when its card is pressed", async () => {
        await renderWithProviders(<HomeScreen db={store([named("Ethiopia")])} settings={new Settings(memoryStorage())}/>);
        await fireEvent.press(screen.getByTestId("recipe-card"));
        expect(mockPush).toHaveBeenCalledWith(
            expect.objectContaining({pathname: "/editRecipe"})
        );
    });

    it("opens settings from the header", async () => {
        await renderWithProviders(<HomeScreen db={store([])} settings={new Settings(memoryStorage())}/>);
        await fireEvent.press(screen.getByLabelText("Settings"));
        expect(mockPush).toHaveBeenCalledWith("/settings");
    });

    it("reveals the row actions when editing is turned on", async () => {
        await renderWithProviders(<HomeScreen db={store([named("Ethiopia")])} settings={new Settings(memoryStorage())}/>);
        expect(screen.queryByTestId("recipe-card-delete")).toBeNull();

        await fireEvent.press(screen.getByLabelText("Edit recipes"));

        expect(screen.getByTestId("recipe-card-delete")).toBeTruthy();
    });

    it("offers no edit toggle with an empty library", async () => {
        await renderWithProviders(<HomeScreen db={store([])} settings={new Settings(memoryStorage())}/>);
        expect(screen.queryByLabelText("Edit recipes")).toBeNull();
    });
});

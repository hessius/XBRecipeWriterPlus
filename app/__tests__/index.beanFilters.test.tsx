import React from "react";
import {AccessibilityInfo} from "react-native";
import {act, fireEvent, screen, waitFor, within} from "@testing-library/react-native";

import HomeScreen from "@/app/index";
import Recipe from "@/library/Recipe";
import {beanFilterId, parseBeanFilterId} from "@/library/beanFilters";
import type {ProfileField} from "@/library/beanProfile";
import type {LibraryQuery} from "@/library/libraryQuery";
import type {SettingsStorage} from "@/library/Settings";
import {Settings} from "@/library/Settings";
import {renderWithProviders} from "@/test-utils/render";

const mockPush = jest.fn();

jest.mock("expo-router", () => {
    const actualReact = jest.requireActual("react");
    return {
        useRouter:     () => ({push: mockPush}),
        useNavigation: () => ({setOptions: jest.fn()}),
        useFocusEffect: (cb: () => void) => {
            actualReact.useEffect(() => {
                cb();
            }, [cb]);
        }
    };
});

let mockShareIntentState: {
    hasShareIntent:   boolean;
    shareIntent:      Record<string, unknown>;
    resetShareIntent: jest.Mock;
};

jest.mock("expo-share-intent", () => ({
    useShareIntentContext: () => mockShareIntentState
}));

jest.mock("@/library/RecipeDatabase");
jest.mock("@/library/XBloomRecipe", () => ({
    XBloomRecipe: jest.fn().mockImplementation(() => ({
        fetchRecipeDetail: jest.fn(),
        getImageURL:       () => "",
        getName:           () => "Imported",
        getSubtitle:       () => "",
        getRecipe:         () => undefined
    }))
}));
jest.mock("expo-clipboard", () => ({
    hasStringAsync:         jest.fn(async () => false),
    getStringAsync:         jest.fn(async () => ""),
    isPasteButtonAvailable: false,
    ClipboardPasteButton:   () => null
}));
jest.mock("@/components/XbrwToast", () => ({
    notify: jest.fn()
}));
jest.mock("@/hooks/useShareRecipe", () => ({
    ...jest.requireActual("@/hooks/useShareRecipe"),
    useShareRecipe: () => ({
        state:        {status: "idle"},
        share:        jest.fn(),
        dismissError: jest.fn()
    })
}));
jest.mock("@/hooks/useMachine", () => ({
    __esModule: true,
    useMachine: () => ({
        machine: {
            get info() { return null; },
            isConnected:     () => false,
            onLink:          () => () => undefined,
            askHowItIsDoing: jest.fn(async () => false)
        },
        status:     "disconnected",
        error:      null,
        remembered: "",
        connect:    jest.fn(),
        forget:     jest.fn()
    })
}));
jest.mock("@/hooks/useLiveBrew", () => ({
    __esModule:  true,
    useLiveBrew: () => ({
        run:     null,
        start:   jest.fn(),
        dismiss: jest.fn(),
        watch:   () => () => {},
        brew:    jest.fn(),
        error:   null
    })
}));
jest.mock("@/library/NFC", () => ({
    __esModule: true,
    default:    jest.fn().mockImplementation(() => ({
        getIsClosed:  jest.fn(() => true),
        wasCancelled: jest.fn(() => false),
        close:        jest.fn(),
        cancel:       jest.fn(),
        readCard:     jest.fn()
    })),
    setNfcAlertIOS: jest.fn()
}));

let mockBeanVocabulary = [
    {field: "process" as ProfileField, value: "Natural", recipes: 1}
];

jest.mock("@/library/BrewDatabase", () => ({
    __esModule: true,
    default:    jest.fn().mockImplementation(() => ({
        beanVocabulary: () => mockBeanVocabulary
    }))
}));

function memoryStorage(raw: Record<string, unknown> = {}): SettingsStorage {
    const values = new Map<string, string>(
        Object.entries(raw).map(([key, value]) => [key, JSON.stringify(value)])
    );
    return {
        read:  (key) => values.get(key) ?? null,
        write: (key, value) => {
            values.set(key, value);
        }
    };
}

function named(name: string): Recipe {
    const recipe = new Recipe();
    recipe.name = name;
    return recipe;
}

function id(field: ProfileField, value: string, rated = false): string {
    return beanFilterId({field, value, rated});
}

function store(recipes: Recipe[]) {
    function queried(query: LibraryQuery): Recipe[] {
        let result = recipes;
        const term = query.search.trim().toLocaleLowerCase();
        if (term.length > 0) {
            result = result.filter((recipe) =>
                recipe.displayName().toLocaleLowerCase().includes(term)
            );
        }
        for (const filter of query.filters) {
            const bean = parseBeanFilterId(filter);
            if (bean !== null && bean.field === "process" && bean.value === "Natural") {
                result = result.filter((recipe) => recipe.displayName().includes("Natural"));
            }
        }
        return result;
    }

    return {
        queryRecipes:         jest.fn((query: LibraryQuery) => queried(query)),
        retrieveAllRecipes:   jest.fn(() => recipes),
        countRecipes:         jest.fn(() => recipes.length),
        countRecipesByFilter: jest.fn((ids: readonly string[]) =>
            Object.fromEntries(ids.map((filter) => [filter, 0]))
        ),
        countRecipesByTag:    jest.fn(() => []),
        countRecipesByAuthor: jest.fn(() => []),
        shelfMembers:         jest.fn(() => ({})),
        deleteRecipe:         jest.fn(),
        cloneRecipe:          jest.fn(),
        updateRecipe:         jest.fn()
    };
}

async function settleSheet(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

async function pressOnSheet(label: string, landed: () => boolean): Promise<void> {
    await waitFor(async () => {
        await fireEvent.press(screen.getByLabelText(label));
        expect(landed()).toBe(true);
    });
}

async function openBeanSheet(database = store([
    named("Natural Ethiopia"),
    named("Washed Kenya")
])) {
    await renderWithProviders(
        <HomeScreen db={database} settings={new Settings(memoryStorage())}/>
    );
    await fireEvent.press(screen.getByLabelText("No filters applied. Tap to show the filter row."));
    await fireEvent.press(screen.getByTestId("rail-filter-picker:beans"));
    await settleSheet();
    return database;
}

describe("HomeScreen bean filters", () => {
    beforeEach(() => {
        mockPush.mockClear();
        mockBeanVocabulary = [
            {field: "process", value: "Natural", recipes: 1}
        ];
        mockShareIntentState = {
            hasShareIntent:   false,
            shareIntent:      {},
            resetShareIntent: jest.fn()
        };
        jest.spyOn(AccessibilityInfo, "isScreenReaderEnabled").mockResolvedValue(false);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("renders the BEANS chip in the rail with a caret", async () => {
        await renderWithProviders(
            <HomeScreen
                db={store([named("Natural Ethiopia"), named("Washed Kenya")])}
                settings={new Settings(memoryStorage())}/>
        );

        await fireEvent.press(screen.getByLabelText("No filters applied. Tap to show the filter row."));

        const chip = screen.getByTestId("rail-filter-picker:beans");
        expect(chip).toHaveTextContent("BEANS");
        expect(within(chip).getByTestId("rail-chip-caret")).toBeTruthy();
    });

    it("opens the sheet instead of applying a filter and covers the screen", async () => {
        const database = await openBeanSheet();

        expect(screen.getByText("Average 4★ or better.")).toBeTruthy();
        expect(database.queryRecipes).toHaveBeenLastCalledWith(
            expect.objectContaining({filters: []}),
            expect.any(Function)
        );
        expect(screen.queryByLabelText("Settings")).toBeNull();
        expect(screen.queryByLabelText("Settings", {includeHiddenElements: true}))
            .toBeTruthy();
    });

    it("applies a chosen value, narrows the library, and keeps removable chips", async () => {
        await openBeanSheet();

        await pressOnSheet("Natural, 1 recipe", () =>
            screen.getByTestId(
                `rail-filter-${id("process", "Natural")}`,
                {includeHiddenElements: true}
            ) !== null
        );
        await fireEvent.press(screen.getByLabelText("Close"));
        await waitFor(() => expect(screen.getByLabelText("Settings")).toBeTruthy());

        expect(screen.getAllByTestId("recipe-card")).toHaveLength(1);
        expect(screen.getByText("Natural Ethiopia")).toBeTruthy();
        expect(screen.queryByText("Washed Kenya")).toBeNull();
        expect(screen.getByTestId("rail-filter-picker:beans")).toBeTruthy();
        expect(screen.getByTestId(`rail-filter-${id("process", "Natural")}`))
            .toHaveTextContent("NATURAL");
        expect(screen.getByTestId("rail-filter-row")).toBeTruthy();

        await fireEvent.press(screen.getByTestId(`rail-filter-${id("process", "Natural")}`));

        expect(screen.getAllByTestId("recipe-card")).toHaveLength(2);
        await waitFor(() =>
            expect(screen.queryByText("Average 4★ or better.")).toBeNull()
        );
        expect(screen.getByLabelText("No filters applied. Tap to show the filter row."))
            .toBeTruthy();
    });

    it("clear drops bean filters with the other transient narrowing", async () => {
        await openBeanSheet();
        await pressOnSheet("Natural, 1 recipe", () =>
            screen.getByTestId(
                `rail-filter-${id("process", "Natural")}`,
                {includeHiddenElements: true}
            ) !== null
        );
        await fireEvent.press(screen.getByLabelText("Close"));
        await waitFor(() => expect(screen.getByLabelText("Settings")).toBeTruthy());

        await fireEvent.press(screen.getByTestId("rail-search"));
        await fireEvent.changeText(screen.getByTestId("rail-search-input"), "missing");

        await waitFor(() => expect(screen.getByText("NO MATCHES")).toBeTruthy());

        await fireEvent.press(screen.getByLabelText("Clear search and filters"));

        expect(screen.getAllByTestId("recipe-card")).toHaveLength(2);
        expect(screen.queryByTestId(`rail-filter-${id("process", "Natural")}`)).toBeNull();
    });
});

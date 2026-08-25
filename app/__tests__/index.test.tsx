import React from "react";
import {screen, fireEvent, waitFor} from "@testing-library/react-native";

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
        fetchRecipeDetail: jest.fn().mockResolvedValue(undefined),
        getImageURL:       jest.fn(() => ""),
        getName:           jest.fn(() => "Imported"),
        getSubtitle:       jest.fn(() => ""),
        getRecipe:         jest.fn()
    }))
}));

const mockNotify = jest.fn();

// The reference is deliberately inside a function rather than returned
// directly: `jest.mock` is hoisted above the `const`, so a factory that reads
// `mockNotify` while building the module object reads it in the temporal dead
// zone. The resulting ReferenceError is swallowed by the read path's own catch
// and simply looks like the button doing nothing.
jest.mock("@/components/XbrwToast", () => ({
    notify: (notice: unknown) => mockNotify(notice)
}));

// react-native-nfc-manager reaches for a NativeEventEmitter that does not
// exist under jest, and throws merely by being imported — so an automock
// (which still evaluates the real module to learn its shape) is not enough.
// The read-path tests below drive `Recipe.readCard` directly rather than this
// stub, so it only has to exist and report a closed session.
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

beforeEach(() => {
    mockPush.mockClear();
    mockShareIntentState = {
        hasShareIntent:   false,
        shareIntent:      {},
        resetShareIntent: jest.fn()
    };
});

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

    it("keeps both actions visible when the library is empty", async () => {
        // The empty state replaces the list only. If the tiles vanished with it,
        // a new user would see an app with nothing to do.
        await renderWithProviders(<HomeScreen db={store([])} settings={new Settings(memoryStorage())}/>);
        expect(screen.getByLabelText("Read a card")).toBeTruthy();
        expect(screen.getByLabelText("Import a recipe")).toBeTruthy();
    });

    it("shows import as unavailable rather than pretending it works", async () => {
        // ImportRecipeComponent is a preview-and-confirm sheet for an id it is
        // handed; it has no field to type one into, and only ever opened from a
        // share intent. Until sub-project 5 gives it a way in, a tile that
        // silently does nothing when pressed is worse than one that says so.
        await renderWithProviders(<HomeScreen db={store([])} settings={new Settings(memoryStorage())}/>);
        const tile = screen.getByLabelText("Import a recipe");

        expect(tile.props.accessibilityState.disabled).toBe(true);

        // Still there, still saying IMPORT, and pressing it goes nowhere.
        await fireEvent.press(tile);
        expect(screen.getByText("IMPORT")).toBeTruthy();
        expect(mockPush).not.toHaveBeenCalled();
    });

    it("opens a recipe when its card is pressed", async () => {
        await renderWithProviders(<HomeScreen db={store([named("Ethiopia")])} settings={new Settings(memoryStorage())}/>);
        await fireEvent.press(screen.getByTestId("recipe-card"));
        // The row measures the card before it navigates, so the push lands a
        // beat after the press rather than on it.
        await waitFor(() => expect(mockPush).toHaveBeenCalledWith(
            expect.objectContaining({pathname: "/editRecipe"})
        ));
    });

    it("opens settings from the header", async () => {
        await renderWithProviders(<HomeScreen db={store([])} settings={new Settings(memoryStorage())}/>);
        await fireEvent.press(screen.getByLabelText("Settings"));
        expect(mockPush).toHaveBeenCalledWith("/settings");
    });

    it("reveals the row actions when editing is turned on", async () => {
        await renderWithProviders(<HomeScreen db={store([named("Ethiopia")])} settings={new Settings(memoryStorage())}/>);
        // Hidden elements are included on purpose: the glyph is hidden from the
        // accessibility tree, so a bare query would report it absent whether it
        // had been rendered or not -- and the first assertion would then pass
        // for the wrong reason.
        const deleteGlyph = () =>
            screen.queryByTestId("recipe-card-delete", {includeHiddenElements: true});

        expect(deleteGlyph()).toBeNull();

        await fireEvent.press(screen.getByLabelText("Edit recipes"));

        expect(deleteGlyph()).toBeTruthy();
    });

    describe("after a card is read", () => {
        // The recipe's own uuid is deliberately kept: a card read builds a new
        // recipe and fills it from the bytes, so it arrives with an identity of
        // its own. Copying the source uuid across would make `findDuplicate`
        // skip the stored copy as the candidate itself.
        function readAs(recipe: Recipe) {
            jest.spyOn(Recipe.prototype, "readCard").mockImplementation(
                async function (this: Recipe) {
                    const {uuid} = this;
                    Object.assign(this, recipe, {uuid});
                    return true;
                }
            );
        }

        it("says nothing and opens the recipe", async () => {
            readAs(named("Ethiopia"));
            await renderWithProviders(
                <HomeScreen db={store([])} settings={new Settings(memoryStorage())}/>
            );

            await fireEvent.press(screen.getByLabelText("Read a card"));

            // The editor opens on top of the list, which is the confirmation.
            // A toast saying the same thing is a second notification of an
            // event the user is already looking at.
            await waitFor(() => expect(mockPush).toHaveBeenCalled());
            expect(mockNotify).not.toHaveBeenCalled();
        });

        it("still explains itself when the recipe is already saved", async () => {
            const saved = named("Ethiopia");
            readAs(saved);
            await renderWithProviders(
                <HomeScreen db={store([saved])} settings={new Settings(memoryStorage())}/>
            );

            await fireEvent.press(screen.getByLabelText("Read a card"));

            // This one is not redundant: it is the only account of why the
            // editor has arrived with its save button disabled.
            await waitFor(() => expect(mockNotify).toHaveBeenCalledWith(
                expect.objectContaining({tone: "info"})
            ));
        });
    });

    it("offers no edit toggle with an empty library", async () => {
        await renderWithProviders(<HomeScreen db={store([])} settings={new Settings(memoryStorage())}/>);
        expect(screen.queryByLabelText("Edit recipes")).toBeNull();
    });

    it("takes the screen out of the reader's reach while the import dialog is open", async () => {
        // The import dialog is a Dialog+Sheet modal, but Tamagui's portal is a
        // host-tree portal rather than a native Modal, so Android gets no
        // isolation from it -- the screen behind it must hide its own subtree.
        // It is opened the only way it can be: through a share intent.
        mockShareIntentState = {
            hasShareIntent:   true,
            shareIntent:      {type: "weburl", webUrl: "https://xbloom.com/?id=abc123"},
            resetShareIntent: jest.fn()
        };
        await renderWithProviders(
            <HomeScreen db={store([named("Ethiopia")])} settings={new Settings(memoryStorage())}/>
        );

        // The header button behind the dialog is unreachable to the screen
        // reader...
        await waitFor(() => expect(screen.queryByLabelText("Settings")).toBeNull());
        // ...but still in the tree: it is hidden, not unmounted.
        expect(screen.queryByLabelText("Settings", {includeHiddenElements: true})).toBeTruthy();
    });
});

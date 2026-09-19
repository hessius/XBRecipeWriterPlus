import React from "react";
import {AccessibilityInfo, BackHandler} from "react-native";
import {act, screen, fireEvent, waitFor, within} from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";

import HomeScreen, {EDITOR_PUSH_GUARD_MS} from "@/app/index";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import Pour, {POUR_PATTERN} from "@/library/Pour";
import {XBloomRecipe} from "@/library/XBloomRecipe";
import {renderWithProviders} from "@/test-utils/render";
import {resolveLibraryFilter, tagFromFilterId} from "@/library/libraryFilters";
import type {LibraryQuery} from "@/library/libraryQuery";
import {Settings, type SettingsStorage} from "@/library/Settings";
import {CARD_READ_FAILED} from "@/constants/copy";
import {TYPING_DEBOUNCE_MS} from "@/constants/motion";

const mockPush = jest.fn();

// Bumped by a test to make the home screen's `useFocusEffect` callback re-run,
// standing in for the screen regaining focus (the user returning from the
// editor). It is part of the mock effect's dependency list, so incrementing it
// and re-rendering makes React itself re-invoke the focus callback -- calling a
// captured, compiler-memoised callback by hand does not run its body.
let mockFocusEpoch = 0;

jest.mock("expo-router", () => {
    const actualReact = jest.requireActual("react");
    return {
        useRouter:     () => ({push: mockPush}),
        useNavigation: () => ({setOptions: jest.fn()}),
        // Mirror expo-router closely enough for these tests: run the focus
        // callback on mount (mount is the first focus) and again whenever
        // `mockFocusEpoch` changes, which a test uses to simulate a refocus.
        useFocusEffect: (cb: () => void) => {
            const epoch = mockFocusEpoch;
            actualReact.useEffect(() => {
                cb();
            }, [cb, epoch]);
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

// Configurable so a test can leave a lookup in flight (a never-resolving
// `fetchRecipeDetail` holds the sheet in its resolving state) or hand back a
// real recipe (`getRecipe`) to exercise the de-duplication reveal. The
// `mock`-prefixed names are the only ones `jest.mock`'s hoist lets a factory
// reach out to.
let mockFetchRecipeDetail: () => Promise<void> = () => Promise.resolve();
let mockGetRecipe: () => Recipe | undefined = () => undefined;

jest.mock("@/library/XBloomRecipe", () => ({
    XBloomRecipe: jest.fn().mockImplementation(() => ({
        fetchRecipeDetail: () => mockFetchRecipeDetail(),
        getImageURL:       () => "",
        getName:           () => "Imported",
        getSubtitle:       () => "",
        getRecipe:         () => mockGetRecipe()
    }))
}));

// The import tile samples the clipboard on mount. Under jest, and off iOS 16,
// paste mode never engages, so the tile is a plain button -- but the module
// must still exist and answer the presence check. `isPasteButtonAvailable` and
// `hasStringAsync` are flipped per-test to reach the disguised-paste path, and
// the control stashes its `onPress` so a test can drive a chosen payload.
let mockNativePasteOnPress: ((data: unknown) => void) | undefined;

jest.mock("expo-clipboard", () => ({
    hasStringAsync:         jest.fn(async () => false),
    getStringAsync:         jest.fn(async () => ""),
    isPasteButtonAvailable: false,
    ClipboardPasteButton:   ({onPress, ...rest}: {onPress?: (data: unknown) => void}) => {
        const {Pressable} = jest.requireActual("react-native");
        mockNativePasteOnPress = onPress;
        return <Pressable {...rest}/>;
    }
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

// The share hook is faked so a test can put it in a failed state without a
// network round trip. The real module is spread through: the failure copy has
// to be the genuine `SHARE_FAILURE_MESSAGE`, or the toast assertion would only
// prove this file agrees with itself.
let mockShareState: {status: "idle"} | {status: "failed"; reason: string} = {status: "idle"};
jest.mock("@/hooks/useShareRecipe", () => ({
    ...jest.requireActual("@/hooks/useShareRecipe"),
    useShareRecipe: () => ({
        state:        mockShareState,
        share:        jest.fn(),
        dismissError: jest.fn()
    })
}));

// The machine hook transitively imports the BLE transport — a native module
// that throws at load under Jest. Only the disconnected-or-paired state matters
// for screen tests, so the hook is stubbed here, the same way it is in
// settings.test.tsx.
let mockRemembered = "";
let mockMachineStatus = "disconnected";
let mockMachineInfo: {
    waterEnough: boolean;
    waterFeed?: "tank" | "tap";
    mode: "PRO" | "EASY";
    grindSize: number;
} | null = null;

const mockOnLink = jest.fn((_listener: () => void) => () => undefined);
const mockAskHowItIsDoing = jest.fn(async () => false);

jest.mock("@/hooks/useMachine", () => ({
    __esModule:   true,
    useMachine:   () => ({
        machine:    {
            get info()   { return mockMachineInfo; },
            isConnected:     () => false,
            onLink:          (listener: () => void) => mockOnLink(listener),
            askHowItIsDoing: () => mockAskHowItIsDoing()
        },
        status:     mockMachineStatus,
        error:      null,
        remembered: mockRemembered,
        connect:    jest.fn(),
        forget:     jest.fn()
    })
}));

// The provider that owns a running brew lives above the navigator, so a screen
// test never mounts it. Stubbed here so a test can put a brew in flight and
// check what the BREW capsule does while the machine is occupied.
let mockLiveRun: Record<string, unknown> | null = null;

/** A run snapshot complete enough for the mini bar to draw. */
function liveRun(recipe: Recipe, phase: string): Record<string, unknown> {
    return {
        recipe, phase: {name: phase}, samples: [], elapsed: 0, stageElapsed: 0,
        activeIndex: 0, holding: false, heldSeconds: 0
    };
}

jest.mock("@/hooks/useLiveBrew", () => ({
    __esModule:  true,
    useLiveBrew: () => ({
        run:     mockLiveRun,
        start:   jest.fn(),
        dismiss: jest.fn(),
        watch: () => () => {},
        brew:    jest.fn(),
        error:   null
    })
}));

// react-native-nfc-manager reaches for a NativeEventEmitter that does not
// exist under jest, and throws merely by being imported — so an automock
// (which still evaluates the real module to learn its shape) is not enough.
// The read-path tests below drive `Recipe.readCard` directly rather than this
// stub, so it only has to exist and report a closed session.
jest.mock("@/library/NFC", () => ({
    __esModule:    true,
    default:       jest.fn().mockImplementation(() => ({
        getIsClosed:  jest.fn(() => true),
        wasCancelled: jest.fn(() => false),
        close:        jest.fn(),
        cancel:       jest.fn(),
        readCard:     jest.fn()
    })),
    setNfcAlertIOS: jest.fn()
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
    const r = new Recipe();
    r.name = name;
    return r;
}

function tea(name: string): Recipe {
    const r = named(name);
    r.cupType = CUP_TYPE.TEA;
    return r;
}

/**
 * A recipe a card can actually hold: named, dosed, and balanced.
 *
 * The plain `named` fixture has no stages, which `cardWriteProblems` rejects,
 * and the tray's WRITE tile is dimmed on anything it rejects.
 */
function writable(name: string): Recipe {
    const r = named(name);
    r.cupType = CUP_TYPE.XPOD;
    r.dosage = 15;
    r.ratio = 15;
    r.grindSize = 60;
    r.grindRPM = 90;
    r.pours = [new Pour(0, 225, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0)];
    return r;
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
        if (query.filters.includes("tea")) {
            result = result.filter((recipe) => recipe.isTea());
        }
        // The tag shelves, standing in for the EXISTS over recipe_tags.
        for (const id of query.filters) {
            const tag = tagFromFilterId(id);
            if (tag === null) continue;
            result = result.filter((recipe) => (recipe.tags ?? []).includes(tag));
        }
        result = [...result].sort((a, b) =>
            a.displayName().localeCompare(b.displayName())
        );
        if (query.favouritesFirst) {
            result.sort((a, b) => Number(b.favourite) - Number(a.favourite));
        }
        return result;
    }

    return {
        // Stands in for the SQL name-ascending default. Not identical to the old
        // JavaScript sort this screen used to run: the query orders by `sortName
        // COLLATE NOCASE`, which folds only ASCII case, so accented names land
        // differently and unnamed recipes sink to the bottom. That divergence is
        // exercised where the query is built; here the fixtures are plain ASCII
        // names, so a localeCompare stands in for the visible order faithfully
        // enough to lay the screen out.
        queryRecipes: jest.fn((query: LibraryQuery) => queried(query)),
        retrieveAllRecipes: jest.fn(() => recipes),
        countRecipes: jest.fn(() => recipes.length),
        countRecipesByFilter: jest.fn((ids: readonly string[]) =>
            Object.fromEntries(ids.map((id) => [
                id,
                id === "tea" ? recipes.filter((recipe) => recipe.isTea()).length : 0
            ]))
        ),
        countRecipesByTag: jest.fn(() => {
            const counts = new Map<string, number>();
            for (const recipe of recipes) {
                for (const tag of recipe.tags ?? []) {
                    counts.set(tag, (counts.get(tag) ?? 0) + 1);
                }
            }
            return [...counts].map(([tag, count]) => ({tag, count}));
        }),
        deleteRecipe: jest.fn(),
        cloneRecipe:  jest.fn(),
        updateRecipe: jest.fn()
    };
}

beforeEach(() => {
    mockPush.mockClear();
    mockNotify.mockClear();
    mockShareState = {status: "idle"};
    (XBloomRecipe as unknown as jest.Mock).mockClear();
    mockFetchRecipeDetail = () => Promise.resolve();
    mockGetRecipe = () => undefined;
    mockNativePasteOnPress = undefined;
    mockFocusEpoch = 0;
    mockRemembered = "";
    mockMachineStatus = "disconnected";
    mockMachineInfo = null;
    mockLiveRun = null;
    mockOnLink.mockClear();
    mockAskHowItIsDoing.mockClear();
    (Clipboard.isPasteButtonAvailable as unknown as boolean) = false;
    (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, "isScreenReaderEnabled").mockResolvedValue(false);
    mockShareIntentState = {
        hasShareIntent:   false,
        shareIntent:      {},
        resetShareIntent: jest.fn()
    };
});

afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
});

/**
 * Render the home screen the way every import test needs it.
 *
 * A share intent is a module-level stub read on mount, so it is set before the
 * render rather than passed as a prop.
 */
async function renderHome(
    options: {
        shareIntent?: Record<string, unknown>;
        recipes?: Recipe[];
        settings?: Settings;
    } = {}
) {
    if (options.shareIntent) {
        mockShareIntentState = {
            hasShareIntent:   true,
            shareIntent:      options.shareIntent,
            resetShareIntent: jest.fn()
        };
    }
    return renderWithProviders(
        <HomeScreen
            db={store(options.recipes ?? [])}
            settings={options.settings ?? new Settings(memoryStorage())}/>
    );
}

describe("HomeScreen", () => {
    it("lists the saved recipes as cards", async () => {
        await renderWithProviders(<HomeScreen db={store([named("Ethiopia"), named("Kenya")])} settings={new Settings(memoryStorage())}/>);
        expect(screen.getAllByTestId("recipe-card")).toHaveLength(2);
    });

    it("counts them in the title", async () => {
        await renderWithProviders(<HomeScreen db={store([named("Ethiopia"), named("Kenya")])} settings={new Settings(memoryStorage())}/>);
        expect(screen.getByText("2")).toBeTruthy();
    });

    it("runs the list through queryRecipes with the query and the filter resolver", async () => {
        // The list is only the recipes queryRecipes returns, so the query the
        // screen hands down is the whole feature. A mock that returned a fixed
        // array regardless of its arguments let a reviewer swap the real query
        // for a different one with every test still green -- the gap the wiring
        // task would then fall straight into. This pins both arguments: the
        // whole-library default the screen passes today, and the resolver that
        // turns filter ids into WHERE fragments.
        const db = store([named("Ethiopia")]);
        await renderWithProviders(<HomeScreen db={db} settings={new Settings(memoryStorage())}/>);
        expect(db.queryRecipes).toHaveBeenCalledWith(
            {search: "", filters: [], sort: "name", direction: "asc", favouritesFirst: false},
            resolveLibraryFilter
        );
    });

    it("shows the empty state instead of the list when there is nothing saved", async () => {
        await renderWithProviders(<HomeScreen db={store([])} settings={new Settings(memoryStorage())}/>);
        expect(screen.getByText("NO RECIPES YET")).toBeTruthy();
        expect(screen.queryByTestId("recipe-card")).toBeNull();
    });

    it("does not draw the rail when the whole library is empty", async () => {
        await renderWithProviders(<HomeScreen db={store([])} settings={new Settings(memoryStorage())}/>);
        expect(screen.queryByTestId("library-rail")).toBeNull();
        expect(screen.getByText("NO RECIPES YET")).toBeTruthy();
    });

    it("keeps the header count on the whole library when a search matches nothing", async () => {
        // The count beside the wordmark says how many recipes you have, not how
        // many survived the last search. Reading it off the queried list makes
        // it read 0 over a library of three, which is the one number on this
        // screen a user would take as a report that something was lost.
        jest.useFakeTimers();
        await renderHome({recipes: [named("Ethiopia"), named("Kenya"), named("Yirgacheffe")]});

        await fireEvent.press(screen.getByTestId("rail-search"));
        await act(async () => {
            await fireEvent.changeText(screen.getByTestId("rail-search-input"), "zzz");
            jest.advanceTimersByTime(TYPING_DEBOUNCE_MS);
        });

        expect(screen.queryByTestId("recipe-card")).toBeNull();
        expect(screen.getByTestId("home-title-count")).toHaveTextContent("3");
        jest.useRealTimers();
    });

    it("draws favourites and all recipes headings only when both sections have recipes", async () => {
        const favourite = named("Ethiopia");
        favourite.favourite = true;
        await renderHome({
            recipes:  [favourite, named("Kenya")],
            settings: new Settings(memoryStorage({libraryFavouritesFirst: true}))
        });

        expect(screen.getByText("FAVOURITES")).toBeTruthy();
        expect(screen.getByText("ALL RECIPES")).toBeTruthy();
    });

    it("draws no section heading when favourites first leaves only one populated section", async () => {
        await renderHome({
            recipes:  [named("Ethiopia"), named("Kenya")],
            settings: new Settings(memoryStorage({libraryFavouritesFirst: true}))
        });

        expect(screen.queryByText("FAVOURITES")).toBeNull();
        expect(screen.queryByText("ALL RECIPES")).toBeNull();
        expect(screen.getAllByTestId("recipe-card")).toHaveLength(2);
    });

    it("draws no section heading when every visible recipe is a favourite", async () => {
        const ethiopia = named("Ethiopia");
        ethiopia.favourite = true;
        const kenya = named("Kenya");
        kenya.favourite = true;

        await renderHome({
            recipes:  [ethiopia, kenya],
            settings: new Settings(memoryStorage({libraryFavouritesFirst: true}))
        });

        expect(screen.queryByText("FAVOURITES")).toBeNull();
        expect(screen.queryByText("ALL RECIPES")).toBeNull();
        expect(screen.getAllByTestId("recipe-card")).toHaveLength(2);
    });

    it("draws no section heading when favourites first is off", async () => {
        const favourite = named("Ethiopia");
        favourite.favourite = true;

        await renderHome({
            recipes:  [favourite, named("Kenya")],
            settings: new Settings(memoryStorage({libraryFavouritesFirst: false}))
        });

        expect(screen.queryByText("FAVOURITES")).toBeNull();
        expect(screen.queryByText("ALL RECIPES")).toBeNull();
        expect(screen.getAllByTestId("recipe-card")).toHaveLength(2);
    });

    it("separates an empty query result from an empty library and can clear it", async () => {
        jest.useFakeTimers();
        await renderHome({
            recipes: [
                tea("Sencha"),
                tea("Oolong"),
                tea("Jasmine"),
                tea("Hibiscus"),
                named("Kenya")
            ]
        });

        await fireEvent.press(screen.getByLabelText("No filters applied. Tap to show the filter row."));
        await fireEvent.press(screen.getByTestId("rail-filter-tea"));
        await fireEvent.press(screen.getByTestId("rail-search"));
        await fireEvent.changeText(screen.getByTestId("rail-search-input"), "missing");
        await act(async () => { jest.advanceTimersByTime(600); });

        expect(screen.queryByText("NO RECIPES YET")).toBeNull();
        expect(screen.getByText("NO MATCHES")).toBeTruthy();
        expect(screen.getByText("missing")).toBeTruthy();
        expect(screen.getAllByText("TEA").length).toBeGreaterThan(1);
        expect(screen.queryByTestId("recipe-card")).toBeNull();

        await fireEvent.press(screen.getByLabelText("Clear search and filters"));

        expect(screen.getAllByTestId("recipe-card")).toHaveLength(5);
        jest.useRealTimers();
    });

    it("keeps both actions visible when the library is empty", async () => {
        // The empty state replaces the list only. If the tiles vanished with it,
        // a new user would see an app with nothing to do.
        await renderWithProviders(<HomeScreen db={store([])} settings={new Settings(memoryStorage())}/>);
        expect(screen.getByLabelText("Read a card")).toBeTruthy();
        expect(screen.getByLabelText("Import a recipe")).toBeTruthy();
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

        it("tells the user when the card cannot be read", async () => {
            // The user's report: a scan that succeeds at the NFC layer but whose
            // bytes cannot be parsed used to close the overlay and then say
            // nothing at all. A parse failure now throws out of `readCard` and
            // reaches the screen, which reports it.
            jest.spyOn(Recipe.prototype, "readCard").mockRejectedValue(
                new Error("Error reading card: bypass card")
            );
            await renderWithProviders(
                <HomeScreen db={store([])} settings={new Settings(memoryStorage())}/>
            );

            await fireEvent.press(screen.getByLabelText("Read a card"));

            await waitFor(() => expect(mockNotify).toHaveBeenCalledWith(
                expect.objectContaining({tone: "error", message: CARD_READ_FAILED})
            ));
        });

        it("says nothing when the user cancels the scan", async () => {
            // A cancelled read returns false, which is the one thing it can now
            // mean: the fix routes real failures through a throw instead. So a
            // false result is silence, correctly.
            jest.spyOn(Recipe.prototype, "readCard").mockResolvedValue(false);
            await renderWithProviders(
                <HomeScreen db={store([])} settings={new Settings(memoryStorage())}/>
            );

            await fireEvent.press(screen.getByLabelText("Read a card"));

            await waitFor(() => expect(Recipe.prototype.readCard).toHaveBeenCalled());
            expect(mockNotify).not.toHaveBeenCalled();
            expect(mockPush).not.toHaveBeenCalled();
        });
    });

    it("offers no edit toggle with an empty library", async () => {
        await renderWithProviders(<HomeScreen db={store([])} settings={new Settings(memoryStorage())}/>);
        expect(screen.queryByLabelText("Edit recipes")).toBeNull();
    });

    it("takes the screen out of the reader's reach while the import sheet is open", async () => {
        // The import sheet is a non-modal Tamagui sheet: it renders as a sibling
        // of this screen rather than through a native Modal, so Android gets no
        // isolation from it -- the screen behind it must hide its own subtree.
        // A share intent opens it without any interaction.
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

    it("takes the screen out of the reader's reach while the sort sheet is open", async () => {
        // The fourth sheet on this screen, and the one that was missed: like the
        // import sheet and the chooser it is a non-modal Tamagui sheet, so its
        // own `accessibilityViewIsModal` isolates nothing on Android and the
        // screen behind it has to hide its own subtree. Unlike those two it is
        // opened from the rail, which is inside the subtree being guarded.
        await renderWithProviders(
            <HomeScreen db={store([named("Ethiopia"), named("Kenya")])}
                        settings={new Settings(memoryStorage())}/>
        );
        await fireEvent.press(await screen.findByLabelText(/^Sort/));

        await waitFor(() => expect(screen.queryByLabelText("Settings")).toBeNull());
        expect(screen.queryByLabelText("Settings", {includeHiddenElements: true})).toBeTruthy();
    });

    describe("the accent a recipe is edited under", () => {
        it("is settled before the editor sees it", async () => {
            // The editor is pushed with the recipe serialised, and a recipe is only
            // written to the table on SAVE. Without an index assigned here, the
            // editor draws a uuid-hash colour and the library row later draws the
            // least-used one -- so the colour the user edited under is not the
            // colour they then have to find in the list.
            const unsaved = named("Ethiopia");
            expect(unsaved.accentIndex).toBeUndefined();

            await renderWithProviders(
                <HomeScreen db={store([unsaved])} settings={new Settings(memoryStorage())}/>
            );
            await fireEvent.press(await screen.findByLabelText(/^Ethiopia,/));

            await waitFor(() => expect(mockPush).toHaveBeenCalled());

            const pushed = JSON.parse(mockPush.mock.calls[0][0].params.recipeJSON);
            expect(typeof pushed.accentIndex).toBe("number");
        });

        it("does not move for a recipe that already has one", async () => {
            // Re-assigning here would repaint a saved recipe every time it was
            // opened. `assignAccent` keeps a valid index, which is what makes it
            // safe to call on every route into the editor.
            const saved = named("Kenya");
            saved.accentIndex = 5;

            await renderWithProviders(
                <HomeScreen db={store([saved])} settings={new Settings(memoryStorage())}/>
            );
            await fireEvent.press(await screen.findByLabelText(/^Kenya,/));

            await waitFor(() => expect(mockPush).toHaveBeenCalled());

            const pushed = JSON.parse(mockPush.mock.calls[0][0].params.recipeJSON);
            expect(pushed.accentIndex).toBe(5);
        });

        it("gives a second recipe the next free colour, not the one the first one took", async () => {
            const first = named("Ethiopia");
            first.accentIndex = 0;
            const second = named("Kenya");

            await renderWithProviders(
                <HomeScreen db={store([first, second])} settings={new Settings(memoryStorage())}/>
            );
            await fireEvent.press(await screen.findByLabelText(/^Kenya,/));

            await waitFor(() => expect(mockPush).toHaveBeenCalled());

            const pushed = JSON.parse(mockPush.mock.calls[0][0].params.recipeJSON);
            expect(pushed.accentIndex).toBe(1);
        });
    });
});

describe("import", () => {
    /** Put the tile into its iOS disguised-paste mode and wait for the control. */
    async function renderPasteMode() {
        (Clipboard.isPasteButtonAvailable as unknown as boolean) = true;
        (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(true);
        await renderHome();
        await waitFor(() => expect(mockNativePasteOnPress).toBeDefined());
    }

    it("opens the sheet from the tile", async () => {
        await renderHome();

        await fireEvent.press(await screen.findByLabelText("Import a recipe"));

        expect(await screen.findByLabelText("Share link or pod code")).toBeTruthy();
    });

    it("opens the sheet already resolving when a share intent arrives", async () => {
        // A share intent carries an id and nothing to type. It is the atomic
        // case: it resolves and navigates without asking. The sheet still opens
        // so that a share into a slow network is acknowledged rather than
        // appearing to do nothing. The lookup is held in flight so the resolving
        // state is the one on screen.
        mockFetchRecipeDetail = () => new Promise<void>(() => {});
        await renderHome({
            shareIntent: {type: "weburl", webUrl: "https://share-h5.xbloom.com/r?id=abc123"}
        });

        expect(await screen.findByTestId("import-resolving")).toBeTruthy();
        expect(screen.queryByLabelText("Share link or pod code")).toBeNull();
    });

    it("ignores a shared URL that is not an xBloom link", async () => {
        await renderHome({shareIntent: {type: "weburl", webUrl: "https://example.com/"}});

        // The stricter parse is the whole point: a non-xBloom URL must be
        // dropped without a lookup. Asserting only that the resolving row and
        // the field are absent cannot see that -- with the default mock an
        // *accepted* URL resolves to the error state, which shows neither
        // element either, so the test would pass just as well for a URL that
        // was looked up and failed. Pin it to the two things that only an
        // ignored URL produces: nothing was ever constructed to look it up...
        expect(XBloomRecipe).not.toHaveBeenCalled();
        // ...and the sheet never opened, so the screen behind stays reachable
        // (a covered screen hides its own subtree, including this button).
        expect(screen.getByLabelText("Settings")).toBeTruthy();
        // The original assertions, now backed by the two above rather than
        // standing in for them.
        expect(screen.queryByTestId("import-resolving")).toBeNull();
        expect(screen.queryByLabelText("Share link or pod code")).toBeNull();
    });

    it("closes the sheet when an atomic import opens the recipe", async () => {
        // After a share intent resolves atomically it navigates to the editor,
        // and the sheet must close behind it -- otherwise it is still open on
        // top of the list when the editor is dismissed. The covered screen
        // hides its own subtree, so the header becoming reachable again is the
        // observable proof that the sheet closed.
        mockGetRecipe = () => new Recipe();
        await renderHome({
            shareIntent: {type: "weburl", webUrl: "https://share-h5.xbloom.com/r?id=abc123"}
        });

        await waitFor(() => expect(mockPush).toHaveBeenCalled());
        await waitFor(() => expect(screen.getByLabelText("Settings")).toBeTruthy());
    });

    it("says nothing when a fresh import opens a recipe", async () => {
        // The de-duplication toast belongs only to a match. A first-time import
        // opens the editor, which is confirmation enough; a "Already in your
        // library" toast on a recipe that is *not* already there would be a lie.
        mockGetRecipe = () => new Recipe();
        await renderHome({
            shareIntent: {type: "weburl", webUrl: "https://share-h5.xbloom.com/r?id=abc123"}
        });

        await waitFor(() => expect(mockPush).toHaveBeenCalled());
        expect(mockNotify).not.toHaveBeenCalled();
    });

    it("disarms the share intent so it cannot fire again", async () => {
        // A share intent must be reset once consumed, or the next render that
        // reads it re-opens the sheet unprompted -- the guard the deleted
        // ImportRecipeComponent suite carried as "does not re-open unprompted".
        mockFetchRecipeDetail = () => new Promise<void>(() => {});
        await renderHome({
            shareIntent: {type: "weburl", webUrl: "https://share-h5.xbloom.com/r?id=abc123"}
        });

        await waitFor(() => expect(mockShareIntentState.resetShareIntent).toHaveBeenCalled());
        // And the intent is consumed exactly once: a second lookup would mean
        // the effect re-fired on a re-render instead of on the intent alone.
        expect(XBloomRecipe).toHaveBeenCalledTimes(1);
    });

    it("imports once when a redelivery follows the reset it caused", async () => {
        // The device sequence the previous guard missed. Handling a share calls
        // `resetShareIntent`, which drives `hasShareIntent` false; the library
        // then redelivers the *same* payload -- a fresh `refreshShareIntent`, a
        // foreground `resetOnBackground` -- and it goes true again. No user
        // returned to this screen in between (the editor is opening on top), so
        // it must import once, not push a second editor. The old guard cleared
        // itself on that interim false and re-imported; this pins that it does
        // not any more.
        mockFetchRecipeDetail = () => new Promise<void>(() => {});
        const db = store([]);
        const settings = new Settings(memoryStorage());
        const intent = {type: "weburl", webUrl: "https://share-h5.xbloom.com/r?id=abc123"};
        mockShareIntentState = {
            hasShareIntent: true, shareIntent: intent, resetShareIntent: jest.fn()
        };
        const {rerender} = await renderWithProviders(
            <HomeScreen db={db} settings={settings}/>
        );
        await waitFor(() => expect(XBloomRecipe).toHaveBeenCalledTimes(1));

        // The reset we call after handling drives the intent false -- the exact
        // interim state the old guard forgot the payload on.
        mockShareIntentState = {
            hasShareIntent: false, shareIntent: {}, resetShareIntent: jest.fn()
        };
        await act(async () => {
            rerender(<HomeScreen db={db} settings={settings}/>);
        });

        // The library hands the same payload back. The user has not returned
        // here, so the guard still holds and nothing is imported again.
        mockShareIntentState = {
            hasShareIntent: true, shareIntent: intent, resetShareIntent: jest.fn()
        };
        await act(async () => {
            rerender(<HomeScreen db={db} settings={settings}/>);
        });

        expect(XBloomRecipe).toHaveBeenCalledTimes(1);
    });

    it("imports again when the same link is shared after returning here", async () => {
        // The guard must not be permanent. Sharing the same link again is a
        // fresh deliberate act -- but only once the user has come back to this
        // screen from the editor the first import opened. That return, a focus
        // regain, is what clears the guard; without it this sequence is
        // byte-identical to the redelivery above, which must be ignored. The
        // divergence between the two tests is exactly that one focus event.
        mockFetchRecipeDetail = () => new Promise<void>(() => {});
        const db = store([]);
        const settings = new Settings(memoryStorage());
        const url = "https://share-h5.xbloom.com/r?id=abc123";
        mockShareIntentState = {
            hasShareIntent: true, shareIntent: {type: "weburl", webUrl: url},
            resetShareIntent: jest.fn()
        };
        const {rerender} = await renderWithProviders(
            <HomeScreen db={db} settings={settings}/>
        );
        await waitFor(() => expect(XBloomRecipe).toHaveBeenCalledTimes(1));

        // The intent clears, as it does once consumed.
        mockShareIntentState = {
            hasShareIntent: false, shareIntent: {}, resetShareIntent: jest.fn()
        };
        await act(async () => {
            rerender(<HomeScreen db={db} settings={settings}/>);
        });

        // The user backs out of the editor and returns to the library: the
        // screen regains focus, the deliberate action that forgets the last
        // handled link.
        await act(async () => {
            mockFocusEpoch++;
            rerender(<HomeScreen db={db} settings={settings}/>);
        });

        // The same link arrives again, on purpose this time.
        mockShareIntentState = {
            hasShareIntent: true, shareIntent: {type: "weburl", webUrl: url},
            resetShareIntent: jest.fn()
        };
        await act(async () => {
            rerender(<HomeScreen db={db} settings={settings}/>);
        });

        await waitFor(() => expect(XBloomRecipe).toHaveBeenCalledTimes(2));
    });

    it("imports once when a dropped redelivery outlives the guard to a later focus", async () => {
        // The device sequence 4c610f7 deferred rather than fixed. A redelivery
        // is *dropped* by the guard, but the drop consumes nothing, so
        // `hasShareIntent` stays true with the same `webUrl` still live. No
        // `resetShareIntent`, no foreground -- nothing drives it false. Then the
        // user backs out to the library: the screen regains focus and the
        // `useFocusEffect` clears the guard while that unchanged intent is *still
        // live*. Keyed on the payload alone, the effect would re-import and stack
        // a second editor; keyed on the URL being a new delivery, the still-live
        // intent is the same one it already saw, so it stays put.
        mockFetchRecipeDetail = () => new Promise<void>(() => {});
        const db = store([]);
        const settings = new Settings(memoryStorage());
        const url = "https://share-h5.xbloom.com/r?id=abc123";
        mockShareIntentState = {
            hasShareIntent: true, shareIntent: {type: "weburl", webUrl: url},
            resetShareIntent: jest.fn()
        };
        const {rerender} = await renderWithProviders(
            <HomeScreen db={db} settings={settings}/>
        );
        await waitFor(() => expect(XBloomRecipe).toHaveBeenCalledTimes(1));

        // The redelivery: the same live intent handed back as a fresh object,
        // `useShareIntent` re-rendered (a new `resetShareIntent` identity), and
        // `hasShareIntent` never dips false. This is what the drop leaves behind.
        mockShareIntentState = {
            hasShareIntent: true, shareIntent: {type: "weburl", webUrl: url},
            resetShareIntent: jest.fn()
        };
        await act(async () => {
            rerender(<HomeScreen db={db} settings={settings}/>);
        });
        expect(XBloomRecipe).toHaveBeenCalledTimes(1);

        // The user returns to the library. Focus regains and clears the guard --
        // but the intent above is still live, handed back once more as the hook
        // re-renders. The old guard-only check re-imported here; the delivery
        // check does not, because the URL never went away.
        mockShareIntentState = {
            hasShareIntent: true, shareIntent: {type: "weburl", webUrl: url},
            resetShareIntent: jest.fn()
        };
        await act(async () => {
            mockFocusEpoch++;
            rerender(<HomeScreen db={db} settings={settings}/>);
        });

        expect(XBloomRecipe).toHaveBeenCalledTimes(1);
    });

    it("imports the same shared link again after a failed lookup, without leaving here", async () => {
        // A shared import that fails (network down) leaves the user on the
        // library with the sheet open and its intent already consumed -- home
        // never re-focuses to clear the guard. Re-sharing the same link to retry
        // must still land: an error has nothing left to guard, so the guard is
        // forgotten when the lookup fails, and the fresh delivery re-imports.
        mockFetchRecipeDetail = () => Promise.reject(new Error("network"));
        const db = store([]);
        const settings = new Settings(memoryStorage());
        const url = "https://share-h5.xbloom.com/r?id=abc123";
        mockShareIntentState = {
            hasShareIntent: true, shareIntent: {type: "weburl", webUrl: url},
            resetShareIntent: jest.fn()
        };
        const {rerender} = await renderWithProviders(
            <HomeScreen db={db} settings={settings}/>
        );
        await waitFor(() => expect(XBloomRecipe).toHaveBeenCalledTimes(1));
        // The lookup has failed and restored the field.
        await waitFor(() =>
            expect(screen.getByLabelText("Share link or pod code")).toBeTruthy()
        );

        // The intent clears, as it does once handled. No focus regain: the user
        // never left the library.
        mockShareIntentState = {
            hasShareIntent: false, shareIntent: {}, resetShareIntent: jest.fn()
        };
        await act(async () => {
            rerender(<HomeScreen db={db} settings={settings}/>);
        });

        // The user shares the same link again to retry.
        mockShareIntentState = {
            hasShareIntent: true, shareIntent: {type: "weburl", webUrl: url},
            resetShareIntent: jest.fn()
        };
        await act(async () => {
            rerender(<HomeScreen db={db} settings={settings}/>);
        });

        await waitFor(() => expect(XBloomRecipe).toHaveBeenCalledTimes(2));
    });

    it("resolves at once when a pasted value parses, with no field to type in", async () => {
        // The tile's paste shortcut is atomic input: a value that parses resolves
        // without asking and needs no field, exactly like a share intent.
        mockFetchRecipeDetail = () => new Promise<void>(() => {});
        await renderPasteMode();

        await act(async () => {
            mockNativePasteOnPress!({type: "text", text: "ETH120"});
        });

        expect(await screen.findByTestId("import-resolving")).toBeTruthy();
        expect(screen.queryByLabelText("Share link or pod code")).toBeNull();
    });

    it("opens a plain field when a pasted value does not parse", async () => {
        // The fallback the whole shortcut rests on: junk on the clipboard opens
        // the sheet exactly as a plain tap would, indistinguishable from one.
        await renderPasteMode();

        await act(async () => {
            mockNativePasteOnPress!({type: "text", text: "just a note"});
        });

        expect(await screen.findByLabelText("Share link or pod code")).toBeTruthy();
        expect(screen.queryByTestId("import-resolving")).toBeNull();
    });

    it("opens the editor when the shortcut resolves a recipe not yet held", async () => {
        // The tile's promise is one tap: a genuinely new recipe on the clipboard
        // navigates straight to the editor, exactly as a share intent would.
        mockGetRecipe = () => new Recipe();
        await renderPasteMode();

        await act(async () => {
            mockNativePasteOnPress!({type: "text", text: "ETH120"});
        });

        await waitFor(() => expect(mockPush).toHaveBeenCalled());
    });

    it("stops at the field when the shortcut resolves a recipe already held", async () => {
        // The sticky-clipboard trap: recipe A's link is still on the clipboard
        // after importing A, so tapping IMPORT resolves A again. The shortcut
        // must not re-open A -- it degrades to the found panel and restores the
        // field so a second recipe can be entered, which is what the tile is for.
        mockGetRecipe = () => new Recipe();
        (Clipboard.isPasteButtonAvailable as unknown as boolean) = true;
        (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(true);
        await renderHome({recipes: [named("Ethiopia")]});
        await waitFor(() => expect(mockNativePasteOnPress).toBeDefined());

        await act(async () => {
            mockNativePasteOnPress!({type: "text", text: "ETH120"});
        });

        // The field is drawn again so a different recipe can be typed...
        expect(await screen.findByLabelText("Share link or pod code")).toBeTruthy();
        // ...and A was never re-opened.
        expect(mockPush).not.toHaveBeenCalled();
    });

    it("resets the importer when the sheet is closed", async () => {
        // Fake timers because the sheet only becomes interactive on the
        // `requestAnimationFrame` that plays its entrance: pressing CLOSE before
        // that lands on a sheet that is in the tree but not yet accepting
        // touches, and the tap is silently dropped. Advance past it after each
        // sheet-opening step.
        //
        // Closing must abort an in-flight lookup, not merely hide it. Reopening
        // the sheet shows a clean field; without the reset the stale resolving
        // state would still be there.
        jest.useFakeTimers();
        mockFetchRecipeDetail = () => new Promise<void>(() => {});
        await renderHome({
            shareIntent: {type: "weburl", webUrl: "https://share-h5.xbloom.com/r?id=abc123"}
        });
        await act(async () => { jest.advanceTimersByTime(500); });
        expect(screen.getByTestId("import-resolving")).toBeTruthy();

        // The overflow sheet is still mounted through its exit grace, so there
        // are two closes in the tree; the name sheet's is the later one.
        await fireEvent.press(screen.getAllByLabelText("Close").at(-1)!);
        await act(async () => { jest.advanceTimersByTime(500); });

        await fireEvent.press(screen.getByLabelText("Import a recipe"));
        await act(async () => { jest.advanceTimersByTime(500); });

        expect(screen.getByLabelText("Share link or pod code")).toBeTruthy();
        expect(screen.queryByTestId("import-resolving")).toBeNull();
        jest.useRealTimers();
    });

    it("shows a clean sheet after a typed import opens a recipe", async () => {
        // The other close path: opening the found recipe navigates to the
        // editor, which never fires the sheet's `onOpenChange`. The reset must
        // still happen, or the next tile tap reopens onto the previous recipe's
        // found panel with its code still typed in.
        jest.useFakeTimers();
        mockGetRecipe = () => new Recipe();
        await renderHome();

        await fireEvent.press(screen.getByLabelText("Import a recipe"));
        await act(async () => { jest.advanceTimersByTime(500); });

        // One character at a time, so the heuristic reads typing rather than a
        // paste -- a bulk change navigates atomically and never raises the found
        // panel this path is about.
        const field = screen.getByLabelText("Share link or pod code");
        for (const text of ["E", "ET", "ETH", "ETH1", "ETH12", "ETH120"]) {
            await fireEvent.changeText(field, text);
        }
        // Past the 600ms debounce, so the deliberate lookup fires and resolves.
        await act(async () => { jest.advanceTimersByTime(600); });

        await fireEvent.press(screen.getByLabelText("Open Imported"));
        await act(async () => { jest.advanceTimersByTime(500); });
        expect(mockPush).toHaveBeenCalled();

        // Back from the editor, reopen from the tile: a clean field and no
        // lingering found panel from the recipe just opened.
        await fireEvent.press(screen.getByLabelText("Import a recipe"));
        await act(async () => { jest.advanceTimersByTime(500); });

        expect(screen.getByLabelText("Share link or pod code").props.value).toBe("");
        expect(screen.queryByLabelText("Open Imported")).toBeNull();
        jest.useRealTimers();
    });

    it("shows an empty field after an atomic paste into it opens a recipe", async () => {
        // The atomic-paste-in-field twin of the case above: a whole value typed
        // in one change is a paste, so it resolves and navigates on its own,
        // leaving `value` holding the pasted text. Reopening must not prefill
        // the field with it.
        jest.useFakeTimers();
        mockGetRecipe = () => new Recipe();
        await renderHome();

        await fireEvent.press(screen.getByLabelText("Import a recipe"));
        await act(async () => { jest.advanceTimersByTime(500); });

        await fireEvent.changeText(
            screen.getByLabelText("Share link or pod code"),
            "https://share-h5.xbloom.com/r?id=abc123"
        );
        await act(async () => { jest.advanceTimersByTime(500); });
        expect(mockPush).toHaveBeenCalled();

        await fireEvent.press(screen.getByLabelText("Import a recipe"));
        await act(async () => { jest.advanceTimersByTime(500); });

        expect(screen.getByLabelText("Share link or pod code").props.value).toBe("");
        jest.useRealTimers();
    });

    it("reloads the library when the sheet closes", async () => {
        // An import that saved a recipe reaches this list only on a reload, and
        // closing the sheet is that reload's trigger. The store's reader is
        // called once on mount (`useFocusEffect` is stubbed out here, so it does
        // not add a second); closing the sheet must call it again.
        jest.useFakeTimers();
        const db = store([named("Ethiopia")]);
        await renderWithProviders(
            <HomeScreen db={db} settings={new Settings(memoryStorage())}/>
        );
        const before = db.queryRecipes.mock.calls.length;

        await fireEvent.press(screen.getByLabelText("Import a recipe"));
        await act(async () => { jest.advanceTimersByTime(500); });

        // The overflow sheet is still mounted through its exit grace, so there
        // are two closes in the tree; the name sheet's is the later one.
        await fireEvent.press(screen.getAllByLabelText("Close").at(-1)!);
        await act(async () => { jest.advanceTimersByTime(500); });

        expect(db.queryRecipes.mock.calls.length).toBeGreaterThan(before);
        jest.useRealTimers();
    });

    it("says the recipe is already saved when the import matches one in the library", async () => {
        // De-duplication with a reveal: `resolveOnOpen` opens the stored copy
        // rather than making a second, and the toast is the only account of why.
        mockGetRecipe = () => new Recipe();
        await renderHome({
            shareIntent: {type: "weburl", webUrl: "https://share-h5.xbloom.com/r?id=abc123"},
            recipes:     [named("Ethiopia")]
        });

        await waitFor(() => expect(mockNotify).toHaveBeenCalledWith(
            expect.objectContaining({tone: "info", message: "Already in your library"})
        ));
    });
});

describe("HomeScreen, opening one editor at a time", () => {
    it("opens one editor when a recipe is tapped twice in a row", async () => {
        // A push is not instantaneous, so an impatient second tap lands while
        // the first editor is still on its way and would stack a second copy of
        // the same recipe on top of it -- two screens deep, both dismissable,
        // for one intention.
        await renderHome({recipes: [named("Ethiopia")]});
        const card = (await screen.findAllByTestId("recipe-card"))[0];

        await act(async () => {
            fireEvent.press(card);
            fireEvent.press(card);
        });

        expect(mockPush).toHaveBeenCalledTimes(1);
    });

    it("stops refusing on its own, so a push that never lands cannot wedge the library", async () => {
        // The refusal used to be cleared in exactly one place: this screen
        // regaining focus. If the push never opened anything -- the reported
        // symptom, a scan that looked like it worked and showed nothing --
        // focus was never lost, so it was never regained, so the flag stayed
        // set and every later scan returned silently. A refusal whose only
        // release is an event that may never arrive is a wedge waiting to
        // happen, whatever set it.
        jest.useFakeTimers();
        try {
            await renderHome({recipes: [named("Ethiopia")]});
            const card = (await screen.findAllByTestId("recipe-card"))[0];

            await act(async () => { fireEvent.press(card); });
            expect(mockPush).toHaveBeenCalledTimes(1);

            // No focus event: the editor never appeared.
            await act(async () => { jest.advanceTimersByTime(EDITOR_PUSH_GUARD_MS + 100); });
            await act(async () => { fireEvent.press(card); });

            expect(mockPush).toHaveBeenCalledTimes(2);
        } finally {
            jest.useRealTimers();
        }
    });

    it("opens the editor again once the user has come back from it", async () => {
        // The refusal lasts exactly as long as the journey it protects. Coming
        // back to the library ends that journey, and the next tap is a new one.
        const db = store([named("Ethiopia")]);
        const settings = new Settings(memoryStorage());
        const {rerender} = await renderWithProviders(
            <HomeScreen db={db} settings={settings}/>
        );
        await act(async () => {
            fireEvent.press((await screen.findAllByTestId("recipe-card"))[0]);
        });
        expect(mockPush).toHaveBeenCalledTimes(1);

        await act(async () => {
            mockFocusEpoch++;
            rerender(<HomeScreen db={db} settings={settings}/>);
        });
        await act(async () => {
            fireEvent.press((await screen.findAllByTestId("recipe-card"))[0]);
        });

        expect(mockPush).toHaveBeenCalledTimes(2);
    });

    it("says nothing about an import it refuses to open", async () => {
        // A recipe that arrives while an editor is already opening is dropped
        // whole. Announcing a recipe the user cannot see would be worse than
        // saying nothing: the toast would sit over the editor of a different
        // recipe entirely.
        mockGetRecipe = () => named("Ethiopia");
        const db = store([named("Ethiopia")]);
        const settings = new Settings(memoryStorage());
        const {rerender} = await renderWithProviders(
            <HomeScreen db={db} settings={settings}/>
        );
        await act(async () => {
            fireEvent.press((await screen.findAllByTestId("recipe-card"))[0]);
        });
        expect(mockPush).toHaveBeenCalledTimes(1);

        mockShareIntentState = {
            hasShareIntent: true,
            shareIntent:    {type: "weburl", webUrl: "https://share-h5.xbloom.com/r?id=abc123"},
            resetShareIntent: jest.fn()
        };
        await act(async () => {
            rerender(<HomeScreen db={db} settings={settings}/>);
        });
        await waitFor(() => expect(XBloomRecipe).toHaveBeenCalled());

        expect(mockPush).toHaveBeenCalledTimes(1);
        expect(mockNotify).not.toHaveBeenCalledWith(
            expect.objectContaining({message: "Already in your library"})
        );
    });

    it("opens one brew screen when the tray tile is tapped twice in a row", async () => {
        // Same race as the editor: the push is not instantaneous and a second
        // tap within the guard window would stack a second brew on top of the
        // first — one running, one waiting beneath it.
        mockRemembered = "machine-device-id";
        await renderHome({recipes: [named("Ethiopia")]});
        const brewTile = await screen.findByLabelText("Brew Ethiopia", {
            includeHiddenElements: true
        });

        await act(async () => {
            fireEvent.press(brewTile);
            fireEvent.press(brewTile);
        });

        expect(mockPush).toHaveBeenCalledTimes(1);
    });

    it("offers share and write in every row's action tray, brew only with a machine", async () => {
        // Share and write need no machine, so the action tray carries them
        // whatever is paired. Brew is the one act that needs hardware, and it
        // follows the no-dead-button rule.
        mockRemembered = "";
        await renderHome({recipes: [writable("Ethiopia")]});
        await screen.findByText("Ethiopia");

        expect(screen.getByLabelText("Share Ethiopia", {includeHiddenElements: true}))
            .toBeTruthy();
        expect(screen.getByLabelText("Write Ethiopia to a card", {includeHiddenElements: true}))
            .toBeTruthy();
        expect(screen.queryByLabelText("Brew Ethiopia", {includeHiddenElements: true}))
            .toBeNull();
    });

    it("reports a failed share from the action tray as a toast", async () => {
        // The tray shares recipes just as the editor does, so it owes the user
        // the same words when it cannot. Pinned as a literal: asserting against
        // the map the screen just read would pass however the copy was mangled.
        mockShareState = {status: "failed", reason: "limited"};
        await renderHome({recipes: [named("Ethiopia")]});
        await screen.findByText("Ethiopia");

        expect(mockNotify).toHaveBeenCalledWith({
            tone:    "error",
            message: "Sharing is busy right now. Try again in a few minutes."
        });
    });

    it("adds the brew tile to the action tray once a machine is paired", async () => {
        mockRemembered = "machine-device-id";
        await renderHome({recipes: [named("Ethiopia")]});
        await screen.findByText("Ethiopia");

        expect(screen.getByLabelText("Brew Ethiopia", {includeHiddenElements: true}))
            .toBeTruthy();
    });

    it("refuses a second recipe while the machine is still brewing", async () => {
        // There is one machine. Pushing the brew screen anyway would show the
        // recipe that is *already* brewing, which reads as the app having
        // started the wrong one.
        mockRemembered = "machine-device-id";
        const brewing = named("Ethiopia");
        const other = named("Colombia");
        mockLiveRun = liveRun(brewing, "pouring");
        await renderHome({recipes: [other]});

        await act(async () => {
            fireEvent.press(await screen.findByLabelText("Brew Colombia", {
                includeHiddenElements: true
            }));
        });

        expect(mockPush).not.toHaveBeenCalled();
        expect(mockNotify).toHaveBeenCalledWith({
            tone:    "info",
            message: "The machine is busy brewing Ethiopia."
        });
    });

    it("reopens the brew it is already running when that recipe is tapped", async () => {
        // Tapping BREW on the recipe in the machine is not a second brew, it
        // is asking to watch the one in progress.
        mockRemembered = "machine-device-id";
        const brewing = named("Ethiopia");
        mockLiveRun = liveRun(brewing, "pouring");
        await renderHome({recipes: [brewing]});

        await act(async () => {
            fireEvent.press(await screen.findByLabelText("Brew Ethiopia", {
                includeHiddenElements: true
            }));
        });

        expect(mockPush).toHaveBeenCalledTimes(1);
        expect(mockNotify).not.toHaveBeenCalled();
    });

    it("lets a new recipe be brewed once the last brew is over", async () => {
        mockRemembered = "machine-device-id";
        mockLiveRun = liveRun(named("Ethiopia"), "done");
        await renderHome({recipes: [named("Colombia")]});

        await act(async () => {
            fireEvent.press(await screen.findByLabelText("Brew Colombia", {
                includeHiddenElements: true
            }));
        });

        expect(mockPush).toHaveBeenCalledTimes(1);
    });

    it("shows the machine dot when a machine has been paired", async () => {
        // The dot is hidden until the user has paired a machine (remembered
        // !== ""), so a first-time user sees a clean header.
        mockRemembered = "machine-device-id";
        mockMachineStatus = "connected";
        await renderWithProviders(
            <HomeScreen db={store([])} settings={new Settings(memoryStorage())}/>
        );
        expect(screen.getByLabelText("Machine connected")).toBeTruthy();
    });

    it("hides the machine dot when no machine has been paired", async () => {
        mockRemembered = "";
        await renderWithProviders(
            <HomeScreen db={store([])} settings={new Settings(memoryStorage())}/>
        );
        expect(screen.queryByLabelText(/machine/i)).toBeNull();
    });

    it("shows vitals immediately when machine.info is set at mount (task 1: seeding)", async () => {
        // Before the fix, machineVitals was initialised to null regardless of
        // machine.info, so the popover showed "Not in range" even when the
        // machine was already connected when the screen mounted.
        mockRemembered = "machine-device-id";
        mockMachineStatus = "connected";
        mockMachineInfo = {waterEnough: true, mode: "PRO", grindSize: 62};

        await renderWithProviders(
            <HomeScreen db={store([])} settings={new Settings(memoryStorage())}/>
        );

        await fireEvent.press(screen.getByLabelText("Machine connected"));

        // Vitals seeded from machine.info, not waiting for an onLink event.
        expect(screen.getByText("WATER")).toBeTruthy();
        expect(screen.getByText("PRO")).toBeTruthy();
        expect(screen.getByText("62")).toBeTruthy();
    });

    it("keeps the reading's age fixed on refresh until the machine answers (task 8)", async () => {
        // The original bug reset the displayed age to the press moment via
        // setPopoverNow(Date.now()) in the refresh handler, so a press looked
        // like it had succeeded instantly even though the machine had not
        // answered. The age must come from the reading's askedAt, which only a
        // real answer moves — a press alone must leave it where it was.
        //
        // Date.now is spied rather than using fake timers: the sheet only
        // becomes pressable once its requestAnimationFrame has run, which fake
        // timers would freeze.
        const nowSpy = jest.spyOn(Date, "now");
        try {
            nowSpy.mockReturnValue(0); // mount → askedAt = 0
            mockRemembered = "machine-device-id";
            mockMachineStatus = "connected";
            mockMachineInfo = {waterEnough: true, mode: "PRO", grindSize: 62};
            mockAskHowItIsDoing.mockResolvedValue(false); // machine stays silent

            await renderWithProviders(
                <HomeScreen db={store([])} settings={new Settings(memoryStorage())}/>
            );

            nowSpy.mockReturnValue(4 * 60_000); // open at T = 4 min
            await fireEvent.press(screen.getByLabelText("Machine connected"));
            expect(screen.getByText("4 MIN AGO")).toBeTruthy();

            nowSpy.mockReturnValue(5 * 60_000); // a minute passes
            await act(async () => {
                await fireEvent.press(screen.getByTestId("machine-refresh"));
            });

            // The machine has not answered, so the reading is still 4 min old.
            // Under the bug this read "5 MIN AGO": the press reset the clock.
            expect(screen.getByText("4 MIN AGO")).toBeTruthy();
        } finally {
            nowSpy.mockRestore();
        }
    });

    it("renders the machine panel inside the header, below its row (task 9)", async () => {
        // The panel used to be a bottom sheet at screen root. It now extends
        // inline from the top toolbar: it is a child of the header's wrapper
        // (so it pushes the list down), but below the header row rather than
        // inside it.
        mockRemembered = "machine-device-id";
        mockMachineStatus = "connected";
        mockMachineInfo = {waterEnough: true, mode: "PRO", grindSize: 62};

        await renderWithProviders(
            <HomeScreen db={store([])} settings={new Settings(memoryStorage())}/>
        );

        await fireEvent.press(screen.getByLabelText("Machine connected"));

        // The panel's readings show, and they are inside the header's box...
        expect(screen.getByText("WATER")).toBeTruthy();
        const wrap = screen.getByTestId("home-header-inset");
        expect(within(wrap).getByText("WATER")).toBeTruthy();

        // ...but below the header row, not within it.
        const row = screen.getByTestId("home-header");
        expect(within(row).queryByText("WATER")).toBeNull();
    });

    it("closes the panel again when the machine dot is tapped twice (task 9)", async () => {
        // The dot is the only close control now, so it must toggle: a second
        // tap must take the panel back down, not leave it open.
        mockRemembered = "machine-device-id";
        mockMachineStatus = "connected";
        mockMachineInfo = {waterEnough: true, mode: "PRO", grindSize: 62};

        await renderWithProviders(
            <HomeScreen db={store([])} settings={new Settings(memoryStorage())}/>
        );

        await fireEvent.press(screen.getByLabelText("Machine connected"));
        expect(screen.getByText("WATER")).toBeTruthy();

        await fireEvent.press(screen.getByLabelText("Machine connected"));
        // Closed: Collapsible hides its subtree, so the readings are gone.
        expect(screen.queryByText("WATER")).toBeNull();
    });

    it("keeps the last snapshot after disconnect so 'last seen' is reachable (task 2)", async () => {
        // Before the fix, the onLink handler called setMachineVitals(null) on
        // disconnect, making the 'Last seen' branch in MachinePanel
        // unreachable — a disconnected machine always showed 'Not in range'.
        //
        // This test proves the seeded path works: if machine.info is non-null
        // at mount but status is "disconnected" (stale info surviving a drop),
        // the popover must show "Last seen" rather than "Not in range".
        mockRemembered = "machine-device-id";
        mockMachineStatus = "disconnected";
        mockMachineInfo = {waterEnough: true, mode: "PRO", grindSize: 62};

        await renderWithProviders(
            <HomeScreen db={store([])} settings={new Settings(memoryStorage())}/>
        );

        await fireEvent.press(screen.getByLabelText("Machine not in range"));

        // Vitals seeded from machine.info; status is disconnected, so the
        // popover must show "Last seen" rather than "Not in range".
        expect(screen.getByText(/last seen/i)).toBeTruthy();
        expect(screen.queryByText(/not in range/i)).toBeNull();
    });
});

describe("HomeScreen age timer", () => {
    // Counted the same way as useTraceAnimation.test.ts: spy, not getTimerCount,
    // because getTimerCount also counts the timers React keeps for itself.
    let started: {fn: () => void; ms: number}[];
    let stopped: number;

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
        mockRemembered = "machine-device-id";
        mockMachineStatus = "connected";
        mockMachineInfo = {waterEnough: true, mode: "PRO", grindSize: 62};
    });
    afterEach(() => {
        jest.restoreAllMocks();
        jest.useRealTimers();
    });

    it("starts a clock when the popover opens", async () => {
        await renderWithProviders(
            <HomeScreen db={store([])} settings={new Settings(memoryStorage())}/>
        );
        const before = started.length;
        await fireEvent.press(screen.getByLabelText("Machine connected"));
        // Exactly one new 25-second clock for the age.
        expect(started.length).toBe(before + 1);
        expect(started.at(-1)!.ms).toBe(25_000);
    });

    it("stops the clock on unmount so no timer is left running", async () => {
        // The timer is now in a route rather than a component. A setInterval in
        // a screen that is not cleaned up leaks across navigations.
        const {unmount} = await renderWithProviders(
            <HomeScreen db={store([])} settings={new Settings(memoryStorage())}/>
        );
        await fireEvent.press(screen.getByLabelText("Machine connected"));
        const stoppedBefore = stopped;
        await act(async () => { unmount(); });
        expect(stopped).toBeGreaterThan(stoppedBefore);
    });

    it("advances the label while the popover is open", async () => {
        // The interval callback calls setPopoverNow(Date.now()), which causes a
        // re-render with an updated `now` prop on MachinePanel. Seed the
        // vitals at T=0 by mounting at that time, open the popover at T=2min,
        // then fire the callback at T=3min and confirm the displayed age moved.
        jest.setSystemTime(new Date("2026-01-01T00:00:00Z")); // T = 0, askedAt = 0

        await renderWithProviders(
            <HomeScreen db={store([])} settings={new Settings(memoryStorage())}/>
        );

        jest.setSystemTime(new Date("2026-01-01T00:02:00Z")); // T = 2 min mark
        await fireEvent.press(screen.getByLabelText("Machine connected"));
        // popoverNow = 2 min, askedAt = 0 → age = 2 min.
        expect(screen.getByText("2 MIN AGO")).toBeTruthy();

        // The clock was started with a 25-second period.
        const ageClock = started.find((s) => s.ms === 25_000);
        expect(ageClock).toBeDefined();

        // Advance fake time by 1 more minute and fire the interval callback.
        jest.setSystemTime(new Date("2026-01-01T00:03:00Z")); // T = 3 min mark
        await act(async () => { ageClock!.fn(); }); // manual tick — mirrors what the real timer would do
        // popoverNow = Date.now() at 3-min mark, askedAt = 0 → age = 3 min.
        expect(screen.getByText("3 MIN AGO")).toBeTruthy();
    });
});

describe("writing a recipe from scratch", () => {
    function blankScreen() {
        return <HomeScreen db={store([])} settings={new Settings(memoryStorage())}/>;
    }

    it("offers a third way to get a recipe", async () => {
        await renderWithProviders(blankScreen());

        expect(screen.getByLabelText("Create a recipe")).toBeTruthy();
    });

    it("asks coffee or tea before opening the editor", async () => {
        // The editor hides the cup-type row on tea, so the beverage cannot be
        // changed later. Opening straight into a coffee recipe would be
        // offering a change the editor does not permit.
        await renderWithProviders(blankScreen());

        await fireEvent.press(screen.getByLabelText("Create a recipe"));

        expect(await screen.findByLabelText("New coffee recipe")).toBeTruthy();
        expect(mockPush).not.toHaveBeenCalled();
    });

    it("opens the editor on a blank coffee recipe", async () => {
        // Fake timers, and advance past the sheet's entrance before pressing a
        // door: XbrwSheet mounts the sheet closed and opens it on the next
        // `requestAnimationFrame`, so a door pressed before that frame lands on
        // a sheet that is in the tree but not yet accepting touches and the tap
        // is silently dropped -- the same reason the import tests advance here.
        jest.useFakeTimers();
        await renderWithProviders(blankScreen());

        await fireEvent.press(screen.getByLabelText("Create a recipe"));
        await act(async () => { jest.advanceTimersByTime(500); });
        await fireEvent.press(await screen.findByLabelText("New coffee recipe"));

        const pushed = JSON.parse(mockPush.mock.calls[0][0].params.recipeJSON);
        expect(pushed.cupType).toBe(CUP_TYPE.OMNI);
        expect(pushed.dosage).toBe(15);
        expect(pushed.ratio).toBe(16);
        expect(pushed.grindSize).toBe(65);
        expect(pushed.pours).toHaveLength(0);
        expect(pushed.source).toBe("manual");
        jest.useRealTimers();
    });

    it("opens the editor on a blank tea recipe", async () => {
        jest.useFakeTimers();
        await renderWithProviders(blankScreen());

        await fireEvent.press(screen.getByLabelText("Create a recipe"));
        await act(async () => { jest.advanceTimersByTime(500); });
        await fireEvent.press(await screen.findByLabelText("New tea recipe"));

        const pushed = JSON.parse(mockPush.mock.calls[0][0].params.recipeJSON);
        expect(pushed.cupType).toBe(CUP_TYPE.TEA);
        expect(pushed.dosage).toBe(5);
        jest.useRealTimers();
    });

    it("gives the new recipe a colour on the way in", async () => {
        jest.useFakeTimers();
        await renderWithProviders(blankScreen());

        await fireEvent.press(screen.getByLabelText("Create a recipe"));
        await act(async () => { jest.advanceTimersByTime(500); });
        await fireEvent.press(await screen.findByLabelText("New coffee recipe"));

        const pushed = JSON.parse(mockPush.mock.calls[0][0].params.recipeJSON);
        expect(typeof pushed.accentIndex).toBe("number");
        jest.useRealTimers();
    });

    it("takes the screen out of the reader's reach while the chooser is open", async () => {
        // NewRecipeSheet is a non-modal Tamagui sheet, exactly like ImportSheet:
        // it renders as a sibling of this screen rather than through a native
        // Modal, so Android gets no isolation from it and the screen behind must
        // hide its own subtree.
        await renderWithProviders(blankScreen());

        await fireEvent.press(screen.getByLabelText("Create a recipe"));

        // The header button behind the chooser is unreachable to the screen
        // reader...
        await waitFor(() => expect(screen.queryByLabelText("Settings")).toBeNull());
        // ...but still in the tree: it is hidden, not unmounted.
        expect(screen.queryByLabelText("Settings", {includeHiddenElements: true})).toBeTruthy();
    });

    it("closes the chooser once a beverage is taken", async () => {
        jest.useFakeTimers();
        await renderWithProviders(blankScreen());

        await fireEvent.press(screen.getByLabelText("Create a recipe"));
        await act(async () => { jest.advanceTimersByTime(500); });
        await fireEvent.press(await screen.findByLabelText("New coffee recipe"));

        // XbrwSheet keeps a dismissed sheet mounted through its EXIT_GRACE so it
        // can animate away; advance past it before asserting the door is gone.
        await act(async () => { jest.advanceTimersByTime(500); });
        expect(screen.queryByLabelText("New coffee recipe")).toBeNull();
        jest.useRealTimers();
    });
});

describe("the shelf grid", () => {
    function shelfLibrary(): Recipe[] {
        // Four teas, so the TEA auto shelf clears the floor of three, and a
        // tagged recipe so the manual half has something in it.
        const teas = ["Sencha", "Hojicha", "Genmaicha", "Matcha"].map((name) => {
            const recipe = named(name);
            recipe.cupType = CUP_TYPE.TEA;
            return recipe;
        });
        const tagged = named("Ethiopia");
        tagged.tags = ["morning"];
        return [...teas, tagged, named("Kenya"), named("Colombia")];
    }

    async function openGrid(recipes: Recipe[] = shelfLibrary()) {
        await renderHome({recipes});
        await fireEvent.press(screen.getByRole("tab", {name: "Shelves"}));
    }

    it("replaces the list with the grid", async () => {
        await openGrid();

        expect(screen.getByTestId("shelf-grid")).toBeTruthy();
        expect(screen.queryAllByTestId("recipe-card")).toHaveLength(0);
    });

    // Long press, then the footer. The whole loop through the screen, because
    // the grid only draws the answer and the screen is what remembers it.
    it("puts an auto shelf away and brings it back", async () => {
        await openGrid();

        await fireEvent(screen.getByTestId("shelf-tea"), "longPress");
        expect(screen.queryByTestId("shelf-tea")).toBeNull();
        expect(screen.getByText("1 HIDDEN")).toBeTruthy();

        await fireEvent.press(screen.getByTestId("shelf-show-tea"));
        expect(screen.getByTestId("shelf-tea")).toBeTruthy();
        expect(screen.queryByTestId("hidden-shelves")).toBeNull();
    });

    it("offers a shelf for a tag the user made", async () => {
        await openGrid();

        expect(screen.getByTestId("shelf-tag:morning")).toBeTruthy();
    });

    // Reversed in phase 4b. These two tests encoded the old behaviour, where a
    // tap on a shelf switched back to the list and applied a filter chip: on a
    // device that read as the app undoing the tap -- the squares vanished, the
    // list returned, and a chip was the only sign anything had happened, so the
    // tester rejected it. A shelf now opens into a room: the same shelf view,
    // the same rail, but the squares carry this shelf's recipes as tiles under
    // its name. The list does not return, and no recipe card is drawn.
    it("opens the tapped shelf into a room, staying in the shelf view", async () => {
        await openGrid();

        await fireEvent.press(screen.getByTestId("shelf-tag:morning"));

        // The grid is gone, but the room is not the list: it draws tiles, not
        // cards, and it names the shelf it opened.
        expect(screen.queryByTestId("shelf-grid")).toBeNull();
        expect(screen.queryAllByTestId("recipe-card")).toHaveLength(0);
        expect(screen.getByTestId("shelf-room")).toBeTruthy();
        expect(screen.getByTestId("shelf-room-title").props.children).toBe("morning");
        expect(screen.getAllByTestId("recipe-tile")).toHaveLength(1);
        expect(screen.getByText("Ethiopia")).toBeTruthy();
    });

    it("opens an auto shelf into a room the same way", async () => {
        await openGrid();

        await fireEvent.press(screen.getByTestId("shelf-tea"));

        expect(screen.queryByTestId("shelf-grid")).toBeNull();
        expect(screen.queryAllByTestId("recipe-card")).toHaveLength(0);
        expect(screen.getByTestId("shelf-room")).toBeTruthy();
        expect(screen.getAllByTestId("recipe-tile")).toHaveLength(4);
    });

    // A library with nothing to shelve gets the explanation, not an empty grid.
    it("explains itself rather than drawing nothing", async () => {
        await openGrid([named("Ethiopia"), named("Kenya")]);

        expect(screen.getByTestId("shelves-empty")).toBeTruthy();
    });
});

// The shelf room, added in phase 4b: a tap on a shelf opens it into itself
// rather than throwing the user back to the list. These pin the ways in and the
// ways out -- the back key, the view toggle, Android's hardware back -- and that
// the long press on a tile reaches the same actions a row reaches.
describe("the shelf room", () => {
    function morningLibrary(): Recipe[] {
        // One tagged recipe is enough to raise a manual shelf, and a manual
        // shelf is always drawn whatever its count, so the auto shelves being
        // suppressed here does not matter.
        const tagged = named("Ethiopia");
        tagged.tags = ["morning"];
        return [tagged, named("Kenya"), named("Colombia")];
    }

    async function openRoom(recipes: Recipe[] = morningLibrary()) {
        await renderHome({recipes});
        await fireEvent.press(screen.getByRole("tab", {name: "Shelves"}));
        await fireEvent.press(screen.getByTestId("shelf-tag:morning"));
    }

    it("returns to the grid when back is pressed, without leaving the shelf view",
        async () => {
            await openRoom();

            await fireEvent.press(screen.getByTestId("shelf-room-back"));

            // Back to the grid of shelves, not out to the list: the tag tile is
            // there again and no recipe card has appeared.
            expect(screen.getByTestId("shelf-grid")).toBeTruthy();
            expect(screen.queryByTestId("shelf-room")).toBeNull();
            expect(screen.queryAllByTestId("recipe-card")).toHaveLength(0);
        });

    it("leaves the room when the view is switched to the list", async () => {
        await openRoom();

        await fireEvent.press(screen.getByRole("tab", {name: "List"}));

        // The list is showing, and the room did not survive as a filter behind
        // it: every recipe in the library is listed, not just the shelf's one.
        expect(screen.queryByTestId("shelf-room")).toBeNull();
        expect(screen.getAllByTestId("recipe-card")).toHaveLength(3);
    });

    it("closes the room on Android hardware back before the screen", async () => {
        // The room registers a hardware-back handler while it is open; capture
        // it, then fire it by hand the way the OS would.
        const addSpy = jest.spyOn(BackHandler, "addEventListener");
        await openRoom();

        const registered = addSpy.mock.calls
            .filter(([event]) => event === "hardwareBackPress")
            .at(-1);
        expect(registered).toBeDefined();
        const handler = registered![1] as () => boolean;

        let consumed = false;
        await act(async () => {
            consumed = handler();
        });

        // The press was consumed -- the app handled it -- and it closed the
        // room rather than the screen.
        expect(consumed).toBe(true);
        expect(screen.queryByTestId("shelf-room")).toBeNull();
        expect(screen.getByTestId("shelf-grid")).toBeTruthy();
    });

    it("opens a recipe's actions from a long press on its tile", async () => {
        const [tagged] = morningLibrary();
        await openRoom([tagged, named("Kenya"), named("Colombia")]);

        await fireEvent(screen.getByTestId(`recipe-tile-${tagged.uuid}`), "longPress");

        // The shared sheet, with the library's own verbs on it.
        expect(await screen.findByLabelText("Delete")).toBeTruthy();
        expect(screen.getByLabelText("Share")).toBeTruthy();
        expect(screen.getByLabelText("Duplicate")).toBeTruthy();
    });

    // Two doors to one sheet is the design; two sheets that drift is the failure
    // this guards against. The set a tile's long press reaches must be the set a
    // row's long press reaches, for the same recipe.
    it("offers the same actions from a tile as from a row", async () => {
        // Fake timers so the sheet's open and its exit-grace close both land on
        // a tick we advance by hand, rather than racing a real animation timer:
        // reaching the rail for the second door depends on the first sheet
        // having actually gone, and that made a real-timer version of this
        // flake. The chooser tests drive XbrwSheet the same way.
        jest.useFakeTimers();

        // The candidates the library door can draw, plus the editor-only rows
        // that must never appear on it. Filtering the whole list to what is
        // actually present turns "same actions" into a comparison of two arrays.
        const candidates = [
            "Brew recipe", "Write recipe to card", "Share", "Duplicate",
            "Star recipe", "Remove star from recipe", "Brew history", "Delete",
            "Revert", "Refresh name from xBloom", "Show hints"
        ];
        function present(): string[] {
            return candidates.filter((label) => screen.queryByLabelText(label) !== null);
        }

        // A machine is remembered, so BREW is offered: the door has to carry it
        // on both sides or neither, and withholding it would make the comparison
        // trivially pass on a shorter list.
        mockRemembered = "AA:BB:CC:DD:EE:FF";
        const tagged = named("Ethiopia");
        tagged.tags = ["morning"];

        await renderHome({recipes: [tagged]});

        // Door one: the list row.
        await fireEvent(screen.getByTestId("recipe-card"), "longPress");
        await act(async () => { jest.advanceTimersByTime(500); });
        const fromRow = present();
        // The overflow sheet is still mounted through its exit grace, so there
        // are two closes in the tree; the name sheet's is the later one.
        await fireEvent.press(screen.getAllByLabelText("Close").at(-1)!);
        await act(async () => { jest.advanceTimersByTime(500); });

        // Door two: the shelf-room tile, for the same recipe.
        await fireEvent.press(screen.getByRole("tab", {name: "Shelves"}));
        await fireEvent.press(screen.getByTestId("shelf-tag:morning"));
        await fireEvent(screen.getByTestId(`recipe-tile-${tagged.uuid}`), "longPress");
        await act(async () => { jest.advanceTimersByTime(500); });
        const fromTile = present();

        expect(fromTile).toEqual(fromRow);
        // And it is a real set, not an empty one that would make equality
        // meaningless. Brew is on it because a machine is remembered.
        expect(fromTile).toContain("Brew recipe");
        expect(fromTile).toContain("Delete");
        // None of the editor's own rows leaked onto the library door.
        expect(fromTile).not.toContain("Revert");
        expect(fromTile).not.toContain("Show hints");

        jest.useRealTimers();
    });

    // The long press was the one door that offered a write on a recipe no card
    // can hold. The swipe tray and both sets of accessibility actions have
    // always gated it; an offer you can only discover is empty by taking it is
    // worse than no offer.
    it("withholds the write row on a recipe no card can hold", async () => {
        jest.useFakeTimers();
        await renderHome({recipes: [named("Ethiopia")]});

        await fireEvent(screen.getByTestId("recipe-card"), "longPress");
        await act(async () => { jest.advanceTimersByTime(500); });

        // The sheet is open, so this is not passing on an empty screen.
        expect(screen.queryByLabelText("Delete")).not.toBeNull();
        expect(screen.queryByLabelText("Write recipe to card")).toBeNull();
        jest.useRealTimers();
    });

    it("offers the write row on a recipe a card can hold", async () => {
        jest.useFakeTimers();
        await renderHome({recipes: [writable("Ethiopia")]});

        await fireEvent(screen.getByTestId("recipe-card"), "longPress");
        await act(async () => { jest.advanceTimersByTime(500); });

        expect(screen.queryByLabelText("Write recipe to card")).not.toBeNull();
        jest.useRealTimers();
    });
});

/**
 * Let a just-opened sheet finish arriving before it is touched.
 *
 * `XbrwSheet` slides in on the frame after it mounts, and a press dispatched
 * into that gap is dropped silently: the element is in the tree and findable,
 * so the test reads as if the button did nothing. The same helper is in
 * `app/__tests__/settings.test.tsx` for the same reason.
 */
async function settleSheet(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 60));
    });
}

describe("picking a shelf's members", () => {
    function pickerLibrary(): Recipe[] {
        const teas = ["Sencha", "Hojicha", "Genmaicha", "Matcha"].map((name) => {
            const recipe = named(name);
            recipe.cupType = CUP_TYPE.TEA;
            return recipe;
        });
        return [...teas, named("Kenya"), named("Colombia")];
    }

    /** Open a manual shelf's menu from its tile, and pick one of its rows. */
    async function shelfAction(tag: string, row: string) {
        await fireEvent.press(screen.getByTestId(`shelf-edit-tag:${tag}`));
        await settleSheet();
        await fireEvent.press(screen.getByTestId(`shelf-overflow-${row}`));
        await settleSheet();
    }

    async function startPicking(recipes: Recipe[] = pickerLibrary()) {
        const rendered = await renderHome({recipes});
        await fireEvent.press(screen.getByRole("tab", {name: "Shelves"}));
        await fireEvent.press(screen.getByTestId("new-shelf"));
        return rendered;
    }

    // A tick that does not stick is the one failure the user cannot see: the
    // row ticks, the sheet closes, and the recipe simply is not on the shelf.
    it("says so when a recipe is already on as many shelves as it can hold", async () => {
        const crowded = named("Kenya");
        crowded.setTags(Array.from({length: 20}, (unused, index) => `shelf${index}`));
        await startPicking([crowded]);

        await fireEvent.press(screen.getAllByRole("checkbox")[0]);
        await fireEvent.press(screen.getByTestId("shelf-picker-done"));
        await settleSheet();
        await fireEvent.changeText(screen.getByTestId("shelf-name-field"), "Mornings");
        await fireEvent.press(screen.getByTestId("shelf-name-confirm"));

        expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({
            tone:    "error",
            message: "One recipe is already on as many shelves as it can hold."
        }));
    });

    // A name that folds to a shelf that already exists cannot be allowed
    // through: `setShelfMembers` writes an exact membership, so naming a new
    // shelf "mornings" beside an existing "Mornings" would not raise a second
    // shelf, it would rewrite the first one to whatever happened to be ticked.
    it("refuses a name that folds to a shelf already there", async () => {
        const existing = named("Kenya");
        existing.setTags(["Mornings"]);
        await startPicking([existing, named("Colombia")]);

        await fireEvent.press(screen.getAllByRole("checkbox")[0]);
        await fireEvent.press(screen.getByTestId("shelf-picker-done"));
        await settleSheet();
        await fireEvent.changeText(screen.getByTestId("shelf-name-field"), "mornings");
        await fireEvent.press(screen.getByTestId("shelf-name-confirm"));

        expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({
            tone:    "error",
            message: "There is already a shelf called mornings."
        }));
        // Refused outright: the existing shelf keeps the members it had.
        expect(existing.tags).toEqual(["Mornings"]);
        // And the sheet keeps what was typed, so amending a near miss does not
        // mean typing the whole name again.
        expect(screen.getByTestId("shelf-name-field").props.value).toBe("mornings");
    });

    // Reporting the cap and returning left a user whose save had also been
    // refused by the database believing everything under the cap had landed.
    it("reports a refused save as well as the cap when both happened", async () => {
        const crowded = named("Kenya");
        crowded.setTags(Array.from({length: 20}, (unused, index) => `shelf${index}`));
        const refused = named("Colombia");
        const db = store([crowded, refused]);
        db.updateRecipe.mockImplementation(() => {
            throw new Error("disk full");
        });
        await renderWithProviders(
            <HomeScreen db={db} settings={new Settings(memoryStorage())}/>
        );
        await fireEvent.press(screen.getByRole("tab", {name: "Shelves"}));
        await fireEvent.press(screen.getByTestId("new-shelf"));

        const rows = screen.getAllByRole("checkbox");
        await fireEvent.press(rows[0]);
        await fireEvent.press(rows[1]);
        await fireEvent.press(screen.getByTestId("shelf-picker-done"));
        await settleSheet();
        await fireEvent.changeText(screen.getByTestId("shelf-name-field"), "Mornings");
        await fireEvent.press(screen.getByTestId("shelf-name-confirm"));

        expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({
            message: "One recipe is already on as many shelves as it can hold."
        }));
        expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({
            message: "Some recipes could not be saved."
        }));
    });

    // `screenCovered` guards the main stack, which ends above the bar, so the
    // bar stayed in the accessibility tree underneath the naming sheet. On
    // Android a sheet does not hide its siblings, so TalkBack could focus and
    // press DONE on a screen the user was not looking at.
    it("takes the picker bar away while a sheet covers the screen", async () => {
        await startPicking();
        await fireEvent.press(screen.getAllByRole("checkbox")[0]);
        expect(screen.queryByTestId("shelf-picker-bar")).toBeTruthy();

        await fireEvent.press(screen.getByTestId("shelf-picker-done"));
        await settleSheet();

        expect(screen.getByTestId("shelf-name-field")).toBeTruthy();
        expect(screen.queryByTestId("shelf-picker-bar")).toBeNull();
    });

    it("swaps the grid for tickable rows", async () => {
        await startPicking();

        expect(screen.queryByTestId("shelf-grid")).toBeNull();
        expect(screen.getByTestId("shelf-picker-bar")).toBeTruthy();
        expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0);
    });

    it("counts what has been ticked", async () => {
        await startPicking();

        const rows = screen.getAllByRole("checkbox");
        await fireEvent.press(rows[0]);
        await fireEvent.press(rows[1]);

        expect(screen.getByTestId("shelf-picker-count"))
            .toHaveTextContent("2 ON THIS SHELF");
    });

    // The test that matters most on this screen. The selection lives apart from
    // the query precisely so a change of lens cannot quietly drop a member.
    it("keeps a tick through a change of lens", async () => {
        await startPicking();

        // The filter rail is already open: picking forces it, because SELECTED
        // lives in it and a count the user cannot reach is no count at all.
        await fireEvent.press(screen.getByTestId("rail-filter-tea"));
        const teas = screen.getAllByRole("checkbox");
        expect(teas).toHaveLength(4);

        await fireEvent.press(teas[0]);
        expect(screen.getByTestId("shelf-picker-count"))
            .toHaveTextContent("1 ON THIS SHELF");

        await fireEvent.press(screen.getByTestId("rail-filter-tea"));

        expect(screen.getAllByRole("checkbox")).toHaveLength(6);
        expect(screen.getByTestId("shelf-picker-count"))
            .toHaveTextContent("1 ON THIS SHELF");
    });

    it("narrows to what has been chosen, from inside a filter", async () => {
        await startPicking();

        const rows = screen.getAllByRole("checkbox");
        await fireEvent.press(rows[0]);

        await fireEvent.press(screen.getByTestId("rail-filter-picker:selected"));

        expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    });

    // The one case SELECTED exists for: narrow to nothing, then review what is
    // on the shelf being built. The list is drawn from the ticks, not the
    // query, so an empty query must not paint NO MATCHES over the members.
    it("lists the ticked recipes under SELECTED when the query matches nothing", async () => {
        jest.useFakeTimers();
        await startPicking();

        await fireEvent.press(screen.getAllByRole("checkbox")[0]);

        await fireEvent.press(screen.getByTestId("rail-search"));
        await act(async () => {
            await fireEvent.changeText(screen.getByTestId("rail-search-input"), "zzzzz");
            jest.advanceTimersByTime(TYPING_DEBOUNCE_MS);
        });

        await fireEvent.press(screen.getByTestId("rail-filter-picker:selected"));

        expect(screen.queryByText("NO MATCHES")).toBeNull();
        expect(screen.getAllByRole("checkbox")).toHaveLength(1);
        jest.useRealTimers();
    });

    // The mirror: SELECTED on with nothing ticked used to draw a FlatList over
    // an empty array, a blank area with no line. It gets its own copy now, not
    // the search-and-filter one, because nothing was searched for.
    it("draws its own line under SELECTED when nothing is ticked", async () => {
        await startPicking();

        await fireEvent.press(screen.getByTestId("rail-filter-picker:selected"));

        expect(screen.queryByText("NO MATCHES")).toBeNull();
        expect(screen.getByText("Tick a recipe to add it to this shelf.")).toBeTruthy();
    });

    it("cancels back to the grid without writing anything", async () => {
        await startPicking();

        await fireEvent.press(screen.getAllByRole("checkbox")[0]);
        await fireEvent.press(screen.getByTestId("shelf-picker-cancel"));

        expect(screen.getByTestId("shelf-grid")).toBeTruthy();
        expect(screen.queryByTestId("shelf-tag:morning")).toBeNull();
    });

    it("names the shelf after the members are chosen, and builds it", async () => {
        await startPicking();

        await fireEvent.press(screen.getAllByRole("checkbox")[0]);
        await fireEvent.press(screen.getByTestId("shelf-picker-done"));
        await settleSheet();

        await fireEvent.changeText(screen.getByTestId("shelf-name-field"), "Mornings");
        await fireEvent.press(screen.getByTestId("shelf-name-confirm"));

        // The id carries the tag as it was typed. Folding happens where the
        // query is built, so the tile can still show the user their own word.
        expect(screen.getByTestId("shelf-tag:Mornings")).toBeTruthy();
    });

    it("empties a shelf by unticking everyone on it", async () => {
        const tagged = named("Ethiopia");
        tagged.tags = ["morning"];
        await renderHome({recipes: [tagged, named("Kenya"), named("Colombia")]});
        await fireEvent.press(screen.getByRole("tab", {name: "Shelves"}));

        await shelfAction("morning", "edit");
        expect(screen.getByTestId("shelf-picker-count"))
            .toHaveTextContent("1 ON THIS SHELF");

        await fireEvent.press(screen.getByLabelText("Ethiopia"));
        await fireEvent.press(screen.getByTestId("shelf-picker-done"));

        // Asked before it happens, not reported after: a shelf is a query, so
        // there is nothing to undo once its last tag is gone.
        await settleSheet();
        await fireEvent.press(screen.getByTestId("remove-shelf-confirm"));

        expect(screen.queryByTestId("shelf-tag:morning")).toBeNull();

        // The recipes are not a casualty of the shelf going away. Asked of the
        // list rather than the grid, which draws tiles and no recipes at all.
        expect(screen.queryByTestId("shelf-picker-bar")).toBeNull();
        // The library has no shelves left at all, so the grid draws its
        // explanation rather than an empty frame.
        expect(screen.getByTestId("shelves-empty")).toBeTruthy();
        await fireEvent.press(screen.getByRole("tab", {name: "List"}));
        expect(screen.getByText("Ethiopia")).toBeTruthy();
        expect(screen.getAllByTestId("recipe-card")).toHaveLength(3);
    });

    it("duplicates a shelf, leaving the original where it was", async () => {
        const tagged = named("Ethiopia");
        tagged.tags = ["morning"];
        await renderHome({recipes: [tagged, named("Kenya")]});
        await fireEvent.press(screen.getByRole("tab", {name: "Shelves"}));

        await shelfAction("morning", "duplicate");
        await fireEvent.changeText(screen.getByTestId("shelf-name-field"), "Evening");
        await fireEvent.press(screen.getByTestId("shelf-name-confirm"));

        expect(screen.getByTestId("shelf-tag:morning")).toBeTruthy();
        expect(screen.getByTestId("shelf-tag:Evening")).toBeTruthy();

        // The copy holds the same recipe. A shelf is a tag, and a recipe can
        // carry both, so duplicating does not move anybody.
        await fireEvent.press(screen.getByTestId("shelf-tag:Evening"));
        expect(screen.getByText("Ethiopia")).toBeTruthy();
    });

    it("deletes a shelf outright, keeping the recipes that were on it", async () => {
        const tagged = named("Ethiopia");
        tagged.tags = ["morning"];
        await renderHome({recipes: [tagged, named("Kenya")]});
        await fireEvent.press(screen.getByRole("tab", {name: "Shelves"}));

        await shelfAction("morning", "delete");
        // Asked before it happens, the same as an emptied shelf: there is no
        // undo for a query that no longer exists.
        await fireEvent.press(screen.getByTestId("remove-shelf-confirm"));

        expect(screen.queryByTestId("shelf-tag:morning")).toBeNull();
        await fireEvent.press(screen.getByRole("tab", {name: "List"}));
        expect(screen.getAllByTestId("recipe-card")).toHaveLength(2);
    });

    it("keeps the shelf when the delete is declined", async () => {
        const tagged = named("Ethiopia");
        tagged.tags = ["morning"];
        await renderHome({recipes: [tagged, named("Kenya")]});
        await fireEvent.press(screen.getByRole("tab", {name: "Shelves"}));

        await shelfAction("morning", "delete");
        await fireEvent.press(screen.getByTestId("remove-shelf-cancel"));
        await settleSheet();

        expect(screen.getByTestId("shelf-tag:morning")).toBeTruthy();
    });

    it("withholds EDIT MEMBERS from the menu opened inside the edit", async () => {
        // The grid's menu offers it because there is no edit running. The
        // picker's own header does not, because the user is already standing
        // in the edit that row would start.
        const tagged = named("Ethiopia");
        tagged.tags = ["morning"];
        await renderHome({recipes: [tagged, named("Kenya")]});
        await fireEvent.press(screen.getByRole("tab", {name: "Shelves"}));

        await fireEvent.press(screen.getByTestId("shelf-edit-tag:morning"));
        await settleSheet();
        expect(screen.getByTestId("shelf-overflow-edit")).toBeTruthy();
        await fireEvent.press(screen.getByTestId("shelf-overflow-edit"));
        await settleSheet();

        await fireEvent.press(screen.getByTestId("shelf-picker-actions"));
        await settleSheet();
        expect(screen.queryByTestId("shelf-overflow-edit")).toBeNull();
        expect(screen.getByTestId("shelf-overflow-rename")).toBeTruthy();
    });

    // A rename from the grid starts an edit the user never sees, so that the
    // ticks it saves are the shelf's own. Backing out of the name must undo
    // that: landing in the member editor is a place the user never asked for.
    it("returns to the grid when a rename from the grid is dismissed", async () => {
        const tagged = named("Ethiopia");
        tagged.tags = ["morning"];
        await renderHome({recipes: [tagged, named("Kenya")]});
        await fireEvent.press(screen.getByRole("tab", {name: "Shelves"}));

        await fireEvent.press(screen.getByTestId("shelf-edit-tag:morning"));
        await settleSheet();
        await fireEvent.press(screen.getByTestId("shelf-overflow-rename"));
        await settleSheet();

        expect(screen.getByTestId("shelf-name-field")).toBeTruthy();
        // The overflow sheet is still mounted through its exit grace, so there
        // are two closes in the tree; the name sheet's is the later one.
        await fireEvent.press(screen.getAllByLabelText("Close").at(-1)!);
        await settleSheet();

        expect(screen.getByTestId("shelf-grid")).toBeTruthy();
        expect(screen.queryByTestId("shelf-picker-header")).toBeNull();
    });

    // The other origin. The user opened the edit themselves, so cancelling a
    // name is cancelling the name and nothing else.
    it("stays in the edit when a rename from the picker is dismissed", async () => {
        const tagged = named("Ethiopia");
        tagged.tags = ["morning"];
        await renderHome({recipes: [tagged, named("Kenya")]});
        await fireEvent.press(screen.getByRole("tab", {name: "Shelves"}));

        await fireEvent.press(screen.getByTestId("shelf-edit-tag:morning"));
        await settleSheet();
        await fireEvent.press(screen.getByTestId("shelf-overflow-edit"));
        await settleSheet();

        await fireEvent.press(screen.getByTestId("shelf-picker-actions"));
        await settleSheet();
        await fireEvent.press(screen.getByTestId("shelf-overflow-rename"));
        await settleSheet();

        // The overflow sheet is still mounted through its exit grace, so there
        // are two closes in the tree; the name sheet's is the later one.
        await fireEvent.press(screen.getAllByLabelText("Close").at(-1)!);
        await settleSheet();

        expect(screen.getByTestId("shelf-picker-header")).toBeTruthy();
    });

    it("sheds the library's own chrome while picking", async () => {
        // Every one of these is a door out of the half-built shelf, and none
        // of them do anything while picking. Drawing them spent the top third
        // of the screen on controls that lead away from the task.
        await startPicking();

        expect(screen.getByTestId("shelf-picker-header")).toBeTruthy();
        expect(screen.queryByLabelText("Read a card")).toBeNull();
        expect(screen.queryByLabelText("Create a recipe")).toBeNull();
    });

    it("puts the chrome back when the picker is cancelled", async () => {
        await startPicking();
        await fireEvent.press(screen.getByTestId("shelf-picker-header-cancel"));

        expect(screen.queryByTestId("shelf-picker-header")).toBeNull();
        expect(screen.getByLabelText("Read a card")).toBeTruthy();
    });

    it("offers no shelf actions for a shelf that has no name yet", async () => {
        // A new shelf is named at the end, by the bar, once it has members to
        // be named for. Until then there is nothing to rename, copy or delete.
        await startPicking();

        expect(screen.queryByTestId("shelf-picker-actions")).toBeNull();
    });

    it("renames a shelf, keeping everyone on it", async () => {
        const tagged = named("Ethiopia");
        tagged.tags = ["morning"];
        await renderHome({recipes: [tagged, named("Kenya")]});
        await fireEvent.press(screen.getByRole("tab", {name: "Shelves"}));
        await shelfAction("morning", "rename");
        await fireEvent.changeText(screen.getByTestId("shelf-name-field"), "Evening");
        await fireEvent.press(screen.getByTestId("shelf-name-confirm"));

        expect(screen.getByTestId("shelf-tag:Evening")).toBeTruthy();
        expect(screen.queryByTestId("shelf-tag:morning")).toBeNull();

        // The member went with the name rather than being left behind on a
        // shelf that no longer exists.
        await fireEvent.press(screen.getByTestId("shelf-tag:Evening"));
        expect(screen.getByText("Ethiopia")).toBeTruthy();
    });

    it("refuses a rename onto a shelf that already exists", async () => {
        const morning = named("Ethiopia");
        morning.tags = ["morning"];
        const evening = named("Kenya");
        evening.tags = ["evening"];
        await renderHome({recipes: [morning, evening]});
        await fireEvent.press(screen.getByRole("tab", {name: "Shelves"}));
        await shelfAction("morning", "rename");
        await fireEvent.changeText(screen.getByTestId("shelf-name-field"), "evening");
        await fireEvent.press(screen.getByTestId("shelf-name-confirm"));

        expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({
            tone: "error", message: "There is already a shelf called evening."
        }));
        // A refused rename is not a half-done one: the sheet stays open on the
        // name that was not accepted rather than closing as if it had been.
        expect(screen.getByTestId("shelf-name-field").props.value).toBe("evening");
    });

    it("allows a rename that only changes how the name is spelled", async () => {
        // "morning" and "Morning" fold to one shelf everywhere downstream, so
        // this is not a collision, it is the rename the user asked for.
        const tagged = named("Ethiopia");
        tagged.tags = ["morning"];
        await renderHome({recipes: [tagged, named("Kenya")]});
        await fireEvent.press(screen.getByRole("tab", {name: "Shelves"}));
        await shelfAction("morning", "rename");
        await fireEvent.changeText(screen.getByTestId("shelf-name-field"), "Morning");
        await fireEvent.press(screen.getByTestId("shelf-name-confirm"));

        expect(screen.getByTestId("shelf-tag:Morning")).toBeTruthy();
        await fireEvent.press(screen.getByTestId("shelf-tag:Morning"));
        expect(screen.getByText("Ethiopia")).toBeTruthy();
    });
});

describe("the machine panel", () => {
    // These pin the wiring: the dot is the only way into the panel, and a tap
    // that does not mount it leaves the machine's water level and its connect
    // button unreachable from the library with nothing on screen to say so.
    //
    // They do NOT guard the height bug that sent us here, and were kept only
    // once that was understood. There is no layout under this renderer, so a
    // panel measured too small to show anything is found by a query all the
    // same. That fault lives in `Collapsible`'s arithmetic and is pinned there,
    // where it can be seen.
    it.each([
        ["idle", "Machine not connected"],
        ["connected", "Machine connected"],
        ["connecting", "Machine connecting"],
        ["disconnected", "Machine not in range"],
        ["failed", "Machine not in range"]
    ])("opens the panel from the %s dot", async (status, label) => {
        mockRemembered = "machine-device-id";
        mockMachineStatus = status;
        await renderHome({recipes: [named("Ethiopia")]});

        expect(screen.queryByTestId("machine-panel")).toBeNull();

        await act(async () => {
            fireEvent.press(screen.getByLabelText(label));
        });

        expect(screen.getByTestId("machine-panel")).toBeTruthy();
    });
});

describe("the low-tank warning on the dot", () => {
    it("raises it when a connected machine answers with an empty tank", async () => {
        // The moment the fact becomes knowable is the moment the machine
        // answers, which is what the dot's one-off amber flash is for.
        mockRemembered = "machine-device-id";
        mockMachineStatus = "connected";
        mockMachineInfo = {
            waterEnough: false, waterFeed: "tank", mode: "PRO", grindSize: 62
        };

        await renderWithProviders(
            <HomeScreen db={store([])} settings={new Settings(memoryStorage())}/>
        );

        expect(
            screen.getByTestId("machine-dot-alarm", {includeHiddenElements: true})
        ).toBeTruthy();
    });

    it("stays quiet about a plumbed machine, which has no tank to fill", async () => {
        // Asking someone to fill a tank that does not exist is worse than
        // saying nothing.
        mockRemembered = "machine-device-id";
        mockMachineStatus = "connected";
        mockMachineInfo = {
            waterEnough: false, waterFeed: "tap", mode: "PRO", grindSize: 62
        };

        await renderWithProviders(
            <HomeScreen db={store([])} settings={new Settings(memoryStorage())}/>
        );

        expect(
            screen.queryByTestId("machine-dot-alarm", {includeHiddenElements: true})
        ).toBeNull();
    });

    it("stays quiet when the tank is full", async () => {
        mockRemembered = "machine-device-id";
        mockMachineStatus = "connected";
        mockMachineInfo = {
            waterEnough: true, waterFeed: "tank", mode: "PRO", grindSize: 62
        };

        await renderWithProviders(
            <HomeScreen db={store([])} settings={new Settings(memoryStorage())}/>
        );

        expect(
            screen.queryByTestId("machine-dot-alarm", {includeHiddenElements: true})
        ).toBeNull();
    });
});

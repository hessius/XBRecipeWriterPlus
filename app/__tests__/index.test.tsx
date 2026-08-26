import React from "react";
import {AccessibilityInfo} from "react-native";
import {act, screen, fireEvent, waitFor} from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";

import HomeScreen from "@/app/index";
import Recipe from "@/library/Recipe";
import {XBloomRecipe} from "@/library/XBloomRecipe";
import {renderWithProviders} from "@/test-utils/render";
import {Settings, type SettingsStorage} from "@/library/Settings";

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
    mockNotify.mockClear();
    (XBloomRecipe as jest.Mock).mockClear();
    mockFetchRecipeDetail = () => Promise.resolve();
    mockGetRecipe = () => undefined;
    mockNativePasteOnPress = undefined;
    mockFocusEpoch = 0;
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
    options: {shareIntent?: Record<string, unknown>; recipes?: Recipe[]} = {}
) {
    if (options.shareIntent) {
        mockShareIntentState = {
            hasShareIntent:   true,
            shareIntent:      options.shareIntent,
            resetShareIntent: jest.fn()
        };
    }
    return renderWithProviders(
        <HomeScreen db={store(options.recipes ?? [])} settings={new Settings(memoryStorage())}/>
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

        await fireEvent.press(screen.getByLabelText("Close"));
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
        const before = db.retrieveAllRecipes.mock.calls.length;

        await fireEvent.press(screen.getByLabelText("Import a recipe"));
        await act(async () => { jest.advanceTimersByTime(500); });

        await fireEvent.press(screen.getByLabelText("Close"));
        await act(async () => { jest.advanceTimersByTime(500); });

        expect(db.retrieveAllRecipes.mock.calls.length).toBeGreaterThan(before);
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

import React from "react";
import {AccessibilityInfo} from "react-native";
import {act, screen, fireEvent, waitFor, within} from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";

import HomeScreen, {EDITOR_PUSH_GUARD_MS} from "@/app/index";
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

// The machine hook transitively imports the BLE transport — a native module
// that throws at load under Jest. Only the disconnected-or-paired state matters
// for screen tests, so the hook is stubbed here, the same way it is in
// settings.test.tsx.
let mockRemembered = "";
let mockMachineStatus = "disconnected";
let mockMachineInfo: {waterEnough: boolean; mode: "PRO" | "EASY"; grindSize: number} | null = null;

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

    it("opens one brew screen when the capsule is tapped twice in a row", async () => {
        // Same race as the editor: the push is not instantaneous and a second
        // tap within the guard window would stack a second brew on top of the
        // first — one running, one waiting beneath it.
        mockRemembered = "machine-device-id";
        await renderHome({recipes: [named("Ethiopia")]});
        const capsule = await screen.findByLabelText("Brew this recipe");

        await act(async () => {
            fireEvent.press(capsule);
            fireEvent.press(capsule);
        });

        expect(mockPush).toHaveBeenCalledTimes(1);
    });

    it("draws the shape the settings chose", async () => {
        mockRemembered = "machine-device-id";
        const settings = new Settings(memoryStorage());
        settings.set("showBrewOnRecipeRows", true);
        settings.set("brewShortcut", "chip");
        await renderWithProviders(
            <HomeScreen db={store([named("Ethiopia")])} settings={settings}/>
        );

        const shortcut = await screen.findByTestId("brew-shortcut");

        // Presence alone proves nothing here. The screen currently hands every
        // card the `edge` shape from a bridge left by the previous task, so a
        // shortcut appears whatever the setting says -- which is the bug this
        // task exists to fix.
        //
        // The chip is wide enough to say the word outright; the bands stack their
        // letters one per line. So the word itself is what distinguishes the
        // shape that was chosen from the shape that was hardcoded.
        expect(within(shortcut).getByText("BREW")).toBeTruthy();
        expect(within(shortcut).queryByText("B")).toBeNull();
    });

    it("draws no shortcut when nobody here owns a machine", async () => {
        // Same library and same setting as above -- only the machine differs, so
        // this cannot pass because the card or the recipe went missing.
        mockRemembered = "";
        const settings = new Settings(memoryStorage());
        settings.set("showBrewOnRecipeRows", true);
        settings.set("brewShortcut", "chip");
        await renderWithProviders(
            <HomeScreen db={store([named("Ethiopia")])} settings={settings}/>
        );

        // A dead BREW button on every recipe would be worse than no button.
        expect(await screen.findByText("Ethiopia")).toBeTruthy();
        expect(screen.queryByTestId("brew-shortcut")).toBeNull();
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
            fireEvent.press(await screen.findByLabelText("Brew this recipe"));
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
            fireEvent.press(await screen.findByLabelText("Brew this recipe"));
        });

        expect(mockPush).toHaveBeenCalledTimes(1);
        expect(mockNotify).not.toHaveBeenCalled();
    });

    it("lets a new recipe be brewed once the last brew is over", async () => {
        mockRemembered = "machine-device-id";
        mockLiveRun = liveRun(named("Ethiopia"), "done");
        await renderHome({recipes: [named("Colombia")]});

        await act(async () => {
            fireEvent.press(await screen.findByLabelText("Brew this recipe"));
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

    it("renders the machine popover outside the home header so it is not clipped", async () => {
        // A non-modal sheet renders in place. When it lived inside the header's
        // icon row — an animated, height-constrained container — it was clipped
        // to nothing. The popover must be at screen root so it is never occluded
        // by its mounting container.
        mockRemembered = "machine-device-id";
        mockMachineStatus = "connected";
        mockMachineInfo = {waterEnough: true, mode: "PRO", grindSize: 62};

        await renderWithProviders(
            <HomeScreen db={store([])} settings={new Settings(memoryStorage())}/>
        );

        await fireEvent.press(screen.getByLabelText("Machine connected"));

        // Popover content must appear on screen...
        expect(screen.getByText("WATER")).toBeTruthy();

        // ...but must NOT be a descendant of the header (it was, before the fix).
        const header = screen.getByTestId("home-header");
        expect(within(header).queryByText("WATER")).toBeNull();
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

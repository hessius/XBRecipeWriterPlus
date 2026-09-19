import * as Application from "expo-application";
import React from "react";
import {screen, fireEvent, act, within, waitFor} from "@testing-library/react-native";
import type {ReactTestRendererJSON} from "react-test-renderer";

import SettingsScreen from "@/app/settings";
import {palette} from "@/constants/colors";
import Recipe from "@/library/Recipe";
import {DEFAULTS, NOT_IN_BACKUP, Settings, type SettingKey, type SettingsStorage} from "@/library/Settings";
import {renderWithProviders} from "@/test-utils/render";

/**
 * The rendered text of a `toJSON()` tree, in document order.
 *
 * Order across sibling elements is not something `getByText`/`getByRole` can
 * compare directly — each finds one node, not a position — so a test that
 * cares which section comes first has to walk the tree itself.
 */
function renderOrder(node: ReactTestRendererJSON | ReactTestRendererJSON[] | string | null): string[] {
    if (node === null) return [];
    if (typeof node === "string") return [node];
    if (Array.isArray(node)) return node.flatMap(renderOrder);
    return renderOrder(node.children as ReactTestRendererJSON[] | null ?? []);
}

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
    ...jest.requireActual("expo-router"),
    useRouter:      () => ({push: mockPush}),
    // Fired once on mount, which is what `useCloudSession` reads the stored
    // session in. The real one also fires on every return to this screen.
    useFocusEffect: (cb: () => void | (() => void)) => {
        const {useEffect} = jest.requireActual("react");
        useEffect(cb, [cb]);
    }
}));

const mockLoadSession = jest.fn(async () => null as unknown);
const mockSignOut = jest.fn(async () => {});
jest.mock("@/library/cloud/session", () => ({
    loadSession: () => mockLoadSession(),
    signOut:     () => mockSignOut()
}));

const mockExportBackup = jest.fn();
const mockPickBackup = jest.fn();
jest.mock("@/hooks/useBackup", () => ({
    useBackup: () => ({
        exportBackup: (...args: unknown[]) => mockExportBackup(...args),
        pickBackup: (...args: unknown[]) => mockPickBackup(...args)
    })
}));

// notify lives in components/XbrwToast, not library/notify — the toast body
// and its dispatcher share that module, and that is what every other screen
// in this app imports it from.
const mockNotify = jest.fn();
jest.mock("@/components/XbrwToast", () => ({
    ...jest.requireActual("@/components/XbrwToast"),
    notify: (...args: unknown[]) => mockNotify(...args)
}));

// useRecipeLibrary's default store is a real RecipeDatabase, which opens
// expo-sqlite — a native module with no working implementation under Jest.
// The screen delegates every whole-library change to this hook, so the mock is
// the seam the screen is tested through: `mockLibraryRecipes` drives the count
// the delete sheet and the merge preview read, and `mockApplyRestore` /
// `mockDeleteAll` observe what the screen asks the library to do.
let mockLibraryRecipes: Recipe[] = [];
let mockUnreadableCount = 0;
let mockAllRecipesThrows = false;
// Callables, not a value: the count parses every blob, so the library exposes
// it as something Settings asks for once rather than a figure every consumer
// pays for at render (#124).
const mockCountUnreadable = jest.fn(() => mockUnreadableCount);
const mockDeleteUnreadable = jest.fn(() => 0);
const mockRefresh = jest.fn();
const mockDeleteAll = jest.fn();
const mockApplyRestore = jest.fn();
// The brew history lives in SQLite, which this environment has no native
// module for. Mocked as a store rather than stubbed away, so the two questions
// the screen asks it -- what to back up, and what a restore added -- can both
// be asserted.
const mockBrewStore = {
    all: jest.fn(() => [] as unknown[]),
    restore: jest.fn(() => 0)
};

jest.mock("@/hooks/useBrewHistory", () => ({
    sharedBrewDatabase: () => mockBrewStore
}));

jest.mock("@/hooks/useRecipeLibrary", () => ({
    useRecipeLibrary: () => ({
        recipes:         mockLibraryRecipes,
        countUnreadable: mockCountUnreadable,
        deleteUnreadable: mockDeleteUnreadable,
        allRecipes:      () => {
            if (mockAllRecipesThrows) throw new Error("one recipe could not be read");
            return mockLibraryRecipes;
        },
        refresh:         mockRefresh,
        deleteRecipe:    jest.fn(),
        duplicateRecipe: jest.fn(),
        deleteAll:       mockDeleteAll,
        applyRestore:    mockApplyRestore
    })
}));

// The machine section (added by the BLE brew work) pulls in `useMachine`, which
// transitively imports the BLE transport — a native module that throws at load
// under Jest. This screen only needs the section to render in its unpaired
// state, so the hook is stubbed here the same way the library and backup hooks
// above are, keeping the settings screen off the radio entirely.
jest.mock("@/hooks/useMachine", () => {
    const link = {
        machine:    {info: null},
        status:     "disconnected",
        error:      null,
        remembered: "",
        connect:    jest.fn(),
        forget:     jest.fn()
    };
    return {__esModule: true, default: () => link, useMachine: () => link};
});

function recipeNamed(name: string, uuid: string): Recipe {
    const recipe = new Recipe();
    recipe.name = name;
    recipe.uuid = uuid;
    return recipe;
}

function backupOf(
    recipes: Recipe[], settings: Record<string, unknown> = {}, brews: unknown[] = [],
    skippedBrews = 0
) {
    return {
        cancelled: false,
        result: {
            ok: true,
            payload: {
                recipes,
                brews,
                settings,
                skipped: 0,
                skippedBrews,
                appVersion: "2.6.0",
                exportedAt: "2026-08-26T21:00:00.000Z"
            }
        }
    };
}

/**
 * A store with the xBloom account feature switched on.
 *
 * The feature is gated off by default, so the tests that are about the account
 * section have to turn it on. Turned on rather than deleted: gated code still
 * needs its coverage, and the gate itself is tested separately at the bottom of
 * this file.
 */
function accountOn(): Settings {
    const settings = new Settings(memoryStorage());
    settings.set("cloudAccountEnabled", true);
    return settings;
}

function memoryStorage(): SettingsStorage {
    const values = new Map<string, string>();
    return {
        read:  (key) => values.get(key) ?? null,
        write: (key, value) => {
            values.set(key, value);
        }
    };
}

/**
 * Let a just-opened sheet finish arriving before it is touched.
 *
 * `XbrwSheet` slides in on the frame after it mounts (a `requestAnimationFrame`
 * that flips it from closed to shown), and a press dispatched into that gap is
 * dropped. Waiting a frame makes the interaction deterministic rather than a
 * race the test wins most of the time.
 */
async function settleSheet(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 60));
    });
}

describe("SettingsScreen", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockLibraryRecipes = [];
        mockUnreadableCount = 0;
        mockAllRecipesThrows = false;
        mockCountUnreadable.mockImplementation(() => mockUnreadableCount);
        mockDeleteUnreadable.mockImplementation(() => 0);
        // `clearAllMocks` forgets calls but keeps implementations, so a test
        // that made one of these reject would otherwise poison its successors.
        mockLoadSession.mockResolvedValue(null);
        mockSignOut.mockResolvedValue(undefined);
        mockBrewStore.all.mockReturnValue([]);
        mockBrewStore.restore.mockReturnValue(0);
    });

    it("shows the coffee marker toggle in its stored state", async () => {
        const settings = new Settings(memoryStorage());
        settings.set("showCoffeeMarker", false);

        await renderWithProviders(<SettingsScreen settings={settings}/>);

        expect(screen.getByLabelText("Show the COFFEE marker").props.accessibilityState.checked)
            .toBe(false);
    });

    it("persists a change to the toggle", async () => {
        const storage = memoryStorage();
        const settings = new Settings(storage);

        await renderWithProviders(<SettingsScreen settings={settings}/>);
        await fireEvent(screen.getByLabelText("Show the COFFEE marker"), "checkedChange", false);

        expect(new Settings(storage).get("showCoffeeMarker")).toBe(false);
    });

    it("explains what the toggle does, rather than only naming it", async () => {
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);
        expect(screen.getByText(/TEA marker is always shown/i)).toBeTruthy();
    });

    it("offers the dot matrix pour profile, off unless it has been turned on", async () => {
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);
        expect(screen.getByLabelText("Dot matrix pour profile")
            .props.accessibilityState.checked).toBe(false);
    });

    it("persists the dot matrix pour profile", async () => {
        const storage = memoryStorage();

        await renderWithProviders(<SettingsScreen settings={new Settings(storage)}/>);
        await fireEvent(screen.getByLabelText("Dot matrix pour profile"), "checkedChange", true);

        expect(new Settings(storage).get("dotMatrixProfile")).toBe(true);
    });

    it("offers recipe pictures, off until someone asks for them", async () => {
        // Off by default on purpose: the setting exists to find out whether a
        // pod photo or a sharer's picture helps at all.
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        expect(screen.getByLabelText("Show recipe pictures")
            .props.accessibilityState.checked).toBe(false);
    });

    it("persists recipe pictures", async () => {
        const storage = memoryStorage();

        await renderWithProviders(<SettingsScreen settings={new Settings(storage)}/>);
        await fireEvent(screen.getByLabelText("Show recipe pictures"), "checkedChange", true);

        expect(new Settings(storage).get("showRecipeAvatars")).toBe(true);
    });

    it("does not offer the one-line hints", async () => {
        // The hints toggle lives in the editor's more menu, beside the deck it
        // annotates, rather than a screen away from it.
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        expect(screen.queryByLabelText("One-line hints")).toBeNull();
        expect(screen.queryByText(/EDITOR/)).toBeNull();
    });

    it("no longer asks where the field explanations go", async () => {
        // There were two, and neither survived a phone. The long form is one
        // sheet behind the caret now, so there is nothing left to choose.
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        expect(screen.queryByText(/Field explanations/)).toBeNull();
    });

    it("heads the toggles with the part of the app they change", async () => {
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);
        expect(screen.getByText("RECIPE LIST")).toBeTruthy();
    });

    it("offers Celsius and Fahrenheit, starting on Celsius", async () => {
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        expect(screen.getByText("UNITS")).toBeTruthy();
        expect(screen.getByLabelText("°C").props.accessibilityState.checked).toBe(true);
        expect(screen.getByLabelText("°F").props.accessibilityState.checked).toBe(false);
    });

    it("persists a switch to Fahrenheit", async () => {
        const storage = memoryStorage();

        await renderWithProviders(<SettingsScreen settings={new Settings(storage)}/>);
        await fireEvent.press(screen.getByLabelText("°F"));

        expect(new Settings(storage).get("temperatureUnit")).toBe("F");
    });

    it("says what the unit changes and what it does not", async () => {
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);
        expect(screen.getByText(/card always stores/i)).toBeTruthy();
    });

    it("offers backup and restore", async () => {
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        expect(screen.getByText("LIBRARY")).toBeTruthy();
        expect(screen.getByRole("button",
            {name: "Back up my recipes, Writes a file and hands it to the share sheet."})).toBeTruthy();
        expect(screen.getByRole("button",
            {name: "Restore from a backup, Adds anything your library does not already have."})).toBeTruthy();
    });

    it("says nothing at all when the picker was cancelled", async () => {
        // The user withdrew. A message would be the app arguing with them. The
        // button is really wired: the picker is consulted, and because it came
        // back cancelled no restore sheet is raised either.
        mockPickBackup.mockResolvedValue({cancelled: true});
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Restore from a backup, Adds anything your library does not already have."}));

        expect(mockPickBackup).toHaveBeenCalled();
        expect(mockNotify).not.toHaveBeenCalled();
        expect(screen.queryByRole("button", {name: /add to my library/i})).toBeNull();
    });

    it("reports a file it could not read", async () => {
        mockPickBackup.mockResolvedValue({
            cancelled: false, result: {ok: false, reason: "That file could not be read."}
        });
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Restore from a backup, Adds anything your library does not already have."}));

        expect(mockNotify).toHaveBeenCalledWith(
            expect.objectContaining({tone: "error", message: "That file could not be read."})
        );
    });

    it("hands the whole library and the live settings to the exporter", async () => {
        // Rewiring this row to onRestore, or passing the wrong arguments, used
        // to leave every test green because none of them pressed it.
        mockLibraryRecipes = [recipeNamed("Ethiopia", "u1")];
        mockExportBackup.mockResolvedValue({ok: true});
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Back up my recipes, Writes a file and hands it to the share sheet."}));

        expect(mockExportBackup).toHaveBeenCalledWith(
            mockLibraryRecipes, expect.any(Object), expect.any(String), expect.any(Array)
        );

        // Asserted against DEFAULTS rather than a list written out here, because
        // a hand-kept list is exactly what went wrong: `showHints` was added to
        // the app and nobody remembered to add it to the snapshot, so it was
        // silently absent from every backup while the tests stayed green. A
        // test that names the keys itself would have gone on passing too.
        const snapshot = mockExportBackup.mock.calls[0][1] as Record<string, unknown>;
        expect(Object.keys(snapshot).sort()).toEqual(
            Object.keys(DEFAULTS).filter(key => !NOT_IN_BACKUP.includes(key as SettingKey)).sort()
        );
    });

    it("no longer carries the retired rail hint in a backup", async () => {
        // The rail hint and its setting were removed outright. The exhaustiveness
        // test above proves the snapshot equals DEFAULTS; this names the one key
        // that must not reappear, so a reader who re-adds it to DEFAULTS by reflex
        // is told here rather than shipping a dead preference in every backup.
        mockExportBackup.mockResolvedValue({ok: true});
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Back up my recipes, Writes a file and hands it to the share sheet."}));

        const snapshot = mockExportBackup.mock.calls[0][1] as Record<string, unknown>;
        expect(snapshot).not.toHaveProperty("libraryRailHintDismissed");
    });

    it("leaves the paired machine out of a backup rather than carrying it to another phone", async () => {
        // A BLE peripheral identifier is minted by the operating system for one
        // phone. Carried to a second phone it does not name anything, and the
        // second phone would sit trying to reach a machine by an identifier its
        // own radio has never issued. So this key is excluded on purpose, and
        // named in NOT_IN_BACKUP so the exhaustiveness test above still holds
        // every other key to account.
        mockLibraryRecipes = [recipeNamed("Ethiopia", "u1")];
        mockExportBackup.mockResolvedValue({ok: true});
        const storage = memoryStorage();
        const settings = new Settings(storage);
        settings.set("machineDeviceId", "a-peripheral-on-this-phone-only");
        await renderWithProviders(<SettingsScreen settings={settings}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Back up my recipes, Writes a file and hands it to the share sheet."}));

        const snapshot = mockExportBackup.mock.calls[0][1] as Record<string, unknown>;
        expect(snapshot).not.toHaveProperty("machineDeviceId");
    });

    it("ignores a machine identifier a backup carries anyway", async () => {
        // Older backups, or a hand-edited file. The pairing on this phone is
        // what the radio actually knows about, and a stranger's identifier
        // must not displace it.
        const storage = memoryStorage();
        const settings = new Settings(storage);
        settings.set("machineDeviceId", "mine");
        mockPickBackup.mockResolvedValue(backupOf([recipeNamed("A", "u1")], {machineDeviceId: "theirs"}));
        mockApplyRestore.mockReturnValue({status: "restored", added: 1});
        await renderWithProviders(<SettingsScreen settings={settings}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Restore from a backup, Adds anything your library does not already have."}));
        await settleSheet();
        await fireEvent(screen.getByLabelText(/settings from this backup/i),
                        "checkedChange", true);
        await fireEvent.press(screen.getByRole("button", {name: /add to my library/i}));

        expect(new Settings(storage).get("machineDeviceId")).toBe("mine");
    });

    it("restores every setting a backup carries, not a subset of them", async () => {
        // The other half of the same omission: a key can be in the snapshot and
        // still be dropped on the way back in, which loses the preference at the
        // one moment the user expects it to be safe.
        const storage = memoryStorage();
        const all = Object.fromEntries(
            Object.entries(DEFAULTS)
                .filter(([key]) => !NOT_IN_BACKUP.includes(key as SettingKey))
                .map(([key, value]) => [key, typeof value === "boolean" ? !value : value])
        );
        mockPickBackup.mockResolvedValue(backupOf([recipeNamed("A", "u1")], all));
        mockApplyRestore.mockReturnValue({status: "restored", added: 1});
        await renderWithProviders(<SettingsScreen settings={new Settings(storage)}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Restore from a backup, Adds anything your library does not already have."}));
        await settleSheet();
        await fireEvent(screen.getByLabelText(/settings from this backup/i),
                        "checkedChange", true);
        await fireEvent.press(screen.getByRole("button", {name: /add to my library/i}));

        const restored = new Settings(storage);
        for (const key of Object.keys(DEFAULTS) as SettingKey[]) {
            if (NOT_IN_BACKUP.includes(key)) continue;
            expect({[key]: restored.get(key)}).toEqual({[key]: all[key]});
        }
    });

    it("reports a backup that could not be shared", async () => {
        mockExportBackup.mockResolvedValue({ok: false, reason: "This device cannot share files."});
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Back up my recipes, Writes a file and hands it to the share sheet."}));

        expect(mockNotify).toHaveBeenCalledWith(
            expect.objectContaining({tone: "error", message: "This device cannot share files."})
        );
    });

    it("restores a picked backup by adding exactly what the library lacks", async () => {
        mockLibraryRecipes = [];
        mockPickBackup.mockResolvedValue(
            backupOf([recipeNamed("A", "u1"), recipeNamed("B", "u2")])
        );
        mockApplyRestore.mockReturnValue({status: "restored", added: 2});
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Restore from a backup, Adds anything your library does not already have."}));
        await settleSheet();
        await fireEvent.press(screen.getByRole("button", {name: /add to my library/i}));

        expect(mockApplyRestore).toHaveBeenCalledWith(
            expect.objectContaining({recipes: expect.any(Array)}),
            {replace: false}
        );
        expect(mockNotify).toHaveBeenCalledWith(
            expect.objectContaining({tone: "success", message: "2 recipes restored"})
        );
    });

    it("restores a library sorted by rating", async () => {
        // The newest axis, through the read boundary that narrows an unknown
        // one away: a backup naming it must come back sorting by rating rather
        // than quietly falling back to name.
        const storage = memoryStorage();
        mockPickBackup.mockResolvedValue(
            backupOf([recipeNamed("A", "u1")],
                     {librarySort: "rating", librarySortDirection: "asc"})
        );
        mockApplyRestore.mockReturnValue({status: "restored", added: 1});
        await renderWithProviders(<SettingsScreen settings={new Settings(storage)}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Restore from a backup, Adds anything your library does not already have."}));
        await settleSheet();
        await fireEvent(screen.getByLabelText(/settings from this backup/i),
                        "checkedChange", true);
        await fireEvent.press(screen.getByRole("button", {name: /add to my library/i}));

        const restored = new Settings(storage);
        expect(restored.get("librarySort")).toBe("rating");
        expect(restored.get("librarySortDirection")).toBe("asc");
    });

    it("shows how many saved recipes could not be read, and only then", async () => {
        // Buys off the silence of skipping an unreadable blob (#124): the line
        // is present when the library reports one and absent when it does not.
        mockUnreadableCount = 2;
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);
        expect(screen.getByText("2 saved recipes could not be read.")).toBeTruthy();
    });

    it("asks the library for the count once rather than on every render", async () => {
        // The count parses every blob in the table, so it is a diagnostic the
        // screen that shows it asks for, never a figure the library carries
        // around. Taken at render it would put a whole-table parse on Home.
        mockUnreadableCount = 1;
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        expect(mockCountUnreadable).toHaveBeenCalledTimes(1);
    });

    it("says a backup is unavailable while a recipe cannot be read", async () => {
        mockUnreadableCount = 1;
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        expect(screen.getByText(/backing up is paused/i)).toBeTruthy();
    });

    it("reports the refusal rather than throwing out of the press", async () => {
        // `allRecipes()` throws over an unreadable row on purpose, and that
        // throw used to land outside `useBackup`'s catch and reject the press
        // handler, so the user tapped and nothing at all happened.
        mockUnreadableCount = 1;
        mockAllRecipesThrows = true;
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Back up my recipes, Writes a file and hands it to the share sheet."}));

        expect(mockExportBackup).not.toHaveBeenCalled();
        expect(mockNotify).toHaveBeenCalledWith(
            expect.objectContaining({tone: "error"})
        );
    });

    it("offers a way to remove the rows that cannot be read", async () => {
        mockUnreadableCount = 1;
        mockDeleteUnreadable.mockReturnValue(1);
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button", {name: /remove unreadable/i}));

        expect(mockDeleteUnreadable).toHaveBeenCalled();
    });

    it("clears the note once the unreadable rows are gone", async () => {
        mockUnreadableCount = 1;
        mockDeleteUnreadable.mockImplementation(() => {
            mockUnreadableCount = 0;
            return 1;
        });
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button", {name: /remove unreadable/i}));

        expect(screen.queryByTestId("unreadable-recipes-note")).toBeNull();
    });

    it("shows no unreadable-recipes note when the library is clean", async () => {
        mockUnreadableCount = 0;
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);
        expect(screen.queryByTestId("unreadable-recipes-note")).toBeNull();
    });

    it("carries the brew history into a backup", async () => {
        const history = [{id: "b1", rating: 4}];
        mockBrewStore.all.mockReturnValue(history);
        mockExportBackup.mockResolvedValue({ok: true});
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Back up my recipes, Writes a file and hands it to the share sheet."}));

        expect(mockExportBackup.mock.calls[0][3]).toBe(history);
    });

    it("restores the brews a backup carries, and says how many landed", async () => {
        mockLibraryRecipes = [];
        mockPickBackup.mockResolvedValue(
            backupOf([recipeNamed("A", "u1")], {}, [{id: "b1"}, {id: "b2"}])
        );
        mockApplyRestore.mockReturnValue({status: "restored", added: 1});
        mockBrewStore.restore.mockReturnValue(2);
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Restore from a backup, Adds anything your library does not already have."}));
        await settleSheet();
        await fireEvent.press(screen.getByRole("button", {name: /add to my library/i}));

        expect(mockBrewStore.restore).toHaveBeenCalledWith([{id: "b1"}, {id: "b2"}]);
        expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({
            tone: "success", message: "1 recipe and 2 brews restored"
        }));
    });

    it("says so when part of a history could not be read", async () => {
        // A short history is not a failed restore, but a user told only what
        // landed has no way to know something did not.
        mockLibraryRecipes = [];
        mockPickBackup.mockResolvedValue(
            backupOf([recipeNamed("A", "u1")], {}, [{id: "b1"}], 2)
        );
        mockApplyRestore.mockReturnValue({status: "restored", added: 1});
        mockBrewStore.restore.mockReturnValue(1);
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Restore from a backup, Adds anything your library does not already have."}));
        await settleSheet();
        await fireEvent.press(screen.getByRole("button", {name: /add to my library/i}));

        expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({
            tone: "success", message: "1 recipe and 1 brew restored"
        }));
        expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({
            tone: "error", message: "2 brews in that backup could not be read."
        }));
    });

    it("does not restore a history over a library that would not restore", async () => {
        mockLibraryRecipes = [];
        mockPickBackup.mockResolvedValue(backupOf([recipeNamed("A", "u1")], {}, [{id: "b1"}]));
        mockApplyRestore.mockReturnValue({status: "failed"});
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Restore from a backup, Adds anything your library does not already have."}));
        await settleSheet();
        await fireEvent.press(screen.getByRole("button", {name: /add to my library/i}));

        expect(mockBrewStore.restore).not.toHaveBeenCalled();
    });

    it("reports a replace that rolled back, and leaves the settings alone", async () => {
        // The critical fix, seen from the screen: a failed replace must reach
        // the user as a notice, not as an uncaught throw, and must not have
        // changed anything — including the preferences.
        const storage = memoryStorage();
        mockLibraryRecipes = [recipeNamed("Old", "old")];
        mockPickBackup.mockResolvedValue(
            backupOf([recipeNamed("A", "u1")], {temperatureUnit: "F"})
        );
        mockApplyRestore.mockReturnValue({status: "failed"});
        await renderWithProviders(<SettingsScreen settings={new Settings(storage)}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Restore from a backup, Adds anything your library does not already have."}));
        await settleSheet();
        await fireEvent.press(screen.getByRole("button", {name: /replace my library/i}));
        await fireEvent.press(screen.getByRole("button", {name: /yes, replace/i}));

        expect(mockApplyRestore).toHaveBeenCalledWith(expect.anything(), {replace: true});
        expect(mockNotify).toHaveBeenCalledWith(
            expect.objectContaining({tone: "error"})
        );
        expect(new Settings(storage).get("temperatureUnit")).toBe("C");
    });

    it("takes only the valid settings out of a restored backup, and only on success", async () => {
        // The settings block of a backup is arbitrary user-supplied JSON. A
        // good value is applied; a malformed one is ignored rather than trusted.
        const storage = memoryStorage();
        mockPickBackup.mockResolvedValue(
            backupOf([recipeNamed("A", "u1")], {temperatureUnit: "K", dotMatrixProfile: true})
        );
        mockApplyRestore.mockReturnValue({status: "restored", added: 1});
        await renderWithProviders(<SettingsScreen settings={new Settings(storage)}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Restore from a backup, Adds anything your library does not already have."}));
        await settleSheet();
        await fireEvent(screen.getByLabelText(/settings from this backup/i),
                        "checkedChange", true);
        await fireEvent.press(screen.getByRole("button", {name: /add to my library/i}));

        const restored = new Settings(storage);
        expect(restored.get("temperatureUnit")).toBe("C");
        expect(restored.get("dotMatrixProfile")).toBe(true);
    });

    it("presents its sheets outside the screen's flex container", async () => {
        // XbrwSheet is deliberately not `modal`, so it renders in place rather
        // than through a Portal. As a child of the screen's `flex={1}` YStack it
        // is an ordinary flex child sitting next to a ScrollView that takes the
        // space, so it resolves to zero height and draws nothing -- the failure
        // XbrwSheet's own comment calls looking "exactly like a control that did
        // nothing". On device that was Delete all doing nothing at all: the
        // press fired and the state flipped, but no sheet was ever drawn.
        //
        // The sheet must therefore be a sibling of the screen, which is the
        // shape app/index.tsx and app/editRecipe.tsx already use.
        mockLibraryRecipes = [recipeNamed("A", "u1")];
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Delete all recipes, Everything on this phone. There is no undo."}));
        await settleSheet();

        // The sheet is up...
        expect(screen.getByText(/deletes 1 recipe/i)).toBeTruthy();
        // ...and outside both the scroll view and the screen's flex container.
        expect(within(screen.getByTestId("settings-scroll"))
            .queryByText(/deletes 1 recipe/i)).toBeNull();
        expect(within(screen.getByTestId("settings-screen"))
            .queryByText(/deletes 1 recipe/i)).toBeNull();
    });

    it("deletes the whole library, on the real count, only after confirming", async () => {
        mockLibraryRecipes = [
            recipeNamed("A", "u1"), recipeNamed("B", "u2"), recipeNamed("C", "u3")
        ];
        mockDeleteAll.mockReturnValue({status: "deleted", deleted: 3});
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Delete all recipes, Everything on this phone. There is no undo."}));
        await settleSheet();

        // The sheet a thumb is about to act in says the real number, not a
        // placeholder zero.
        expect(screen.getByText(/deletes 3 recipes/i)).toBeTruthy();
        expect(mockDeleteAll).not.toHaveBeenCalled();

        await fireEvent.press(screen.getByRole("button", {name: /delete all 3 recipes/i}));

        expect(mockDeleteAll).toHaveBeenCalledTimes(1);
        expect(mockNotify).toHaveBeenCalledWith(
            expect.objectContaining({tone: "success", message: "3 recipes deleted"})
        );
    });

    it("says nothing was removed when the delete fails", async () => {
        // The screen used to report success unconditionally, so a delete that
        // failed left the user believing their library was gone while every
        // recipe was still in it -- the worst way round for this to be wrong.
        mockLibraryRecipes = [recipeNamed("A", "u1"), recipeNamed("B", "u2")];
        mockDeleteAll.mockReturnValue({status: "failed"});
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Delete all recipes, Everything on this phone. There is no undo."}));
        await settleSheet();
        await fireEvent.press(screen.getByRole("button", {name: /delete all 2 recipes/i}));

        expect(mockNotify).toHaveBeenCalledWith(
            expect.objectContaining({tone: "error", message: expect.stringMatching(/nothing was removed/i)})
        );
    });

    it("offers to delete everything, in the danger colour", async () => {
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        const row = screen.getByRole("button",
            {name: "Delete all recipes, Everything on this phone. There is no undo."});
        expect(row).toBeTruthy();
        expect(screen.getByText("Delete all recipes").props.style)
            .toEqual(expect.objectContaining({color: palette.danger}));
    });

    it("asks before deleting anything", async () => {
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Delete all recipes, Everything on this phone. There is no undo."}));

        expect(screen.getByText(/cannot be undone/i)).toBeTruthy();
    });

    it("opens About from the top of the screen, not the bottom", async () => {
        await renderWithProviders(<SettingsScreen settings={accountOn()}/>);

        // SettingsActionRow folds its label and detail into one accessible
        // name (see components/__tests__/SettingsRows.test.tsx), so the row's
        // full name is "About XBRW++, Version ..." rather than the label
        // alone — matched here in full, not by a prefix, so this test would
        // notice if the version ever stopped reaching the name.
        const version = Application.nativeApplicationVersion ?? "unknown";
        const about = screen.getByRole("button", {name: `About XBRW++, Version ${version}`});
        await fireEvent.press(about);

        expect(mockPush).toHaveBeenCalledWith("/about");

        // The name only proves the row exists and works; it says nothing about
        // where it sits. Moving About to the bottom — the regression this test
        // is named for — would leave the assertion above green, so position is
        // checked directly against every other section, including the two
        // this task adds.
        const order = renderOrder(screen.toJSON());
        const indexOf = (text: string) => order.indexOf(text);
        expect(indexOf("About XBRW++")).toBeGreaterThanOrEqual(0);
        expect(indexOf("About XBRW++")).toBeLessThan(indexOf("RECIPE LIST"));
        expect(indexOf("RECIPE LIST")).toBeLessThan(indexOf("UNITS"));
        expect(indexOf("UNITS")).toBeLessThan(indexOf("XBLOOM ACCOUNT"));
        expect(indexOf("XBLOOM ACCOUNT")).toBeLessThan(indexOf("LIBRARY"));
    });

    it("offers sign-in under its own heading when no account is connected", async () => {
        await renderWithProviders(<SettingsScreen settings={accountOn()}/>);

        // The heading, not just the row: a section whose title went missing
        // still works and still reads as part of whatever sits above it.
        await waitFor(() => expect(screen.getByText("XBLOOM ACCOUNT")).toBeTruthy());
        // SettingsActionRow folds label and detail into one accessible name.
        await fireEvent.press(screen.getByRole("button",
            {name: "Sign in, Bring across the recipes you made in the xBloom app."}));

        expect(mockPush).toHaveBeenCalledWith("/importCloud");
        // Nothing to sign out of yet.
        expect(screen.queryByRole("button", {name: "Sign out"})).toBeNull();
    });

    it("names the connected account and offers a way out of it", async () => {
        mockLoadSession.mockResolvedValue({memberId: 7, token: "t", email: "sam@example.com"});

        await renderWithProviders(<SettingsScreen settings={accountOn()}/>);

        // The email is what tells someone which account they are looking at,
        // so it is shown rather than a bare "Signed in".
        await waitFor(() => expect(screen.getByRole("button",
            {name: "Import recipes, sam@example.com"})).toBeTruthy());
        expect(screen.queryByRole("button", {name: /^Sign in/})).toBeNull();

        await fireEvent.press(screen.getByRole("button", {name: "Sign out"}));

        await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
        // Signing out is not a navigation: it happens here, and the section
        // falls back to offering sign-in.
        await waitFor(() => expect(screen.getByRole("button",
            {name: "Sign in, Bring across the recipes you made in the xBloom app."})).toBeTruthy());
        expect(mockPush).not.toHaveBeenCalled();
    });

    it("says so when the keychain would not let go of the account", async () => {
        // `signOut` is undefended on purpose, so this call site must not
        // swallow it. Silence would leave someone believing they had signed out
        // of an account they had not -- the one failure here with a privacy
        // cost -- and the row correctly still says they are connected.
        mockLoadSession.mockResolvedValue({memberId: 7, token: "t", email: "sam@example.com"});
        mockSignOut.mockRejectedValue(new Error("keychain locked"));

        await renderWithProviders(<SettingsScreen settings={accountOn()}/>);
        await waitFor(() => expect(screen.getByRole("button", {name: "Sign out"})).toBeTruthy());

        await fireEvent.press(screen.getByRole("button", {name: "Sign out"}));

        await waitFor(() => expect(mockNotify).toHaveBeenCalledWith({
            tone:    "error",
            message: "Could not sign out. The account is still connected."
        }));
        expect(screen.getByRole("button",
            {name: "Import recipes, sam@example.com"})).toBeTruthy();
    });

    it("opens the importer from the connected account too", async () => {
        mockLoadSession.mockResolvedValue({memberId: 7, token: "t", email: "sam@example.com"});

        await renderWithProviders(<SettingsScreen settings={accountOn()}/>);

        await waitFor(() => expect(screen.getByRole("button",
            {name: "Import recipes, sam@example.com"})).toBeTruthy());
        await fireEvent.press(screen.getByRole("button",
            {name: "Import recipes, sam@example.com"}));

        expect(mockPush).toHaveBeenCalledWith("/importCloud");
    });

    it("offers a retention choice, including keeping none", async () => {
        const {getByText} = await renderWithProviders(
            <SettingsScreen settings={new Settings(memoryStorage())}/>
        );
        expect(getByText("Don't keep traces")).toBeTruthy();
    });

    describe("the gate", () => {
        it("shows nothing about an xBloom account while the feature is off", async () => {
            await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

            // The heading as well as the rows. A section title left behind
            // would read as part of whatever section follows it.
            expect(screen.queryByText("XBLOOM ACCOUNT")).toBeNull();
            expect(screen.queryByRole("button", {name: /^Sign in/})).toBeNull();
            expect(screen.queryByRole("button", {name: "Sign out"})).toBeNull();
        });

        it("never asks the keychain about an account nobody enabled", async () => {
            // The part of the gate that matters more than the drawing. Reading
            // the token and then ignoring it would still be a Keychain prompt
            // on a device, shown to somebody who has never heard of this
            // feature.
            await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

            await waitFor(() => expect(screen.getByText("LIBRARY")).toBeTruthy());
            expect(mockLoadSession).not.toHaveBeenCalled();
        });

        it("reads the account only once the feature is switched on", async () => {
            await renderWithProviders(<SettingsScreen settings={accountOn()}/>);

            await waitFor(() => expect(mockLoadSession).toHaveBeenCalled());
        });

        it("hides Labs until somebody has gone looking for it", async () => {
            await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

            expect(screen.queryByText("LABS")).toBeNull();
            expect(screen.queryByText("xBloom account import")).toBeNull();
        });

        it("offers the feature, and a way back out, once Labs is open", async () => {
            const settings = new Settings(memoryStorage());
            settings.set("labsUnlocked", true);

            await renderWithProviders(<SettingsScreen settings={settings}/>);

            expect(screen.getByText("LABS")).toBeTruthy();
            // Said plainly rather than hedged. Somebody who switches this on
            // and then hits a wall should have been told a wall was there in
            // the same breath as being offered it.
            expect(screen.getByText(/Unfinished and unsupported/)).toBeTruthy();

            await fireEvent.press(screen.getByRole("switch",
                {name: "xBloom account import"}));

            expect(settings.get("cloudAccountEnabled")).toBe(true);
        });

        it("closes Labs from inside it, and leaves what you switched on alone", async () => {
            // The way in can afford to be undiscoverable because nobody
            // arrives at it by accident. A way out that nobody can find is
            // just a trap.
            const settings = new Settings(memoryStorage());
            settings.set("labsUnlocked", true);
            settings.set("cloudAccountEnabled", true);

            await renderWithProviders(<SettingsScreen settings={settings}/>);

            await fireEvent.press(screen.getByRole("button",
                {name: "Hide Labs, Anything you switched on here stays on."}));

            expect(settings.get("labsUnlocked")).toBe(false);
            expect(settings.get("cloudAccountEnabled")).toBe(true);
            expect(screen.queryByText("LABS")).toBeNull();
            // Two separate switches, so the section going away does not take
            // the account section with it.
            expect(screen.getByText("XBLOOM ACCOUNT")).toBeTruthy();
        });

        it("will not let a backup file hand anybody Labs", async () => {
            // A backup is not private: it goes to the share sheet. The keys are
            // held out of the snapshot so one cannot carry them, and left out
            // of the allowlist above so a hand-written one cannot either. This
            // is the second of those two locks -- the first is the compile-time
            // `BackupExcluded`, which no test can observe.
            const storage = memoryStorage();
            mockPickBackup.mockResolvedValue(backupOf(
                [recipeNamed("A", "u1")],
                {labsUnlocked: true, cloudAccountEnabled: true, dotMatrixProfile: true}
            ));
            mockApplyRestore.mockReturnValue({status: "restored", added: 1});
            await renderWithProviders(<SettingsScreen settings={new Settings(storage)}/>);

            await fireEvent.press(screen.getByRole("button",
                {name: "Restore from a backup, Adds anything your library does not already have."}));
            await settleSheet();
            await fireEvent(screen.getByLabelText(/settings from this backup/i),
                            "checkedChange", true);
            await fireEvent.press(screen.getByRole("button", {name: /add to my library/i}));

            const restored = new Settings(storage);
            expect(restored.get("labsUnlocked")).toBe(false);
            expect(restored.get("cloudAccountEnabled")).toBe(false);
            // The rest of the block still landed, so this is the two keys being
            // refused and not the restore quietly failing.
            expect(restored.get("dotMatrixProfile")).toBe(true);
        });
    });
});

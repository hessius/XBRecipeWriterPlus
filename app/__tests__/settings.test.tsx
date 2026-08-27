import * as Application from "expo-application";
import React from "react";
import {screen, fireEvent, act} from "@testing-library/react-native";
import type {ReactTestRendererJSON} from "react-test-renderer";

import SettingsScreen from "@/app/settings";
import {palette} from "@/constants/colors";
import Recipe from "@/library/Recipe";
import {Settings, type SettingsStorage} from "@/library/Settings";
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
    useRouter: () => ({push: mockPush})
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
const mockRefresh = jest.fn();
const mockDeleteAll = jest.fn();
const mockApplyRestore = jest.fn();
jest.mock("@/hooks/useRecipeLibrary", () => ({
    useRecipeLibrary: () => ({
        recipes:         mockLibraryRecipes,
        refresh:         mockRefresh,
        deleteRecipe:    jest.fn(),
        duplicateRecipe: jest.fn(),
        deleteAll:       mockDeleteAll,
        applyRestore:    mockApplyRestore
    })
}));

function recipeNamed(name: string, uuid: string): Recipe {
    const recipe = new Recipe();
    recipe.name = name;
    recipe.uuid = uuid;
    return recipe;
}

function backupOf(recipes: Recipe[], settings: Record<string, unknown> = {}) {
    return {
        cancelled: false,
        result: {
            ok: true,
            payload: {
                recipes,
                settings,
                skipped: 0,
                appVersion: "2.6.0",
                exportedAt: "2026-08-26T21:00:00.000Z"
            }
        }
    };
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
            mockLibraryRecipes,
            expect.objectContaining({
                showCoffeeMarker: expect.any(Boolean),
                dotMatrixProfile: expect.any(Boolean),
                temperatureUnit:  expect.any(String)
            }),
            expect.any(String)
        );
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

    it("deletes the whole library, on the real count, only after confirming", async () => {
        mockLibraryRecipes = [
            recipeNamed("A", "u1"), recipeNamed("B", "u2"), recipeNamed("C", "u3")
        ];
        mockDeleteAll.mockReturnValue(3);
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
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

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
        expect(indexOf("UNITS")).toBeLessThan(indexOf("LIBRARY"));
    });
});

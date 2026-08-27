import * as Application from "expo-application";
import React from "react";
import {screen, fireEvent} from "@testing-library/react-native";
import type {ReactTestRendererJSON} from "react-test-renderer";

import SettingsScreen from "@/app/settings";
import {palette} from "@/constants/colors";
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
// The screen has no seam of its own for this (unlike HomeScreen's `db` prop),
// so the hook is mocked here rather than exercising SQLite in every test.
const mockRefresh = jest.fn();
jest.mock("@/hooks/useRecipeLibrary", () => ({
    useRecipeLibrary: () => ({
        recipes:         [],
        refresh:         mockRefresh,
        deleteRecipe:    jest.fn(),
        duplicateRecipe: jest.fn()
    })
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

describe("SettingsScreen", () => {
    beforeEach(() => jest.clearAllMocks());

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
        // The user withdrew. A message would be the app arguing with them.
        mockPickBackup.mockResolvedValue({cancelled: true});
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Restore from a backup, Adds anything your library does not already have."}));

        expect(mockNotify).not.toHaveBeenCalled();
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

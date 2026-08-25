import React from "react";
import {screen, fireEvent} from "@testing-library/react-native";

import SettingsScreen from "@/app/settings";
import {Settings, type SettingsStorage} from "@/library/Settings";
import {renderWithProviders} from "@/test-utils/render";

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

    it("offers the one-line hints, off unless they have been turned on", async () => {
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);
        expect(screen.getByLabelText("One-line hints")
            .props.accessibilityState.checked).toBe(false);
    });

    it("persists the one-line hints", async () => {
        const storage = memoryStorage();

        await renderWithProviders(<SettingsScreen settings={new Settings(storage)}/>);
        await fireEvent(screen.getByLabelText("One-line hints"), "checkedChange", true);

        expect(new Settings(storage).get("showHints")).toBe(true);
    });

    it("no longer asks where the field explanations go", async () => {
        // There were two, and neither survived a phone. The long form is one
        // sheet behind the caret now, so there is nothing left to choose.
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        expect(screen.queryByText(/Field explanations/)).toBeNull();
    });
});

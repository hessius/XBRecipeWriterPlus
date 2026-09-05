import React from "react";
import {screen} from "@testing-library/react-native";

import SettingsChoiceRow from "@/components/SettingsChoiceRow";
import {renderWithProviders} from "@/test-utils/render";

const FOUR_OPTIONS = [
    {value: "edge", label: "EDGE"},
    {value: "tab", label: "TAB"},
    {value: "chip", label: "CHIP"},
    {value: "swipe", label: "SWIPE"}
] as const;

const TWO_OPTIONS = [
    {value: "C", label: "°C"},
    {value: "F", label: "°F"}
] as const;

describe("SettingsChoiceRow", () => {
    it("puts a wide choice on its own line", async () => {
        await renderWithProviders(
            <SettingsChoiceRow stacked label="Shortcut shape" description="Which one."
                               value="edge" options={FOUR_OPTIONS}
                               onChange={() => undefined}/>
        );
        // Beside a flexible label, four segments squeeze the description to a
        // four-line wrap. Stacking is a layout, not a different control.
        expect(screen.getByTestId("settings-choice-stacked")).toBeTruthy();
    });

    it("keeps a narrow choice beside its label", async () => {
        await renderWithProviders(
            <SettingsChoiceRow label="Temperature" description="Which one."
                               value="C" options={TWO_OPTIONS}
                               onChange={() => undefined}/>
        );
        expect(screen.queryByTestId("settings-choice-stacked")).toBeNull();
    });
});

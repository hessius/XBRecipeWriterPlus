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

/** The real retention options, which is where this was first seen to break. */
const RETENTION_OPTIONS = [
    {value: "10", label: "10"},
    {value: "50", label: "50"},
    {value: "200", label: "200"},
    {value: "0", label: "Don't keep traces"}
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

    /**
     * The retention row shipped without `stacked` and collapsed its label to
     * one word per line. Forgetting the prop must cost a taller row, not a
     * broken one, so a wide set of options stacks on its own.
     */
    it("stacks a wide set of options even when not asked to", async () => {
        await renderWithProviders(
            <SettingsChoiceRow label="Keep raw brew traces" description="Which one."
                               value="50" options={RETENTION_OPTIONS}
                               onChange={() => undefined}/>
        );
        expect(screen.getByTestId("settings-choice-stacked")).toBeTruthy();
    });

    it("still obeys an explicit request to sit beside the label", async () => {
        await renderWithProviders(
            <SettingsChoiceRow stacked={false} label="Keep raw brew traces"
                               description="Which one." value="50"
                               options={RETENTION_OPTIONS}
                               onChange={() => undefined}/>
        );
        expect(screen.queryByTestId("settings-choice-stacked")).toBeNull();
    });
});

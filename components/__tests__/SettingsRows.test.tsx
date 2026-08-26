import React from "react";
import {screen, fireEvent} from "@testing-library/react-native";

import SettingsActionRow from "@/components/SettingsActionRow";
import SettingsChoiceRow from "@/components/SettingsChoiceRow";
import SettingsToggleRow from "@/components/SettingsToggleRow";
import {palette} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";

describe("SettingsToggleRow", () => {
    it("shows the label, the description and the switch in its state", async () => {
        await renderWithProviders(
            <SettingsToggleRow label="Show the COFFEE marker"
                               description="Redundant in a mostly-coffee library."
                               value onChange={() => {}}/>
        );

        expect(screen.getByText("Show the COFFEE marker")).toBeTruthy();
        expect(screen.getByText("Redundant in a mostly-coffee library.")).toBeTruthy();
        expect(screen.getByLabelText("Show the COFFEE marker")
            .props.accessibilityState.checked).toBe(true);
    });

    it("reports a change", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <SettingsToggleRow label="Dot matrix" description="d" value={false}
                               onChange={onChange}/>
        );

        await fireEvent(screen.getByLabelText("Dot matrix"), "checkedChange", true);

        expect(onChange).toHaveBeenCalledWith(true);
    });
});

describe("SettingsChoiceRow", () => {
    const OPTIONS = [{value: "C", label: "°C"}, {value: "F", label: "°F"}];

    it("shows the label and the option that is on", async () => {
        await renderWithProviders(
            <SettingsChoiceRow label="Temperature" description="How hot the water is shown."
                               value="F" options={OPTIONS} onChange={() => {}}/>
        );

        expect(screen.getByText("Temperature")).toBeTruthy();
        expect(screen.getByLabelText("°F").props.accessibilityState.checked).toBe(true);
    });

    it("reports the option that was chosen", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <SettingsChoiceRow label="Temperature" description="d" value="C"
                               options={OPTIONS} onChange={onChange}/>
        );

        await fireEvent.press(screen.getByLabelText("°F"));

        expect(onChange).toHaveBeenCalledWith("F");
    });
});

describe("SettingsActionRow", () => {
    it("is a button carrying its label and detail", async () => {
        await renderWithProviders(
            <SettingsActionRow label="About XBRW++" detail="Version 2.6.0"
                               onPress={() => {}}/>
        );

        // One button announcing both: the detail must not depend on VoiceOver
        // hints being switched on.
        const row = screen.getByRole("button", {name: "About XBRW++, Version 2.6.0"});
        expect(row).toBeTruthy();
        expect(screen.getByText("Version 2.6.0")).toBeTruthy();
    });

    it("runs its action when pressed", async () => {
        const onPress = jest.fn();
        await renderWithProviders(
            <SettingsActionRow label="Back up my recipes" onPress={onPress}/>
        );

        await fireEvent.press(screen.getByRole("button", {name: "Back up my recipes"}));

        expect(onPress).toHaveBeenCalled();
    });

    it("draws a destructive row in the danger colour", async () => {
        await renderWithProviders(
            <SettingsActionRow label="Delete all recipes" tone="danger" onPress={() => {}}/>
        );

        expect(screen.getByText("Delete all recipes").props.style)
            .toEqual(expect.objectContaining({color: palette.danger}));
    });

    it("draws an ordinary row in the text colour", async () => {
        await renderWithProviders(
            <SettingsActionRow label="Back up my recipes" onPress={() => {}}/>
        );

        expect(screen.getByText("Back up my recipes").props.style)
            .toEqual(expect.objectContaining({color: palette.text}));
    });
});

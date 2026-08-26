import React from "react";
import {Text} from "react-native";
import {screen} from "@testing-library/react-native";

import SettingsSection from "@/components/SettingsSection";
import {renderWithProviders} from "@/test-utils/render";

describe("SettingsSection", () => {
    it("heads its rows with the title, in upper case", async () => {
        await renderWithProviders(
            <SettingsSection title="Recipe list">
                <Text>a row</Text>
            </SettingsSection>
        );

        expect(screen.getByText("RECIPE LIST")).toBeTruthy();
        expect(screen.getByText("a row")).toBeTruthy();
    });

    it("draws no heading when it has no title", async () => {
        // The identity section at the top of the screen is the whole reason
        // this is optional: a heading above the app's own name would be
        // labelling the label.
        await renderWithProviders(
            <SettingsSection>
                <Text>a row</Text>
            </SettingsSection>
        );

        expect(screen.queryByTestId("settings-section-title")).toBeNull();
        expect(screen.getByText("a row")).toBeTruthy();
    });
});

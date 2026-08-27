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

    it("separates rows with one divider between each, and none at the ends", async () => {
        // Three rows means two dividers: the card's rounded corners must not
        // carry a hairline above the first row or below the last, or they read
        // as a clipped rectangle rather than a grouped card.
        await renderWithProviders(
            <SettingsSection title="Group">
                <Text>one</Text>
                <Text>two</Text>
                <Text>three</Text>
            </SettingsSection>
        );

        expect(screen.getAllByTestId("settings-row-divider")).toHaveLength(2);
    });

    it("draws no divider for a single row", async () => {
        // A lone row has nothing to be divided from; a hairline under it would
        // be a stray line short of the card's rounded bottom.
        await renderWithProviders(
            <SettingsSection title="Group">
                <Text>only</Text>
            </SettingsSection>
        );

        expect(screen.queryByTestId("settings-row-divider")).toBeNull();
    });

    it("ignores a row that renders nothing when counting dividers", async () => {
        // A conditional row collapses to `false`, and a divider drawn for a row
        // that is not there would double up against its neighbour.
        await renderWithProviders(
            <SettingsSection title="Group">
                <Text>one</Text>
                {false}
                <Text>two</Text>
            </SettingsSection>
        );

        expect(screen.getAllByTestId("settings-row-divider")).toHaveLength(1);
    });
});


import React from "react";
import {StyleSheet} from "react-native";

import ExportButton from "@/components/ExportButton";
import {renderWithProviders} from "@/test-utils/render";

describe("ExportButton", () => {
    it("shouts its label in the dot-matrix face", async () => {
        const {getByText} = await renderWithProviders(
            <ExportButton label="Save as image" busy={false} onPress={jest.fn()} />
        );

        expect(getByText("SAVE AS IMAGE")).toBeTruthy();
    });

    it("says it is working while the export is in flight", async () => {
        const {getByText, queryByText} = await renderWithProviders(
            <ExportButton label="Save as image" busy={true} onPress={jest.fn()} />
        );

        expect(getByText("WORKING…")).toBeTruthy();
        expect(queryByText("SAVE AS IMAGE")).toBeNull();
    });

    it("does not fire again while it is working", async () => {
        const onPress = jest.fn();
        const {getByLabelText} = await renderWithProviders(
            <ExportButton label="Save as image" busy={true} onPress={onPress} />
        );

        expect(getByLabelText("Save as image").props.accessibilityState)
            .toEqual(expect.objectContaining({disabled: true}));
    });

    it("dims itself while it is working", async () => {
        const {getByLabelText} = await renderWithProviders(
            <ExportButton label="Save as image" busy={true} onPress={jest.fn()} />
        );

        const style = StyleSheet.flatten(getByLabelText("Save as image").props.style);
        expect(style.opacity).toBe(0.5);
    });

    it("is at full strength when it is not working", async () => {
        const {getByLabelText} = await renderWithProviders(
            <ExportButton label="Save as image" busy={false} onPress={jest.fn()} />
        );

        const style = StyleSheet.flatten(getByLabelText("Save as image").props.style);
        expect(style.opacity).toBe(1);
    });
});

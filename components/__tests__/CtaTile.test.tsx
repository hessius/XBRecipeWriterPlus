import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import CtaTile from "@/components/CtaTile";
import {renderWithProviders} from "@/test-utils/render";

describe("CtaTile", () => {
    it("renders its label", async () => {
        await renderWithProviders(
            <CtaTile icon="scan" label="SCAN" onPress={jest.fn()}/>
        );
        expect(screen.getByText("SCAN")).toBeTruthy();
    });

    it("calls onPress when tapped", async () => {
        const onPress = jest.fn();
        await renderWithProviders(
            <CtaTile icon="scan" label="SCAN" onPress={onPress}/>
        );

        await fireEvent.press(screen.getByRole("button", {name: "SCAN"}));

        expect(onPress).toHaveBeenCalledTimes(1);
    });

    it("does not call onPress when disabled", async () => {
        const onPress = jest.fn();
        await renderWithProviders(
            <CtaTile icon="scan" label="SCAN" onPress={onPress} disabled/>
        );

        await fireEvent.press(screen.getByRole("button", {name: "SCAN"}));

        expect(onPress).not.toHaveBeenCalled();
    });

    it("uses the accessibility label when the Doto label is an abbreviation", async () => {
        await renderWithProviders(
            <CtaTile icon="scan" label="SCAN" accessibilityLabel="Scan a card"
                     onPress={jest.fn()}/>
        );
        expect(screen.getByRole("button", {name: "Scan a card"})).toBeTruthy();
    });
});

import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import DeckSwitch from "@/components/DeckSwitch";
import {renderWithProviders} from "@/test-utils/render";

describe("DeckSwitch", () => {
    it("names both decks and counts the stages", async () => {
        await renderWithProviders(
            <DeckSwitch deck="brew" stageCount={3} onChange={jest.fn()}/>
        );

        expect(screen.getByLabelText("Brew settings")).toBeTruthy();
        expect(screen.getByLabelText("Stages, 3")).toBeTruthy();
    });

    it("marks the active deck", async () => {
        await renderWithProviders(
            <DeckSwitch deck="stages" stageCount={3} onChange={jest.fn()}/>
        );

        expect(screen.getByLabelText("Stages, 3").props.accessibilityState.selected).toBe(true);
        expect(screen.getByLabelText("Brew settings").props.accessibilityState.selected).toBe(false);
    });

    it("reports a switch", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <DeckSwitch deck="brew" stageCount={2} onChange={onChange}/>
        );

        await fireEvent.press(screen.getByLabelText("Stages, 2"));

        expect(onChange).toHaveBeenCalledWith("stages");
    });

    it("does not report a switch to the deck already showing", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <DeckSwitch deck="brew" stageCount={2} onChange={onChange}/>
        );

        await fireEvent.press(screen.getByLabelText("Brew settings"));

        expect(onChange).not.toHaveBeenCalled();
    });
});

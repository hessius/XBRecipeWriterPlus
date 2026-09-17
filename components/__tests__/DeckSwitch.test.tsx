import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import DeckSwitch from "@/components/DeckSwitch";
import {renderWithProviders} from "@/test-utils/render";

describe("DeckSwitch", () => {
    it("names all three decks and counts the stages", async () => {
        await renderWithProviders(
            <DeckSwitch deck="brew" stageCount={3} onChange={jest.fn()}/>
        );

        expect(screen.getByLabelText("Brew settings")).toBeTruthy();
        expect(screen.getByLabelText("Stages, 3")).toBeTruthy();
        expect(screen.getByLabelText("About this recipe")).toBeTruthy();
    });

    it("gives every deck the same share of the row", async () => {
        // The segments are flex: 1 rather than a measured half, which is the
        // whole reason a third one costs nothing. RNTL runs no layout, so this
        // is the only claim about width a test can make.
        await renderWithProviders(
            <DeckSwitch deck="brew" stageCount={3} onChange={jest.fn()}/>
        );

        for (const spoken of ["Brew settings", "Stages, 3", "About this recipe"]) {
            expect(screen.getByLabelText(spoken)).toHaveStyle({flex: 1});
        }
    });

    it("speaks each deck as a tab, so a reader knows the screen swaps", async () => {
        await renderWithProviders(
            <DeckSwitch deck="about" stageCount={3} onChange={jest.fn()}/>
        );

        for (const spoken of ["Brew settings", "Stages, 3", "About this recipe"]) {
            expect(screen.getByLabelText(spoken).props.accessibilityRole).toBe("tab");
        }
        expect(screen.getByLabelText("About this recipe")
            .props.accessibilityState.selected).toBe(true);
        expect(screen.getByLabelText("Brew settings")
            .props.accessibilityState.selected).toBe(false);
    });

    it("reports a switch to the about deck", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <DeckSwitch deck="brew" stageCount={2} onChange={onChange}/>
        );

        await fireEvent.press(screen.getByLabelText("About this recipe"));

        expect(onChange).toHaveBeenCalledWith("about");
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

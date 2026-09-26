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

    it("gives the widest label the most room", async () => {
        // RNTL runs no layout, so this can only assert the style rule that
        // drives native flex width. Changing production back to equal flexGrow
        // values is the edit that should break this test.
        await renderWithProviders(
            <DeckSwitch deck="brew" stageCount={12} onChange={jest.fn()}/>
        );

        const brew = screen.getByLabelText("Brew settings");
        const stages = screen.getByLabelText("Stages, 12");
        const about = screen.getByLabelText("About this recipe");

        expect(stages).toHaveStyle({flexBasis: 0, flexShrink: 1});
        expect(new Set([
            brew.props.style.flexGrow,
            stages.props.style.flexGrow,
            about.props.style.flexGrow
        ]).size).toBeGreaterThan(1);
        expect(stages.props.style.flexGrow).toBeGreaterThan(about.props.style.flexGrow);
        expect(about.props.style.flexGrow).toBeGreaterThan(brew.props.style.flexGrow);
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

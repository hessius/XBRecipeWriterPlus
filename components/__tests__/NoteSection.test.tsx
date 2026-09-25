import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import NoteSection from "@/components/NoteSection";
import {palette} from "@/constants/colors";
import {MAX_DESCRIPTION} from "@/library/Recipe";
import {renderWithProviders} from "@/test-utils/render";

function props(over: Partial<React.ComponentProps<typeof NoteSection>> = {}) {
    return {
        initialValue: "",
        onDraft:      jest.fn(),
        onCommit:     jest.fn(),
        ...over
    };
}

describe("NoteSection", () => {
    it("stops the note at the cap where it is typed", async () => {
        // The cap belongs to the field, not to the row that draws it. A limit
        // met by having your words vanish at the library card is a bug.
        await renderWithProviders(<NoteSection {...props()}/>);

        expect(screen.getByTestId("note-field").props.maxLength)
            .toBe(MAX_DESCRIPTION);
    });

    it("draws the placeholder at a readable contrast", async () => {
        // `muted` on `raised` is 3.55:1, under the 4.5:1 floor, and the
        // placeholder is the only thing saying what belongs in an empty field.
        await renderWithProviders(<NoteSection {...props()}/>);

        expect(screen.getByTestId("note-field").props.placeholderTextColor)
            .toBe(palette.dim);
    });

    it("counts what is left while it is being typed", async () => {
        await renderWithProviders(<NoteSection {...props()}/>);
        expect(screen.getByTestId("note-counter", {includeHiddenElements: true}))
            .toHaveTextContent(`0/${MAX_DESCRIPTION}`);

        await fireEvent.changeText(screen.getByTestId("note-field"), "Sweet");

        expect(screen.getByTestId("note-counter", {includeHiddenElements: true}))
            .toHaveTextContent(`5/${MAX_DESCRIPTION}`);
    });

    it("opens on the note the recipe already has, counted", async () => {
        await renderWithProviders(<NoteSection {...props({initialValue: "Mornings"})}/>);

        expect(screen.getByTestId("note-field").props.defaultValue).toBe("Mornings");
        expect(screen.getByTestId("note-counter", {includeHiddenElements: true}))
            .toHaveTextContent(`8/${MAX_DESCRIPTION}`);
    });

    it("reports every keystroke as a draft, so an unblurred note is not lost", async () => {
        // SAVE and Back are presses, and a press does not blur a focused
        // input: without the draft the note would never reach the recipe.
        const onDraft = jest.fn();
        await renderWithProviders(<NoteSection {...props({onDraft})}/>);

        await fireEvent.changeText(screen.getByTestId("note-field"), "Sweet and");

        expect(onDraft).toHaveBeenCalledWith("Sweet and");
    });

    it("commits when editing ends", async () => {
        const onCommit = jest.fn();
        await renderWithProviders(<NoteSection {...props({onCommit})}/>);

        await fireEvent(screen.getByTestId("note-field"), "endEditing",
                        {nativeEvent: {text: "Good for mornings"}});

        expect(onCommit).toHaveBeenCalledWith("Good for mornings");
    });

    it("keeps the counter out of the screen reader's way", async () => {
        // The ceiling is in the field's own hint. Announced here as well, it
        // would be reread after every single character.
        await renderWithProviders(<NoteSection {...props()}/>);

        expect(screen.queryByTestId("note-counter")).toBeNull();
    });
});

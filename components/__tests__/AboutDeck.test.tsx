import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import AboutDeck from "@/components/AboutDeck";
import Recipe from "@/library/Recipe";
import {renderWithProviders} from "@/test-utils/render";

function recipeWith(over: Partial<Recipe> = {}): Recipe {
    return Object.assign(new Recipe(), over);
}

function props(over: Partial<React.ComponentProps<typeof AboutDeck>> = {}) {
    return {
        recipe:             recipeWith(),
        showHint:           false,
        dispatch:           jest.fn(),
        onDraft:            jest.fn(),
        onInputErrorChange: jest.fn(),
        xidLookupFailed:    false,
        externalEpoch:      0,
        onXidFocusChange:   jest.fn(),
        ...over
    };
}

describe("AboutDeck", () => {
    it("holds the two fields that are identity rather than brew parameters", async () => {
        await renderWithProviders(<AboutDeck {...props()}/>);

        expect(screen.getByLabelText("Recipe ID")).toBeTruthy();
        expect(screen.getByLabelText("Name")).toBeTruthy();
    });

    it("holds the note, which is what a recipe is for rather than what it does", async () => {
        await renderWithProviders(
            <AboutDeck {...props({recipe: recipeWith({description: "Mornings"})})}/>
        );

        expect(screen.getByTestId("note-field").props.defaultValue).toBe("Mornings");
    });

    it("commits the note to the recipe", async () => {
        const dispatch = jest.fn();
        await renderWithProviders(<AboutDeck {...props({dispatch})}/>);

        await fireEvent(screen.getByTestId("note-field"), "endEditing",
                        {nativeEvent: {text: "Mornings"}});

        expect(dispatch).toHaveBeenCalledWith("Note", "Mornings");
    });

    it("reports the ID field's focus, so the lookup can be deferred", async () => {
        // The machinery moved with the field rather than being rewritten. A
        // lookup resolving while the field is focused resets the uncontrolled
        // input and eats keystrokes, which is what this report exists to stop.
        const onXidFocusChange = jest.fn();
        await renderWithProviders(<AboutDeck {...props({onXidFocusChange})}/>);

        await fireEvent(screen.getByLabelText("Recipe ID"), "focus");
        expect(onXidFocusChange).toHaveBeenCalledWith(true);

        await fireEvent(screen.getByLabelText("Recipe ID"), "blur");
        expect(onXidFocusChange).toHaveBeenCalledWith(false);
    });

    it("marks a failed lookup as a note rather than an error", async () => {
        await renderWithProviders(<AboutDeck {...props({xidLookupFailed: true})}/>);

        // `FieldRow` draws a note onto the field's own title, not beside it.
        expect(screen.getByText("Recipe ID · not found")).toBeTruthy();
        // Not the validation failure: a recipe with an ID nobody could look up
        // is still a recipe that saves and writes.
        expect(screen.queryByText(/Not a valid ID/i)).toBeNull();
    });

    it("commits the ID and the name to their own labels", async () => {
        const dispatch = jest.fn();
        await renderWithProviders(<AboutDeck {...props({dispatch})}/>);

        await fireEvent(screen.getByLabelText("Recipe ID"), "endEditing",
                        {nativeEvent: {text: "CGL12"}});
        await fireEvent(screen.getByLabelText("Name"), "endEditing",
                        {nativeEvent: {text: "Yirgacheffe"}});

        expect(dispatch).toHaveBeenCalledWith("XID", "CGL12");
        expect(dispatch).toHaveBeenCalledWith("Title", "Yirgacheffe");
    });

    it("closes the save gate on an ID no pod could carry", async () => {
        const onInputErrorChange = jest.fn();
        await renderWithProviders(<AboutDeck {...props({onInputErrorChange})}/>);

        await fireEvent.changeText(screen.getByLabelText("Recipe ID"), "!!bad");

        expect(onInputErrorChange).toHaveBeenLastCalledWith(true);
        expect(screen.getByText(/Not a valid ID/i)).toBeTruthy();
    });
});

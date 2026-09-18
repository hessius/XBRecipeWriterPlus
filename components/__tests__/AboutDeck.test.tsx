import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import AboutDeck from "@/components/AboutDeck";
import {palette} from "@/constants/colors";
import Recipe from "@/library/Recipe";
import {renderWithProviders} from "@/test-utils/render";

function recipeWith(over: Partial<Recipe> = {}): Recipe {
    return Object.assign(new Recipe(), over);
}

function props(over: Partial<React.ComponentProps<typeof AboutDeck>> = {}) {
    return {
        recipe:             recipeWith(),
        accent:             palette.info,
        showAvatar:         false,
        brews:              {times: 0, lastAt: 0, avgRating: 0, rated: 0},
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
    it("holds the ID, which is a lookup key rather than a brew parameter", async () => {
        await renderWithProviders(<AboutDeck {...props()}/>);

        expect(screen.getByLabelText("Recipe ID")).toBeTruthy();
    });

    it("offers no second place to type the name", async () => {
        // The name is the header, renamed through a sheet from any deck. A row
        // here as well would be two controls for one field, each able to be
        // showing something the other is not.
        await renderWithProviders(<AboutDeck {...props()}/>);

        expect(screen.queryByLabelText("Name")).toBeNull();
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

    it("carries all four sections, in the order the deck reads in", async () => {
        await renderWithProviders(<AboutDeck {...props()}/>);

        expect(screen.getByTestId("about-note")).toBeTruthy();
        expect(screen.getByTestId("about-pod")).toBeTruthy();
        expect(screen.getByTestId("about-from")).toBeTruthy();
        expect(screen.getByTestId("about-history")).toBeTruthy();
    });

    it("passes the brew count through to the history line", async () => {
        await renderWithProviders(
            <AboutDeck {...props({brews: {times: 2, lastAt: 0, avgRating: 0, rated: 0}})}/>
        );

        expect(screen.getByTestId("history-summary"))
            .toHaveTextContent("Brewed 2 times.");
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

    it("commits the ID under its own label", async () => {
        const dispatch = jest.fn();
        await renderWithProviders(<AboutDeck {...props({dispatch})}/>);

        await fireEvent(screen.getByLabelText("Recipe ID"), "endEditing",
                        {nativeEvent: {text: "CGL12"}});

        expect(dispatch).toHaveBeenCalledWith("XID", "CGL12");
    });

    it("closes the save gate on an ID no pod could carry", async () => {
        const onInputErrorChange = jest.fn();
        await renderWithProviders(<AboutDeck {...props({onInputErrorChange})}/>);

        await fireEvent.changeText(screen.getByLabelText("Recipe ID"), "!!bad");

        expect(onInputErrorChange).toHaveBeenLastCalledWith(true);
        expect(screen.getByText(/Not a valid ID/i)).toBeTruthy();
    });
});

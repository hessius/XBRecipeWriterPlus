import {fireEvent, screen} from "@testing-library/react-native";
import React from "react";

import SelectableRecipeRow from "@/components/SelectableRecipeRow";
import Recipe from "@/library/Recipe";
import {renderWithProviders} from "@/test-utils/render";

function recipe(name: string): Recipe {
    const made = new Recipe();
    made.uuid = "uuid-1";
    made.name = name;
    return made;
}

describe("SelectableRecipeRow", () => {
    it("is a checkbox that reports whether it is ticked", async () => {
        await renderWithProviders(
            <SelectableRecipeRow recipe={recipe("Limoncillo")} selected={false}
                                 onToggle={jest.fn()}/>
        );

        const row = screen.getByTestId("select-uuid-1");
        expect(row.props.accessibilityRole).toBe("checkbox");
        expect(row.props.accessibilityState).toEqual({checked: false});
    });

    it("reports a ticked row as checked", async () => {
        await renderWithProviders(
            <SelectableRecipeRow recipe={recipe("Limoncillo")} selected
                                 onToggle={jest.fn()}/>
        );

        expect(screen.getByTestId("select-uuid-1").props.accessibilityState)
            .toEqual({checked: true});
    });

    it("toggles when the row is pressed", async () => {
        const onToggle = jest.fn();
        await renderWithProviders(
            <SelectableRecipeRow recipe={recipe("Limoncillo")} selected={false}
                                 onToggle={onToggle}/>
        );

        await fireEvent.press(screen.getByTestId("select-uuid-1"));

        expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it("still draws the recipe it is offering", async () => {
        await renderWithProviders(
            <SelectableRecipeRow recipe={recipe("Limoncillo")} selected={false}
                                 onToggle={jest.fn()}/>
        );

        expect(screen.getByText("Limoncillo")).toBeTruthy();
    });
});

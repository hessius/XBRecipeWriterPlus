import {fireEvent, screen} from "@testing-library/react-native";
import React from "react";

import NameShelfSheet from "@/components/NameShelfSheet";
import {renderWithProviders} from "@/test-utils/render";

describe("NameShelfSheet", () => {
    it("says how many recipes it is naming", async () => {
        await renderWithProviders(
            <NameShelfSheet open count={3} onOpenChange={jest.fn()} onName={jest.fn()}/>
        );

        expect(screen.getByText("3 recipes will go on it.")).toBeTruthy();
    });

    it("hands over a trimmed name", async () => {
        const onName = jest.fn();
        await renderWithProviders(
            <NameShelfSheet open count={1} onOpenChange={jest.fn()} onName={onName}/>
        );

        await fireEvent.changeText(screen.getByTestId("shelf-name-field"), "  Mornings  ");
        await fireEvent.press(screen.getByTestId("shelf-name-confirm"));

        expect(onName).toHaveBeenCalledWith("Mornings");
    });

    it("refuses a name that is only whitespace", async () => {
        const onName = jest.fn();
        await renderWithProviders(
            <NameShelfSheet open count={1} onOpenChange={jest.fn()} onName={onName}/>
        );

        await fireEvent.changeText(screen.getByTestId("shelf-name-field"), "   ");
        const confirm = screen.getByTestId("shelf-name-confirm");
        expect(confirm.props.accessibilityState).toEqual({disabled: true});

        await fireEvent.press(confirm);
        expect(onName).not.toHaveBeenCalled();
    });

    it("shift-locks the field so a name is upper case as it is typed", async () => {
        // Not a textTransform, which does nothing on a React Native TextInput.
        await renderWithProviders(
            <NameShelfSheet open count={1} onOpenChange={jest.fn()} onName={jest.fn()}/>
        );

        expect(screen.getByTestId("shelf-name-field").props.autoCapitalize)
            .toBe("characters");
    });

    it("accepts the name on submit from the keyboard", async () => {
        const onName = jest.fn();
        await renderWithProviders(
            <NameShelfSheet open count={1} onOpenChange={jest.fn()} onName={onName}/>
        );

        const field = screen.getByTestId("shelf-name-field");
        await fireEvent.changeText(field, "Mornings");
        await fireEvent(field, "submitEditing");

        expect(onName).toHaveBeenCalledWith("Mornings");
    });
});

import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import RenameSheet from "@/components/RenameSheet";
import {renderWithProviders} from "@/test-utils/render";

function props(over: Partial<React.ComponentProps<typeof RenameSheet>> = {}) {
    return {
        open:         true,
        onOpenChange: jest.fn(),
        name:         "Ethiopia",
        onRename:     jest.fn(),
        ...over
    };
}

describe("RenameSheet", () => {
    it("opens on the name the recipe has now", async () => {
        await renderWithProviders(<RenameSheet {...props()}/>);

        expect(screen.getByTestId("rename-field").props.value).toBe("Ethiopia");
    });

    it("hands over a trimmed name and closes", async () => {
        const onRename = jest.fn();
        const onOpenChange = jest.fn();
        await renderWithProviders(
            <RenameSheet {...props({onRename, onOpenChange})}/>
        );

        await fireEvent.changeText(screen.getByTestId("rename-field"), "  Kenya  ");
        await fireEvent.press(screen.getByTestId("rename-confirm"));

        expect(onRename).toHaveBeenCalledWith("Kenya");
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("accepts an emptied name, which means follow the pod", async () => {
        // Not a missing value. `displayName()` falls back to the pod name when
        // yours is empty, so clearing the field is how a renamed recipe is put
        // back on its pod's name.
        const onRename = jest.fn();
        await renderWithProviders(<RenameSheet {...props({onRename})}/>);

        await fireEvent.changeText(screen.getByTestId("rename-field"), "");
        await fireEvent.press(screen.getByTestId("rename-confirm"));

        expect(onRename).toHaveBeenCalledWith("");
    });

    it("greets a reopening with the name the recipe has now", async () => {
        // The draft is seeded per opening, not per mount: the sheet is mounted
        // for the life of the screen, so a name changed by a revert, an import
        // or the ABOUT row would otherwise be shown the string the user last
        // typed here.
        const view = await renderWithProviders(<RenameSheet {...props()}/>);

        await fireEvent.changeText(screen.getByTestId("rename-field"), "Abandoned");
        await view.rerender(<RenameSheet {...props({name: "Kenya Nyeri"})}/>);

        expect(screen.getByTestId("rename-field").props.value).toBe("Kenya Nyeri");
    });

    it("says what an empty name does, rather than leaving it to be discovered", async () => {
        await renderWithProviders(<RenameSheet {...props()}/>);

        expect(screen.getByText("Leave it empty to follow the pod name."))
            .toBeTruthy();
    });
});

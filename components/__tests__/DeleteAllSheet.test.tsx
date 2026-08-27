import React from "react";
import {screen, fireEvent} from "@testing-library/react-native";

import DeleteAllSheet from "@/components/DeleteAllSheet";
import {renderWithProviders} from "@/test-utils/render";

describe("DeleteAllSheet", () => {
    it("says how much is about to be lost", async () => {
        await renderWithProviders(
            <DeleteAllSheet open count={12} onCancel={() => {}}
                            onBackUpFirst={() => {}} onDelete={() => {}}/>
        );

        // "12 recipes" is on the button as well as in the body now, so the body
        // copy is matched by its own sentence rather than by the bare count.
        expect(screen.getByText(/deletes 12 recipes/i)).toBeTruthy();
        expect(screen.getByText(/cannot be undone/i)).toBeTruthy();
    });

    it("puts the count on the button, where a thumb is about to land", async () => {
        // The visible label and the accessible name must agree: a button that
        // says "Delete all recipes" while announcing "Delete all 12 recipes" is
        // a WCAG 2.5.3 (Label in Name) failure that breaks voice control.
        await renderWithProviders(
            <DeleteAllSheet open count={12} onCancel={() => {}}
                            onBackUpFirst={() => {}} onDelete={() => {}}/>
        );

        const button = screen.getByRole("button", {name: "Delete all 12 recipes"});
        expect(button).toBeTruthy();
        expect(screen.getByText("Delete all 12 recipes")).toBeTruthy();
    });

    it("counts one recipe as one recipe", async () => {
        await renderWithProviders(
            <DeleteAllSheet open count={1} onCancel={() => {}}
                            onBackUpFirst={() => {}} onDelete={() => {}}/>
        );

        expect(screen.getByText(/deletes 1 recipe\b/i)).toBeTruthy();
    });

    it("offers a backup first, which is the actual safety", async () => {
        const onBackUpFirst = jest.fn();
        await renderWithProviders(
            <DeleteAllSheet open count={12} onCancel={() => {}}
                            onBackUpFirst={onBackUpFirst} onDelete={() => {}}/>
        );

        await fireEvent.press(screen.getByRole("button", {name: /back up first/i}));

        expect(onBackUpFirst).toHaveBeenCalled();
    });

    it("deletes only on the explicit confirmation", async () => {
        const onDelete = jest.fn();
        await renderWithProviders(
            <DeleteAllSheet open count={12} onCancel={() => {}}
                            onBackUpFirst={() => {}} onDelete={onDelete}/>
        );

        await fireEvent.press(screen.getByRole("button", {name: /delete all 12/i}));

        expect(onDelete).toHaveBeenCalled();
    });

    it("withdraws without deleting", async () => {
        const onCancel = jest.fn();
        const onDelete = jest.fn();
        await renderWithProviders(
            <DeleteAllSheet open count={12} onCancel={onCancel}
                            onBackUpFirst={() => {}} onDelete={onDelete}/>
        );

        await fireEvent.press(screen.getByRole("button", {name: /keep my recipes/i}));

        expect(onCancel).toHaveBeenCalled();
        expect(onDelete).not.toHaveBeenCalled();
    });
});

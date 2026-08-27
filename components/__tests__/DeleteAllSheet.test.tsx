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

        expect(screen.getByText(/12 recipes/)).toBeTruthy();
        expect(screen.getByText(/cannot be undone/i)).toBeTruthy();
    });

    it("counts one recipe as one recipe", async () => {
        await renderWithProviders(
            <DeleteAllSheet open count={1} onCancel={() => {}}
                            onBackUpFirst={() => {}} onDelete={() => {}}/>
        );

        expect(screen.getByText(/1 recipe\b/)).toBeTruthy();
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

import {fireEvent, screen} from "@testing-library/react-native";
import React from "react";

import RemoveShelfSheet from "@/components/RemoveShelfSheet";
import {renderWithProviders} from "@/test-utils/render";

describe("RemoveShelfSheet", () => {
    it("names the shelf and says the recipes survive it", async () => {
        await renderWithProviders(
            <RemoveShelfSheet open tag="Mornings"
                              onOpenChange={jest.fn()} onRemove={jest.fn()}/>
        );

        expect(screen.getByText(/Mornings has nobody left on it/)).toBeTruthy();
        expect(screen.getByText(/Your recipes are not affected/)).toBeTruthy();
    });

    it("removes when it is confirmed", async () => {
        const onRemove = jest.fn();
        await renderWithProviders(
            <RemoveShelfSheet open tag="Mornings"
                              onOpenChange={jest.fn()} onRemove={onRemove}/>
        );

        await fireEvent.press(screen.getByTestId("remove-shelf-confirm"));

        expect(onRemove).toHaveBeenCalledTimes(1);
    });

    it("closes without removing when it is declined", async () => {
        const onOpenChange = jest.fn();
        const onRemove = jest.fn();
        await renderWithProviders(
            <RemoveShelfSheet open tag="Mornings"
                              onOpenChange={onOpenChange} onRemove={onRemove}/>
        );

        await fireEvent.press(screen.getByTestId("remove-shelf-cancel"));

        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(onRemove).not.toHaveBeenCalled();
    });
});

import {fireEvent, screen} from "@testing-library/react-native";
import React from "react";

import ShelfPickerBar from "@/components/ShelfPickerBar";
import {renderWithProviders} from "@/test-utils/render";

describe("ShelfPickerBar", () => {
    it("counts the shelf, not the view", async () => {
        await renderWithProviders(
            <ShelfPickerBar count={4} editing={false}
                            onCancel={jest.fn()} onDone={jest.fn()}/>
        );

        expect(screen.getByTestId("shelf-picker-count")).toHaveTextContent(
            "4 ON THIS SHELF"
        );
    });

    it("speaks a single recipe in the singular", async () => {
        await renderWithProviders(
            <ShelfPickerBar count={1} editing={false}
                            onCancel={jest.fn()} onDone={jest.fn()}/>
        );

        expect(screen.getByTestId("shelf-picker-count")).toHaveTextContent(
            "1 ON THIS SHELF"
        );
    });

    it("refuses to name a shelf with nobody on it", async () => {
        const onDone = jest.fn();
        await renderWithProviders(
            <ShelfPickerBar count={0} editing={false}
                            onCancel={jest.fn()} onDone={onDone}/>
        );

        const done = screen.getByTestId("shelf-picker-done");
        expect(done.props.accessibilityState).toEqual({disabled: true});

        await fireEvent.press(done);
        expect(onDone).not.toHaveBeenCalled();
    });

    it("says an emptied shelf is being removed rather than saved", async () => {
        const onDone = jest.fn();
        await renderWithProviders(
            <ShelfPickerBar count={0} editing
                            onCancel={jest.fn()} onDone={onDone}/>
        );

        expect(screen.getByText("REMOVE SHELF")).toBeTruthy();

        await fireEvent.press(screen.getByTestId("shelf-picker-done"));
        expect(onDone).toHaveBeenCalledTimes(1);
    });

    it("saves an edit that still has members", async () => {
        await renderWithProviders(
            <ShelfPickerBar count={2} editing
                            onCancel={jest.fn()} onDone={jest.fn()}/>
        );

        expect(screen.getByText("SAVE SHELF")).toBeTruthy();
    });

    it("cancels", async () => {
        const onCancel = jest.fn();
        await renderWithProviders(
            <ShelfPickerBar count={2} editing={false}
                            onCancel={onCancel} onDone={jest.fn()}/>
        );

        await fireEvent.press(screen.getByTestId("shelf-picker-cancel"));

        expect(onCancel).toHaveBeenCalledTimes(1);
    });
});

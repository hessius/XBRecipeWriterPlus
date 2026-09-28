import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import HubSaveBar from "@/components/HubSaveBar";
import {renderWithProviders} from "@/test-utils/render";

function bar({
    count = 2,
    saving = false,
    onCancel = jest.fn(),
    onSave = jest.fn()
}: {
    count?: number;
    saving?: boolean;
    onCancel?: () => void;
    onSave?: () => void;
} = {}) {
    return (
        <HubSaveBar
            count={count}
            saving={saving}
            progress={{done: 1, total: 3}}
            onCancel={onCancel}
            onSave={onSave}
        />
    );
}

describe("HubSaveBar", () => {
    it("names the number of recipes ready to save", async () => {
        await renderWithProviders(bar({count: 4}));

        expect(screen.getByTestId("hub-save-confirm")).toHaveTextContent("SAVE 4");
    });

    it("shows save progress while saving", async () => {
        await renderWithProviders(bar({saving: true}));

        expect(screen.getByTestId("hub-save-confirm")).toHaveTextContent("1 OF 3");
    });

    it("disables save and hides cancel while saving", async () => {
        await renderWithProviders(bar({saving: true}));

        expect(screen.getByTestId("hub-save-confirm").props.accessibilityState)
            .toEqual({disabled: true});
        expect(screen.queryByTestId("hub-save-cancel")).toBeNull();
    });

    it("disables save when nothing is selected", async () => {
        await renderWithProviders(bar({count: 0}));

        const save = screen.getByTestId("hub-save-confirm");
        expect(save.props.accessibilityState)
            .toEqual({disabled: true});
        expect(save).toHaveStyle({opacity: 0.35});
    });

    it("does not fire save when nothing is selected", async () => {
        const onSave = jest.fn();
        await renderWithProviders(bar({count: 0, onSave}));

        await fireEvent.press(screen.getByTestId("hub-save-confirm"));

        expect(onSave).not.toHaveBeenCalled();
    });

    it("speaks one recipe naturally", async () => {
        await renderWithProviders(bar({count: 1}));

        expect(screen.getByLabelText("Save 1 recipe")).toBeTruthy();
    });

    it("fires cancel and save when idle", async () => {
        const onCancel = jest.fn();
        const onSave = jest.fn();
        await renderWithProviders(bar({onCancel, onSave}));

        await fireEvent.press(screen.getByTestId("hub-save-cancel"));
        await fireEvent.press(screen.getByTestId("hub-save-confirm"));

        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onSave).toHaveBeenCalledTimes(1);
    });
});

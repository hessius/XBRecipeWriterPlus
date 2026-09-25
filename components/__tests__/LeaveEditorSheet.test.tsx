import React from "react";
import {fireEvent, screen, waitFor} from "@testing-library/react-native";

import LeaveEditorSheet from "@/components/LeaveEditorSheet";
import {renderWithProviders} from "@/test-utils/render";

function props(over: Partial<React.ComponentProps<typeof LeaveEditorSheet>> = {}) {
    return {
        open:       true,
        intent:     "leave" as const,
        onSave:     jest.fn(),
        onDiscard:  jest.fn(),
        onCancel:   jest.fn(),
        ...over
    };
}

// During the sheet's entrance the node is findable but the press is discarded,
// so every press here retries. See app/__tests__/brewHistory.test.tsx.
async function pressOnSheet(label: string, landed: () => boolean): Promise<void> {
    await waitFor(async () => {
        await fireEvent.press(screen.getByLabelText(label));
        expect(landed()).toBe(true);
    });
}

describe("LeaveEditorSheet", () => {
    it("offers to save, discard or stay when leaving", async () => {
        await renderWithProviders(<LeaveEditorSheet {...props()}/>);

        expect(screen.getByLabelText("Save changes")).toBeTruthy();
        expect(screen.getByLabelText("Discard changes")).toBeTruthy();
        expect(screen.getByLabelText("Keep editing")).toBeTruthy();
    });

    it("says what will happen when brewing instead", async () => {
        // The brew will run something either way, so "discard" would be a lie:
        // the choice is which recipe the machine gets, not whether it brews.
        await renderWithProviders(<LeaveEditorSheet {...props({intent: "brew"})}/>);

        expect(screen.getByLabelText("Save and brew")).toBeTruthy();
        expect(screen.getByLabelText("Brew without saving")).toBeTruthy();
        expect(screen.getByLabelText("Keep editing")).toBeTruthy();
    });

    it("reports each of the three answers", async () => {
        const onSave = jest.fn();
        const onDiscard = jest.fn();
        const onCancel = jest.fn();
        await renderWithProviders(
            <LeaveEditorSheet {...props({onSave, onDiscard, onCancel})}/>
        );

        await pressOnSheet("Save changes", () => onSave.mock.calls.length > 0);
        expect(onSave).toHaveBeenCalledTimes(1);

        await pressOnSheet("Discard changes", () => onDiscard.mock.calls.length > 0);
        expect(onDiscard).toHaveBeenCalledTimes(1);

        await pressOnSheet("Keep editing", () => onCancel.mock.calls.length > 0);
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("treats a dismissed sheet as keeping editing", async () => {
        // Swiping the sheet away must not be a way to discard work by accident.
        // Pressing the sheet chrome's Close affordance drives the same
        // onOpenChange(false) path that a dismissal uses.
        const onDiscard = jest.fn();
        const onCancel = jest.fn();
        await renderWithProviders(
            <LeaveEditorSheet {...props({onDiscard, onCancel})}/>
        );

        await pressOnSheet("Close", () => onCancel.mock.calls.length > 0);

        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onDiscard).not.toHaveBeenCalled();
    });
});

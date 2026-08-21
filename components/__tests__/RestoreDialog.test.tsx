import React, {useState} from "react";
import {fireEvent, screen, waitFor} from "@testing-library/react-native";
import {Button} from "tamagui";
import {renderWithProviders} from "@/test-utils/render";
import RestoreDialog, {type RestoreOption} from "@/components/RestoreDialog";

function options(action: () => Promise<void>): RestoreOption[] {
    return [
        {id: "cloud", label: "Restore from xBloom", action},
        {id: "backup", label: "Restore from backup", action: jest.fn().mockResolvedValue(undefined)}
    ];
}

describe("RestoreDialog", () => {
    it("renders one button per option when open", async () => {
        await renderWithProviders(
            <RestoreDialog open options={options(jest.fn().mockResolvedValue(undefined))}
                           onOpenChange={jest.fn()} onRestored={jest.fn()}/>
        );

        expect(screen.getByText("Restore from xBloom")).toBeTruthy();
        expect(screen.getByText("Restore from backup")).toBeTruthy();
    });

    it("renders nothing when closed", async () => {
        await renderWithProviders(
            <RestoreDialog open={false} options={options(jest.fn().mockResolvedValue(undefined))}
                           onOpenChange={jest.fn()} onRestored={jest.fn()}/>
        );

        expect(screen.queryByText("Restore from xBloom")).toBeNull();
    });

    it("runs the chosen action, then closes and notifies the parent", async () => {
        const action = jest.fn().mockResolvedValue(undefined);
        const onOpenChange = jest.fn();
        const onRestored = jest.fn();
        await renderWithProviders(
            <RestoreDialog open options={options(action)} onOpenChange={onOpenChange} onRestored={onRestored}/>
        );

        await fireEvent.press(screen.getByText("Restore from xBloom"));

        await waitFor(() => expect(action).toHaveBeenCalled());
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(onRestored).toHaveBeenCalled();
    });

    it("still closes and notifies when the action rejects", async () => {
        const action = jest.fn().mockRejectedValue(new Error("network down"));
        const onOpenChange = jest.fn();
        const onRestored = jest.fn();
        await renderWithProviders(
            <RestoreDialog open options={options(action)} onOpenChange={onOpenChange} onRestored={onRestored}/>
        );

        await fireEvent.press(screen.getByText("Restore from xBloom"));

        await waitFor(() => expect(onRestored).toHaveBeenCalled());
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("closes without running anything when cancelled", async () => {
        const action = jest.fn().mockResolvedValue(undefined);
        const onOpenChange = jest.fn();
        await renderWithProviders(
            <RestoreDialog open options={options(action)} onOpenChange={onOpenChange} onRestored={jest.fn()}/>
        );

        await fireEvent.press(screen.getByText("Cancel"));

        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(action).not.toHaveBeenCalled();
    });

    it("keeps its in-flight state across an unrelated parent re-render", async () => {
        // The dialog used to be declared inside editRecipe's body, so any parent
        // render produced a new component type and remounted it, discarding the
        // `isRestoring` guard mid-restore.
        let resolveAction: () => void = () => {};
        const action = jest.fn().mockImplementation(() => new Promise<void>((resolve) => {
            resolveAction = resolve;
        }));

        function Parent() {
            const [, force] = useState(0);
            return (
                <>
                    <Button aria-label="rerender" onPress={() => force((n) => n + 1)}>rerender</Button>
                    <RestoreDialog open options={options(action)} onOpenChange={jest.fn()} onRestored={jest.fn()}/>
                </>
            );
        }

        await renderWithProviders(<Parent/>);

        // Not awaited: the action deliberately never settles, so awaiting the
        // press would hang waiting for the render to quiesce.
        void fireEvent.press(screen.getByText("Restore from xBloom"));
        await waitFor(() => expect(action).toHaveBeenCalledTimes(1));

        await fireEvent.press(screen.getByLabelText("rerender"));

        // A remount would reset isRestoring and let a second press start a
        // duplicate restore.
        void fireEvent.press(screen.getByText("Restore from xBloom"));
        await waitFor(() => expect(action).toHaveBeenCalledTimes(1));

        resolveAction();
    });
});

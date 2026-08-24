import React from "react";
import {Text} from "react-native";
import {act, fireEvent, screen} from "@testing-library/react-native";

import XbrwSheet, {EXIT_GRACE} from "@/components/XbrwSheet";
import {renderWithProviders} from "@/test-utils/render";

function open(onOpenChange = jest.fn()) {
    return renderWithProviders(
        <XbrwSheet open onOpenChange={onOpenChange} title="ABOUT">
            <Text>the body</Text>
        </XbrwSheet>
    );
}

describe("XbrwSheet", () => {
    it("shows its title and its children", async () => {
        await open();

        expect(screen.getByText("ABOUT")).toBeTruthy();
        expect(screen.getByText("the body")).toBeTruthy();
    });

    it("can be dismissed without the platform gesture", async () => {
        // The only other way out is a backdrop tap or a swipe, neither of which
        // a screen reader announces as a control.
        const onOpenChange = jest.fn();
        await open(onOpenChange);

        await fireEvent.press(screen.getByLabelText("Close"));

        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("leaves nothing in the tree while closed", async () => {
        // Tamagui alone does not do this: with `open={false}` and no guard of
        // our own it still mounts the sheet frame off screen.
        await renderWithProviders(
            <XbrwSheet open={false} onOpenChange={jest.fn()} title="ABOUT">
                <Text>the body</Text>
            </XbrwSheet>
        );

        // The safe-area provider the test wrapper supplies is the only thing
        // left; the sheet contributes nothing of its own.
        const tree = screen.toJSON();
        expect(Array.isArray(tree) ? tree : [tree]).toHaveLength(1);
        expect(screen.queryByText("the body", {includeHiddenElements: true})).toBeNull();
    });

    it("stays in the tree long enough to animate away", async () => {
        // Unmounting on the frame the sheet is dismissed removes the animation
        // along with the sheet, so it disappeared rather than left.
        jest.useFakeTimers();
        try {
            const {rerender} = await open();

            await rerender(
                <XbrwSheet open={false} onOpenChange={jest.fn()} title="ABOUT">
                    <Text>the body</Text>
                </XbrwSheet>
            );
            expect(screen.queryByText("the body")).toBeTruthy();

            await act(async () => {
                jest.advanceTimersByTime(EXIT_GRACE);
            });
            expect(screen.queryByText("the body")).toBeNull();
        } finally {
            jest.useRealTimers();
        }
    });
});

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

    describe("prewarming", () => {
        it("is off unless asked for", async () => {
            await renderWithProviders(
                <XbrwSheet open={false} onOpenChange={jest.fn()} title="ABOUT">
                    <Text>the body</Text>
                </XbrwSheet>
            );

            expect(screen.queryByTestId("sheet-prewarm", {includeHiddenElements: true}))
                .toBeNull();
        });

        it("builds the body while the sheet is still closed", async () => {
            // A sheet's contents are built on the way in, because Tamagui
            // renders nothing for a closed dialog. For a body of any size that
            // is a visible hitch on the frame it opens, so the measuring is
            // done in advance instead.
            await renderWithProviders(
                <XbrwSheet open={false} onOpenChange={jest.fn()} title="ABOUT" prewarm>
                    <Text>the body</Text>
                </XbrwSheet>
            );

            expect(screen.getByText("the body", {includeHiddenElements: true}))
                .toBeTruthy();
        });

        it("keeps the warm copy out of reach", async () => {
            // It is the unmounted sheet's guarantee that has to survive: a
            // sheet nobody has opened must not be readable or touchable. Zero
            // height and zero opacity are not enough on their own -- a screen
            // reader ignores both.
            await renderWithProviders(
                <XbrwSheet open={false} onOpenChange={jest.fn()} title="ABOUT" prewarm>
                    <Text>the body</Text>
                </XbrwSheet>
            );

            const warm = screen.getByTestId("sheet-prewarm", {includeHiddenElements: true});
            expect(warm.props.pointerEvents).toBe("none");
            expect(warm.props.accessibilityElementsHidden).toBe(true);
            expect(warm.props.importantForAccessibility).toBe("no-hide-descendants");
            expect(warm.props.style).toEqual(
                expect.objectContaining({height: 0, opacity: 0, position: "absolute"})
            );
        });

        it("takes up no room on the screen it is warming inside", async () => {
            // It is laid out at the real width, so the text measures the way it
            // will really measure -- that measurement is the whole point -- and
            // then clipped away.
            await renderWithProviders(
                <XbrwSheet open={false} onOpenChange={jest.fn()} title="ABOUT" prewarm>
                    <Text>the body</Text>
                </XbrwSheet>
            );

            const style = screen.getByTestId("sheet-prewarm", {includeHiddenElements: true})
                .props.style as {height: number; overflow: string};
            expect(style.height).toBe(0);
            expect(style.overflow).toBe("hidden");
        });

        it("gives way to the real sheet rather than doubling it", async () => {
            await renderWithProviders(
                <XbrwSheet open onOpenChange={jest.fn()} title="ABOUT" prewarm>
                    <Text>the body</Text>
                </XbrwSheet>
            );

            expect(screen.queryByTestId("sheet-prewarm", {includeHiddenElements: true}))
                .toBeNull();
            expect(screen.getAllByText("the body")).toHaveLength(1);
        });
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

    it("hides the content behind it from Android's screen reader while it is up", async () => {
        // `accessibilityViewIsModal` only isolates siblings on iOS, and this sheet
        // is deliberately not `modal`, so without this TalkBack walks straight
        // past the sheet into the screen underneath.
        await renderWithProviders(
            <XbrwSheet open onOpenChange={() => {}} title="Import">
                <Text>Body</Text>
            </XbrwSheet>
        );

        const guard = await screen.findByTestId("sheet-android-guard",
            {includeHiddenElements: true});
        expect(guard.props.importantForAccessibility).toBe("no-hide-descendants");
    });
});

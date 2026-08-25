import React from "react";
import {Text} from "react-native";
import {act, screen} from "@testing-library/react-native";

import XbrwSheet from "@/components/XbrwSheet";
import {renderWithProviders} from "@/test-utils/render";

/**
 * What the sheet asks Tamagui for, rather than what Tamagui then draws.
 *
 * Both defects guarded here were invisible in the rendered tree and plainly
 * visible on a 60fps screen recording, so they are pinned at the only place
 * where they are unambiguous: the props the Sheet is handed.
 */
const seen: {open: unknown; modal: unknown}[] = [];

jest.mock("tamagui", () => {
    const actual = jest.requireActual("tamagui");
    const mockReact = jest.requireActual<typeof import("react")>("react");
    const Recorded = (props: Record<string, unknown>) => {
        const {open, modal} = props;
        (globalThis as {__sheetProps?: unknown[]}).__sheetProps?.push({open, modal});
        return mockReact.createElement(actual.Sheet, props);
    };
    Object.assign(Recorded, actual.Sheet);
    return {...actual, Sheet: Recorded};
});

beforeEach(() => {
    seen.length = 0;
    (globalThis as {__sheetProps?: unknown[]}).__sheetProps = seen;
});

function body() {
    return <Text>the body</Text>;
}

describe("XbrwSheet's entrance", () => {
    it("puts the sheet in the tree closed, and opens it on the frame after", async () => {
        // Tamagui animates the entrance by going from closed to open. A sheet
        // that arrives already open has nothing to go from and appears at its
        // resting place, which is what it did on film: no slide at all, just
        // the finished sheet, one frame after the tap.
        jest.useFakeTimers();
        try {
            await renderWithProviders(
                <XbrwSheet open={false} onOpenChange={jest.fn()} title="ABOUT">
                    {body()}
                </XbrwSheet>
            );
            seen.length = 0;

            await screen.rerender(
                <XbrwSheet open onOpenChange={jest.fn()} title="ABOUT">
                    {body()}
                </XbrwSheet>
            );

            expect(seen[0]?.open).toBe(false);

            await act(async () => {
                jest.advanceTimersByTime(32);
            });
            expect(seen.at(-1)?.open).toBe(true);
        } finally {
            jest.useRealTimers();
        }
    });

    it("does not ask for a modal sheet", async () => {
        // A modal sheet is hung inside a gesture-handler root that Tamagui
        // styles `height: 0` the moment the sheet is closed -- on the frame of
        // the dismissal, not after the exit. The body and the backdrop are cut
        // away instantly and an empty frame slides out on its own.
        await renderWithProviders(
            <XbrwSheet open onOpenChange={jest.fn()} title="ABOUT">
                {body()}
            </XbrwSheet>
        );

        expect(seen.length).toBeGreaterThan(0);
        expect(seen.every(props => !props.modal)).toBe(true);
    });
});

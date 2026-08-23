import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import CtaTile from "@/components/CtaTile";
import {palette} from "@/constants/colors";
import {DOT_ICONS, litCells} from "@/constants/dotIcons";
import {renderWithProviders} from "@/test-utils/render";

const TOUCH = {
    nativeEvent: {
        touches:        [],
        changedTouches: [],
        locationX:      1,
        locationY:      1,
        pageX:          1,
        pageY:          1,
        timestamp:      0
    }
};

/**
 * A real touch on the tile.
 *
 * Deliberately not `fireEvent.press`: Tamagui drives presses through the
 * responder system rather than an `onPress` prop on the host view, so
 * `fireEvent.press` finds no handler there and walks up the tree until it
 * reaches `CtaTile`'s *own* `onPress` prop — the mock the test just passed in.
 * That happens whether or not the tile wires anything up, and a tile rendering
 * nothing interactive at all passed the original version of this test.
 */
async function press(element: Parameters<typeof fireEvent>[0]) {
    await fireEvent(element, "responderGrant", TOUCH);
    await fireEvent(element, "responderRelease", TOUCH);
}

function tile(name = "SCAN") {
    return screen.getByRole("button", {name});
}

describe("CtaTile", () => {
    it("renders its label", async () => {
        await renderWithProviders(
            <CtaTile icon="scan" label="SCAN" onPress={jest.fn()}/>
        );
        expect(screen.getByText("SCAN")).toBeTruthy();
        // The label doubles as the accessible name when none is spelled out,
        // or every tile on the home screen announces as an unnamed button.
        expect(tile()).toBeTruthy();
    });

    it("renders the icon it was given, above the label", async () => {
        // Each icon is a bitmap drawn as dots, so the only evidence that
        // `icon` was honoured is that two names draw a different number of
        // dots (scan and import light up different counts of cells).
        const {rerender} = await renderWithProviders(
            <CtaTile icon="scan" label="SCAN" onPress={jest.fn()}/>
        );
        expect(
            screen.getAllByTestId("dot-icon-dot", {includeHiddenElements: true}).length
        ).toBe(litCells(DOT_ICONS.scan).length);

        // Icon first: the tile reads top-down, and swapping the two is a
        // different component.
        const children = tile().children as {props?: {testID?: string}}[];
        expect(children[0].props?.testID).toBe("cta-tile-icon");

        await rerender(<CtaTile icon="import" label="SCAN" onPress={jest.fn()}/>);
        expect(
            screen.getAllByTestId("dot-icon-dot", {includeHiddenElements: true}).length
        ).toBe(litCells(DOT_ICONS.import).length);
    });

    it("renders its glyph as dots, not as a vector icon", async () => {
        await renderWithProviders(
            <CtaTile icon="scan" label="READ CARD" onPress={() => {}}/>
        );
        expect(screen.getByTestId("cta-tile-icon", {includeHiddenElements: true})).toBeTruthy();
        expect(
            screen.getAllByTestId("dot-icon-dot", {includeHiddenElements: true}).length
        ).toBeGreaterThan(0);
        expect(
            screen.getAllByTestId("dot-icon-dot", {includeHiddenElements: true}).length
        ).toBe(litCells(DOT_ICONS.scan).length);
    });

    it("renders the label in dot matrix, not prose", async () => {
        await renderWithProviders(
            <CtaTile icon="scan" label="SCAN" onPress={jest.fn()}/>
        );
        const style = screen.getByText("SCAN").props.style as {fontFamily?: string}[];
        expect(style.some((s) => s?.fontFamily?.startsWith("Doto-"))).toBe(true);
    });

    it("calls onPress when tapped", async () => {
        const onPress = jest.fn();
        await renderWithProviders(
            <CtaTile icon="scan" label="SCAN" onPress={onPress}/>
        );

        await press(tile());

        expect(onPress).toHaveBeenCalledTimes(1);
    });

    it("does not call onPress when disabled", async () => {
        const onPress = jest.fn();
        await renderWithProviders(
            <CtaTile icon="scan" label="SCAN" onPress={onPress} disabled/>
        );

        await press(tile());

        expect(onPress).not.toHaveBeenCalled();
    });

    it("accepts no touch at all when disabled", async () => {
        await renderWithProviders(
            <CtaTile icon="scan" label="SCAN" onPress={jest.fn()} disabled/>
        );

        // Not merely ignored on the way out: the tile never claims the touch, so
        // it cannot swallow a press meant for something behind it either.
        expect(tile().props.onStartShouldSetResponder).toBeUndefined();
        expect(tile().props.accessibilityState).toEqual({disabled: true});
    });

    it("claims touches when it is enabled", async () => {
        await renderWithProviders(
            <CtaTile icon="scan" label="SCAN" onPress={jest.fn()}/>
        );
        expect(tile().props.onStartShouldSetResponder).toBeDefined();
        expect(tile().props.accessibilityState).toEqual({disabled: false});
    });

    it("is a single accessibility element, not an icon and a label", async () => {
        await renderWithProviders(
            <CtaTile icon="scan" label="SCAN" onPress={jest.fn()}/>
        );
        // A label on a View is inert unless the View is an element in its own
        // right, and the icon would otherwise be announced separately.
        expect(tile().props.accessible).toBe(true);
    });

    it("looks like a tile, and shares the row with its twin", async () => {
        await renderWithProviders(
            <CtaTile icon="scan" label="SCAN" onPress={jest.fn()}/>
        );
        const style = tile().props.style as Record<string, number | string>;
        // Two tiles sit side by side at equal weight; without flex each shrinks
        // to its own content and the row stops being a pair.
        expect(style.flex).toBe(1);
        expect(style.backgroundColor).toBe(palette.raised);
        expect(style.borderTopColor).toBe(palette.line);
        expect(style.borderTopWidth).toBe(1);
        expect(style.borderTopLeftRadius).toBeGreaterThan(0);
        expect(style.paddingTop).toBeGreaterThan(0);
    });

    it("uses the accessibility label when the Doto label is an abbreviation", async () => {
        await renderWithProviders(
            <CtaTile icon="scan" label="SCAN" accessibilityLabel="Scan a card"
                     onPress={jest.fn()}/>
        );
        expect(tile("Scan a card")).toBeTruthy();
        // ...and the abbreviation is still what is drawn.
        expect(screen.getByText("SCAN")).toBeTruthy();
    });

    it("dims itself when disabled", async () => {
        await renderWithProviders(
            <CtaTile icon="scan" label="SCAN" onPress={jest.fn()} disabled/>
        );
        const style = tile().props.style as {opacity: number};
        expect(style.opacity).toBeLessThan(1);

        // The label and icon go with it, or a disabled tile still reads as
        // available.
        const label = screen.getByText("SCAN").props.style as {color?: string}[];
        expect(label.some((s) => s?.color === palette.muted)).toBe(true);
        // A static dot is a plain View with a plain style object; only the
        // animated kind carries the array an animated style is merged into.
        const dots = screen.getAllByTestId("dot-icon-dot", {includeHiddenElements: true});
        const dotStyle = dots[0].props.style as {backgroundColor?: string};
        expect(dotStyle.backgroundColor).toBe(palette.muted);
    });
});

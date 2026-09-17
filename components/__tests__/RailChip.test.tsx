import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import RailChip, {CHIP_HEIGHT} from "@/components/RailChip";
import {onAccent, palette} from "@/constants/colors";
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
 * A real touch on the chip. Not `fireEvent.press`: Tamagui drives presses
 * through the responder system, so `fireEvent.press` would walk up to the chip's
 * own `onPress` prop and fire it whether or not the chip wired anything up. See
 * `CtaTile.test.tsx` for the full account.
 */
async function press(element: Parameters<typeof fireEvent>[0]) {
    await fireEvent(element, "responderGrant", TOUCH);
    await fireEvent(element, "responderRelease", TOUCH);
}

function chip(name: string) {
    return screen.getByRole("button", {name});
}

function styleOf(name: string) {
    return chip(name).props.style as Record<string, unknown>;
}

describe("RailChip", () => {
    it("is 44 tall, always, so a finger cannot miss it", async () => {
        await renderWithProviders(
            <RailChip active={false} icon="search" accessibilityLabel="Search"
                      onPress={jest.fn()}/>
        );
        expect(styleOf("Search").height).toBe(CHIP_HEIGHT);
    });

    it("is a 44 square when it is icon-only", async () => {
        await renderWithProviders(
            <RailChip active={false} icon="search" accessibilityLabel="Search"
                      onPress={jest.fn()}/>
        );
        const style = styleOf("Search");
        expect(style.height).toBe(CHIP_HEIGHT);
        expect(style.width).toBe(CHIP_HEIGHT);
    });

    it("stays 44 tall when it carries a label", async () => {
        await renderWithProviders(
            <RailChip active={false} label="TEA" accessibilityLabel="Tea"
                      onPress={jest.fn()}/>
        );
        const style = styleOf("Tea");
        expect(style.height).toBe(CHIP_HEIGHT);
        // A labelled chip hugs its word rather than pinning to the square.
        expect(style.width).toBeUndefined();
    });

    it("takes the accent fill when active", async () => {
        await renderWithProviders(
            <RailChip active label="TEA" accessibilityLabel="Tea" onPress={jest.fn()}/>
        );
        const style = styleOf("Tea");
        expect(style.backgroundColor).toBe(palette.text);
        expect(style.borderTopColor).toBe(palette.text);
    });

    it("is an outline with no fill when inactive", async () => {
        await renderWithProviders(
            <RailChip active={false} label="TEA" accessibilityLabel="Tea"
                      onPress={jest.fn()}/>
        );
        const style = styleOf("Tea");
        // No fill at all -- one step of grey is not a state.
        expect(style.backgroundColor).toBe("transparent");
        expect(style.borderTopColor).toBe(palette.line);
    });

    it("sets its ink dark on the fill when active, light on the outline when not", async () => {
        const {rerender} = await renderWithProviders(
            <RailChip active label="TEA" accessibilityLabel="Tea" onPress={jest.fn()}/>
        );
        const activeInk = screen.getByText("TEA").props.style as {color?: string}[];
        expect(activeInk.some((s) => s?.color === onAccent.text)).toBe(true);

        await rerender(
            <RailChip active={false} label="TEA" accessibilityLabel="Tea" onPress={jest.fn()}/>
        );
        const inactiveInk = screen.getByText("TEA").props.style as {color?: string}[];
        expect(inactiveInk.some((s) => s?.color === palette.text)).toBe(true);
    });

    it("renders its label in dot matrix, not prose", async () => {
        await renderWithProviders(
            <RailChip active={false} label="SINGLE POUR" accessibilityLabel="Single pour"
                      onPress={jest.fn()}/>
        );
        const style = screen.getByText("SINGLE POUR").props.style as {fontFamily?: string}[];
        expect(style.some((s) => s?.fontFamily?.startsWith("Doto-"))).toBe(true);
    });

    it("reports its selected state to assistive tech", async () => {
        await renderWithProviders(
            <RailChip active label="TEA" accessibilityLabel="Tea" onPress={jest.fn()}/>
        );
        expect(chip("Tea").props.accessibilityState).toEqual({selected: true});
    });

    it("draws no trailing caret unless asked for one", async () => {
        await renderWithProviders(
            <RailChip active={false} icon="filter" label="0" accessibilityLabel="Filters"
                      onPress={jest.fn()}/>
        );
        expect(screen.queryByTestId("rail-chip-caret")).toBeNull();
    });

    it("points the caret down when its surface is closed", async () => {
        await renderWithProviders(
            <RailChip active={false} icon="filter" label="0" accessibilityLabel="Filters"
                      caretOpen={false} onPress={jest.fn()}/>
        );
        const style = screen.getByTestId("rail-chip-caret").props.style as {
            transform?: {rotate?: string}[];
        }[];
        expect(style[0]?.transform?.[0].rotate).toBe("0deg");
    });

    it("points the caret up when its surface is open", async () => {
        // Read from a fresh mount that starts open, not a rerender: the rotation
        // is real motion in the app, and the animation mock does not advance the
        // timing transition.
        await renderWithProviders(
            <RailChip active={false} icon="filter" label="0" accessibilityLabel="Filters"
                      caretOpen onPress={jest.fn()}/>
        );
        const style = screen.getByTestId("rail-chip-caret").props.style as {
            transform?: {rotate?: string}[];
        }[];
        expect(style[0]?.transform?.[0].rotate).toBe("180deg");
    });

    it("calls onPress when tapped", async () => {
        const onPress = jest.fn();
        await renderWithProviders(
            <RailChip active={false} icon="search" accessibilityLabel="Search"
                      onPress={onPress}/>
        );
        await press(chip("Search"));
        expect(onPress).toHaveBeenCalledTimes(1);
    });
});

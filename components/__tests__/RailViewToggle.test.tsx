import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import {CHIP_HEIGHT} from "@/components/RailChip";
import RailViewToggle from "@/components/RailViewToggle";
import {palette} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";

const OPTIONS = [
    {value: "list", label: "List", icon: "list"},
    {value: "shelves", label: "Shelves", icon: "shelves"}
] as const;

const TOUCH = {
    nativeEvent: {
        touches: [], changedTouches: [],
        locationX: 1, locationY: 1, pageX: 1, pageY: 1, timestamp: 0
    }
};

async function press(element: Parameters<typeof fireEvent>[0]) {
    await fireEvent(element, "responderGrant", TOUCH);
    await fireEvent(element, "responderRelease", TOUCH);
}

function toggle(props: Partial<React.ComponentProps<typeof RailViewToggle>> = {}) {
    return (
        <RailViewToggle value="list" options={OPTIONS}
                        accessibilityLabel="Library view"
                        onChange={jest.fn()} {...props}/>
    );
}

describe("RailViewToggle", () => {
    it("stands the same height as the chips beside it", async () => {
        // The reason this exists rather than the shared SegmentedControl: on
        // device the pair read as a borrowed control because it did not match
        // the rail's own metrics.
        await renderWithProviders(toggle());

        expect(screen.getByTestId("rail-view-toggle"))
            .toHaveStyle({height: CHIP_HEIGHT});
    });

    it("wears the rail's own border", async () => {
        await renderWithProviders(toggle());

        expect(screen.getByTestId("rail-view-toggle"))
            .toHaveStyle({borderTopColor: palette.line, borderTopWidth: 1});
    });

    it("lights the half you are in and leaves the other unfilled", async () => {
        await renderWithProviders(toggle({value: "shelves"}));

        expect(screen.getByTestId("rail-view-shelves"))
            .toHaveStyle({backgroundColor: palette.text});
        expect(screen.getByTestId("rail-view-list"))
            .toHaveStyle({backgroundColor: palette.none});
    });

    it("speaks the selection, which is otherwise only a fill", async () => {
        await renderWithProviders(toggle({value: "shelves"}));

        expect(screen.getByRole("tab", {name: "Shelves"}).props.accessibilityState)
            .toEqual({selected: true});
        expect(screen.getByRole("tab", {name: "List"}).props.accessibilityState)
            .toEqual({selected: false});
    });

    it("reports the half that was tapped", async () => {
        const onChange = jest.fn();
        await renderWithProviders(toggle({onChange}));

        await press(screen.getByRole("tab", {name: "Shelves"}));

        expect(onChange).toHaveBeenCalledWith("shelves");
    });
});

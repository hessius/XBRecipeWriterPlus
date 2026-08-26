import React from "react";
import {screen, fireEvent} from "@testing-library/react-native";

import SegmentedControl from "@/components/SegmentedControl";
import {renderWithProviders} from "@/test-utils/render";

const OPTIONS = [
    {value: "C", label: "°C"},
    {value: "F", label: "°F"}
] as const;

describe("SegmentedControl", () => {
    it("marks the selected option checked and the others not", async () => {
        await renderWithProviders(
            <SegmentedControl value="C" options={OPTIONS} onChange={() => {}}/>
        );

        expect(screen.getByLabelText("°C").props.accessibilityState.checked).toBe(true);
        expect(screen.getByLabelText("°F").props.accessibilityState.checked).toBe(false);
    });

    it("reports the value of the option that was pressed", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <SegmentedControl value="C" options={OPTIONS} onChange={onChange}/>
        );

        await fireEvent.press(screen.getByLabelText("°F"));

        expect(onChange).toHaveBeenCalledWith("F");
    });

    it("is announced as one radio group carrying the name it was given", async () => {
        await renderWithProviders(
            <SegmentedControl value="C" options={OPTIONS} onChange={() => {}}
                              accessibilityLabel="Temperature"/>
        );

        const group = screen.getByLabelText("Temperature");
        expect(group.props.accessibilityRole).toBe("radiogroup");
    });

    it("leaves each segment reachable rather than collapsing into one element", async () => {
        await renderWithProviders(
            <SegmentedControl value="C" options={OPTIONS} onChange={() => {}}
                              accessibilityLabel="Temperature"/>
        );

        // `accessible` on the group would hide the segments inside it on iOS,
        // giving a control that reads both labels and activates neither. The
        // test renderer does not model that collapse, so the prop itself is
        // what has to be asserted on.
        expect(screen.getByLabelText("Temperature").props.accessible).toBeUndefined();
        expect(screen.getAllByRole("radio")).toHaveLength(2);
    });
});

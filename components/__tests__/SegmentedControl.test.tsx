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

    it("is announced as one radio group rather than two loose buttons", async () => {
        await renderWithProviders(
            <SegmentedControl value="C" options={OPTIONS} onChange={() => {}}/>
        );

        expect(screen.getByRole("radiogroup")).toBeTruthy();
    });
});

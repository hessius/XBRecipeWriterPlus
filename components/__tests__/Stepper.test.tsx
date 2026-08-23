import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import Stepper, {clamp, stepped} from "@/components/Stepper";
import {renderWithProviders} from "@/test-utils/render";

describe("clamp", () => {
    it("holds a value inside its range", () => {
        expect(clamp(5, 1, 10)).toBe(5);
        expect(clamp(0, 1, 10)).toBe(1);
        expect(clamp(99, 1, 10)).toBe(10);
    });
});

describe("stepped", () => {
    it("moves by one step and stays in range", () => {
        expect(stepped(60, 10, 1, 60, 120)).toBe(70);
        expect(stepped(120, 10, 1, 60, 120)).toBe(120);
        expect(stepped(60, 10, -1, 60, 120)).toBe(60);
    });

    it("rounds a fractional step to the decimals the step implies", () => {
        expect(stepped(3.2, 0.1, 1, 3, 3.5)).toBe(3.3);
        expect(stepped(3.3, 0.1, -1, 3, 3.5)).toBe(3.2);
    });
});

describe("Stepper", () => {
    it("shows the value and reports each step", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <Stepper label="Ratio" value={16} min={5} max={100} step={1}
                     onChange={onChange}/>
        );

        expect(screen.getByTestId("stepper-value")).toHaveTextContent("16");

        await fireEvent.press(screen.getByLabelText("Increase Ratio"));
        expect(onChange).toHaveBeenCalledWith(17);

        await fireEvent.press(screen.getByLabelText("Decrease Ratio"));
        expect(onChange).toHaveBeenCalledWith(15);
    });

    it("will not step past its bounds", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <Stepper label="Dose" value={31} min={1} max={31} step={1}
                     onChange={onChange}/>
        );

        await fireEvent.press(screen.getByLabelText("Increase Dose"));
        expect(onChange).not.toHaveBeenCalled();
    });

    it("accepts a typed value and clamps it on commit", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <Stepper label="Dose" value={18} min={1} max={31} step={1}
                     onChange={onChange}/>
        );

        await fireEvent.press(screen.getByLabelText("Edit Dose"));
        const input = screen.getByLabelText("Dose");
        await fireEvent.changeText(input, "99");
        await fireEvent(input, "blur");

        expect(onChange).toHaveBeenCalledWith(31);
    });

    it("keeps an out-of-range entry visible while it is being typed", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <Stepper label="Dose" value={18} min={1} max={31} step={1}
                     onChange={onChange}/>
        );

        await fireEvent.press(screen.getByLabelText("Edit Dose"));
        await fireEvent.changeText(screen.getByLabelText("Dose"), "9");

        expect(onChange).not.toHaveBeenCalled();
        expect(screen.getByLabelText("Dose").props.value).toBe("9");
    });

    it("has no text field to find until the readout is tapped", async () => {
        await renderWithProviders(
            <Stepper label="Dose" value={18} min={1} max={31} step={1}
                     onChange={jest.fn()}/>
        );

        expect(screen.queryByTestId("stepper-input")).toBeNull();
    });

    it("is announced as adjustable", async () => {
        await renderWithProviders(
            <Stepper label="Ratio" value={16} min={5} max={100} step={1}
                     onChange={jest.fn()}/>
        );

        const group = screen.getByLabelText("Ratio, 16");
        expect(group.props.accessibilityRole).toBe("adjustable");
        expect(group.props.accessibilityValue).toEqual({min: 5, max: 100, now: 16});
    });
});

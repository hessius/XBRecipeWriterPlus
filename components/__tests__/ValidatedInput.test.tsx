import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";
import {renderWithProviders} from "@/test-utils/render";
import ValidatedInput from "@/components/ValidatedInput";

function setup(overrides: Partial<React.ComponentProps<typeof ValidatedInput>> = {}) {
    const setErrorFunction = jest.fn();
    const onValidEditFunction = jest.fn().mockResolvedValue(undefined);
    const props = {
        label:               "Temp",
        minimumValue:        70,
        maximumValue:        99,
        step:                1,
        initialValue:        90,
        maxLength:           2,
        setErrorFunction,
        onValidEditFunction,
        ...overrides
    } as React.ComponentProps<typeof ValidatedInput>;
    return {props, setErrorFunction, onValidEditFunction};
}

describe("ValidatedInput", () => {
    it("shows the label and the initial value", async () => {
        const {props} = setup();
        await renderWithProviders(<ValidatedInput {...props} />);

        expect(screen.getByText("Temp")).toBeTruthy();
        expect(screen.getByDisplayValue("90")).toBeTruthy();
    });

    it("renders a floating point value as tenths", async () => {
        const {props} = setup({floatingPoint: true, initialValue: 35, minimumValue: 10, maximumValue: 50});
        await renderWithProviders(<ValidatedInput {...props} />);

        expect(screen.getByDisplayValue("3.5")).toBeTruthy();
    });

    it("reports an in-range edit without flagging an error", async () => {
        const {props, setErrorFunction, onValidEditFunction} = setup();
        await renderWithProviders(<ValidatedInput {...props} />);

        await fireEvent.changeText(screen.getByDisplayValue("90"), "85");

        expect(onValidEditFunction).toHaveBeenCalledWith("Temp", "85");
        expect(setErrorFunction).not.toHaveBeenCalledWith(true);
    });

    it("passes the pour number through when one is given", async () => {
        const {props, onValidEditFunction} = setup({pourNumber: 3});
        await renderWithProviders(<ValidatedInput {...props} />);

        await fireEvent.changeText(screen.getByDisplayValue("90"), "85");

        expect(onValidEditFunction).toHaveBeenCalledWith("Temp", "85", 3);
    });

    it("rejects an out-of-range value, shows the range and does not report the edit", async () => {
        const {props, setErrorFunction, onValidEditFunction} = setup();
        await renderWithProviders(<ValidatedInput {...props} />);

        await fireEvent.changeText(screen.getByDisplayValue("90"), "50");

        expect(setErrorFunction).toHaveBeenCalledWith(true);
        expect(screen.getByText("Error: Temp must be between 70 and 99")).toBeTruthy();
        expect(onValidEditFunction).not.toHaveBeenCalled();
    });

    it("mentions the step in the error message when it is not one", async () => {
        const {props} = setup({step: 5});
        await renderWithProviders(<ValidatedInput {...props} />);

        await fireEvent.changeText(screen.getByDisplayValue("90"), "50");

        expect(screen.getByText("Error: Temp must be between 70 and 99 in increments of 5")).toBeTruthy();
    });

    it("clears the error once the value is back in range", async () => {
        const {props, setErrorFunction, onValidEditFunction} = setup();
        await renderWithProviders(<ValidatedInput {...props} />);

        await fireEvent.changeText(screen.getByDisplayValue("90"), "50");
        await fireEvent.changeText(screen.getByDisplayValue("50"), "80");

        expect(setErrorFunction).toHaveBeenLastCalledWith(false);
        expect(screen.queryByText(/^Error:/)).toBeNull();
        expect(onValidEditFunction).toHaveBeenCalledWith("Temp", "80");
    });

    it("treats an emptied field as an error", async () => {
        const {props, setErrorFunction} = setup();
        await renderWithProviders(<ValidatedInput {...props} />);

        await fireEvent.changeText(screen.getByDisplayValue("90"), "");

        expect(setErrorFunction).toHaveBeenCalledWith(true);
    });

    it("steps the value up and down, clamped to the range", async () => {
        const {props, onValidEditFunction} = setup({initialValue: 98, step: 1});
        await renderWithProviders(<ValidatedInput {...props} />);

        await fireEvent.press(screen.getByLabelText("Increase Temp"));
        expect(screen.getByDisplayValue("99")).toBeTruthy();

        // Already at the maximum, so this must be a no-op.
        await fireEvent.press(screen.getByLabelText("Increase Temp"));
        expect(screen.getByDisplayValue("99")).toBeTruthy();

        await fireEvent.press(screen.getByLabelText("Decrease Temp"));
        expect(screen.getByDisplayValue("98")).toBeTruthy();

        expect(onValidEditFunction).toHaveBeenLastCalledWith("Temp", "98");
    });

    it("steps up from a minimum of zero", async () => {
        const {props} = setup({label: "Pause", minimumValue: 0, maximumValue: 60, initialValue: 0, step: 1});
        await renderWithProviders(<ValidatedInput {...props} />);

        await fireEvent.press(screen.getByLabelText("Increase Pause"));

        expect(screen.getByDisplayValue("1")).toBeTruthy();
    });
});

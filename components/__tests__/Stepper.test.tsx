import React from "react";
import {act, fireEvent, screen} from "@testing-library/react-native";

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

    it("floors a value below min to min on the first increment", async () => {
        // Covers the case where a prop arrives below the allowed range (e.g.
        // grindSize uninitialised at -1) — the first step should land at min+step,
        // not at an arbitrary value.
        const onChange = jest.fn();
        await renderWithProviders(
            <Stepper label="Grind size" value={-1} min={40} max={80} step={1}
                     onChange={onChange}/>
        );

        await fireEvent.press(screen.getByLabelText("Increase Grind size"));

        expect(onChange).toHaveBeenCalledWith(40);
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

    it("answers an accessibility adjust action", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <Stepper label="Ratio" value={16} min={5} max={100} step={1}
                     onChange={onChange}/>
        );

        const group = screen.getByLabelText("Ratio, 16");
        await fireEvent(group, "accessibilityAction", {nativeEvent: {actionName: "increment"}});
        expect(onChange).toHaveBeenCalledWith(17);

        await fireEvent(group, "accessibilityAction", {nativeEvent: {actionName: "decrement"}});
        expect(onChange).toHaveBeenCalledWith(15);
    });
});

describe("Stepper hold-to-repeat", () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    it("repeats after the hold delay and again at a shortening interval", async () => {
        jest.useFakeTimers();
        const onChange = jest.fn();
        await renderWithProviders(
            <Stepper label="Ratio" value={16} min={5} max={100} step={1}
                     onChange={onChange}/>
        );

        await fireEvent(screen.getByLabelText("Increase Ratio"), "longPress");

        await act(async () => {
            jest.advanceTimersByTime(200);
        });
        expect(onChange).toHaveBeenNthCalledWith(1, 17);

        await act(async () => {
            jest.advanceTimersByTime(200);
        });
        const secondCallCount = onChange.mock.calls.length;
        expect(secondCallCount).toBeGreaterThan(1);

        await act(async () => {
            jest.advanceTimersByTime(200);
        });
        expect(onChange.mock.calls.length).toBeGreaterThan(secondCallCount);
    });

    it("stops repeating once the button is released", async () => {
        jest.useFakeTimers();
        const onChange = jest.fn();
        await renderWithProviders(
            <Stepper label="Ratio" value={16} min={5} max={100} step={1}
                     onChange={onChange}/>
        );

        const increase = screen.getByLabelText("Increase Ratio");
        await fireEvent(increase, "longPress");

        await act(async () => {
            jest.advanceTimersByTime(200);
        });
        expect(onChange).toHaveBeenCalledTimes(1);

        await fireEvent(increase, "pressOut");

        await act(async () => {
            jest.advanceTimersByTime(5000);
        });
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("stops on its own at the bound", async () => {
        jest.useFakeTimers();
        const onChange = jest.fn();

        // A real caller is controlled: onChange's value comes back in as the
        // next `value` prop. Without that feedback loop the tick would never
        // see it reach the bound and this test would be asserting nothing.
        function Controlled() {
            const [value, setValue] = React.useState(30);
            return (
                <Stepper label="Dose" value={value} min={1} max={31} step={1}
                         onChange={(next) => {
                             onChange(next);
                             setValue(next);
                         }}/>
            );
        }

        await renderWithProviders(<Controlled/>);

        await fireEvent(screen.getByLabelText("Increase Dose"), "longPress");

        await act(async () => {
            jest.advanceTimersByTime(200);
        });
        expect(onChange).toHaveBeenCalledWith(31);
        const callsAtBound = onChange.mock.calls.length;

        await act(async () => {
            jest.advanceTimersByTime(5000);
        });
        expect(onChange).toHaveBeenCalledTimes(callsAtBound);
    });

    it("steps from the value it is given, not a value captured at hold-start", async () => {
        jest.useFakeTimers();
        const onChange = jest.fn();
        const {rerender} = await renderWithProviders(
            <Stepper label="Ratio" value={16} min={5} max={100} step={1}
                     onChange={onChange}/>
        );

        await fireEvent(screen.getByLabelText("Increase Ratio"), "longPress");

        // An external change lands mid-hold, as an auto fix would.
        await rerender(
            <Stepper label="Ratio" value={50} min={5} max={100} step={1}
                     onChange={onChange}/>
        );

        await act(async () => {
            jest.advanceTimersByTime(200);
        });

        // The tick must step from 50, the value the component now has, not
        // from 16, the value captured when the hold began.
        expect(onChange).toHaveBeenCalledWith(51);
        expect(onChange).not.toHaveBeenCalledWith(17);
    });

    it("drops an in-progress draft when the value changes from outside", async () => {
        const onChange = jest.fn();
        const {rerender} = await renderWithProviders(
            <Stepper label="Dose" value={18} min={1} max={31} step={1}
                     onChange={onChange}/>
        );

        await fireEvent.press(screen.getByLabelText("Edit Dose"));
        await fireEvent.changeText(screen.getByLabelText("Dose"), "9");
        expect(screen.getByLabelText("Dose").props.value).toBe("9");

        await rerender(
            <Stepper label="Dose" value={22} min={1} max={31} step={1}
                     onChange={onChange}/>
        );

        expect(screen.queryByTestId("stepper-input")).toBeNull();
        expect(screen.getByTestId("stepper-value")).toHaveTextContent("22");
    });
});

describe("the keyboard it asks for", () => {
    async function openTheField(step: number) {
        await renderWithProviders(
            <Stepper label="Flow rate" value={3} min={3} max={3.5} step={step}
                     onChange={jest.fn()}/>
        );
        await fireEvent.press(screen.getByLabelText("Edit Flow rate"));
        return screen.getByTestId("stepper-input");
    }

    it("is the numeric pad for a whole-number step", async () => {
        expect((await openTheField(1)).props.inputMode).toBe("numeric");
    });

    it("is the decimal pad for a fractional step", async () => {
        // The numeric pad has no separator on it, so under one the tap-to-type
        // path this control advertises could not enter a stage flow rate of
        // 3.2 at all — and flow rate is the one field that steps by a tenth.
        expect((await openTheField(0.1)).props.inputMode).toBe("decimal");
    });
});

describe("Stepper walking an explicit ladder", () => {
    // The Fahrenheit case: the card stores whole Celsius, so the values a
    // temperature field can settle on are not one apart.
    const LADDER = [190, 192, 194, 196, 198, 199, 201];

    it("steps to the next value on the ladder, not the next integer", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <Stepper label="Temperature" value={194} min={190} max={201} step={1}
                     values={LADDER} onChange={onChange}/>
        );

        await fireEvent.press(screen.getByLabelText("Increase Temperature"));

        expect(onChange).toHaveBeenCalledWith(196);
    });

    it("steps back down the ladder", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <Stepper label="Temperature" value={196} min={190} max={201} step={1}
                     values={LADDER} onChange={onChange}/>
        );

        await fireEvent.press(screen.getByLabelText("Decrease Temperature"));

        expect(onChange).toHaveBeenCalledWith(194);
    });

    it("stays put at the top of the ladder", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <Stepper label="Temperature" value={201} min={190} max={201} step={1}
                     values={LADDER} onChange={onChange}/>
        );

        await fireEvent.press(screen.getByLabelText("Increase Temperature"));

        expect(onChange).not.toHaveBeenCalled();
    });

    it("snaps a typed value onto the ladder", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <Stepper label="Temperature" value={194} min={190} max={201} step={1}
                     values={LADDER} onChange={onChange}/>
        );

        await fireEvent.press(screen.getByLabelText("Edit Temperature"));
        await fireEvent.changeText(screen.getByTestId("stepper-input"), "195");
        await fireEvent(screen.getByTestId("stepper-input"), "submitEditing");

        expect(onChange).toHaveBeenCalledWith(196);
    });

    it("steps by one from a value that is not on the ladder", async () => {
        // A recipe imported before the unit was switched can hold a value the
        // ladder does not contain. The stepper must still move, and must move
        // onto the ladder rather than off into the gaps.
        const onChange = jest.fn();
        await renderWithProviders(
            <Stepper label="Temperature" value={195} min={190} max={201} step={1}
                     values={LADDER} onChange={onChange}/>
        );

        await fireEvent.press(screen.getByLabelText("Increase Temperature"));

        expect(onChange).toHaveBeenCalledWith(196);
    });
});

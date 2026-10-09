import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import OverflowSection from "@/components/OverflowSection";
import {OVERFLOW_ESTIMATE_NOTE, OVERFLOW_FOREGROUND_CAUTION} from "@/constants/brewCopy";
import type {OverflowProtection} from "@/library/brew/overflowConfig";
import {renderWithProviders} from "@/test-utils/render";

const LIMIT = "Retained-water limit in grams";

function field() {
    return screen.getByLabelText(LIMIT);
}

describe("OverflowSection", () => {
    it("opens empty and silent with nothing configured, guessing no threshold", async () => {
        const onChange = jest.fn();
        await renderWithProviders(<OverflowSection onChange={onChange}/>);

        expect(field().props.value).toBe("");
        expect(onChange).not.toHaveBeenCalled();
        expect(screen.queryByText("CHECK AGAIN")).toBeNull();
        expect(screen.queryByLabelText("Turn off overflow protection")).toBeNull();
    });

    it("configures with the first interval, 15 s, once a whole positive limit is typed", async () => {
        const onChange = jest.fn();
        await renderWithProviders(<OverflowSection onChange={onChange}/>);

        await fireEvent.changeText(field(), "120");

        expect(onChange).toHaveBeenLastCalledWith({retainedGrams: 120, checkSeconds: 15});
    });

    it("shows the caution and the estimate note once configured", async () => {
        const config: OverflowProtection = {retainedGrams: 80, checkSeconds: 30};
        await renderWithProviders(<OverflowSection config={config} onChange={jest.fn()}/>);

        expect(screen.getByText(OVERFLOW_FOREGROUND_CAUTION)).toBeOnTheScreen();
        expect(screen.getByText(OVERFLOW_ESTIMATE_NOTE)).toBeOnTheScreen();
    });

    it("offers every interval and writes the chosen one beside the same limit", async () => {
        const onChange = jest.fn();
        const config: OverflowProtection = {retainedGrams: 80, checkSeconds: 15};
        await renderWithProviders(<OverflowSection config={config} onChange={onChange}/>);

        expect(screen.getByText("CHECK AGAIN")).toBeOnTheScreen();
        for (const label of ["15 S", "30 S", "45 S"]) {
            expect(screen.getByLabelText(label)).toBeOnTheScreen();
        }
        expect(screen.getByLabelText("15 S")).toBeChecked();

        await fireEvent.press(screen.getByLabelText("45 S"));
        expect(onChange).toHaveBeenLastCalledWith({retainedGrams: 80, checkSeconds: 45});
        await fireEvent.press(screen.getByLabelText("30 S"));
        expect(onChange).toHaveBeenLastCalledWith({retainedGrams: 80, checkSeconds: 30});
    });

    it("keeps a chosen interval across an invalid entry", async () => {
        const onChange = jest.fn();
        const config: OverflowProtection = {retainedGrams: 80, checkSeconds: 45};
        await renderWithProviders(<OverflowSection config={config} onChange={onChange}/>);

        await fireEvent.changeText(field(), "abc");
        await fireEvent.changeText(field(), "90");

        expect(onChange).toHaveBeenLastCalledWith({retainedGrams: 90, checkSeconds: 45});
    });

    it.each(["0", "-5", "12.5", "1e3", "abc", " 5x", "99999999999999999999"])(
        "refuses %s with an inline error and disables rather than hiding the old config",
        async (text) => {
            const onChange = jest.fn();
            const config: OverflowProtection = {retainedGrams: 80, checkSeconds: 15};
            await renderWithProviders(<OverflowSection config={config} onChange={onChange}/>);

            await fireEvent.changeText(field(), text);

            expect(onChange).toHaveBeenLastCalledWith(undefined);
            expect(field().props.value).toBe(text);
            expect(screen.getByText("Enter a whole number of grams above 0.")).toBeOnTheScreen();
        }
    );

    it("clears the config, without an error, when the field is emptied", async () => {
        const onChange = jest.fn();
        const config: OverflowProtection = {retainedGrams: 80, checkSeconds: 15};
        await renderWithProviders(<OverflowSection config={config} onChange={onChange}/>);

        await fireEvent.changeText(field(), "");

        expect(onChange).toHaveBeenLastCalledWith(undefined);
        expect(screen.queryByText("Enter a whole number of grams above 0.")).toBeNull();
    });

    it("clears the config and the field with an explicit OFF", async () => {
        const onChange = jest.fn();
        const config: OverflowProtection = {retainedGrams: 80, checkSeconds: 15};
        await renderWithProviders(<OverflowSection config={config} onChange={onChange}/>);

        await fireEvent.press(screen.getByLabelText("Turn off overflow protection"));

        expect(onChange).toHaveBeenLastCalledWith(undefined);
        expect(field().props.value).toBe("");
    });

    it("keeps the draft text the user is editing rather than rewriting it from the config", async () => {
        const config: OverflowProtection = {retainedGrams: 80, checkSeconds: 15};
        const {rerender} = await renderWithProviders(
            <OverflowSection config={config} onChange={jest.fn()}/>
        );
        await fireEvent.changeText(field(), "9");
        // The parent echoes back what was just written.
        await rerender(<OverflowSection config={{retainedGrams: 9, checkSeconds: 15}}
                                        onChange={jest.fn()}/>);

        expect(field().props.value).toBe("9");
    });

    it("opens a recipe's stored limit as its draft, and a keyed remount does not drift", async () => {
        const {rerender} = await renderWithProviders(
            <OverflowSection key="a" config={{retainedGrams: 80, checkSeconds: 15}}
                             onChange={jest.fn()}/>
        );
        expect(field().props.value).toBe("80");

        await rerender(<OverflowSection key="b" onChange={jest.fn()}/>);

        expect(field().props.value).toBe("");
        expect(screen.queryByText(OVERFLOW_FOREGROUND_CAUTION)).toBeNull();
    });

    it("uses no em dash in its copy", async () => {
        await renderWithProviders(
            <OverflowSection config={{retainedGrams: 80, checkSeconds: 15}} onChange={jest.fn()}/>
        );
        expect(OVERFLOW_FOREGROUND_CAUTION + OVERFLOW_ESTIMATE_NOTE).not.toContain("\u2014");
    });
});

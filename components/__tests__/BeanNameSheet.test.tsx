import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import BeanNameSheet from "@/components/BeanNameSheet";
import {renderWithProviders} from "@/test-utils/render";

function noop() {}

describe("BeanNameSheet", () => {
    it("says what it will fall back to when the field is left empty", async () => {
        await renderWithProviders(
            <BeanNameSheet open onOpenChange={noop} suggestion="Ethiopia Guji"
                           onConfirm={noop}/>
        );

        expect(screen.getByText(/Skip and it will try "Ethiopia Guji"/)).toBeTruthy();
    });

    it("admits when there is nothing to fall back to", async () => {
        await renderWithProviders(
            <BeanNameSheet open onOpenChange={noop} suggestion="" onConfirm={noop}/>
        );

        expect(screen.getByText(/Skip to let it pick one/)).toBeTruthy();
    });

    it("opens on an empty field rather than on the guess", async () => {
        await renderWithProviders(
            <BeanNameSheet open onOpenChange={noop} suggestion="Ethiopia Guji"
                           onConfirm={noop}/>
        );

        expect(screen.getByTestId("bean-name-field").props.value).toBe("");
    });

    it("hands over an empty name when skipped, so the guess stands", async () => {
        const onConfirm = jest.fn();
        await renderWithProviders(
            <BeanNameSheet open onOpenChange={noop} suggestion="Ethiopia Guji"
                           onConfirm={onConfirm}/>
        );

        await fireEvent.press(screen.getByTestId("bean-name-send"));

        expect(onConfirm).toHaveBeenCalledWith("");
    });

    it("hands over the trimmed name that was typed", async () => {
        const onConfirm = jest.fn();
        await renderWithProviders(
            <BeanNameSheet open onOpenChange={noop} suggestion="" onConfirm={onConfirm}/>
        );

        await fireEvent.changeText(screen.getByTestId("bean-name-field"), "  Kenya Nyeri ");
        await fireEvent.press(screen.getByTestId("bean-name-send"));

        expect(onConfirm).toHaveBeenCalledWith("Kenya Nyeri");
    });

    // One button in two states, so the label is the only thing that says
    // whether a name is going with the brew.
    it("reads as SKIP until something is typed, then as SEND", async () => {
        await renderWithProviders(
            <BeanNameSheet open onOpenChange={noop} suggestion="" onConfirm={noop}/>
        );

        expect(screen.getByText("SKIP")).toBeTruthy();
        expect(screen.queryByText("SEND")).toBeNull();

        await fireEvent.changeText(screen.getByTestId("bean-name-field"), "Kenya");

        expect(screen.getByText("SEND")).toBeTruthy();
        expect(screen.queryByText("SKIP")).toBeNull();
    });

    // Whitespace is not a name, so the button goes back to offering the guess
    // rather than promising to send something it would only trim away.
    it("falls back to SKIP when the field holds only whitespace", async () => {
        const onConfirm = jest.fn();
        await renderWithProviders(
            <BeanNameSheet open onOpenChange={noop} suggestion="" onConfirm={onConfirm}/>
        );

        await fireEvent.changeText(screen.getByTestId("bean-name-field"), "   ");

        expect(screen.getByText("SKIP")).toBeTruthy();

        await fireEvent.press(screen.getByTestId("bean-name-send"));

        expect(onConfirm).toHaveBeenCalledWith("");
    });

    it("closes itself once an answer is given", async () => {
        const onOpenChange = jest.fn();
        await renderWithProviders(
            <BeanNameSheet open onOpenChange={onOpenChange} suggestion="Guji"
                           onConfirm={noop}/>
        );

        await fireEvent.press(screen.getByTestId("bean-name-send"));

        expect(onOpenChange).toHaveBeenCalledWith(false);
    });
});

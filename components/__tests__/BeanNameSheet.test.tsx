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

        await fireEvent.press(screen.getByTestId("bean-name-skip"));

        expect(onConfirm).toHaveBeenCalledWith("");
    });

    it("hands over the trimmed name that was typed", async () => {
        const onConfirm = jest.fn();
        await renderWithProviders(
            <BeanNameSheet open onOpenChange={noop} suggestion="" onConfirm={onConfirm}/>
        );

        await fireEvent.changeText(screen.getByTestId("bean-name-field"), "  Kenya Nyeri ");
        await fireEvent.press(screen.getByTestId("bean-name-confirm"));

        expect(onConfirm).toHaveBeenCalledWith("Kenya Nyeri");
    });

    it("refuses to send an empty name through the send button", async () => {
        const onConfirm = jest.fn();
        await renderWithProviders(
            <BeanNameSheet open onOpenChange={noop} suggestion="" onConfirm={onConfirm}/>
        );

        await fireEvent.press(screen.getByTestId("bean-name-confirm"));

        expect(onConfirm).not.toHaveBeenCalled();
    });

    it("closes itself once an answer is given", async () => {
        const onOpenChange = jest.fn();
        await renderWithProviders(
            <BeanNameSheet open onOpenChange={onOpenChange} suggestion="Guji"
                           onConfirm={noop}/>
        );

        await fireEvent.press(screen.getByTestId("bean-name-skip"));

        expect(onOpenChange).toHaveBeenCalledWith(false);
    });
});

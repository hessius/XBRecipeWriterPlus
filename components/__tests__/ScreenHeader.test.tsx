import {fireEvent, screen} from "@testing-library/react-native";
import React from "react";

import ScreenHeader from "@/components/ScreenHeader";
import {renderWithProviders} from "@/test-utils/render";

describe("ScreenHeader", () => {
    it("names the screen it is heading", async () => {
        await renderWithProviders(<ScreenHeader title="Settings" onBack={jest.fn()}/>);
        expect(screen.getByText("Settings")).toBeTruthy();
    });

    it("goes back when the key is pressed", async () => {
        const onBack = jest.fn();
        await renderWithProviders(<ScreenHeader title="About" onBack={onBack}/>);
        await fireEvent.press(screen.getByLabelText("Back"));
        expect(onBack).toHaveBeenCalledTimes(1);
    });

    it("gives the back key a label, because a glyph has no name", async () => {
        await renderWithProviders(<ScreenHeader title="About" onBack={jest.fn()}/>);
        expect(screen.getByLabelText("Back")).toBeTruthy();
    });
});

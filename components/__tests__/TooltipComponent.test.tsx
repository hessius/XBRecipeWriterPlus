import React from "react";
import {Alert} from "react-native";
import {screen, fireEvent} from "@testing-library/react-native";

import TooltipComponent from "@/components/TooltipComponent";
import {renderWithProviders} from "@/test-utils/render";

describe("TooltipComponent", () => {
    it("shows its content in the app rather than in a system modal", async () => {
        const alert = jest.spyOn(Alert, "alert");

        await renderWithProviders(<TooltipComponent content="Grind size is 0 to 100."/>);
        await fireEvent.press(screen.getByLabelText("What is this?"));

        expect(screen.getByText("Grind size is 0 to 100.")).toBeTruthy();
        expect(alert).not.toHaveBeenCalled();

        alert.mockRestore();
    });
});

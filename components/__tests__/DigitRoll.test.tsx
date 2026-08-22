import React from "react";
import {screen} from "@testing-library/react-native";

import DigitRoll from "@/components/DigitRoll";
import {renderWithProviders} from "@/test-utils/render";

describe("DigitRoll", () => {
    it("renders one column per digit", async () => {
        await renderWithProviders(<DigitRoll value={255}/>);
        expect(screen.getAllByTestId("digit-roll-column")).toHaveLength(3);
    });

    it("renders the current value as text", async () => {
        await renderWithProviders(<DigitRoll value={255}/>);
        expect(screen.getByLabelText("255")).toBeTruthy();
    });

    it("pads to the requested minimum width", async () => {
        await renderWithProviders(<DigitRoll value={7} minDigits={3}/>);
        expect(screen.getAllByTestId("digit-roll-column")).toHaveLength(3);
        expect(screen.getByLabelText("007")).toBeTruthy();
    });

    it("appends a suffix outside the rolling columns", async () => {
        await renderWithProviders(<DigitRoll value={255} suffix="ml"/>);
        expect(screen.getAllByTestId("digit-roll-column")).toHaveLength(3);
        expect(screen.getByText("ml")).toBeTruthy();
    });

    it("grows the column count when the value gains a digit", async () => {
        const {rerender} = await renderWithProviders(<DigitRoll value={9}/>);
        expect(screen.getAllByTestId("digit-roll-column")).toHaveLength(1);

        await rerender(<DigitRoll value={10}/>);
        expect(screen.getAllByTestId("digit-roll-column")).toHaveLength(2);
    });
});

import React from "react";
import {screen} from "@testing-library/react-native";

import TeaBanner from "@/components/TeaBanner";
import {renderWithProviders} from "@/test-utils/render";

describe("TeaBanner", () => {
    it("says what tea does differently", async () => {
        await renderWithProviders(<TeaBanner accent="#8FCB9B"/>);

        expect(screen.getByText("TEA")).toBeTruthy();
        // A regex, not a string: RNTL's `toHaveTextContent` matches a string
        // exactly, after normalising whitespace — it is not a substring test.
        expect(screen.getByTestId("tea-banner-body")).toHaveTextContent(/90 ml/);
    });
});

import React from "react";
import {screen} from "@testing-library/react-native";

import Wordmark from "@/components/Wordmark";
import {renderWithProviders} from "@/test-utils/render";

describe("Wordmark", () => {
    it("renders the product name", async () => {
        await renderWithProviders(<Wordmark/>);
        expect(screen.getByLabelText("XBRW++")).toBeTruthy();
    });

    it("sets the plus signs apart from the letters", async () => {
        await renderWithProviders(<Wordmark/>);
        expect(screen.getByText("XBRW")).toBeTruthy();
        expect(screen.getByText("++")).toBeTruthy();
    });
});

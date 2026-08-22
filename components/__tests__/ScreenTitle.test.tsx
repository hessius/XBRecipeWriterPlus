import React from "react";
import {screen} from "@testing-library/react-native";

import ScreenTitle from "@/components/ScreenTitle";
import {renderWithProviders} from "@/test-utils/render";

describe("ScreenTitle", () => {
    it("renders the title", async () => {
        await renderWithProviders(<ScreenTitle title="Recipes" count={12}/>);
        expect(screen.getByText("Recipes")).toBeTruthy();
    });

    it("renders the count as a superscript", async () => {
        await renderWithProviders(<ScreenTitle title="Recipes" count={12}/>);
        expect(screen.getByText("12")).toBeTruthy();
    });

    it("omits the count when there is none", async () => {
        await renderWithProviders(<ScreenTitle title="Recipes"/>);
        expect(screen.queryByTestId("screen-title-count")).toBeNull();
    });

    it("omits the count when it is zero, because the empty state says it better", async () => {
        await renderWithProviders(<ScreenTitle title="Recipes" count={0}/>);
        expect(screen.queryByTestId("screen-title-count")).toBeNull();
    });
});

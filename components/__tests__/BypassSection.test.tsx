import React from "react";
import {screen} from "@testing-library/react-native";

import BypassSection from "@/components/BypassSection";
import {renderWithProviders} from "@/test-utils/render";
import Recipe from "@/library/Recipe";

function recipeWithBypass({enabled, volume = 45, temp = 60}: {
    enabled: boolean;
    volume?: number;
    temp?: number;
}): Recipe {
    const recipe = new Recipe();
    recipe.bypassEnabled = enabled;
    recipe.bypassVolume = volume;
    recipe.bypassTemp = temp;
    return recipe;
}

describe("BypassSection", () => {
    it("shows bypass volume and temperature when bypass is enabled", async () => {
        await renderWithProviders(<BypassSection recipe={recipeWithBypass({enabled: true})}/>);

        expect(screen.getByText("BYPASS WATER")).toBeTruthy();
        expect(screen.getByText("45 ML · 60 °C")).toBeTruthy();
        expect(screen.getByTestId("bypass-section-body")).toHaveTextContent(/extra water/);
        expect(screen.getByTestId("bypass-section-body")).toHaveTextContent(/not brewed through the coffee/);
    });

    it("is absent when bypass is off", async () => {
        await renderWithProviders(<BypassSection recipe={recipeWithBypass({enabled: false})}/>);

        expect(screen.queryByText("BYPASS WATER")).toBeNull();
        expect(screen.queryByTestId("bypass-section-body")).toBeNull();
    });
});

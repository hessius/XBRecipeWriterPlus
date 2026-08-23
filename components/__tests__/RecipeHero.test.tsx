import React from "react";
import {screen} from "@testing-library/react-native";

import RecipeHero from "@/components/RecipeHero";
import Pour from "@/library/Pour";
import {renderWithProviders} from "@/test-utils/render";

function pours(...volumes: number[]): Pour[] {
    return volumes.map((volume, index) => new Pour(index + 1, volume));
}

const BASE = {
    name: "Ethiopia Guji",
    xid: "AB12CD",
    accent: "#F0B98E",
    beverage: "COFFEE" as const,
    pours: pours(96, 96, 96)
};

describe("RecipeHero", () => {
    it("shows the name, the beverage and the id", async () => {
        await renderWithProviders(<RecipeHero {...BASE}/>);

        expect(screen.getByText("Ethiopia Guji")).toBeTruthy();
        expect(screen.getByText("COFFEE")).toBeTruthy();
        expect(screen.getByText("AB12CD")).toBeTruthy();
    });

    it("stands in for a recipe that has no name yet", async () => {
        await renderWithProviders(<RecipeHero {...BASE} name=""/>);

        expect(screen.getByText("UNTITLED")).toBeTruthy();
    });

    it("leaves the id out when the recipe has none", async () => {
        await renderWithProviders(<RecipeHero {...BASE} xid=""/>);

        expect(screen.queryByTestId("hero-xid")).toBeNull();
    });

    it("is a picture, not a control", async () => {
        await renderWithProviders(<RecipeHero {...BASE}/>);

        const hero = screen.getByTestId("recipe-hero");
        expect(screen.queryAllByRole("button")).toHaveLength(0);
        expect(hero.props.accessibilityRole).not.toBe("button");
    });
});

import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import BypassRung from "@/components/BypassRung";
import Recipe from "@/library/Recipe";
import {renderWithProviders} from "@/test-utils/render";

/** 45 ml and 60 C on purpose: neither is a default, so a passing assertion
 *  proves a real binding rather than a constant that happens to agree. */
function withBypass(): Recipe {
    const recipe = new Recipe();
    recipe.bypassEnabled = true;
    recipe.bypassVolume  = 45;
    recipe.bypassTemp    = 60;
    return recipe;
}

function props(recipe: Recipe, overrides = {}) {
    return {
        recipe,
        open:              false,
        showHint:          false,
        temperatureUnit:   "C" as const,
        onToggle:          jest.fn(),
        onEnabledChange:   jest.fn(),
        onChange:          jest.fn(),
        ...overrides
    };
}

describe("BypassRung", () => {
    it("offers a ghost rung when bypass is off", async () => {
        await renderWithProviders(<BypassRung {...props(new Recipe())}/>);

        expect(screen.getByTestId("bypass-ghost")).toBeTruthy();
        expect(screen.queryByTestId("bypass-rung")).toBeNull();
    });

    it("turns bypass on from the ghost", async () => {
        const onEnabledChange = jest.fn();
        await renderWithProviders(
            <BypassRung {...props(new Recipe(), {onEnabledChange})}/>
        );

        await fireEvent.press(screen.getByLabelText("Add bypass water"));

        expect(onEnabledChange).toHaveBeenCalledWith(true);
    });

    it("shows the volume and temperature when bypass is on", async () => {
        await renderWithProviders(<BypassRung {...props(withBypass())}/>);

        expect(screen.getByTestId("bypass-rung")).toBeTruthy();
        expect(screen.getByText("45")).toBeTruthy();
        expect(screen.getByText("60")).toBeTruthy();
    });

    it("shows the card note whenever bypass is on, hints or no hints", async () => {
        await renderWithProviders(
            <BypassRung {...props(withBypass(), {showHint: false})}/>
        );

        expect(screen.getByTestId("bypass-card-note")).toBeTruthy();
    });

    it("shows no card note when bypass is off", async () => {
        await renderWithProviders(<BypassRung {...props(new Recipe())}/>);

        expect(screen.queryByTestId("bypass-card-note")).toBeNull();
    });

    it("shows the explanation only with hints on", async () => {
        await renderWithProviders(
            <BypassRung {...props(withBypass(), {open: true, showHint: true})}/>
        );

        expect(screen.getByTestId("bypass-explainer")).toBeTruthy();
    });

    it("hides the explanation with hints off", async () => {
        await renderWithProviders(
            <BypassRung {...props(withBypass(), {open: true, showHint: false})}/>
        );

        expect(screen.queryByTestId("bypass-explainer")).toBeNull();
    });

    it("turns bypass off from the open rung", async () => {
        const onEnabledChange = jest.fn();
        await renderWithProviders(
            <BypassRung {...props(withBypass(), {open: true, onEnabledChange})}/>
        );

        await fireEvent.press(screen.getByLabelText("Remove bypass water"));

        expect(onEnabledChange).toHaveBeenCalledWith(false);
    });

    it("draws nothing at all for tea", async () => {
        const recipe = withBypass();
        recipe.cupType = 4;

        await renderWithProviders(<BypassRung {...props(recipe, {isTea: true})}/>);

        expect(screen.queryByTestId("bypass-rung")).toBeNull();
        expect(screen.queryByTestId("bypass-ghost")).toBeNull();
    });
});

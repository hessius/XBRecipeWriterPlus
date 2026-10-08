import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";
import {Text} from "tamagui";

import QuickEditPanel from "@/components/QuickEditPanel";
import {palette} from "@/constants/colors";
import Pour from "@/library/Pour";
import Recipe, {CUP_TYPE, GRINDER_OFF_VALUE} from "@/library/Recipe";
import type {QuickEditAdjustments} from "@/library/quickEdit";
import {renderWithProviders} from "@/test-utils/render";

function coffeeRecipe(): Recipe {
    const recipe = new Recipe();
    recipe.cupType = CUP_TYPE.XPOD;
    recipe.dosage = 20;
    recipe.ratio = 16;
    recipe.grindSize = 65;
    recipe.grinder = true;
    recipe.pours = [
        new Pour(1, 80, 88, 30, 0, 0, 20),
        new Pour(2, 120, 88, 30, 0, 0, 10),
        new Pour(3, 120, 90, 30, 0, 0, 0)
    ];
    return recipe;
}

function teaRecipe(): Recipe {
    const recipe = coffeeRecipe();
    recipe.cupType = CUP_TYPE.TEA;
    recipe.dosage = 5;
    recipe.ratio = 18;
    recipe.pours = [new Pour(1, 90, 88, 40, 0, 0, 0)];
    return recipe;
}

async function draw(
    adjustments: QuickEditAdjustments = {},
    recipe: Recipe = coffeeRecipe(),
    onChange = jest.fn()
) {
    const rendered = await renderWithProviders(
        <QuickEditPanel recipe={recipe} adjustments={adjustments}
                        accent={palette.brand} onChange={onChange}/>
    );
    return {onChange, ...rendered};
}

describe("QuickEditPanel", () => {
    it("reports dose changes as deviations from the saved recipe", async () => {
        const {onChange} = await draw();

        await fireEvent.press(screen.getByLabelText("Increase Quick edit dose"));

        expect(onChange).toHaveBeenCalledWith({dose: 21});
    });

    it("reports ratio changes as deviations from the saved recipe", async () => {
        const {onChange} = await draw();

        await fireEvent.press(screen.getByLabelText("Increase Quick edit ratio"));

        expect(onChange).toHaveBeenCalledWith({ratio: 17});
    });

    it("reports grind changes and shows grinder off as OFF", async () => {
        const {onChange, rerender} = await draw({grind: 80});

        await fireEvent.press(screen.getByLabelText("Increase Quick edit grind"));

        expect(onChange).toHaveBeenCalledWith({grind: GRINDER_OFF_VALUE});

        await rerender(
            <QuickEditPanel recipe={coffeeRecipe()} adjustments={{grind: GRINDER_OFF_VALUE}}
                            accent={palette.brand} onChange={onChange}/>
        );

        expect(screen.getByText("OFF")).toBeTruthy();
    });

    it("reports temperature offset changes", async () => {
        const {onChange} = await draw();

        await fireEvent.press(screen.getByLabelText("Increase Temperature offset"));

        expect(onChange).toHaveBeenCalledWith({tempOffset: 1});
    });

    it("hides ratio for tea and shows it for coffee", async () => {
        const {rerender} = await draw({}, teaRecipe());

        expect(screen.queryByLabelText("Quick edit ratio, 18")).toBeNull();

        await rerender(
            <QuickEditPanel recipe={coffeeRecipe()} adjustments={{}}
                            accent={palette.brand} onChange={jest.fn()}/>
        );

        expect(screen.getByLabelText("Quick edit ratio, 16")).toBeTruthy();
    });

    it.each([
        [{tempOffset: 2}, "Temperature offset, +2 °C"],
        [{}, "Temperature offset, 0 °C"],
        [{tempOffset: -3}, "Temperature offset, -3 °C"]
    ] as const)("shows signed temperature offset %#", async (adjustments, label) => {
        await draw(adjustments);

        expect(screen.getByLabelText(label)).toBeTruthy();
    });

    it("shows the temperature baseline from the saved recipe", async () => {
        await draw();

        expect(screen.getByTestId("quick-edit-temperature-baseline"))
            .toHaveTextContent(/88, 88, 90/);
    });

    it("explains dose and ratio volume rescaling", async () => {
        const {rerender} = await draw({dose: 18});

        expect(screen.getByTestId("quick-edit-explainer"))
            .toHaveTextContent("Stage volumes rescale to 288 ml to match the new dose.");

        await rerender(
            <QuickEditPanel recipe={coffeeRecipe()} adjustments={{ratio: 17}}
                            accent={palette.brand} onChange={jest.fn()}/>
        );

        expect(screen.getByTestId("quick-edit-explainer"))
            .toHaveTextContent("Stage volumes rescale to 340 ml to match the new ratio.");
    });

    it("omits the explainer for grind and temperature changes", async () => {
        const {rerender} = await draw({grind: 66});

        expect(screen.queryByTestId("quick-edit-explainer")).toBeNull();

        await rerender(
            <QuickEditPanel recipe={coffeeRecipe()} adjustments={{tempOffset: 2}}
                            accent={palette.brand} onChange={jest.fn()}/>
        );

        expect(screen.queryByTestId("quick-edit-explainer")).toBeNull();
    });

    it("surfaces problems and reports brewability through the render prop", async () => {
        await renderWithProviders(
            <QuickEditPanel recipe={coffeeRecipe()} adjustments={{ratio: 100}}
                            accent={palette.brand} onChange={jest.fn()}
                            renderBrewAction={({brewable}) => (
                                <Text testID="host-brewable">
                                    {brewable ? "brewable" : "blocked"}
                                </Text>
                            )}/>
        );

        expect(screen.getByTestId("quick-edit-problems"))
            .toHaveTextContent(/Stage 1 pours/);
        expect(screen.getByTestId("host-brewable")).toHaveTextContent("blocked");
    });

    it("reports brewable when there are no problems", async () => {
        await renderWithProviders(
            <QuickEditPanel recipe={coffeeRecipe()} adjustments={{grind: 66}}
                            accent={palette.brand} onChange={jest.fn()}
                            renderBrewAction={({brewable}) => (
                                <Text testID="host-brewable">
                                    {brewable ? "brewable" : "blocked"}
                                </Text>
                            )}/>
        );

        expect(screen.queryByTestId("quick-edit-problems")).toBeNull();
        expect(screen.getByTestId("host-brewable")).toHaveTextContent("brewable");
    });

    it("resets every adjustment", async () => {
        const {onChange} = await draw({
            dose: 18,
            ratio: 15,
            grind: 66,
            tempOffset: -2
        });

        await fireEvent.press(screen.getByLabelText("Reset quick edits"));

        expect(onChange).toHaveBeenCalledWith({});
    });
});

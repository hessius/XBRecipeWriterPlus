/**
 * `render` and `fireEvent` are asynchronous in this repository. Without the
 * `await`, `screen` is empty and the test passes for the wrong reason.
 */
import React from "react";
import {fireEvent, screen, waitFor} from "@testing-library/react-native";

import NewRecipeSheet from "@/components/NewRecipeSheet";
import {MAX_TEA_POURS} from "@/library/cardLimits";
import {blankRecipe} from "@/library/newRecipe";
import {renderWithProviders, SHEET_PRESS_TIMEOUT} from "@/test-utils/render";

async function pressOnSheet(label: string, landed: () => boolean): Promise<void> {
    await waitFor(async () => {
        await fireEvent.press(screen.getByLabelText(label));
        expect(landed()).toBe(true);
    }, {timeout: SHEET_PRESS_TIMEOUT});
}

describe("NewRecipeSheet", () => {
    it("offers both beverages", async () => {
        await renderWithProviders(
            <NewRecipeSheet open onOpenChange={() => {}} onChoose={() => {}}/>
        );

        expect(await screen.findByText("COFFEE")).toBeTruthy();
        expect(await screen.findByText("TEA")).toBeTruthy();
    });

    it("reports the beverage chosen", async () => {
        const onChoose = jest.fn();
        await renderWithProviders(
            <NewRecipeSheet open onOpenChange={() => {}} onChoose={onChoose}/>
        );

        await fireEvent.press(await screen.findByLabelText("New coffee recipe"));

        expect(onChoose).toHaveBeenCalledWith("coffee");
    });

    it("reports tea distinctly", async () => {
        const onChoose = jest.fn();
        await renderWithProviders(
            <NewRecipeSheet open onOpenChange={() => {}} onChoose={onChoose}/>
        );

        await fireEvent.press(await screen.findByLabelText("New tea recipe"));

        expect(onChoose).toHaveBeenCalledWith("tea");
    });

    it("says what each door will produce", async () => {
        // The door is the only place the presets are stated. A user who takes
        // the coffee door and finds a 15 g dose should have been told.
        //
        // Each summary is matched by a slice long enough to hit only one door:
        // a bare `/5 g/` would also match the coffee door's "15 g" and make
        // `findByText` throw on two matches.
        await renderWithProviders(
            <NewRecipeSheet open onOpenChange={() => {}} onChoose={() => {}}/>
        );

        expect(await screen.findByText(/15 g · 1:16/)).toBeTruthy();
        expect(await screen.findByText(/5 g · 90 ml steeps · up to 3/)).toBeTruthy();
    });

    it("states the presets the factory will actually apply", async () => {
        // The test above pins the wording; this one pins the wording to the
        // truth. Without it, blankRecipe could move the dose to 18 g and both
        // suites would stay green while the door told the user 15 -- the door
        // is the only place the presets are stated, so nothing else would
        // catch it.
        await renderWithProviders(
            <NewRecipeSheet open onOpenChange={() => {}} onChoose={() => {}}/>
        );

        const coffee = blankRecipe("coffee");
        expect(await screen.findByText(
            new RegExp(`${coffee.dosage} g · 1:${coffee.ratio} · grind ${coffee.grindSize}`)
        )).toBeTruthy();

        const tea = blankRecipe("tea");
        expect(await screen.findByText(
            new RegExp(`^${tea.dosage} g · 90 ml steeps · up to ${MAX_TEA_POURS}$`)
        )).toBeTruthy();
    });

    it("offers BrewMind as the AI door", async () => {
        await renderWithProviders(
            <NewRecipeSheet open onOpenChange={() => {}}
                            onChoose={() => {}}
                            onBrewMind={() => {}}/>
        );

        expect(await screen.findByText("FROM SCRATCH")).toBeTruthy();
        expect(await screen.findByText("WITH AI")).toBeTruthy();
        expect(screen.getByTestId("new-recipe-brewmind-label")).toHaveTextContent("BREWMIND");
        expect(screen.getByText("Pick a coffee. Bring back a recipe.")).toBeTruthy();
        expect(screen.getByRole("button", {name: "Build a recipe with BrewMind"})).toBeTruthy();
    });

    it("opens BrewMind when its door is pressed", async () => {
        const onBrewMind = jest.fn();
        await renderWithProviders(
            <NewRecipeSheet open onOpenChange={() => {}}
                            onChoose={() => {}}
                            onBrewMind={onBrewMind}/>
        );

        await pressOnSheet("Build a recipe with BrewMind", () => onBrewMind.mock.calls.length > 0);

        expect(onBrewMind).toHaveBeenCalledTimes(1);
    });

    it("does not choose a blank recipe from the BrewMind door", async () => {
        const onChoose = jest.fn();
        const onBrewMind = jest.fn();
        await renderWithProviders(
            <NewRecipeSheet open onOpenChange={() => {}}
                            onChoose={onChoose}
                            onBrewMind={onBrewMind}/>
        );

        await pressOnSheet("Build a recipe with BrewMind", () => onBrewMind.mock.calls.length > 0);

        expect(onChoose).not.toHaveBeenCalled();
    });

    it("keeps the BrewMind door inert while it is busy", async () => {
        const onBrewMind = jest.fn();
        await renderWithProviders(
            <NewRecipeSheet open onOpenChange={() => {}}
                            onChoose={() => {}}
                            onBrewMind={onBrewMind}
                            brewMindBusy/>
        );

        const door = await screen.findByTestId("new-recipe-brewmind-door");
        expect(door.props.accessibilityState.disabled).toBe(true);
        await fireEvent.press(door);

        expect(onBrewMind).not.toHaveBeenCalled();
    });

    it("draws nothing while closed", async () => {
        await renderWithProviders(
            <NewRecipeSheet open={false} onOpenChange={() => {}} onChoose={() => {}}/>
        );

        expect(screen.queryByText("COFFEE")).toBeNull();
    });
});

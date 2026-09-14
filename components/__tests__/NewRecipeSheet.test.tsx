/**
 * `render` and `fireEvent` are asynchronous in this repository. Without the
 * `await`, `screen` is empty and the test passes for the wrong reason.
 */
import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import NewRecipeSheet from "@/components/NewRecipeSheet";
import {renderWithProviders} from "@/test-utils/render";

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

    it("draws nothing while closed", async () => {
        await renderWithProviders(
            <NewRecipeSheet open={false} onOpenChange={() => {}} onChoose={() => {}}/>
        );

        expect(screen.queryByText("COFFEE")).toBeNull();
    });
});

import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import BrewRatingBar from "@/components/BrewRatingBar";
import Pour from "@/library/Pour";
import {renderWithProviders} from "@/test-utils/render";

function props(over = {}) {
    return {
        recipeName: "Morning Bloem",
        figures: "14:32 · 244 G",
        pours: [new Pour(1), new Pour(2)],
        samples: [],
        accent: "#ff8800",
        onOpen: jest.fn(),
        onRate: jest.fn(),
        onDismiss: jest.fn(),
        ...over
    };
}

describe("BrewRatingBar", () => {
    it("leads with the figures and follows with the recipe", async () => {
        await renderWithProviders(<BrewRatingBar {...props()} />);
        expect(screen.getByText("14:32 · 244 G")).toBeTruthy();
        expect(screen.getByText(/MORNING BLOEM/)).toBeTruthy();
    });

    it("opens the brew when the bar is pressed", async () => {
        const onOpen = jest.fn();
        await renderWithProviders(<BrewRatingBar {...props({onOpen})} />);
        await fireEvent.press(screen.getByLabelText("Open the last brew"));
        expect(onOpen).toHaveBeenCalled();
    });

    it("reports the star that was pressed", async () => {
        const onRate = jest.fn();
        await renderWithProviders(<BrewRatingBar {...props({onRate})} />);
        await fireEvent.press(screen.getByLabelText("Rate 4 stars"));
        expect(onRate).toHaveBeenCalledWith(4);
    });

    it("can be put away", async () => {
        const onDismiss = jest.fn();
        await renderWithProviders(<BrewRatingBar {...props({onDismiss})} />);
        await fireEvent.press(screen.getByLabelText("Not now"));
        expect(onDismiss).toHaveBeenCalled();
    });
});

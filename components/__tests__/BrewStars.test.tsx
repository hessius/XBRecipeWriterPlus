import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import BrewStars from "@/components/BrewStars";
import {renderWithProviders} from "@/test-utils/render";

describe("BrewStars, as a reading", () => {
    it("draws nothing at all for an unrated brew", async () => {
        // Five hollow stars would be how a bad brew reads, and unrated is not
        // bad. The reading surface shows what was given or it shows nothing.
        await renderWithProviders(<BrewStars rating={0} testID="stars"/>);
        expect(screen.queryByTestId("stars")).toBeNull();
    });

    it("says the rating in words for a screen reader", async () => {
        await renderWithProviders(<BrewStars rating={4} testID="stars"/>);
        expect(screen.getByLabelText("4 stars")).toBeTruthy();
    });

    it("speaks one star in the singular", async () => {
        await renderWithProviders(<BrewStars rating={1} testID="stars"/>);
        expect(screen.getByLabelText("1 star")).toBeTruthy();
    });
});

describe("BrewStars, as a control", () => {
    it("offers every star even when nothing is rated yet", async () => {
        // The opposite rule from the reading, and deliberately: a control the
        // user cannot see is a control they cannot use.
        await renderWithProviders(
            <BrewStars rating={0} testID="stars" onRate={jest.fn()}/>
        );
        expect(screen.getByTestId("stars-5")).toBeTruthy();
    });

    it("reports the star that was pressed", async () => {
        const onRate = jest.fn();
        await renderWithProviders(
            <BrewStars rating={0} testID="stars" onRate={onRate}/>
        );
        await fireEvent.press(screen.getByTestId("stars-3"));
        expect(onRate).toHaveBeenCalledWith(3);
    });

    it("clears the rating when the star that holds it is pressed again", async () => {
        // The only way back to unrated. Without it a rating given by accident
        // while tapping through the screen is permanent.
        const onRate = jest.fn();
        await renderWithProviders(
            <BrewStars rating={3} testID="stars" onRate={onRate}/>
        );
        await fireEvent.press(screen.getByTestId("stars-3"));
        expect(onRate).toHaveBeenCalledWith(0);
    });

    it("says what each star will do, including the one that undoes", async () => {
        await renderWithProviders(
            <BrewStars rating={3} testID="stars" onRate={jest.fn()}/>
        );
        expect(screen.getByLabelText("Rate 1 star")).toBeTruthy();
        expect(screen.getByLabelText("Clear the rating, currently 3 stars")).toBeTruthy();
    });
});

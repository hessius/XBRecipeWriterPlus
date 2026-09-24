import React from "react";
import {screen, fireEvent} from "@testing-library/react-native";

import HistorySection from "@/components/HistorySection";
import type {BrewSummary} from "@/library/BrewDatabase";
import {renderWithProviders} from "@/test-utils/render";

function summary(overrides: Partial<BrewSummary> = {}): BrewSummary {
    return {
        times: 0, lastAt: 0, avgRating: 0, rated: 0,
        meanBrewSeconds: 0, meanCupMl: 0, abandoned: 0,
        ...overrides
    };
}

describe("HistorySection", () => {
    it("says plainly that a recipe has never been brewed", async () => {
        // And invites nothing beyond the star: BREW is on the screen above
        // this line already, and a second prompt here would be the app nagging.
        await renderWithProviders(<HistorySection summary={summary()}/>);

        expect(screen.getByTestId("history-summary"))
            .toHaveTextContent("Not brewed yet.");
    });

    it("counts one brew as once rather than as one times", async () => {
        await renderWithProviders(
            <HistorySection summary={summary({
                times: 1, lastAt: Date.UTC(2026, 2, 12, 12)
            })}/>
        );

        expect(screen.getByTestId("history-summary"))
            .toHaveTextContent("Brewed once, last on 2026-03-12.");
    });

    it("counts the many, and dates the last of them", async () => {
        await renderWithProviders(
            <HistorySection summary={summary({
                times: 7, lastAt: Date.UTC(2026, 2, 12, 12)
            })}/>
        );

        expect(screen.getByTestId("history-summary"))
            .toHaveTextContent("Brewed 7 times, last on 2026-03-12.");
    });

    it("leaves the date out of a brew that cannot say when it was", async () => {
        // An old row with no timestamp still counts as a brew. Printing the
        // epoch would claim it was brewed in 1970.
        await renderWithProviders(
            <HistorySection summary={summary({times: 3})}/>
        );

        expect(screen.getByTestId("history-summary"))
            .toHaveTextContent("Brewed 3 times.");
        expect(screen.queryByText(/1970/)).toBeNull();
    });
});

describe("the star on a recipe", () => {
    it("is not offered where nothing can be written", async () => {
        // A control that does nothing is worse than no control.
        await renderWithProviders(<HistorySection summary={summary()}/>);

        expect(screen.queryByTestId("recipe-stars")).toBeNull();
    });

    it("gives the rating the user tapped", async () => {
        const rated: number[] = [];
        await renderWithProviders(
            <HistorySection summary={summary()} onRate={(n) => rated.push(n)}/>
        );

        await fireEvent.press(screen.getByTestId("recipe-stars-4"));

        expect(rated).toEqual([4]);
    });

    it("never offers to clear what it cannot clear", async () => {
        // The stars here average several brews, so there is no one verdict to
        // take back, and the brew record is where a rating is undone.
        await renderWithProviders(
            <HistorySection summary={summary({times: 2, rated: 2, avgRating: 3})}
                            onRate={() => {}}/>
        );

        expect(screen.queryByLabelText(/Clear the rating/)).toBeNull();
    });

    it("says what the ratings came to, and how many said it", async () => {
        await renderWithProviders(
            <HistorySection summary={summary({times: 5, rated: 3, avgRating: 4.25})}
                            onRate={() => {}}/>
        );

        expect(screen.getByTestId("history-rating"))
            .toHaveTextContent("4.3 from 3 ratings");
    });

    it("does not print an average nobody gave", async () => {
        // Unrated is not nought. A recipe brewed four times and never judged
        // has no average, and 0.0 would be a verdict nobody gave.
        await renderWithProviders(
            <HistorySection summary={summary({times: 4})} onRate={() => {}}/>
        );

        expect(screen.queryByTestId("history-rating")).toBeNull();
    });

    it("counts one rating as one rating", async () => {
        await renderWithProviders(
            <HistorySection summary={summary({times: 1, rated: 1, avgRating: 5})}
                            onRate={() => {}}/>
        );

        expect(screen.getByTestId("history-rating"))
            .toHaveTextContent("5.0 from 1 rating");
    });
});

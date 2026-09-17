import React from "react";
import {screen} from "@testing-library/react-native";

import HistorySection from "@/components/HistorySection";
import {renderWithProviders} from "@/test-utils/render";

describe("HistorySection", () => {
    it("says plainly that a recipe has never been brewed", async () => {
        // And invites nothing: BREW is on the screen above this line already,
        // and a second prompt here would be the app nagging.
        await renderWithProviders(
            <HistorySection summary={{times: 0, lastAt: 0}}/>
        );

        expect(screen.getByTestId("history-summary"))
            .toHaveTextContent("Not brewed yet.");
    });

    it("counts one brew as once rather than as one times", async () => {
        await renderWithProviders(
            <HistorySection summary={{times: 1, lastAt: Date.UTC(2026, 2, 12, 12)}}/>
        );

        expect(screen.getByTestId("history-summary"))
            .toHaveTextContent("Brewed once, last on 2026-03-12.");
    });

    it("counts the many, and dates the last of them", async () => {
        await renderWithProviders(
            <HistorySection summary={{times: 7, lastAt: Date.UTC(2026, 2, 12, 12)}}/>
        );

        expect(screen.getByTestId("history-summary"))
            .toHaveTextContent("Brewed 7 times, last on 2026-03-12.");
    });

    it("leaves the date out of a brew that cannot say when it was", async () => {
        // An old row with no timestamp still counts as a brew. Printing the
        // epoch would claim it was brewed in 1970.
        await renderWithProviders(
            <HistorySection summary={{times: 3, lastAt: 0}}/>
        );

        expect(screen.getByTestId("history-summary"))
            .toHaveTextContent("Brewed 3 times.");
        expect(screen.queryByText(/1970/)).toBeNull();
    });
});

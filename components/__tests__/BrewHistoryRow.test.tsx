// components/__tests__/BrewHistoryRow.test.tsx
import React from "react";
import {StyleSheet} from "react-native";
import {screen} from "@testing-library/react-native";

import BrewHistoryRow from "@/components/BrewHistoryRow";
import {palette} from "@/constants/colors";
import type {StoredBrew} from "@/library/BrewDatabase";
import {renderWithProviders} from "@/test-utils/render";

function brew(overrides: Partial<StoredBrew> = {}): StoredBrew {
    return {
        id: "brew-1", recipeUuid: "uuid-1", recipeName: "Ethiopia Guji",
        accent: "#C86A3B", startedAt: Date.UTC(2026, 8, 3, 7, 42),
        endedAt: Date.UTC(2026, 8, 3, 7, 46), outcome: "done", failure: null,
        pours: 5, waterTotal: 250, cupTotal: 244, heldSeconds: 14,
        hasStream: true, ...overrides
    };
}

describe("BrewHistoryRow", () => {
    it("names the brew and what came out of it", async () => {
        const {getByText} = await renderWithProviders(
            <BrewHistoryRow brew={brew()} onPress={jest.fn()} />
        );
        expect(getByText("Ethiopia Guji")).toBeTruthy();
        expect(getByText(/244 G/)).toBeTruthy();
    });

    it("draws on an opaque background, so the row covers the tile it slides over", async () => {
        // The delete tile sits behind the row, not beside it. With a transparent
        // row the tile read straight through the words as the drawer closed --
        // two things occupying one strip of screen. The recipe list never showed
        // this because its cards are painted with the recipe's accent.
        const {getByLabelText} = await renderWithProviders(
            <BrewHistoryRow brew={brew()} onPress={jest.fn()} />
        );
        const row = getByLabelText(/^Ethiopia Guji,/);
        expect(StyleSheet.flatten(row.props.style).backgroundColor)
            .toBe(palette.base);
    });

    it("announces everything the row draws, not just the recipe name", async () => {
        // `Pressable` with an explicit label replaces the whole subtree for a
        // screen reader. With the name alone every brew of the same recipe is
        // announced identically, and the chips that say a brew did not run to
        // plan -- the one thing that decides whether it is worth opening --
        // are silent.
        const {getByLabelText} = await renderWithProviders(
            <BrewHistoryRow brew={brew({outcome: "cancelled", hasStream: false})}
                            onPress={jest.fn()} />
        );
        const label = "Ethiopia Guji, 2026-09-03, 244 grams, 4:00, stopped, no trace kept";
        expect(getByLabelText(label)).toBeTruthy();
    });

    it("says ended early rather than stopped for a brew the machine finished short", async () => {
        const {getByLabelText, queryByLabelText} = await renderWithProviders(
            <BrewHistoryRow brew={brew({outcome: "endedOnMachine"})} onPress={jest.fn()} />
        );
        expect(getByLabelText(/ended early/)).toBeTruthy();
        expect(queryByLabelText(/stopped/)).toBeNull();
    });

    it("shows the local date, not the UTC date", async () => {
        // The fixture timestamp is 2026-09-04T03:00:00Z — Sep 4 in UTC.
        // We mock the local accessors to return Sep 3 values so the test is
        // non-vacuous: if the code calls getUTCDate() instead it bypasses the
        // spy and uses the real UTC value (4), producing "2026-09-04" instead.
        const startedAt = Date.UTC(2026, 8, 4, 3, 0); // Sep 4 UTC
        const spyYear  = jest.spyOn(Date.prototype, "getFullYear").mockReturnValue(2026);
        const spyMonth = jest.spyOn(Date.prototype, "getMonth").mockReturnValue(8); // Sep
        const spyDay   = jest.spyOn(Date.prototype, "getDate").mockReturnValue(3);  // local day

        const {getByText} = await renderWithProviders(
            <BrewHistoryRow brew={brew({startedAt})} onPress={jest.fn()} />
        );

        // getDate() (mocked) → 3 → "2026-09-03"; getUTCDate() (real) → 4 → "2026-09-04"
        expect(getByText("2026-09-03")).toBeTruthy();

        spyYear.mockRestore();
        spyMonth.mockRestore();
        spyDay.mockRestore();
    });

    it("marks a brew that did not finish", async () => {
        const {getByText} = await renderWithProviders(
            <BrewHistoryRow brew={brew({outcome: "failed", failure: "noWater"})}
                            onPress={jest.fn()} />
        );
        // DotMatrixText compiles colour into `style` — there is no `color` prop
        // on the host node (see RecipeOverflowSheet.test.tsx's identical note).
        expect(getByText("STOPPED").props.style).toEqual(
            expect.arrayContaining([expect.objectContaining({color: palette.danger})])
        );
    });

    it("marks a brew where contact was lost as stopped (task 3: lostContact)", async () => {
        // lostContact previously fell through to the same rendering as "done"
        // because the stopped flag only checked for "failed" and "cancelled".
        const {getByText} = await renderWithProviders(
            <BrewHistoryRow brew={brew({outcome: "lostContact", failure: null})}
                            onPress={jest.fn()} />
        );
        expect(getByText("STOPPED").props.style).toEqual(
            expect.arrayContaining([expect.objectContaining({color: palette.danger})])
        );
    });

    it("draws in the accent the recipe had at the time", async () => {
        const {getByTestId} = await renderWithProviders(
            <BrewHistoryRow brew={brew({accent: "#4A7BC8"})} onPress={jest.fn()} />
        );
        expect(getByTestId("history-row-mark").props.style.backgroundColor)
            .toBe("#4A7BC8");
    });

    it("says a stream has expired rather than hiding it", async () => {
        const {getByText} = await renderWithProviders(
            <BrewHistoryRow brew={brew({hasStream: false})} onPress={jest.fn()} />
        );
        expect(getByText("NO TRACE KEPT")).toBeTruthy();
    });

    it("does not call a brew the machine ended a failure", async () => {
        const {queryByText, getByText} = await renderWithProviders(
            <BrewHistoryRow brew={brew({outcome: "endedOnMachine", failure: null})}
                            onPress={jest.fn()} />
        );

        expect(queryByText("STOPPED")).toBeNull();
        expect(getByText("ENDED EARLY")).toBeTruthy();
    });

    it("draws no stars on a brew nobody judged", async () => {
        // Five hollow stars is how a bad brew would have to be drawn. An
        // unjudged one must not wear it.
        const {queryByTestId} = await renderWithProviders(
            <BrewHistoryRow brew={brew()} onPress={jest.fn()} />
        );
        expect(queryByTestId("history-row-stars")).toBeNull();
    });

    it("draws the rating a brew has", async () => {
        const {getByTestId} = await renderWithProviders(
            <BrewHistoryRow brew={brew({rating: 4})} onPress={jest.fn()} />
        );
        expect(getByTestId("history-row-stars")).toBeTruthy();
    });

    it("reads the rating out with the rest of the row", async () => {
        const {getByLabelText} = await renderWithProviders(
            <BrewHistoryRow brew={brew({rating: 4})} onPress={jest.fn()} />
        );
        expect(getByLabelText(/4 stars/)).toBeTruthy();
    });

    it("says why an old brew still has a trace", async () => {
        const {getByTestId} = await renderWithProviders(
            <BrewHistoryRow brew={brew({pinned: true})} onPress={jest.fn()} />
        );
        expect(getByTestId("history-row-pin")).toBeTruthy();
    });

    it("says nothing about the sweep on a brew that is subject to it", async () => {
        const {queryByTestId} = await renderWithProviders(
            <BrewHistoryRow brew={brew()} onPress={jest.fn()} />
        );
        expect(queryByTestId("history-row-pin")).toBeNull();
    });

    it("marks an early end in the neutral colour, not the danger one", async () => {
        const {getByText} = await renderWithProviders(
            <BrewHistoryRow brew={brew({outcome: "endedOnMachine", failure: null})}
                            onPress={jest.fn()} />
        );

        expect(StyleSheet.flatten(getByText("ENDED EARLY").props.style).color)
            .toBe("#F0C24A");
    });

    // A brew somebody logged by hand has no water, no cup and no clock. Drawing
    // the zeros says the machine measured nought, which is a different and much
    // worse claim than "the app did not see this one".
    describe("a brew the app did not watch", () => {
        function unwatched() {
            return brew({
                watched: false, pours: 0, waterTotal: 0, cupTotal: 0,
                heldSeconds: 0, endedAt: Date.UTC(2026, 8, 3, 7, 42), rating: 4
            });
        }

        it("says so instead of drawing noughts", async () => {
            await renderWithProviders(
                <BrewHistoryRow brew={unwatched()} onPress={jest.fn()}/>
            );

            expect(screen.getByText("NOT WATCHED")).toBeTruthy();
            expect(screen.queryByText(/0 G/)).toBeNull();
            expect(screen.queryByText("0:00")).toBeNull();
        });

        it("says so to a screen reader too", async () => {
            await renderWithProviders(
                <BrewHistoryRow brew={unwatched()} onPress={jest.fn()}/>
            );

            const label = screen.getByRole("button").props.accessibilityLabel;
            expect(label).toContain("not watched");
            expect(label).not.toContain("0 grams");
            // The rating is the whole point of the record, so it still speaks.
            expect(label).toContain("4");
        });

        // The date is the one machine independent fact a hand-logged brew has,
        // and a history sorted by time with no dates on some rows is unreadable.
        it("keeps the date", async () => {
            await renderWithProviders(
                <BrewHistoryRow brew={unwatched()} onPress={jest.fn()}/>
            );

            expect(screen.getByText(/2026|SEP|3/i)).toBeTruthy();
        });

        it("still draws the figures for a brew the app did watch", async () => {
            await renderWithProviders(
                <BrewHistoryRow brew={brew()} onPress={jest.fn()}/>
            );

            expect(screen.queryByText("NOT WATCHED")).toBeNull();
            expect(screen.getByText(/244 G/)).toBeTruthy();
        });
    });
});

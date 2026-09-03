// components/__tests__/BrewHistoryRow.test.tsx
import React from "react";

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
});

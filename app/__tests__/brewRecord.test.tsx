// app/__tests__/brewRecord.test.tsx
import React from "react";

import BrewRecord from "@/app/brewRecord";
import {renderWithProviders} from "@/test-utils/render";
import type {StoredBrew} from "@/library/BrewDatabase";
import type {BrewSample} from "@/library/brew/BrewRecord";

const mockPush = jest.fn();

type OpenResult = {record: StoredBrew; samples: BrewSample[]} | null;
let mockOpened: OpenResult = null;

jest.mock("expo-router", () => ({
    router: {push: (...args: unknown[]) => mockPush(...args), back: jest.fn()},
    useLocalSearchParams: () => ({id: "brew-1"}),
    useNavigation: () => ({setOptions: jest.fn()})
}));

jest.mock("@/hooks/useBrewHistory", () => ({
    useBrewHistory: () => ({brews: [], remove: jest.fn(), open: () => mockOpened}),
    sharedBrewDatabase: () => ({})
}));

const record: StoredBrew = {
    id: "brew-1", recipeUuid: "uuid-1", recipeName: "Ethiopia Guji",
    accent: "#C86A3B", startedAt: 0, endedAt: 228_000, outcome: "done",
    failure: null, pours: 2, waterTotal: 250, cupTotal: 244, heldSeconds: 14,
    hasStream: true
};

describe("brew record", () => {
    beforeEach(() => {
        mockPush.mockReset();
        mockOpened = {
            record,
            samples: [{at: 0, water: 0, cup: 0, pour: 1},
                      {at: 228_000, water: 250, cup: 244, pour: 2}]
        };
    });

    it("draws the trace and the figures", async () => {
        const {getByLabelText, getByText} = await renderWithProviders(<BrewRecord />);
        expect(getByLabelText("Brew trace")).toBeTruthy();
        expect(getByText("244")).toBeTruthy();
    });

    it("names the time it held", async () => {
        const {getByText} = await renderWithProviders(<BrewRecord />);
        expect(getByText(/\+14 S/)).toBeTruthy();
    });

    it("offers All brews from a brew", async () => {
        const {getByLabelText} = await renderWithProviders(<BrewRecord />);
        expect(getByLabelText("All brews")).toBeTruthy();
    });

    it("says the trace has expired rather than drawing an empty chart", async () => {
        mockOpened = {record: {...record, hasStream: false}, samples: []};
        const {getByText, queryByLabelText} = await renderWithProviders(<BrewRecord />);
        expect(getByText(/no trace was kept/i)).toBeTruthy();
        expect(queryByLabelText("Brew trace")).toBeNull();
    });

    it("says so when the record is gone", async () => {
        mockOpened = null;
        const {getByText} = await renderWithProviders(<BrewRecord />);
        expect(getByText(/that brew is no longer here/i)).toBeTruthy();
    });
});

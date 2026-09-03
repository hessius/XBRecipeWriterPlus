// app/__tests__/brewHistory.test.tsx
import React from "react";

import BrewHistory from "@/app/brewHistory";
import {renderWithProviders} from "@/test-utils/render";
import type {StoredBrew} from "@/library/BrewDatabase";

const mockPush = jest.fn();
let mockFilter: string | undefined = undefined;
let mockBrews: StoredBrew[] = [];

jest.mock("expo-router", () => ({
    router: {push: (...args: unknown[]) => mockPush(...args), back: jest.fn()},
    useLocalSearchParams: () => ({recipeUuid: mockFilter}),
    useNavigation: () => ({setOptions: jest.fn()})
}));

jest.mock("@/hooks/useBrewHistory", () => ({
    useBrewHistory: () => ({brews: mockBrews, remove: jest.fn(), open: jest.fn()}),
    sharedBrewDatabase: () => ({})
}));

function makeBrews(): StoredBrew[] {
    return [
        {id: "a", recipeUuid: "uuid-1", recipeName: "Ethiopia Guji",
         accent: "#C86A3B", startedAt: 2, endedAt: 3, outcome: "done",
         failure: null, pours: 5, waterTotal: 250, cupTotal: 244,
         heldSeconds: 0, hasStream: true},
        {id: "b", recipeUuid: "uuid-2", recipeName: "Kenya Nyeri",
         accent: "#4A7BC8", startedAt: 1, endedAt: 2, outcome: "done",
         failure: null, pours: 3, waterTotal: 200, cupTotal: 195,
         heldSeconds: 0, hasStream: false}
    ];
}

describe("brew history", () => {
    beforeEach(() => {
        mockFilter = undefined;
        mockBrews = makeBrews();
        mockPush.mockReset();
    });

    it("lists every brew when nothing is filtered", async () => {
        const {getByText} = await renderWithProviders(<BrewHistory />);
        expect(getByText("Ethiopia Guji")).toBeTruthy();
        expect(getByText("Kenya Nyeri")).toBeTruthy();
    });

    it("shows one recipe's brews when reached from that recipe", async () => {
        mockFilter = "uuid-2";
        const {getByText, queryByText} = await renderWithProviders(<BrewHistory />);
        expect(getByText("Kenya Nyeri")).toBeTruthy();
        expect(queryByText("Ethiopia Guji")).toBeNull();
    });

    it("says so when there is nothing yet", async () => {
        mockBrews = [];
        const {getByText} = await renderWithProviders(<BrewHistory />);
        expect(getByText(/no brews yet/i)).toBeTruthy();
    });
});

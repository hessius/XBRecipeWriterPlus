import React from "react";

import BrewRecord, {type RecipeLookup} from "@/app/brewRecord";
import {renderWithProviders} from "@/test-utils/render";
import type {StoredBrew} from "@/library/BrewDatabase";
import type {BrewSample} from "@/library/brew/BrewRecord";
import type Recipe from "@/library/Recipe";
import {screen} from "@testing-library/react-native";

const mockPush = jest.fn();
const mockSetOptions = jest.fn();

type OpenResult =
    {record: StoredBrew; samples: BrewSample[]; frames?: string} | null;

const record: StoredBrew = {
    id: "brew-1", recipeUuid: "uuid-1", recipeName: "Ethiopia Guji",
    accent: "#C86A3B", startedAt: 0, endedAt: 228_000, outcome: "done",
    failure: null, pours: 2, waterTotal: 250, cupTotal: 244, heldSeconds: 14,
    hasStream: true
};

let mockOpened: OpenResult = {
    record,
    samples: [{at: 0, water: 0, cup: 0, pour: 1}]
};

jest.mock("expo-router", () => ({
    router: {push: (...args: unknown[]) => mockPush(...args), back: jest.fn()},
    useLocalSearchParams: () => ({id: "brew-1"}),
    useNavigation: () => ({setOptions: (...args: unknown[]) => mockSetOptions(...args)})
}));

jest.mock("@/hooks/useSetting", () => ({
    useSetting: () => [false, jest.fn()],
    sharedSettings: () => ({})
}));

jest.mock("@/hooks/useBrewHistory", () => ({
    useBrewHistory: () => ({
        brews: [],
        remove: jest.fn(),
        open: () => mockOpened
    }),
    sharedBrewDatabase: () => ({})
}));

describe("brew record handoff gate", () => {
    beforeEach(() => {
        mockOpened = {
            record,
            samples: [{at: 0, water: 0, cup: 0, pour: 1}]
        };
    });

    it("does not offer Beanconqueror handoff while the real gate is off", async () => {
        // This lives outside brewRecord.test.tsx because that file mocks the
        // gate on to exercise the hidden action. This assertion must import
        // the real module-level constant exactly as the shipping app does.
        const mockLookup: RecipeLookup = {
            getRecipe: jest.fn(() => ({pours: []}) as unknown as Recipe)
        };

        await renderWithProviders(<BrewRecord recipeLookup={mockLookup} />);

        expect(screen.queryByLabelText("Send to Beanconqueror")).toBeNull();
    });
});

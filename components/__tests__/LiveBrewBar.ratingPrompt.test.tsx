import {act, screen, waitFor} from "@testing-library/react-native";
import React from "react";

import LiveBrewBar from "@/components/LiveBrewBar";
import {accents} from "@/constants/colors";
import type {RatingPromptStore} from "@/hooks/useRatingPrompt";
import type {StoredBrew} from "@/library/BrewDatabase";
import {renderWithProviders} from "@/test-utils/render";

const NOW = 1_700_000_000_000;
let mockPathname = "/";
let mockStore: RatingPromptStore & {next: StoredBrew | null};

const BREW: StoredBrew = {
    id: "b1",
    recipeUuid: "r1",
    recipeName: "Morning Bloem",
    accent: accents.coffee[1],
    startedAt: NOW - 20 * 60 * 1000,
    pouringAt: NOW - 19 * 60 * 1000,
    endedAt: NOW - 10 * 60 * 1000,
    outcome: "done",
    failure: null,
    pours: 2,
    waterTotal: 260,
    cupTotal: 244,
    heldSeconds: 0,
    rating: 0,
    note: "",
    pinned: false,
    hasStream: false,
    plan: []
};

jest.mock("expo-router", () => ({
    usePathname: () => mockPathname,
    router:      {push: jest.fn(), back: jest.fn(), replace: jest.fn()},
    useRouter:   () => ({push: jest.fn(), back: jest.fn(), replace: jest.fn()})
}));

jest.mock("@/hooks/useLiveBrew", () => ({
    useLiveBrew: () => ({run: null, dismiss: jest.fn()})
}));

jest.mock("@/hooks/useBrewHistory", () => ({
    sharedBrewDatabase: () => mockStore
}));

jest.mock("@/hooks/useSetting", () => ({
    useSetting: (key: string) => {
        const React = jest.requireActual<typeof import("react")>("react");
        return React.useState(key === "askForRatings" ? true : null);
    }
}));

describe("LiveBrewBar rating prompt refresh", () => {
    beforeEach(() => {
        jest.spyOn(Date, "now").mockReturnValue(NOW);
        mockPathname = "/brewRecord";
        mockStore = {
            next: BREW,
            lastMeasuredBrew: jest.fn(() => mockStore.next),
            judge: jest.fn()
        };
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("clears a prompt for a brew rated on the record screen once that screen is left", async () => {
        const view = await renderWithProviders(<LiveBrewBar />);
        expect(screen.queryByTestId("rating-bar")).toBeNull();
        expect(mockStore.lastMeasuredBrew).toHaveBeenCalledTimes(1);

        mockStore.next = {...BREW, rating: 4, pinned: true};
        mockPathname = "/";
        await act(async () => {
            view.rerender(<LiveBrewBar />);
        });

        await waitFor(() => expect(screen.queryByTestId("rating-bar")).toBeNull());
        expect(mockStore.lastMeasuredBrew).toHaveBeenCalledTimes(2);
    });
});

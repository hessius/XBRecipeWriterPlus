import {act, fireEvent, screen, waitFor} from "@testing-library/react-native";
import React from "react";

import LiveBrewBar from "@/components/LiveBrewBar";
import {accents} from "@/constants/colors";
import type {RatingPromptStore} from "@/hooks/useRatingPrompt";
import type {StoredBrew} from "@/library/BrewDatabase";
import {renderWithProviders} from "@/test-utils/render";

const NOW = 1_700_000_000_000;
let mockPathname = "/";
let mockStore: RatingPromptStore & {next: StoredBrew | null};
const mockSetRatingNoteOpen = jest.fn();

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
    useLiveBrew: () => ({run: null, dismiss: jest.fn(), setRatingNoteOpen: mockSetRatingNoteOpen})
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
        mockSetRatingNoteOpen.mockClear();
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

    it("does not raise a prompt for a brew that appears while leaving the brew screen", async () => {
        mockPathname = "/brew";
        mockStore.next = null;
        const view = await renderWithProviders(<LiveBrewBar />);
        expect(screen.queryByTestId("rating-bar")).toBeNull();
        expect(mockStore.lastMeasuredBrew).toHaveBeenCalledTimes(1);

        mockStore.next = BREW;
        mockPathname = "/";
        await act(async () => {
            view.rerender(<LiveBrewBar />);
        });

        await waitFor(() => expect(screen.queryByTestId("rating-bar")).toBeNull());
        expect(mockStore.lastMeasuredBrew).toHaveBeenCalledTimes(2);
    });

    it("saves a note from the sheet after the rating removes the prompt", async () => {
        mockPathname = "/";
        await renderWithProviders(<LiveBrewBar />);

        await fireEvent.press(screen.getByLabelText("Rate 4 stars"));
        await waitFor(() => expect(screen.queryByTestId("rating-bar")).toBeNull());

        const field = await screen.findByTestId("judgement-note");
        await fireEvent(field, "endEditing", {nativeEvent: {text: "Sweet and round."}});

        expect(mockStore.judge).toHaveBeenCalledWith("b1", {rating: 4});
        expect(mockStore.judge).toHaveBeenCalledWith("b1", {note: "Sweet and round."});
    });

    it("does not redraw the sheet when a rating write is refused", async () => {
        mockPathname = "/";
        await renderWithProviders(<LiveBrewBar />);

        await fireEvent.press(screen.getByLabelText("Rate 4 stars"));
        await waitFor(() => expect(screen.queryByTestId("rating-bar")).toBeNull());

        (mockStore.judge as jest.Mock).mockClear();
        const litStar = await screen.findByLabelText("Rate 4 stars");
        await fireEvent.press(litStar);

        expect(mockStore.judge).toHaveBeenCalledWith("b1", {rating: 4});
        expect(screen.queryByLabelText("Clear the rating, currently 4 stars")).toBeNull();
    });

    it("saves typed note text when DONE is pressed without an end-editing event", async () => {
        mockPathname = "/";
        await renderWithProviders(<LiveBrewBar />);

        await fireEvent.press(screen.getByLabelText("Rate 4 stars"));
        await waitFor(() => expect(screen.queryByTestId("rating-bar")).toBeNull());
        expect(mockSetRatingNoteOpen).toHaveBeenCalledWith(true);

        const field = await screen.findByTestId("judgement-note");
        await fireEvent.changeText(field, "Sweet and round.");
        await waitFor(async () => {
            await fireEvent.press(screen.getByTestId("brew-note-done"));
            expect(mockStore.judge).toHaveBeenCalledWith("b1", {
                note: "Sweet and round."
            });
        });
        expect(mockSetRatingNoteOpen).toHaveBeenCalledWith(false);
    });
});

import {fireEvent, screen} from "@testing-library/react-native";
import React from "react";

import LiveBrewBar from "@/components/LiveBrewBar";
import {accents} from "@/constants/colors";
import {OVERFLOW_PAUSED_HEADLINE} from "@/constants/brewCopy";
import {plannedSeconds, traceAxisFor} from "@/library/brew/brewShape";
import Pour from "@/library/Pour";
import Recipe from "@/library/Recipe";
import {renderWithProviders} from "@/test-utils/render";

let mockPathname = "/";
const mockPush = jest.fn();
let mockRun: object | null = null;
const mockPrompt = {
    brew: null as unknown,
    rate: jest.fn(),
    annotate: jest.fn(),
    dismiss: jest.fn(),
    refresh: jest.fn()
};

const BREW = {
    id: "b1",
    recipeUuid: "r1",
    recipeName: "Morning Bloem",
    accent: accents.coffee[1],
    startedAt: 0,
    pouringAt: 1_000,
    endedAt: 873_000,
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

// `router` as well as `useRouter`, because the bar's router now comes from
// `steadyRouter`, which wraps both so that whichever door a screen came
// through shares one answer to "what did we just do".
jest.mock("expo-router", () => ({
    usePathname: () => mockPathname,
    router:      {push: mockPush, back: jest.fn(), replace: jest.fn()},
    useRouter:   () => ({push: mockPush, back: jest.fn(), replace: jest.fn()})
}));

jest.mock("@/hooks/useLiveBrew", () => ({
    useLiveBrew: () => ({run: mockRun, dismiss: jest.fn(), setRatingNoteOpen: jest.fn()})
}));

jest.mock("@/hooks/useRatingPrompt", () => ({
    useRatingPrompt: () => mockPrompt,
    __esModule: true,
    default: () => mockPrompt
}));

function recipe(): Recipe {
    const r = new Recipe();
    r.name = "Ethiopia Guji";
    r.dosage = 18;
    r.pours = [new Pour(1, 40, 93, 40, 0, 0, 20)];
    return r;
}

beforeEach(() => {
    mockPathname = "/";
    mockPush.mockClear();
    mockPrompt.brew = null;
    mockPrompt.rate.mockReset();
    mockPrompt.rate.mockReturnValue(true);
    mockPrompt.annotate.mockClear();
    mockPrompt.dismiss.mockClear();
    mockPrompt.refresh.mockClear();
    mockRun = {
        recipe: recipe(),
        samples: [],
        elapsed: 12,
        phase: {name: "pouring", pour: 1, pours: 1},
        holding: false,
        heldSeconds: 0
    };
});

describe("LiveBrewBar", () => {
    it("carries an open automatic pause and the full live axis into its real compact trace", async () => {
        const r = recipe();
        const samples = [
            {at: 0, water: 10, cup: 0, pour: 1},
            {at: 1000, water: 20, cup: 4, pour: 1}
        ];
        const pauseIntervals = [{from: 1700, to: 90_000, pour: 1, reason: "overflow" as const}];
        const bypass = {volume: 20, temperature: 90, delivered: 0,
            startedAt: null, state: "pending" as const};
        mockRun = {
            recipe: r, samples, elapsed: 90, holding: false, heldSeconds: 0,
            phase: {name: "paused", pour: 1, pours: 1, pauseKind: "overflow",
                was: {name: "pouring", pour: 1, pours: 1}},
            pauseIntervals, bypass
        };
        const {getByTestId, getByText, queryByText} = await renderWithProviders(<LiveBrewBar />);
        const band = getByTestId("trace-pause-overflow-0");
        const axis = traceAxisFor(r.pours, samples, plannedSeconds(r.pours), bypass, pauseIntervals);
        expect(Number(band.props.x)).toBeCloseTo(1.7 / axis.maxT * 86);
        expect(Number(band.props.width)).toBeCloseTo(88.3 / axis.maxT * 86);
        expect(Number(band.props.height)).toBe(34);
        expect(getByText(OVERFLOW_PAUSED_HEADLINE)).toBeTruthy();
        expect(queryByText("Grinding")).toBeNull();
    });

    it("shows the running brew on any other screen", async () => {
        const {getByText} = await renderWithProviders(<LiveBrewBar />);
        expect(getByText(/ETHIOPIA GUJI/i)).toBeTruthy();
    });

    it("hides itself on the brew screen, which is the same brew at full size", async () => {
        mockPathname = "/brew";
        const {queryByText} = await renderWithProviders(<LiveBrewBar />);
        expect(queryByText(/ETHIOPIA GUJI/i)).toBeNull();
    });

    it("hides on the export screen, which the modal would otherwise cover", async () => {
        mockPathname = "/brewRecord";
        const {queryByText} = await renderWithProviders(<LiveBrewBar />);
        expect(queryByText(/ETHIOPIA GUJI/i)).toBeNull();
    });

    it("hides on the history screen, for the same reason", async () => {
        mockPathname = "/brewHistory";
        const {queryByText} = await renderWithProviders(<LiveBrewBar />);
        expect(queryByText(/ETHIOPIA GUJI/i)).toBeNull();
    });

    it("shows nothing when there is no run", async () => {
        mockRun = null;
        const {queryByText} = await renderWithProviders(<LiveBrewBar />);
        expect(queryByText(/ETHIOPIA GUJI/i)).toBeNull();
        expect(screen.queryByTestId("mini-bar")).toBeNull();
        expect(screen.queryByTestId("rating-bar")).toBeNull();
    });

    it("asks how the last brew was when nothing is running", async () => {
        mockRun = null;
        mockPrompt.brew = BREW;
        await renderWithProviders(<LiveBrewBar />);
        expect(screen.getByTestId("rating-bar")).toBeTruthy();
    });

    it("says nothing about an old brew on the brew screens", async () => {
        mockRun = null;
        mockPrompt.brew = BREW;
        mockPathname = "/brewHistory";
        await renderWithProviders(<LiveBrewBar />);
        expect(screen.queryByTestId("rating-bar")).toBeNull();
    });

    it("lets a live run beat a pending question", async () => {
        mockPrompt.brew = BREW;
        await renderWithProviders(<LiveBrewBar />);
        expect(screen.getByTestId("mini-bar")).toBeTruthy();
        expect(screen.queryByTestId("rating-bar")).toBeNull();
    });

    it("keeps the note sheet up after the rating that opened it", async () => {
        mockRun = null;
        mockPrompt.brew = BREW;
        await renderWithProviders(<LiveBrewBar />);
        await fireEvent.press(screen.getByLabelText("Rate 4 stars"));
        expect(await screen.findByTestId("brew-note-done")).toBeTruthy();
    });

    it("does not open the note sheet when a rating write is refused", async () => {
        mockRun = null;
        mockPrompt.brew = BREW;
        mockPrompt.rate.mockReturnValue(false);
        await renderWithProviders(<LiveBrewBar />);

        await fireEvent.press(screen.getByLabelText("Rate 4 stars"));

        expect(screen.queryByTestId("brew-note-done")).toBeNull();
    });

    it("opens the brew once when the bar is tapped twice", async () => {
        // The bar is mounted beside the navigator, so it is on screen almost
        // everywhere and is exactly the sort of thing a finger catches twice.
        // It was the one router caller the guard had missed.
        await renderWithProviders(<LiveBrewBar />);

        const open = screen.getByLabelText("Open the brew");
        await fireEvent.press(open);
        await fireEvent.press(open);

        expect(mockPush).toHaveBeenCalledTimes(1);
        expect(mockPush).toHaveBeenCalledWith("/brew?view=1");
    });
});

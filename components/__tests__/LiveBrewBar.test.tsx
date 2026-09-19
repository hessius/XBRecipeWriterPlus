import {fireEvent, screen} from "@testing-library/react-native";
import React from "react";

import LiveBrewBar from "@/components/LiveBrewBar";
import Pour from "@/library/Pour";
import Recipe from "@/library/Recipe";
import {renderWithProviders} from "@/test-utils/render";

let mockPathname = "/";
const mockPush = jest.fn();
let mockRun: object | null = null;

// `router` as well as `useRouter`, because the bar's router now comes from
// `steadyRouter`, which wraps both so that whichever door a screen came
// through shares one answer to "what did we just do".
jest.mock("expo-router", () => ({
    usePathname: () => mockPathname,
    router:      {push: mockPush, back: jest.fn(), replace: jest.fn()},
    useRouter:   () => ({push: mockPush, back: jest.fn(), replace: jest.fn()})
}));

jest.mock("@/hooks/useLiveBrew", () => ({
    useLiveBrew: () => ({run: mockRun, dismiss: jest.fn()})
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

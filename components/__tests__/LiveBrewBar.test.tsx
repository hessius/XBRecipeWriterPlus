import React from "react";

import LiveBrewBar from "@/components/LiveBrewBar";
import Pour from "@/library/Pour";
import Recipe from "@/library/Recipe";
import {renderWithProviders} from "@/test-utils/render";

let mockPathname = "/";
const mockPush = jest.fn();
let mockRun: object | null = null;

jest.mock("expo-router", () => ({
    usePathname: () => mockPathname,
    useRouter: () => ({push: mockPush})
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

    it("shows nothing when there is no run", async () => {
        mockRun = null;
        const {queryByText} = await renderWithProviders(<LiveBrewBar />);
        expect(queryByText(/ETHIOPIA GUJI/i)).toBeNull();
    });
});

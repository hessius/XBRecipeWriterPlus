import React from "react";
import {screen, fireEvent} from "@testing-library/react-native";

import LivingMark from "@/components/LivingMark";
import {renderWithProviders} from "@/test-utils/render";

jest.mock("@/constants/motion", () => ({
    ...jest.requireActual("@/constants/motion"),
    useReducedMotion: jest.fn(() => false)
}));

import {useReducedMotion} from "@/constants/motion";
const mockReducedMotion = useReducedMotion as jest.Mock;

describe("LivingMark", () => {
    beforeEach(() => mockReducedMotion.mockReturnValue(false));

    it("draws the mark as dots", async () => {
        await renderWithProviders(<LivingMark size={120}/>);
        // Two plus glyphs, each a 9x9 grid of lit cells.
        expect(screen.getAllByTestId("living-mark-dot").length).toBeGreaterThan(1);
    });

    it("names itself for a screen reader, which cannot see dots", async () => {
        await renderWithProviders(<LivingMark size={120}/>);
        expect(screen.getByLabelText("XBRW++")).toBeTruthy();
    });

    it("still draws the mark under Reduce Motion", async () => {
        // The requirement is that it renders static, not that it disappears.
        mockReducedMotion.mockReturnValue(true);
        await renderWithProviders(<LivingMark size={120}/>);
        expect(screen.getAllByTestId("living-mark-dot").length).toBeGreaterThan(1);
        expect(screen.getByLabelText("XBRW++")).toBeTruthy();
    });

    it("survives a tap", async () => {
        // The scatter is a Reanimated shared value, which a unit test cannot
        // observe. What it can prove is that the gesture is wired and does not
        // throw, which is the failure that would take the screen down.
        await renderWithProviders(<LivingMark size={120}/>);
        await fireEvent.press(screen.getByLabelText("XBRW++"));
        expect(screen.getAllByTestId("living-mark-dot").length).toBeGreaterThan(1);
    });
});

import React from "react";
import {act, screen} from "@testing-library/react-native";

import AboutTicker from "@/components/AboutTicker";
import {renderWithProviders} from "@/test-utils/render";

jest.mock("@/constants/motion", () => ({
    ...jest.requireActual("@/constants/motion"),
    useReducedMotion: jest.fn(() => false)
}));

import {useReducedMotion} from "@/constants/motion";
const mockReducedMotion = useReducedMotion as jest.Mock;

describe("AboutTicker", () => {
    beforeEach(() => {
        jest.useFakeTimers();
        mockReducedMotion.mockReturnValue(false);
    });
    afterEach(() => jest.useRealTimers());

    it("says nothing at first", async () => {
        await renderWithProviders(<AboutTicker lines={["FIRST", "SECOND"]}/>);
        expect(screen.queryByTestId("about-ticker")).toBeNull();
    });

    it("is still silent just before its delay", async () => {
        await renderWithProviders(<AboutTicker lines={["FIRST"]} delayMs={8000}/>);
        await act(async () => {
            jest.advanceTimersByTime(7900);
        });
        expect(screen.queryByTestId("about-ticker")).toBeNull();
    });

    it("starts once the screen has been left alone", async () => {
        await renderWithProviders(<AboutTicker lines={["FIRST"]} delayMs={8000}/>);
        await act(async () => {
            jest.advanceTimersByTime(8100);
        });
        expect(screen.getByTestId("about-ticker")).toBeTruthy();
    });

    it("never starts under Reduce Motion", async () => {
        // Not "starts and then holds still" — an attract mode is motion, and a
        // user who asked for less of it did not ask for a slower version.
        mockReducedMotion.mockReturnValue(true);
        await renderWithProviders(<AboutTicker lines={["FIRST"]} delayMs={8000}/>);
        await act(async () => {
            jest.advanceTimersByTime(60000);
        });
        expect(screen.queryByTestId("about-ticker")).toBeNull();
    });

    it("says nothing when it has nothing to say", async () => {
        await renderWithProviders(<AboutTicker lines={[]} delayMs={8000}/>);
        await act(async () => {
            jest.advanceTimersByTime(9000);
        });
        expect(screen.queryByTestId("about-ticker")).toBeNull();
    });
});

import React from "react";
import {act, screen} from "@testing-library/react-native";

import AboutTicker from "@/components/AboutTicker";
import {useReducedMotion} from "@/constants/motion";
import {renderWithProviders} from "@/test-utils/render";

jest.mock("@/constants/motion", () => ({
    ...jest.requireActual("@/constants/motion"),
    useReducedMotion: jest.fn(() => false)
}));

const mockReducedMotion = jest.mocked(useReducedMotion);

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

    it("rotates through its lines once started", async () => {
        // The earlier tests only proved presence and absence; deleting the
        // whole rotation effect would still pass them. This is the one that
        // requires the interval to actually fire and advance the index.
        await renderWithProviders(
            <AboutTicker lines={["FIRST", "SECOND", "THIRD"]} delayMs={8000}/>
        );
        await act(async () => {
            jest.advanceTimersByTime(8100);
        });
        expect(screen.getByTestId("about-ticker")).toHaveTextContent("FIRST");

        await act(async () => {
            jest.advanceTimersByTime(4200);
        });
        expect(screen.getByTestId("about-ticker")).toHaveTextContent("SECOND");

        await act(async () => {
            jest.advanceTimersByTime(4200);
        });
        expect(screen.getByTestId("about-ticker")).toHaveTextContent("THIRD");

        await act(async () => {
            jest.advanceTimersByTime(4200);
        });
        expect(screen.getByTestId("about-ticker")).toHaveTextContent("FIRST");
    });

    it("clears its timers on unmount", async () => {
        // Direct proof that the interval this component created is the one
        // torn down, regardless of what other machinery in the tree also
        // schedules timers.
        const clearIntervalSpy = jest.spyOn(global, "clearInterval");
        const {unmount} = await renderWithProviders(
            <AboutTicker lines={["FIRST", "SECOND"]} delayMs={8000}/>
        );
        await act(async () => {
            jest.advanceTimersByTime(8100);
        });
        expect(screen.getByTestId("about-ticker")).toHaveTextContent("FIRST");

        await act(async () => {
            unmount();
        });

        expect(clearIntervalSpy).toHaveBeenCalled();
        clearIntervalSpy.mockRestore();
    });
});

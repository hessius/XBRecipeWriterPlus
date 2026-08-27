import React from "react";
import {act, fireEvent, screen} from "@testing-library/react-native";

import AboutTicker from "@/components/AboutTicker";
import {useReducedMotion} from "@/constants/motion";
import {renderWithProviders} from "@/test-utils/render";

jest.mock("@/constants/motion", () => ({
    ...jest.requireActual("@/constants/motion"),
    useReducedMotion: jest.fn(() => false)
}));

const mockReducedMotion = jest.mocked(useReducedMotion);

/** The height of the band, read off the rendered style rather than assumed. */
function bandHeight(): number {
    const style = [screen.getByTestId("about-ticker-band").props.style].flat(Infinity);
    return Object.assign({}, ...style).height;
}

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

    it("reserves its full height from the very first frame", async () => {
        // The ticker arrives eight seconds in. If the band sizes itself on
        // arrival, the whole page below it jumps at the one moment the reader
        // has stopped expecting the page to move.
        await renderWithProviders(<AboutTicker lines={["FIRST"]} delayMs={8000}/>);
        const before = bandHeight();
        expect(before).toBeGreaterThan(0);

        await act(async () => {
            jest.advanceTimersByTime(8100);
        });
        expect(screen.getByTestId("about-ticker")).toBeTruthy();
        expect(bandHeight()).toBe(before);
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

    it("never starts under Reduce Motion, but still holds the space open", async () => {
        // Not "starts and then holds still" — an attract mode is motion, and a
        // user who asked for less of it did not ask for a slower version. The
        // band stays, so the page is laid out the same for everybody.
        mockReducedMotion.mockReturnValue(true);
        await renderWithProviders(<AboutTicker lines={["FIRST"]} delayMs={8000}/>);
        await act(async () => {
            jest.advanceTimersByTime(60000);
        });
        expect(screen.queryByTestId("about-ticker")).toBeNull();
        expect(bandHeight()).toBeGreaterThan(0);
    });

    it("says nothing when it has nothing to say", async () => {
        await renderWithProviders(<AboutTicker lines={[]} delayMs={8000}/>);
        await act(async () => {
            jest.advanceTimersByTime(9000);
        });
        expect(screen.queryByTestId("about-ticker")).toBeNull();
    });

    it("runs every line together into one stream, rather than blinking between them", async () => {
        // The distinction the user actually noticed on device: a scroller runs
        // the phrases past you, a slideshow swaps one for another in place. If
        // this ever again renders a single line at a time, this fails.
        await renderWithProviders(
            <AboutTicker lines={["FIRST", "SECOND", "THIRD"]} delayMs={8000}/>
        );
        await act(async () => {
            jest.advanceTimersByTime(8100);
        });
        const ticker = screen.getByTestId("about-ticker");
        expect(ticker).toHaveTextContent(/FIRST/);
        expect(ticker).toHaveTextContent(/SECOND/);
        expect(ticker).toHaveTextContent(/THIRD/);
    });

    it("draws the stream twice, so the loop has no gap in it", async () => {
        // A single run scrolls off the left and leaves an empty band until it
        // is rewound. The second copy is what makes the repeat invisible.
        await renderWithProviders(<AboutTicker lines={["FIRST"]} delayMs={8000}/>);
        await act(async () => {
            jest.advanceTimersByTime(8100);
        });
        expect(screen.getAllByTestId("about-ticker-run")).toHaveLength(2);
    });

    it("waits for a measured width before it scrolls anywhere", async () => {
        // Starting the animation against a width of zero gives a zero-duration
        // repeat, which spins the animation every frame forever.
        await renderWithProviders(<AboutTicker lines={["FIRST"]} delayMs={8000}/>);
        await act(async () => {
            jest.advanceTimersByTime(8100);
        });
        await act(async () => {
            fireEvent(screen.getAllByTestId("about-ticker-run")[0], "layout", {
                nativeEvent: {layout: {width: 0, height: 20, x: 0, y: 0}}
            });
            fireEvent(screen.getAllByTestId("about-ticker-run")[0], "layout", {
                nativeEvent: {layout: {width: 240, height: 20, x: 0, y: 0}}
            });
        });
        expect(screen.getByTestId("about-ticker")).toBeTruthy();
    });

    it("clears its timer on unmount", async () => {
        // Direct proof that the timeout this component created is the one torn
        // down, regardless of what other machinery in the tree also schedules.
        const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");
        const {unmount} = await renderWithProviders(
            <AboutTicker lines={["FIRST", "SECOND"]} delayMs={8000}/>
        );
        await act(async () => {
            unmount();
        });
        expect(clearTimeoutSpy).toHaveBeenCalled();
        clearTimeoutSpy.mockRestore();
    });
});

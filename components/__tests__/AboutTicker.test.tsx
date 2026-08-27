import React from "react";
import {act, fireEvent, screen} from "@testing-library/react-native";

import AboutTicker, {scrollPlan} from "@/components/AboutTicker";
import {useReducedMotion} from "@/constants/motion";
import {renderWithProviders} from "@/test-utils/render";

jest.mock("@/constants/motion", () => ({
    ...jest.requireActual("@/constants/motion"),
    useReducedMotion: jest.fn(() => false)
}));

const mockReducedMotion = jest.mocked(useReducedMotion);

/** The height of the band, read off the rendered style rather than assumed. */
function bandHeight(): number {
    const style = [screen.getByTestId("about-ticker-band", {includeHiddenElements: true}).props.style].flat(Infinity);
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
        expect(screen.queryByTestId("about-ticker", {includeHiddenElements: true})).toBeNull();
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
        expect(screen.getByTestId("about-ticker", {includeHiddenElements: true})).toBeTruthy();
        expect(bandHeight()).toBe(before);
    });

    it("is still silent just before its delay", async () => {
        await renderWithProviders(<AboutTicker lines={["FIRST"]} delayMs={8000}/>);
        await act(async () => {
            jest.advanceTimersByTime(7900);
        });
        expect(screen.queryByTestId("about-ticker", {includeHiddenElements: true})).toBeNull();
    });

    it("starts once the screen has been left alone", async () => {
        await renderWithProviders(<AboutTicker lines={["FIRST"]} delayMs={8000}/>);
        await act(async () => {
            jest.advanceTimersByTime(8100);
        });
        expect(screen.getByTestId("about-ticker", {includeHiddenElements: true})).toBeTruthy();
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
        expect(screen.queryByTestId("about-ticker", {includeHiddenElements: true})).toBeNull();
        expect(bandHeight()).toBeGreaterThan(0);
    });

    it("says nothing when it has nothing to say", async () => {
        await renderWithProviders(<AboutTicker lines={[]} delayMs={8000}/>);
        await act(async () => {
            jest.advanceTimersByTime(9000);
        });
        expect(screen.queryByTestId("about-ticker", {includeHiddenElements: true})).toBeNull();
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
        const ticker = screen.getByTestId("about-ticker", {includeHiddenElements: true});
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
        expect(screen.getAllByTestId("about-ticker-run", {includeHiddenElements: true})).toHaveLength(2);
    });

    it("refuses to scroll until something has actually been measured", () => {
        // A run measured at zero would give a zero-duration repeat: not a slow
        // scroll but an animation completing and restarting every single frame
        // for as long as the screen is open.
        expect(scrollPlan(0)).toBeNull();
        expect(scrollPlan(-40)).toBeNull();
    });

    it("travels exactly one copy's width, at a readable speed", () => {
        // Travelling anything other than one copy's width puts the next copy
        // somewhere other than where the first began, and the loop visibly
        // jumps once per cycle.
        const plan = scrollPlan(380);
        expect(plan).not.toBeNull();
        expect(plan?.distance).toBe(-380);
        expect(plan?.duration).toBeCloseTo(10000, -3);
    });

    it("draws enough copies to cover a band wider than the stream", async () => {
        // Two copies of a short line do not span the screen, and the band shows
        // bare space to the right of the last one for most of the cycle.
        await renderWithProviders(<AboutTicker lines={["HI"]} delayMs={8000}/>);
        await act(async () => {
            jest.advanceTimersByTime(8100);
        });
        await act(async () => {
            fireEvent(screen.getByTestId("about-ticker-band", {includeHiddenElements: true}), "layout", {
                nativeEvent: {layout: {width: 400, height: 21, x: 0, y: 0}}
            });
        });
        await act(async () => {
            fireEvent(screen.getAllByTestId("about-ticker-run", {includeHiddenElements: true})[0], "layout", {
                nativeEvent: {layout: {width: 50, height: 21, x: 0, y: 0}}
            });
        });
        expect(screen.getAllByTestId("about-ticker-run", {includeHiddenElements: true}).length).toBeGreaterThanOrEqual(9);
    });

    it("keeps the stream out of the accessibility tree", async () => {
        // It arrives eight seconds in. A reader partway through the screen
        // would find the tree had grown two copies of a decorative line.
        await renderWithProviders(<AboutTicker lines={["FIRST"]} delayMs={8000}/>);
        await act(async () => {
            jest.advanceTimersByTime(8100);
        });
        expect(screen.queryAllByTestId("about-ticker-run")).toHaveLength(0);
        expect(screen.getAllByTestId("about-ticker-run", {includeHiddenElements: true}).length)
            .toBeGreaterThan(0);
    });

    it("clears the timer it started, and not merely some timer", async () => {
        // Asserting that `clearTimeout` was called at all is satisfied by any
        // teardown anywhere in the provider tree. The id is what ties the call
        // to this component's own delay.
        const setTimeoutSpy = jest.spyOn(global, "setTimeout");
        const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");
        const {unmount} = await renderWithProviders(
            <AboutTicker lines={["FIRST", "SECOND"]} delayMs={8000}/>
        );
        const scheduled = setTimeoutSpy.mock.results.map((result) => result.value);
        expect(scheduled.length).toBeGreaterThan(0);

        await act(async () => {
            unmount();
        });

        const cleared = clearTimeoutSpy.mock.calls.map(([id]) => id);
        expect(scheduled.some((id) => cleared.includes(id))).toBe(true);
        setTimeoutSpy.mockRestore();
        clearTimeoutSpy.mockRestore();
    });
});

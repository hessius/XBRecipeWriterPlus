import React from "react";
import {act, screen} from "@testing-library/react-native";
import {StyleSheet} from "react-native";

import AboutTicker, {crossing, shuffled} from "@/components/AboutTicker";
import {useReducedMotion} from "@/constants/motion";
import {renderWithProviders} from "@/test-utils/render";

jest.mock("@/constants/motion", () => ({
    ...jest.requireActual("@/constants/motion"),
    useReducedMotion: jest.fn(() => false)
}));

const mockReducedMotion = jest.mocked(useReducedMotion);

/** Animated styles arrive as arrays; this reads them either way. */
const flatten = (style: unknown) => StyleSheet.flatten(style as never) as Record<string, unknown>;

/** A repeatable stand-in for Math.random, so a shuffle can be asserted on. */
function seededRandom(seed: number): () => number {
    let state = seed;
    return () => {
        state = (state * 1103515245 + 12345) % 2147483648;
        return state / 2147483648;
    };
}

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

    it("draws a line from the list it was given", async () => {
        await renderWithProviders(
            <AboutTicker lines={["FIRST", "SECOND", "THIRD"]} delayMs={8000}
                         random={() => 0}/>
        );
        await act(async () => {
            jest.advanceTimersByTime(8100);
        });
        expect(screen.getByTestId("about-ticker", {includeHiddenElements: true}))
            .toHaveTextContent(/FIRST|SECOND|THIRD/);
    });

    it("shows one line at a time, not all of them at once", async () => {
        // The previous design joined every phrase into one continuous stream,
        // so two of them shared the band and neither could be read.
        await renderWithProviders(
            <AboutTicker lines={["FIRST", "SECOND", "THIRD"]} delayMs={8000}
                         random={() => 0}/>
        );
        await act(async () => {
            jest.advanceTimersByTime(8100);
        });
        expect(screen.getAllByTestId("about-ticker-line", {includeHiddenElements: true}))
            .toHaveLength(1);
    });

    it("refuses to move until both the line and the band have been measured", () => {
        // Moving on an unmeasured width gives a zero-duration animation, which
        // is not a slow crossing but one that completes on the next frame.
        expect(crossing(0, 400)).toBeNull();
        expect(crossing(200, 0)).toBeNull();
        expect(crossing(-5, 400)).toBeNull();
    });

    it("enters from off the near edge and leaves past the far one", () => {
        // The two faults this replaces: starting at zero drops the line into
        // the middle of the band already half read, and finishing at zero cuts
        // it off while its tail is still on screen.
        const plan = crossing(300, 400);
        expect(plan?.from).toBe(400);
        expect(plan?.to).toBe(-300);
    });

    it("takes the whole crossing into account when timing it", () => {
        // Timing only the line's own width would run a long phrase at the same
        // speed as a short one and make the long one late.
        const short = crossing(100, 400);
        const long = crossing(900, 400);
        expect(long!.duration).toBeGreaterThan(short!.duration);
        expect(long!.duration / short!.duration).toBeCloseTo(1300 / 500, 2);
    });

    it("shuffles the lines without losing or duplicating any", () => {
        const lines = ["A", "B", "C", "D", "E"];
        // A random that always returns its lowest value still has to produce a
        // permutation; a shuffle that drops or repeats an entry is a shuffle
        // that would silently shorten the ticker.
        expect(shuffled(lines, () => 0).sort()).toEqual([...lines].sort());
        expect(shuffled(lines, () => 0.999).sort()).toEqual([...lines].sort());
    });

    it("actually reorders, rather than handing the list back", () => {
        const lines = ["A", "B", "C", "D", "E", "F"];
        const order = shuffled(lines, seededRandom(7));
        expect(order.sort()).toEqual([...lines].sort());
        expect(shuffled(lines, seededRandom(7))).not.toEqual(lines);
    });



    it("keeps the stream out of the accessibility tree", async () => {
        // It arrives eight seconds in. A reader partway through the screen
        // would find the tree had grown a decorative line under them.
        await renderWithProviders(<AboutTicker lines={["FIRST"]} delayMs={8000}/>);
        await act(async () => {
            jest.advanceTimersByTime(8100);
        });
        expect(screen.queryAllByTestId("about-ticker-line")).toHaveLength(0);
        expect(screen.getAllByTestId("about-ticker-line", {includeHiddenElements: true}).length)
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

    it("gives the line room to be its own length, and does not stretch it", async () => {
        // The bug this exists to catch is invisible on device: a line laid out
        // in a container the width of the band gets stretched to it by the
        // default `align-items: stretch`, `numberOfLines` ellipsises it, and
        // the marquee scrolls a truncated phrase for ever while looking
        // entirely deliberate. Both halves are asserted -- room to lay out in,
        // and a child that shrinks to its content rather than filling it.
        await renderWithProviders(<AboutTicker lines={["A VERY LONG PHRASE INDEED"]}
                                               delayMs={8000} random={() => 0}/>);
        await act(async () => {
            jest.advanceTimersByTime(8100);
        });
        const row = flatten(screen.getByTestId("about-ticker", {includeHiddenElements: true}).props.style);
        const line = flatten(screen.getByTestId("about-ticker-line", {includeHiddenElements: true}).props.style);
        expect(row.width).toBeGreaterThan(1200);
        expect(line.alignSelf).toBe("flex-start");
    });

    it("keeps the line off screen until it has been measured", async () => {
        // Otherwise the reader gets a phrase blinking into the middle of the
        // band, blinking out again, and only then the ticker starting.
        await renderWithProviders(<AboutTicker lines={["FIRST"]} delayMs={8000}
                                               random={() => 0}/>);
        await act(async () => {
            jest.advanceTimersByTime(8100);
        });
        const row = flatten(screen.getByTestId("about-ticker", {includeHiddenElements: true}).props.style);
        const shift = (row.transform as unknown as {translateX: number}[])?.[0]?.translateX;
        expect(shift).toBeGreaterThan(600);
    });
});

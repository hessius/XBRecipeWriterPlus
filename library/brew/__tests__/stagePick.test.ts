import {stageAtSeconds, stageAtX, stageBounds} from "@/library/brew/stagePick";
import type {BrewSample} from "@/library/brew/BrewRecord";
import Pour from "@/library/Pour";

/** A pour of `volume` ml at 10 (= 1 ml/s), so a stage's length reads as its volume. */
function pour(volume: number, pauseTime = 0): Pour {
    const p = new Pour(1);
    p.volume = volume;
    p.flowRate = 10;
    p.pauseTime = pauseTime;
    return p;
}

function sample(at: number, pourNumber: number): BrewSample {
    return {at, water: 0, cup: 0, pour: pourNumber};
}

describe("stageBounds", () => {
    it("falls back to the plan when the stream has been swept", () => {
        // 40 ml at 1 ml/s then a 30 s rest, so stage one owns 0-70 s and stage
        // two starts there. Literals, not `stageSpans(...)`: deriving the
        // expectation from the same helper the code calls would agree with it
        // however wrong both were.
        const bounds = stageBounds([], [pour(40, 30), pour(20)]);
        expect(bounds).toEqual([{start: 0, end: 70}, {start: 70, end: 90}]);
    });

    it("takes the real extents from the stream when there is one", () => {
        // The brew drifted: stage one actually ran to 90 s, twenty seconds past
        // the plan's 70. A tap at 80 s belongs to stage one, and would land on
        // stage two if this resolved against the plan.
        const bounds = stageBounds(
            [sample(0, 1), sample(90_000, 1), sample(91_000, 2), sample(120_000, 2)],
            [pour(40, 30), pour(20)]
        );
        expect(bounds).toEqual([{start: 0, end: 90}, {start: 91, end: 120}]);
    });

    it("ignores the pre-pour samples the machine reports as stage zero", () => {
        const bounds = stageBounds(
            [sample(0, 0), sample(1000, 0), sample(2000, 1), sample(5000, 1)],
            [pour(40)]
        );
        expect(bounds).toEqual([{start: 2, end: 5}]);
    });

    it("keeps the planned extent for a stage the stream never mentions", () => {
        // Stage two never ran. Without this it would be a NaN hole that
        // swallowed every tap landing in it.
        const bounds = stageBounds([sample(0, 1), sample(10_000, 1)], [pour(40), pour(20)]);
        expect(bounds).toEqual([{start: 0, end: 10}, {start: 40, end: 60}]);
    });
});

describe("stageAtSeconds", () => {
    const bounds = [{start: 0, end: 40}, {start: 41, end: 60}, {start: 61, end: 100}];

    it("names the stage a moment sits inside", () => {
        expect(stageAtSeconds(bounds, 20)).toBe(0);
        expect(stageAtSeconds(bounds, 50)).toBe(1);
        expect(stageAtSeconds(bounds, 70)).toBe(2);
    });

    it("resolves a moment in the gap between two stages to the later one", () => {
        // The sample rate leaves a fraction of a second between one stage's
        // last reading and the next's first. A strict start <= t <= end test
        // would drop a tap there, which reads as the graph ignoring you.
        expect(stageAtSeconds(bounds, 40.5)).toBe(1);
    });

    it("gives the tail of the chart to the last stage", () => {
        // Past the final sample is where an overrun is drawn, and an overrun is
        // the most likely thing a user taps the end of the chart to ask about.
        expect(stageAtSeconds(bounds, 200)).toBe(2);
    });

    it("declines a moment before the brew began", () => {
        expect(stageAtSeconds([{start: 5, end: 40}], 2)).toBeNull();
        expect(stageAtSeconds([], 10)).toBeNull();
    });
});

describe("stageAtX", () => {
    const bounds = [{start: 0, end: 40}, {start: 40, end: 100}];

    it("maps a tap across the width onto the axis the trace is drawn against", () => {
        // Half of a 200 pt chart on a 100 s axis is 50 s, which is stage two.
        expect(stageAtX(bounds, 100, 200, 100)).toBe(1);
        // A fifth across is 20 s, still stage one.
        expect(stageAtX(bounds, 40, 200, 100)).toBe(0);
    });

    it("declines a chart with no width or no axis rather than dividing by zero", () => {
        expect(stageAtX(bounds, 10, 0, 100)).toBeNull();
        expect(stageAtX(bounds, 10, 200, 0)).toBeNull();
    });
});

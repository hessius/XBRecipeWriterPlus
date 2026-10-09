import {isPauseIntervals, pausedWithin, type PauseInterval} from "@/library/brew/pauseIntervals";

const span: PauseInterval = {from: 1000, to: 3000, pour: 1, reason: "manual"};

describe("pause intervals", () => {
    it("accepts empty, touching, zero-length and both kinds of intervals", () => {
        expect(isPauseIntervals([])).toBe(true);
        expect(isPauseIntervals([Object.assign(Object.create(null), span)])).toBe(true);
        expect(isPauseIntervals([span, {...span, from: 3000, to: 3000,
            pour: 0, reason: "overflow"}])).toBe(true);
    });

    it.each([0, 1, Number.MAX_SAFE_INTEGER])("accepts safe pour integer %p", (pour) => {
        expect(isPauseIntervals([{...span, pour}])).toBe(true);
    });

    it.each([Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER + 3])(
        "rejects unsafe pour integer %p", (pour) => {
            expect(isPauseIntervals([{...span, pour}])).toBe(false);
        }
    );

    it.each([
        null, {}, [null], [[]], [new Date()], [{...span, from: -1}],
        [{...span, from: NaN}], [{...span, to: Infinity}],
        [{...span, to: 999}], [{...span, pour: 1.5}], [{...span, pour: -1}],
        [{...span, reason: "unknown"}], [{...span, from: "1000"}],
        [span, {...span, from: 2000}], [span, {...span, from: 0, to: 500}],
        [Object.assign(Object.create({}), span)], Array(1), [{...span, pour: Infinity}],
        [{...span, to: -1}], [{...span, pour: "1"}], [{...span, from: -Infinity}],
        [{from: 0, to: 1, reason: "manual"}]
    ].map((value) => [value]))("rejects malformed intervals: %p", (value) => {
        expect(isPauseIntervals(value)).toBe(false);
    });

    it("sums only overlap inside a window", () => {
        const intervals = [span, {...span, from: 5000, to: 8000}];
        expect(pausedWithin(intervals, 2000, 6000)).toBe(2000);
        expect(pausedWithin(intervals, 3000, 5000)).toBe(0);
        expect(pausedWithin(intervals, 0, 9000)).toBe(5000);
    });

    it.each([[3, 2], [2, 2], [NaN, 5], [0, Infinity], [-1, 5]])(
        "returns zero for invalid windows %p to %p", (from, to) => {
            expect(pausedWithin([span], from, to)).toBe(0);
        }
    );
});

describe("interval geometry", () => {
    const {intervalRects, intervalExtent} = jest.requireActual("@/library/brew/pauseIntervals");

    it("scales milliseconds into seconds before the axis", () => {
        const [rect] = intervalRects([{from: 10000, to: 25000, pour: 1, reason: "overflow"}], 400, 100);
        expect(rect.x).toBeCloseTo(40);
        expect(rect.width).toBeCloseTo(60);
    });

    it("keeps millisecond precision and drops zero width", () => {
        const rects = intervalRects([
            {from: 1000, to: 1500, pour: 1, reason: "manual"},
            {from: 2000, to: 2000, pour: 1, reason: "manual"},
        ], 100, 10);
        expect(rects).toHaveLength(1);
        expect(rects[0].width).toBeCloseTo(5);
    });

    it("returns nothing on a degenerate box", () => {
        const one = [{from: 0, to: 1000, pour: 1, reason: "manual" as const}];
        expect(intervalRects(one, 0, 10)).toEqual([]);
        expect(intervalRects(one, 100, 0)).toEqual([]);
    });

    it("reports the furthest end in seconds", () => {
        expect(intervalExtent([])).toBe(0);
        expect(intervalExtent([{from: 0, to: 4500, pour: 1, reason: "manual"}])).toBe(4.5);
    });
});

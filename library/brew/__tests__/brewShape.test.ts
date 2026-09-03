import Pour from "@/library/Pour";
import {
    livePoints, planPoints, plannedSeconds, pourSeconds, stageSpans, toPath
} from "@/library/brew/brewShape";
import type {BrewSample} from "@/library/brew/BrewRecord";

/** 40 ml at 4 ml/s (flowRate is stored x10) then a 20 s pause. */
const bloom = () => new Pour(1, 40, 93, 40, 0, 0, 20);
/** 160 ml at 4 ml/s, no pause. */
const main = () => new Pour(2, 160, 92, 40, 0, 0, 0);

describe("pourSeconds", () => {
    it("divides volume by the flow rate, which is stored times ten", () => {
        expect(pourSeconds(bloom())).toBe(10);
    });

    it("falls back to a nominal flow when the recipe has none", () => {
        // flowRate defaults to -1 on Pour. Dividing by it would run the curve
        // backwards in time, which draws as a line through the whole chart.
        expect(pourSeconds(new Pour(1, 32, 93, -1, 0, 0, 0))).toBeCloseTo(10);
    });
});

describe("plannedSeconds", () => {
    it("adds every pour and every pause", () => {
        expect(plannedSeconds([bloom(), main()])).toBe(10 + 20 + 40);
    });

    it("is zero for a recipe with no pours", () => {
        expect(plannedSeconds([])).toBe(0);
    });
});

describe("stageSpans", () => {
    it("places each stage after the one before it, pause included", () => {
        expect(stageSpans([bloom(), main()])).toEqual([
            {start: 0, pourEnd: 10, end: 30},
            {start: 30, pourEnd: 70, end: 70}
        ]);
    });
});

describe("planPoints", () => {
    it("steps up over each pour and runs level through each pause", () => {
        expect(planPoints([bloom(), main()])).toEqual([
            {t: 0, v: 0}, {t: 10, v: 40}, {t: 30, v: 40}, {t: 70, v: 200}
        ]);
    });

    it("emits no flat segment for a pour with no pause", () => {
        // A zero-length segment per pour is a third more path data for
        // identical geometry, on a component that renders in a list.
        expect(planPoints([main()])).toEqual([{t: 0, v: 0}, {t: 40, v: 160}]);
    });

    it("draws a recipe with no pours as nothing at all", () => {
        expect(planPoints([])).toEqual([]);
    });
});

describe("livePoints", () => {
    const samples: BrewSample[] = [
        {at: 0, water: 0, cup: 0, pour: 1},
        {at: 5000, water: 20, cup: 4, pour: 1}
    ];

    it("reads the water channel in seconds", () => {
        expect(livePoints(samples, "water")).toEqual([{t: 0, v: 0}, {t: 5, v: 20}]);
    });

    it("reads the cup channel from the same stream", () => {
        expect(livePoints(samples, "cup")).toEqual([{t: 0, v: 0}, {t: 5, v: 4}]);
    });
});

describe("toPath", () => {
    it("maps seconds across and volume up, with y flipped for SVG", () => {
        const path = toPath([{t: 0, v: 0}, {t: 10, v: 50}],
                            {width: 100, height: 40, maxT: 20, maxV: 100});
        expect(path).toBe("M0 40 L50 20");
    });

    it("is empty for fewer than two points, so no stray dot is drawn", () => {
        expect(toPath([{t: 0, v: 0}], {width: 100, height: 40, maxT: 20, maxV: 100})).toBe("");
    });

    it("does not divide by zero before the first sample has any spread", () => {
        // maxT is elapsed time, which is 0 on the first frame of every brew.
        expect(toPath([{t: 0, v: 0}, {t: 0, v: 0}],
                      {width: 100, height: 40, maxT: 0, maxV: 0})).toBe("M0 40 L0 40");
    });
});

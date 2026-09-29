import type {BrewSample} from "@/library/brew/BrewRecord";
import {bypassSeconds, traceTimeExtent, traceTimeParts} from "@/library/brew/brewShape";

/*
 * The horizontal extent the volume trace and the rate chart share. The two
 * charts sit one above the other and a reader compares them by eye, so a
 * second landing at a different x in each would be a silent lie. These pin
 * the branches the component tests cannot reach.
 */

function sample(at: number, water: number, cup: number, pour = 1): BrewSample {
    return {at, water, cup, pour};
}

describe("traceTimeExtent", () => {
    it("falls back to the plan when nothing has been sampled", () => {
        expect(traceTimeExtent(120, [])).toBe(120);
    });

    it("takes the run when it overran the plan", () => {
        const samples = [sample(1000, 5, 0), sample(150_000, 250, 200)];

        expect(traceTimeExtent(120, samples)).toBe(150);
    });

    it("keeps the plan when the run stopped short of it", () => {
        const samples = [sample(1000, 5, 0), sample(60_000, 120, 90)];

        expect(traceTimeExtent(120, samples)).toBe(120);
    });

    it("stacks a started bypass on its own start time", () => {
        const samples = [sample(60_000, 120, 90)];

        expect(traceTimeExtent(60, samples, {volume: 30, startedAt: 70}))
            .toBeCloseTo(70 + bypassSeconds(30), 6);
    });

    it("slides an unstarted bypass off the later of plan and run", () => {
        const samples = [sample(90_000, 180, 140)];

        expect(traceTimeExtent(60, samples, {volume: 30, startedAt: null}))
            .toBeCloseTo(90 + bypassSeconds(30), 6);
    });

    it("refuses to let a negative bypass volume shorten the axis", () => {
        const samples = [sample(60_000, 120, 90)];

        expect(traceTimeExtent(60, samples, {volume: -40, startedAt: 70})).toBe(70);
    });

    it("reports the same total through the parts the trace draws with", () => {
        const samples = [sample(90_000, 180, 140)];
        const bypass = {volume: 30, startedAt: null};
        const parts = traceTimeParts(60, samples, bypass);

        expect(parts.ranTo).toBe(90);
        expect(parts.bypassMl).toBe(30);
        expect(parts.bypassFrom).toBe(90);
        expect(parts.maxT).toBe(traceTimeExtent(60, samples, bypass));
    });
});

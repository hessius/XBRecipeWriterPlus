import type {BrewSample} from "@/library/brew/BrewRecord";
import {
    bypassSeconds, traceAxisFor, traceTimeExtent, traceTimeParts
} from "@/library/brew/brewShape";
import Pour from "@/library/Pour";

/*
 * The horizontal extent the volume trace and the rate chart share. The two
 * charts sit one above the other and a reader compares them by eye, so a
 * second landing at a different x in each would be a silent lie. These pin
 * the branches the component tests cannot reach.
 */

function sample(at: number, water: number, cup: number, pour = 1): BrewSample {
    return {at, water, cup, pour};
}

/** A pour of `volume` ml at 10 (= 1 ml/s), so its length reads as its volume. */
function pour(volume: number): Pour {
    const p = new Pour(1);
    p.volume = volume;
    p.flowRate = 10;
    return p;
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
        expect(parts.maxT).toBeCloseTo(90 + bypassSeconds(30), 6);
    });
});

/*
 * The whole box, which the trace sizes itself to and the summary hands down so
 * the rate chart under it agrees. Derived in two places these once differed by
 * the plan's own height, which was invisible only because the one caller that
 * built its own passed no plan.
 */
describe("traceAxisFor", () => {
    const pours = [pour(200), pour(100)];

    it("clears a plan that reaches higher than the run did", () => {
        const axis = traceAxisFor(pours, [sample(30_000, 90, 60)], 120);

        expect(axis.maxV).toBe(300);
    });

    it("clears a run that overshot its plan", () => {
        const axis = traceAxisFor(pours, [sample(30_000, 340, 300)], 120);

        expect(axis.maxV).toBe(340);
    });

    it("stacks the bypass on top of the plan rather than beside it", () => {
        const axis = traceAxisFor(pours, [sample(30_000, 300, 260)], 120,
                                  {volume: 50, startedAt: 130});

        expect(axis.maxV).toBe(350);
    });

    it("falls back to nothing when there is neither plan nor run", () => {
        const axis = traceAxisFor([], [], 120);

        expect(axis.maxV).toBe(0);
        expect(axis.maxT).toBe(120);
    });

    it("carries the same seconds the trace and the rate chart share", () => {
        const samples = [sample(90_000, 180, 140)];

        expect(traceAxisFor([], samples, 60, {volume: 30, startedAt: null}).maxT)
            .toBeCloseTo(90 + bypassSeconds(30), 6);
    });
});

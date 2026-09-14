import {stageWaterFromSamples, stallsFromSamples, type BrewSample}
    from "@/library/brew/BrewRecord";

/**
 * The brew of 2026-09-10, as its frame log records it.
 *
 * Three stages of 40, 115 and 85 ml, then a 61-second drawdown wait at the
 * last stage's target, then a 5 ml bypass. The machine emitted 40510(0),
 * 40510(1), 40510(2) and no fourth pour start — so before the bypass had a
 * lane, every one of these samples from t=100 onwards was stamped `pour: 3`.
 *
 * `pour: 4` is what the recorder now stamps. This asserts the consequence.
 */
const samples: BrewSample[] = [
    {at:      0, water:   0, cup:   0, pour: 1},
    {at:  13_000, water:  40, cup:   0, pour: 1},
    {at:  60_000, water:  40, cup:  10, pour: 2},
    {at:  96_000, water: 155, cup:  60, pour: 2},
    {at: 123_000, water: 155, cup: 120, pour: 3},
    {at: 150_000, water: 240, cup: 170, pour: 3},
    // The drawdown. Flat, at the target, for just over a minute.
    {at: 180_000, water: 240, cup: 195, pour: 3},
    {at: 211_000, water: 240, cup: 200, pour: 3},
    // The bypass, in its own lane.
    {at: 212_000, water: 245, cup: 205, pour: 4}
];

const targets = [40, 115, 85];

describe("the bypass brew of 2026-09-10", () => {
    it("does not fold the bypass into the last stage", () => {
        expect(stageWaterFromSamples(samples, 3)).toEqual([40, 115, 85]);
    });

    it("puts the bypass in the lane after the stages", () => {
        expect(stageWaterFromSamples(samples, 4)[3]).toBe(5);
    });

    it("finds no stall in the drawdown wait", () => {
        // This is the amber the screenshot showed. The plateau was flat at the
        // stage's target, so the trailing-plateau guard would have spared it —
        // but the bypass's rise closed it first, and `push` has no target
        // guard. Moving the bypass out of the stage is what removes it.
        expect(stallsFromSamples(samples, targets)[2]).toEqual([]);
    });

    it("finds no stall anywhere in a brew that went well", () => {
        expect(stallsFromSamples(samples, targets).flat()).toEqual([]);
    });
});

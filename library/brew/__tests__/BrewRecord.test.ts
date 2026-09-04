import {stallsFromSamples, summarise, type BrewSample} from "@/library/brew/BrewRecord";

function samples(rows: [number, number, number][]): BrewSample[] {
    return rows.map(([at, water, cup]) => ({at, water, cup, pour: 1}));
}

describe("summarise", () => {
    it("reports the last water and cup figures, not the largest", () => {
        // The cup can lose weight: a drip settles, or the machine is nudged.
        // The record is what the brew ended at.
        const result = summarise(samples([[0, 0, 0], [1000, 120, 90], [2000, 250, 244]]), 120);
        expect(result.waterTotal).toBe(250);
        expect(result.cupTotal).toBe(244);
    });

    it("has no held time when the brew ran to plan", () => {
        expect(summarise(samples([[0, 0, 0], [120_000, 250, 244]]), 120).heldSeconds).toBe(0);
    });

    it("counts the overrun as held time", () => {
        // Overflow protection stops the water without announcing itself. The
        // only evidence is that the brew took longer than the recipe asked for.
        expect(summarise(samples([[0, 0, 0], [134_000, 250, 244]]), 120).heldSeconds).toBe(14);
    });

    it("never reports negative held time", () => {
        // A machine that beats the plan is running its own flow rate, not
        // holding. Reporting "-6 s held" would be nonsense on the screen.
        expect(summarise(samples([[0, 0, 0], [114_000, 250, 244]]), 120).heldSeconds).toBe(0);
    });

    it("summarises an empty stream as zeroes rather than throwing", () => {
        // A brew that fails during `sending` has a record and no samples.
        expect(summarise([], 120)).toEqual({waterTotal: 0, cupTotal: 0, heldSeconds: 0});
    });
});

describe("stallsFromSamples", () => {
    it("keeps one list per stage, index-aligned with the pours", () => {
        const samples = [
            {at: 0, water: 0, cup: 0, pour: 1},
            {at: 2000, water: 20, cup: 16, pour: 1},
            {at: 12000, water: 20, cup: 18, pour: 1},
            {at: 13000, water: 40, cup: 34, pour: 1},
            {at: 14000, water: 40, cup: 36, pour: 2},
            {at: 18000, water: 80, cup: 70, pour: 2}
        ];

        expect(stallsFromSamples(samples, [40, 40])).toEqual([
            [{atMl: 20, seconds: 11}],
            []
        ]);
    });

    it("is an empty list per stage when nothing stalled", () => {
        expect(stallsFromSamples([], [40, 40])).toEqual([[], []]);
    });
});

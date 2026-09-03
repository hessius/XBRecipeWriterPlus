import {summarise, type BrewSample} from "@/library/brew/BrewRecord";

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

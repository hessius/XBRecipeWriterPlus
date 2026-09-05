import Pour from "@/library/Pour";
import {planFromPours, poursFromPlan, stageWaterFromSamples,
        stallsFromSamples, summarise, type BrewSample, type PlanStage} from "@/library/brew/BrewRecord";

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

describe("a stage's delivered water", () => {
    // `water` is cumulative across the whole brew, so a stage's own delivery
    // is the difference across it -- not the reading at its end.
    const stream: BrewSample[] = [
        {at: 0,     water: 0,   cup: 0,   pour: 1},
        {at: 5_000, water: 40,  cup: 38,  pour: 1},
        {at: 9_000, water: 40,  cup: 39,  pour: 2},
        {at: 15_000, water: 120, cup: 116, pour: 2}
    ];

    it("measures each stage from where it began", () => {
        expect(stageWaterFromSamples(stream, 2)).toEqual([40, 80]);
    });

    it("gives nothing to a stage that never ran", () => {
        // The failure case this exists for: a brew that died in stage 2 of 4
        // must not claim stages 3 and 4 poured.
        expect(stageWaterFromSamples(stream, 4)).toEqual([40, 80, 0, 0]);
    });

    it("is all zeroes for a brew that never poured", () => {
        expect(stageWaterFromSamples([], 3)).toEqual([0, 0, 0]);
    });

    it("never reports a negative delivery", () => {
        // The firmware auto-tares during the bloom (see #90), so water can
        // fall. A negative bar would draw backwards.
        //
        // The tare has to land in a stage with a non-zero origin -- stage 1
        // always starts from 0, so a drop within it can never go negative
        // before the clamp even runs. Stage 1 climbs to 30, then stage 2
        // starts from that same 30 and drops to 10.
        const tared: BrewSample[] = [
            {at: 0,     water: 0,  cup: 0,  pour: 1},
            {at: 5_000, water: 30, cup: 28, pour: 1},
            {at: 6_000, water: 30, cup: 28, pour: 2},
            {at: 8_000, water: 10, cup: 8,  pour: 2}
        ];
        expect(stageWaterFromSamples(tared, 2)).toEqual([30, 0]);
    });
});

describe("a plan, snapshotted", () => {
    it("survives a round trip through JSON", () => {
        // The point of the snapshot: a record must still draw its ladder when
        // the recipe it came from has been edited or deleted.
        //
        // Pour numbers 3 and 7 rather than 1 and 2: `poursFromPlan` falls back
        // to `index + 1` for a missing pourNumber, so 1 and 2 would come back
        // right even if planFromPours dropped the field entirely.
        const pours = [new Pour(3, 40, 93, 40, 1, 2, 20), new Pour(7, 160, 92, 40, 0, 0, 0)];

        const back = poursFromPlan(JSON.parse(JSON.stringify(planFromPours(pours))));

        expect(back).toHaveLength(2);
        expect(back[0].pourNumber).toBe(3);
        expect(back[0].volume).toBe(40);
        expect(back[0].temperature).toBe(93);
        expect(back[0].flowRate).toBe(40);
        expect(back[0].pourPattern).toBe(2);
        expect(back[0].pauseTime).toBe(20);
        // Rehydrated as real Pours, because the ladder calls these.
        expect(back[0].getAgitationBefore()).toBe(true);
        expect(back[0].getAgitationAfter()).toBe(false);
        expect(back[1].pourNumber).toBe(7);
        expect(back[1].getAgitationBefore()).toBe(false);
    });

    it("reads a plan that is not one as no plan at all", () => {
        // A column can hold anything a previous version wrote, and a half-read
        // plan drawn as a ladder would be a lie with a shape.
        expect(poursFromPlan(undefined)).toEqual([]);
        expect(poursFromPlan([{volume: "forty"} as unknown as PlanStage])).toEqual([]);
    });

    // Each case below is otherwise well-formed and differs from a valid stage
    // in exactly one required field, so only that field's own guard can be
    // the one rejecting it -- a weakened guard on any other field would leave
    // these green.
    const valid: PlanStage = {
        pourNumber: 1, volume: 40, temperature: 93,
        flowRate: 40, agitation: 1, pourPattern: 2, pauseTime: 20
    };

    it("rejects a plan whose volume is NaN", () => {
        // The `[{volume: "forty"}]` case above doesn't isolate this guard --
        // that stage is also missing temperature, agitation and pourPattern,
        // so it's rejected either way. Volume matters most of all of them:
        // it sets the bar height on the ladder.
        expect(poursFromPlan([{...valid, volume: NaN}])).toEqual([]);
    });

    it("rejects a plan whose temperature is not a number", () => {
        expect(poursFromPlan([{...valid, temperature: "hot"} as unknown as PlanStage])).toEqual([]);
    });

    it("rejects a plan whose agitation is NaN", () => {
        // `typeof NaN === "number"`, so only `Number.isFinite` catches this --
        // a guard that merely checked `typeof` would let it through.
        expect(poursFromPlan([{...valid, agitation: NaN}])).toEqual([]);
    });

    it("rejects a plan whose pourPattern is not a number", () => {
        expect(poursFromPlan([{...valid, pourPattern: undefined} as unknown as PlanStage])).toEqual([]);
    });

    it("accepts a stage missing only its optional fields", () => {
        // pourNumber, flowRate and pauseTime are deliberately not required --
        // a stage written before one of them existed still has to draw.
        const minimal = {volume: 40, temperature: 93, agitation: 1, pourPattern: 2};
        const back = poursFromPlan([minimal as unknown as PlanStage]);

        expect(back).toHaveLength(1);
        expect(back[0].pourNumber).toBe(1);
        expect(back[0].flowRate).toBe(0);
        expect(back[0].pauseTime).toBe(0);
    });
});

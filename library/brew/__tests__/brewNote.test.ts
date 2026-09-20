import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";
import {brewNote} from "@/library/brew/brewNote";
import type {BrewRecord, PlanStage} from "@/library/brew/BrewRecord";

const stages: PlanStage[] = [
    {
        pourNumber: 1, volume: 40, temperature: 94, flowRate: 40,
        agitation: AGITATION.BEFORE_ON_AFTER_OFF,
        pourPattern: POUR_PATTERN.SPIRAL, pauseTime: 30
    },
    {
        pourNumber: 2, volume: 100, temperature: 92, flowRate: 40,
        agitation: AGITATION.ALL_OFF,
        pourPattern: POUR_PATTERN.CIRCULAR, pauseTime: 20
    },
    {
        pourNumber: 3, volume: 100, temperature: 90, flowRate: 40,
        agitation: AGITATION.BEFORE_OFF_AFTER_ON,
        pourPattern: POUR_PATTERN.CENTERED, pauseTime: 0
    }
];

function record(overrides: Partial<BrewRecord> = {}): BrewRecord {
    return {
        id: "brew-1",
        recipeUuid: "recipe-1",
        recipeName: "House recipe",
        accent: "#C86A3B",
        startedAt: Date.UTC(2026, 8, 3, 7, 42),
        endedAt: Date.UTC(2026, 8, 3, 7, 46),
        outcome: "done",
        failure: null,
        pours: 3,
        waterTotal: 240,
        cupTotal: 232,
        heldSeconds: 0,
        plan: stages,
        dose: 15,
        ratio: 16,
        grindSize: 62,
        grinderUsed: true,
        ...overrides
    };
}

describe("brewNote", () => {
    it("renders a finished brew as a stage ladder and footer", () => {
        expect(brewNote(record())).toBe(`Stage 1   40 ml   94°C   spiral, agitate before, then wait 30 s
Stage 2  100 ml   92°C   circular, then wait 20 s
Stage 3  100 ml   90°C   centred, agitate after

15 g · 1:16 · grind 62 · 3 stages · xBloom`);
    });

    it("omits the grind when the grinder did not run", () => {
        const note = brewNote(record({grinderUsed: false, grindSize: 81}));

        expect(note).toBe(`Stage 1   40 ml   94°C   spiral, agitate before, then wait 30 s
Stage 2  100 ml   92°C   circular, then wait 20 s
Stage 3  100 ml   90°C   centred, agitate after

15 g · 1:16 · 3 stages · xBloom`);
        expect(note).not.toContain("grind");
    });

    it("wraps a long descriptor to the descriptor column between parts", () => {
        expect(brewNote(record({
            plan: [{
                pourNumber: 1, volume: 40, temperature: 94, flowRate: 40,
                agitation: AGITATION.BEFORE_ON_AFTER_ON,
                pourPattern: POUR_PATTERN.SPIRAL, pauseTime: 45
            }],
            pours: 1
        }))).toBe(`Stage 1   40 ml   94°C   spiral, agitate before and after,
                         then wait 45 s

15 g · 1:16 · grind 62 · 1 stage · xBloom`);
    });

    it("keeps the unset agitation sentinel from reading as both agitation flags", () => {
        // This defends against bit-mask wording: every bit of -1 is set, but an unset stage has no agitation.
        expect(brewNote(record({
            plan: [{
                pourNumber: 1, volume: 40, temperature: 94, flowRate: 40,
                agitation: -1,
                pourPattern: POUR_PATTERN.SPIRAL, pauseTime: 0
            }],
            pours: 1
        })).split("\n")[0]).toBe("Stage 1   40 ml   94°C   spiral");
    });

    it.each([
        POUR_PATTERN.CENTERED,
        POUR_PATTERN.CIRCULAR,
        POUR_PATTERN.SPIRAL
    ])("keeps pattern %i wording aligned with Pour", (pourPattern) => {
        const note = brewNote(record({
            plan: [{
                pourNumber: 1, volume: 40, temperature: 94, flowRate: 40,
                agitation: AGITATION.ALL_OFF,
                pourPattern, pauseTime: 0
            }],
            pours: 1
        }));

        expect(note.split("\n")[0])
            .toBe(`Stage 1   40 ml   94°C   ${Pour.getPourPatternText(pourPattern).toLowerCase()}`);
    });

    it("uses a neutral word for an unrecognised pour pattern", () => {
        const note = brewNote(record({
            plan: [{
                pourNumber: 1, volume: 40, temperature: 94, flowRate: 40,
                agitation: AGITATION.ALL_OFF,
                pourPattern: 7, pauseTime: 0
            }],
            pours: 1
        }));

        expect(note.split("\n")[0]).toBe("Stage 1   40 ml   94°C   pour");
        expect(note).not.toMatch(/error/i);
    });

    it("renders the footer alone when the plan is missing", () => {
        expect(brewNote(record({plan: undefined})))
            .toBe("15 g · 1:16 · grind 62 · 3 stages · xBloom");
    });

    it("uses no dashes anywhere", () => {
        expect(brewNote(record())).not.toMatch(/[-\u2013\u2014]/);
    });

    it("keeps long pauses in seconds", () => {
        expect(brewNote(record({
            plan: [{
                pourNumber: 1, volume: 40, temperature: 94, flowRate: 40,
                agitation: AGITATION.ALL_OFF,
                pourPattern: POUR_PATTERN.SPIRAL, pauseTime: 360
            }],
            pours: 1
        }))).toBe(`Stage 1   40 ml   94°C   spiral, then wait 360 s

15 g · 1:16 · grind 62 · 1 stage · xBloom`);
    });

    it("skips missing dose, ratio and grind fields in old records", () => {
        expect(brewNote(record({
            plan: undefined,
            dose: undefined,
            ratio: undefined,
            grindSize: undefined,
            grinderUsed: undefined
        }))).toBe("3 stages · xBloom");
    });
});

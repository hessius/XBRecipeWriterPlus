import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";
import {brewNote, MAX_CARRIED_NOTE} from "@/library/brew/brewNote";
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

function oneStage(overrides: Partial<PlanStage> = {}): Partial<BrewRecord> {
    return {
        plan: [{
            pourNumber: 1,
            volume: 40,
            temperature: 94,
            flowRate: 40,
            agitation: AGITATION.ALL_OFF,
            pourPattern: POUR_PATTERN.SPIRAL,
            pauseTime: 0,
            ...overrides
        }],
        pours: 1
    };
}

describe("brewNote", () => {
    it("renders a finished brew as a stage ladder and footer", () => {
        expect(brewNote(record())).toBe(`House recipe
#1 · 40 ml · 94°C · spiral · agitate before · wait 30 s
#2 · 100 ml · 92°C · circular · wait 20 s
#3 · 100 ml · 90°C · centred · agitate after

15 g · 1:16 · grind 62 · 3 stages · xBloom`);
    });

    /**
     * The point of the export is the brew somebody had, and the sharpest thing
     * a record holds is what they typed about it. The generated ladder is
     * context for that verdict, so it follows rather than leads.
     */
    it("puts what the user typed above what the app generated", () => {
        const note = brewNote(record({note: "Too sour, grind finer"}));

        expect(note.startsWith("Too sour, grind finer\n\n")).toBe(true);
        expect(note).toContain("3 stages · xBloom");
    });

    it("says nothing extra when the user typed nothing", () => {
        expect(brewNote(record({note: "   "})).startsWith("House recipe\n#1")).toBe(true);
        expect(brewNote(record({note: undefined})).startsWith("House recipe\n#1")).toBe(true);
    });

    /**
     * The note field the user types into has no ceiling of its own, and the
     * reader at the other end refuses an over-long note outright rather than
     * truncating it. Unclamped, one long note would fail the whole hand-off.
     */
    it("clamps a note too long for the reader to accept", () => {
        const note = brewNote(record({note: "x".repeat(MAX_CARRIED_NOTE + 500)}));

        expect(note.startsWith("x".repeat(MAX_CARRIED_NOTE) + "\n\n")).toBe(true);
        expect(note).not.toContain("x".repeat(MAX_CARRIED_NOTE + 1));
    });

    it("omits the grind when the grinder did not run", () => {
        const note = brewNote(record({grinderUsed: false, grindSize: 81}));

        expect(note).toBe(`House recipe
#1 · 40 ml · 94°C · spiral · agitate before · wait 30 s
#2 · 100 ml · 92°C · circular · wait 20 s
#3 · 100 ml · 90°C · centred · agitate after

15 g · 1:16 · 3 stages · xBloom`);
        expect(note).not.toContain("grind");
    });

    it("keeps a long descriptor on one stage line", () => {
        expect(brewNote(record(oneStage({
            agitation: AGITATION.BEFORE_ON_AFTER_ON,
            pauseTime: 45
        })))).toBe(`House recipe
#1 · 40 ml · 94°C · spiral · agitate before and after · wait 45 s

15 g · 1:16 · grind 62 · 1 stage · xBloom`);
    });

    // A stage carrying every field is the worst case. Beanconqueror renders
    // notes in a narrow no-wrap <pre>, so the budget is what keeps a stage
    // readable there; a line that grows past it has gained a field or lost
    // its short wording, and either is worth noticing. The budget is the
    // worst case as it stands rather than a limit Beanconqueror imposes: it
    // was raised from 56 when "agitate both" became "agitate before and
    // after", which reads as English at the cost of twelve characters.
    it("keeps a fully loaded stage line within the width budget", () => {
        const [, line] = brewNote(record(oneStage({
            agitation: AGITATION.BEFORE_ON_AFTER_ON,
            pauseTime: 30
        }))).split("\n");

        expect(line.length).toBeLessThanOrEqual(65);
    });

    it("keeps a stage without agitation comfortably short", () => {
        const [, line] = brewNote(record(oneStage({
            agitation: AGITATION.ALL_OFF,
            pauseTime: 20
        }))).split("\n");

        expect(line.length).toBeLessThanOrEqual(45);
    });

    it("does not emit old continuation indentation", () => {
        const note = brewNote(record(oneStage({
            agitation: AGITATION.BEFORE_ON_AFTER_ON,
            pauseTime: 45
        })));

        expect(note).not.toMatch(/^ {2,}\S/m);
    });

    it("keeps the unset agitation sentinel from reading as both agitation flags", () => {
        // This defends against bit-mask wording: every bit of -1 is set, but an unset stage has no agitation.
        expect(brewNote(record(oneStage({agitation: -1}))).split("\n")[1])
            .toBe("#1 · 40 ml · 94°C · spiral");
    });

    // The note keeps its own wording because Pour.getPourPatternText defaults to "Error",
    // and that implementation detail must never leak into user-facing brew notes.
    it.each([
        POUR_PATTERN.CENTERED,
        POUR_PATTERN.CIRCULAR,
        POUR_PATTERN.SPIRAL
    ])("keeps pattern %i wording aligned with Pour", (pourPattern) => {
        const note = brewNote(record(oneStage({pourPattern})));

        expect(note.split("\n")[1]?.split(" · ")[3])
            .toBe(Pour.getPourPatternText(pourPattern).toLowerCase());
    });

    it("uses a neutral word for an unrecognised pour pattern", () => {
        const note = brewNote(record(oneStage({pourPattern: 7}))); // not a POUR_PATTERN value

        expect(note.split("\n")[1]).toBe("#1 · 40 ml · 94°C · pour");
        expect(note).not.toMatch(/error/i);
    });

    it("heads the stages with the recipe name", () => {
        const note = brewNote(record());

        expect(note.split("\n")[0]).toBe("House recipe");
    });

    it.each([
        ["missing", undefined],
        ["blank", "   "]
    ])("omits the heading when the recipe name is %s", (_label, recipeName) => {
        const note = brewNote(record({recipeName: recipeName as string | undefined}));

        expect(note.startsWith("#1 ")).toBe(true);
    });

    // A name with no stages under it would read as a heading that had lost
    // its section, so it goes when they do.
    it("drops the heading along with the stages", () => {
        expect(brewNote(record({plan: undefined})))
            .not.toContain("House recipe");
    });

    it("renders the footer alone when the plan is missing", () => {
        expect(brewNote(record({plan: undefined})))
            .toBe("15 g · 1:16 · grind 62 · 3 stages · xBloom");
    });

    it.each([
        ["empty", []],
        ["non-array", {not: "a plan"}]
    ])("renders the footer alone when the plan is %s", (_name, plan) => {
        expect(brewNote(record({plan: plan as BrewRecord["plan"]})))
            .toBe("15 g · 1:16 · grind 62 · 3 stages · xBloom");
    });

    it("keeps a stage line neutral when stored stage fields are missing", () => {
        const note = brewNote(record(oneStage({
            pourNumber: undefined as unknown as number,
            volume: undefined as unknown as number,
            temperature: undefined as unknown as number
        })));

        // The stage number falls back to its position, and a volume or
        // temperature that was never recorded is left out rather than printed
        // as a bare unit.
        expect(note.split("\n")[1]).toBe("#1 · spiral");
        expect(note).not.toMatch(/undefined|NaN/);
    });

    it("uses no dashes anywhere", () => {
        const notes = [
            brewNote(record(oneStage({
                agitation: AGITATION.BEFORE_ON_AFTER_ON,
                pauseTime: 45
            }))),
            brewNote(record(oneStage({agitation: AGITATION.BEFORE_ON_AFTER_ON}))),
            brewNote(record(oneStage())),
            brewNote(record(oneStage({pourPattern: 7}))), // not a POUR_PATTERN value
            brewNote(record(), ["dose", "ratio", "grindSize", "grinderRpm", "grinderUsed"])
        ].join("\n");

        expect(notes).not.toMatch(/[-\u2013\u2014]/);
    });

    it("keeps long pauses in seconds", () => {
        expect(brewNote(record(oneStage({pauseTime: 360})))).toBe(`House recipe
#1 · 40 ml · 94°C · spiral · wait 360 s

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

    it("names only the fields that were read from the recipe", () => {
        const note = brewNote(record({dose: undefined}), ["dose"]);

        expect(note).toBe(`House recipe
#1 · 40 ml · 94°C · spiral · agitate before · wait 30 s
#2 · 100 ml · 92°C · circular · wait 20 s
#3 · 100 ml · 90°C · centred · agitate after

1:16 · grind 62 · 3 stages · xBloom
Dose read from the recipe, not this recording.`);
        expect(note).not.toContain("ratio read");
        expect(note).not.toContain("grinder read");
    });

    it("collapses grinder backfill details into one user word", () => {
        const note = brewNote(record(), ["grindSize", "grinderRpm", "grinderUsed"]);

        expect(note).toContain("Grinder read from the recipe, not this recording.");
        expect(note).not.toMatch(/grind size|rpm|used/i);
    });
});

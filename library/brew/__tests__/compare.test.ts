import type {StoredBrew} from "@/library/BrewDatabase";
import type {PlanStage} from "@/library/brew/BrewRecord";
import {
    COMPARE_TIME_TOLERANCE_SECONDS,
    COMPARE_WATER_TOLERANCE_ML,
    planDrift,
    pourVerdict
} from "@/library/brew/compare";

function brew(over: Partial<StoredBrew> = {}): StoredBrew {
    return {
        id: "a", recipeUuid: "r", recipeName: "Ethiopia Guji", accent: "#C86A3B",
        startedAt: 0, pouringAt: 10_000, endedAt: 150_000, outcome: "done",
        failure: null, pours: 2, waterTotal: 250, cupTotal: 244, heldSeconds: 0,
        hasStream: true, ...over
    };
}

describe("pourVerdict", () => {
    it("calls two undisturbed brews with matching figures the same", () => {
        expect(pourVerdict(brew(), brew({id: "b"})).verdict).toBe("same");
    });

    it("tolerates water inside the tolerance", () => {
        const b = brew({id: "b", waterTotal: 250 + COMPARE_WATER_TOLERANCE_ML});
        expect(pourVerdict(brew(), b).verdict).toBe("same");
    });

    it("calls water outside the tolerance a difference", () => {
        const b = brew({id: "b", waterTotal: 250 + COMPARE_WATER_TOLERANCE_ML + 1});
        const {verdict, why} = pourVerdict(brew(), b);
        expect(verdict).toBe("differed");
        expect(why).toContain("4 ml");
    });

    it("tolerates a duration inside the tolerance", () => {
        const b = brew({id: "b", endedAt: 150_000 + COMPARE_TIME_TOLERANCE_SECONDS * 1000});
        expect(pourVerdict(brew(), b).verdict).toBe("same");
    });

    it("calls a duration outside the tolerance a difference", () => {
        const late = (COMPARE_TIME_TOLERANCE_SECONDS + 3) * 1000;
        const b = brew({id: "b", endedAt: 150_000 + late});
        const {verdict, why} = pourVerdict(brew(), b);
        expect(verdict).toBe("differed");
        expect(why).toContain("8 seconds");
    });

    it("measures duration from the first drop, not from waking", () => {
        const a = brew({startedAt: 0, pouringAt: 10_000, endedAt: 150_000});
        const b = brew({id: "b", startedAt: 0, pouringAt: 70_000, endedAt: 210_000});
        expect(pourVerdict(a, b).verdict).toBe("same");
    });

    it("names a stall rather than calling it a difference", () => {
        const b = brew({id: "b", stalls: [[], [{atMl: 180, seconds: 12}]]});
        const {verdict, why} = pourVerdict(brew(), b);
        expect(verdict).toBe("stalled");
        expect(why).toContain("stalled");
    });

    it("puts an unfinished brew ahead of a stall", () => {
        const b = brew({
            id: "b", outcome: "cancelled", stalls: [[{atMl: 40, seconds: 9}]]
        });
        expect(pourVerdict(brew(), b).verdict).toBe("incomplete");
    });

    it("counts a brew ended on the machine as a finished one", () => {
        expect(pourVerdict(brew(), brew({id: "b", outcome: "endedOnMachine"})).verdict)
            .toBe("same");
    });

    it("falls back to startedAt on a row written before pouringAt existed", () => {
        const a = brew({pouringAt: undefined, startedAt: 10_000, endedAt: 150_000});
        expect(pourVerdict(a, brew({id: "b"})).verdict).toBe("same");
    });
});

function stage(over: Partial<PlanStage> = {}): PlanStage {
    return {
        pourNumber: 1, volume: 40, temperature: 93, flowRate: 40,
        agitation: 0, pourPattern: 0, pauseTime: 20, ...over
    };
}

describe("planDrift", () => {
    it("grades two identical plans as no drift", () => {
        expect(planDrift([stage()], [stage()])).toEqual({grade: "none", fields: []});
    });

    it.each([
        ["volume", {volume: 60}],
        ["flowRate", {flowRate: 32}],
        ["pauseTime", {pauseTime: 5}]
    ] as [string, Partial<PlanStage>][])(
        "grades a change of %s as shape drift, because it moves the line",
        (field, over) => {
            const drift = planDrift([stage()], [stage(over)]);
            expect(drift.grade).toBe("shape");
            expect(drift.fields).toContain(field);
        }
    );

    it.each([
        ["temperature", {temperature: 88}],
        ["pourPattern", {pourPattern: 1}],
        ["agitation", {agitation: 3}]
    ] as [string, Partial<PlanStage>][])(
        "grades a change of %s as detail drift, because the line is unmoved",
        (field, over) => {
            const drift = planDrift([stage()], [stage(over)]);
            expect(drift.grade).toBe("detail");
            expect(drift.fields).toContain(field);
        }
    );

    it("grades a different stage count as shape drift", () => {
        const drift = planDrift([stage()], [stage(), stage({pourNumber: 2})]);
        expect(drift.grade).toBe("shape");
        expect(drift.fields).toContain("stages");
    });

    it("lets shape outrank detail when both changed", () => {
        expect(planDrift([stage()], [stage({volume: 60, temperature: 88})]).grade)
            .toBe("shape");
    });

    it("reports no drift when a brew carries no plan at all", () => {
        expect(planDrift(undefined, [stage()])).toEqual({grade: "none", fields: []});
        expect(planDrift([stage()], undefined)).toEqual({grade: "none", fields: []});
    });
});

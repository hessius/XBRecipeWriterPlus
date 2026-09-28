import type {StoredBrew} from "@/library/BrewDatabase";
import {
    COMPARE_TIME_TOLERANCE_SECONDS,
    COMPARE_WATER_TOLERANCE_ML,
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

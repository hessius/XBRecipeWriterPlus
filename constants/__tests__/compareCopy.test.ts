import {
    COMPARE_COPY,
    COMPARE_DEGRADED,
    COMPARE_GUARD,
    COMPARE_PINNED,
    COMPARE_SELECTION_COPY,
    PLAN_FIELD_WORD,
    compareDriftSentence
} from "@/constants/brewCopy";
import {NOT_RECORDED, planDrift, type PourVerdict} from "@/library/brew/compare";

describe("compare copy", () => {
    const verdicts: PourVerdict[] =
        ["same", "stalled", "differed", "incomplete", "unwatched"];

    it("has a reading for every verdict", () => {
        for (const verdict of verdicts) {
            expect(COMPARE_COPY[verdict].chip.length).toBeGreaterThan(0);
        }
    });

    it("shouts the chip, as every other status chip does", () => {
        for (const verdict of verdicts) {
            const {chip} = COMPARE_COPY[verdict];
            expect(chip).toBe(chip.toUpperCase());
        }
    });

    // Every string the feature can show, not a hand listed three. Most of the
    // prose is in the guards and the drift sentences, and a dash added there
    // is exactly the one nobody would notice.
    it("uses no dashes anywhere, because they read as machine written", () => {
        const sentences = [
            ...verdicts.map((v) => COMPARE_COPY[v].chip),
            ...Object.values(COMPARE_DEGRADED),
            ...Object.values(COMPARE_GUARD).flatMap((g) => [g.title, g.body]),
            ...Object.values(COMPARE_SELECTION_COPY),
            ...Object.values(PLAN_FIELD_WORD),
            COMPARE_PINNED,
            NOT_RECORDED
        ];
        for (const line of sentences) {
            expect(line).not.toMatch(/[-\u2013\u2014]/);
        }
    });

    it("words a drift without showing the user a field name", () => {
        const stage = {
            pourNumber: 1, volume: 120, temperature: 93, flowRate: 3,
            pourPattern: 0, agitation: 0, pauseTime: 10
        };
        const counted = planDrift([stage], [stage, {...stage, pourNumber: 2}]);
        const shaped = planDrift([stage], [{...stage, flowRate: 5, pauseTime: 20}]);

        for (const drift of [counted, shaped]) {
            const line = compareDriftSentence(
                drift.grade as Exclude<typeof drift.grade, "none">,
                drift.fields as never
            );
            // The camelCase identifiers, not the English words. "different
            // numbers of stages" is a sentence; "differ in stages" is a leak.
            expect(line).not.toMatch(/flowRate|pauseTime|pourNumber|pourPattern/);
            expect(line).not.toMatch(/(differ|differs) in stages/);
            expect(line).not.toMatch(/[-\u2013\u2014]/);
        }
    });
});

import {COMPARE_COPY, COMPARE_DEGRADED} from "@/constants/brewCopy";
import type {PourVerdict} from "@/library/brew/compare";

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

    it("uses no dashes anywhere, because they read as machine written", () => {
        const all = [
            ...verdicts.flatMap((v) => [COMPARE_COPY[v].chip, COMPARE_COPY[v].tone]),
            ...Object.values(COMPARE_DEGRADED)
        ];
        for (const line of all) {
            expect(line).not.toMatch(/[-\u2013\u2014]/);
        }
    });
});

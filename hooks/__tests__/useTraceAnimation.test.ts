import {traceAnimationFor} from "@/hooks/useTraceAnimation";

describe("traceAnimationFor", () => {
    it("breathes while the machine is waking", () => {
        const at = (t: number) => traceAnimationFor("waking", t, true);
        // A 3.4 s cycle: opacity is not the same a second and a half in.
        expect(at(0).opacity).not.toBeCloseTo(at(1700).opacity, 2);
    });

    it("warms toward the accent at the peak of the breath", () => {
        const peak = traceAnimationFor("waking", 1700, true);
        expect(peak.warmth).toBeGreaterThan(traceAnimationFor("waking", 0, true).warmth);
    });

    it("travels a lit segment along the curve while sending", () => {
        const early = traceAnimationFor("sending", 200, true);
        const later = traceAnimationFor("sending", 900, true);
        expect(later.headAt).toBeGreaterThan(early.headAt);
    });

    it("keeps the travelling head inside the curve", () => {
        [0, 400, 1200, 5000].forEach((t) => {
            const {headAt} = traceAnimationFor("sending", t, true);
            expect(headAt).toBeGreaterThanOrEqual(0);
            expect(headAt).toBeLessThanOrEqual(1);
        });
    });

    it("fuses the dashes once the recipe is in the machine", () => {
        expect(traceAnimationFor("readyToStart", 0, true).dashed).toBe(false);
    });

    it("flickers rather than breathing while grinding", () => {
        // Intense, not pretty. Opacity is untouched; the colour is what moves.
        const a = traceAnimationFor("grinding", 0, true);
        const b = traceAnimationFor("grinding", 210, true);
        expect(a.opacity).toBe(b.opacity);
        expect(a.warmth).not.toBeCloseTo(b.warmth, 2);
    });

    it("holds an end state when motion is off", () => {
        // Not "no animation" — no status at all is worse than a still one.
        [0, 900, 1700, 3300].forEach((t) => {
            expect(traceAnimationFor("waking", t, false).opacity).toBe(1);
            expect(traceAnimationFor("sending", t, false).headAt).toBe(1);
            expect(traceAnimationFor("grinding", t, false).warmth).toBe(1);
        });
    });

    it("leaves the plan alone once the water is running", () => {
        const still = traceAnimationFor("pouring", 1200, true);
        expect(still).toEqual({opacity: 1, warmth: 0, headAt: 1, dashed: true});
    });
});

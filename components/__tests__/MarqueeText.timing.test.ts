import {marqueeDuration, MARQUEE_SPEED_PX_S, MARQUEE_MIN_MS}
    from "@/components/MarqueeText";

describe("marqueeDuration", () => {
    it("takes a constant time per pixel, so a long name is not rushed", () => {
        // 120 px at 40 px/s is three seconds. A fixed duration would make a
        // long name sprint and a short one crawl, which is what makes most
        // marquees hard to read.
        expect(marqueeDuration(120)).toBe(3000);
        expect(marqueeDuration(40)).toBe(1000);
    });

    it("never runs shorter than the floor, however small the overflow", () => {
        // A name overflowing by a few pixels would otherwise twitch.
        expect(marqueeDuration(1)).toBe(MARQUEE_MIN_MS);
    });

    it("keeps the floor well under a second so it never feels stuck", () => {
        expect(MARQUEE_MIN_MS).toBeLessThan(1000);
        expect(MARQUEE_SPEED_PX_S).toBeGreaterThan(0);
    });

    it("treats a name that fits as nothing to travel", () => {
        expect(marqueeDuration(0)).toBe(0);
        expect(marqueeDuration(-10)).toBe(0);
    });
});

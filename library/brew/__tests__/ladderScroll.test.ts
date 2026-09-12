import {minimalRevealOffset} from "@/library/brew/ladderScroll";

describe("minimalRevealOffset", () => {
    const base = {viewportHeight: 300, contentHeight: 600, offset: 100, rowHeight: 40, inset: 8};

    it("returns null when all content fits", () => {
        expect(minimalRevealOffset({...base, contentHeight: 300})).toBeNull();
    });

    it("returns null when the row is fully visible", () => {
        expect(minimalRevealOffset({...base, rowTop: 120})).toBeNull();
    });

    it("reveals a clipped top row", () => {
        expect(minimalRevealOffset({...base, rowTop: 90})).toBe(82);
    });

    it("reveals a clipped bottom row", () => {
        expect(minimalRevealOffset({...base, rowTop: 380})).toBe(128);
    });

    it("clamps the first rung to the top", () => {
        expect(minimalRevealOffset({...base, rowTop: 0, offset: 20})).toBe(0);
    });

    it("clamps the last valid rung to the bottom", () => {
        expect(minimalRevealOffset({...base, rowTop: 560, offset: 250})).toBe(300);
    });

    it("returns null when the viewport height is zero", () => {
        expect(minimalRevealOffset({...base, viewportHeight: 0})).toBeNull();
    });
});

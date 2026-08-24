import {coverRadius, revealStyle} from "@/components/AccentReveal";

describe("the reveal's reach", () => {
    it("reaches the far corner from a touch in the opposite one", () => {
        // The whole diagonal, because the finger was at one end of it.
        expect(coverRadius({x: 0, y: 0}, 300, 400)).toBe(500);
    });

    it("reaches the far corner from a touch in the middle", () => {
        // Half the diagonal. Measuring from the touch rather than assuming the
        // worst case is the difference between a reveal that arrives and one
        // that carries on expanding after the screen is covered.
        expect(coverRadius({x: 150, y: 200}, 300, 400)).toBe(250);
    });

    it("takes the farther edge on each axis, not the nearer one", () => {
        // Two thirds of the way across: the disc has to reach back to the left
        // edge, which is farther than the right one it is closer to.
        expect(coverRadius({x: 240, y: 0}, 300, 0)).toBe(240);
    });

    it("reaches a screen the touch is somehow off the edge of", () => {
        // A page can be scrolled and a card can be part way off it. Nothing
        // here should return a radius too small to cover the screen.
        expect(coverRadius({x: -50, y: 0}, 300, 0)).toBe(350);
    });
});

describe("the reveal's disc", () => {
    it("starts at nothing", () => {
        expect(revealStyle(0).transform[0].scale).toBe(0);
    });

    it("arrives at full size", () => {
        expect(revealStyle(1).transform[0].scale).toBe(1);
    });

    it("stays opaque while it is still covering ground", () => {
        // Unlike the morph, it has nothing underneath it that it matches, so
        // fading early would show the editor through a disc still travelling.
        expect(revealStyle(0.5).opacity).toBe(1);
        expect(revealStyle(0.8).opacity).toBe(1);
    });

    it("hands over to the screen underneath at the end", () => {
        expect(revealStyle(0.91).opacity).toBeCloseTo(0.5, 1);
        expect(revealStyle(1).opacity).toBe(0);
    });
});

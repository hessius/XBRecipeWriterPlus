import Recipe, {CUP_TYPE} from "@/library/Recipe";
import {accents} from "@/constants/colors";
import {accentGroupFor, assignAccentIndex, resolveAccent} from "@/library/accent";

function recipeWithCup(cup: number): Recipe {
    const r = new Recipe();
    r.cupType = cup;
    return r;
}

describe("accentGroupFor", () => {
    it("puts tea recipes in the tea group", () => {
        expect(accentGroupFor(recipeWithCup(CUP_TYPE.TEA))).toBe("tea");
    });

    it("puts every other cup type in the coffee group", () => {
        for (const cup of [CUP_TYPE.XPOD, CUP_TYPE.OMNI, CUP_TYPE.OTHER]) {
            expect(accentGroupFor(recipeWithCup(cup))).toBe("coffee");
        }
    });
});

describe("resolveAccent", () => {
    it("is stable for the same recipe across calls", () => {
        const r = recipeWithCup(CUP_TYPE.XPOD);
        expect(resolveAccent(r)).toBe(resolveAccent(r));
    });

    it("only ever draws a tea recipe from the tea half", () => {
        for (let i = 0; i < 200; i++) {
            expect(accents.tea).toContain(resolveAccent(recipeWithCup(CUP_TYPE.TEA)));
        }
    });

    it("only ever draws a coffee recipe from the coffee half", () => {
        for (let i = 0; i < 200; i++) {
            expect(accents.coffee).toContain(resolveAccent(recipeWithCup(CUP_TYPE.XPOD)));
        }
    });

    it("prefers a persisted index over the uuid fallback", () => {
        const r = recipeWithCup(CUP_TYPE.XPOD);
        (r as unknown as {accentIndex: number}).accentIndex = 3;
        expect(resolveAccent(r)).toBe(accents.coffee[3]);
    });

    it("ignores a persisted index that is out of range", () => {
        const r = recipeWithCup(CUP_TYPE.XPOD);
        (r as unknown as {accentIndex: number}).accentIndex = 99;
        expect(accents.coffee).toContain(resolveAccent(r));
    });
});

describe("assignAccentIndex", () => {
    it("returns zero when nothing is in use", () => {
        expect(assignAccentIndex("coffee", [])).toBe(0);
    });

    it("returns the first unused index while the palette has room", () => {
        expect(assignAccentIndex("coffee", [0, 1, 2])).toBe(3);
    });

    it("fills the lowest free index rather than appending", () => {
        expect(assignAccentIndex("coffee", [0, 2, 3])).toBe(1);
    });

    it("picks the least-used index once the palette is full", () => {
        // All eight used once, plus a second use of index 5. Index 5 is now the
        // most used, so it must not win; the lowest of the tied indices does.
        expect(assignAccentIndex("coffee", [0, 1, 2, 3, 4, 5, 6, 7, 5])).toBe(0);
    });

    it("breaks ties by lowest index", () => {
        expect(assignAccentIndex("coffee", [0, 0, 1, 2, 3, 4, 5, 6, 7])).toBe(1);
    });

    it("stays within the tea half", () => {
        expect(assignAccentIndex("tea", [0, 1, 2, 3])).toBeLessThan(accents.tea.length);
    });
});

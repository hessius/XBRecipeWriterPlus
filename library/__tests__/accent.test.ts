import Recipe, {CUP_TYPE} from "@/library/Recipe";
import {accents} from "@/constants/colors";
import {
    accentGroupFor,
    nextAccentIndex,
    resolveAccent,
    type RecipeWithAccent
} from "@/library/accent";

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

    it("follows the legacy tea cup types that Recipe migrates", () => {
        // 0x23 and 0x13 are tea cards written by the first app version with tea
        // support; the Recipe JSON constructor rewrites them to CUP_TYPE.TEA.
        // This pins that a migrated card lands in the tea half. It cannot fail
        // against a cupType comparison today, because isTea() is currently that
        // same comparison — the reason to call isTea() is that cupType has
        // needed normalising twice already, and the next such fix should reach
        // the palette without anyone remembering this file exists.
        const migrated = new Recipe(undefined, JSON.stringify({...new Recipe(), cupType: 0x23}));
        expect(accentGroupFor(migrated)).toBe("tea");
    });
});

describe("resolveAccent", () => {
    it("gives two instances of the same recipe the same colour", () => {
        // The property that matters: across a launch the recipe is a different
        // object rebuilt from JSON, and the card must not change colour. Calling
        // twice on one object would only prove the function is pure.
        const original = recipeWithCup(CUP_TYPE.XPOD);
        const reloaded = new Recipe(undefined, JSON.stringify(original));

        expect(reloaded.uuid).toBe(original.uuid);
        expect(resolveAccent(reloaded)).toBe(resolveAccent(original));
    });

    it("reaches every coffee accent across many recipes", () => {
        // This is what kills a hash that collapsed to a constant. With 8 buckets
        // and 200 draws, missing any bucket has probability ~2e-11.
        const seen = new Set<string>();
        for (let i = 0; i < 200; i++) {
            seen.add(resolveAccent(recipeWithCup(CUP_TYPE.XPOD)));
        }
        expect(seen.size).toBe(accents.coffee.length);
    });

    it("reaches every tea accent across many recipes", () => {
        const seen = new Set<string>();
        for (let i = 0; i < 200; i++) {
            seen.add(resolveAccent(recipeWithCup(CUP_TYPE.TEA)));
        }
        expect(seen.size).toBe(accents.tea.length);
    });

    it("never draws a tea recipe from the coffee half", () => {
        for (let i = 0; i < 50; i++) {
            expect(accents.tea).toContain(resolveAccent(recipeWithCup(CUP_TYPE.TEA)));
        }
    });

    it("prefers a persisted index over the uuid fallback", () => {
        const r = recipeWithCup(CUP_TYPE.XPOD);
        (r as RecipeWithAccent).accentIndex = 3;
        expect(resolveAccent(r)).toBe(accents.coffee[3]);
    });

    it.each([99, -1, 2.5, Number.NaN, "3", null, undefined])(
        "falls back to the uuid hash for the invalid persisted index %p",
        (bad) => {
            const r = recipeWithCup(CUP_TYPE.XPOD);
            (r as RecipeWithAccent).accentIndex = bad as number;
            // Not merely "does not throw": accents.coffee[2.5] is undefined, and
            // an undefined colour reaches a style prop and paints nothing.
            expect(accents.coffee).toContain(resolveAccent(r));
        }
    );
});

describe("nextAccentIndex", () => {
    it("returns zero when nothing is in use", () => {
        expect(nextAccentIndex("coffee", [])).toBe(0);
    });

    it("returns the first unused index while the palette has room", () => {
        expect(nextAccentIndex("coffee", [0, 1, 2])).toBe(3);
    });

    it("fills the lowest free index rather than appending", () => {
        expect(nextAccentIndex("coffee", [0, 2, 3])).toBe(1);
    });

    it("picks the least-used index once the palette is full", () => {
        // All eight used once, plus a second use of index 5. Index 5 is now the
        // most used, so it must not win; the lowest of the tied indices does.
        expect(nextAccentIndex("coffee", [0, 1, 2, 3, 4, 5, 6, 7, 5])).toBe(0);
    });

    it("breaks ties by lowest index", () => {
        expect(nextAccentIndex("coffee", [0, 0, 1, 2, 3, 4, 5, 6, 7])).toBe(1);
    });

    it("ignores indices outside the group", () => {
        // A caller holding indices from the larger coffee half must not be able
        // to skew the tea counts.
        expect(nextAccentIndex("tea", [0, 1, 2, 7, 99, -1])).toBe(3);
    });

    it("stays within the tea half", () => {
        expect(nextAccentIndex("tea", [0, 1, 2, 3])).toBeLessThan(accents.tea.length);
    });
});

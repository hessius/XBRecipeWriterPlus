import Recipe from "@/library/Recipe";

/**
 * A recipe with enough shape for the constructor to parse. `pours` is the one
 * key it dereferences without guarding, so it cannot be omitted.
 */
function json(extra: Record<string, unknown> = {}): string {
    return JSON.stringify({pours: [], ratio: 16, dosage: 18, ...extra});
}

describe("authored fields", () => {
    it("defaults to not favourite and no description", () => {
        const recipe = new Recipe(undefined, json());

        expect(recipe.favourite).toBe(false);
        expect(recipe.description).toBe("");
    });

    it("reads both when present", () => {
        const recipe = new Recipe(undefined, json({
            favourite:   true,
            description: "Bright and floral, works cold"
        }));

        expect(recipe.favourite).toBe(true);
        expect(recipe.description).toBe("Bright and floral, works cold");
    });

    it("ignores a value of the wrong type rather than throwing", () => {
        const recipe = new Recipe(undefined, json({
            favourite:   "yes",
            description: 42
        }));

        expect(recipe.favourite).toBe(false);
        expect(recipe.description).toBe("");
    });

    it("round-trips through JSON", () => {
        const first = new Recipe(undefined, json({
            favourite:   true,
            description: "Sunday morning"
        }));
        const second = new Recipe(undefined, JSON.stringify(first));

        expect(second.favourite).toBe(true);
        expect(second.description).toBe("Sunday morning");
    });

    it("takes no card bytes", () => {
        // The card is full and the format is not ours to extend, so an
        // authored field that reached getData would not just be wrong, it
        // would shift every byte after it and change the CRC. This is the
        // assertion that keeps metadata metadata.
        const plain = new Recipe(undefined, json());
        const marked = new Recipe(undefined, json({
            favourite:   true,
            description: "Sunday morning"
        }));

        expect(marked.getData(new Array(32).fill(0)))
            .toEqual(plain.getData(new Array(32).fill(0)));
    });
});

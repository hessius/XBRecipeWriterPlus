import Recipe from "../Recipe";
import Pour from "../Pour";
import {findDuplicate, copyName, resolveOnOpen} from "../duplicates";

function sample(): Recipe {
    const recipe = new Recipe();
    recipe.xid = "ABC123";
    recipe.ratio = 16;
    recipe.dosage = 18;
    recipe.grindSize = 45;
    recipe.pours = [new Pour(1, 200, 92, 3, 0, 0, 0)];
    return recipe;
}

describe("findDuplicate", () => {
    it("finds nothing in an empty library", () => {
        expect(findDuplicate([], sample())).toBeNull();
    });

    it("finds nothing when no stored recipe matches", () => {
        const other = sample();
        other.grindSize = 50;
        expect(findDuplicate([other], sample())).toBeNull();
    });

    it("finds a stored recipe that would write the same card", () => {
        const stored = sample();
        expect(findDuplicate([stored], sample())).toBe(stored);
    });

    it("returns the existing recipe, not the candidate", () => {
        // The caller reveals what it gets back. Returning the candidate would
        // scroll the list to a recipe that was never inserted.
        const stored = sample();
        stored.name = "Already Saved";
        expect(findDuplicate([stored], sample())?.name).toBe("Already Saved");
    });

    it("ignores a stored recipe with the same uuid as the candidate", () => {
        // Re-saving a recipe over itself is an update, not a duplicate.
        const stored = sample();
        const candidate = sample();
        candidate.uuid = stored.uuid;
        expect(findDuplicate([stored], candidate)).toBeNull();
    });

    it("treats a recipe whose bytes cannot be built as unique", () => {
        // A broken import should land in the library to be inspected, not
        // vanish into a de-duplication branch.
        const broken = sample();
        broken.getData = () => {
            throw new Error("malformed");
        };
        expect(findDuplicate([sample()], broken)).toBeNull();
    });

    it("skips a stored recipe whose bytes cannot be built", () => {
        const broken = sample();
        broken.getData = () => {
            throw new Error("malformed");
        };
        expect(findDuplicate([broken], sample())).toBeNull();
    });
});

describe("copyName", () => {
    it("marks the first copy", () => {
        expect(copyName("Ethiopia", [])).toBe("Ethiopia (Copy)");
    });

    it("numbers a second copy of the same name", () => {
        expect(copyName("Ethiopia", ["Ethiopia (Copy)"])).toBe("Ethiopia (Copy)(2)");
    });

    it("keeps counting past the second", () => {
        expect(copyName("Ethiopia", ["Ethiopia (Copy)", "Ethiopia (Copy)(2)"]))
            .toBe("Ethiopia (Copy)(3)");
    });

    it("ignores unrelated names, since titles are no longer unique", () => {
        // The old implementation scanned the entire library and refused any
        // colliding title. This one only looks at copies of the name being
        // copied, so two different recipes may still share a name.
        expect(copyName("Ethiopia", ["Kenya", "Kenya (Copy)"])).toBe("Ethiopia (Copy)");
    });

    it("copies an already-copied name without nesting the suffix", () => {
        expect(copyName("Ethiopia (Copy)", ["Ethiopia (Copy)"]))
            .toBe("Ethiopia (Copy)(2)");
    });

    it("leaves an empty name empty, so the placeholder still applies", () => {
        // A nameless recipe's copy should keep falling through to the
        // provenance placeholder rather than becoming literally " (Copy)".
        expect(copyName("", [])).toBe("");
    });
});

describe("resolveOnOpen", () => {
    it("opens the new recipe when the library has nothing like it", () => {
        const candidate = sample();
        expect(resolveOnOpen([], candidate)).toEqual({recipe: candidate, isExisting: false});
    });

    it("opens the stored recipe when it would write the same card", () => {
        const stored = sample();
        stored.name = "Already Saved";
        const result = resolveOnOpen([stored], sample());
        expect(result.recipe).toBe(stored);
        expect(result.isExisting).toBe(true);
    });

    it("does not modify the stored recipe", () => {
        // The reveal is read-only. Re-reading a card must not quietly restamp
        // the recipe the user already has.
        const stored = sample();
        stored.name = "Already Saved";
        stored.source = "import";
        resolveOnOpen([stored], sample());
        expect(stored.name).toBe("Already Saved");
        expect(stored.source).toBe("import");
    });

    it("opens the new recipe when the library holds a different one", () => {
        const other = sample();
        other.ratio = 18;
        const candidate = sample();
        expect(resolveOnOpen([other], candidate).recipe).toBe(candidate);
    });
});

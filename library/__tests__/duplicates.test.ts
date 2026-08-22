import Recipe from "../Recipe";
import Pour from "../Pour";
import {findDuplicate} from "../duplicates";

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

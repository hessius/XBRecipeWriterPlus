import Recipe from "../Recipe";
import {parseBackup, buildBackup} from "../backup";

describe("cloud fields on Recipe", () => {
    it("round-trips through JSON", async () => {
        const recipe = new Recipe(undefined, undefined);
        recipe.cloudId = 4242;
        recipe.cloudFingerprint = "abc123";

        const revived = new Recipe(undefined, JSON.stringify(recipe));

        expect(revived.cloudId).toBe(4242);
        expect(revived.cloudFingerprint).toBe("abc123");
    });

    it("is absent on a recipe that never came from an account", async () => {
        const recipe = new Recipe(undefined, undefined);
        expect(recipe.cloudId).toBeUndefined();
        expect(recipe.cloudFingerprint).toBeUndefined();
    });

    it("is not the same field as shareId or sharedTableId", async () => {
        const recipe = new Recipe(undefined, undefined);
        recipe.cloudId = 1;
        recipe.sharedTableId = 2;
        recipe.shareId = "three";

        const revived = new Recipe(undefined, JSON.stringify(recipe));
        expect(revived.cloudId).toBe(1);
        expect(revived.sharedTableId).toBe(2);
        expect(revived.shareId).toBe("three");
    });
});

describe("backup validation of the cloud fields", () => {
    const wrap = (recipe: unknown) =>
        JSON.stringify({
            ...JSON.parse(buildBackup([], {})),
            recipes: [recipe],
        });

    // `parseBackup` never throws — it returns a `{ok, ...}` result and reports a
    // bad recipe by skipping it, so a wrap with a single bad recipe comes back
    // `ok: false`. Asserting on that is what makes these load-bearing: a field
    // absent from `RECIPE_FIELDS` is never checked, so `looksLikeRecipe` would
    // let the malformed value through and the result would be `ok: true`.
    it("accepts a recipe carrying both fields", async () => {
        const recipe = new Recipe(undefined, undefined);
        recipe.cloudId = 9;
        recipe.cloudFingerprint = "deadbeef";

        const result = parseBackup(wrap(JSON.parse(JSON.stringify(recipe))));
        if (!result.ok) throw new Error(result.reason);
        expect(result.payload.recipes[0].cloudId).toBe(9);
        expect(result.payload.recipes[0].cloudFingerprint).toBe("deadbeef");
    });

    it("rejects a recipe whose cloudId is not a number", async () => {
        const recipe = JSON.parse(
            JSON.stringify(new Recipe(undefined, undefined))
        );
        recipe.cloudId = "nine";

        expect(parseBackup(wrap(recipe)).ok).toBe(false);
    });

    it("rejects a recipe whose cloudFingerprint is not a string", async () => {
        const recipe = JSON.parse(
            JSON.stringify(new Recipe(undefined, undefined))
        );
        recipe.cloudFingerprint = 7;

        expect(parseBackup(wrap(recipe)).ok).toBe(false);
    });

    it("rejects a negative cloudId, which no account row has", async () => {
        // A tableId is a primary key. A negative one is not a plausible value
        // that happens to be wrong; it is a file that has been tampered with.
        const recipe = JSON.parse(
            JSON.stringify(new Recipe(undefined, undefined))
        );
        recipe.cloudId = -1;

        expect(parseBackup(wrap(recipe)).ok).toBe(false);
    });
});

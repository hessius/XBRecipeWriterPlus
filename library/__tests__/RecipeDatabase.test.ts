import RecipeDatabase from "@/library/RecipeDatabase";
import Recipe from "@/library/Recipe";
// The `mock` prefix is what lets a jest.mock factory close over this binding:
// the factory is hoisted above the imports, so Jest rejects any out-of-scope
// reference that is not named as a mock. Same reason as mockBacking in
// RecipeDatabase.index.test.ts.
import {createTestDatabase as mockCreateTestDatabase} from "@/test-utils/sqlite";

jest.mock("expo-sqlite", () => ({
    // A real SQLite database per call, so each `new RecipeDatabase()` in a
    // test is isolated.
    openDatabaseSync: () => mockCreateTestDatabase()
}));
function freshDatabase(): RecipeDatabase {
    return new RecipeDatabase();
}

function recipeNamed(name: string): Recipe {
    const recipe = new Recipe();
    recipe.name = name;
    return recipe;
}

describe("RecipeDatabase", () => {
    describe("deleteAllRecipes", () => {
        it("empties the library", () => {
            const db = freshDatabase();
            db.insertRecipe(recipeNamed("A"));
            db.insertRecipe(recipeNamed("B"));

            db.deleteAllRecipes();

            expect(db.retrieveAllRecipes()).toBeNull();
        });

        it("is harmless on an empty library", () => {
            const db = freshDatabase();
            expect(() => db.deleteAllRecipes()).not.toThrow();
            expect(db.retrieveAllRecipes()).toBeNull();
        });
    });

    describe("replaceAllRecipes", () => {
        it("swaps the library for the given recipes", () => {
            const db = freshDatabase();
            db.insertRecipe(recipeNamed("old"));

            const fresh = [recipeNamed("A"), recipeNamed("B")];
            db.replaceAllRecipes(fresh);

            expect((db.retrieveAllRecipes() ?? []).map((r) => r.name).sort())
                .toEqual(["A", "B"]);
        });

        it("leaves the original library untouched when an insert throws", () => {
            // The heart of the critical fix: a replace must be all-or-nothing.
            // Two recipes sharing a uuid make the second insert throw
            // "Recipe already exists"; if the delete and the first insert were
            // not rolled back with it, the library would be emptied and half
            // filled — the exact data loss the backup feature exists to prevent.
            const db = freshDatabase();
            const survivor = recipeNamed("survivor");
            db.insertRecipe(survivor);

            const clash = recipeNamed("clash");
            const twin = recipeNamed("twin");
            twin.uuid = clash.uuid;

            expect(() => db.replaceAllRecipes([clash, twin])).toThrow();
            expect((db.retrieveAllRecipes() ?? []).map((r) => r.name))
                .toEqual(["survivor"]);
        });
    });

    describe("insertRecipes", () => {
        it("adds every recipe in the batch", () => {
            const db = freshDatabase();
            db.insertRecipes([recipeNamed("A"), recipeNamed("B")]);

            expect((db.retrieveAllRecipes() ?? []).map((r) => r.name).sort())
                .toEqual(["A", "B"]);
        });

        it("adds none of the batch when one insert throws", () => {
            const db = freshDatabase();
            db.insertRecipe(recipeNamed("existing"));

            const one = recipeNamed("one");
            const two = recipeNamed("two");
            two.uuid = one.uuid;

            expect(() => db.insertRecipes([one, two])).toThrow();
            expect((db.retrieveAllRecipes() ?? []).map((r) => r.name))
                .toEqual(["existing"]);
        });
    });
});

describe("duplicating a recipe", () => {
    /** An imported recipe: no name of its own, xBloom's name on the side. */
    function imported(): Recipe {
        const recipe = new Recipe();
        recipe.xbloomName = "Kenya Sakami";
        recipe.xid = "NLC001";
        recipe.source = "import";
        return recipe;
    }

    it("gives the copy a name that tells it apart from the original", () => {
        // The bug behind a library that filled up with what looked like the
        // same recipe six times. An imported recipe has an empty `name` --
        // xBloom's name lives in `xbloomName`, and `displayName()` falls
        // through to it. The copy was named from `name`, so it was named from
        // an empty string, stayed empty, and fell through to exactly the same
        // `xbloomName` as the original. Two rows, same title, nothing to tell
        // them apart -- so the user pressed duplicate again, and again.
        const database = new RecipeDatabase();
        const original = imported();
        database.insertRecipe(original);

        database.duplicateRecipe(original);

        const names = (database.retrieveAllRecipes() ?? []).map((r) => r.displayName());
        expect(names).toContain("Kenya Sakami");
        expect(names).toContain("Kenya Sakami (Copy)");
    });

    it("does not let a duplicate claim the original's account recipe", () => {
        // The import matches a local recipe to an account recipe by `cloudId`.
        // A duplicate that kept the id would leave two rows both claiming to
        // be the same xBloom recipe, and the next sync would have two
        // candidates for one account row and no basis to choose.
        const database = new RecipeDatabase();
        const original = imported();
        original.cloudId = 4242;
        original.cloudFingerprint = "abc123";
        database.insertRecipe(original);

        database.duplicateRecipe(original);

        const copy = (database.retrieveAllRecipes() ?? []).find(
            (r) => r.uuid !== original.uuid
        );
        expect(copy).toBeDefined();
        expect(copy!.cloudId).toBeUndefined();
        expect(copy!.cloudFingerprint).toBeUndefined();
        // The original is untouched -- it is still the one that came down.
        const kept = database.getRecipe(original.uuid);
        expect(kept?.cloudId).toBe(4242);
        expect(kept?.cloudFingerprint).toBe("abc123");
    });

    it("numbers further copies instead of repeating one name", () => {
        const database = new RecipeDatabase();
        const original = imported();
        database.insertRecipe(original);

        database.duplicateRecipe(original);
        database.duplicateRecipe(original);
        database.duplicateRecipe(original);

        const names = (database.retrieveAllRecipes() ?? []).map((r) => r.displayName());
        expect(new Set(names).size).toBe(names.length);
    });

    it("leaves a nameless recipe to its placeholder rather than inventing one", () => {
        // A card read with no name and no XID is shown as "Read 3 Sep", drawn
        // muted because it is a generated label and not a name anyone chose.
        // Copying it must not bake that label into the name field as though
        // the user had typed it.
        const database = new RecipeDatabase();
        const nameless = new Recipe();
        nameless.source = "read";
        database.insertRecipe(nameless);

        database.duplicateRecipe(nameless);

        const copy = (database.retrieveAllRecipes() ?? []).find((r) => r.source === "duplicate");
        expect(copy?.name).toBe("");
        expect(copy?.hasName()).toBe(false);
    });
});

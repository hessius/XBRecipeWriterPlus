import RecipeDatabase from "@/library/RecipeDatabase";
import Recipe from "@/library/Recipe";

/**
 * A minimal in-memory stand-in for expo-sqlite.
 *
 * expo-sqlite is a native module and has no working implementation under
 * Jest, so RecipeDatabase — which talks to it directly rather than through an
 * injectable storage seam — has never had a test harness. This mock only
 * needs to understand the handful of literal query shapes RecipeDatabase
 * actually sends: a single `recipes(uuid, recipeJSON)` table.
 */
type Row = {uuid: string; recipeJSON: string};

jest.mock("expo-sqlite", () => ({
    // A fresh store per call, so each `new RecipeDatabase()` in a test is
    // isolated from the others rather than sharing state through a single
    // module-level array.
    openDatabaseSync: () => {
        const rows: Row[] = [];
        return {
            execSync: () => {
                // Only ever a CREATE TABLE / PRAGMA; nothing to do in memory.
            },
            // A faithful-enough transaction: it snapshots the rows, runs the
            // task, and on any throw restores the snapshot before re-raising.
            // Without the rollback this mock could not tell an atomic replace
            // from a delete-then-loop, which is the whole point of the method
            // it is here to test.
            withTransactionSync: (task: () => void) => {
                const snapshot = rows.map((row) => ({...row}));
                try {
                    task();
                } catch (error) {
                    rows.length = 0;
                    rows.push(...snapshot);
                    throw error;
                }
            },
            runSync: (source: string, params: unknown[] = []) => {
                if (/^\s*INSERT INTO recipes/i.test(source)) {
                    rows.push({uuid: params[0] as string, recipeJSON: params[1] as string});
                } else if (/^\s*UPDATE recipes/i.test(source)) {
                    const row = rows.find((r) => r.uuid === params[1]);
                    if (row) row.recipeJSON = params[0] as string;
                } else if (/^\s*DELETE\s+FROM\s+recipes\s+WHERE/i.test(source)) {
                    const index = rows.findIndex((r) => r.uuid === params[0]);
                    if (index !== -1) rows.splice(index, 1);
                } else if (/^\s*DELETE\s+FROM\s+recipes\s*;?\s*$/i.test(source)) {
                    rows.length = 0;
                }
                return {changes: 0, lastInsertRowId: 0};
            },
            getFirstSync: (source: string, params: unknown[] = []) => {
                if (/WHERE uuid = \?/i.test(source)) {
                    return rows.find((r) => r.uuid === params[0]) ?? null;
                }
                return rows[0] ?? null;
            },
            getAllSync: () => rows.slice()
        };
    }
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

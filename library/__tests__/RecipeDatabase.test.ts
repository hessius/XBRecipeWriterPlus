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
});

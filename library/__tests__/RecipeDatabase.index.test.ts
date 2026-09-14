import {createTestDatabase, type FakeSQLiteDatabase} from "@/test-utils/sqlite";
import {INDEX_COLUMNS} from "@/library/recipeIndex";

/**
 * Unlike RecipeDatabase.test.ts, these tests need to reach the underlying
 * database directly — to build a pre-refactor schema before RecipeDatabase
 * opens it, and to inspect columns afterwards. One shared instance per test,
 * reset between them.
 */
let mockBacking: FakeSQLiteDatabase;

jest.mock("expo-sqlite", () => ({
    openDatabaseSync: () => mockBacking
}));

// Imported after the mock so the module picks it up. import/first is disabled
// deliberately: moving these to the top would bind RecipeDatabase to the real
// expo-sqlite before jest.mock replaces it.
/* eslint-disable import/first */
import RecipeDatabase from "@/library/RecipeDatabase";
import Recipe from "@/library/Recipe";
/* eslint-enable import/first */

beforeEach(() => {
    mockBacking = createTestDatabase();
});

function columnNames(): string[] {
    return (mockBacking.getAllSync("PRAGMA table_info(recipes);") as {name: string}[])
        .map((row) => row.name);
}

describe("schema creation", () => {
    it("creates every declared index column", () => {
        new RecipeDatabase();
        const names = columnNames();
        expect(names).toContain("uuid");
        expect(names).toContain("recipeJSON");
        for (const column of INDEX_COLUMNS) expect(names).toContain(column.name);
    });

    it("creates the tag and metadata tables", () => {
        new RecipeDatabase();
        const tables = (mockBacking.getAllSync(
            "SELECT name FROM sqlite_master WHERE type = 'table';"
        ) as {name: string}[]).map((row) => row.name);
        expect(tables).toContain("recipe_tags");
        expect(tables).toContain("schema_meta");
    });

    it("creates an index for every indexed column", () => {
        new RecipeDatabase();
        const indices = (mockBacking.getAllSync(
            "SELECT name FROM sqlite_master WHERE type = 'index';"
        ) as {name: string}[]).map((row) => row.name);
        for (const column of INDEX_COLUMNS.filter((c) => c.indexed)) {
            expect(indices).toContain(`idx_recipes_${column.name}`);
        }
    });

    it("is idempotent across opens", () => {
        // ALTER TABLE ADD COLUMN throws on a duplicate; IF NOT EXISTS is not
        // portable across the SQLite versions Expo ships, so the failure is
        // caught instead. This is the test that catches that going wrong.
        new RecipeDatabase();
        const first = columnNames();
        expect(() => new RecipeDatabase()).not.toThrow();
        expect(columnNames()).toEqual(first);
    });

    it("tolerates an orphan column left by a retired descriptor", () => {
        new RecipeDatabase();
        mockBacking.execSync("ALTER TABLE recipes ADD COLUMN retiredThing TEXT;");

        const db = new RecipeDatabase();
        const recipe = new Recipe();
        recipe.name = "Still works";
        db.insertRecipe(recipe);

        expect((db.retrieveAllRecipes() ?? []).map((r) => r.name)).toEqual(["Still works"]);
    });
});

type IndexRow = {
    uuid: string;
    sortName: string | null;
    pourCount: number;
    isTea: number;
};

function indexRows(): IndexRow[] {
    return mockBacking.getAllSync(
        "SELECT uuid, sortName, pourCount, isTea FROM recipes ORDER BY uuid;"
    ) as IndexRow[];
}

function tagRows(): {uuid: string; tag: string}[] {
    return mockBacking.getAllSync(
        "SELECT uuid, tag FROM recipe_tags ORDER BY uuid, tag;"
    ) as {uuid: string; tag: string}[];
}

describe("write path", () => {
    it("indexes a recipe on insert", () => {
        const db = new RecipeDatabase();
        const recipe = new Recipe();
        recipe.name = "Morning";
        db.insertRecipe(recipe);

        expect(indexRows()).toEqual([
            {uuid: recipe.uuid, sortName: "Morning", pourCount: 0, isTea: 0}
        ]);
    });

    it("reindexes on update", () => {
        const db = new RecipeDatabase();
        const recipe = new Recipe();
        recipe.name = "Before";
        db.insertRecipe(recipe);

        recipe.name = "After";
        db.updateRecipe(recipe.uuid, recipe);

        expect(indexRows()[0].sortName).toBe("After");
    });

    it("stores tags on insert", () => {
        const db = new RecipeDatabase();
        const recipe = new Recipe();
        recipe.name = "Tagged";
        recipe.setTags(["morning", "filter"]);
        db.insertRecipe(recipe);

        expect(tagRows().map((r) => r.tag)).toEqual(["filter", "morning"]);
    });

    it("replaces tags on update rather than accumulating them", () => {
        const db = new RecipeDatabase();
        const recipe = new Recipe();
        recipe.name = "Tagged";
        recipe.setTags(["morning"]);
        db.insertRecipe(recipe);

        recipe.setTags(["evening"]);
        db.updateRecipe(recipe.uuid, recipe);

        expect(tagRows().map((r) => r.tag)).toEqual(["evening"]);
    });

    it("removes tags when the recipe is deleted", () => {
        const db = new RecipeDatabase();
        const recipe = new Recipe();
        recipe.name = "Tagged";
        recipe.setTags(["morning"]);
        db.insertRecipe(recipe);

        db.deleteRecipe(recipe.uuid);

        expect(tagRows()).toEqual([]);
    });

    it("removes every tag when the library is emptied", () => {
        const db = new RecipeDatabase();
        for (const name of ["A", "B"]) {
            const recipe = new Recipe();
            recipe.name = name;
            recipe.setTags([name.toLowerCase()]);
            db.insertRecipe(recipe);
        }

        db.deleteAllRecipes();

        expect(tagRows()).toEqual([]);
    });

    it("finds tags case-insensitively", () => {
        // recipe_tags.tag is collated NOCASE so that filtering agrees with
        // Recipe.setTags' case-insensitive dedupe.
        const db = new RecipeDatabase();
        const recipe = new Recipe();
        recipe.name = "Tagged";
        recipe.setTags(["Espresso"]);
        db.insertRecipe(recipe);

        const found = mockBacking.getAllSync(
            "SELECT uuid FROM recipe_tags WHERE tag = ?;", ["ESPRESSO"]
        );
        expect(found).toHaveLength(1);
    });

    it("rolls back the index and the tags, not just the blob", () => {
        // The existing rollback tests in RecipeDatabase.test.ts assert only
        // that the blob survives. This pins the invariant the write path
        // exists for: a row must never keep an index or tags describing a
        // recipe its blob no longer matches. Without this, a regression in
        // tag-delete ordering or index atomicity would leave the blob correct
        // and pass every other test.
        const db = new RecipeDatabase();
        const kept = new Recipe();
        kept.name = "Kept";
        kept.setTags(["keep"]);
        db.insertRecipe(kept);

        const doomed = new Recipe();
        doomed.name = "Doomed";
        doomed.setTags(["gone"]);

        expect(() =>
            db.replaceAllRecipes([
                doomed,
                // A recipe that throws on serialisation aborts the batch.
                {
                    get uuid(): string {
                        throw new Error("boom");
                    }
                } as unknown as Recipe
            ])
        ).toThrow();

        expect(indexRows().map((r) => r.sortName)).toEqual(["Kept"]);
        expect(tagRows().map((r) => r.tag)).toEqual(["keep"]);
    });
});

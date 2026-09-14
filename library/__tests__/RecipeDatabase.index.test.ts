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

// Imported after the mock so the module picks it up.
import RecipeDatabase from "@/library/RecipeDatabase";
import Recipe from "@/library/Recipe";

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

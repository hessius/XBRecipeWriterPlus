import {createTestDatabase, type FakeSQLiteDatabase} from "@/test-utils/sqlite";

/**
 * One unreadable blob must not take the whole library down (#124).
 *
 * The backing database is built by hand so a row whose JSON will not parse can
 * be inserted directly, which the public API never lets a caller do. The
 * `mock`-prefix on the shared instance is what a jest.mock factory is allowed
 * to close over, matching RecipeDatabase.index.test and .migration.test.
 */
let mockBacking: FakeSQLiteDatabase;

jest.mock("expo-sqlite", () => ({
    openDatabaseSync: () => mockBacking
}));

/* eslint-disable import/first */
import RecipeDatabase from "@/library/RecipeDatabase";
import Recipe from "@/library/Recipe";
import type {LibraryQuery} from "@/library/libraryQuery";
/* eslint-enable import/first */

const WHOLE_LIBRARY: LibraryQuery = {
    search: "",
    filters: [],
    sort: "name",
    direction: "asc",
    favouritesFirst: false
};

function recipeNamed(name: string): Recipe {
    const recipe = new Recipe();
    recipe.name = name;
    return recipe;
}

/** Put a blob straight into the table, past every guard the class applies. */
function insertRawBlob(uuid: string, recipeJSON: string): void {
    mockBacking.runSync(
        "INSERT INTO recipes (uuid, recipeJSON) VALUES (?, ?);",
        [uuid, recipeJSON]
    );
}

beforeEach(() => {
    mockBacking = createTestDatabase();
});

describe("a library with one unreadable blob", () => {
    it("renders every recipe that can be read and skips the one that cannot", () => {
        const db = new RecipeDatabase();
        db.insertRecipe(recipeNamed("Alpha"));
        db.insertRecipe(recipeNamed("Bravo"));
        insertRawBlob("corrupt-uuid", "{not json");

        const found = db.queryRecipes(WHOLE_LIBRARY).map((r) => r.name).sort();

        expect(found).toEqual(["Alpha", "Bravo"]);
    });

    it("counts the rows it could not read, matching what the list skips", () => {
        const db = new RecipeDatabase();
        db.insertRecipe(recipeNamed("Alpha"));
        insertRawBlob("corrupt-one", "{not json");
        insertRawBlob("corrupt-two", "also not json");

        const rendered = db.queryRecipes(WHOLE_LIBRARY).length;

        expect(rendered).toBe(1);
        expect(db.countUnreadableRecipes()).toBe(2);
    });

    it("reports none unreadable when every blob parses", () => {
        const db = new RecipeDatabase();
        db.insertRecipe(recipeNamed("Alpha"));

        expect(db.countUnreadableRecipes()).toBe(0);
    });

    it("refuses to build a backup rather than shipping a partial one", () => {
        const db = new RecipeDatabase();
        db.insertRecipe(recipeNamed("Alpha"));
        insertRawBlob("corrupt-uuid", "{not json");

        expect(() => db.retrieveAllRecipes()).toThrow();
    });
});

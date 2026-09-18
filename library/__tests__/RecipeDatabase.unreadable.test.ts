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

/**
 * A blob that parses and is still unusable.
 *
 * Built from a real recipe so every field the constructor reads is there, and
 * only `name` is the wrong type. A partial blob would throw in the constructor
 * instead, which is the unparseable case, and a test that took that path would
 * pass without proving anything about this one.
 */
function brokenBlobFor(name: string): string {
    const blob = JSON.parse(JSON.stringify(recipeNamed(name))) as
        Record<string, unknown>;
    blob.uuid = "broken-uuid";
    blob.name = 5;
    return JSON.stringify(blob);
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

/**
 * A blob can parse and still be unusable.
 *
 * `Recipe` preserves some wrong field types rather than coercing them, so
 * `{"name": 5}` constructs without complaint and throws the first time
 * anything calls `name.trim()` -- which `hasName()` does on every row the
 * library draws. Parsing is therefore the wrong test for "can this row be
 * shown". Projecting it is, because it is the same work `writeRow` does for
 * every row the app itself stores, so a row that cannot be projected is a row
 * the app could not have written.
 */
describe("a blob that parses but cannot be used", () => {
    function brokenBlob(): string {
        return brokenBlobFor("Alpha");
    }

    it("is skipped by the list rather than crashing it", () => {
        const db = new RecipeDatabase();
        db.insertRecipe(recipeNamed("Alpha"));
        insertRawBlob("broken-uuid", brokenBlob());

        const found = db.queryRecipes(WHOLE_LIBRARY).map((r) => r.name);

        expect(found).toEqual(["Alpha"]);
    });

    it("is counted as unreadable, so the count matches what the list skips", () => {
        const db = new RecipeDatabase();
        db.insertRecipe(recipeNamed("Alpha"));
        insertRawBlob("broken-uuid", brokenBlob());

        expect(db.countUnreadableRecipes()).toBe(1);
    });

    it("makes a backup refuse, exactly as an unparseable one does", () => {
        const db = new RecipeDatabase();
        db.insertRecipe(recipeNamed("Alpha"));
        insertRawBlob("broken-uuid", brokenBlob());

        expect(() => db.retrieveAllRecipes()).toThrow();
    });
});

/**
 * The exit from the dead end the reviewer found: a backup refuses while an
 * unreadable row is there, and the only other way out was to delete the whole
 * library. Removing exactly the rows that cannot be read is the small door.
 */
describe("removing the rows that cannot be read", () => {
    it("takes the unreadable rows and leaves the rest", () => {
        const db = new RecipeDatabase();
        db.insertRecipe(recipeNamed("Alpha"));
        insertRawBlob("corrupt-uuid", "{not json");
        insertRawBlob("broken-uuid", brokenBlobFor("Alpha"));

        expect(db.deleteUnreadableRecipes()).toBe(2);
        expect(db.countUnreadableRecipes()).toBe(0);
        expect(db.queryRecipes(WHOLE_LIBRARY).map((r) => r.name)).toEqual(["Alpha"]);
    });

    it("lets a backup be built again", () => {
        const db = new RecipeDatabase();
        db.insertRecipe(recipeNamed("Alpha"));
        insertRawBlob("corrupt-uuid", "{not json");

        db.deleteUnreadableRecipes();

        expect(db.retrieveAllRecipes()?.map((r) => r.name)).toEqual(["Alpha"]);
    });

    it("removes nothing from a healthy library", () => {
        const db = new RecipeDatabase();
        db.insertRecipe(recipeNamed("Alpha"));

        expect(db.deleteUnreadableRecipes()).toBe(0);
        expect(db.queryRecipes(WHOLE_LIBRARY)).toHaveLength(1);
    });
});

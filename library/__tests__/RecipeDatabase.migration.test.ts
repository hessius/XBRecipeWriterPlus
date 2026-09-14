import {createTestDatabase, type FakeSQLiteDatabase} from "@/test-utils/sqlite";

/**
 * The backing database is built by hand in each test so RecipeDatabase can be
 * opened against a pre-index schema. Jest requires the name referenced from a
 * jest.mock factory to be `mock`-prefixed, matching RecipeDatabase.index.test.
 */
let mockBacking: FakeSQLiteDatabase;

jest.mock("expo-sqlite", () => ({
    openDatabaseSync: () => mockBacking
}));

// Imported after the mock so RecipeDatabase binds to the mocked expo-sqlite
// rather than the real one. import/first is disabled deliberately: moving this
// to the top would defeat the mock.
/* eslint-disable import/first */
import RecipeDatabase from "@/library/RecipeDatabase";
/* eslint-enable import/first */

/** The exact DDL RecipeDatabase used before the index existed. */
function buildLegacyDatabase(blobs: string[]): void {
    mockBacking = createTestDatabase();
    mockBacking.execSync(
        "CREATE TABLE IF NOT EXISTS recipes (uuid TEXT PRIMARY KEY NOT NULL,recipeJSON TEXT);"
    );
    for (const blob of blobs) {
        mockBacking.runSync("INSERT INTO recipes (uuid, recipeJSON) VALUES (?, ?);", [
            JSON.parse(blob).uuid,
            blob
        ]);
    }
}

/**
 * A recipe as an older version of the app would have written it: a legacy tea
 * cup byte, pours stored as JSON strings inside the array, `title` instead of
 * `name`, and no createdAt, source, accentIndex or tags.
 */
function legacyBlob(uuid: string, title: string, cupType: number): string {
    return JSON.stringify({
        uuid,
        title,
        cupType,
        ratio: 16,
        dosage: 15,
        grindSize: 60,
        grindRPM: 120,
        pours: [JSON.stringify({pourNumber: 0, volume: 120, temperature: 93})]
    });
}

describe("migrating a pre-index database", () => {
    it("indexes every existing recipe on first open", () => {
        buildLegacyDatabase([
            legacyBlob("uuid-a", "Legacy Coffee", 0),
            legacyBlob("uuid-b", "Legacy Tea", 0x13)
        ]);

        new RecipeDatabase();

        const rows = mockBacking.getAllSync(
            "SELECT uuid, sortName, isTea, pourCount, totalVolume FROM recipes ORDER BY uuid;"
        ) as {uuid: string; sortName: string; isTea: number; pourCount: number; totalVolume: number}[];

        expect(rows).toEqual([
            {uuid: "uuid-a", sortName: "Legacy Coffee", isTea: 0, pourCount: 1, totalVolume: 120},
            {uuid: "uuid-b", sortName: "Legacy Tea", isTea: 1, pourCount: 1, totalVolume: 120}
        ]);
    });

    it("keeps every recipe readable and loses none", () => {
        buildLegacyDatabase([
            legacyBlob("uuid-a", "Legacy Coffee", 0),
            legacyBlob("uuid-b", "Legacy Tea", 0x13)
        ]);

        const db = new RecipeDatabase();
        const recipes = db.retrieveAllRecipes() ?? [];

        expect(recipes).toHaveLength(2);
        expect(recipes.map((r) => r.displayName()).sort())
            .toEqual(["Legacy Coffee", "Legacy Tea"]);
    });

    it("preserves the legacy migrations Recipe performs", () => {
        // title -> name, the 0x13 tea byte, and pours-as-strings all live in
        // the Recipe constructor. The index must not bypass or break them.
        buildLegacyDatabase([legacyBlob("uuid-b", "Legacy Tea", 0x13)]);

        const recipe = new RecipeDatabase().getRecipe("uuid-b");

        expect(recipe).not.toBeNull();
        expect(recipe!.name).toBe("Legacy Tea");
        expect(recipe!.isTea()).toBe(true);
        expect(recipe!.pours).toHaveLength(1);
        expect(recipe!.pours[0].volume).toBe(120);
    });

    it("gives every legacy recipe an empty tag set", () => {
        buildLegacyDatabase([legacyBlob("uuid-a", "Legacy Coffee", 0)]);

        new RecipeDatabase();

        expect(mockBacking.getAllSync("SELECT * FROM recipe_tags;")).toEqual([]);
        expect(new RecipeDatabase().getRecipe("uuid-a")!.tags).toEqual([]);
    });

    it("is safe to open repeatedly", () => {
        buildLegacyDatabase([legacyBlob("uuid-a", "Legacy Coffee", 0)]);

        new RecipeDatabase();
        new RecipeDatabase();
        const db = new RecipeDatabase();

        expect(db.retrieveAllRecipes()).toHaveLength(1);
        expect(mockBacking.getAllSync("SELECT * FROM recipe_tags;")).toEqual([]);
    });
});

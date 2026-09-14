import {createTestDatabase, type FakeSQLiteDatabase} from "@/test-utils/sqlite";
import {INDEX_COLUMNS, schemaHash} from "@/library/recipeIndex";

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
import Recipe, {CUP_TYPE} from "@/library/Recipe";
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

function storedHash(): string | null {
    const row = mockBacking.getFirstSync(
        "SELECT value FROM schema_meta WHERE key = 'indexHash';"
    ) as {value: string} | null;
    return row ? row.value : null;
}

describe("rebuild", () => {
    it("records the schema hash on first open", () => {
        new RecipeDatabase();
        expect(storedHash()).toBe(schemaHash());
    });

    it("rebuilds the index when the stored hash is stale", () => {
        const db = new RecipeDatabase();
        const recipe = new Recipe();
        recipe.name = "Morning";
        recipe.setTags(["filter"]);
        db.insertRecipe(recipe);

        // Simulate a descriptor change: blank the index and stale the hash,
        // leaving the blob untouched.
        mockBacking.runSync("UPDATE recipes SET sortName = NULL, pourCount = NULL;");
        mockBacking.runSync("DELETE FROM recipe_tags;");
        mockBacking.runSync("UPDATE schema_meta SET value = 'stale' WHERE key = 'indexHash';");

        new RecipeDatabase();

        expect(indexRows()[0].sortName).toBe("Morning");
        expect(tagRows().map((r) => r.tag)).toEqual(["filter"]);
        expect(storedHash()).toBe(schemaHash());
    });

    it("does not rebuild when the hash matches", () => {
        const db = new RecipeDatabase();
        const recipe = new Recipe();
        recipe.name = "Morning";
        db.insertRecipe(recipe);

        // A value no projection would produce. If it survives the next open,
        // no rebuild ran.
        mockBacking.runSync("UPDATE recipes SET sortName = 'UNTOUCHED';");
        new RecipeDatabase();

        expect(indexRows()[0].sortName).toBe("UNTOUCHED");
    });

    it("never writes the blob during a rebuild", () => {
        const db = new RecipeDatabase();
        const recipe = new Recipe();
        recipe.name = "Morning";
        db.insertRecipe(recipe);
        const before = (mockBacking.getFirstSync(
            "SELECT recipeJSON FROM recipes;"
        ) as {recipeJSON: string}).recipeJSON;

        mockBacking.runSync("UPDATE schema_meta SET value = 'stale' WHERE key = 'indexHash';");
        new RecipeDatabase();

        const after = (mockBacking.getFirstSync(
            "SELECT recipeJSON FROM recipes;"
        ) as {recipeJSON: string}).recipeJSON;
        expect(after).toBe(before);
    });

    it("never writes a legacy blob during a rebuild", () => {
        // The test above uses a current blob, which survives a
        // parse-and-reserialise round trip byte-identical -- so on its own it
        // cannot tell reindexRow from writeRow. Verified by mutation: swapping
        // one for the other leaves it green. A legacy blob is the difference.
        //
        // This matters because a rebuild touches every recipe at once. If it
        // re-serialised, a regression in Recipe's serialisation would rewrite
        // the whole library in a single pass, with no backup taken. Lazy
        // migration on read is the existing mechanism and stays that way.
        const db = new RecipeDatabase();
        const recipe = new Recipe();
        recipe.name = "Legacy";
        db.insertRecipe(recipe);

        // cupType 0x13 is a first-generation tea card; the Recipe constructor
        // folds it to 0x03 on read. Re-serialising would persist the folded
        // value and the blob would no longer be what the user's file holds.
        const legacy = JSON.stringify({
            ...JSON.parse(
                (mockBacking.getFirstSync(
                    "SELECT recipeJSON FROM recipes;"
                ) as {recipeJSON: string}).recipeJSON
            ),
            cupType: 0x13
        });
        mockBacking.runSync("UPDATE recipes SET recipeJSON = ?;", [legacy]);
        mockBacking.runSync("UPDATE schema_meta SET value = 'stale' WHERE key = 'indexHash';");

        new RecipeDatabase();

        const after = (mockBacking.getFirstSync(
            "SELECT recipeJSON FROM recipes;"
        ) as {recipeJSON: string}).recipeJSON;
        expect(JSON.parse(after).cupType).toBe(0x13);
        expect(after).toBe(legacy);

        // The index still reflects the migrated reading, which is the point:
        // the projection sees tea, the blob stays as the user's file has it.
        expect(indexRows()[0].isTea).toBe(1);
    });

    it("leaves the hash unstored when a rebuild fails, so the next open retries", () => {
        const db = new RecipeDatabase();
        const recipe = new Recipe();
        recipe.name = "Morning";
        db.insertRecipe(recipe);

        mockBacking.runSync("UPDATE schema_meta SET value = 'stale' WHERE key = 'indexHash';");
        // A blob that Recipe cannot parse at all makes the rebuild throw.
        mockBacking.runSync("UPDATE recipes SET recipeJSON = '{{{';");

        expect(() => new RecipeDatabase()).toThrow();
        expect(storedHash()).toBe("stale");
    });
});

describe("accent assignment", () => {
    it("gives successive recipes different accents", () => {
        const db = new RecipeDatabase();
        const first = new Recipe();
        first.name = "A";
        const second = new Recipe();
        second.name = "B";

        db.insertRecipe(first);
        db.insertRecipe(second);

        const accents = (db.retrieveAllRecipes() ?? []).map((r) => r.accentIndex);
        expect(new Set(accents).size).toBe(2);
    });

    it("counts only recipes in the same half of the palette", () => {
        const db = new RecipeDatabase();
        const coffee = new Recipe();
        coffee.name = "Coffee";
        const tea = new Recipe();
        tea.name = "Tea";
        // CUP_TYPE.TEA (0x03), not the legacy 0x13 byte: the 0x13 -> 0x03 fold
        // lives in the JSON constructor, so a value set directly on an
        // in-memory Recipe stays 0x13 and isTea() reads it as coffee. A genuine
        // in-memory tea recipe carries 0x03.
        tea.cupType = CUP_TYPE.TEA;

        db.insertRecipe(coffee);
        db.insertRecipe(tea);

        // Separate palettes, so both take index 0.
        expect(db.getRecipe(coffee.uuid)!.accentIndex).toBe(0);
        expect(db.getRecipe(tea.uuid)!.accentIndex).toBe(0);
    });

    it("does not move an accent the recipe already holds", () => {
        // The colour the user edits under is the colour the library row gets.
        // A save must not renumber it -- and the recipe must not be counted as
        // competition for the colour it is already using.
        const db = new RecipeDatabase();
        const recipe = new Recipe();
        recipe.name = "Settled";
        db.insertRecipe(recipe);
        const original = db.getRecipe(recipe.uuid)!.accentIndex;

        recipe.name = "Renamed";
        db.updateRecipe(recipe.uuid, recipe);

        expect(db.getRecipe(recipe.uuid)!.accentIndex).toBe(original);
    });

    it("reassigns when a recipe crosses between coffee and tea", () => {
        // Crossing is what makes the old index name a colour in the wrong
        // half, so moving it then is correct rather than a broken promise.
        const db = new RecipeDatabase();
        const filler = new Recipe();
        filler.name = "Filler";
        filler.cupType = 0x13;
        db.insertRecipe(filler);

        const crossing = new Recipe();
        crossing.name = "Crossing";
        db.insertRecipe(crossing);
        crossing.accentIndex = 999; // invalid for either half

        crossing.cupType = 0x13;
        db.updateRecipe(crossing.uuid, crossing);

        const settled = db.getRecipe(crossing.uuid)!.accentIndex!;
        expect(settled).toBeGreaterThanOrEqual(0);
        expect(settled).not.toBe(999);
    });
});

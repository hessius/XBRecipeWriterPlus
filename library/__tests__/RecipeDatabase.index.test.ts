import {createTestDatabase, type FakeSQLiteDatabase} from "@/test-utils/sqlite";
import {INDEX_COLUMNS, schemaHash} from "@/library/recipeIndex";
import {tagKey} from "@/library/tagKey";

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
import {resolveStockFilter, STOCK_FILTER_ORDER} from "@/library/libraryFilters";
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
        const db = new RecipeDatabase();
        const recipe = new Recipe();
        recipe.name = "Tagged";
        recipe.setTags(["Espresso"]);
        db.insertRecipe(recipe);

        const found = mockBacking.getAllSync(
            "SELECT uuid FROM recipe_tags WHERE tagKey = ?;", [tagKey("ESPRESSO")]
        );
        expect(found).toHaveLength(1);
    });

    it("finds a tag whose case folds outside ASCII", () => {
        // The reason the lookup key is computed in JavaScript rather than left
        // to a collation. SQLite's NOCASE folds ASCII only, so it considers
        // CAFE and cafe equal and CAFÉ and café different. Recipe.normaliseTags
        // uses toLowerCase(), which folds both. With NOCASE the model and the
        // table disagreed for exactly the tags a non-English user would write:
        // setTags would treat two spellings as one tag while a filter found
        // neither.
        const db = new RecipeDatabase();
        const recipe = new Recipe();
        recipe.name = "Tagged";
        recipe.setTags(["CAFÉ"]);
        db.insertRecipe(recipe);

        const found = mockBacking.getAllSync(
            "SELECT uuid FROM recipe_tags WHERE tagKey = ?;", [tagKey("café")]
        );
        expect(found).toHaveLength(1);
    });

    it("keeps the spelling the user typed", () => {
        // The key is for matching, not for display. A shelf named from a tag
        // has to read the way the user wrote it.
        const db = new RecipeDatabase();
        const recipe = new Recipe();
        recipe.name = "Tagged";
        recipe.setTags(["CAFÉ"]);
        db.insertRecipe(recipe);

        expect(tagRows().map((r) => r.tag)).toEqual(["CAFÉ"]);
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

    it("skips a blob it cannot parse instead of taking the library down", () => {
        const db = new RecipeDatabase();
        const good = new Recipe();
        good.name = "Morning";
        const bad = new Recipe();
        bad.name = "Broken";
        db.insertRecipe(good);
        db.insertRecipe(bad);

        mockBacking.runSync("UPDATE schema_meta SET value = 'stale' WHERE key = 'indexHash';");
        mockBacking.runSync("UPDATE recipes SET sortName = NULL;");
        // A blob Recipe cannot parse at all. This runs unattended on launch, so
        // throwing here would make the database unopenable on this and every
        // subsequent launch - the stale hash guarantees the retry.
        mockBacking.runSync(
            "UPDATE recipes SET recipeJSON = '{{{' WHERE uuid = ?;", [bad.uuid]
        );

        expect(() => new RecipeDatabase()).not.toThrow();

        // The good row is indexed; the bad row is left unindexed, which is the
        // recoverable failure rather than the unrecoverable one.
        const named = mockBacking.getAllSync(
            "SELECT uuid, sortName FROM recipes ORDER BY uuid;"
        ) as {uuid: string; sortName: string | null}[];
        expect(named.find((r) => r.uuid === good.uuid)?.sortName).toBe("Morning");
        expect(named.find((r) => r.uuid === bad.uuid)?.sortName).toBeNull();

        // And the blob is untouched, so it is still there to be recovered from.
        expect(mockBacking.getFirstSync(
            "SELECT recipeJSON FROM recipes WHERE uuid = ?;", [bad.uuid]
        )).toEqual({recipeJSON: "{{{"});
    });

    it("refuses to rewrite a uuid rather than clobber the recipe holding it", () => {
        const db = new RecipeDatabase();
        const moving = new Recipe();
        moving.name = "Moving";
        const bystander = new Recipe();
        bystander.name = "Bystander";
        db.insertRecipe(moving);
        db.insertRecipe(bystander);

        // The dormant path: the row is found by the uuid passed in, but the
        // recipe now carries a different one, and that different one already
        // belongs to another recipe. The old row would be deleted and
        // writeRow's INSERT OR REPLACE would then land on the bystander, so
        // one call destroys two recipes and reports nothing.
        const originalUuid = moving.uuid;
        moving.uuid = bystander.uuid;

        expect(() => db.updateRecipe(originalUuid, moving)).toThrow(/uuid/i);

        const names = (mockBacking.getAllSync(
            "SELECT sortName FROM recipes ORDER BY sortName;"
        ) as {sortName: string}[]).map((r) => r.sortName);
        expect(names).toEqual(["Bystander", "Moving"]);
    });

    it("survives a blob that parses but cannot be projected", () => {
        const db = new RecipeDatabase();
        const good = new Recipe();
        good.name = "Morning";
        const bad = new Recipe();
        db.insertRecipe(good);
        db.insertRecipe(bad);

        mockBacking.runSync("UPDATE schema_meta SET value = 'stale' WHERE key = 'indexHash';");
        // Syntactically valid JSON that Recipe accepts and projectRecipe cannot
        // survive: `name` is read with `??`, so a number lands on the field
        // intact, and hasName() then calls .trim() on it. The parse boundary is
        // not the projection boundary, and this is the gap between them.
        const parsedButUnprojectable = JSON.stringify({
            ...JSON.parse(JSON.stringify(bad)), name: 42
        });
        mockBacking.runSync(
            "UPDATE recipes SET recipeJSON = ? WHERE uuid = ?;",
            [parsedButUnprojectable, bad.uuid]
        );

        expect(() => new RecipeDatabase()).not.toThrow();

        const named = mockBacking.getAllSync(
            "SELECT uuid, sortName FROM recipes ORDER BY uuid;"
        ) as {uuid: string; sortName: string | null}[];
        expect(named.find((r) => r.uuid === good.uuid)?.sortName).toBe("Morning");
        expect(named.find((r) => r.uuid === bad.uuid)?.sortName).toBeNull();
    });

    it("clears a skipped row's stale index rather than leaving it to match filters", () => {
        const db = new RecipeDatabase();
        const bad = new Recipe();
        bad.name = "Morning";
        bad.setTags(["filter"]);
        db.insertRecipe(bad);

        // Indexed correctly first, then the blob goes bad underneath it. The
        // previous open's values are still in the columns and in recipe_tags.
        mockBacking.runSync("UPDATE schema_meta SET value = 'stale' WHERE key = 'indexHash';");
        mockBacking.runSync(
            "UPDATE recipes SET recipeJSON = '{{{' WHERE uuid = ?;", [bad.uuid]
        );

        new RecipeDatabase();

        // Skipping must mean unindexed, not "indexed as it used to be". A row
        // whose blob is unreadable cannot be allowed to keep answering "yes" to
        // a filter on the strength of a reading nobody can reproduce.
        const row = mockBacking.getFirstSync(
            "SELECT sortName, pourCount FROM recipes WHERE uuid = ?;", [bad.uuid]
        ) as {sortName: string | null; pourCount: number | null};
        expect(row.sortName).toBeNull();
        expect(row.pourCount).toBeNull();
        expect(mockBacking.getAllSync(
            "SELECT tag FROM recipe_tags WHERE uuid = ?;", [bad.uuid]
        )).toEqual([]);
    });

    it("stores the hash after skipping, so a permanently bad row cannot loop forever", () => {
        const db = new RecipeDatabase();
        const recipe = new Recipe();
        recipe.name = "Morning";
        db.insertRecipe(recipe);

        mockBacking.runSync("UPDATE schema_meta SET value = 'stale' WHERE key = 'indexHash';");
        mockBacking.runSync("UPDATE recipes SET recipeJSON = '{{{';");

        new RecipeDatabase();
        expect(storedHash()).toBe(schemaHash());
    });

    it("leaves the hash unstored when a rebuild fails, so the next open retries", () => {
        const db = new RecipeDatabase();
        const recipe = new Recipe();
        recipe.name = "Morning";
        db.insertRecipe(recipe);

        mockBacking.runSync("UPDATE schema_meta SET value = 'stale' WHERE key = 'indexHash';");
        // Not a bad row - those are skipped - but a genuine SQL failure part
        // way through the rebuild. Dropping a table would not do it, because
        // createTable recreates everything before migrateIndex runs; a trigger
        // survives that and aborts the UPDATE reindexRow makes for every row.
        mockBacking.execSync(
            `CREATE TRIGGER fail_reindex BEFORE UPDATE ON recipes
             BEGIN SELECT RAISE(ABORT, 'reindex failed'); END;`
        );

        expect(() => new RecipeDatabase()).toThrow();
        expect(storedHash()).toBe("stale");
    });

    it("adds the M5 columns to a database written before them", () => {
        const db = new RecipeDatabase();
        const recipe = new Recipe();
        recipe.favourite = true;
        db.insertRecipe(recipe);

        // Simulate the pre-M5 case: the columns exist (this mock database
        // always has the current schema) but hold no derived value yet,
        // exactly what a real ADD COLUMN leaves on an existing row. Staling
        // the hash forces the same rebuild a real version upgrade triggers.
        mockBacking.runSync("UPDATE recipes SET favourite = NULL;");
        mockBacking.runSync("UPDATE schema_meta SET value = 'stale' WHERE key = 'indexHash';");
        new RecipeDatabase();

        const row = mockBacking.getFirstSync(
            "SELECT favourite FROM recipes WHERE uuid = ?;", [recipe.uuid]
        ) as {favourite: number};
        expect(row.favourite).toBe(1);
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

    it("keeps an in-range accent across a crossing, and replaces one that overflows", () => {
        // The real rule, which is narrower than "crossing reassigns". The
        // coffee palette has 8 entries and tea 4, and the index is looked up
        // in whichever half the recipe now belongs to. So a coffee index of
        // 0-3 still names a real tea colour after crossing and is kept --
        // consistent with accents not moving under the user -- while 4-7
        // would point past the end of the tea half and must be replaced.
        //
        // Note the raw byte 0x13 cannot be used here: that fold lives in the
        // JSON constructor, so a directly-assigned 0x13 still reads as coffee
        // and nothing crosses at all.
        const db = new RecipeDatabase();

        const kept = new Recipe();
        kept.name = "Kept";
        db.insertRecipe(kept);
        expect(db.getRecipe(kept.uuid)!.accentIndex).toBe(0);

        kept.cupType = CUP_TYPE.TEA;
        db.updateRecipe(kept.uuid, kept);
        expect(db.getRecipe(kept.uuid)!.isTea()).toBe(true);
        expect(db.getRecipe(kept.uuid)!.accentIndex).toBe(0);

        const overflowing = new Recipe();
        overflowing.name = "Overflowing";
        db.insertRecipe(overflowing);
        overflowing.accentIndex = 7; // valid for coffee, past the end of tea

        overflowing.cupType = CUP_TYPE.TEA;
        db.updateRecipe(overflowing.uuid, overflowing);

        const settled = db.getRecipe(overflowing.uuid)!.accentIndex!;
        expect(settled).toBeGreaterThanOrEqual(0);
        expect(settled).toBeLessThan(4);
    });
});

describe("filter counts", () => {
    it("counts every stock filter in one SQLite read", () => {
        const db = new RecipeDatabase();
        const tea = new Recipe();
        tea.name = "Tea";
        tea.cupType = CUP_TYPE.TEA;
        db.insertRecipe(tea);

        const getFirst = jest.spyOn(mockBacking, "getFirstSync");

        const counts = db.countRecipesByFilter(STOCK_FILTER_ORDER, resolveStockFilter);

        expect(getFirst).toHaveBeenCalledTimes(1);
        expect(counts.tea).toBe(1);
        expect(counts.pods).toBe(0);
    });

    it("binds each filter's parameters to its own column of the one read", () => {
        // Every clause pushes its parameters into one shared list, bound
        // positionally across the whole SELECT. Two parameterised clauses with
        // deliberately unequal counts are what makes a swapped binding visible:
        // with one pod and two overflow-off recipes, scrambling the order
        // reports the counts the other way round rather than failing outright.
        const db = new RecipeDatabase();
        for (const [name, cupType] of [
            ["Pod", CUP_TYPE.XPOD],
            ["Open one", CUP_TYPE.OMNI],
            ["Open two", CUP_TYPE.OMNI]
        ] as const) {
            const recipe = new Recipe();
            recipe.name = name;
            recipe.cupType = cupType;
            db.insertRecipe(recipe);
        }

        const counts = db.countRecipesByFilter(
            ["pods", "overflowOff"], resolveStockFilter
        );

        expect(counts).toEqual({pods: 1, overflowOff: 2});
    });
});

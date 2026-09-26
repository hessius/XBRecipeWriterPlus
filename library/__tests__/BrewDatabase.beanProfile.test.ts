import {createTestDatabase, type FakeSQLiteDatabase} from "@/test-utils/sqlite";

let mockBacking: FakeSQLiteDatabase;

jest.mock("expo-sqlite", () => ({
    openDatabaseSync: () => mockBacking
}));

/* eslint-disable import/first */
import BrewDatabase from "@/library/BrewDatabase";
import {tagKey} from "@/library/tagKey";
/* eslint-enable import/first */

beforeEach(() => {
    mockBacking = createTestDatabase();
});

const RECIPE = "recipe-under-test";

type Seed = {
    id: string;
    recipeUuid?: string;
    outcome?: string;
    rating?: number;
    origin?: string;
    roast?: string;
    process?: string;
    fermentation?: string;
    tags?: string[];
};

/**
 * Rows inserted through raw SQL rather than through `insert`, the way
 * `brewPopulation.test.ts` seeds. The subject here is a read query, and a test
 * that has to build a whole valid `BrewRecord` to say "a cancelled brew with a
 * rating" buries the one fact it is about.
 */
function seed(rows: Seed[], deleted: string[] = []): BrewDatabase {
    const database = new BrewDatabase();
    // `recipes` is RecipeDatabase's table, created here because this suite
    // constructs only BrewDatabase. `beanVocabulary` reads it to keep a
    // deleted recipe's values out of the picker, so a seed without it would
    // hand back an empty vocabulary for the wrong reason.
    mockBacking.runSync(
        "CREATE TABLE IF NOT EXISTS recipes (uuid TEXT PRIMARY KEY NOT NULL, recipeJSON TEXT);"
    );
    const live = new Set(rows.map((row) => row.recipeUuid ?? RECIPE));
    for (const uuid of live) {
        if (deleted.includes(uuid)) continue;
        mockBacking.runSync("INSERT INTO recipes (uuid, recipeJSON) VALUES (?, ?);",
                            [uuid, "{}"]);
    }
    rows.forEach((row, index) => {
        mockBacking.runSync(
            `INSERT INTO brews (
                id, recipeUuid, recipeName, accent, startedAt, pouringAt, endedAt,
                outcome, failure, pours, waterTotal, cupTotal, heldSeconds,
                rating, watched, origin, roast, process, fermentation, hasStream
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [
                row.id, row.recipeUuid ?? RECIPE, "Fixture", "#000000",
                1_000 + index, 0, 2_000 + index, row.outcome ?? "done", null,
                1, 1, 1, 0, row.rating ?? 0, 1,
                row.origin ?? "", row.roast ?? "", row.process ?? "",
                row.fermentation ?? "", 0
            ]
        );
        for (const tag of row.tags ?? []) {
            mockBacking.runSync(
                "INSERT INTO brew_tags (brewId, tag, tagKey) VALUES (?, ?, ?);",
                [row.id, tag, tagKey(tag)]
            );
        }
    });
    return database;
}

function find(database: BrewDatabase, field: string, value: string) {
    return database.beanProfileFor(RECIPE).rows
        .find((row) => row.field === field && row.value === value);
}

describe("beanProfileFor", () => {
    it("returns an empty profile for a recipe with no brews", () => {
        const database = seed([]);
        expect(database.beanProfileFor(RECIPE)).toEqual({
            rows: [],
            untagged: {brews: 0, rated: 0, avgRating: 0},
            counted: 0
        });
    });

    it("earns a row for each of the four preset fields", () => {
        const database = seed([{
            id: "a", origin: "Ethiopia Guji", roast: "Light",
            process: "Natural", fermentation: "Co-ferment"
        }]);
        expect(database.beanProfileFor(RECIPE).rows.map((r) => r.field).sort())
            .toEqual(["fermentation", "origin", "process", "roast"]);
    });

    it("earns a row for a custom tag", () => {
        const database = seed([{id: "a", tags: ["dad's bag"]}]);
        expect(find(database, "custom", "dad's bag"))
            .toEqual({field: "custom", value: "dad's bag", brews: 1, rated: 0,
                      avgRating: 0});
    });

    it("counts one brew into every field it carries", () => {
        // The rows overlap by construction. This is the fact the UI must never
        // present as a breakdown that sums to the total.
        const database = seed([
            {id: "a", roast: "Light", process: "Natural"},
            {id: "b", roast: "Light", process: "Washed"}
        ]);
        expect(find(database, "roast", "Light")?.brews).toBe(2);
        expect(find(database, "process", "Natural")?.brews).toBe(1);
        expect(database.beanProfileFor(RECIPE).counted).toBe(2);
    });

    it("leaves a cancelled brew out of every figure", () => {
        // "Every figure" means the custom rows too. The four presets and the
        // brew_tags join are five separate selects in one union, so a guard
        // proved on one of them is not proved on the others: dropping
        // COUNTED_SQL from the custom select alone killed no test until this
        // one carried a tag.
        const database = seed([
            {id: "kept", process: "Natural", rating: 4, tags: ["mornings"]},
            {id: "gone", process: "Natural", rating: 1, outcome: "cancelled",
             tags: ["mornings"]}
        ]);
        expect(find(database, "process", "Natural"))
            .toEqual({field: "process", value: "Natural", brews: 1, rated: 1,
                      avgRating: 4});
        expect(find(database, "custom", "mornings"))
            .toEqual({field: "custom", value: "mornings", brews: 1, rated: 1,
                      avgRating: 4});
        expect(database.beanProfileFor(RECIPE).counted).toBe(1);
    });

    it("counts endedOnMachine as a cup", () => {
        const database = seed([{id: "a", process: "Natural",
                                outcome: "endedOnMachine"}]);
        expect(find(database, "process", "Natural")?.brews).toBe(1);
    });

    it("averages only the rated brews and reports how many there were", () => {
        const database = seed([
            {id: "a", process: "Natural", rating: 5},
            {id: "b", process: "Natural", rating: 3},
            {id: "c", process: "Natural", rating: 0}
        ]);
        expect(find(database, "process", "Natural"))
            .toEqual({field: "process", value: "Natural", brews: 3, rated: 2,
                      avgRating: 4});
    });

    it("reports 0 rather than null when nothing in a row was rated", () => {
        // SQL's AVG over an empty population is NULL. The app's sentinel for
        // "nothing to average" is 0 everywhere else, and a null would reach the
        // ledger and print as blank in the middle of a figure line.
        const database = seed([{id: "a", process: "Natural"}]);
        expect(find(database, "process", "Natural")?.avgRating).toBe(0);
    });

    it("folds two spellings of a custom tag into one row", () => {
        const database = seed([
            {id: "a", tags: ["Mornings"]},
            {id: "b", tags: ["mornings"]}
        ]);
        const custom = database.beanProfileFor(RECIPE).rows
            .filter((row) => row.field === "custom");
        expect(custom).toHaveLength(1);
        expect(custom[0].brews).toBe(2);
    });

    it("does not earn a row for an unset field", () => {
        const database = seed([{id: "a", process: "Natural"}]);
        expect(database.beanProfileFor(RECIPE).rows.map((r) => r.field))
            .toEqual(["process"]);
    });

    it("counts a brew with nothing recorded as untagged", () => {
        const database = seed([
            {id: "bare", rating: 3},
            {id: "tagged", process: "Natural", rating: 5}
        ]);
        const profile = database.beanProfileFor(RECIPE);
        expect(profile.untagged).toEqual({brews: 1, rated: 1, avgRating: 3});
        expect(profile.counted).toBe(2);
    });

    it("does not count a brew carrying only a custom tag as untagged", () => {
        const database = seed([{id: "a", tags: ["dad's bag"]}]);
        expect(database.beanProfileFor(RECIPE).untagged.brews).toBe(0);
    });

    it("does not count a brew carrying only an origin as untagged", () => {
        const database = seed([{id: "a", origin: "Ethiopia Guji"}]);
        expect(database.beanProfileFor(RECIPE).untagged.brews).toBe(0);
    });

    it("draws untagged from the same population as counted", () => {
        // The ledger's denominator and the recipe card's brew count are the
        // same number or the deck flatly contradicts the card above it.
        const database = seed([
            {id: "a"},
            {id: "b", outcome: "cancelled"}
        ]);
        const profile = database.beanProfileFor(RECIPE);
        expect(profile.untagged.brews).toBe(profile.counted);
        expect(profile.counted).toBe(1);
    });

    it("ignores another recipe's brews entirely", () => {
        // Tagged on both sides for the same reason the cancelled-brew test is:
        // the custom select is its own statement with its own scope, and a
        // scope proved on the preset selects says nothing about it.
        const database = seed([
            {id: "mine", process: "Natural", tags: ["mornings"]},
            {id: "theirs", recipeUuid: "someone-else", process: "Natural",
             tags: ["mornings"]}
        ]);
        expect(find(database, "process", "Natural")?.brews).toBe(1);
        expect(find(database, "custom", "mornings")?.brews).toBe(1);
        expect(database.beanProfileFor(RECIPE).counted).toBe(1);
    });
});

describe("beanVocabulary", () => {
    it("is empty when there are no brews", () => {
        expect(seed([]).beanVocabulary()).toEqual([]);
    });

    it("offers a value from any recipe, not just one", () => {
        const database = seed([
            {id: "a", process: "Natural"},
            {id: "b", recipeUuid: "another", process: "Washed"}
        ]);
        expect(database.beanVocabulary().map((e) => e.value).sort())
            .toEqual(["Natural", "Washed"]);
    });

    it("counts recipes, not brews", () => {
        // The vocabulary answers "how much of the library would this show",
        // and a recipe brewed nine times is one recipe.
        const database = seed([
            {id: "a", process: "Natural"},
            {id: "b", process: "Natural"},
            {id: "c", recipeUuid: "another", process: "Natural"}
        ]);
        expect(database.beanVocabulary()[0].recipes).toBe(2);
    });

    it("leaves out a preset value only a cancelled brew carries", () => {
        // The filter clause is scoped to counted brews, so a value offered
        // here that only a cancelled brew carries would build a filter that
        // can never match anything.
        const database = seed([
            {id: "a", process: "Natural"},
            {id: "b", process: "Honey", outcome: "cancelled"}
        ]);
        expect(database.beanVocabulary().map((e) => e.value)).toEqual(["Natural"]);
    });

    it("leaves out a custom value only a cancelled brew carries", () => {
        // The custom tag path is a separate select, so proving the counted
        // guard on the four preset columns says nothing about this one.
        const database = seed([
            {id: "a", tags: ["mornings"]},
            {id: "b", tags: ["cancelled only"], outcome: "cancelled"}
        ]);
        expect(database.beanVocabulary().map((e) => e.value)).toEqual(["mornings"]);
    });

    it("offers custom tags in their folded form", () => {
        // The filter binds tagKey, so the vocabulary has to hand back the
        // value that binding will match.
        const database = seed([
            {id: "a", tags: ["Mornings"]},
            {id: "b", tags: ["mornings"]}
        ]);
        const custom = database.beanVocabulary().filter((e) => e.field === "custom");
        expect(custom).toEqual([{field: "custom", value: "mornings", recipes: 1}]);
    });

    it("groups the fields in BEAN_FIELDS order with custom last", () => {
        const database = seed([{
            id: "a", origin: "Guji", roast: "Light", process: "Natural",
            fermentation: "Lactic", tags: ["dad's bag"]
        }]);
        expect(database.beanVocabulary().map((e) => e.field))
            .toEqual(["origin", "roast", "process", "fermentation", "custom"]);
    });

    it("orders a field's values by recipe count, then by value", () => {
        const database = seed([
            {id: "a", process: "Washed"},
            {id: "b", recipeUuid: "r2", process: "Washed"},
            {id: "c", recipeUuid: "r3", process: "Natural"},
            {id: "d", recipeUuid: "r4", process: "Honey"}
        ]);
        expect(database.beanVocabulary().map((e) => e.value))
            .toEqual(["Washed", "Honey", "Natural"]);
    });
});

describe("beanVocabulary and deleted recipes", () => {
    it("drops a value only a deleted recipe's brews carry", () => {
        // Deleting a recipe keeps its brews. The filter matches through
        // `recipes`, so offering this value would open an empty library.
        const database = seed([
            {id: "a", recipeUuid: "gone", process: "Natural"},
            {id: "b", recipeUuid: "here", process: "Washed"}
        ], ["gone"]);

        expect(database.beanVocabulary().map((e) => e.value)).toEqual(["Washed"]);
    });

    it("drops a custom tag only a deleted recipe's brews carry", () => {
        const database = seed([
            {id: "a", recipeUuid: "gone", tags: ["mornings"]},
            {id: "b", recipeUuid: "here", tags: ["evenings"]}
        ], ["gone"]);

        expect(database.beanVocabulary().map((e) => e.value)).toEqual(["evenings"]);
    });

    it("does not count a deleted recipe towards a surviving value", () => {
        const database = seed([
            {id: "a", recipeUuid: "gone", roast: "Medium"},
            {id: "b", recipeUuid: "here", roast: "Medium"}
        ], ["gone"]);

        expect(database.beanVocabulary()[0].recipes).toBe(1);
    });
});

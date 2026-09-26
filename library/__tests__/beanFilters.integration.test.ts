import {createTestDatabase, type FakeSQLiteDatabase} from "@/test-utils/sqlite";

let mockBacking: FakeSQLiteDatabase;
jest.mock("expo-sqlite", () => ({openDatabaseSync: () => mockBacking}));

/* eslint-disable import/first */
import BrewDatabase from "@/library/BrewDatabase";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import RecipeDatabase from "@/library/RecipeDatabase";
import {resolveLibraryFilter} from "@/library/libraryFilters";
import type {LibraryQuery} from "@/library/libraryQuery";
import {tagKey} from "@/library/tagKey";
/* eslint-enable import/first */

beforeEach(() => {
    mockBacking = createTestDatabase();
});

const BASE: LibraryQuery = {
    search: "",
    filters: [],
    sort: "added",
    direction: "asc",
    favouritesFirst: false
};

type RecipeSpec = {
    createdAt?: number;
    cupType?: number;
};

type BrewSpec = {
    id: string;
    recipe: string;
    outcome?: string;
    rating?: number;
    origin?: string;
    roast?: string;
    process?: string;
    fermentation?: string;
    tags?: string[];
};

type Seeded = {
    recipes: RecipeDatabase;
    brews: BrewDatabase;
    uuids: Record<string, string>;
    addBrew: (row: BrewSpec) => void;
};

function seed(
    recipeSpecs: Record<string, RecipeSpec>,
    brewSpecs: BrewSpec[] = []
): Seeded {
    const recipes = new RecipeDatabase();
    const brews = new BrewDatabase();
    const uuids: Record<string, string> = {};
    let recipeIndex = 0;
    let brewIndex = 0;

    for (const [label, spec] of Object.entries(recipeSpecs)) {
        const recipe = new Recipe();
        recipe.name = label;
        recipe.createdAt = spec.createdAt ?? ++recipeIndex;
        recipe.cupType = spec.cupType ?? CUP_TYPE.OTHER;
        recipes.insertRecipe(recipe);
        uuids[label] = recipe.uuid;
    }

    const addBrew = (row: BrewSpec) => {
        mockBacking.runSync(
            `INSERT INTO brews (
                id, recipeUuid, recipeName, accent, startedAt, pouringAt, endedAt,
                outcome, failure, pours, waterTotal, cupTotal, heldSeconds,
                rating, watched, origin, roast, process, fermentation, hasStream
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [
                row.id, uuids[row.recipe], row.recipe, "#000000",
                1_000 + brewIndex, 0, 2_000 + brewIndex,
                row.outcome ?? "done", null, 1, 1, 1, 0, row.rating ?? 0, 1,
                row.origin ?? "", row.roast ?? "", row.process ?? "",
                row.fermentation ?? "", 0
            ]
        );
        brewIndex += 1;

        for (const tag of row.tags ?? []) {
            mockBacking.runSync(
                "INSERT INTO brew_tags (brewId, tag, tagKey) VALUES (?, ?, ?);",
                [row.id, tag, tagKey(tag)]
            );
        }
    };

    brewSpecs.forEach(addBrew);

    return {recipes, brews, uuids, addBrew};
}

function seedGujiAndYirg(): Seeded {
    return seed(
        {Guji: {}, Yirg: {}},
        [
            {id: "guji-natural-1", recipe: "Guji", process: "Natural", rating: 5},
            {id: "guji-natural-2", recipe: "Guji", process: "Natural", rating: 4},
            {id: "guji-natural-3", recipe: "Guji", process: "Natural", rating: 4},
            {id: "guji-washed", recipe: "Guji", process: "Washed", rating: 2},
            {id: "yirg-natural-1", recipe: "Yirg", process: "Natural", rating: 5},
            {id: "yirg-natural-2", recipe: "Yirg", process: "Natural", rating: 5},
            {
                id: "yirg-cancelled",
                recipe: "Yirg",
                outcome: "cancelled",
                process: "Natural",
                rating: 5
            }
        ]
    );
}

function labelsMatching(seedData: Seeded, filters: string | string[]): string[] {
    const byUuid = Object.fromEntries(
        Object.entries(seedData.uuids).map(([label, uuid]) => [uuid, label])
    );
    const list = Array.isArray(filters) ? filters : [filters];
    return seedData.recipes
        .queryRecipes({...BASE, filters: list}, resolveLibraryFilter)
        .map((recipe) => byUuid[recipe.uuid])
        .sort();
}

describe("bean filters against a real database", () => {
    it("selects counted Natural brews and ignores a cancelled-only recipe", () => {
        const data = seedGujiAndYirg();
        const cancelled = new Recipe();
        cancelled.name = "Cancelled";
        cancelled.createdAt = 3;
        cancelled.cupType = CUP_TYPE.OTHER;
        data.recipes.insertRecipe(cancelled);
        data.uuids.Cancelled = cancelled.uuid;
        data.addBrew({
            id: "cancelled-only",
            recipe: "Cancelled",
            outcome: "cancelled",
            process: "Natural",
            rating: 5
        });

        expect(labelsMatching(data, "bean:process:Natural")).toEqual(["Guji", "Yirg"]);
    });

    it("selects only Guji for Washed", () => {
        expect(labelsMatching(seedGujiAndYirg(), "bean:process:Washed"))
            .toEqual(["Guji"]);
    });

    it("keeps Yirg out when it is one rated Natural short of the floor", () => {
        // The cancelled Natural carries a rating, but it is not a cup. Letting
        // it make up the floor would tell the user a failed brew proved the
        // coffee profile.
        expect(labelsMatching(seedGujiAndYirg(), "bean:rated:process:Natural"))
            .toEqual(["Guji"]);
    });

    it("lets Yirg in once a fourth done Natural brew supplies the floor", () => {
        const data = seedGujiAndYirg();
        data.addBrew({
            id: "yirg-natural-3",
            recipe: "Yirg",
            process: "Natural",
            rating: 5
        });

        expect(labelsMatching(data, "bean:rated:process:Natural"))
            .toEqual(["Guji", "Yirg"]);
    });

    it("keeps a single Washed rating below the floor", () => {
        expect(labelsMatching(seedGujiAndYirg(), "bean:rated:process:Washed"))
            .toEqual([]);
    });

    it("treats exactly four stars as highly rated and rejects just under", () => {
        // The threshold is inclusive by design. A later change to `>` would
        // turn a spec choice into a quiet off-by-one in the library rail.
        const data = seed(
            {Under: {}, FourA: {}, FourB: {}, Over: {}},
            [
                {id: "under-1", recipe: "Under", process: "Natural", rating: 5},
                {id: "under-2", recipe: "Under", process: "Natural", rating: 5},
                {id: "under-3", recipe: "Under", process: "Natural", rating: 4},
                {id: "under-4", recipe: "Under", process: "Natural", rating: 1},
                {id: "four-a-1", recipe: "FourA", process: "Natural", rating: 5},
                {id: "four-a-2", recipe: "FourA", process: "Natural", rating: 5},
                {id: "four-a-3", recipe: "FourA", process: "Natural", rating: 5},
                {id: "four-a-4", recipe: "FourA", process: "Natural", rating: 1},
                {id: "four-b-1", recipe: "FourB", process: "Natural", rating: 5},
                {id: "four-b-2", recipe: "FourB", process: "Natural", rating: 4},
                {id: "four-b-3", recipe: "FourB", process: "Natural", rating: 4},
                {id: "four-b-4", recipe: "FourB", process: "Natural", rating: 3},
                {id: "over-1", recipe: "Over", process: "Natural", rating: 5},
                {id: "over-2", recipe: "Over", process: "Natural", rating: 5},
                {id: "over-3", recipe: "Over", process: "Natural", rating: 5},
                {id: "over-4", recipe: "Over", process: "Natural", rating: 2}
            ]
        );

        expect(labelsMatching(data, "bean:rated:process:Natural"))
            .toEqual(["FourA", "FourB", "Over"]);
    });

    it("keeps an unrated Natural brew out of the average", () => {
        const data = seed(
            {Unrated: {}},
            [
                {id: "rated-1", recipe: "Unrated", process: "Natural", rating: 5},
                {id: "rated-2", recipe: "Unrated", process: "Natural", rating: 4},
                {id: "rated-3", recipe: "Unrated", process: "Natural", rating: 4},
                {id: "unrated", recipe: "Unrated", process: "Natural", rating: 0}
            ]
        );

        expect(labelsMatching(data, "bean:rated:process:Natural"))
            .toEqual(["Unrated"]);
    });

    it("matches a custom tag through its folded key", () => {
        const data = seed(
            {Tagged: {}, Plain: {}},
            [
                {id: "tagged", recipe: "Tagged", tags: ["Mornings"]},
                {id: "plain", recipe: "Plain"}
            ]
        );

        expect(labelsMatching(data, "bean:custom:mornings")).toEqual(["Tagged"]);
    });

    it("folds custom tags before SQLite can apply its ASCII-only collation", () => {
        const data = seed(
            {Tagged: {}, Plain: {}},
            [
                {id: "tagged", recipe: "Tagged", tags: ["IĞDIR"]},
                {id: "plain", recipe: "Plain", tags: ["Other"]}
            ]
        );

        expect(labelsMatching(data, "bean:custom:iğdir")).toEqual(["Tagged"]);
    });

    it("scopes a rated custom filter to the tagged brews", () => {
        const rows: BrewSpec[] = [];
        for (let index = 0; index < 3; index += 1) {
            rows.push({
                id: `tagged-${index}`,
                recipe: "Tagged",
                rating: 5,
                tags: ["Mornings"]
            });
        }
        for (let index = 0; index < 6; index += 1) {
            rows.push({id: `untagged-${index}`, recipe: "Tagged", rating: 1});
        }
        const data = seed({Tagged: {}, Plain: {}}, rows);

        expect(labelsMatching(data, "bean:rated:custom:mornings"))
            .toEqual(["Tagged"]);
    });

    it("ANDs two bean filters as independent history questions", () => {
        // Deliberate: a bean chip asks whether the recipe has ever carried
        // that value, not whether one brew carried every selected value. The
        // stricter same-row reading would make separate facets silently erase
        // a recipe with the requested history.
        const data = seed(
            {Same: {}, Split: {}, NaturalOnly: {}, LightOnly: {}},
            [
                {
                    id: "same",
                    recipe: "Same",
                    process: "Natural",
                    roast: "Light"
                },
                {
                    id: "split-natural",
                    recipe: "Split",
                    process: "Natural",
                    roast: "Medium"
                },
                {
                    id: "split-light",
                    recipe: "Split",
                    process: "Washed",
                    roast: "Light"
                },
                {
                    id: "natural-only",
                    recipe: "NaturalOnly",
                    process: "Natural",
                    roast: "Medium"
                },
                {
                    id: "light-only",
                    recipe: "LightOnly",
                    process: "Washed",
                    roast: "Light"
                }
            ]
        );

        expect(labelsMatching(data, ["bean:process:Natural", "bean:roast:Light"]))
            .toEqual(["Same", "Split"]);
    });

    it("ANDs a bean filter with a stock filter", () => {
        const data = seed(
            {
                TeaNatural: {cupType: CUP_TYPE.TEA},
                TeaWashed: {cupType: CUP_TYPE.TEA},
                OtherNatural: {cupType: CUP_TYPE.OTHER}
            },
            [
                {id: "tea-natural", recipe: "TeaNatural", process: "Natural"},
                {id: "tea-washed", recipe: "TeaWashed", process: "Washed"},
                {id: "other-natural", recipe: "OtherNatural", process: "Natural"}
            ]
        );

        expect(labelsMatching(data, ["bean:process:Natural", "tea"]))
            .toEqual(["TeaNatural"]);
    });

    it("runs a hostile origin as a bound value", () => {
        const data = seed(
            {Guji: {}, Yirg: {}},
            [
                {id: "guji", recipe: "Guji", origin: "Ethiopia Guji"},
                {id: "yirg", recipe: "Yirg", origin: "Yirgacheffe"}
            ]
        );

        expect(() => labelsMatching(data, "bean:origin:'; DROP TABLE brews; --"))
            .not.toThrow();
        expect(labelsMatching(data, "bean:origin:'; DROP TABLE brews; --"))
            .toEqual([]);
    });
});

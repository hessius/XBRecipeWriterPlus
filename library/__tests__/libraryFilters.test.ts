import {createTestDatabase, type FakeSQLiteDatabase} from "@/test-utils/sqlite";
import {
    authorFilterId,
    authorFromFilterId,
    availableFilters,
    asLibraryFilters,
    filterLabel,
    resolveLibraryFilter,
    asStockFilters,
    isStockFilter,
    resolveStockFilter,
    STOCK_FILTERS,
    STOCK_FILTER_ORDER,
    type FilterId
} from "@/library/libraryFilters";
import type {LibraryQuery} from "@/library/libraryQuery";

/**
 * Two kinds of proof, matching `libraryQuery.test.ts`. The suppression and
 * narrowing blocks are pure logic over ids and counts. The integration block
 * runs each stock fragment against a real in-memory SQLite through the same
 * harness the index tests use, because a fragment that reads well can still be
 * wrong SQL or query the wrong shape of column -- `xid IS NOT NULL` against a
 * table that stores NULL is the whole point, and only a real row proves it.
 */

describe("suppression at its boundaries", () => {
    // The gate is "3 or more and no more than 80%". Pinned at the exact edges,
    // because an off-by-one either way changes which chips a user sees.
    it("offers a filter of exactly 3 and suppresses one of 2", () => {
        expect(availableFilters({a: 3}, 100)).toEqual(["a"]);
        expect(availableFilters({a: 2}, 100)).toEqual([]);
    });

    it("offers exactly 80% and suppresses 81%", () => {
        // Library of 100 so the percentages are whole and unambiguous.
        expect(availableFilters({a: 80}, 100)).toEqual(["a"]);
        expect(availableFilters({a: 81}, 100)).toEqual([]);
    });

    it("keeps 80% exact where the float form would not", () => {
        // Library of 5: 80% is 4 exactly, but `5 * 0.8` is where a naive float
        // comparison is most likely to wobble. The integer cross-multiplication
        // makes 4 offered and 5 (the whole library) suppressed with no rounding.
        expect(availableFilters({a: 4}, 5)).toEqual(["a"]);
        expect(availableFilters({a: 5}, 5)).toEqual([]);
    });

    it("never withdraws a filter that is already applied", () => {
        // Suppression decides what to propose, not what to take away. A filter
        // that crosses a threshold while it is switched on -- here by rising
        // past the 80% ceiling, and by falling under the count floor -- would
        // otherwise remove its own chip, and with the chips behind a button
        // gated on there being any, the button and the whole rail with it. The
        // library would be left narrowed with nothing on screen to undo it.
        expect(availableFilters({a: 81}, 100)).toEqual([]);
        expect(availableFilters({a: 81}, 100, ["a"])).toEqual(["a"]);
        expect(availableFilters({a: 1}, 100, ["a"])).toEqual(["a"]);
        expect(availableFilters({a: 0}, 0, ["a"])).toEqual(["a"]);
    });

    it("offers only SINGLE POUR when no recipe has two stages", () => {
        // The two shelves hold the same recipes, and SINGLE POUR is the
        // truthful name for that set. FEW STAGES would be a second door onto
        // it promising a breadth the library does not have.
        expect(availableFilters({singlePour: 5, fewStages: 5}, 100))
            .toEqual(["singlePour"]);
    });

    it("offers only FEW STAGES once a two-stage recipe exists", () => {
        // FEW STAGES is now the larger shelf and SINGLE POUR a subset of one
        // already on screen.
        expect(availableFilters({singlePour: 5, fewStages: 6}, 100))
            .toEqual(["fewStages"]);
    });

    it("keeps the collapsed shelf when the user is standing in it", () => {
        // The one-way rule again: suppression declines to offer, it never
        // withdraws. A user filtered to SINGLE POUR keeps its chip even once a
        // two-stage recipe arrives and makes FEW STAGES the better offer.
        expect(availableFilters({singlePour: 5, fewStages: 6}, 100, ["singlePour"]))
            .toEqual(["singlePour", "fewStages"]);
        expect(availableFilters({singlePour: 5, fewStages: 5}, 100, ["fewStages"]))
            .toEqual(["singlePour", "fewStages"]);
    });

    it("leaves the pair alone when only one of them is offered anyway", () => {
        // Nothing to collapse: the floor has already taken one out, and the
        // collapse must not then take the other.
        expect(availableFilters({singlePour: 5, fewStages: 2}, 100))
            .toEqual(["singlePour"]);
        expect(availableFilters({singlePour: 2, fewStages: 5}, 100))
            .toEqual(["fewStages"]);
    });

    it("does not collapse away the only shelf of the pair still offered", () => {
        // FEW STAGES is over the 80% ceiling and already gone, so it is not
        // competing with anything. Collapsing on the counts alone would drop
        // SINGLE POUR too and leave the user with neither.
        expect(availableFilters({singlePour: 10, fewStages: 90}, 100))
            .toEqual(["singlePour"]);
    });

    it("offers nothing for an empty library", () => {
        expect(availableFilters({a: 0}, 0)).toEqual([]);
    });

    it("preserves the caller's order so it controls the chip order", () => {
        expect(availableFilters({tea: 5, strong: 5, hot: 5}, 100))
            .toEqual(["tea", "strong", "hot"]);
    });
});

describe("the narrowing seam", () => {
    it("knows its own ids and rejects everything else", () => {
        expect(isStockFilter("tea")).toBe(true);
        expect(isStockFilter("nope")).toBe(false);
        expect(isStockFilter(42)).toBe(false);
    });

    it("does not mistake a prototype member for a filter id", () => {
        // The reason for Object.hasOwn over `in`. This hole was shipped once on
        // this branch's sort guard and caught in review; a hostile backup would
        // carry exactly these strings.
        expect(isStockFilter("toString")).toBe(false);
        expect(isStockFilter("constructor")).toBe(false);
        expect(isStockFilter("__proto__")).toBe(false);
    });

    it("drops stale ids from a persisted list rather than passing them on", () => {
        // A chip id from a previous build must not reach buildLibraryQuery's
        // throw and take the screen down; asStockFilters is where it is
        // dropped. `strong` and `long` are the real case: both were renamed
        // when the ratio pair was, and a phone upgrading with either pinned
        // must lose the chip rather than the library screen.
        expect(asStockFilters(["tea", "ghost", "shortRatio"]))
            .toEqual(["tea", "shortRatio"]);
        expect(asStockFilters(["strong", "long", "mild"])).toEqual([]);
        expect(asStockFilters(["__proto__", "tea"])).toEqual(["tea"]);
    });

    it("treats a non-array stored value as no filters", () => {
        expect(asStockFilters(undefined)).toEqual([]);
        expect(asStockFilters("tea")).toEqual([]);
        expect(asStockFilters(null)).toEqual([]);
    });

    it("resolves a known id to its clause and an unknown id to null", () => {
        expect(resolveStockFilter("tea")).toEqual({where: "isTea = 1"});
        expect(resolveStockFilter("ghost")).toBeNull();
    });

    it("declares a label and clause for every ordered id", () => {
        expect([...STOCK_FILTER_ORDER].sort())
            .toEqual(Object.keys(STOCK_FILTERS).sort());
        for (const id of STOCK_FILTER_ORDER) {
            expect(STOCK_FILTERS[id].label).toMatch(/^[A-Z ]+$/);
        }
    });
});

let mockBacking: FakeSQLiteDatabase;

jest.mock("expo-sqlite", () => ({
    openDatabaseSync: () => mockBacking
}));

/* eslint-disable import/first */
import RecipeDatabase from "@/library/RecipeDatabase";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import Pour from "@/library/Pour";
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

type Spec = {
    createdAt: number;
    cupType?: number;
    pourCount?: number;
    grinder?: boolean;
    ratio?: number;
    xid?: string;
    maxTemp?: number;
    volume?: number;
    flowRate?: number;
    pauseTime?: number;
    sharedBy?: string;
};

function seed(db: RecipeDatabase, specs: Record<string, Spec>): Record<string, string> {
    const uuids: Record<string, string> = {};
    for (const [label, spec] of Object.entries(specs)) {
        const recipe = new Recipe();
        recipe.createdAt = spec.createdAt;
        recipe.cupType = spec.cupType ?? CUP_TYPE.OTHER;
        recipe.grinder = spec.grinder ?? true;
        recipe.ratio = spec.ratio ?? 15;
        if (spec.xid !== undefined) recipe.xid = spec.xid;
        if (spec.sharedBy !== undefined) recipe.sharedBy = spec.sharedBy;
        const count = spec.pourCount ?? 1;
        recipe.pours = Array.from({length: count}, (_unused, index) =>
            new Pour(index + 1, spec.volume, spec.maxTemp, spec.flowRate,
                undefined, undefined, spec.pauseTime)
        );
        db.insertRecipe(recipe);
        uuids[label] = recipe.uuid;
    }
    return uuids;
}

function labelsMatching(
    db: RecipeDatabase, id: FilterId, uuids: Record<string, string>
): string[] {
    const byUuid = Object.fromEntries(Object.entries(uuids).map(([k, v]) => [v, k]));
    return db.queryRecipes({...BASE, filters: [id]}, resolveStockFilter)
        .map((recipe) => byUuid[recipe.uuid])
        .sort();
}

describe("each stock fragment against a real database", () => {
    it("selects tea, pod, overflow-off and other-brewer by cup type", () => {
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            tea: {createdAt: 1, cupType: CUP_TYPE.TEA},
            pod: {createdAt: 2, cupType: CUP_TYPE.XPOD},
            omni: {createdAt: 3, cupType: CUP_TYPE.OMNI},
            other: {createdAt: 4, cupType: CUP_TYPE.OTHER}
        });
        expect(labelsMatching(db, "tea", uuids)).toEqual(["tea"]);
        expect(labelsMatching(db, "pods", uuids)).toEqual(["pod"]);
        expect(labelsMatching(db, "overflowOff", uuids)).toEqual(["omni"]);
        expect(labelsMatching(db, "otherBrewer", uuids)).toEqual(["other"]);
    });

    it("selects single-pour, few-stages and many-stages by pour count", () => {
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            one: {createdAt: 1, pourCount: 1},
            two: {createdAt: 2, pourCount: 2},
            three: {createdAt: 3, pourCount: 3},
            four: {createdAt: 4, pourCount: 4}
        });
        expect(labelsMatching(db, "singlePour", uuids)).toEqual(["one"]);
        expect(labelsMatching(db, "fewStages", uuids)).toEqual(["one", "two"]);
        expect(labelsMatching(db, "manyStages", uuids)).toEqual(["four"]);
    });

    it("leaves three stages unshelved, and one stage on two shelves", () => {
        // The two facts the stage shelves are pinned on. Three is the unnamed
        // middle, as it is for duration. One is on both SINGLE POUR and FEW
        // STAGES on purpose: the first is a way of brewing and the second is a
        // shape, and the only other reading -- few meaning "two exactly" --
        // would be a shelf almost nobody could fill.
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            one: {createdAt: 1, pourCount: 1},
            three: {createdAt: 2, pourCount: 3}
        });
        const shelvesHolding = (label: string) => STOCK_FILTER_ORDER
            .filter((id) => labelsMatching(db, id, uuids).includes(label));

        expect(shelvesHolding("three")).not.toContain("fewStages");
        expect(shelvesHolding("three")).not.toContain("manyStages");
        expect(shelvesHolding("one")).toEqual(
            expect.arrayContaining(["singlePour", "fewStages"])
        );
    });

    it("selects grinder-off by the grinder flag", () => {
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            off: {createdAt: 1, grinder: false},
            on: {createdAt: 2, grinder: true}
        });
        expect(labelsMatching(db, "grinderOff", uuids)).toEqual(["off"]);
    });

    it("selects xBloom recipes by a present xid, excluding the manual ones", () => {
        // recipeIndex stores NULL for an absent xid, and the fragment is
        // IS NOT NULL to match that: a carded recipe is in, a hand-built one out.
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            card: {createdAt: 1, xid: "ABC1234"},
            manual: {createdAt: 2}
        });
        expect(labelsMatching(db, "xbloom", uuids)).toEqual(["card"]);
    });

    it("selects short and long ratios by ratio", () => {
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            short: {createdAt: 1, ratio: 14},
            middle: {createdAt: 2, ratio: 15},
            long: {createdAt: 3, ratio: 17}
        });
        expect(labelsMatching(db, "shortRatio", uuids)).toEqual(["short"]);
        expect(labelsMatching(db, "longRatio", uuids)).toEqual(["long"]);
    });

    it("selects quick and slow brews by how long the plan takes", () => {
        // 160 ml at 3.2 ml/s is 50 seconds of pouring. The pause is what
        // separates the three: none, 150 seconds, and 250.
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            quick:  {createdAt: 1, volume: 160, flowRate: 32, pauseTime: 0},
            middle: {createdAt: 2, volume: 160, flowRate: 32, pauseTime: 150},
            slow:   {createdAt: 3, volume: 160, flowRate: 32, pauseTime: 250}
        });
        expect(labelsMatching(db, "quickBrew", uuids)).toEqual(["quick"]);
        expect(labelsMatching(db, "slowBrew", uuids)).toEqual(["slow"]);
    });

    it("puts the duration shelves at their exact boundaries", () => {
        // Pinned at the second, as the suppression gate is pinned at its
        // percentage: 2:30 is quick and 2:31 is not, 4:00 is slow and 3:59 is
        // not. Every recipe here pours for 50 seconds and differs only in its
        // pause.
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            "quick-150": {createdAt: 1, volume: 160, flowRate: 32, pauseTime: 100},
            "over-151":  {createdAt: 2, volume: 160, flowRate: 32, pauseTime: 101},
            "under-239": {createdAt: 3, volume: 160, flowRate: 32, pauseTime: 189},
            "slow-240":  {createdAt: 4, volume: 160, flowRate: 32, pauseTime: 190}
        });
        expect(labelsMatching(db, "quickBrew", uuids)).toEqual(["quick-150"]);
        expect(labelsMatching(db, "slowBrew", uuids)).toEqual(["slow-240"]);
    });

    it("counts the pauses, not just the pouring", () => {
        // The figure is how long the brew takes, and a recipe that pours for
        // forty seconds and then steeps for four minutes is a slow brew by any
        // reading. Summing only `pourSeconds` would have filed it as quick.
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            steeped: {createdAt: 1, volume: 128, flowRate: 32, pauseTime: 240}
        });
        expect(labelsMatching(db, "slowBrew", uuids)).toEqual(["steeped"]);
        expect(labelsMatching(db, "quickBrew", uuids)).toEqual([]);
    });

    it("keeps a stageless recipe off both duration shelves", () => {
        // Its `brewSeconds` is NULL rather than 0. Zero is a duration, and it
        // would have made a half-authored recipe the quickest brew in the
        // library.
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            empty: {createdAt: 1, pourCount: 0},
            quick: {createdAt: 2, volume: 32, flowRate: 32}
        });
        expect(labelsMatching(db, "quickBrew", uuids)).toEqual(["quick"]);
        expect(labelsMatching(db, "slowBrew", uuids)).toEqual([]);
    });

    it("selects mine as everything that arrived from nobody", () => {
        // The complement of the author shelves. A card read, a recipe typed in
        // and a row from the user's own account all have no sharer; only a
        // recipe somebody sent does.
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            own:     {createdAt: 1},
            account: {createdAt: 2, xid: "ABC12345"},
            sent:    {createdAt: 3, sharedBy: "BrewMind"}
        });
        expect(labelsMatching(db, "mine", uuids)).toEqual(["account", "own"]);
    });

    it("leaves no recipe between mine and an author shelf", () => {
        // The two are halves of one partition: every recipe is on exactly one
        // side of "arrived from somebody". The accented name is where that
        // could break, and did before `sharedByKey` -- under `sharedBy COLLATE
        // NOCASE` the author clause misses "café" while MINE still excludes
        // it, and the recipe is reachable from neither shelf.
        const db = new RecipeDatabase();
        const uuids = seed(db, {sent: {createdAt: 1, sharedBy: "café"}});
        const byUuid = Object.fromEntries(
            Object.entries(uuids).map(([k, v]) => [v, k])
        );
        const fromCafe = db.queryRecipes(
            {...BASE, filters: ["sharedBy:CAFÉ"]}, resolveLibraryFilter
        ).map((recipe) => byUuid[recipe.uuid]);

        expect(fromCafe).toEqual(["sent"]);
        expect(labelsMatching(db, "mine", uuids)).toEqual([]);
    });

    it("selects hot by max temperature and excludes the templess", () => {
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            hot: {createdAt: 1, maxTemp: 94},
            warm: {createdAt: 2, maxTemp: 90},
            unset: {createdAt: 3}
        });
        expect(labelsMatching(db, "hot", uuids)).toEqual(["hot"]);
    });

    it("selects recently-added by a bound cutoff, excluding the old", () => {
        const db = new RecipeDatabase();
        const now = Date.now();
        const uuids = seed(db, {
            fresh: {createdAt: now - 1000},
            stale: {createdAt: now - 60 * 24 * 60 * 60 * 1000}
        });
        expect(labelsMatching(db, "recentlyAdded", uuids)).toEqual(["fresh"]);
    });
});

describe("asLibraryFilters against untrusted input", () => {
    it("drops a non-string rather than throwing on it", () => {
        // A restored setting is whatever was in the file. A number reaching
        // `startsWith` is a crash on launch, not a dropped filter.
        expect(asLibraryFilters([1, null, {}, "tea"])).toEqual(["tea"]);
    });
});

describe("per-author shelves", () => {
    it("names a shelf after the person who shared it", () => {
        expect(authorFilterId("BrewMind")).toBe("sharedBy:BrewMind");
        expect(authorFromFilterId("sharedBy:BrewMind")).toBe("BrewMind");
    });

    it("does not read a tag or a stock id as an author", () => {
        expect(authorFromFilterId("tag:morning")).toBeNull();
        expect(authorFromFilterId("tea")).toBeNull();
    });

    it("does not read a bare prefix as an author with no name", () => {
        expect(authorFromFilterId("sharedBy:")).toBeNull();
    });

    it("resolves to the folded column, not the ASCII collation", () => {
        // `sharedBy COLLATE NOCASE` would make CAFÉ and café two people.
        const clause = resolveLibraryFilter("sharedBy:CAFÉ");

        expect(clause?.where).toBe("sharedByKey = ?");
        expect(clause?.params).toEqual(["café"]);
    });

    it("binds the name rather than splicing it into the SQL", () => {
        // It is the one value here a person authored.
        const clause = resolveLibraryFilter("sharedBy:Bobby'; DROP TABLE recipes;--");

        expect(clause?.where).toBe("sharedByKey = ?");
        expect(clause?.params).toHaveLength(1);
    });

    it("survives a relaunch, which is the whole of issue 126's first half", () => {
        // `asLibraryFilters` used to drop every id it did not recognise, so an
        // author filter would have been discarded the moment the app restarted.
        expect(asLibraryFilters(["sharedBy:BrewMind", "tea", "nonsense"]))
            .toEqual(["sharedBy:BrewMind", "tea"]);
    });

    it("labels the shelf with the app's word and the sharer's spelling", () => {
        expect(filterLabel("sharedBy:BrewMind")).toBe("FROM BrewMind");
    });
});

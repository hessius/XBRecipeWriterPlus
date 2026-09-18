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
        // throw and take the screen down; asStockFilters is where it is dropped.
        expect(asStockFilters(["tea", "ghost", "strong"])).toEqual(["tea", "strong"]);
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
        const count = spec.pourCount ?? 1;
        recipe.pours = Array.from({length: count}, (_unused, index) =>
            new Pour(index + 1, undefined, spec.maxTemp)
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

    it("selects single-pour and many-stages by pour count", () => {
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            one: {createdAt: 1, pourCount: 1},
            three: {createdAt: 2, pourCount: 3},
            four: {createdAt: 3, pourCount: 4}
        });
        expect(labelsMatching(db, "singlePour", uuids)).toEqual(["one"]);
        expect(labelsMatching(db, "manyStages", uuids)).toEqual(["four"]);
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

    it("selects strong and long by ratio", () => {
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            strong: {createdAt: 1, ratio: 14},
            middle: {createdAt: 2, ratio: 15},
            long: {createdAt: 3, ratio: 17}
        });
        expect(labelsMatching(db, "strong", uuids)).toEqual(["strong"]);
        expect(labelsMatching(db, "long", uuids)).toEqual(["long"]);
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

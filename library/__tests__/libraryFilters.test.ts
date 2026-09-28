import {createTestDatabase, type FakeSQLiteDatabase} from "@/test-utils/sqlite";
import {
    authorFilterId,
    authorFromFilterId,
    availableFilters,
    asLibraryFilters,
    chipFilters,
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
import Recipe, {CUP_TYPE, type RecipeSource} from "@/library/Recipe";
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
    favourite?: boolean;
    source?: RecipeSource;
};

function seed(db: RecipeDatabase, specs: Record<string, Spec>): Record<string, string> {
    const uuids: Record<string, string> = {};
    for (const [label, spec] of Object.entries(specs)) {
        const recipe = new Recipe();
        recipe.createdAt = spec.createdAt;
        recipe.cupType = spec.cupType ?? CUP_TYPE.OTHER;
        recipe.grinder = spec.grinder ?? true;
        recipe.ratio = spec.ratio ?? 15;
        recipe.favourite = spec.favourite ?? false;
        if (spec.xid !== undefined) recipe.xid = spec.xid;
        if (spec.sharedBy !== undefined) recipe.sharedBy = spec.sharedBy;
        if (spec.source !== undefined) recipe.source = spec.source;
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
    it("selects tea, pod, omni-dripper and other-brewer by cup type", () => {
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            tea: {createdAt: 1, cupType: CUP_TYPE.TEA},
            pod: {createdAt: 2, cupType: CUP_TYPE.XPOD},
            omni: {createdAt: 3, cupType: CUP_TYPE.OMNI},
            other: {createdAt: 4, cupType: CUP_TYPE.OTHER}
        });
        expect(labelsMatching(db, "tea", uuids)).toEqual(["tea"]);
        expect(labelsMatching(db, "pods", uuids)).toEqual(["pod"]);
        expect(labelsMatching(db, "omniDripper", uuids)).toEqual(["omni"]);
        expect(labelsMatching(db, "otherBrewer", uuids)).toEqual(["other"]);
    });

    /**
     * The bug #151 fixed was these two shelves being confused with each other,
     * so this says directly what the pair must never do. It is not implied by
     * the test above: that one would still pass if both shelves selected both
     * recipes and `labelsMatching` happened to sort them the same way.
     *
     * OMNI is what `newRecipe.ts` gives every new recipe, so a mistake that
     * emptied this shelf into the other one would take most of the library
     * with it.
     */
    it("keeps the two cup shelves disjoint", () => {
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            omni: {createdAt: 1, cupType: CUP_TYPE.OMNI},
            other: {createdAt: 2, cupType: CUP_TYPE.OTHER}
        });

        expect(labelsMatching(db, "omniDripper", uuids)).not.toContain("other");
        expect(labelsMatching(db, "otherBrewer", uuids)).not.toContain("omni");
        expect(filterLabel("omniDripper")).toBe("OMNI DRIPPER");
        expect(filterLabel("otherBrewer")).toBe("OTHER BREWER");
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

    it("selects mine as the recipes the user wrote", () => {
        // Not the complement of the author shelves, which is what it used to
        // be. Only a share link carries a sharer, so "nobody sent me this" was
        // also true of a pod pulled off xBloom's catalogue, and MINE ended up
        // holding almost every library and being withdrawn for saying nothing.
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            typed:     {createdAt: 1, source: "manual"},
            card:      {createdAt: 2, source: "read"},
            copied:    {createdAt: 3, source: "duplicate"},
            catalogue: {createdAt: 4, source: "import", xid: "ABC12345"},
            sent:      {createdAt: 5, source: "import", sharedBy: "BrewMind"}
        });
        expect(labelsMatching(db, "mine", uuids)).toEqual(["typed"]);
    });

    it("keeps a recipe off mine however it reached the library", () => {
        // The four ways in that are not writing one. Each has its own honest
        // description on the card front, and none of them is authorship.
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            card:   {createdAt: 1, source: "read"},
            copied: {createdAt: 2, source: "duplicate"},
            sent:   {createdAt: 3, source: "import", sharedBy: "café"}
        });
        expect(labelsMatching(db, "mine", uuids)).toEqual([]);
    });

    it("still reaches an accented author through their own shelf", () => {
        // MINE and the author shelves no longer partition the library, but the
        // author half still has to match on the folded key: under `sharedBy
        // COLLATE NOCASE` the clause misses "café" and the recipe is on no
        // shelf at all.
        const db = new RecipeDatabase();
        const uuids = seed(db, {sent: {createdAt: 1, sharedBy: "café"}});
        const byUuid = Object.fromEntries(
            Object.entries(uuids).map(([k, v]) => [v, k])
        );
        const fromCafe = db.queryRecipes(
            {...BASE, filters: ["sharedBy:CAFÉ"]}, resolveLibraryFilter
        ).map((recipe) => byUuid[recipe.uuid]);

        expect(fromCafe).toEqual(["sent"]);
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

    it("selects favourites by the mark and nothing else", () => {
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            picked: {createdAt: 1, favourite: true},
            plain: {createdAt: 2}
        });
        expect(labelsMatching(db, "favourites", uuids)).toEqual(["picked"]);
    });
});

/**
 * The three call sites a clause has to survive, and the one word that decides
 * what the brew shelves mean.
 *
 * `buildLibraryQuery` joins `brewStats` and the other two do not, so a clause
 * written against `brewCount` would fill the list correctly and throw
 * `no such column` in the count that decides whether to draw the shelf and in
 * the art on its tile. Every assertion below is made through all three.
 */
describe("the brew shelves", () => {
    /**
     * Brew rows written straight into the shared file.
     *
     * `RecipeDatabase`'s own constructor calls `ensureBrewTables`, which is
     * what lets a filter clause name `brews` at all, so nothing here has to
     * create the table. Columns are named rather than positional because the
     * defaults are what make the row minimal.
     */
    function brew(recipeUuid: string, outcome: string, id: string): void {
        mockBacking.runSync(
            `INSERT INTO brews (
                id, recipeUuid, recipeName, accent, startedAt, endedAt,
                outcome, pours, waterTotal, cupTotal, heldSeconds, hasStream
            ) VALUES (?, ?, 'Fixture', '#000000', 1, 2, ?, 1, 200, 200, 0, 0);`,
            [id, recipeUuid, outcome]
        );
    }

    function brewed(recipeUuid: string, times: number, outcome = "done"): void {
        for (let n = 0; n < times; n += 1) {
            brew(recipeUuid, outcome, `${recipeUuid}-${outcome}-${n}`);
        }
    }

    /** The shelf's members read the way the tile's art reads them. */
    function artFor(db: RecipeDatabase, id: FilterId): number {
        return db.shelfMembers([id], resolveStockFilter)[id].length;
    }

    it("puts a recipe with no brews on NEVER BREWED and not on MOST BREWED", () => {
        const db = new RecipeDatabase();
        const uuids = seed(db, {fresh: {createdAt: 1}});

        expect(labelsMatching(db, "neverBrewed", uuids)).toEqual(["fresh"]);
        expect(labelsMatching(db, "mostBrewed", uuids)).toEqual([]);
        expect(db.countRecipesByFilter(
            ["neverBrewed", "mostBrewed"], resolveStockFilter
        )).toEqual({neverBrewed: 1, mostBrewed: 0});
        expect(artFor(db, "neverBrewed")).toBe(1);
        expect(artFor(db, "mostBrewed")).toBe(0);
    });

    it("takes a recipe off NEVER BREWED after a single cup", () => {
        const db = new RecipeDatabase();
        const uuids = seed(db, {once: {createdAt: 1}, never: {createdAt: 2}});
        brewed(uuids.once, 1);

        expect(labelsMatching(db, "neverBrewed", uuids)).toEqual(["never"]);
        expect(db.countRecipesByFilter(["neverBrewed"], resolveStockFilter))
            .toEqual({neverBrewed: 1});
        expect(artFor(db, "neverBrewed")).toBe(1);
    });

    it("puts a recipe on MOST BREWED at three cups and not at two", () => {
        // The threshold pinned at its edge in both directions, because an
        // off-by-one changes which recipes the shelf claims are the ones the
        // user keeps going back to.
        const db = new RecipeDatabase();
        const uuids = seed(db, {two: {createdAt: 1}, three: {createdAt: 2}});
        brewed(uuids.two, 2);
        brewed(uuids.three, 3);

        expect(labelsMatching(db, "mostBrewed", uuids)).toEqual(["three"]);
        expect(db.countRecipesByFilter(["mostBrewed"], resolveStockFilter))
            .toEqual({mostBrewed: 1});
        expect(artFor(db, "mostBrewed")).toBe(1);
    });

    it("counts a machine-ended brew as a cup, the way the card does", () => {
        const db = new RecipeDatabase();
        const uuids = seed(db, {mixed: {createdAt: 1}});
        brewed(uuids.mixed, 3, "done");
        brewed(uuids.mixed, 2, "endedOnMachine");

        expect(labelsMatching(db, "mostBrewed", uuids)).toEqual(["mixed"]);
    });

    it("does not let cancelled brews take a recipe off NEVER BREWED", () => {
        // The one word the issue's proposed clause was missing. `brewCount`,
        // `brewEvidence` and `librarySort`'s never-brewed-last guard are all
        // the counted population, so a shelf counting bare rows would take
        // this recipe off NEVER BREWED while its own card still said nothing
        // had been brewed and BREW COUNT sorted it with the never-brewed.
        const db = new RecipeDatabase();
        const uuids = seed(db, {abandoned: {createdAt: 1}});
        for (const outcome of ["cancelled", "lostContact", "failed"]) {
            brewed(uuids.abandoned, 3, outcome);
        }

        expect(labelsMatching(db, "neverBrewed", uuids)).toEqual(["abandoned"]);
        expect(labelsMatching(db, "mostBrewed", uuids)).toEqual([]);
        expect(db.countRecipesByFilter(
            ["neverBrewed", "mostBrewed"], resolveStockFilter
        )).toEqual({neverBrewed: 1, mostBrewed: 0});
    });

    it("counts only the recipe's own brews, not the library's", () => {
        // The correlation itself. A subquery that lost its `WHERE
        // brews.recipeUuid = recipes.uuid` would put every recipe on MOST
        // BREWED the moment any one of them reached five, and empty NEVER
        // BREWED entirely.
        const db = new RecipeDatabase();
        const uuids = seed(db, {popular: {createdAt: 1}, ignored: {createdAt: 2}});
        brewed(uuids.popular, 6);

        expect(labelsMatching(db, "mostBrewed", uuids)).toEqual(["popular"]);
        expect(labelsMatching(db, "neverBrewed", uuids)).toEqual(["ignored"]);
    });

    it("keeps the two shelves disjoint without a guard for it", () => {
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            never: {createdAt: 1}, once: {createdAt: 2}, often: {createdAt: 3}
        });
        brewed(uuids.once, 1);
        brewed(uuids.often, 5);

        const never = labelsMatching(db, "neverBrewed", uuids);
        const most = labelsMatching(db, "mostBrewed", uuids);
        expect(never).toEqual(["never"]);
        expect(most).toEqual(["often"]);
        expect(never.filter((label) => most.includes(label))).toEqual([]);
    });
});

describe("STARRED is not suppressed", () => {
    // A favourite is a tap somebody made, so the shelf is exempt from both
    // gates the way a manual tag shelf is. It still goes through
    // `availableFilters`, because that is the one gate the chips and the grid
    // share, which is what the `authored` flag on the filter is for.
    it("offers a shelf of one where an invented shelf of two is refused", () => {
        expect(availableFilters({favourites: 1}, 100)).toEqual(["favourites"]);
        expect(availableFilters({hot: 2}, 100)).toEqual([]);
    });

    it("offers it above the 80% ceiling that silences an invented shelf", () => {
        expect(availableFilters({favourites: 100}, 100)).toEqual(["favourites"]);
        expect(availableFilters({hot: 100}, 100)).toEqual([]);
    });

    it("does not offer it when nothing is favourited", () => {
        // The one thing the exemption must not do. An empty shelf is a tile
        // that opens onto nothing, and a library nobody has favourited in has
        // no favourites shelf at all.
        expect(availableFilters({favourites: 0}, 100)).toEqual([]);
    });

    it("exempts nothing else", () => {
        // Read off the vocabulary rather than hard-coded, so a second
        // `authored` shelf added later is a deliberate act and not a typo that
        // quietly opts a shelf out of suppression.
        const authored = STOCK_FILTER_ORDER.filter((id) => STOCK_FILTERS[id].authored);
        expect(authored).toEqual(["favourites", "allRecipes"]);
    });
});

describe("the shelves that answer at one recipe", () => {
    // A superlative and a calendar window. Both are true and complete answers
    // at a single recipe, unlike a category such as HOT, which needs a few
    // before it says anything the recipes do not say themselves.
    it.each(["mostBrewed", "recentlyAdded"])("offers %s holding one", (id) => {
        expect(availableFilters({[id]: 1}, 100)).toEqual([id]);
    });

    it("still refuses an invented category of one or two", () => {
        expect(availableFilters({hot: 1}, 100)).toEqual([]);
        expect(availableFilters({hot: 2}, 100)).toEqual([]);
    });

    it("keeps the 80% ceiling over them", () => {
        // The lower floor is not the `authored` exemption. These are still
        // questions the app asks, so one that has grown to the whole library
        // is still the library wearing a name.
        expect(availableFilters({mostBrewed: 81}, 100)).toEqual([]);
        expect(availableFilters({recentlyAdded: 81}, 100)).toEqual([]);
        expect(availableFilters({mostBrewed: 80}, 100)).toEqual(["mostBrewed"]);
    });

    it("lowers the floor for those two and nothing else", () => {
        // Read off the vocabulary, so a third shelf given the lower floor is a
        // deliberate act rather than a typo nobody notices.
        const lowered = STOCK_FILTER_ORDER.filter((id) => STOCK_FILTERS[id].floor === 1);
        expect(lowered).toEqual(["mostBrewed", "recentlyAdded"]);
    });

    it("does not offer either one empty", () => {
        expect(availableFilters({mostBrewed: 0, recentlyAdded: 0}, 100)).toEqual([]);
    });
});

describe("ALL RECIPES", () => {
    it("resolves to a clause that matches everything", () => {
        expect(resolveStockFilter("allRecipes")).toEqual({where: "1 = 1"});
    });

    it("is offered however much of the library it holds", () => {
        // Its count is the library, so the 80% ceiling would take it away the
        // moment it worked. It waives both gates the way STARRED does.
        expect(availableFilters({allRecipes: 40}, 40, [])).toContain("allRecipes");
        expect(availableFilters({allRecipes: 1}, 1, [])).toContain("allRecipes");
    });

    it("is not offered by an empty library", () => {
        expect(availableFilters({allRecipes: 0}, 0, [])).not.toContain("allRecipes");
    });

    it("is last in the stock order", () => {
        expect(STOCK_FILTER_ORDER[STOCK_FILTER_ORDER.length - 1]).toBe("allRecipes");
    });
});

describe("chipFilters", () => {
    it("drops a grid-only filter from the rail", () => {
        // A chip that narrows nothing is noise on a rail whose whole job is
        // narrowing. The grid still draws the tile.
        expect(chipFilters(["tea", "allRecipes", "mine"])).toEqual(["tea", "mine"]);
    });

    it("leaves every other filter alone", () => {
        expect(chipFilters(["tea", "mine"])).toEqual(["tea", "mine"]);
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

describe("asLibraryFilters and unresolvable bean ids", () => {
    it("drops a parseable bean id the resolver refuses", () => {
        // buildLibraryQuery throws on an id it cannot resolve, and that throw
        // is reserved for the vocabulary and the resolver disagreeing. A gate
        // testing shape alone would let this one through to it.
        expect(resolveLibraryFilter("bean:roast:Medium-Dark")).toBeNull();
        expect(asLibraryFilters(["bean:roast:Medium-Dark", "tea"])).toEqual(["tea"]);
    });

    it("drops a custom bean id whose value folds away to nothing", () => {
        expect(resolveLibraryFilter("bean:custom:   ")).toBeNull();
        expect(asLibraryFilters(["bean:custom:   "])).toEqual([]);
    });

    it("keeps every bean id the resolver accepts", () => {
        const ids = ["bean:process:Natural", "bean:rated:roast:Light",
                     "bean:custom:mornings", "bean:origin:Ethiopia"];
        for (const id of ids) expect(resolveLibraryFilter(id)).not.toBeNull();
        expect(asLibraryFilters(ids)).toEqual(ids);
    });
});

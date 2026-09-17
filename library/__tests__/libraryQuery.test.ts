import {createTestDatabase, type FakeSQLiteDatabase} from "@/test-utils/sqlite";
import {
    buildLibraryQuery,
    type FilterResolver,
    type LibraryQuery
} from "@/library/libraryQuery";

/**
 * Two kinds of test in one file, and they check different things.
 *
 * The pure-builder block reads the statement and its parameters straight from
 * `buildLibraryQuery` and asserts on shape -- chiefly that user text is bound,
 * never spliced. The integration block runs the built statement against a real
 * in-memory SQLite (`node:sqlite`, through the same harness the index tests
 * use) and asserts on the rows that come back. String assertions pin wording
 * and prove nothing about results, so the ordering and filtering claims are all
 * made against real query output; the string assertions are reserved for the
 * security invariant, where the point is precisely the text of the statement.
 */

let mockBacking: FakeSQLiteDatabase;

jest.mock("expo-sqlite", () => ({
    openDatabaseSync: () => mockBacking
}));

/* eslint-disable import/first */
import RecipeDatabase from "@/library/RecipeDatabase";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
/* eslint-enable import/first */

beforeEach(() => {
    mockBacking = createTestDatabase();
});

const BASE: LibraryQuery = {
    search: "",
    filters: [],
    sort: "name",
    direction: "asc",
    favouritesFirst: false
};

function query(overrides: Partial<LibraryQuery> = {}): LibraryQuery {
    return {...BASE, ...overrides};
}

describe("the built statement", () => {
    it("always joins the brew aggregate under the contract column names", () => {
        // librarySort's never-brewed-last guards key on exactly these two
        // names, so the join must expose them whatever the axis. Pinned so a
        // rename on either side is caught here rather than at runtime.
        const {sql} = buildLibraryQuery(query());
        expect(sql).toContain("MAX(startedAt) AS lastBrewedAt");
        expect(sql).toContain("COUNT(*) AS brewCount");
        expect(sql).toContain("LEFT JOIN");
    });

    it("selects the blob so a whole recipe can be hydrated", () => {
        expect(buildLibraryQuery(query()).sql).toContain("recipes.recipeJSON");
    });

    it("binds a search term rather than interpolating it", () => {
        // The security invariant. A recipe name is untrusted input; a term
        // carrying SQL metacharacters must reach SQLite as a bound value, never
        // as text in the statement.
        const hostile = "'; DROP TABLE recipes;--";
        const {sql, params} = buildLibraryQuery(query({search: hostile}));

        expect(sql).not.toContain(hostile);
        expect(sql).not.toContain("DROP TABLE recipes");
        expect(params).toContain(`%${hostile}%`);
        // One bound value per `?`. Not every column binds the same pattern --
        // `sortName` takes the accent-folded term and the tag subquery the
        // case-folded one -- so this counts the values carrying the hostile text
        // in any of its foldings rather than matching one exact string. A
        // miscount is what matters, and SQLite would reject it anyway.
        const placeholders = (sql.match(/LIKE \? ESCAPE/g) ?? []).length;
        const bound = params.filter(
            (p): p is string =>
                typeof p === "string" && p.toLowerCase() === `%${hostile}%`.toLowerCase()
        );
        expect(bound).toHaveLength(placeholders);
        // And every one of them arrived whole, so no folding quietly dropped a
        // metacharacter on its way to being bound.
        for (const value of bound) expect(value.toLowerCase()).toContain("drop table recipes");
    });

    it("escapes LIKE wildcards so a literal percent is a literal percent", () => {
        // `100%` must match the recipe called `100%`, not every recipe.
        const {sql, params} = buildLibraryQuery(query({search: "100%"}));
        expect(params[0]).toBe("%100\\%%");
        expect(sql).toContain("ESCAPE '\\'");
    });

    it("adds no search clause for an empty or whitespace term", () => {
        expect(buildLibraryQuery(query({search: "   "})).params).toEqual([]);
        expect(buildLibraryQuery(query()).sql).not.toContain("LIKE");
    });

    it("leads with favourites only when asked", () => {
        expect(buildLibraryQuery(query()).sql).not.toContain("favourite DESC");
        expect(buildLibraryQuery(query({favouritesFirst: true})).sql)
            .toContain("ORDER BY favourite DESC,");
    });

    it("resolves each filter id to its clause and binds its params", () => {
        const resolve: FilterResolver = (id) =>
            id === "author"
                ? {where: "sharedBy = ?", params: ["Bird & Wire"]}
                : null;
        const {sql, params} = buildLibraryQuery(
            query({filters: ["author"]}), resolve
        );
        expect(sql).toContain("(sharedBy = ?)");
        expect(sql).not.toContain("Bird & Wire");
        expect(params).toEqual(["Bird & Wire"]);
    });

    it("refuses a filter id the resolver does not know", () => {
        // A silent unfiltered library would be a wrong answer with more recipes
        // than asked for, so an unresolved id throws rather than dropping.
        expect(() => buildLibraryQuery(query({filters: ["ghost"]})))
            .toThrow(/unknown filter id/);
    });

    it("has no LIMIT", () => {
        expect(buildLibraryQuery(query()).sql.toUpperCase()).not.toContain("LIMIT");
    });
});

type Spec = {
    name?: string;
    createdAt: number;
    ratio: number;
    favourite?: boolean;
    tea?: boolean;
    xid?: string;
    sharedBy?: string;
    description?: string;
    tags?: string[];
    /** Brew start timestamps; length is the times-brewed count. */
    brews?: number[];
};

function seed(db: RecipeDatabase, specs: Record<string, Spec>): Record<string, string> {
    const uuids: Record<string, string> = {};
    for (const [label, spec] of Object.entries(specs)) {
        const recipe = new Recipe();
        if (spec.name !== undefined) recipe.name = spec.name;
        recipe.createdAt = spec.createdAt;
        recipe.ratio = spec.ratio;
        recipe.favourite = spec.favourite ?? false;
        if (spec.tea) recipe.cupType = CUP_TYPE.TEA;
        if (spec.xid !== undefined) recipe.xid = spec.xid;
        if (spec.sharedBy !== undefined) recipe.sharedBy = spec.sharedBy;
        if (spec.description !== undefined) recipe.description = spec.description;
        if (spec.tags) recipe.setTags(spec.tags);
        db.insertRecipe(recipe);
        uuids[label] = recipe.uuid;

        (spec.brews ?? []).forEach((startedAt, index) => {
            mockBacking.runSync(
                `INSERT INTO brews (id, recipeUuid, recipeName, accent, startedAt,
                                    pouringAt, endedAt, outcome, failure, pours,
                                    waterTotal, cupTotal, heldSeconds, stalls, plan,
                                    stageWater, hasStream)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
                [
                    `${recipe.uuid}-${index}`, recipe.uuid, "n", "a", startedAt,
                    0, startedAt, "completed", null, 1,
                    0, 0, 0, "[]", "[]", "[]", 0
                ]
            );
        });
    }
    return uuids;
}

/** The result as labels, so an assertion reads in the seed's own terms. */
function order(db: RecipeDatabase, q: LibraryQuery, uuids: Record<string, string>): string[] {
    const byUuid = Object.fromEntries(Object.entries(uuids).map(([k, v]) => [v, k]));
    return db.queryRecipes(q).map((recipe) => byUuid[recipe.uuid]);
}

describe("querying a real database", () => {
    it("sorts by name A to Z and Z to A, with the unnamed always last", () => {
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            alpha: {name: "Alpha", createdAt: 1, ratio: 15},
            bravo: {name: "bravo", createdAt: 2, ratio: 16},
            charlie: {name: "Charlie", createdAt: 3, ratio: 17},
            nameless: {createdAt: 4, ratio: 18}
        });

        expect(order(db, query({sort: "name", direction: "asc"}), uuids))
            .toEqual(["alpha", "bravo", "charlie", "nameless"]);
        // Unnamed stays last under Z to A -- it is not a name, so it does not
        // lead the reversed list.
        expect(order(db, query({sort: "name", direction: "desc"}), uuids))
            .toEqual(["charlie", "bravo", "alpha", "nameless"]);
    });

    it("folds accents for the name sort but keeps Nordic letters after Z", () => {
        // The bug this whole change exists to fix: sortName is a diacritic-
        // folded key, so "Étna" sorts as "Etna" -- between "Ethiopia" and
        // "Zambia" -- rather than after "Zambia" where a raw NOCASE comparison
        // of its code points put it. "Öland" is a genuine Nordic letter that is
        // deliberately not folded, so it still sorts after "Zambia".
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            ethiopia: {name: "Ethiopia", createdAt: 1, ratio: 15},
            etna: {name: "Étna", createdAt: 2, ratio: 15},
            zambia: {name: "Zambia", createdAt: 3, ratio: 15},
            oland: {name: "Öland", createdAt: 4, ratio: 15}
        });
        expect(order(db, query({sort: "name", direction: "asc"}), uuids))
            .toEqual(["ethiopia", "etna", "zambia", "oland"]);
    });

    it("finds an accented name whether or not the accent is typed", () => {
        // Both directions, because the folded key can only be matched by a
        // folded term: search for "Etna" has to reach "Étna", and so does a
        // search for "Étna" typed exactly as the recipe spells it.
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            etna: {name: "Étna", createdAt: 1, ratio: 15},
            zambia: {name: "Zambia", createdAt: 2, ratio: 15}
        });
        expect(order(db, query({search: "Etna"}), uuids)).toEqual(["etna"]);
        expect(order(db, query({search: "Étna"}), uuids)).toEqual(["etna"]);
    });

    it("sorts by date added", () => {
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            old: {name: "A", createdAt: 100, ratio: 15},
            mid: {name: "B", createdAt: 200, ratio: 15},
            recent: {name: "C", createdAt: 300, ratio: 15}
        });
        expect(order(db, query({sort: "added", direction: "desc"}), uuids))
            .toEqual(["recent", "mid", "old"]);
        expect(order(db, query({sort: "added", direction: "asc"}), uuids))
            .toEqual(["old", "mid", "recent"]);
    });

    it("sorts by ratio", () => {
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            strong: {name: "A", createdAt: 1, ratio: 12},
            middle: {name: "B", createdAt: 2, ratio: 15},
            weak: {name: "C", createdAt: 3, ratio: 18}
        });
        expect(order(db, query({sort: "ratio", direction: "asc"}), uuids))
            .toEqual(["strong", "middle", "weak"]);
        expect(order(db, query({sort: "ratio", direction: "desc"}), uuids))
            .toEqual(["weak", "middle", "strong"]);
    });

    it("keeps the never-brewed last under last-brewed in both directions", () => {
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            recent: {name: "A", createdAt: 1, ratio: 15, brews: [900]},
            older: {name: "B", createdAt: 2, ratio: 15, brews: [500]},
            never: {name: "C", createdAt: 3, ratio: 15}
        });
        // RECENT first, and the neglected recipe does not vanish -- it trails.
        expect(order(db, query({sort: "lastBrewed", direction: "desc"}), uuids))
            .toEqual(["recent", "older", "never"]);
        // LONGEST AGO must not open with the recipe nobody has ever brewed.
        expect(order(db, query({sort: "lastBrewed", direction: "asc"}), uuids))
            .toEqual(["older", "recent", "never"]);
    });

    it("keeps the never-brewed last under times-brewed in both directions", () => {
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            most: {name: "A", createdAt: 1, ratio: 15, brews: [1, 2, 3]},
            once: {name: "B", createdAt: 2, ratio: 15, brews: [1]},
            never: {name: "C", createdAt: 3, ratio: 15}
        });
        expect(order(db, query({sort: "timesBrewed", direction: "desc"}), uuids))
            .toEqual(["most", "once", "never"]);
        // LEAST: zero would lead a naive sort; the guard forces it last.
        expect(order(db, query({sort: "timesBrewed", direction: "asc"}), uuids))
            .toEqual(["once", "most", "never"]);
    });

    it("searches name, tag, xid, author and description, and nothing else", () => {
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            byName: {name: "Ethiopia Guji", createdAt: 1, ratio: 15},
            byTag: {name: "Blend", createdAt: 2, ratio: 15, tags: ["guji lot"]},
            byXid: {name: "Card", createdAt: 3, ratio: 15, xid: "GUJI99"},
            byAuthor: {name: "Gift", createdAt: 4, ratio: 15, sharedBy: "Guji Roasters"},
            byDescription: {name: "Note", createdAt: 5, ratio: 15, description: "A guji lot from spring"},
            miss: {name: "Kenya", createdAt: 6, ratio: 15}
        });
        const found = order(db, query({search: "guji"}), uuids);
        expect(found.sort())
            .toEqual(["byAuthor", "byDescription", "byName", "byTag", "byXid"]);
        expect(found).not.toContain("miss");
    });

    it("finds an accented tag whatever case either side is written in", () => {
        // The tag table holds two forms: `tag` as the user typed it, and
        // `tagKey` folded for matching. LIKE folds ASCII case and nothing else,
        // so against the display `tag` this search found CAFÉ only when the
        // accented letter happened to match in case -- which is to say, for a
        // non-English user, almost never.
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            shouty: {name: "Morning", createdAt: 1, ratio: 15, tags: ["CAFÉ"]},
            quiet: {name: "Evening", createdAt: 2, ratio: 15, tags: ["café"]},
            miss: {name: "Kenya", createdAt: 3, ratio: 15, tags: ["cafe"]}
        });
        // Either spelling of the query reaches both spellings of the tag, and
        // neither reaches the unaccented one, which is a different tag.
        for (const search of ["café", "CAFÉ"]) {
            expect(order(db, query({search}), uuids).sort()).toEqual(["quiet", "shouty"]);
        }
    });

    it("finds a Nordic name typed in either case", () => {
        // The same trap the tag search fell into, one column over. `sortName`
        // preserves the Nordic letters rather than folding them, so it holds
        // "Öland"; the rail hands the query a lowercased term, so it asks for
        // "öland"; and LIKE folds ASCII case and nothing else. The result was
        // that a Swedish or Danish user could not find a recipe by typing its
        // name, which is the one thing search exists for.
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            oland: {name: "Öland", createdAt: 1, ratio: 15},
            aland: {name: "Åland", createdAt: 2, ratio: 15},
            miss: {name: "Oland", createdAt: 3, ratio: 15}
        });
        for (const search of ["öland", "Öland", "ÖLAND"]) {
            expect(order(db, query({search}), uuids)).toEqual(["oland"]);
        }
        expect(order(db, query({search: "åland"}), uuids)).toEqual(["aland"]);
    });

    it("treats a percent in the term as a literal, not a wildcard", () => {
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            literal: {name: "100% Washed", createdAt: 1, ratio: 15},
            // A wildcard `%100%%` would match this too; the literal `100%` must
            // not, because it contains "100" but not "100%".
            decoy: {name: "100X Natural", createdAt: 2, ratio: 15},
            other: {name: "Fully Natural", createdAt: 3, ratio: 15}
        });
        expect(order(db, query({search: "100%"}), uuids)).toEqual(["literal"]);
    });

    it("leads with favourites while keeping the chosen axis within each group", () => {
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            // Favourites named so they sort *after* the plain ones, so
            // favourites-first is distinguishable from a plain name sort.
            favZ: {name: "Zulu", createdAt: 1, ratio: 15, favourite: true},
            favY: {name: "Yankee", createdAt: 2, ratio: 15, favourite: true},
            plainB: {name: "Bravo", createdAt: 3, ratio: 15},
            plainA: {name: "Alpha", createdAt: 4, ratio: 15}
        });
        // Favourites A to Z, then the rest A to Z -- the modifier composes with
        // the axis, it does not replace it.
        expect(order(db, query({favouritesFirst: true, sort: "name", direction: "asc"}), uuids))
            .toEqual(["favY", "favZ", "plainA", "plainB"]);
    });

    it("narrows to a resolved filter", () => {
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            tea: {name: "Sencha", createdAt: 1, ratio: 15, tea: true},
            coffee: {name: "Espresso", createdAt: 2, ratio: 15}
        });
        const teaOnly: FilterResolver = (id) =>
            id === "tea" ? {where: "isTea = 1"} : null;
        expect(db.queryRecipes(query({filters: ["tea"]}), teaOnly).map((r) => r.uuid))
            .toEqual([uuids.tea]);
    });
});

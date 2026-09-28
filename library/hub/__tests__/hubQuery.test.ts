/**
 * The hub query is local because the server's facet filters do not match the
 * catalogue it returns. These tests protect the rail's semantics rather than a
 * request shape the app no longer sends.
 */
import {
    buildHubRequest,
    EMPTY_HUB_QUERY,
    HUB_SORTS,
    hubFacetCounts,
    hubQueryIsNarrowed,
    machineCode,
    matchesHubQuery,
    sortHubRows
} from "@/library/hub/hubQuery";
import type {HubQuery} from "@/library/hub/hubQuery";
import type {HubRecipe} from "@/library/hub/hubRow";

function recipe(patch: Partial<HubRecipe> = {}): HubRecipe {
    return {
        id: 1,
        name: "Colombia Sunrise",
        imageURL: null,
        author: "Marta",
        official: false,
        machine: "J15",
        cupType: "xPod",
        coffeeType: "Single Origin",
        origin: ["Colombia"],
        varietal: ["Bourbon"],
        process: ["Washed"],
        flavour: ["Stone Fruit"],
        roast: 2,
        dose: 15,
        grind: 55,
        rpm: 60,
        pourCount: 3,
        ratio: 16,
        volume: 240,
        shareLink: "https://example.com/1",
        ...patch
    };
}

function query(patch: Partial<HubQuery> = {}): HubQuery {
    return {...EMPTY_HUB_QUERY, ...patch};
}

describe("which machine is asked about", () => {
    it("asks about the machine the user owns", () => {
        expect(machineCode("studio")).toBe("J15");
        expect(machineCode("original")).toBe("J20");
    });

    it("never asks about both at once", () => {
        expect(buildHubRequest("studio", 1).machineList).toEqual(["J15"]);
        expect(buildHubRequest("original", 1).machineList).toEqual(["J20"]);
    });
});

describe("matching rows locally", () => {
    it("matches the whole catalogue when every facet and the keyword are empty", () => {
        expect(matchesHubQuery(recipe(), EMPTY_HUB_QUERY)).toBe(true);
    });

    it("matches when any value inside one facet was chosen", () => {
        expect(matchesHubQuery(recipe({origin: ["Kenya", "Colombia"]}),
                              query({origins: ["Ethiopia", "Colombia"]}))).toBe(true);
    });

    it("requires every non-empty facet to match", () => {
        expect(matchesHubQuery(recipe(),
                              query({origins: ["Colombia"], processes: ["Washed"]}))).toBe(true);
        expect(matchesHubQuery(recipe(),
                              query({origins: ["Colombia"], processes: ["Natural"]}))).toBe(false);
    });

    it("compares facet values case-insensitively after trimming", () => {
        expect(matchesHubQuery(recipe({process: [" Washed "]}),
                              query({processes: [" washed "]}))).toBe(true);
    });

    it("ignores blank chosen facet values rather than narrowing everything away", () => {
        // Defends the selected-value cleanup: a blank chip value should behave
        // like no chip, not like an impossible filter.
        expect(matchesHubQuery(recipe(), query({origins: ["   "]}))).toBe(true);
    });

    it("does not match an unset roast to a chosen roast", () => {
        // Defends the null-roast guard: an unstated roast is not one of the
        // server's five roast words.
        expect(matchesHubQuery(recipe({roast: null}), query({roasts: [2]}))).toBe(false);
    });

    it("rejects a keyword that is absent from the searchable row text", () => {
        expect(matchesHubQuery(recipe(), query({keyword: "papaya"}))).toBe(false);
    });

    it.each([
        ["name", "pea", recipe({name: "Peach Candy"})],
        ["author", "collect", recipe({author: "Coffee Collective"})],
        ["coffee type", "aero", recipe({coffeeType: "Anaerobic Lot"})],
        ["origin", "colom", recipe({origin: ["Nariño Colombia"]})],
        ["varietal", "pink", recipe({varietal: ["Pink Bourbon"]})],
        ["process", "shock", recipe({process: ["Thermal Shock"]})],
        ["flavour", "pea", recipe({flavour: ["White Peach"]})]
    ])("matches the keyword as a broad substring of %s", (_field, keyword, row) => {
        expect(matchesHubQuery(row, query({keyword}))).toBe(true);
    });
});

describe("sorting rows locally", () => {
    it("copies newest rows in arrival order without mutating the input", () => {
        const rows = [recipe({id: 1}), recipe({id: 2})];
        const sorted = sortHubRows(rows, "newest");

        expect(sorted).toEqual(rows);
        expect(sorted).not.toBe(rows);
        expect(rows.map((row) => row.id)).toEqual([1, 2]);
    });

    it("sorts names with localeCompare and keeps equal names stable", () => {
        const rows = [
            recipe({id: 1, name: "中煎"}),
            recipe({id: 2, name: "Ana"}),
            recipe({id: 3, name: "Ana"})
        ];

        expect(sortHubRows(rows, "name").map((row) => row.id)).toEqual([2, 3, 1]);
    });

    it("sorts strongest by lower ratio first and leaves missing ratios last", () => {
        const rows = [
            recipe({id: 1, ratio: 16}),
            recipe({id: 2, ratio: 12}),
            recipe({id: 3, ratio: Number.NaN}),
            recipe({id: 4, ratio: 12})
        ];

        expect(sortHubRows(rows, "ratio").map((row) => row.id)).toEqual([2, 4, 1, 3]);
    });

    it("treats a missing ratio as last from either comparator side", () => {
        // Defends both ratio fallbacks: JavaScript sort treats NaN comparator
        // results like equality, which pins a missing-ratio row in place.
        expect(sortHubRows([
            recipe({id: 1, ratio: Number.NaN}),
            recipe({id: 2, ratio: 12}),
            recipe({id: 3, ratio: 11})
        ], "ratio").map((row) => row.id)).toEqual([3, 2, 1]);

        expect(sortHubRows([
            recipe({id: 1, ratio: 12}),
            recipe({id: 2, ratio: Number.NaN}),
            recipe({id: 3, ratio: 11})
        ], "ratio").map((row) => row.id)).toEqual([3, 1, 2]);
    });
});

describe("counting facet values locally", () => {
    it("counts one facet commonest first and never offers a missing value", () => {
        expect(hubFacetCounts([
            recipe({origin: ["Colombia", "Kenya"]}),
            recipe({origin: ["Colombia"]}),
            recipe({origin: ["Ethiopia"]})
        ], "origins")).toEqual([
            {value: "Colombia", count: 2},
            {value: "Kenya", count: 1},
            {value: "Ethiopia", count: 1}
        ]);
    });

    it("groups spellings case-insensitively and reports the most common spelling", () => {
        expect(hubFacetCounts([
            recipe({process: ["washed"]}),
            recipe({process: ["Washed"]}),
            recipe({process: ["Washed"]})
        ], "processes")).toEqual([{value: "Washed", count: 3}]);
    });

    it("ignores blank facet values while counting chips", () => {
        // Defends the blank-value guard: a chip with no visible label cannot be
        // selected usefully and would only search for nothing.
        expect(hubFacetCounts([
            recipe({flavour: ["", "  ", "Berry"]})
        ], "flavours")).toEqual([{value: "Berry", count: 1}]);
    });
});

describe("building the page request", () => {
    it("sends only the four load-bearing fields plus newest order", () => {
        expect(buildHubRequest("studio", 2)).toEqual({
            pageIndex: 2,
            pageSize: 100,
            recipeType: 1,
            machineList: ["J15"],
            sort: 1,
            sortType: 2
        });
    });

    it("has only sort options that can be answered from list rows", () => {
        expect(HUB_SORTS).toEqual({
            newest: {label: "NEWEST"},
            name: {label: "A TO Z"},
            ratio: {label: "STRONGEST"}
        });
    });
});

describe("knowing whether the query is narrowed", () => {
    it("leaves the empty query wide open", () => {
        expect(hubQueryIsNarrowed(EMPTY_HUB_QUERY)).toBe(false);
    });

    it("counts a real keyword as narrowed, but not whitespace", () => {
        expect(hubQueryIsNarrowed(query({keyword: "  geisha  "}))).toBe(true);
        expect(hubQueryIsNarrowed(query({keyword: "   "}))).toBe(false);
    });

    it.each([
        ["origins", {origins: ["Colombia"]}],
        ["processes", {processes: ["Washed"]}],
        ["varietals", {varietals: ["Bourbon"]}],
        ["flavours", {flavours: ["Peach"]}],
        ["roasts", {roasts: [2]}]
    ] as const)("counts %s as narrowed", (_name, patch) => {
        expect(hubQueryIsNarrowed(query(patch))).toBe(true);
    });
});

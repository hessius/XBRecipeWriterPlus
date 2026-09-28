/**
 * The rail's question, turned into the one request that answers it.
 *
 * Pure. No fetch, no mocks. The point of this file existing is that a screen
 * can never build a request of its own, the way no screen builds a library SQL
 * statement.
 */
import {
    buildHubRequest,
    EMPTY_HUB_QUERY,
    HUB_SORTS,
    hubQueryIsNarrowed,
    machineCode
} from "@/library/hub/hubQuery";

describe("which machine is asked about", () => {
    it("asks about the machine the user owns", () => {
        expect(machineCode("studio")).toBe("J15");
        expect(machineCode("original")).toBe("J20");
    });

    it("never asks about both at once", () => {
        // The catalogue publishes the same recipe once per machine, so asking
        // for both returns every recipe twice with different grind numbers and
        // no way to tell which is yours. And the grind scales do not convert:
        // best linear fit R^2 = 0.444 over 1,053 pairs.
        expect(buildHubRequest(EMPTY_HUB_QUERY, "studio", 1).machineList).toEqual(["J15"]);
        expect(buildHubRequest(EMPTY_HUB_QUERY, "original", 1).machineList).toEqual(["J20"]);
    });
});

describe("building the request", () => {
    it("asks for coffee, a hundred at a time, newest first", () => {
        expect(buildHubRequest(EMPTY_HUB_QUERY, "studio", 1)).toEqual({
            pageIndex: 1,
            pageSize: 100,
            recipeType: 1,
            machineList: ["J15"],
            sort: HUB_SORTS.date.sort,
            sortType: HUB_SORTS.date.sortType
        });
    });

    it("leaves an empty keyword out rather than sending an empty string", () => {
        // An undocumented endpoint asked for `keyword: ""` is being asked
        // something, and what it does with it is not written down anywhere.
        expect("keyword" in buildHubRequest({...EMPTY_HUB_QUERY, keyword: "   "}, "studio", 1))
            .toBe(false);
    });

    it("sends a keyword that has something in it", () => {
        expect(buildHubRequest({...EMPTY_HUB_QUERY, keyword: " ethiopia "}, "studio", 1).keyword)
            .toBe("ethiopia");
    });

    it("leaves an empty facet out rather than sending an empty array", () => {
        const request = buildHubRequest(EMPTY_HUB_QUERY, "studio", 1);
        expect("originIds" in request).toBe(false);
        expect("roastList" in request).toBe(false);
        expect("flavorIds" in request).toBe(false);
        expect("processIds" in request).toBe(false);
    });

    it("sends the facets that were chosen", () => {
        const request = buildHubRequest({
            ...EMPTY_HUB_QUERY,
            originIds: ["1", "5"], roastIds: ["2"], processIds: ["87"], flavourIds: ["47"]
        }, "studio", 2);

        expect(request.originIds).toEqual(["1", "5"]);
        expect(request.roastList).toEqual(["2"]);
        expect(request.processIds).toEqual(["87"]);
        expect(request.flavorIds).toEqual(["47"]);
        expect(request.pageIndex).toBe(2);
    });

    it("carries the chosen sort", () => {
        expect(buildHubRequest({...EMPTY_HUB_QUERY, sort: "downloads"}, "studio", 1))
            .toMatchObject({sort: HUB_SORTS.downloads.sort, sortType: 2});
    });

    it("has no sort by likes, because the likes are not a signal", () => {
        // Every likesCount in the catalogue sits in one narrow band, so
        // ordering by it would be ordering by noise while looking like a
        // popularity ranking.
        expect(Object.keys(HUB_SORTS)).toEqual(["date", "downloads"]);
    });
});

describe("knowing whether the query is narrowed", () => {
    it("leaves the empty query wide open", () => {
        expect(hubQueryIsNarrowed(EMPTY_HUB_QUERY)).toBe(false);
    });

    it("counts a real keyword as narrowed", () => {
        // Defends the keyword branch: whitespace alone is not a search.
        expect(hubQueryIsNarrowed({...EMPTY_HUB_QUERY, keyword: "  geisha  "})).toBe(true);
        expect(hubQueryIsNarrowed({...EMPTY_HUB_QUERY, keyword: "   "})).toBe(false);
    });

    it.each([
        ["originIds", {originIds: ["5"]}],
        ["roastIds", {roastIds: ["2"]}],
        ["processIds", {processIds: ["87"]}],
        ["flavourIds", {flavourIds: ["47"]}]
    ] as const)("counts %s as narrowed", (_name, patch) => {
        // Defends each facet branch: the rail's reset affordance depends on
        // knowing that any chosen chip narrows the catalogue.
        expect(hubQueryIsNarrowed({...EMPTY_HUB_QUERY, ...patch})).toBe(true);
    });
});

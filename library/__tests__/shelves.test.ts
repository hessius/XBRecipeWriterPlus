import {buildShelves} from "@/library/shelves";
import {STOCK_FILTERS} from "@/library/libraryFilters";

const NO_TAGS: {tag: string; count: number}[] = [];

describe("building the shelves", () => {
    it("puts the shelves a person made before the ones the app invented", () => {
        const shelves = buildShelves({
            filterCounts: {tea: 4},
            tagCounts: [{tag: "morning", count: 2}],
            librarySize: 20
        });

        expect(shelves.map((s) => s.kind)).toEqual(["manual", "auto"]);
        // The id is the filter that opens it, prefixed; the label is the word
        // the user typed. A raw tag as the id would be dropped by
        // asLibraryFilters the moment the tile was tapped.
        expect(shelves[0]).toEqual({
            id: "tag:morning", label: "morning", kind: "manual", count: 2
        });
    });

    it("labels an auto shelf from the one filter vocabulary", () => {
        const [shelf] = buildShelves({
            filterCounts: {singlePour: 5}, tagCounts: NO_TAGS, librarySize: 20
        });

        expect(shelf.label).toBe(STOCK_FILTERS.singlePour.label);
    });

    // Both boundaries of the design's suppression rule. Stated as "fewer than 3
    // is noise" and "more than 80% is the library wearing a category's name",
    // which is where an off-by-one hides.
    it("suppresses an auto shelf below three and above eighty per cent", () => {
        const ids = (counts: Record<string, number>, size: number) =>
            buildShelves({filterCounts: counts, tagCounts: NO_TAGS, librarySize: size})
                .map((s) => s.id);

        expect(ids({tea: 2}, 20)).toEqual([]);
        expect(ids({tea: 3}, 20)).toEqual(["tea"]);
        expect(ids({tea: 8}, 10)).toEqual(["tea"]);
        expect(ids({tea: 9}, 10)).toEqual([]);
    });

    // A person made it on purpose, so its size is not the app's business. This
    // is the case the design most wants to keep: the shelf someone has only
    // just started.
    it("never suppresses a manual shelf, however small", () => {
        const shelves = buildShelves({
            filterCounts: {},
            tagCounts: [{tag: "new", count: 1}],
            librarySize: 200
        });

        expect(shelves.map((s) => s.id)).toEqual(["tag:new"]);
    });

    it("keeps a shelf the user is standing in, whatever its count", () => {
        const shelves = buildShelves({
            filterCounts: {tea: 1},
            tagCounts: NO_TAGS,
            librarySize: 20,
            applied: ["tea"]
        });

        expect(shelves.map((s) => s.id)).toEqual(["tea"]);
        expect(shelves[0].count).toBe(1);
    });

    it("lists auto shelves in the order the chips use", () => {
        const shelves = buildShelves({
            // Deliberately the reverse of STOCK_FILTER_ORDER, so a builder that
            // trusted the map's own key order would report them backwards.
            filterCounts: {hot: 5, singlePour: 5, tea: 5},
            tagCounts: NO_TAGS,
            librarySize: 20
        });

        expect(shelves.map((s) => s.id)).toEqual(["tea", "singlePour", "hot"]);
    });

    it("has nothing to draw for an empty library", () => {
        expect(buildShelves({
            filterCounts: {}, tagCounts: NO_TAGS, librarySize: 0
        })).toEqual([]);
    });
});

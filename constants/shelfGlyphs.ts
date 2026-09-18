import type {DotIconName} from "@/constants/dotIcons";
import type {FilterId} from "@/library/libraryFilters";
import {isStockFilter} from "@/library/libraryFilters";

/**
 * The glyph each auto shelf carries.
 *
 * Here rather than on `STOCK_FILTERS`, because a filter is a SQL clause and
 * knows nothing about being drawn: `library/` stays free of the app's icon set,
 * and the rail's chips can keep being labels while the grid's tiles are
 * pictures. Keyed by `FilterId` so the compiler requires a glyph for every
 * stock filter -- an auto shelf with no mark would be a blank square in a grid
 * of drawings, which reads as a bug rather than as a shelf.
 *
 * Only auto shelves appear here. A manual shelf is a tag somebody typed, so
 * there is no glyph to have drawn for it and none is invented; it takes the
 * mark derived from its members instead.
 */
export const SHELF_GLYPHS: Record<FilterId, DotIconName> = {
    tea:           "shelfTea",
    pods:          "shelfPods",
    overflowOff:   "shelfOverflowOff",
    otherBrewer:   "shelfOtherBrewer",
    singlePour:    "shelfSinglePour",
    manyStages:    "shelfManyStages",
    grinderOff:    "shelfGrinderOff",
    xbloom:        "shelfXbloom",
    strong:        "shelfStrong",
    long:          "shelfLong",
    hot:           "shelfHot",
    recentlyAdded: "shelfRecent"
};

/** The glyph for a shelf id, or null for anything that is not an auto shelf. */
export function shelfGlyph(id: string): DotIconName | null {
    return isStockFilter(id) ? SHELF_GLYPHS[id] : null;
}

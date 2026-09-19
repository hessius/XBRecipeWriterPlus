import type {DotIconName} from "@/constants/dotIcons";
import type {FilterId} from "@/library/libraryFilters";
import {authorFromFilterId, isStockFilter} from "@/library/libraryFilters";

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
 * mosaic of its members instead.
 */
export const SHELF_GLYPHS: Record<FilterId, DotIconName> = {
    tea:           "shelfTea",
    pods:          "shelfPods",
    overflowOff:   "shelfOverflowOff",
    otherBrewer:   "shelfOtherBrewer",
    singlePour:    "shelfSinglePour",
    fewStages:     "shelfFewStages",
    manyStages:    "shelfManyStages",
    grinderOff:    "shelfGrinderOff",
    xbloom:        "shelfXbloom",
    shortRatio:    "shelfShortRatio",
    longRatio:     "shelfLongRatio",
    quickBrew:     "shelfQuickBrew",
    slowBrew:      "shelfSlowBrew",
    hot:           "shelfHot",
    mine:          "shelfMine",
    recentlyAdded: "shelfRecent"
};

/**
 * The one drawing every per-author shelf shares.
 *
 * Separate from the map above because it is not keyed by a filter id: there is
 * one author shelf per person who ever shared a recipe into this library, and
 * no drawing can be made in advance for a name a stranger typed. The tile
 * carries the name, so the glyph only has to say what kind of shelf it is.
 */
export const AUTHOR_SHELF_GLYPH: DotIconName = "shelfAuthor";

/**
 * The glyph for a shelf id, or null for anything that is not an auto shelf.
 *
 * Every auto shelf has one, including the per-author shelves, because auto is
 * the kind of shelf that carries a glyph. A null here means a manual shelf,
 * and a manual shelf takes the mosaic instead.
 */
export function shelfGlyph(id: string): DotIconName | null {
    if (isStockFilter(id)) return SHELF_GLYPHS[id];
    return authorFromFilterId(id) === null ? null : AUTHOR_SHELF_GLYPH;
}

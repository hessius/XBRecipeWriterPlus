import type {FilterClause} from "./libraryQuery";
import {CUP_TYPE} from "./Recipe";

/**
 * The stock filter vocabulary: the auto shelves the rail's chips are drawn
 * from, each an index query with an id, a Doto caps label and a WHERE fragment
 * over the index columns.
 *
 * One table, read from everywhere, exactly as `librarySort.ts` is for the sort
 * axes. The chip row, the count query that decides which chips to offer, and
 * phase 4's shelf grid all derive from `STOCK_FILTERS` rather than restating the
 * list, for the reason `recipeIndex.ts` gives for its column array: a vocabulary
 * written out in several places is how one copy drifts from the others, which is
 * how `showHints` once went missing from backups.
 *
 * These are the shelves in the design's Stock auto shelves table minus the
 * per-author shelves, which need a `SELECT DISTINCT sharedBy` and so are derived
 * at runtime rather than declared here.
 *
 * No SQL runs here and no database is imported. Every fragment is a literal this
 * module owns outright; the only value a person could influence is the
 * recently-added cutoff, and it reaches SQLite as a bound `?`, never spliced
 * into the text. `library/` is plain TypeScript -- no React, no colour, no UI.
 */
export type FilterId =
    | "tea"
    | "pods"
    | "overflowOff"
    | "otherBrewer"
    | "singlePour"
    | "manyStages"
    | "grinderOff"
    | "xbloom"
    | "strong"
    | "long"
    | "hot"
    | "recentlyAdded";

type StockFilter = {
    /** The chip label, in Doto caps, taken from the design's shelf names. */
    label: string;
    /**
     * The clause is a function, not a value, so the one time-relative filter
     * (`recentlyAdded`) computes its cutoff when the query is built rather than
     * when this module loads -- a cutoff frozen at import would drift a day
     * further out of date with every hour the app stays open.
     */
    clause: () => FilterClause;
};

/** Recently added means the last 30 days, measured when the query is built. */
const RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export const STOCK_FILTERS: Record<FilterId, StockFilter> = {
    tea: {label: "TEA", clause: () => ({where: "isTea = 1"})},
    // cupType constants are bound rather than spliced into the fragment, so the
    // SQL text stays `cupType = ?` and the value comes from Recipe's own enum --
    // one source for what XPOD means, not a second copy of 0x00 living in a
    // string here.
    pods: {label: "XBLOOM PODS", clause: () => ({where: "cupType = ?", params: [CUP_TYPE.XPOD]})},
    overflowOff: {
        label: "OVERFLOW OFF",
        clause: () => ({where: "cupType = ?", params: [CUP_TYPE.OMNI]})
    },
    otherBrewer: {
        label: "OTHER BREWER",
        clause: () => ({where: "cupType = ?", params: [CUP_TYPE.OTHER]})
    },
    singlePour: {label: "SINGLE POUR", clause: () => ({where: "pourCount = 1"})},
    manyStages: {label: "MANY STAGES", clause: () => ({where: "pourCount >= 4"})},
    grinderOff: {label: "GRINDER OFF", clause: () => ({where: "grinder = 0"})},
    // `xid IS NOT NULL`, not the design table's `xid <> ''`. recipeIndex stores
    // NULL rather than an empty string for a recipe with no XID (`r.xid ||
    // null`), so the honest question is "is the column null" and this asks it
    // directly. `<> ''` reaches the same rows only via three-valued logic --
    // NULL <> '' is NULL, which WHERE drops -- so it reads as if empty strings
    // were the worry when the index guarantees none can occur.
    xbloom: {label: "XBLOOM RECIPES", clause: () => ({where: "xid IS NOT NULL"})},
    strong: {label: "STRONG", clause: () => ({where: "ratio <= 14"})},
    long: {label: "LONG", clause: () => ({where: "ratio >= 17"})},
    // maxTemp is NULL when a recipe sets no temperatures; `>= 94` excludes those
    // rows, which is what "hot" has to mean.
    hot: {label: "HOT", clause: () => ({where: "maxTemp >= 94"})},
    recentlyAdded: {
        label: "RECENTLY ADDED",
        clause: () => ({where: "createdAt >= ?", params: [Date.now() - RECENT_WINDOW_MS]})
    }
};

/** The stock filters in the order the rail lists their chips. */
export const STOCK_FILTER_ORDER: readonly FilterId[] = [
    "tea", "pods", "overflowOff", "otherBrewer", "singlePour", "manyStages",
    "grinderOff", "xbloom", "strong", "long", "hot", "recentlyAdded"
];

/**
 * Whether a value is one of the known stock filter ids.
 *
 * `Object.hasOwn` rather than `in`, for the reason `librarySort.ts` spells out:
 * `in` walks the prototype chain and answers true for `"toString"`,
 * `"constructor"` and `"__proto__"`, which are exactly the strings a hostile
 * backup would carry. That hole was shipped once on this branch's sort guard and
 * caught in review; it is not reopened here.
 */
export function isStockFilter(value: unknown): value is FilterId {
    return typeof value === "string" && Object.hasOwn(STOCK_FILTERS, value);
}

/**
 * Narrows a stored list of filter ids to the ones this build still knows,
 * dropping the rest.
 *
 * The persistence-boundary reader, the counterpart to `librarySort`'s
 * `asSortAxis`. Selected filters are kept in settings; a chip id from a previous
 * build -- a shelf since renamed or removed -- would otherwise survive across an
 * upgrade, reach `buildLibraryQuery`'s throw for an unresolved id, and take the
 * whole library screen down on every render. Dropping it here keeps
 * `buildLibraryQuery`'s throw for what it is meant to catch: a genuine in-code
 * disagreement between the ids and the resolver, never stale state.
 */
export function asStockFilters(value: unknown): FilterId[] {
    if (!Array.isArray(value)) return [];
    return value.filter(isStockFilter);
}

/**
 * The `FilterResolver` for `buildLibraryQuery`: a stock id becomes its clause,
 * anything else null. Null makes the builder throw, which is correct once the
 * ids have been narrowed through `asStockFilters` -- a null here then means an
 * id the code produced that the vocabulary does not define, which is a bug.
 */
export function resolveStockFilter(id: string): FilterClause | null {
    return isStockFilter(id) ? STOCK_FILTERS[id].clause() : null;
}

/** Below this a filter is noise the app should not invent a chip for. */
const MIN_COUNT = 3;

/**
 * Whether a filter holding `count` of a library of `librarySize` is offered.
 *
 * Two gates, both from the design: a shelf of fewer than 3 is noise, and a shelf
 * of more than 80% is the whole library wearing a category's name. The upper
 * gate is `count * 5 <= librarySize * 4`, integer cross-multiplication of the
 * 4/5 that 0.8 is, rather than `count <= librarySize * 0.8`. 0.8 has no exact
 * double, so the float form makes "exactly 80%" a coin toss at the sizes where
 * 80% is a whole number; the integer form makes the boundary "80% is offered,
 * 81% is not" hold exactly at every size. An empty library offers nothing, so a
 * zero size is refused before it can divide.
 */
function isOffered(count: number, librarySize: number): boolean {
    if (librarySize <= 0) return false;
    return count >= MIN_COUNT && count * 5 <= librarySize * 4;
}

/**
 * The derived shelves worth offering, given how many recipes each holds.
 *
 * The single suppression gate. The rail's chip row and phase 4's shelf grid both
 * call this and only this, so the two can never disagree about which auto
 * shelves exist -- a later reader tempted to inline "3 and 80%" into one of them
 * must not, or the grid and the chips would drift.
 *
 * Only derived shelves are passed in. Nothing a person authored -- a favourited
 * recipe, a manual tag shelf -- is ever routed through here, because a shelf of
 * two a user built is a decision, not noise; suppression is for shelves the app
 * invented. Keys are preserved in `counts`' own order, so the caller controls
 * chip order by how it builds the map.
 *
 * An applied filter is always offered, whatever its count. Suppression decides
 * what to *propose*, never what to hide after the fact: a filter that crosses a
 * threshold while it is switched on -- deleting recipes can push one over the
 * 80% ceiling, or under the floor -- would otherwise take its own chip away, and
 * with the chips now behind a button that is gated on there being any, it would
 * take the button and the whole filter rail with it. The user would be left with
 * a library quietly missing recipes and no control anywhere on screen to undo
 * it. So the rule is one way: suppression can decline to offer a filter, but it
 * can never withdraw one the user has already chosen.
 */
export function availableFilters(
    counts: Readonly<Record<string, number>>,
    librarySize: number,
    applied: readonly string[] = []
): string[] {
    return Object.keys(counts)
        .filter((id) => isOffered(counts[id], librarySize) || applied.includes(id));
}

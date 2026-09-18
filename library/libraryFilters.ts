import type {FilterClause} from "./libraryQuery";
import {CUP_TYPE} from "./Recipe";
import {tagKey} from "./tagKey";

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
    | "fewStages"
    | "manyStages"
    | "grinderOff"
    | "xbloom"
    | "shortRatio"
    | "longRatio"
    | "hot"
    | "recentlyAdded"
    | "mine"
    | "quickBrew"
    | "slowBrew";

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

/**
 * Where a brew stops being quick and starts being slow, in seconds.
 *
 * The figures are the ones the shelves were asked for: two and a half minutes,
 * and four. The gap between them is left unnamed on purpose -- most recipes
 * live in it, and a shelf holding the middle of a distribution says nothing
 * about the recipes on it.
 *
 * Measured by `plannedSeconds`, which is the recipe's own plan rather than any
 * brew of it: pours at their stated flow plus the pauses between them. A
 * recipe with no stages has no duration at all and `brewSeconds` is NULL for
 * it, so neither comparison matches -- the treatment `maxTemp` already gets.
 */
const QUICK_BREW_SECONDS = 150;
const SLOW_BREW_SECONDS = 240;

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
    // FEW STAGES contains SINGLE POUR, which is the one place two stock
    // shelves overlap. They are kept apart because they say different things:
    // a single pour is a way of brewing, and few stages is a shape. Three is
    // the unnamed middle, for the reason the duration pair leaves one.
    fewStages: {label: "FEW STAGES", clause: () => ({where: "pourCount <= 2"})},
    manyStages: {label: "MANY STAGES", clause: () => ({where: "pourCount >= 4"})},
    grinderOff: {label: "GRINDER OFF", clause: () => ({where: "grinder = 0"})},
    // `xid IS NOT NULL`, not the design table's `xid <> ''`. recipeIndex stores
    // NULL rather than an empty string for a recipe with no XID (`r.xid ||
    // null`), so the honest question is "is the column null" and this asks it
    // directly. `<> ''` reaches the same rows only via three-valued logic --
    // NULL <> '' is NULL, which WHERE drops -- so it reads as if empty strings
    // were the worry when the index guarantees none can occur.
    xbloom: {label: "XBLOOM RECIPES", clause: () => ({where: "xid IS NOT NULL"})},
    // The ratio pair names the ratio outright. STRONG and MILD were the first
    // attempt and were dropped: strength in coffee is decided by grind, dose,
    // temperature and time as much as by ratio, so a STRONG shelf that sorted
    // purely on `ratio` was promising something it could not know. SHORT and
    // LONG are the ristretto/lungo words, they mean one thing, and they cannot
    // be read as a duration now that the word LONG has been given a noun.
    shortRatio: {label: "SHORT RATIO", clause: () => ({where: "ratio <= 14"})},
    longRatio: {label: "LONG RATIO", clause: () => ({where: "ratio >= 17"})},
    // maxTemp is NULL when a recipe sets no temperatures; `>= 94` excludes those
    // rows, which is what "hot" has to mean.
    hot: {label: "HOT", clause: () => ({where: "maxTemp >= 94"})},
    recentlyAdded: {
        label: "RECENTLY ADDED",
        clause: () => ({where: "createdAt >= ?", params: [Date.now() - RECENT_WINDOW_MS]})
    },
    // The complement of every author shelf, and the reason it can be one
    // clause rather than a list of sources. A recipe typed into the editor, a
    // duplicate of one, a card read on the phone and a row pulled from the
    // user's own xBloom account all arrive with no sharer: an account row is a
    // bare `recipeVo`, and `shareMemberName` sits beside `recipeVo` rather than
    // inside it, so only a recipe somebody sent carries one.
    //
    // `sharedByKey`, not `sharedBy`, so the column a shelf asks about is the
    // one the author shelves match on -- asking the other would be two
    // definitions of "came from somebody" that could disagree.
    mine: {label: "MINE", clause: () => ({where: "sharedByKey IS NULL"})},
    quickBrew: {
        label: "QUICK BREW",
        clause: () => ({where: "brewSeconds <= ?", params: [QUICK_BREW_SECONDS]})
    },
    slowBrew: {
        label: "SLOW BREW",
        clause: () => ({where: "brewSeconds >= ?", params: [SLOW_BREW_SECONDS]})
    }
};

/** The stock filters in the order the rail lists their chips. */
export const STOCK_FILTER_ORDER: readonly FilterId[] = [
    "tea", "pods", "overflowOff", "otherBrewer", "singlePour", "fewStages",
    "manyStages", "grinderOff", "xbloom", "shortRatio", "longRatio",
    "quickBrew", "slowBrew", "hot", "mine", "recentlyAdded"
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
/**
 * The floor a shelf has to clear to exist at all.
 *
 * Exported because it is not only a suppression rule: the shelf art read pays
 * one synchronous query per shelf, and a shelf below this floor is never drawn
 * whatever the rail is filtered by, so it must not be queried either. Both
 * readings have to come from this one number or they would drift.
 */
export const MIN_COUNT = 3;

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
    const offered = Object.keys(counts)
        .filter((id) => isOffered(counts[id], librarySize) || applied.includes(id));
    return collapseStageShelves(offered, counts, applied);
}

/**
 * Of SINGLE POUR and FEW STAGES, offer whichever one says something.
 *
 * FEW STAGES contains SINGLE POUR, so on most libraries they are two doors
 * onto nearly the same set and the grid drew both. Which one is worth having
 * depends entirely on what is in the library, so the answer is counted rather
 * than decided here:
 *
 * - A library with no two-stage recipes makes the two shelves *identical*.
 *   SINGLE POUR is the truthful name for that set, so FEW STAGES goes.
 * - A library with any two-stage recipe makes FEW STAGES the larger and more
 *   useful of the two, and SINGLE POUR a subset of a shelf already on screen.
 *   SINGLE POUR goes.
 *
 * Counts, not clauses: the two ids are the only place in this module that
 * overlap by construction, and both branches reduce to "drop the one that is
 * not telling the user anything new".
 *
 * An applied filter is never dropped, for the same reason `isOffered` cannot
 * withdraw one. A user standing in SINGLE POUR keeps its chip even once a
 * two-stage recipe arrives and makes FEW STAGES the better offer.
 */
function collapseStageShelves(
    offered: readonly string[],
    counts: Readonly<Record<string, number>>,
    applied: readonly string[]
): string[] {
    if (!offered.includes("singlePour") || !offered.includes("fewStages")) {
        return [...offered];
    }
    const twoStagesExist = (counts.fewStages ?? 0) > (counts.singlePour ?? 0);
    const drop = twoStagesExist ? "singlePour" : "fewStages";
    return offered.filter((id) => id !== drop || applied.includes(id));
}

/**
 * The namespace a manual shelf's filter id carries.
 *
 * A manual shelf is a tag, and a tag is whatever the user typed, so its id has
 * to be told apart from a stock id by shape rather than by looking it up: a tag
 * called "tea" is not the TEA shelf, and without a prefix the two would resolve
 * to each other's query. The colon is already the app's separator for this --
 * `sharedBy:` uses it for the per-author shelves -- so a reader meets one
 * convention rather than two.
 */
export const TAG_FILTER_PREFIX = "tag:";

/** The filter id for a tag shelf. */
export function tagFilterId(tag: string): string {
    return `${TAG_FILTER_PREFIX}${tag}`;
}

/** The tag a filter id names, or null when it does not name one. */
export function tagFromFilterId(id: string): string | null {
    if (!id.startsWith(TAG_FILTER_PREFIX)) return null;
    const tag = id.slice(TAG_FILTER_PREFIX.length);
    return tag.length > 0 ? tag : null;
}

/**
 * The namespace a per-author shelf's filter id carries.
 *
 * The same shape convention as `tag:`, and for the same reason: an author is
 * whatever somebody typed into a share, so their shelf has to be told apart
 * from a stock id by shape rather than by lookup. `LibraryRail` has read this
 * prefix since the rail shipped; this is the supply that was missing.
 */
export const AUTHOR_FILTER_PREFIX = "sharedBy:";

/** The filter id for an author shelf. */
export function authorFilterId(author: string): string {
    return `${AUTHOR_FILTER_PREFIX}${author}`;
}

/** The author a filter id names, or null when it does not name one. */
export function authorFromFilterId(id: string): string | null {
    if (!id.startsWith(AUTHOR_FILTER_PREFIX)) return null;
    const author = id.slice(AUTHOR_FILTER_PREFIX.length);
    return author.length > 0 ? author : null;
}

/**
 * The resolver for every filter the library can apply: a stock id, or a tag.
 *
 * A tag becomes an EXISTS over `recipe_tags` matched on `tagKey`, the folded
 * form, so the shelf holds the same recipes the tag search finds and two
 * spellings of one word cannot become two shelves holding different halves of
 * the same set. The tag reaches SQLite as a bound `?` and is never spliced into
 * the text: it is the one value here a person authored.
 */
export function resolveLibraryFilter(id: string): FilterClause | null {
    const author = authorFromFilterId(id);
    if (author !== null) {
        // Matched on the folded column rather than on `sharedBy COLLATE
        // NOCASE`, for the reason `recipeIndex` spells out on it: NOCASE folds
        // ASCII only, so "CAFÉ" and "café" would be two people.
        return {where: "sharedByKey = ?", params: [tagKey(author)]};
    }
    const tag = tagFromFilterId(id);
    if (tag !== null) {
        return {
            where: "EXISTS (SELECT 1 FROM recipe_tags t WHERE t.uuid = recipes.uuid"
                + " AND t.tagKey = ?)",
            params: [tagKey(tag)]
        };
    }
    return resolveStockFilter(id);
}

/**
 * Narrows a stored list of filter ids to the ones this build can still resolve.
 *
 * The counterpart to `asStockFilters` for a library that also applies tag
 * shelves. `asStockFilters` drops anything it does not own, which is right for
 * a stock-only caller and wrong here: it would silently discard every manual
 * shelf the moment one was applied, leaving the user's own narrowing gone with
 * no chip to say it ever happened.
 *
 * Applied filters are transient and never persisted (`useLibraryQuery` starts
 * each launch with none), so nothing here has to survive a relaunch. What it
 * guards is the gap between the ids the app can *set* and the ids the resolver
 * can *resolve*: a shelf tile hands over an id built from live library data,
 * and by the time it is applied the recipe behind it may be gone. Dropping
 * such an id here is what keeps `buildLibraryQuery`'s throw reserved for a real
 * disagreement between the vocabulary and the resolver.
 *
 * The type is checked before the shape all the same, because the cost is a line
 * and the alternative is `startsWith` on a non-string taking the library down.
 *
 * A tag or author id survives on shape alone rather than on still naming
 * something in the library. A tag whose last recipe was deleted, or an author
 * whose only recipe was, resolves to a clause matching nothing: an empty shelf
 * the user can see and close, not a crash and not a chip that vanishes without
 * explaining itself.
 */
export function asLibraryFilters(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((id) => typeof id === "string"
        && (isStockFilter(id)
            || tagFromFilterId(id) !== null
            || authorFromFilterId(id) !== null));
}

/**
 * What to call a filter on screen: the stock label, or the tag as typed.
 *
 * One function so the chips, the empty-query line and the shelf grid cannot
 * come to disagree about a shelf's name. A tag keeps the user's own spelling and
 * capitals; it is not raised to Doto caps like the stock labels, because those
 * are the app's words and this one is theirs.
 */
export function filterLabel(id: string): string {
    const author = authorFromFilterId(id);
    // "FROM" is the app's word and the name is the sharer's, so only the first
    // half is raised to Doto caps. The design's shelf table spells it this way.
    if (author !== null) return `FROM ${author}`;
    const tag = tagFromFilterId(id);
    if (tag !== null) return tag;
    return isStockFilter(id) ? STOCK_FILTERS[id].label : id;
}

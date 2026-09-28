import type {FilterClause} from "./libraryQuery";
import {beanFilterLabel, parseBeanFilterId, resolveBeanFilter} from "./beanFilters";
import {COUNTED_SQL} from "./brew/brewPopulation";
import {CUP_TYPE} from "./Recipe";
import {tagKey} from "./tagKey";

/**
 * The stock filter vocabulary: the auto shelves the rail's chips are drawn
 * from, each an index query with an id, a Doto caps label and a WHERE fragment.
 *
 * Most fragments are over the index columns on `recipes`. Two are not, and the
 * exception is deliberate: NEVER BREWED and MOST BREWED ask about `brews`,
 * which is not an index column but a table `BrewDatabase` owns in the same
 * `xbrecipewriter.db` file. They are written as *correlated subqueries* rather
 * than as references to `buildLibraryQuery`'s `brewStats` join, because a
 * clause is used in three places and only one of them has that join:
 * `buildLibraryQuery` joins it, while `countRecipesByFilter` and
 * `shelfMembers` both run a bare `FROM recipes`. A clause naming `brewCount`
 * would work in the list and throw `no such column` in the count that decides
 * whether to draw the shelf's tile and in the art on it. A correlated subquery
 * needs no join and is true in any query that has a `recipes` row, so the same
 * fragment is right in all three. `RecipeDatabase` calls `ensureBrewTables` in
 * its own constructor, which is what makes `brews` safe to name from here on a
 * fresh install.
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
    | "omniDripper"
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
    | "slowBrew"
    | "favourites"
    | "neverBrewed"
    | "mostBrewed"
    | "allRecipes";

type StockFilter = {
    /** The chip label, in Doto caps, taken from the design's shelf names. */
    label: string;
    /**
     * Whether the shelf holds a mark the user made rather than an answer the
     * app worked out, which exempts it from suppression. See `isOffered`.
     */
    authored?: true;
    /**
     * The floor this shelf clears instead of `MIN_COUNT`.
     *
     * The general floor of three exists because a shelf of one or two recipes
     * is the app inventing a category out of a coincidence: TEA holding one
     * recipe says nothing about the library that the recipe does not say by
     * itself. Two shelves are not like that, and both are named for it. MOST
     * BREWED is a superlative -- one recipe brewed far more than the others is
     * exactly what the word means, and holding it back until three qualify is
     * withholding the answer for being too clear. RECENTLY ADDED is a window
     * on the calendar, not a category: one recipe added this month is a true
     * and complete answer to "what is new".
     *
     * Not `authored`, which waives the ceiling too. These are still questions
     * the app asks, so a MOST BREWED that has grown to most of the library is
     * still the library wearing a name and is still withdrawn.
     */
    floor?: number;
    /**
     * Drawn in the grid, never offered as a chip.
     *
     * The one declared exception to "the rail and the grid cannot disagree".
     * ALL RECIPES narrows nothing, so a chip for it would be a control that
     * does not control anything, sitting on the one row whose entire purpose is
     * narrowing. Declared here rather than special-cased at the rail, so a
     * reader who notices the difference finds the reason on the filter itself.
     */
    gridOnly?: true;
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

/**
 * How many brews a recipe needs before it is one of the most brewed.
 *
 * "Most" is a superlative and a WHERE clause is a threshold, so the shelf has
 * to name a number. Three is the smallest one that is not an accident: one
 * brew is a try, two is a second look, and a third time is somebody going back
 * to a recipe on purpose.
 *
 * It was five, which is a defensible reading of the same word and turned out
 * to be the wrong one in a real library: brewing takes a pod and a few minutes
 * each time, so five of anything is months of use, and the shelf stayed empty
 * long enough to look broken rather than selective.
 *
 * A fixed figure leaves the shelf empty for a new library and crowded for an
 * old one, and both ends are already handled: the shelf's own `floor` of one
 * declines to draw it before any recipe qualifies, and `isOffered`'s 80%
 * ceiling declines once it is the whole library wearing a name. A relative
 * definition -- the top tenth, say -- would always have members and rarely
 * useful ones, and could not be written as a clause `countRecipesByFilter` and
 * `shelfMembers` can run.
 */
const MOST_BREWED_BREWS = 3;

/**
 * A recipe's brews that were cups, as a correlated subquery.
 *
 * `COUNTED_SQL` rather than every row, and that word is the whole point. A
 * cancelled brew is a row worth keeping in history and is not a cup, which is
 * how `brewCount`, `brewEvidence`, the card's evidence line and
 * `librarySort`'s never-brewed-last guard all read it. A shelf counting bare
 * rows would take a recipe whose only brews were cancelled off NEVER BREWED
 * while its own card said nothing had been brewed and BREW COUNT sorted it
 * with the never-brewed: one word, two meanings, disagreeing on screen in two
 * places at once.
 *
 * `brews.recipeUuid` and `recipes.uuid` are both qualified because the outer
 * query may itself select from `brews` -- `buildLibraryQuery`'s `brewStats`
 * does -- and an unqualified name would be resolved by whichever scope
 * happened to be nearest.
 */
function countedBrews(body: string): string {
    return `SELECT ${body} FROM brews`
        + ` WHERE brews.recipeUuid = recipes.uuid AND ${COUNTED_SQL}`;
}

export const STOCK_FILTERS: Record<FilterId, StockFilter> = {
    tea: {label: "TEA", clause: () => ({where: "isTea = 1"})},
    // cupType constants are bound rather than spliced into the fragment, so the
    // SQL text stays `cupType = ?` and the value comes from Recipe's own enum --
    // one source for what XPOD means, not a second copy of 0x00 living in a
    // string here.
    pods: {label: "XBLOOM PODS", clause: () => ({where: "cupType = ?", params: [CUP_TYPE.XPOD]})},
    // Named for the two cup types rather than for overflow protection, which
    // is the thing #151 got wrong. OTHER is the type the machine cannot
    // measure and so cannot protect, which would have made OVERFLOW OFF and
    // OTHER BREWER two names for one shelf, while OMNI -- what every new
    // recipe starts as -- had none at all. These are the editor's own words
    // for the same choice, so the shelf and the segment agree.
    omniDripper: {
        label: "OMNI DRIPPER",
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
        floor: 1,
        clause: () => ({where: "createdAt >= ?", params: [Date.now() - RECENT_WINDOW_MS]})
    },
    // Recipes the user wrote, which is a narrower thing than recipes nobody
    // sent them.
    //
    // This asked `sharedByKey IS NULL` first, the complement of every author
    // shelf. That was true of a recipe typed into the editor and equally true
    // of one pulled from xBloom's catalogue by pod ID, because only a share
    // link carries a `shareMemberName`. So MINE held almost every library, and
    // then the 80% ceiling withdrew it for saying nothing -- a shelf that
    // could not appear for the users it was for.
    //
    // `source = 'manual'` is the recipe's own account of where it came from:
    // the editor's NEW RECIPE and nothing else. A card read on the phone is
    // somebody's card, a duplicate is a copy of a recipe, and an import is an
    // import; none of the three is a recipe its owner wrote, and each has its
    // own honest description on the card front. A shelf called MINE has to
    // mean the one thing the word means, or it is the app asserting authorship
    // on the user's behalf.
    mine: {label: "MINE", clause: () => ({where: "source = 'manual'"})},
    quickBrew: {
        label: "QUICK BREW",
        clause: () => ({where: "brewSeconds <= ?", params: [QUICK_BREW_SECONDS]})
    },
    slowBrew: {
        label: "SLOW BREW",
        clause: () => ({where: "brewSeconds >= ?", params: [SLOW_BREW_SECONDS]})
    },
    // The one shelf here the user built themselves, one tap at a time. It is
    // `authored` for that reason: a library with two starred recipes in it has
    // two somebody deliberately marked, which is a set worth opening, not a
    // shelf the app guessed at and should keep quiet about.
    //
    // STARRED, not FAVOURITES. The mark is a star everywhere it is made -- the
    // card's corner, the swipe tray's tile, the overflow row -- and the shelf
    // was the one place it was called something else, which left the app with
    // two words for one thing and no way to tell they were the same.
    favourites: {
        label: "STARRED",
        authored: true,
        clause: () => ({where: "favourite = 1"})
    },
    // NOT EXISTS rather than a count compared to zero: the question is whether
    // there is a single counted row, and NOT EXISTS stops at the first one
    // instead of tallying a recipe's whole history to find out it is not empty.
    neverBrewed: {
        label: "NEVER BREWED",
        clause: () => ({where: `NOT EXISTS (${countedBrews("1")})`})
    },
    // NEVER BREWED and MOST BREWED cannot both hold a recipe, since the
    // threshold is above zero. That falls out of the two clauses and is not
    // guarded anywhere, on purpose: a guard would be a third place the
    // relationship was stated and the first to go stale.
    mostBrewed: {
        label: "MOST BREWED",
        floor: 1,
        clause: () => ({
            where: `(${countedBrews("COUNT(*)")}) >= ?`,
            params: [MOST_BREWED_BREWS]
        })
    },
    // `1 = 1` rather than a special case anywhere downstream. The clause runs
    // in three query shapes and every one of them takes it unchanged, so the
    // count, the list and the shelf art all come through the ordinary path.
    allRecipes: {
        label: "ALL RECIPES",
        clause: () => ({where: "1 = 1"}),
        // Its count is the whole library, so it fails the 80% ceiling at every
        // size above the floor. Waived for the same reason STARRED is: this
        // is not the app inventing a category, it is the way out of one.
        authored: true,
        gridOnly: true
    }
};

/** The stock filters in the order the rail lists their chips. */
export const STOCK_FILTER_ORDER: readonly FilterId[] = [
    // STARRED leads: it is the user's own mark on their recipes and belongs
    // ahead of every question the app asks about them. The two brew shelves sit
    // after MINE, where the vocabulary stops asking about the recipe and starts
    // asking what has become of it, and RECENTLY ADDED closes as it always has.
    "favourites",
    "tea", "pods", "omniDripper", "otherBrewer", "singlePour", "fewStages",
    "manyStages", "grinderOff", "xbloom", "shortRatio", "longRatio",
    "quickBrew", "slowBrew", "hot", "mine",
    "mostBrewed", "neverBrewed", "recentlyAdded", "allRecipes"
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
 * The ids that may be drawn as chips, from the ids that may be drawn at all.
 *
 * `availableFilters` stays the single suppression gate; this is not a second
 * one. It removes only what has said on its own entry that it does not belong
 * on the rail, so the grid and the chips still cannot disagree about which
 * shelves exist, only about which of them a chip can usefully name.
 */
export function chipFilters(ids: readonly FilterId[]): FilterId[] {
    return ids.filter((id) => STOCK_FILTERS[id].gridOnly !== true);
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
 *
 * An `authored` shelf passes both gates on holding anything at all. It is the
 * same exemption a manual tag shelf gets by never being routed through here:
 * suppression exists to keep the app from inventing a shelf that says nothing,
 * and STARRED did not invent itself. Every recipe on it was put there by
 * hand, so two of them are a decision and not noise, and a library where nearly
 * everything is favourited is a statement its owner made and can unmake. Read
 * off the vocabulary rather than tested by id, so the rule lives beside the
 * shelf it applies to instead of a second list of ids living in here.
 */
function isOffered(id: string, count: number, librarySize: number): boolean {
    if (librarySize <= 0) return false;
    if (isStockFilter(id) && STOCK_FILTERS[id].authored) return count > 0;
    const floor = (isStockFilter(id) ? STOCK_FILTERS[id].floor : undefined) ?? MIN_COUNT;
    return count >= floor && count * 5 <= librarySize * 4;
}

/**
 * The derived shelves worth offering, given how many recipes each holds.
 *
 * The single suppression gate. The rail's chip row and phase 4's shelf grid both
 * call this and only this, so the two can never disagree about which auto
 * shelves exist -- a later reader tempted to inline "3 and 80%" into one of them
 * must not, or the grid and the chips would drift.
 *
 * Only derived shelves are passed in, with one exception the vocabulary
 * declares for itself. Nothing a person authored -- a manual tag shelf -- is
 * ever routed through here, because a shelf of two a user built is a decision,
 * not noise; suppression is for shelves the app invented. STARRED is the
 * exception because it is a stock id and so arrives in the same count map as
 * the rest, and it carries `authored` so `isOffered` waives both gates for it.
 * Routing it through rather than around keeps one gate for the chips and the
 * grid, which is the whole reason this function exists. Keys are preserved in
 * `counts`' own order, so the caller controls chip order by how it builds the
 * map.
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
        .filter((id) => isOffered(id, counts[id], librarySize) || applied.includes(id));
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
 * The resolver for every filter the library can apply: a stock id, a tag, an
 * author or the brew-derived bean namespace.
 *
 * A tag becomes an EXISTS over `recipe_tags` matched on `tagKey`, the folded
 * form, so the shelf holds the same recipes the tag search finds and two
 * spellings of one word cannot become two shelves holding different halves of
 * the same set. The tag reaches SQLite as a bound `?` and is never spliced into
 * the text: it is the one value here a person authored.
 */
export function resolveLibraryFilter(id: string): FilterClause | null {
    // Bean filters first, and they own their own refusals: a value outside the
    // closed vocabulary returns null from here rather than falling through to
    // the author and tag branches, which would read `bean:process:washed` as
    // neither and hand it to the stock lookup to refuse for the wrong reason.
    const bean = resolveBeanFilter(id);
    if (bean !== null) return bean;
    if (parseBeanFilterId(id) !== null) return null;

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
 *
 * A bean id is the exception, and is asked to resolve rather than to parse.
 * Every other namespace here resolves whatever it can parse, so shape is the
 * whole test; `resolveBeanFilter` also refuses a preset outside its closed
 * vocabulary, and a parseable id it refuses would pass this gate and reach
 * `buildLibraryQuery`'s throw, which is reserved for the vocabulary and the
 * resolver genuinely disagreeing.
 */
export function asLibraryFilters(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((id) => typeof id === "string"
        && (isStockFilter(id)
            || resolveBeanFilter(id) !== null
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
    const bean = beanFilterLabel(id);
    if (bean !== null) return bean;
    const author = authorFromFilterId(id);
    // "FROM" is the app's word and the name is the sharer's, so only the first
    // half is raised to Doto caps. The design's shelf table spells it this way.
    if (author !== null) return `FROM ${author}`;
    const tag = tagFromFilterId(id);
    if (tag !== null) return tag;
    return isStockFilter(id) ? STOCK_FILTERS[id].label : id;
}

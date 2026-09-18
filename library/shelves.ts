import {
    authorFilterId, availableFilters, filterLabel, STOCK_FILTERS, STOCK_FILTER_ORDER,
    tagFilterId, type FilterId
} from "./libraryFilters";

/**
 * A shelf is a query, and both kinds of query already exist.
 *
 * An auto shelf is a `FilterId` from `libraryFilters.ts` with a count from
 * `countRecipesByFilter`; a manual shelf is a tag with a count from
 * `countRecipesByTag`. There is no shelves table and no membership table,
 * because there is nothing to store that is not already stored: an auto shelf's
 * members are whichever recipes the index says match, and a manual shelf's are
 * whichever carry the tag. Nothing is written twice, so nothing can go stale,
 * and a shelf cannot disagree with the list it opens.
 *
 * That also keeps shelves inside the backup for free. Tags live in
 * `recipes.recipeJSON`, which `buildBackup` round-trips whole; a side table
 * would need remembering separately, which is the `showHints` failure waiting
 * to happen again.
 *
 * Plain TypeScript. No SQL runs here and no database is imported: this arranges
 * counts the caller has already read.
 */
export type Shelf = {
    /**
     * The filter id that opens the shelf: a `FilterId` for an auto shelf, a
     * `tag:`-prefixed one for a manual shelf.
     *
     * The id a tile carries is the id that is applied, with nothing in between
     * to translate it. A raw tag here would be dropped by `asLibraryFilters` the
     * moment it was applied, and the tap would open an unnarrowed library with
     * no sign anything had happened.
     */
    id: string;
    /** Doto caps for an auto shelf; the user's own spelling for a manual one. */
    label: string;
    kind: "auto" | "manual";
    count: number;
};

/**
 * The shelves worth drawing, manual first, then auto.
 *
 * Suppression is applied to the auto half only, through `availableFilters`,
 * which is the single gate the rail's chips also call. The two cannot drift
 * about which auto shelves exist because neither restates the rule.
 *
 * Nothing suppresses a manual shelf. A shelf of two that a person built is a
 * decision; suppression is for shelves the app invented, and a manual shelf of
 * one is the case the design most wants to keep, because it is the shelf
 * someone has only just started.
 *
 * `applied` is passed through so a shelf the user is currently standing in is
 * always drawn, whatever its count. Deleting recipes can push a filter over the
 * 80% ceiling or under the floor while it is switched on, and a grid that then
 * withdrew the tile would leave the library narrowed with nothing on screen
 * naming the narrowing.
 */
export function buildShelves(input: {
    filterCounts: Readonly<Record<string, number>>;
    tagCounts: readonly {tag: string; count: number}[];
    /** How many recipes arrived from each person, for the per-author shelves. */
    authorCounts?: readonly {author: string; count: number}[];
    librarySize: number;
    applied?: readonly string[];
}): Shelf[] {
    const {filterCounts, tagCounts, authorCounts = [], librarySize, applied = []} = input;

    const manual: Shelf[] = tagCounts.map(({tag, count}) => ({
        id: tagFilterId(tag), label: tag, kind: "manual", count
    }));

    // Ordered by STOCK_FILTER_ORDER rather than by the count map's own key
    // order, so the grid lists auto shelves in the same order the chips do. A
    // caller that counts a subset still gets them in that order.
    const ordered: Record<string, number> = {};
    for (const id of STOCK_FILTER_ORDER) {
        if (id in filterCounts) ordered[id] = filterCounts[id];
    }

    const auto: Shelf[] = availableFilters(ordered, librarySize, applied)
        .map((id) => ({
            id,
            label: STOCK_FILTERS[id as FilterId].label,
            kind: "auto" as const,
            count: ordered[id] ?? 0
        }));

    // Author shelves go through the same gate, and the gate matters more here
    // than anywhere else: an author shelf is the likeliest of all of them to
    // sit at one recipe, because most people share one. They are listed after
    // the stock shelves rather than interleaved, so the app's own vocabulary
    // stays in its fixed order and the open-ended half follows it.
    const authorTotals: Record<string, number> = {};
    for (const {author, count} of authorCounts) {
        authorTotals[authorFilterId(author)] = count;
    }
    const byAuthor: Shelf[] = availableFilters(authorTotals, librarySize, applied)
        .map((id) => ({
            id,
            label: filterLabel(id),
            // Auto, because nobody assembled it: it is a question the app asks
            // of the library, the same as TEA or STRONG. There is no membership
            // to edit, only recipes that did or did not arrive from that person.
            kind: "auto" as const,
            count: authorTotals[id] ?? 0
        }));

    return [...manual, ...auto, ...byAuthor];
}

import {
    availableFilters, STOCK_FILTERS, STOCK_FILTER_ORDER, type FilterId
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
    /** A `FilterId` for an auto shelf, the tag's display text for a manual one. */
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
    librarySize: number;
    applied?: readonly string[];
}): Shelf[] {
    const {filterCounts, tagCounts, librarySize, applied = []} = input;

    const manual: Shelf[] = tagCounts.map(({tag, count}) => ({
        id: tag, label: tag, kind: "manual", count
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

    return [...manual, ...auto];
}

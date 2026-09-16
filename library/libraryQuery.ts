import {orderByFragment, type SortAxis, type SortDirection} from "./librarySort";
import type {IndexValue} from "./recipeIndex";

/**
 * The rail's question, turned into one SQL statement.
 *
 * Pure: no database handle, no React, nothing executed. That is the whole
 * point. The library list used to be "every recipe, sorted in JavaScript"; it
 * becomes the answer to this query, and a query you can build on a laptop is a
 * query you can test without a device or a live database. `RecipeDatabase`
 * runs what this returns; this module only decides what to run.
 *
 * The one rule that governs every line here: a value that came from a person --
 * a recipe name typed into the search field, an author lifted from an untrusted
 * backup -- is a bound parameter, never text spliced into the statement. The
 * only strings this module concatenates into SQL are ones it owns outright: the
 * ORDER BY bodies from `librarySort`, which are built from the closed `SortAxis`
 * union, and the WHERE fragments a `FilterResolver` hands back, which are the
 * filter vocabulary's own literals. A recipe called `100%` or `'; DROP TABLE`
 * is data, and data only ever reaches SQLite through a `?`.
 */
export type LibraryQuery = {
    /** A substring to match, case insensitively. Empty means no search. */
    search: string;
    /** Filter ids, ANDed. Each is resolved to a WHERE fragment by the caller. */
    filters: string[];
    sort: SortAxis;
    direction: SortDirection;
    /** When on, favourites lead the list regardless of the sort axis. */
    favouritesFirst: boolean;
};

/**
 * One filter's contribution to the WHERE clause: a fragment and the values it
 * binds. The fragment is a literal the filter vocabulary owns; only `params`
 * carries anything a person could have influenced (an author name, say), and it
 * is bound, never interpolated.
 */
export type FilterClause = {
    where: string;
    params?: readonly IndexValue[];
};

/**
 * Turns a filter id into its clause, or null if the id is unknown.
 *
 * Injected rather than imported so this module stays pure and independent of
 * the filter vocabulary that lives in its own file: the builder can be tested
 * with a stub resolver, and the vocabulary can grow without this file changing.
 * The seam is also the security boundary -- a resolver may only ever return
 * fragments it owns, so nothing user-authored is concatenated here.
 */
export type FilterResolver = (id: string) => FilterClause | null;

export type BuiltQuery = {
    sql: string;
    params: IndexValue[];
};

/**
 * A resolver that knows no filters. The default, so a caller with an empty
 * filter list -- which is every caller until the filter vocabulary is wired in
 * -- need not supply one. It refuses every id, which is caught below.
 */
const NO_FILTERS: FilterResolver = () => null;

/**
 * Escapes the three characters LIKE treats specially so a search term matches
 * itself literally. Without this a recipe named `100%` searched as `%100\%%`
 * -- unescaped `%100%%` -- would match every recipe, because `%` is LIKE's
 * wildcard. `\` is escaped first, or it would double-escape the escapes added
 * after it. Paired with `ESCAPE '\'` on every LIKE below.
 */
function escapeLike(term: string): string {
    return term.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/**
 * The columns a search term matches, case insensitively, as a substring.
 *
 * `sortName`, `sharedBy`, `xid`, the recipe's tags, and its description. Not
 * the placeholder name: `recipeIndex` stores NULL in `sortName` for an unnamed
 * recipe rather than the formatted date it shows, precisely so searching "2026"
 * does not return every recipe nobody has named. `description` is the note's
 * own text -- distinct from `hasDescription`, the 0/1 presence flag a filter
 * asks, which carries none of the words to match. LIKE folds ASCII case on its
 * own, which is what "case insensitively" asks for; the NOCASE columns get the
 * same treatment for free.
 */
function searchClause(): FilterClause {
    return {
        where: `(
            sortName LIKE ? ESCAPE '\\'
            OR sharedBy LIKE ? ESCAPE '\\'
            OR xid LIKE ? ESCAPE '\\'
            OR description LIKE ? ESCAPE '\\'
            OR recipes.uuid IN (
                SELECT uuid FROM recipe_tags WHERE tag LIKE ? ESCAPE '\\'
            )
        )`
    };
}

/**
 * Build the statement and its bound parameters for a library query.
 *
 * The brews join is always present, never conditional on the sort axis. A query
 * whose shape changes with its inputs is a query only ever exercised in one
 * shape; keeping the join constant means the brew-aggregate columns
 * (`lastBrewedAt`, `brewCount`) exist for every query and the same statement is
 * tested whichever axis is chosen. Those two names are a contract with
 * `librarySort`: its never-brewed-last guards key on exactly them.
 *
 * No LIMIT. A library of a couple of hundred is not a paging problem, and a
 * limit would be a silent partial answer to a question the user can see all of.
 */
export function buildLibraryQuery(
    query: LibraryQuery,
    resolveFilter: FilterResolver = NO_FILTERS
): BuiltQuery {
    const conditions: string[] = [];
    const params: IndexValue[] = [];

    const term = query.search.trim();
    if (term.length > 0) {
        const pattern = `%${escapeLike(term)}%`;
        conditions.push(searchClause().where);
        // One bound value per `?` in the clause: five columns, five copies.
        params.push(pattern, pattern, pattern, pattern, pattern);
    }

    for (const id of query.filters) {
        const clause = resolveFilter(id);
        if (clause === null) {
            // A filter id with no clause is a bug or stale state, not an empty
            // filter. Returning the unfiltered library would be a silent wrong
            // answer -- more recipes than the user asked to see -- so refuse
            // loudly instead. Nothing produces filter ids until the vocabulary
            // is wired in, so this cannot fire in normal operation; when it
            // does, it means the resolver and the ids disagreed.
            throw new Error(`libraryQuery: unknown filter id "${id}"`);
        }
        conditions.push(`(${clause.where})`);
        if (clause.params) params.push(...clause.params);
    }

    const where = conditions.length > 0
        ? `\nWHERE ${conditions.join("\n  AND ")}`
        : "";

    // Favourites-first is a leading ORDER BY term, independent of the axis, so
    // it composes with any sort rather than replacing it: favourites in the
    // chosen order, then everyone else in the same order. The axis fragment
    // already carries the name and uuid tie breaks, so nothing follows it.
    const orderPrefix = query.favouritesFirst ? "favourite DESC, " : "";
    const orderBy = `${orderPrefix}${orderByFragment(query.sort, query.direction)}`;

    // Returns the blob, not the index columns. `recipes.recipeJSON` is the only
    // source of truth; the index columns are a derived cache used to filter and
    // sort and are lossy by design (NULL for an unindexed row). The screen needs
    // whole recipes, so hydrating from the blob is the honest answer, and
    // selecting it alongside the uuid lets `RecipeDatabase` build every result
    // from one pass over these rows in ORDER BY order rather than re-reading each
    // recipe by uuid.
    const sql = `SELECT recipes.uuid AS uuid, recipes.recipeJSON AS recipeJSON
FROM recipes
LEFT JOIN (
    SELECT recipeUuid, MAX(startedAt) AS lastBrewedAt, COUNT(*) AS brewCount
    FROM brews
    GROUP BY recipeUuid
) AS brewStats ON brewStats.recipeUuid = recipes.uuid${where}
ORDER BY ${orderBy};`;

    return {sql, params};
}

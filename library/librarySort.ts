/**
 * The sort vocabulary: the axes the library can be ordered by, each with its
 * chip label, its two direction words, its default direction, and the ORDER BY
 * it contributes to the query.
 *
 * One table, read from everywhere. The sort chip, the sort sheet's direction
 * pair and the query builder all derive from `SORT_AXES` rather than restating
 * the axis list, for the reason `recipeIndex.ts` gives for its column array: a
 * vocabulary written out in four places is how one copy drifts from the others,
 * which is exactly how `showHints` once went missing from backups. Adding an
 * axis is one entry here and nothing anywhere else.
 *
 * No SQL runs here and no database is imported. This module only says what a
 * valid sort is and what ORDER BY text each one produces; the query builder
 * assembles and `RecipeDatabase` executes.
 */

export type SortAxis =
    "name" | "added" | "lastBrewed" | "timesBrewed" | "rating" | "ratio";
export type SortDirection = "asc" | "desc";

/**
 * The ultimate tie break. Two recipes equal on every sort term must still land
 * in the same order on every launch, or a list nobody edited appears to
 * reshuffle itself between openings. `uuid` is the one column that is unique and
 * stable, so it is what finally settles the order.
 */
const UUID_TIE = "uuid ASC";

/**
 * Every axis but name falls back to name before uuid, so nine recipes at zero
 * brews read alphabetically rather than in whatever order the brews join
 * happened to emit. NOCASE is restated rather than trusted to the column's
 * declared collation, so a fragment is correct read on its own.
 */
const NAME_TIE = "sortName COLLATE NOCASE ASC";

/** A non-name axis: its own term, then the shared name and uuid tie breaks. */
function withTieBreaks(term: string): string {
    return `${term}, ${NAME_TIE}, ${UUID_TIE}`;
}

/**
 * Never brewed sorts last under this axis in BOTH directions, not merely "NULLs
 * last" by accident of SQLite's ordering. LONGEST AGO must not open with the
 * recipes nobody has ever brewed, so the CASE forces them to the end first and
 * the real dates order among themselves after. `lastBrewedAt` is NULL when the
 * brews join found nothing, so the same guard covers RECENT and LONGEST AGO.
 */
function brewedOrder(direction: SortDirection): string {
    const term = direction === "asc" ? "lastBrewedAt ASC" : "lastBrewedAt DESC";
    return withTieBreaks(`CASE WHEN lastBrewedAt IS NULL THEN 1 ELSE 0 END, ${term}`);
}

/**
 * The same never-brewed-last intent as `brewedOrder`, but the guard is not the
 * same shape, and the difference is not decoration. `MAX(date)` over a recipe's
 * empty set of brews really is NULL, so `brewedOrder` can test `IS NULL` and be
 * right. A COUNT over that same empty set is 0, not NULL -- so a bare `IS NULL`
 * test here would never fire, the CASE would be a dead no-op, and under LEAST
 * the never-brewed recipes would lead the list rather than trail it, breaking
 * the invariant in exactly the direction it is meant to prevent. This module
 * cannot see how the query builder in the sibling task will aggregate: a plain
 * grouped LEFT JOIN hands back 0, a correlated subquery that never matched
 * could hand back NULL. Treating both as never brewed is belt and braces on
 * purpose, so the guard holds whichever shape arrives and nobody has to
 * remember to "simplify" it back the day the join changes.
 */
function countOrder(direction: SortDirection): string {
    const term = direction === "asc" ? "brewCount ASC" : "brewCount DESC";
    return withTieBreaks(`CASE WHEN COALESCE(brewCount, 0) = 0 THEN 1 ELSE 0 END, ${term}`);
}

/**
 * Never rated sorts last in both directions, for the same reason LONGEST AGO
 * must not open with the recipes nobody has ever brewed: WORST is a question
 * about coffee somebody drank and judged, and a list of recipes with no verdict
 * at all is not an answer to it.
 *
 * `avgRating` is NULL for a recipe with no brews and NULL again for a recipe
 * whose brews are all unrated, because the join averages `NULLIF(rating, 0)`.
 * One guard therefore covers both, and a recipe that has been brewed nine times
 * without comment sits with the never-brewed rather than at the bottom of the
 * scale it was never put on.
 */
function ratingOrder(direction: SortDirection): string {
    const term = direction === "asc" ? "avgRating ASC" : "avgRating DESC";
    return withTieBreaks(`CASE WHEN avgRating IS NULL THEN 1 ELSE 0 END, ${term}`);
}

/**
 * Unnamed recipes sort last under name in both directions, not first as SQLite
 * would put their NULL `sortName`. `recipeIndex.ts` stores NULL rather than the
 * formatted placeholder precisely so this axis can push them to the end
 * deliberately instead of scattering them under a localised date string. The
 * name term is the tie break here, so only uuid follows it.
 */
function nameOrder(direction: SortDirection): string {
    const term = direction === "asc"
        ? "sortName COLLATE NOCASE ASC"
        : "sortName COLLATE NOCASE DESC";
    return `sortName IS NULL, ${term}, ${UUID_TIE}`;
}

type AxisSpec = {
    /** The full name of the axis, in Doto caps. The sort sheet's row. */
    label: string;
    /**
     * A shorter form for the rail chip, where one is needed.
     *
     * The chip sits in a row that already holds a segmented view toggle and
     * three other controls, and a two-word axis pushed the last of them off the
     * edge of a narrow phone. The rail scrolls now, so nothing is ever lost,
     * but a control you have to scroll to is a control you stop using: this is
     * what keeps the common case on screen without one.
     *
     * Only the two-word axes carry one. The rest are already a single word and
     * a second spelling of the same word would be a second thing to keep true.
     */
    chip?: string;
    /** The two direction words, taken verbatim from the design's table. */
    directionLabels: Record<SortDirection, string>;
    /**
     * The same vocabulary as a screen reader says it, because Doto caps are a
     * typographic choice and not a sentence: "LAST BREWED" / "RECENT" is a chip,
     * "last brewed, most recent first" is speech. It lives in this table rather
     * than in a map beside the rail so there is still exactly one place an axis
     * is described. A second table would typecheck forever and drift silently
     * the first time a word here changed without it.
     */
    spoken: {axis: string; directions: Record<SortDirection, string>};
    /**
     * The direction applied when this axis is first chosen, picked so one tap is
     * useful: the newest additions, the most recent brews, the most-brewed, the
     * lowest ratios, and names from A.
     */
    defaultDirection: SortDirection;
    /** The complete ORDER BY body this axis and direction produce. */
    orderBy: (direction: SortDirection) => string;
};

/** The whole vocabulary. */
export const SORT_AXES: Record<SortAxis, AxisSpec> = {
    name: {
        label: "NAME",
        spoken: {axis: "name", directions: {asc: "A to Z", desc: "Z to A"}},
        directionLabels: {asc: "A TO Z", desc: "Z TO A"},
        defaultDirection: "asc",
        orderBy: nameOrder
    },
    added: {
        label: "ADDED",
        spoken: {axis: "date added", directions: {asc: "oldest first", desc: "newest first"}},
        directionLabels: {asc: "OLDEST", desc: "NEWEST"},
        defaultDirection: "desc",
        orderBy: (direction) =>
            withTieBreaks(direction === "asc" ? "createdAt ASC" : "createdAt DESC")
    },
    lastBrewed: {
        label: "LAST BREWED",
        chip:  "BREWED",
        spoken: {axis: "last brewed", directions: {asc: "longest ago first", desc: "most recent first"}},
        directionLabels: {asc: "LONGEST AGO", desc: "RECENT"},
        defaultDirection: "desc",
        orderBy: brewedOrder
    },
    timesBrewed: {
        label: "TIMES BREWED",
        chip:  "TIMES",
        spoken: {axis: "times brewed", directions: {asc: "least brewed first", desc: "most brewed first"}},
        directionLabels: {asc: "LEAST", desc: "MOST"},
        defaultDirection: "desc",
        orderBy: countOrder
    },
    rating: {
        label: "RATING",
        spoken: {axis: "rating", directions: {asc: "worst first", desc: "best first"}},
        directionLabels: {asc: "WORST", desc: "BEST"},
        defaultDirection: "desc",
        orderBy: ratingOrder
    },
    ratio: {
        label: "RATIO",
        spoken: {axis: "ratio", directions: {asc: "low to high", desc: "high to low"}},
        directionLabels: {asc: "LOW TO HIGH", desc: "HIGH TO LOW"},
        defaultDirection: "asc",
        orderBy: (direction) =>
            withTieBreaks(direction === "asc" ? "ratio ASC" : "ratio DESC")
    }
};

/** The axes in the order the sort sheet lists them. */
export const SORT_AXIS_ORDER: readonly SortAxis[] = [
    "name", "added", "lastBrewed", "timesBrewed", "rating", "ratio"
];

/**
 * Whether a value is one of the known sort axes.
 *
 * `Object.hasOwn` rather than `in`, because `in` walks the prototype chain and
 * would answer true for `"toString"`, `"constructor"` and `"__proto__"`. Those
 * are exactly the strings a hostile backup would carry, and they would pass
 * this guard, be written to storage, and then index `SORT_AXES` to a function
 * with no `orderBy` -- the crash the narrowing readers exist to prevent.
 */
export function isSortAxis(value: unknown): value is SortAxis {
    return typeof value === "string" && Object.hasOwn(SORT_AXES, value);
}

/** Whether a value is one of the two directions. */
export function isSortDirection(value: unknown): value is SortDirection {
    return value === "asc" || value === "desc";
}

/**
 * Narrows an unchecked value to a `SortAxis`, falling back to name.
 *
 * The `SortAxis` union documents intent but cannot enforce it at the read
 * boundary: `Settings.get` returns the value widened back to `string` and
 * checks only `typeof`, so `settings.get("librarySort")` can hand back any
 * string a stale or hand-edited row holds. Every reader that indexes
 * `SORT_AXES` narrows through here first, so an unknown axis becomes a sort by
 * name -- a quiet, correct fallback -- rather than an index into `undefined`
 * that throws while assembling a query and takes the whole library screen down.
 * The same shape as `asTemperatureUnit` in `units.ts`, for the same reason.
 */
export function asSortAxis(value: unknown): SortAxis {
    return isSortAxis(value) ? value : "name";
}

/** Narrows an unchecked value to a `SortDirection`, falling back to ascending. */
export function asSortDirection(value: unknown): SortDirection {
    return isSortDirection(value) ? value : "asc";
}

/** The ORDER BY body for an axis and direction. */
export function orderByFragment(axis: unknown, direction: unknown): string {
    return SORT_AXES[asSortAxis(axis)].orderBy(asSortDirection(direction));
}

/** The two direction words under a given axis, so a control can label itself. */
export function directionLabels(axis: unknown): Record<SortDirection, string> {
    return SORT_AXES[asSortAxis(axis)].directionLabels;
}

/** The direction to apply when an axis is first chosen. */
export function defaultDirection(axis: unknown): SortDirection {
    return SORT_AXES[asSortAxis(axis)].defaultDirection;
}

/** The chip label for an axis, in Doto caps. */
export function chipLabel(axis: unknown): string {
    const spec = SORT_AXES[asSortAxis(axis)];
    return spec.chip ?? spec.label;
}

/**
 * Whether the sort is the library's default of name ascending. This is the
 * global default the sort chip stays a bare glyph for; any other state gives
 * the chip the accent fill and makes it name its axis, so a library in an
 * unusual order never looks like one in its usual order.
 */
export function isDefaultSort(axis: SortAxis, direction: SortDirection): boolean {
    return axis === "name" && direction === "asc";
}

import {HIGHLY_RATED, PROFILE_FLOOR, type ProfileField} from "./beanProfile";
import {
    BEAN_FIELDS,
    isFermentation,
    isProcess,
    isRoast,
    type BeanField
} from "./brew/beanTags";
import {COUNTED_SQL, RATED_SQL} from "./brew/brewPopulation";
import type {FilterClause} from "./libraryQuery";
import {tagKey} from "./tagKey";

/**
 * The library filters derived from brew history: brewed with this coffee, and
 * brewed well with it.
 *
 * `libraryFilters.ts` cannot hold these. Its `FilterId` is a closed union and
 * `STOCK_FILTERS` a `Record` over it, and that shape is right for a fixed
 * vocabulary of card-shape shelves. Origin and custom tags are free text, so
 * the set here is unbounded and the ids have to be parameterised instead.
 *
 * Which makes this module the security boundary `libraryQuery.ts` describes.
 * Three rules, and every one of them is load-bearing:
 *
 * - the field is checked against a list this module owns, and an unknown field
 *   is refused rather than passed on;
 * - the column name is read from a literal map here. It is never taken from the
 *   id, so no part of what a person typed can reach the SQL *text*;
 * - a preset value is checked against `beanTags`' closed vocabulary; origin and
 *   custom values have no vocabulary to check against and are bound, never
 *   spliced.
 *
 * Refusing returns null, which `buildLibraryQuery` already handles.
 */

export const BEAN_FILTER_PREFIX = "bean:";

/**
 * The rated flag leads the field. It does not trail the value.
 *
 * The design sketched `bean:process:Natural:rated`, which cannot be parsed:
 * the value is the unbounded tail and a custom tag may legally contain a colon,
 * so `bean:custom:9:rated` is both "the tag `9:rated`" and "the tag `9`, highly
 * rated". With the flag in a fixed position the id splits from the left at a
 * known arity and everything after the field is the value, whatever is in it.
 */
const RATED_MARKER = "rated:";

export type BeanFilter = {
    field: ProfileField;
    /**
     * Exactly what will be bound: the raw column text for a preset or an
     * origin, and the folded `tagKey` for a custom tag. `beanVocabulary` hands
     * back values in this form for the same reason.
     */
    value: string;
    /** Whether the filter also demands the value was brewed well. */
    rated: boolean;
};

/**
 * The column each preset field lives in.
 *
 * A literal map, and the reason no input can reach the statement's text. The
 * names happen to match their fields today; writing them out is what stops that
 * being read as a rule.
 *
 * No test can tell this map from `b.${field}`, and that is worth saying out
 * loud rather than leaving somebody to discover it: replacing it with the field
 * name kills nothing in the suite, because the four names coincide and the
 * field has already been narrowed to a closed list of five by the time it is
 * read. So this is a guard against a future field whose column is named
 * differently, not something the tests enforce. Deleting it would not fail CI.
 * It would simply move the boundary somewhere less obvious.
 */
const COLUMN: Record<BeanField, string> = {
    origin: "origin",
    roast: "roast",
    process: "process",
    fermentation: "fermentation"
};

/**
 * The closed vocabularies, by field.
 *
 * `origin` and `custom` are absent on purpose: they are free text and there is
 * nothing to check them against. Every validator here is `beanTags`' own, so
 * the filter and the editor cannot come to disagree about what a process is.
 */
const VOCABULARY: Partial<Record<ProfileField, (value: unknown) => boolean>> = {
    roast: isRoast,
    process: isProcess,
    fermentation: isFermentation
};

const PROFILE_FIELDS: readonly string[] = [...BEAN_FIELDS, "custom"];

function isProfileField(value: string): value is ProfileField {
    return PROFILE_FIELDS.includes(value);
}

/** The filter id for one value, in the shape `parseBeanFilterId` reads. */
export function beanFilterId({field, value, rated}: BeanFilter): string {
    return `${BEAN_FILTER_PREFIX}${rated ? RATED_MARKER : ""}${field}:${value}`;
}

/** What a filter id names, or null when it is not one of ours. */
export function parseBeanFilterId(id: string): BeanFilter | null {
    if (!id.startsWith(BEAN_FILTER_PREFIX)) return null;
    const body = id.slice(BEAN_FILTER_PREFIX.length);
    const rated = body.startsWith(RATED_MARKER);
    // No field is called "rated", so the marker cannot be mistaken for one.
    const rest = rated ? body.slice(RATED_MARKER.length) : body;
    const colon = rest.indexOf(":");
    if (colon <= 0) return null;
    const field = rest.slice(0, colon);
    const value = rest.slice(colon + 1);
    if (!isProfileField(field) || value.length === 0) return null;
    return {field, value, rated};
}

/** Brews of this recipe, as a correlated subquery's FROM. */
const PLAIN_FROM = "brews b";
const TAGGED_FROM = "brews b JOIN brew_tags t ON t.brewId = b.id";

function existsWhere(from: string, match: string): string {
    return `EXISTS (
    SELECT 1 FROM ${from}
    WHERE b.recipeUuid = recipes.uuid AND ${COUNTED_SQL} AND ${match}
)`;
}

/**
 * The floor and the average, as two correlated subqueries.
 *
 * Deliberately not a `HAVING` inside an `EXISTS`. That construction works and
 * is hard to read, and this is the clause a future reader most needs to be able
 * to check by eye. The value binds twice because it appears in both.
 *
 * The rating condition is scoped to the value, which is the whole point:
 * a recipe whose Natural brews average 4.4 matches even if its overall average
 * is 3.1. A `NATURAL` chip ANDed with a separate library-wide HIGHLY RATED chip
 * would mean something weaker and different, and would match a recipe with one
 * lovely Washed brew and four bad Naturals.
 *
 * `PROFILE_FLOOR` and `HIGHLY_RATED` are numbers this app owns, so they are
 * spliced; only the value is bound.
 */
function ratedWhere(from: string, match: string): string {
    const scope = `WHERE b.recipeUuid = recipes.uuid AND ${RATED_SQL} AND ${match}`;
    return `(SELECT COUNT(*) FROM ${from} ${scope}) >= ${PROFILE_FLOOR}
AND (SELECT AVG(b.rating) FROM ${from} ${scope}) >= ${HIGHLY_RATED}`;
}

/** A bean filter id's clause, or null when the id is not ours or not valid. */
export function resolveBeanFilter(id: string): FilterClause | null {
    const parsed = parseBeanFilterId(id);
    if (parsed === null) return null;
    const {field, value, rated} = parsed;

    const known = VOCABULARY[field];
    if (known !== undefined && !known(value)) return null;

    if (field === "custom") {
        // A custom tag binds its folded form, matching how `brew_tags` is keyed.
        // A tag of nothing but spaces folds to "" and would match every
        // untagged row's absent key, so it is refused before it can.
        const bound = tagKey(value);
        if (bound.length === 0) return null;
        return rated
            ? {where: ratedWhere(TAGGED_FROM, "t.tagKey = ?"), params: [bound, bound]}
            : {where: existsWhere(TAGGED_FROM, "t.tagKey = ?"), params: [bound]};
    }

    const match = `b.${COLUMN[field]} = ?`;
    return rated
        ? {where: ratedWhere(PLAIN_FROM, match), params: [value, value]}
        : {where: existsWhere(PLAIN_FROM, match), params: [value]};
}

/**
 * What to call a bean filter on a chip, or null when the id is not ours.
 *
 * A preset is raised to Doto caps because those three words are the app's own
 * vocabulary. An origin and a custom tag keep the spelling they were given, the
 * same rule `filterLabel` already applies to a tag shelf: those are the user's
 * words, not the app's. A custom tag shows its folded form, because that is
 * what the id carries and what is actually being matched.
 */
export function beanFilterLabel(id: string): string | null {
    const parsed = parseBeanFilterId(id);
    if (parsed === null) return null;
    const own = parsed.field === "origin" || parsed.field === "custom";
    const name = own ? parsed.value : parsed.value.toUpperCase();
    return parsed.rated ? `${name} · ${HIGHLY_RATED}★+` : name;
}

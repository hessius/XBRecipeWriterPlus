# Derived tag and rating profile

**Issue:** #104. Part of #95. Depends on #98, #99, #100 and #101, all of which
are merged into `brew-history`.

**Goal:** answer *what has this recipe actually done, and with what coffee*, out
of brew data alone, and let the library be filtered by the answer.

---

## What already exists

The ground is better prepared than #104's own audit comment suggests. Both of
its blockers landed.

- **#98** put the counting rule in one place. `library/brew/brewPopulation.ts`
  owns `COUNTED_SQL`, `MEASURED_SQL`, `TIMED_SQL` and `RATED_SQL`, and the
  library query and the recipe card both draw on it. A cancelled brew already
  cannot inflate a count.
- **#99** put a star rating and a note on a brew.
- **#100** put the coffee on the brew. Crucially, **the four preset fields are
  columns on `brews`**: `origin`, `roast`, `process`, `fermentation`.
  `brew_tags` holds only the free-form custom tags. The presets therefore need
  no tag-key folding, and a closed vocabulary (`library/brew/beanTags.ts`)
  validates them.
- **#101** put intent tags on a recipe, in `recipe_tags`.
- The rating half of the profile already ships as `RecipeEvidence`
  (`library/libraryQuery.ts`), rendered by `library/recipeEvidence.ts` as
  `4.3 · 12 · 3D`.

**`brews` and `recipes` live in the same `xbrecipewriter.db`.**
`ensureBrewTables` is exported and called from both classes precisely so the
existing `brewStats` join is legal on a fresh install. A brew-derived filter is
therefore an ordinary correlated subquery, not a cross-database problem.

**What is missing:** the tag half of the profile, any statement of the success
rule, and any brew-derived clause in `STOCK_FILTERS`, all sixteen of whose
filters are card-shape only.

---

## The decisions, and why

### It is a ledger, not a verdict

The recipe page reports what the recipe has been brewed with, in figures. It
never says a recipe is *good for* anything.

#95 already refuses to write a derived tag onto a recipe, because that would be
an un-undoable edit with no provenance. A verdict printed on the recipe page is
the same instinct one step back: it hides the arithmetic that makes the claim
falsifiable. `Works well for Natural` off three brews is a confident sentence
built on very little.

The threshold still exists, but it belongs to the **filter**, where it is a
definition the user chose rather than an assertion the app made. That is also
where #104's "the success rule is stated in the UI" is satisfied.

### Everything tagged earns a row

Presets, origin and custom tags all rank together in one list. Nothing the user
recorded is discarded.

The counter-argument was that free text splits silently: `Ethiopia Guji` and
`Ethiopia, Guji` are one coffee and two rows. That is true and is accepted.
Refusing to show origin at all would be a larger loss, because origin is half of
how people describe a coffee, and a custom tag like `dad's bag` is exactly the
kind of grouping the library filter was asked to support.

### The untagged brews are a row, not a footnote

Most brews will be untagged, and **the tagged ones will rate higher**, because
people tag the brews they cared about. A ledger that quietly speaks only for
tagged brews therefore flatters every recipe, and disagrees with the
`4.1 · 11` already on the card with nothing on screen to explain the gap.

`Not tagged · 7 brews · 3.8` is pinned below a rule, outside the cap, always
visible. It is not a property of coffee and so sits slightly oddly among rows
that are. That is the price of the denominator being impossible to miss, and it
is worth paying. It also gives tagging an obvious front door.

### The floor counts rated brews, and this is a known wart

A row may rank on its average only when at least **3 rated** brews back it.

The floor must count rated brews rather than counted ones, or a row with eleven
brews and one rating would rank on an average of one number, which is the error
the floor exists to prevent.

The cost is that the displayed count is the *counted* count, so a row reading
`4.5 · 11` can fail a floor of 3 with nothing on screen explaining why. The
alternative was to print the rated count as a third figure
(`4.5 · 11 · 2 rated`), which was rejected as too busy for a glance.

**This is deliberately shipped as a wart.** Raise a follow-up issue recording
the objection, and decide in practice whether the silence generates confusion.
Do not quietly change the floor to count counted brews: that undoes the
decision rather than revisiting it.

### Intent and evidence must never share a chip

#104's audit comment is explicit: the `recipe_tags` filter and the brew-derived
filter are different claims, and sharing a chip would blur the roadmap's central
decision. An intent tag says what the recipe is *for*; an evidence row says what
it has *done*.

They are separated by glyph and accent, not by wording alone: intent chips keep
their tag outline, evidence chips carry a star.

---

## The data layer

### `BrewDatabase.beanProfileFor(recipeUuid)`

The only thing that knows how a profile is derived. One method, for the reason
#98 gives about answering "what has this recipe done?" once rather than four
times in four screens.

`BeanField` is already exported by `library/brew/beanTags.ts` and is the four
preset fields. The profile needs a fifth case for custom tags, so it extends
rather than redeclares: a second type of the same name with a different arm is
how the two come to disagree.

```ts
import type {BeanField} from "@/library/brew/beanTags";

export type ProfileField = BeanField | "custom";

export type BeanProfileRow = {
    field: ProfileField;
    /** The value as the user recorded it, for display. */
    value: string;
    /** Counted brews carrying this value. */
    brews: number;
    /** Of those, how many carry a rating. The floor is applied to this. */
    rated: number;
    /** The average over the rated ones, or 0 where there are none. */
    avgRating: number;
};

export type BeanProfile = {
    rows: BeanProfileRow[];
    /** Counted brews carrying no preset field and no custom tag. */
    untagged: {brews: number; rated: number; avgRating: number};
    /** Every counted brew for the recipe. `rows` overlap, so they do not sum to this. */
    counted: number;
};
```

Five sources are unioned: the four preset columns and `brew_tags`. Every one is
scoped by `COUNTED_SQL` and rated by `RATED_SQL` from `brewPopulation.ts`, reused
rather than restated, so a cancelled brew cannot inflate a row exactly as it
cannot inflate the evidence line today.

`untagged` is the same population restricted to rows where all four columns are
`''` and no `brew_tags` row exists. Because it is drawn from the same population
as `counted`, the ledger's denominator and the card's `· 11` are provably the
same number.

`rows` deliberately overlap: one brew contributes to its roast row, its process
row and its origin row. The rows do not sum to `counted` and the UI must never
imply that they do.

---

## The pure rules: `library/beanProfile.ts`

Plain TypeScript, no React, no SQL. The split `recipeEvidence.ts` already uses,
so the ordering rule is testable without rendering anything or opening a
database.

```ts
/**
 * Rated brews a row needs before its average may rank it.
 *
 * Counted brews would be the intuitive choice and is wrong: a row with eleven
 * brews and one rating would then rank on an average of one number, which is
 * the whole error this floor exists to prevent. See the design note about the
 * wart this leaves in the UI before changing it.
 */
export const PROFILE_FLOOR = 3;

/** Where "this worked" starts, for the library filter. */
export const HIGHLY_RATED = 4;

/** Rows shown before the ledger asks to be opened in full. */
export const PROFILE_CAP = 5;

export function rankProfileRows(rows: readonly BeanProfileRow[]): BeanProfileRow[];
```

`rankProfileRows` puts every row at or above the floor first, ordered by
`avgRating` descending, then `brews` descending, then `value` ascending so the
order is total and a test cannot pass by luck. Below-floor rows follow, ordered
by `brews` descending then `value` ascending: they keep their figures and their
place in the list, they simply cannot outrank an evidenced row.

The tie-breakers matter. Without them SQLite's row order leaks into the UI and
the list reshuffles between renders for no reason the user can see.

---

## The ledger on the recipe page

A `BeanProfileDeck`, near the existing brew summary on the recipe editor's
ABOUT deck.

```
BREWED WITH
15 of 24 brews tagged

  FERMENT      Co-ferment            4.8 · 3
  ORIGIN       Ethiopia Guji         4.7 · 3
  PROCESS      Natural               4.6 · 9
  ROAST        Light                 4.5 · 11
  PROCESS      Washed                4.0 · 5
  SHOW ALL 8 ›
  ─────────────────────────────────
  NOT TAGGED   9 brews                   3.9
```

- The field label is Doto; the value is Inter, because origin and custom tags
  are text a person typed.
- The figures are Doto, in the recipe's accent, using the existing interpunct
  convention (`18 g · 1:16`).
- `SHOW ALL n ›` opens a sheet with every row. The cap is five.
- The untagged row is pinned below a rule and is outside the cap.

**Empty states.** No counted brews at all: no deck. Counted brews but none
tagged: the deck renders with a single line of Inter prose inviting the user to
tag a brew, and no rows. A deck consisting only of a `Not tagged` row would be
a strange thing to show.

---

## The library filter

### Why the ids are parameterised

`FilterId` is a closed union and `STOCK_FILTERS` a `Record` over it. Brew-derived
filters cannot join that union, because origin and custom tags are free text and
the set is unbounded.

Instead a second namespace resolved through the existing `FilterResolver` seam,
which `libraryQuery.ts` already documents as the security boundary: a resolver
may only ever return fragments it owns, so nothing user-authored is concatenated.

```
bean:process:Natural           brewed with
bean:process:Natural:rated     brewed with, and highly rated
bean:custom:dad's bag          a custom tag
```

### `library/beanFilters.ts`

Parses an id and returns a `FilterClause`, or null.

1. The field is checked against an owned list. An unknown field is refused.
2. The **column name is read from a literal map this module owns**. It is never
   taken from the id, so no input can reach the SQL text.
3. A preset value is checked against the closed vocabulary with the existing
   `isRoast` / `isProcess` / `isFermentation`. An unknown preset is refused
   rather than repaired, matching the rule `beanTags.ts` already states about
   near misses.
4. Origin and custom values have no vocabulary and are **bound**, never spliced.
   Custom binds `tagKey(value)`, matching how `brew_tags` is keyed.

Refusing returns null, which `buildLibraryQuery` already handles.

### The clauses

Brewed with a preset:

```sql
EXISTS (
    SELECT 1 FROM brews b
    WHERE b.recipeUuid = recipes.uuid
      AND (b.outcome IN ('done', 'endedOnMachine'))
      AND b.process = ?
)
```

Brewed with a custom tag:

```sql
EXISTS (
    SELECT 1 FROM brews b
    JOIN brew_tags t ON t.brewId = b.id
    WHERE b.recipeUuid = recipes.uuid
      AND (b.outcome IN ('done', 'endedOnMachine'))
      AND t.tagKey = ?
)
```

Highly rated adds the floor and the average as two correlated subqueries rather
than a `HAVING`, because `HAVING` without `GROUP BY` inside `EXISTS` is a
construction that works and is hard to read, and this clause is the one a future
reader most needs to be able to check by eye:

```sql
(SELECT COUNT(*) FROM brews b
  WHERE b.recipeUuid = recipes.uuid AND <counted> AND b.rating > 0
    AND b.process = ?) >= 3
AND
(SELECT AVG(b.rating) FROM brews b
  WHERE b.recipeUuid = recipes.uuid AND <counted> AND b.rating > 0
    AND b.process = ?) >= 4
```

The value binds twice. `<counted>` is spliced from `COUNTED_SQL`, which is a
literal `brewPopulation.ts` owns.

Note that the rating condition is scoped **to the tag**. A recipe whose Natural
brews average 4.4 matches even if its overall average is 3.1, and that is the
point: `NATURAL · 4★+` ANDed with a separate `HIGHLY RATED` chip would mean
something weaker and different, and would match a recipe with one lovely Washed
brew and four bad Naturals.

### The picker

One `BEANS` chip in the rail, with a trailing caret, opening a `BeanFilterSheet`.

**The sheet offers only values the user's own history contains.** There is no
text field. Origin and custom tags are free text, so typing them again here
would reintroduce precisely the splitting problem the ledger already tolerates,
and it would let a user filter on a value no brew carries and get an empty
library with no explanation. A second method supplies the list:

```ts
/** Every value any counted brew carries, with how many recipes carry it. */
public beanVocabulary(): {field: ProfileField; value: string; recipes: number}[];
```

Grouped by field in `BEAN_FIELDS` order, custom last, each field's values
ordered by recipe count descending then value ascending. A field with no values
is not drawn at all, so a user who has never recorded a fermentation never sees
an empty Ferment heading.

One switch, `Highly rated only`, applying to the whole selection.

**Selection is multiple.** Filters are already ANDed, and "brewed with Natural
and Light" is a question worth asking. The rail then shows each chosen filter as
its own chip, tappable to remove, so a filter can be cleared without reopening
the sheet. The `BEANS` chip stays.

A single rail slot however far the vocabulary grows, and the sheet is the
natural home for stating the rule. The cost, accepted: every other filter in this
app is one tap, and a filter behind a door is one some people never find.

---

## Copy

Doto is all-caps with no full stop; Inter is sentence case. See `docs/copy.md`.

| Where | Register | Text |
|----|----|----|
| Deck title | Doto | `BREWED WITH` |
| Deck subtitle | Doto | `15 OF 24 BREWS TAGGED` |
| Untagged row | Doto | `NOT TAGGED` |
| Expander | Doto | `SHOW ALL 8 ›` |
| Empty state | Inter | `No brews tagged yet. Tag a brew to see what this recipe does best.` |
| Rail entry chip | Doto | `BEANS` |
| Rail active chip | Doto | `NATURAL` |
| Rail active chip, highly rated | Doto | `NATURAL · 4★+` |
| Sheet title | Doto | `BEANS` |
| Switch | Inter | `Highly rated only` |
| Switch caption | Inter | `Average 4★ or better.` |

The floor of 3 is explained in the help sheet, not in the switch caption. The
caption states the rule a user is choosing; the floor is a guard on it.

Every string goes into `docs/copy.md` in the same pass, not afterwards.

---

## Testing

- `library/beanProfile.ts` is pure and gets ordinary unit tests: the floor, the
  ranking, the tie-breakers, the cap.
- `BrewDatabase.beanVocabulary` is tested against real SQLite too: a value
  carried only by a cancelled brew must not appear, since the filter that value
  would build could never match anything.
- `library/beanFilters.ts` gets clause tests, and **refusal tests**: an unknown
  field, an unknown preset, and a value carrying SQL syntax must all be refused
  or bound, never concatenated.
- `BrewDatabase.beanProfileFor` is tested against **real SQLite** through
  `createTestDatabase` from `test-utils/sqlite.ts`. Not a `jest.mock` of
  `expo-sqlite`: that pattern-matches query strings and so cannot fail on wrong
  SQL, which is the trap that file was written to close.
- The filter clauses are tested through `buildLibraryQuery` against a real
  database with fixture brews, including a cancelled brew that must not count
  and a rated cancelled brew that must not move an average.
- `BeanProfileDeck` gets component tests asserting rendered text and accessible
  labels. RNTL v14 has removed `UNSAFE_getAllByType`, so the tree cannot be
  inspected.

Every test must be mutated to prove it can fail before it is accepted.

---

## What this does not do

- **No new tagging UI.** #100 owns that and has shipped.
- **No tasting notes.** #100 deliberately kept them out of the vocabulary, and
  they would be a much larger axis.
- **No writing anything onto a recipe.** The profile is derived at query time.
  Re-rating a brew changes it with no migration and no repair step, which is the
  constraint #104 cares most about.
- **No new shelves.** #141 owns auto shelves and may consume these filters later.
- **No device verification of the figures against a real history.** The
  fixtures are synthetic. A pass over a real library is required before this is
  trusted, and belongs in the whole-section test list.

---

## Follow-up to raise

The floor counts rated brews while the row displays counted brews, so a row
reading `4.5 · 11` can fail a floor of 3 with nothing explaining why. Record the
objection and the rejected alternative (`4.5 · 11 · 2 rated`) and decide from
use, not from argument.

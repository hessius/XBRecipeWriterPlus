# Three more auto shelves

Issue #141. The issue is the design; this is the plan and the three decisions
it left open.

## What is being added

Three entries in `STOCK_FILTERS`, three places in `STOCK_FILTER_ORDER`, and
nothing else. `app/index.tsx`, `shelves.ts` and `useRecipeLibrary.ts` all
derive from those two exports already, so the chips, the grid, the counts and
the shelf art pick the shelves up without a line changing in any of them.

| id | label | clause |
|----|-------|--------|
| `favourites` | FAVOURITES | `favourite = 1` |
| `neverBrewed` | NEVER BREWED | `NOT EXISTS` a counted brew |
| `mostBrewed` | MOST BREWED | counted brews `>= 5` |

## Decision 1: the brew clauses count counted brews, not rows

The issue proposes `NOT EXISTS (SELECT 1 FROM brews WHERE recipeUuid =
recipes.uuid)`. That is one word short. `brewCount`, `brewEvidence`, the card's
evidence line and `librarySort`'s never-brewed-last guard are all the *counted*
population, `COUNTED_SQL` from `brewPopulation.ts`: a cancelled brew is a row
worth keeping and not a cup.

Without the outcome test a recipe whose only brews were cancelled would be off
the NEVER BREWED shelf while its own card said nothing had been brewed, and it
would sort with the never-brewed under BREW COUNT. Two definitions of one word,
disagreeing on screen in two places at once. Both clauses therefore compose
`COUNTED_SQL` rather than restating an outcome list.

## Decision 2: MOST BREWED is five counted brews

Fixed threshold, per the issue, named `MOST_BREWED_BREWS`. Five is the smallest
count that cannot be an accident: one is a try, two or three is a recipe being
dialled in, and five is a recipe somebody keeps coming back to. The shelf being
empty for a new user is handled by the existing floor of three recipes, and its
being large for an old one by the 80% ceiling.

## Decision 3: FAVOURITES is not suppressed

`availableFilters`' own doc comment says suppression is for shelves the app
invented, and that nothing a person authored, "a favourited recipe, a manual
tag shelf", is routed through it. A tag shelf of one is kept for exactly that
reason. A favourite is the same act, so the same rule applies: the floor of
three and the 80% ceiling are both waived, and the shelf is offered whenever it
holds anything at all.

It still goes *through* `availableFilters`, because that is the one gate the
chips and the grid share and they must not be able to disagree. The flag is
declared on the filter (`authored: true`), so the gate reads the vocabulary
rather than the vocabulary's ids being restated inside the gate.

## Decision 4: where they sit in the order

FAVOURITES first: it is the user's own mark and belongs before the app's
questions about their recipes. MOST BREWED and NEVER BREWED go after MINE and
before RECENTLY ADDED, where the shelves stop asking about the recipe and start
asking about the library's history.

## Tasks

1. `COUNTED_SQL`-based clause helpers and the three `STOCK_FILTERS` entries,
   the `authored` flag on `StockFilter`, the order, and the amendment to
   `STOCK_FILTERS`' doc comment that the issue asks for.
2. `isOffered`/`availableFilters` honouring `authored`.
3. Tests in `library/__tests__/libraryFilters.test.ts` and `shelves.test.ts`,
   plus an integration test that the clauses actually run in all three call
   sites against a real SQLite database.
4. Full gate, then the PR.

# Brew Aggregates by Recipe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Answer "what has this recipe done?" once, honestly, in `library/BrewDatabase.ts`, and correct the two places that already answer it wrongly.

**Architecture:** One new pure module, `library/brew/brewPopulation.ts`, holds the rule about which brews count as evidence, in two forms that are tested against each other: TypeScript predicates for callers holding rows, and parameter-free SQL fragments for callers writing queries. `BrewDatabase` and `libraryQuery` both splice the fragments rather than restating the rule. No schema change beyond an index.

**Tech Stack:** TypeScript, expo-sqlite (sync API), Jest with `jest-expo`.

**Issue:** #98

---

## Before you start

This issue exists because the same rule is currently written twice and is wrong
in both places. The point is not to add a third copy.

`BrewDatabase.summaryFor` and the `brewStats` LEFT JOIN inside
`buildLibraryQuery` both count `COUNT(*) FROM brews`, so a brew cancelled ten
seconds in counts as a time the recipe was brewed. The evidence line on the
library card says `4.3 · 12` and the 12 is overstated.

**Figures on screen will change. That is the point of the work, not a
regression.** Do not try to preserve existing test expectations that encode the
old counting. Change them, and say in the commit message that you did.

### The rule, decided and not open for reinterpretation

`BrewOutcome` is `done | endedOnMachine | cancelled | lostContact | failed`.

- **Counted as a brew:** `done` and `endedOnMachine` only. `endedOnMachine` is a
  complete brew the user stopped deliberately at the machine, so it is a real
  cup even though it undershot the plan. The other three are not cups.
- **Measured:** counted, *and* `watched = 1`. A hand-logged brew (written by
  `unobservedBrew`, `watched = 0`) carries a real date and a real rating and no
  figures at all. Averaging its zeroes into a mean would drag every recipe
  toward nought.
- **Timed:** measured, *and* `pouringAt > 0`. `pouringAt` defaults to `0` on
  rows written before the column existed, and the app falls back to `startedAt`
  for display. That fallback is not a measurement and must not enter a mean.
- **Rated:** counted, *and* `rating > 0`. The average is taken over the same
  population as the count, because the evidence line prints them side by side
  and two numbers drawn from different sets would be quietly lying about each
  other.

### Three codebase rules that will bite here

- `library/` is plain TypeScript, no React.
- `brews` and `recipes` share the SQLite file `xbrecipewriter.db`, which is what
  lets a single query reach both.
- `library/` modules in this repo carry substantial comments explaining *why* a
  rule is what it is. Match that voice.

## File structure

| File | Responsibility |
| --- | --- |
| `library/brew/brewPopulation.ts` (new) | The rule, in both forms. Pure. |
| `library/brew/__tests__/brewPopulation.test.ts` (new) | Proves the two forms agree. |
| `library/BrewDatabase.ts` (modify) | Index, corrected `summaryFor`, new aggregates, `brewsFor`, corrected `brewOn`. |
| `library/libraryQuery.ts` (modify) | `brewStats` obeys the rule. |
| `library/__tests__/BrewDatabase.test.ts` (modify) | Characterisation of all of it. |
| `library/__tests__/libraryQuery.test.ts` (modify) | The join's shape. |

---

### Task 1: The rule, in two forms that cannot drift

**Files:**
- Create: `library/brew/brewPopulation.ts`
- Test: `library/brew/__tests__/brewPopulation.test.ts`

- [ ] **Step 1: Write the failing test**

The important test here is not that the predicates work. It is that the SQL and
the TypeScript agree, because they are two statements of one rule and nothing
else in the codebase would notice them diverging.

Write a test that builds an in-memory SQLite database, inserts one row for every
combination of the five outcomes, both `watched` values, `pouringAt` of 0 and
non-zero, and `rating` of 0 and non-zero, then for each SQL fragment selects the
rows it admits and compares that set against the rows the matching TypeScript
predicate admits. They must be identical.

Also assert the cheap, explicit things so a reader can see the rule without
running it: that `done` and `endedOnMachine` count, that `cancelled`,
`lostContact` and `failed` do not, that an unwatched brew is counted but not
measured, and that a `pouringAt` of 0 is measured but not timed.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest library/brew/__tests__/brewPopulation.test.ts`
Expected: FAIL, cannot find module `@/library/brew/brewPopulation`.

- [ ] **Step 3: Write the module**

Export:

- `COUNTED_OUTCOMES: readonly BrewOutcome[]` and the three SQL fragments
  `COUNTED_SQL`, `MEASURED_SQL`, `TIMED_SQL`, each a parameter-free boolean
  expression over the `brews` columns, safe to splice into a `WHERE` or a
  `CASE WHEN`.
- `RATED_SQL`, which is `COUNTED_SQL` and a rating above zero.
- The TypeScript mirrors: `countsAsBrewed`, `isMeasured`, `isTimed`, `isRated`,
  each taking the fields it needs rather than a whole row, so a caller holding a
  `BrewRecord` and one holding a raw row can both use them.

The fragments must be built by composition (`MEASURED_SQL` literally contains
`COUNTED_SQL`) so that changing the outcome list changes all of them at once.

Comment the module with the reasoning from "The rule" above. This module is the
written-down rule that the issue asked for, so the reasoning lives here and
nowhere else.

- [ ] **Step 4: Verify**

Run: `npx jest library/brew/__tests__/brewPopulation.test.ts` — all pass.
Run: `npm run typecheck` and `npm run lint`.

- [ ] **Step 5: Commit**

---

### Task 2: An index on recipeUuid

**Files:**
- Modify: `library/BrewDatabase.ts` (`ensureBrewTables`)
- Test: `library/__tests__/BrewDatabase.test.ts`

There is no index on `brews` at all. Every query in this plan filters or groups
by `recipeUuid`, and #141's shelves will run a correlated subquery over `brews`
once per recipe row, so this stops being tidiness.

- [ ] **Step 1: Write the failing test**

Assert that after `ensureBrewTables`, querying `sqlite_master` for indexes on
`brews` returns one on `recipeUuid`. Follow the house pattern in
`library/__tests__/recipeIndex.test.ts`, which asserts on emitted `CREATE INDEX`
statements.

- [ ] **Step 2: Run it and watch it fail**

- [ ] **Step 3: Add the index**

`CREATE INDEX IF NOT EXISTS idx_brews_recipeUuid ON brews(recipeUuid);` inside
`ensureBrewTables`, alongside the table creation rather than in the `ALTER TABLE`
migration block below it. `IF NOT EXISTS` makes it idempotent, so it needs no
`try`/`catch` and it applies to existing installs on next open.

- [ ] **Step 4: Verify and commit**

---

### Task 3: `summaryFor` tells the truth, and says more

**Files:**
- Modify: `library/BrewDatabase.ts` (`BrewSummary`, `summaryFor`)
- Test: `library/__tests__/BrewDatabase.test.ts`

- [ ] **Step 1: Write the failing tests**

Build a recipe's history covering every case and assert the figures:

- Three `done` brews, one `cancelled`, one `failed` → `times` is 3, not 5.
- `endedOnMachine` counts toward `times`.
- A recipe whose only brews were cancelled reports `times` 0 and `lastAt` 0.
- `lastAt` is the last *counted* brew, so a cancellation after the last good
  brew does not move it.
- A rated `cancelled` brew does not enter `avgRating` or `rated`.
- A hand-logged brew (`watched: false`) counts toward `times`, `lastAt`,
  `avgRating` and `rated`, and does **not** enter `meanCupMl` or
  `meanBrewSeconds`.
- A brew with `pouringAt: 0` enters `meanCupMl` but not `meanBrewSeconds`.
- `abandoned` counts the three non-counted outcomes.
- A recipe with no brews at all returns zeroes throughout and no NaN.

- [ ] **Step 2: Run them and watch them fail**

- [ ] **Step 3: Implement**

Widen `BrewSummary` with `meanBrewSeconds`, `meanCupMl` and `abandoned`, each
documented with the population it is drawn from. Keep the existing four field
names: `HistorySection` and `useRecipeRating` read them.

Compute in one SQL statement using conditional aggregation and the fragments
from Task 1:

- `times` is `SUM(CASE WHEN <counted> THEN 1 ELSE 0 END)`.
- `lastAt` is `MAX(CASE WHEN <counted> THEN startedAt END)`.
- `avgRating` is `AVG(CASE WHEN <rated> THEN rating END)` and `rated` its
  `COUNT`.
- `meanBrewSeconds` is over `<timed>` rows, from `pouringAt` to `endedAt`.
- `meanCupMl` is over `<measured>` rows.
- `abandoned` is `SUM(CASE WHEN NOT (<counted>) THEN 1 ELSE 0 END)`.

A mean over no rows is SQL `NULL`; coalesce to 0 and say in a comment that 0
here means "nothing to average", consistent with the sentinel the rest of the
app uses.

- [ ] **Step 4: Verify and commit**

---

### Task 4: `brewsFor`, the per-recipe listing

**Files:**
- Modify: `library/BrewDatabase.ts`
- Test: `library/__tests__/BrewDatabase.test.ts`

#102 needs rows on the recipe page and #103 needs two brews to compare. Both
want the same query.

- [ ] **Step 1: Write the failing tests**

- Returns every brew for the uuid, newest first by `startedAt`.
- Returns brews of **every** outcome, unlike the aggregates. A cancelled brew is
  not evidence, but it is history and the user is entitled to see it. Say so in
  a comment; this is the one place the rule deliberately does not apply.
- Returns nothing for an unknown uuid.
- Does not load streams: assert it does not read `brew_samples`, using the same
  approach the existing tests use for `all()`. Each row's `hasStream` still
  reports truthfully.
- Each row carries its `plan`, so a caller can tell that two brews ran different
  plans. That is the whole of what #98 owes #103.

- [ ] **Step 2: Run them and watch them fail**

- [ ] **Step 3: Implement**

`public brewsFor(recipeUuid: string): StoredBrew[]`, mirroring `all()` with a
`WHERE recipeUuid = ?`. Reuse `hydrate`.

- [ ] **Step 4: Verify and commit**

---

### Task 5: The star must not vanish into a cancelled brew

**Files:**
- Modify: `library/BrewDatabase.ts` (`brewOn`)
- Test: `library/__tests__/BrewDatabase.test.ts`

This is a bug this plan would otherwise introduce, so it is part of the plan.

`useRecipeRating.rate()` asks `brewOn(uuid, now)` for today's brew and rates it,
or writes a hand-logged brew when there is none. Once a rating only counts on a
counted brew, a user whose only brew today was cancelled would press the star,
see the rating written to that cancelled brew, and see the recipe's average not
move. A silent no-op.

- [ ] **Step 1: Write the failing test**

With only a `cancelled` brew today, `brewOn` returns `null`, so the caller logs a
new brew by hand and the rating lands somewhere it counts. With a `done` brew
today it returns that brew's id as before. Add a test at the
`useRecipeRating` level too, asserting that rating a recipe whose only brew today
was cancelled raises `summaryFor(...).avgRating` above zero.

- [ ] **Step 2: Run it and watch it fail**

- [ ] **Step 3: Implement**

Add `AND <counted>` to `brewOn`'s `WHERE`. Comment it with the reasoning above:
the question `brewOn` answers is not "did anything happen today" but "is there a
brew today that a rating would mean something on".

- [ ] **Step 4: Verify and commit**

---

### Task 6: The library query obeys the same rule

**Files:**
- Modify: `library/libraryQuery.ts` (the `brewStats` subquery)
- Test: `library/__tests__/libraryQuery.test.ts`

- [ ] **Step 1: Write the failing tests**

- `brewCount` counts only counted brews, and `lastBrewedAt` is the last of them.
- `avgRating` is drawn from the same population, so a rated cancelled brew does
  not move it.
- A recipe whose only brews were cancelled has `brewCount` 0, and therefore
  `evidenceLine` returns `null` for it. Assert that end-to-end, because it is
  the user-visible consequence and it is what stops an orphaned rating being
  printed beside a count of nothing.
- The existing sort guards still work: `librarySort`'s never-brewed-last and
  never-rated-last guards key on `brewCount` and `avgRating`, and a recipe with
  only cancelled brews must now sort with the never-brewed.

- [ ] **Step 2: Run them and watch them fail**

- [ ] **Step 3: Implement**

Replace the aggregate expressions in the subquery with conditional aggregation
using the same fragments from Task 1. Do **not** add a `WHERE` to the subquery:
the rating rule and the counting rule need different row sets out of one scan,
and a `WHERE` would force a second pass or a second join.

Note that `brewCount` becomes `0` rather than `NULL` for a recipe with only
cancelled brews, where before the row was absent entirely. `librarySort` already
guards with `COALESCE(brewCount, 0) = 0`, so this is safe, but confirm it with
the test above rather than assuming.

Update the subquery's existing comment. It currently explains the `NULLIF` and
must now also explain the population.

- [ ] **Step 4: Verify and commit**

---

### Task 7: Green, and the story of what changed

- [ ] **Step 1: Full suite**

Run `npm test`, `npm run typecheck`, `npm run lint` and `npx expo-doctor`. All
four must be green; CI treats expo-doctor as a hard failure.

Expect to have changed existing expectations in tests that encoded the old
counting. For each one, confirm the new expectation is right rather than making
the test agree with the code.

- [ ] **Step 2: Mutation check**

Prove two of the tests bite, by breaking the code and confirming a specific test
fails, then reverting:

1. Change `COUNTED_OUTCOMES` to include `cancelled`. The `summaryFor` count test
   and the `evidenceLine` end-to-end test must both fail.
2. Remove the `pouringAt > 0` guard from `TIMED_SQL`. The mean brew time test
   must fail.

Report which tests failed. If either mutation leaves the suite green, the tests
are not testing what they claim and must be fixed.

- [ ] **Step 3: Open the PR**

Branch `brew-aggregates`. In the description, say plainly that figures already on
screen will change, and give the reason in one sentence a user would understand.
Reference #98.

---

## Notes for whoever picks this up

- **Do not touch `sweep`, `restore` or `insert`.** Retention and backup are
  about rows, not about evidence, and a cancelled brew is still a row worth
  keeping.
- **Do not change `recipeEvidence.ts`.** Its `brews <= 0` guard already does the
  right thing once the count is correct, and that is a nice demonstration that
  the guard was written for the right reason.
- **Do not add a setting.** The rule is a rule, not a preference.
- The `watched` axis and the outcome axis are independent. Folding them into one
  enum would be the obvious tidy-up and it would be wrong: a hand-logged brew is
  perfectly good evidence of a cup and of a verdict, and no evidence at all of a
  volume.

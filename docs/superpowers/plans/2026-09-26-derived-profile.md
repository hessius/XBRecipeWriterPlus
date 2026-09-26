# Derived tag and rating profile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Answer "what has this recipe actually been brewed with, and how did those brews go" out of brew data alone, show it on the recipe page as a ledger, and let the library be filtered by it.

**Architecture:** Three layers, matching the repo's existing split. `library/beanProfile.ts` is pure TypeScript holding the types, the thresholds and the ranking rule. `BrewDatabase` gains two read methods (`beanProfileFor`, `beanVocabulary`) that derive everything at query time and write nothing. `library/beanFilters.ts` turns a parameterised `bean:` filter id into a `FilterClause` through the existing `FilterResolver` seam. On top of those sit a presentational deck on the recipe editor's ABOUT tab and a picker sheet on the library rail.

**Tech Stack:** TypeScript, expo-sqlite (synchronous API), Tamagui, Jest + `@testing-library/react-native` v14, `node:sqlite` via `test-utils/sqlite.ts` for real-SQL tests.

**Spec:** `docs/superpowers/specs/2026-09-26-derived-profile-design.md`. Read it before starting. It records *why* each decision was taken, including one deliberately shipped wart.

---

## Rules that apply to every task

These are house rules this codebase enforces. Breaking one fails lint, CI, or review.

1. **Every test must be mutated to prove it can fail.** Before committing a task, change the production code the new test covers (flip a comparison, delete a clause, return an empty array) and confirm the test goes red. Then restore. A test that passes against broken code is not a test. Say in the commit body which mutations were run.
2. **No colour literals.** Every colour comes from `constants/colors.ts`. Add a semantically named entry if one is missing; never write a hex or a CSS colour name in `app/` or `components/`.
3. **No animation timing literals.** Durations, easings and springs come from `constants/motion.ts`.
4. **No em dashes in user-facing copy.** Avoid dashes in strings the user reads. Code comments and docs may use them.
5. **British English** in prose and comments.
6. **The React Compiler is on.** Do not write `useMemo`/`useCallback`. Do not read whole `props` inside a hook: destructure first. `react-hooks/set-state-in-effect` and `react-hooks/purity` are errors — state cannot be seeded or reset from an effect, and you may not read a database during render.
7. **Components are declared at module scope.** A component defined inside another component's body is a new type every render and gets remounted.
8. **RNTL v14's `render`, `fireEvent` and `renderHook` are async — `await` them.** Always render through `renderWithProviders` from `test-utils/render.tsx`. `UNSAFE_getAllByType` and `root.findAllByType` do not exist; assert on rendered text, test IDs and accessible labels.
9. **`DotMatrixText` children must be a single string or number,** not mixed JSX nodes.
10. **SQL tests use `createTestDatabase` from `test-utils/sqlite.ts`** (real `node:sqlite`). Never write a `jest.mock("expo-sqlite")` that pattern-matches query strings: it cannot fail on wrong SQL, which is the entire trap that helper exists to close.
11. **Import with the `@/` alias.**

### Commands

```bash
npx jest <path>                 # one file
npx jest <path> -t "name"       # one test
npm test                        # whole suite
npm run typecheck               # tsc --noEmit
npm run lint                    # eslint .
```

Lint baseline on this branch is **0 errors, 17 warnings**. Do not add errors. Do not "fix" the 17 warnings; they are deliberate.

---

## File structure

| File | Responsibility | Task |
|----|----|----|
| `library/beanProfile.ts` | Create. Types, thresholds, field labels, `rankProfileRows`. Pure: no SQL, no React, no `expo-sqlite` import, so it is testable on a laptop. | 1 |
| `library/__tests__/beanProfile.test.ts` | Create. Unit tests for the ranking rule. | 1 |
| `library/BrewDatabase.ts` | Modify. Add `beanProfileFor` and `beanVocabulary`. Read-only, no schema change. | 2, 3 |
| `library/__tests__/BrewDatabase.beanProfile.test.ts` | Create. Real SQLite, both methods. | 2, 3 |
| `library/beanFilters.ts` | Create. The `bean:` id namespace, its parser and its four clause shapes. Owns the column map, which is what keeps user text out of the SQL text. | 4 |
| `library/__tests__/beanFilters.test.ts` | Create. Clause shapes and, more importantly, refusals. | 4 |
| `library/libraryFilters.ts` | Modify. Route `bean:` ids through `resolveBeanFilter`, accept them in `asLibraryFilters`, name them in `filterLabel`. | 5 |
| `library/__tests__/beanFilters.integration.test.ts` | Create. Each clause run against a real database through `buildLibraryQuery`. | 6 |
| `components/BeanProfileRow.tsx` | Create. One ledger line, shared by the deck and the sheet so the two cannot drift. | 7 |
| `components/BeanProfileDeck.tsx` | Create. The capped ledger with its subtitle, its expander and its pinned untagged row. | 7 |
| `components/__tests__/BeanProfileDeck.test.tsx` | Create. Rendered text and accessible labels only: RNTL v14 cannot inspect a child's props. | 7 |
| `components/BeanProfileSheet.tsx` | Create. Every row, for SHOW ALL. | 8 |
| `components/__tests__/BeanProfileSheet.test.tsx` | Create. Needs the `pressOnSheet` retry helper. | 8 |
| `hooks/useBrewHistory.ts` | Modify. Add `useBeanProfile`, beside the existing `useRecipeRating`. | 9 |
| `hooks/__tests__/useBeanProfile.test.ts` | Create. Real SQLite through the hook, with an injectable store so reads are countable. | 9 |
| `components/AboutDeck.tsx` | Modify. Draw the deck under `HistorySection`. | 9 |
| `app/editRecipe.tsx` | Modify. Own the profile read, the sheet's open state and the refresh after a rating. | 9 |
| `components/BeanFilterSheet.tsx` | Create. The picker: vocabulary grouped by field, plus the highly-rated switch. | 10 |
| `components/__tests__/BeanFilterSheet.test.tsx` | Create. Grouping, the empty heading, and the rated rewrite. | 10 |
| `hooks/useBeanFilters.ts` | Create. The selection state machine: which bean filters are on, and rewriting them all when the switch flips. | 11 |
| `hooks/__tests__/useBeanFilters.test.ts` | Create. The derived selection and the whole-set rewrite. | 11 |
| `hooks/useLibraryQuery.ts` | Modify. Add `applyFilters`, one functional handle the bean hook can rewrite the whole set through. | 11 |
| `components/LibraryRail.tsx` | Modify. `RailFilter` gains an optional caret. | 11 |
| `app/index.tsx` | Modify. The BEANS chip, and the sheet it opens. | 11 |
| `app/__tests__/index.beanFilters.test.tsx` | Create. The chip opens the sheet, the sheet narrows the library, the chips remove. | 11 |
| `constants/recipeHelp.ts` | Modify. The help entry that states the floor of 3. | 12 |
| The existing `recipeHelp` suite | Modify. The new entry, its detail, and a scan for em dashes. | 12 |
| `docs/copy.md` | Modify. Catalogue every new string. | 12 |

---

## Three decisions this plan makes that the spec left open

Record these in the PR body. They are not free choices a later reader should assume were arbitrary.

**1. The filter id puts the rated flag before the field, not after the value.**
The spec's example was `bean:process:Natural:rated`. That shape cannot be parsed unambiguously, because the value is the unbounded tail and a custom tag may legally contain a colon: `bean:custom:x:rated` is both "the tag `x:rated`" and "the tag `x`, highly rated". The id is internal and never shown, so the flag moves to a fixed position and the value stays the tail:

```
bean:process:Natural            brewed with
bean:rated:process:Natural      brewed with, and highly rated
bean:custom:dad's bag           a custom tag
bean:rated:custom:dad's bag     a custom tag, highly rated
```

Split from the left with a known arity; everything after the third colon is the value, whatever is in it.

**2. The profile groups on the recorded `origin` column only, never the pod's.**
`resolvedOrigin` in `library/brew/beanTags.ts` falls back to the origin inside the stored `coffee` JSON blob, so a pod brew has an origin the user never typed. The ledger does not follow that fallback, for one reason: the *filter* cannot. A filter clause compares the `origin` column, and reaching into a JSON blob from a correlated subquery would be a different and much weaker match. A ledger row the filter cannot reproduce is a row that leads to an empty library. Both halves therefore see the same column. Note it in the PR; it is a candidate follow-up, not an oversight.

**3. `rankProfileRows` breaks a final tie on `field`.**
The spec named three keys (rating, then brews, then value). Two rows can still tie on all three: a roast called `Light` and a custom tag called `Light` are different rows with the same display value. Without a fourth key the order is `Array.prototype.sort`'s and the list can reshuffle between renders, which is exactly what the tie-breakers exist to stop.

---

## Task 1: The pure rules

**Files:**
- Create: `library/beanProfile.ts`
- Test: `library/__tests__/beanProfile.test.ts`

The types live here rather than in `BrewDatabase` so that this module, the ranking tests, and the components can all be used without importing `expo-sqlite`, which is a native module with no implementation under Jest. `BrewDatabase` imports them from here.

- [ ] **Step 1: Write the failing test**

Create `library/__tests__/beanProfile.test.ts`:

```ts
import {
    PROFILE_CAP,
    PROFILE_FLOOR,
    HIGHLY_RATED,
    PROFILE_FIELD_LABEL,
    rankProfileRows,
    type BeanProfileRow,
    type ProfileField
} from "@/library/beanProfile";

function row(
    value: string,
    brews: number,
    rated: number,
    avgRating: number,
    field: ProfileField = "process"
): BeanProfileRow {
    return {field, value, brews, rated, avgRating};
}

describe("the thresholds", () => {
    it("holds the floor at 3 rated brews", () => {
        expect(PROFILE_FLOOR).toBe(3);
    });

    it("starts highly rated at 4 stars", () => {
        expect(HIGHLY_RATED).toBe(4);
    });

    it("caps the ledger at 5 rows", () => {
        expect(PROFILE_CAP).toBe(5);
    });

    it("labels every field, including custom", () => {
        const fields: ProfileField[] =
            ["origin", "roast", "process", "fermentation", "custom"];
        for (const field of fields) {
            expect(PROFILE_FIELD_LABEL[field]).toMatch(/^[A-Z]+$/);
        }
    });
});

describe("ranking", () => {
    it("puts a row at the floor above a better-rated row below it", () => {
        // The whole point of the floor. 4.9 off two ratings does not outrank
        // 4.1 off three, because two numbers are not evidence.
        const ranked = rankProfileRows([
            row("Honey", 2, 2, 4.9),
            row("Natural", 9, 3, 4.1)
        ]);
        expect(ranked.map((r) => r.value)).toEqual(["Natural", "Honey"]);
    });

    it("counts rated brews against the floor, not counted ones", () => {
        // Eleven brews and one rating is an average of one number. It must not
        // rank, however many cups back it.
        const ranked = rankProfileRows([
            row("Light", 11, 1, 5),
            row("Washed", 3, 3, 3.2)
        ]);
        expect(ranked.map((r) => r.value)).toEqual(["Washed", "Light"]);
    });

    it("orders ranked rows by rating descending", () => {
        const ranked = rankProfileRows([
            row("Washed", 5, 5, 4.0),
            row("Co-ferment", 3, 3, 4.8),
            row("Natural", 9, 9, 4.6)
        ]);
        expect(ranked.map((r) => r.value))
            .toEqual(["Co-ferment", "Natural", "Washed"]);
    });

    it("breaks a rating tie on brews, then value, then field", () => {
        const ranked = rankProfileRows([
            row("Light", 3, 3, 4.5, "custom"),
            row("Light", 3, 3, 4.5, "roast"),
            row("Anaerobic", 3, 3, 4.5),
            row("Natural", 7, 3, 4.5)
        ]);
        // Natural leads on brews. The other three tie on 3 brews, so value
        // decides: Anaerobic, then the two Lights, whose field decides them.
        expect(ranked.map((r) => `${r.field}:${r.value}`)).toEqual([
            "process:Natural",
            "process:Anaerobic",
            "custom:Light",
            "roast:Light"
        ]);
    });

    it("orders below-floor rows by brews then value, keeping their figures", () => {
        const ranked = rankProfileRows([
            row("Honey", 1, 1, 5),
            row("Gesha", 4, 0, 0, "origin"),
            row("Bourbon", 4, 2, 4.9, "origin")
        ]);
        expect(ranked.map((r) => r.value)).toEqual(["Bourbon", "Gesha", "Honey"]);
        expect(ranked[0].avgRating).toBe(4.9);
    });

    it("does not mutate the array it is given", () => {
        // The caller holds the database's own rows. Sorting them in place
        // would reorder somebody else's array as a side effect of rendering.
        const rows = [row("Honey", 1, 1, 5), row("Natural", 9, 3, 4.1)];
        const before = rows.map((r) => r.value);
        rankProfileRows(rows);
        expect(rows.map((r) => r.value)).toEqual(before);
    });

    it("returns an empty list unchanged", () => {
        expect(rankProfileRows([])).toEqual([]);
    });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx jest library/__tests__/beanProfile.test.ts`
Expected: FAIL, `Cannot find module '@/library/beanProfile'`.

- [ ] **Step 3: Write the implementation**

Create `library/beanProfile.ts`:

```ts
import type {BeanField} from "@/library/brew/beanTags";

/**
 * What a recipe has been brewed with, derived from brew rows alone.
 *
 * Pure: no SQL, no React, no `expo-sqlite`. `BrewDatabase` fills these types in
 * and the components draw them, which is the split `recipeEvidence.ts` already
 * uses. It means the ordering rule below can be tested without a database and
 * the types can be imported anywhere without dragging a native module in.
 */

/**
 * `BeanField` is the four preset columns on `brews`. The profile has a fifth
 * case, the free-form custom tags, so it extends rather than redeclares: a
 * second type of the same name with a different arm is how the two come to
 * disagree about what a field is.
 */
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

export type BeanProfileTotals = {
    brews: number;
    rated: number;
    avgRating: number;
};

export type BeanProfile = {
    rows: BeanProfileRow[];
    /** Counted brews carrying no preset field and no custom tag. */
    untagged: BeanProfileTotals;
    /**
     * Every counted brew for the recipe.
     *
     * `rows` overlap -- one brew contributes to its roast row, its process row
     * and its origin row -- so they do not sum to this and no surface may imply
     * that they do.
     */
    counted: number;
};

/**
 * Rated brews a row needs before its average may rank it.
 *
 * Counted brews would be the intuitive choice and is wrong: a row with eleven
 * brews and one rating would then rank on an average of one number, which is
 * the whole error this floor exists to prevent.
 *
 * This leaves a known wart. The row displays its *counted* brews, so `4.5 · 11`
 * can fail a floor of 3 with nothing on screen saying why. That was weighed
 * against printing a third figure (`4.5 · 11 · 2 rated`) and shipped
 * deliberately. See the design note before changing it; quietly moving the
 * floor onto counted brews undoes the decision rather than revisiting it.
 */
export const PROFILE_FLOOR = 3;

/** Where "this worked" starts, for the library filter. */
export const HIGHLY_RATED = 4;

/** Rows shown before the ledger asks to be opened in full. */
export const PROFILE_CAP = 5;

/**
 * What each field is called in the ledger's Doto column.
 *
 * FERMENT rather than FERMENTATION: the column is a fixed width beside a value
 * that is often long, and the full word crowds it out. TAG for the custom
 * field, because "custom" is the app's word for its own storage and the user
 * called it a tag when they typed it.
 */
export const PROFILE_FIELD_LABEL: Record<ProfileField, string> = {
    origin: "ORIGIN",
    roast: "ROAST",
    process: "PROCESS",
    fermentation: "FERMENT",
    custom: "TAG"
};

/**
 * Plain codepoint order, not `localeCompare`.
 *
 * The tie-break only has to be *total and stable*, so that a list of rows has
 * exactly one order however many times it is drawn. A locale comparison brings
 * in Hermes' Intl support and a collation that can differ between platforms,
 * which would make the same library sort two ways on two phones for no reason
 * the user can see.
 */
function compare(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The ledger's order: evidenced rows first, by how well they did.
 *
 * Rows at or above the floor lead, ordered by average descending. Rows below it
 * follow, keeping their figures and their place in the list; they are not
 * hidden and not blanked, they simply cannot outrank a row that has evidence.
 *
 * Three tie-breakers after the average, and every one of them earns its line.
 * Without them SQLite's row order leaks into the UI and the list reshuffles
 * between renders. `field` is last because two rows can genuinely tie on rating,
 * brews and value: a roast called Light and a custom tag called Light are
 * different rows that print the same word.
 *
 * Returns a new array. The caller holds the database's rows, and sorting them
 * in place would reorder somebody else's array as a side effect of rendering.
 */
export function rankProfileRows(rows: readonly BeanProfileRow[]): BeanProfileRow[] {
    const byWeight = (a: BeanProfileRow, b: BeanProfileRow) =>
        b.brews - a.brews || compare(a.value, b.value) || compare(a.field, b.field);

    const ranked = rows.filter((row) => row.rated >= PROFILE_FLOOR)
        .sort((a, b) => b.avgRating - a.avgRating || byWeight(a, b));
    const rest = rows.filter((row) => row.rated < PROFILE_FLOOR).sort(byWeight);

    return [...ranked, ...rest];
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest library/__tests__/beanProfile.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Mutate to prove the tests can fail**

Run each of these, confirm the named test goes red, then restore:

1. Change `PROFILE_FLOOR` to `1`. Expect "puts a row at the floor above a better-rated row below it" and "counts rated brews against the floor" to fail.
2. In `rankProfileRows`, change `row.rated >= PROFILE_FLOOR` to `row.brews >= PROFILE_FLOOR`. Expect "counts rated brews against the floor, not counted ones" to fail.
3. Delete `|| compare(a.field, b.field)` from `byWeight`. Expect "breaks a rating tie on brews, then value, then field" to fail.
4. Change `rows.filter(...)` to `[...rows].sort(...)` returning the same array reference for the ranked half — or more simply, make `rankProfileRows` sort `rows` in place via a cast. Expect "does not mutate the array it is given" to fail.

- [ ] **Step 6: Typecheck, lint and commit**

```bash
npm run typecheck && npm run lint
git add library/beanProfile.ts library/__tests__/beanProfile.test.ts
git commit -m "Add the bean profile's pure rules

The floor, the thresholds and the ranking, with no SQL and no React, so the
ordering can be tested without a database.

Mutations run: floor lowered to 1, floor moved onto counted brews, the field
tie-break deleted, and the sort made in-place. Each killed its test.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: `BrewDatabase.beanProfileFor`

**Files:**
- Modify: `library/BrewDatabase.ts` (add imports near the top; add the method after `summaryFor`, which ends around line 480)
- Test: `library/__tests__/BrewDatabase.beanProfile.test.ts`

Read-only. No schema change, no migration, nothing written. Every population is scoped by `COUNTED_SQL` and `RATED_SQL` spliced from `brewPopulation.ts` rather than restated, so a cancelled brew cannot inflate a row exactly as it cannot inflate the recipe card's evidence line.

- [ ] **Step 1: Write the failing test**

Create `library/__tests__/BrewDatabase.beanProfile.test.ts`:

```ts
import {createTestDatabase, type FakeSQLiteDatabase} from "@/test-utils/sqlite";

let mockBacking: FakeSQLiteDatabase;

jest.mock("expo-sqlite", () => ({
    openDatabaseSync: () => mockBacking
}));

/* eslint-disable import/first */
import BrewDatabase from "@/library/BrewDatabase";
import {tagKey} from "@/library/tagKey";
/* eslint-enable import/first */

beforeEach(() => {
    mockBacking = createTestDatabase();
});

const RECIPE = "recipe-under-test";

type Seed = {
    id: string;
    recipeUuid?: string;
    outcome?: string;
    rating?: number;
    origin?: string;
    roast?: string;
    process?: string;
    fermentation?: string;
    tags?: string[];
};

/**
 * Rows inserted through raw SQL rather than through `insert`, the way
 * `brewPopulation.test.ts` seeds. The subject here is a read query, and a test
 * that has to build a whole valid `BrewRecord` to say "a cancelled brew with a
 * rating" buries the one fact it is about.
 */
function seed(rows: Seed[]): BrewDatabase {
    const database = new BrewDatabase();
    rows.forEach((row, index) => {
        mockBacking.runSync(
            `INSERT INTO brews (
                id, recipeUuid, recipeName, accent, startedAt, pouringAt, endedAt,
                outcome, failure, pours, waterTotal, cupTotal, heldSeconds,
                rating, watched, origin, roast, process, fermentation, hasStream
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [
                row.id, row.recipeUuid ?? RECIPE, "Fixture", "#000000",
                1_000 + index, 0, 2_000 + index, row.outcome ?? "done", null,
                1, 1, 1, 0, row.rating ?? 0, 1,
                row.origin ?? "", row.roast ?? "", row.process ?? "",
                row.fermentation ?? "", 0
            ]
        );
        for (const tag of row.tags ?? []) {
            mockBacking.runSync(
                "INSERT INTO brew_tags (brewId, tag, tagKey) VALUES (?, ?, ?);",
                [row.id, tag, tagKey(tag)]
            );
        }
    });
    return database;
}

function find(database: BrewDatabase, field: string, value: string) {
    return database.beanProfileFor(RECIPE).rows
        .find((row) => row.field === field && row.value === value);
}

describe("beanProfileFor", () => {
    it("returns an empty profile for a recipe with no brews", () => {
        const database = seed([]);
        expect(database.beanProfileFor(RECIPE)).toEqual({
            rows: [],
            untagged: {brews: 0, rated: 0, avgRating: 0},
            counted: 0
        });
    });

    it("earns a row for each of the four preset fields", () => {
        const database = seed([{
            id: "a", origin: "Ethiopia Guji", roast: "Light",
            process: "Natural", fermentation: "Co-ferment"
        }]);
        expect(database.beanProfileFor(RECIPE).rows.map((r) => r.field).sort())
            .toEqual(["fermentation", "origin", "process", "roast"]);
    });

    it("earns a row for a custom tag", () => {
        const database = seed([{id: "a", tags: ["dad's bag"]}]);
        expect(find(database, "custom", "dad's bag"))
            .toEqual({field: "custom", value: "dad's bag", brews: 1, rated: 0,
                      avgRating: 0});
    });

    it("counts one brew into every field it carries", () => {
        // The rows overlap by construction. This is the fact the UI must never
        // present as a breakdown that sums to the total.
        const database = seed([
            {id: "a", roast: "Light", process: "Natural"},
            {id: "b", roast: "Light", process: "Washed"}
        ]);
        expect(find(database, "roast", "Light")?.brews).toBe(2);
        expect(find(database, "process", "Natural")?.brews).toBe(1);
        expect(database.beanProfileFor(RECIPE).counted).toBe(2);
    });

    it("leaves a cancelled brew out of every figure", () => {
        const database = seed([
            {id: "kept", process: "Natural", rating: 4},
            {id: "gone", process: "Natural", rating: 1, outcome: "cancelled"}
        ]);
        expect(find(database, "process", "Natural"))
            .toEqual({field: "process", value: "Natural", brews: 1, rated: 1,
                      avgRating: 4});
        expect(database.beanProfileFor(RECIPE).counted).toBe(1);
    });

    it("counts endedOnMachine as a cup", () => {
        const database = seed([{id: "a", process: "Natural",
                                outcome: "endedOnMachine"}]);
        expect(find(database, "process", "Natural")?.brews).toBe(1);
    });

    it("averages only the rated brews and reports how many there were", () => {
        const database = seed([
            {id: "a", process: "Natural", rating: 5},
            {id: "b", process: "Natural", rating: 3},
            {id: "c", process: "Natural", rating: 0}
        ]);
        expect(find(database, "process", "Natural"))
            .toEqual({field: "process", value: "Natural", brews: 3, rated: 2,
                      avgRating: 4});
    });

    it("reports 0 rather than null when nothing in a row was rated", () => {
        // SQL's AVG over an empty population is NULL. The app's sentinel for
        // "nothing to average" is 0 everywhere else, and a null would reach the
        // ledger and print as blank in the middle of a figure line.
        const database = seed([{id: "a", process: "Natural"}]);
        expect(find(database, "process", "Natural")?.avgRating).toBe(0);
    });

    it("folds two spellings of a custom tag into one row", () => {
        const database = seed([
            {id: "a", tags: ["Mornings"]},
            {id: "b", tags: ["mornings"]}
        ]);
        const custom = database.beanProfileFor(RECIPE).rows
            .filter((row) => row.field === "custom");
        expect(custom).toHaveLength(1);
        expect(custom[0].brews).toBe(2);
    });

    it("does not earn a row for an unset field", () => {
        const database = seed([{id: "a", process: "Natural"}]);
        expect(database.beanProfileFor(RECIPE).rows.map((r) => r.field))
            .toEqual(["process"]);
    });

    it("counts a brew with nothing recorded as untagged", () => {
        const database = seed([
            {id: "bare", rating: 3},
            {id: "tagged", process: "Natural", rating: 5}
        ]);
        const profile = database.beanProfileFor(RECIPE);
        expect(profile.untagged).toEqual({brews: 1, rated: 1, avgRating: 3});
        expect(profile.counted).toBe(2);
    });

    it("does not count a brew carrying only a custom tag as untagged", () => {
        const database = seed([{id: "a", tags: ["dad's bag"]}]);
        expect(database.beanProfileFor(RECIPE).untagged.brews).toBe(0);
    });

    it("does not count a brew carrying only an origin as untagged", () => {
        const database = seed([{id: "a", origin: "Ethiopia Guji"}]);
        expect(database.beanProfileFor(RECIPE).untagged.brews).toBe(0);
    });

    it("draws untagged from the same population as counted", () => {
        // The ledger's denominator and the recipe card's brew count are the
        // same number or the deck flatly contradicts the card above it.
        const database = seed([
            {id: "a"},
            {id: "b", outcome: "cancelled"}
        ]);
        const profile = database.beanProfileFor(RECIPE);
        expect(profile.untagged.brews).toBe(profile.counted);
        expect(profile.counted).toBe(1);
    });

    it("ignores another recipe's brews entirely", () => {
        const database = seed([
            {id: "mine", process: "Natural"},
            {id: "theirs", recipeUuid: "someone-else", process: "Natural"}
        ]);
        expect(find(database, "process", "Natural")?.brews).toBe(1);
        expect(database.beanProfileFor(RECIPE).counted).toBe(1);
    });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx jest library/__tests__/BrewDatabase.beanProfile.test.ts`
Expected: FAIL, `database.beanProfileFor is not a function`.

- [ ] **Step 3: Write the implementation**

In `library/BrewDatabase.ts`, add to the imports (the `beanTags` import block already exists; add `BEAN_FIELDS` to it, and add the profile types as a new import):

```ts
import {
    BEAN_FIELDS,
    isFermentation,
    isProcess,
    isRoast,
    MAX_ORIGIN_LENGTH,
    normaliseBeanTags
} from "./brew/beanTags";
import type {
    BeanProfile,
    BeanProfileRow,
    ProfileField
} from "./beanProfile";
```

Add near the other module-scope constants in the file, above the class:

```ts
/**
 * The column each preset field lives in.
 *
 * A literal map this module owns, not a name taken from anything a caller
 * passed. The four happen to match their field names today, and writing them
 * out is what keeps that a coincidence rather than a rule a later reader could
 * extend to a fifth field whose name came from somewhere else.
 */
const PROFILE_COLUMN: Record<typeof BEAN_FIELDS[number], string> = {
    origin: "origin",
    roast: "roast",
    process: "process",
    fermentation: "fermentation"
};

/**
 * A counted brew carrying nothing about its coffee.
 *
 * All four columns empty *and* no custom tag. The `NOT EXISTS` is the half that
 * is easy to forget, and forgetting it would file every custom-tagged brew
 * under NOT TAGGED, which is the one row the design leans on being right.
 */
const UNTAGGED_SQL = `(b.origin = '' AND b.roast = '' AND b.process = ''
    AND b.fermentation = ''
    AND NOT EXISTS (SELECT 1 FROM brew_tags t WHERE t.brewId = b.id))`;
```

Add the method to the class, after `summaryFor`:

```ts
    /**
     * What this recipe has been brewed with, and how those brews went.
     *
     * The one place that knows how a profile is derived, for the reason #98
     * gives about answering "what has this recipe done?" once rather than four
     * times in four screens. Derived at query time and written nowhere: re-rating
     * a brew changes the answer with no migration and no repair step.
     *
     * Five sources in one union -- the four preset columns and `brew_tags` --
     * every one of them scoped by `COUNTED_SQL` and rated by `RATED_SQL` spliced
     * from `brewPopulation.ts` rather than restated here. A cancelled brew
     * cannot inflate a row exactly as it cannot inflate the card's evidence
     * line, and it cannot come to differ from it either.
     *
     * The custom rows group on `tagKey`, the folded form, so two spellings of
     * one tag are one row; `MIN(t.tag)` picks the displayed spelling
     * deterministically rather than letting SQLite hand back whichever row it
     * reached first.
     *
     * Origin is the recorded column only and deliberately does not follow
     * `resolvedOrigin`'s fallback into the stored pod blob. The library filter
     * compares the column, so a row derived from the blob would be a row the
     * filter cannot reproduce, and tapping it would open an empty library.
     */
    public beanProfileFor(recipeUuid: string): BeanProfile {
        const presets = BEAN_FIELDS.map((field) => `
            SELECT '${field}' AS field, ${PROFILE_COLUMN[field]} AS value,
                   COUNT(*) AS brews,
                   COUNT(CASE WHEN ${RATED_SQL} THEN 1 END) AS rated,
                   AVG(CASE WHEN ${RATED_SQL} THEN rating END) AS avgRating
            FROM brews
            WHERE recipeUuid = ? AND ${COUNTED_SQL}
              AND ${PROFILE_COLUMN[field]} <> ''
            GROUP BY ${PROFILE_COLUMN[field]}`);

        const custom = `
            SELECT 'custom' AS field, MIN(t.tag) AS value,
                   COUNT(*) AS brews,
                   COUNT(CASE WHEN ${RATED_SQL} THEN 1 END) AS rated,
                   AVG(CASE WHEN ${RATED_SQL} THEN rating END) AS avgRating
            FROM brews b JOIN brew_tags t ON t.brewId = b.id
            WHERE b.recipeUuid = ? AND ${COUNTED_SQL}
            GROUP BY t.tagKey`;

        const rows = this.db.getAllSync<{
            field: string; value: string; brews: number;
            rated: number; avgRating: number | null;
        }>(
            `${[...presets, custom].join("\nUNION ALL\n")};`,
            [...BEAN_FIELDS.map(() => recipeUuid), recipeUuid]
        ).map((row): BeanProfileRow => ({
            field: row.field as ProfileField,
            value: row.value,
            brews: row.brews,
            rated: row.rated,
            // SQL's AVG over an empty population is NULL. 0 is the app's
            // sentinel for "nothing to average" throughout, and the ledger
            // prints the figure only when it is above 0.
            avgRating: row.avgRating ?? 0
        }));

        const totals = this.db.getFirstSync<{
            counted: number; untaggedBrews: number;
            untaggedRated: number; untaggedAvg: number | null;
        }>(
            `SELECT COUNT(*) AS counted,
                    COUNT(CASE WHEN ${UNTAGGED_SQL} THEN 1 END) AS untaggedBrews,
                    COUNT(CASE WHEN ${UNTAGGED_SQL} AND ${RATED_SQL} THEN 1 END)
                        AS untaggedRated,
                    AVG(CASE WHEN ${UNTAGGED_SQL} AND ${RATED_SQL} THEN rating END)
                        AS untaggedAvg
             FROM brews b
             WHERE b.recipeUuid = ? AND ${COUNTED_SQL};`,
            [recipeUuid]
        );

        return {
            rows,
            untagged: {
                brews: totals?.untaggedBrews ?? 0,
                rated: totals?.untaggedRated ?? 0,
                avgRating: totals?.untaggedAvg ?? 0
            },
            counted: totals?.counted ?? 0
        };
    }
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest library/__tests__/BrewDatabase.beanProfile.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Mutate to prove the tests can fail**

Run each, confirm the named test goes red, then restore:

1. Drop `AND ${COUNTED_SQL}` from the preset union's WHERE. Expect "leaves a cancelled brew out of every figure" to fail.
2. Change the custom select's `GROUP BY t.tagKey` to `GROUP BY t.tag`. Expect "folds two spellings of a custom tag into one row" to fail.
3. Delete the `NOT EXISTS` half of `UNTAGGED_SQL`. Expect "does not count a brew carrying only a custom tag as untagged" to fail.
4. Change `avgRating: row.avgRating ?? 0` to `avgRating: row.avgRating as number`. Expect "reports 0 rather than null when nothing in a row was rated" to fail.
5. Drop `AND recipeUuid = ?` from one preset select (and its bound parameter). Expect "ignores another recipe's brews entirely" to fail.

- [ ] **Step 6: Typecheck, lint and commit**

```bash
npm run typecheck && npm run lint
git add library/BrewDatabase.ts library/__tests__/BrewDatabase.beanProfile.test.ts
git commit -m "Derive a recipe's bean profile from its brews

Five sources in one union, every population spliced from brewPopulation so a
cancelled brew cannot inflate a row. Untagged is drawn from the same population
as the total, so the ledger's denominator and the card's count are provably the
same number.

Mutations run: counted scope dropped, custom grouped on the raw tag, the
NOT EXISTS half of untagged deleted, the null average passed through, and the
recipe scope dropped. Each killed its test.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: `BrewDatabase.beanVocabulary`

**Files:**
- Modify: `library/BrewDatabase.ts` (add the method directly after `beanProfileFor`)
- Test: `library/__tests__/BrewDatabase.beanProfile.test.ts` (append a `describe`)

The picker offers only values the user's own history contains, so there is no text field and no way to filter on a value no brew carries. The values must therefore be the *exact* ones the filter will bind: exact column text for presets and origin, folded `tagKey` for custom.

- [ ] **Step 1: Write the failing test**

Append to `library/__tests__/BrewDatabase.beanProfile.test.ts`:

```ts
describe("beanVocabulary", () => {
    it("is empty when there are no brews", () => {
        expect(seed([]).beanVocabulary()).toEqual([]);
    });

    it("offers a value from any recipe, not just one", () => {
        const database = seed([
            {id: "a", process: "Natural"},
            {id: "b", recipeUuid: "another", process: "Washed"}
        ]);
        expect(database.beanVocabulary().map((e) => e.value).sort())
            .toEqual(["Natural", "Washed"]);
    });

    it("counts recipes, not brews", () => {
        // The vocabulary answers "how much of the library would this show",
        // and a recipe brewed nine times is one recipe.
        const database = seed([
            {id: "a", process: "Natural"},
            {id: "b", process: "Natural"},
            {id: "c", recipeUuid: "another", process: "Natural"}
        ]);
        expect(database.beanVocabulary()[0].recipes).toBe(2);
    });

    it("leaves out a value only a cancelled brew carries", () => {
        // The filter clause is scoped to counted brews, so a value offered
        // here that only a cancelled brew carries would build a filter that
        // can never match anything.
        const database = seed([
            {id: "a", process: "Natural"},
            {id: "b", process: "Honey", outcome: "cancelled"}
        ]);
        expect(database.beanVocabulary().map((e) => e.value)).toEqual(["Natural"]);
    });

    it("offers custom tags in their folded form", () => {
        // The filter binds tagKey, so the vocabulary has to hand back the
        // value that binding will match.
        const database = seed([
            {id: "a", tags: ["Mornings"]},
            {id: "b", tags: ["mornings"]}
        ]);
        const custom = database.beanVocabulary().filter((e) => e.field === "custom");
        expect(custom).toEqual([{field: "custom", value: "mornings", recipes: 1}]);
    });

    it("groups the fields in BEAN_FIELDS order with custom last", () => {
        const database = seed([{
            id: "a", origin: "Guji", roast: "Light", process: "Natural",
            fermentation: "Lactic", tags: ["dad's bag"]
        }]);
        expect(database.beanVocabulary().map((e) => e.field))
            .toEqual(["origin", "roast", "process", "fermentation", "custom"]);
    });

    it("orders a field's values by recipe count, then by value", () => {
        const database = seed([
            {id: "a", process: "Washed"},
            {id: "b", recipeUuid: "r2", process: "Washed"},
            {id: "c", recipeUuid: "r3", process: "Natural"},
            {id: "d", recipeUuid: "r4", process: "Honey"}
        ]);
        expect(database.beanVocabulary().map((e) => e.value))
            .toEqual(["Washed", "Honey", "Natural"]);
    });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx jest library/__tests__/BrewDatabase.beanProfile.test.ts -t "beanVocabulary"`
Expected: FAIL, `database.beanVocabulary is not a function`.

- [ ] **Step 3: Write the implementation**

Add to `library/BrewDatabase.ts`, after `beanProfileFor`. Add `BeanVocabularyEntry` to the exported types near `BrewSummary`:

```ts
/** One value the library's brews carry, and how many recipes carry it. */
export type BeanVocabularyEntry = {
    field: ProfileField;
    /** Exactly the value the filter will bind: raw for presets, folded for custom. */
    value: string;
    recipes: number;
};
```

```ts
    /**
     * Every value any counted brew carries, with how many recipes carry it.
     *
     * What the picker offers. There is no text field in that sheet, and this is
     * why there does not need to be: origin and custom tags are free text, so
     * typing them again would reintroduce the splitting the ledger already
     * tolerates and would let a user filter on a value no brew carries and get
     * an empty library with nothing explaining it.
     *
     * The values handed back are exactly the ones `beanFilters` will bind: the
     * raw column text for the presets and origin, and the folded `tagKey` for a
     * custom tag. Handing back a display spelling for a custom tag would offer
     * the user a chip that matches nothing.
     *
     * Scoped to counted brews for the same reason: the filter clauses are, so a
     * value only a cancelled brew carries would build a filter that can never
     * match.
     *
     * Recipes rather than brews, because the number answers "how much of the
     * library would this show me" and a recipe brewed nine times is one recipe.
     *
     * Ordering is done here in TypeScript rather than in SQL: the field order is
     * `BEAN_FIELDS`, which is a TypeScript constant, and a CASE expression
     * restating it in the statement would be a second copy of that order.
     */
    public beanVocabulary(): BeanVocabularyEntry[] {
        const presets = BEAN_FIELDS.map((field) => `
            SELECT '${field}' AS field, ${PROFILE_COLUMN[field]} AS value,
                   recipeUuid
            FROM brews
            WHERE ${COUNTED_SQL} AND ${PROFILE_COLUMN[field]} <> ''`);

        const custom = `
            SELECT 'custom' AS field, t.tagKey AS value, b.recipeUuid AS recipeUuid
            FROM brews b JOIN brew_tags t ON t.brewId = b.id
            WHERE ${COUNTED_SQL}`;

        const rows = this.db.getAllSync<{
            field: string; value: string; recipes: number;
        }>(
            `SELECT field, value, COUNT(DISTINCT recipeUuid) AS recipes
             FROM (${[...presets, custom].join("\nUNION ALL\n")})
             GROUP BY field, value;`
        );

        const order: ProfileField[] = [...BEAN_FIELDS, "custom"];
        return rows
            .map((row): BeanVocabularyEntry => ({
                field: row.field as ProfileField,
                value: row.value,
                recipes: row.recipes
            }))
            .sort((a, b) =>
                order.indexOf(a.field) - order.indexOf(b.field)
                || b.recipes - a.recipes
                || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
    }
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest library/__tests__/BrewDatabase.beanProfile.test.ts`
Expected: PASS, 22 tests.

- [ ] **Step 5: Mutate to prove the tests can fail**

1. Change `COUNT(DISTINCT recipeUuid)` to `COUNT(*)`. Expect "counts recipes, not brews" to fail.
2. Drop `${COUNTED_SQL} AND` from the preset selects. Expect "leaves out a value only a cancelled brew carries" to fail.
3. Change the custom select's `t.tagKey AS value` to `t.tag AS value`. Expect "offers custom tags in their folded form" to fail.
4. Delete the `order.indexOf` term from the sort comparator. Expect "groups the fields in BEAN_FIELDS order with custom last" to fail.
5. Delete the `b.recipes - a.recipes` term. Expect "orders a field's values by recipe count, then by value" to fail.

- [ ] **Step 6: Typecheck, lint and commit**

```bash
npm run typecheck && npm run lint
git add library/BrewDatabase.ts library/__tests__/BrewDatabase.beanProfile.test.ts
git commit -m "Read the bean vocabulary the picker offers

Only values a counted brew carries, in exactly the form the filter will bind,
so the sheet cannot offer a chip that matches nothing.

Mutations run: recipes counted as brews, the counted scope dropped, the custom
value taken raw rather than folded, and both sort terms deleted in turn. Each
killed its test.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: The `bean:` filter vocabulary

**Files:**
- Create: `library/beanFilters.ts`
- Test: `library/__tests__/beanFilters.test.ts`

`FilterId` is a closed union and `STOCK_FILTERS` a `Record` over it. Brew-derived filters cannot join that union, because origin and custom tags are free text and the set is unbounded. They go in a second namespace resolved through the same `FilterResolver` seam, which `libraryQuery.ts` documents as the security boundary: a resolver may only ever return fragments it owns.

The refusal tests matter more than the clause tests. This module is the only thing standing between a value a person typed and a SQL statement.

- [ ] **Step 1: Write the failing test**

Create `library/__tests__/beanFilters.test.ts`:

```ts
import {
    beanFilterId,
    beanFilterLabel,
    parseBeanFilterId,
    resolveBeanFilter
} from "@/library/beanFilters";
import {HIGHLY_RATED, PROFILE_FLOOR} from "@/library/beanProfile";

describe("ids round-trip", () => {
    it("builds and reads back a preset", () => {
        const id = beanFilterId({field: "process", value: "Natural", rated: false});
        expect(id).toBe("bean:process:Natural");
        expect(parseBeanFilterId(id))
            .toEqual({field: "process", value: "Natural", rated: false});
    });

    it("builds and reads back a highly-rated preset", () => {
        const id = beanFilterId({field: "process", value: "Natural", rated: true});
        expect(id).toBe("bean:rated:process:Natural");
        expect(parseBeanFilterId(id))
            .toEqual({field: "process", value: "Natural", rated: true});
    });

    it("keeps a value containing a colon whole", () => {
        // The reason the rated flag leads rather than trails. With the flag at
        // the end, this id and the tag "9" highly rated are the same string.
        const id = beanFilterId({field: "custom", value: "9:rated", rated: false});
        expect(parseBeanFilterId(id))
            .toEqual({field: "custom", value: "9:rated", rated: false});
    });

    it("keeps a value containing spaces and an apostrophe whole", () => {
        const id = beanFilterId({field: "custom", value: "dad's bag", rated: true});
        expect(parseBeanFilterId(id))
            .toEqual({field: "custom", value: "dad's bag", rated: true});
    });

    it("reads nothing out of another namespace", () => {
        expect(parseBeanFilterId("tag:mornings")).toBeNull();
        expect(parseBeanFilterId("sharedBy:Ann")).toBeNull();
        expect(parseBeanFilterId("tea")).toBeNull();
    });

    it("refuses an unknown field", () => {
        expect(parseBeanFilterId("bean:varietal:Gesha")).toBeNull();
        expect(resolveBeanFilter("bean:varietal:Gesha")).toBeNull();
    });

    it("refuses an empty value", () => {
        expect(parseBeanFilterId("bean:process:")).toBeNull();
        expect(parseBeanFilterId("bean:process")).toBeNull();
    });
});

describe("refusals", () => {
    it("refuses a preset value outside the closed vocabulary", () => {
        // `beanTags` refuses a near miss rather than repairing it, and so does
        // this: repairing one would mean deciding that "washed" is Washed.
        expect(resolveBeanFilter("bean:process:washed")).toBeNull();
        expect(resolveBeanFilter("bean:process:Wet process")).toBeNull();
        expect(resolveBeanFilter("bean:roast:Blonde")).toBeNull();
        expect(resolveBeanFilter("bean:fermentation:Wild")).toBeNull();
    });

    it("accepts every value the closed vocabulary does hold", () => {
        expect(resolveBeanFilter("bean:process:Honey")).not.toBeNull();
        expect(resolveBeanFilter("bean:roast:Dark")).not.toBeNull();
        expect(resolveBeanFilter("bean:fermentation:Carbonic maceration"))
            .not.toBeNull();
    });

    it("binds a hostile origin rather than splicing it", () => {
        const clause = resolveBeanFilter("bean:origin:'; DROP TABLE brews; --");
        expect(clause).not.toBeNull();
        expect(clause?.where).not.toContain("DROP");
        expect(clause?.params).toEqual(["'; DROP TABLE brews; --"]);
    });

    it("binds a hostile custom tag, folded, rather than splicing it", () => {
        const clause = resolveBeanFilter("bean:custom:' OR 1=1 --");
        expect(clause?.where).not.toContain("OR 1=1");
        expect(clause?.params).toEqual(["' or 1=1 --"]);
    });

    it("refuses a custom tag that folds to nothing", () => {
        expect(resolveBeanFilter("bean:custom:   ")).toBeNull();
    });
});

describe("clauses", () => {
    it("asks for a counted brew carrying the preset", () => {
        const clause = resolveBeanFilter("bean:process:Natural");
        expect(clause?.where).toContain("EXISTS");
        expect(clause?.where).toContain("b.recipeUuid = recipes.uuid");
        expect(clause?.where).toContain("b.process = ?");
        expect(clause?.where).toContain("outcome IN ('done', 'endedOnMachine')");
        expect(clause?.params).toEqual(["Natural"]);
    });

    it("joins brew_tags for a custom tag and matches the folded key", () => {
        const clause = resolveBeanFilter("bean:custom:Mornings");
        expect(clause?.where).toContain("JOIN brew_tags t ON t.brewId = b.id");
        expect(clause?.where).toContain("t.tagKey = ?");
        expect(clause?.params).toEqual(["mornings"]);
    });

    it("scopes the rating to the value and binds it twice", () => {
        // The point of the whole clause. A recipe whose Natural brews average
        // 4.4 matches even if its overall average is 3.1.
        const clause = resolveBeanFilter("bean:rated:process:Natural");
        expect(clause?.params).toEqual(["Natural", "Natural"]);
        expect(clause?.where).toContain(`>= ${PROFILE_FLOOR}`);
        expect(clause?.where).toContain(`>= ${HIGHLY_RATED}`);
        expect(clause?.where).toContain("AVG(b.rating)");
        expect(clause?.where).toContain("rating > 0");
    });

    it("binds a rated custom tag twice, folded both times", () => {
        const clause = resolveBeanFilter("bean:rated:custom:Mornings");
        expect(clause?.params).toEqual(["mornings", "mornings"]);
    });
});

describe("labels", () => {
    it("raises a preset to caps, because those are the app's words", () => {
        expect(beanFilterLabel("bean:process:Natural")).toBe("NATURAL");
    });

    it("keeps an origin's own spelling", () => {
        expect(beanFilterLabel("bean:origin:Ethiopia Guji")).toBe("Ethiopia Guji");
    });

    it("marks a highly-rated filter with a star", () => {
        expect(beanFilterLabel("bean:rated:process:Natural")).toBe("NATURAL · 4★+");
    });

    it("names nothing outside the namespace", () => {
        expect(beanFilterLabel("tea")).toBeNull();
    });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx jest library/__tests__/beanFilters.test.ts`
Expected: FAIL, `Cannot find module '@/library/beanFilters'`.

- [ ] **Step 3: Write the implementation**

Create `library/beanFilters.ts`:

```ts
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

    const custom = field === "custom";
    // A custom tag binds its folded form, matching how `brew_tags` is keyed.
    // A tag of nothing but spaces folds to "" and would match every untagged
    // row's absent key, so it is refused before it can.
    const bound = custom ? tagKey(value) : value;
    if (bound.length === 0) return null;

    const from = custom ? TAGGED_FROM : PLAIN_FROM;
    const match = custom ? "t.tagKey = ?" : `b.${COLUMN[field]} = ?`;

    return rated
        ? {where: ratedWhere(from, match), params: [bound, bound]}
        : {where: existsWhere(from, match), params: [bound]};
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
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest library/__tests__/beanFilters.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 5: Mutate to prove the tests can fail**

1. Move the rated marker to the end of `beanFilterId` and parse it as a suffix. Expect "keeps a value containing a colon whole" to fail.
2. Delete the `VOCABULARY` check from `resolveBeanFilter`. Expect "refuses a preset value outside the closed vocabulary" to fail.
3. Change `match` to splice: `` `b.${COLUMN[field]} = '${value}'` `` with no params. Expect "binds a hostile origin rather than splicing it" to fail.
4. Change `bound` for custom to `value` rather than `tagKey(value)`. Expect "joins brew_tags for a custom tag and matches the folded key" to fail.
5. Delete `if (bound.length === 0) return null;`. Expect "refuses a custom tag that folds to nothing" to fail.
6. Change `params: [bound, bound]` to `params: [bound]`. Expect "scopes the rating to the value and binds it twice" to fail.
7. Replace `RATED_SQL` with `COUNTED_SQL` in `ratedWhere`'s scope. Expect "scopes the rating to the value and binds it twice" to fail on `rating > 0`.

- [ ] **Step 6: Typecheck, lint and commit**

```bash
npm run typecheck && npm run lint
git add library/beanFilters.ts library/__tests__/beanFilters.test.ts
git commit -m "Add the bean filter vocabulary

A parameterised namespace resolved through the existing FilterResolver seam.
The field is checked against an owned list, the column name comes from a
literal map, presets are checked against beanTags' closed vocabulary, and free
text is bound rather than spliced.

The rated flag leads the field rather than trailing the value: with it at the
end, a custom tag containing a colon parses as a different filter.

Mutations run: the flag moved to a suffix, the vocabulary check deleted, the
value spliced, the custom tag left unfolded, the empty-fold guard deleted, the
second binding dropped, and the rated scope widened to counted. Each killed its
test.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: Wire the namespace into the library's resolver

**Files:**
- Modify: `library/libraryFilters.ts` (`resolveLibraryFilter`, `asLibraryFilters`, `filterLabel`)
- Test: `library/__tests__/beanFilters.test.ts` (append a `describe`)

Three functions in `libraryFilters.ts` know the whole filter vocabulary, and all three must learn this namespace together. Teaching the resolver but not `asLibraryFilters` would let the narrowing reader silently drop every bean filter the moment one was applied; teaching it but not `filterLabel` would draw a chip whose word is its raw id.

- [ ] **Step 1: Write the failing test**

Append to `library/__tests__/beanFilters.test.ts`:

```ts
/* eslint-disable import/first */
import {
    asLibraryFilters,
    filterLabel,
    resolveLibraryFilter
} from "@/library/libraryFilters";
/* eslint-enable import/first */

describe("the library's own resolver", () => {
    it("resolves a bean id", () => {
        expect(resolveLibraryFilter("bean:process:Natural")?.params)
            .toEqual(["Natural"]);
    });

    it("still resolves a stock id, a tag and an author", () => {
        expect(resolveLibraryFilter("tea")).not.toBeNull();
        expect(resolveLibraryFilter("tag:mornings")).not.toBeNull();
        expect(resolveLibraryFilter("sharedBy:Ann")).not.toBeNull();
    });

    it("refuses a bean id whose value is outside the vocabulary", () => {
        expect(resolveLibraryFilter("bean:process:washed")).toBeNull();
    });

    it("keeps a bean id through the narrowing reader", () => {
        // Without this the reader drops every bean filter the moment one is
        // applied, leaving the library narrowed with no chip to undo it.
        expect(asLibraryFilters(["bean:process:Natural", "tea", "nonsense"]))
            .toEqual(["bean:process:Natural", "tea"]);
    });

    it("drops a bean id that cannot be parsed", () => {
        expect(asLibraryFilters(["bean:varietal:Gesha"])).toEqual([]);
    });

    it("names a bean filter on its chip", () => {
        expect(filterLabel("bean:process:Natural")).toBe("NATURAL");
        expect(filterLabel("bean:rated:custom:mornings")).toBe("mornings · 4★+");
    });

    it("still names a stock filter and a tag", () => {
        expect(filterLabel("tea")).toBe("TEA");
        expect(filterLabel("tag:Mornings")).toBe("Mornings");
    });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx jest library/__tests__/beanFilters.test.ts -t "the library's own resolver"`
Expected: FAIL. `resolveLibraryFilter("bean:process:Natural")` returns null, `asLibraryFilters` drops the id, and `filterLabel` returns the raw id.

- [ ] **Step 3: Write the implementation**

In `library/libraryFilters.ts`, add the import:

```ts
import {beanFilterLabel, parseBeanFilterId, resolveBeanFilter} from "./beanFilters";
```

In `resolveLibraryFilter`, add the bean branch first. Update its doc comment to mention the namespace:

```ts
export function resolveLibraryFilter(id: string): FilterClause | null {
    // Bean filters first, and they own their own refusals: a value outside the
    // closed vocabulary returns null from here rather than falling through to
    // the author and tag branches, which would read `bean:process:washed` as
    // neither and hand it to the stock lookup to refuse for the wrong reason.
    const bean = resolveBeanFilter(id);
    if (bean !== null) return bean;
    if (parseBeanFilterId(id) !== null) return null;

    const author = authorFromFilterId(id);
    ...
}
```

In `asLibraryFilters`, add `parseBeanFilterId(id) !== null` to the shape test:

```ts
    return value.filter((id) => typeof id === "string"
        && (isStockFilter(id)
            || parseBeanFilterId(id) !== null
            || tagFromFilterId(id) !== null
            || authorFromFilterId(id) !== null));
```

In `filterLabel`, add the bean branch first:

```ts
export function filterLabel(id: string): string {
    const bean = beanFilterLabel(id);
    if (bean !== null) return bean;
    const author = authorFromFilterId(id);
    ...
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx jest library/__tests__/beanFilters.test.ts library/__tests__/libraryFilters.test.ts`
Expected: PASS. The existing `libraryFilters` suite must stay green: a bean id must not disturb the stock, tag or author paths.

- [ ] **Step 5: Mutate to prove the tests can fail**

1. Remove the bean branch from `resolveLibraryFilter`. Expect "resolves a bean id" to fail.
2. Remove `if (parseBeanFilterId(id) !== null) return null;`. Expect "refuses a bean id whose value is outside the vocabulary" to fail, because `bean:process:washed` would reach the stock lookup and... confirm the *reason* it fails, not just that it does.
3. Remove the `parseBeanFilterId` term from `asLibraryFilters`. Expect "keeps a bean id through the narrowing reader" to fail.
4. Remove the bean branch from `filterLabel`. Expect "names a bean filter on its chip" to fail.

- [ ] **Step 6: Typecheck, lint and commit**

```bash
npm run typecheck && npm run lint
git add library/libraryFilters.ts library/__tests__/beanFilters.test.ts
git commit -m "Teach the library's filter vocabulary the bean namespace

All three functions together: the resolver, the narrowing reader and the label.
Teaching one and not the others leaves a filter that narrows with no chip to
undo it, or a chip whose word is its raw id.

Mutations run: each of the three branches removed in turn, and the bean refusal
fall-through deleted. Each killed its test.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: The filters, against a real database

**Files:**
- Test: `library/__tests__/beanFilters.integration.test.ts`

Task 4 proved the clause *says* the right thing. This proves it *does* the right thing, by running it. `library/__tests__/libraryFilters.test.ts` already has the harness to copy: a real `node:sqlite` database, a seeded library, and a helper that returns the names a query selects.

Nothing is implemented in this task. If a test here fails, the bug is in Task 4 and Task 4 is where it gets fixed.

- [ ] **Step 1: Write the test**

Create `library/__tests__/beanFilters.integration.test.ts`. Follow the mock shape `libraryFilters.test.ts` uses exactly, the `mock` prefix included, since that prefix is what lets the factory close over the variable:

```ts
import {createTestDatabase, type FakeSQLiteDatabase} from "@/test-utils/sqlite";

let mockBacking: FakeSQLiteDatabase;
jest.mock("expo-sqlite", () => ({openDatabaseSync: () => mockBacking}));

/* eslint-disable import/first */
import {buildLibraryQuery} from "@/library/libraryQuery";
import {resolveLibraryFilter} from "@/library/libraryFilters";
import {Recipe} from "@/library/Recipe";
import {RecipeDatabase} from "@/library/RecipeDatabase";
import {BrewDatabase} from "@/library/BrewDatabase";
/* eslint-enable import/first */
```

Seed with two recipes and brews that separate every question:

| recipe | brews |
| --- | --- |
| `Guji` | three done Natural brews rated 5, 4, 4; one done Washed rated 2 |
| `Yirg` | two done Natural brews rated 5, 5; one **cancelled** Natural rated 5 |

Then:

- [ ] `bean:process:Natural` selects both recipes.
- [ ] `bean:process:Washed` selects only `Guji`.
- [ ] `bean:rated:process:Natural` selects only `Guji`. `Yirg` averages 5 but has two rated brews, one short of the floor, and this is the test that proves a cancelled brew does not make up the number.
- [ ] a fourth done Natural brew rated 5 added to `Yirg` makes `bean:rated:process:Natural` select both.
- [ ] `bean:rated:process:Washed` selects nothing: `Guji`'s single Washed brew is below the floor.
- [ ] a recipe with four done Natural brews rated 5, 5, 5, 1 does not match `bean:rated:process:Natural`: the average is 4.0 exactly, so also assert 5, 5, 5, 2 **does** match at exactly 4.25 and 5, 4, 4, 3 matches at exactly 4.0. `HIGHLY_RATED` is `>=`, so 4.0 matches. State that as a test, because the spec chose it.
- [ ] a done but **unrated** Natural brew does not drag the average down: three brews rated 5, 4, 4 plus one rated 0 still averages 4.33, not 3.25.
- [ ] `bean:custom:mornings` selects a recipe whose brew carries the tag `Mornings`, proving the fold works through SQLite's ASCII-only `LIKE` being sidestepped.
- [ ] a custom tag differing only by case and a Turkish dotless ı fold together through `tagKey`, not through SQLite collation.
- [ ] `bean:rated:custom:mornings` scopes the average to the tagged brews only: a recipe with three `Mornings` brews at 5 and six untagged brews at 1 matches.
- [ ] two bean filters together are ANDed: `bean:process:Natural` plus `bean:roast:Light` selects only a recipe with a brew that is both, not one with a Natural brew and a separate Light brew. **Write this test knowing it may surprise**: the clauses are two independent `EXISTS`, so a recipe with one Natural-Medium brew and one Washed-Light brew *does* match both. Assert that behaviour and comment that it is the accepted reading, since each filter asks its own question of the history.
- [ ] a bean filter ANDs with a stock filter: `bean:process:Natural` plus `tea` selects only tea recipes with a Natural brew.
- [ ] the hostile origin from Task 4 runs without error and selects nothing, proving the binding survives a real statement.

- [ ] **Step 2: Run the tests and watch them pass**

Run: `npx jest library/__tests__/beanFilters.integration.test.ts`

If a test fails here it is Task 4's clause that is wrong. Fix `beanFilters.ts`, not the expectation.

- [ ] **Step 3: Mutate to prove the tests can fail**

Against `library/beanFilters.ts`:

1. Replace `RATED_SQL` with `COUNTED_SQL` in `ratedWhere`. Expect the unrated-brew test to fail.
2. Replace `COUNTED_SQL` with `1=1` in `existsWhere`. Expect the cancelled-brew test to fail.
3. Change the floor comparison to `> 0`. Expect "Yirg is one short of the floor" to fail.
4. Change `HIGHLY_RATED` comparison to `>`. Expect the exactly-4.0 test to fail.
5. Drop `b.recipeUuid = recipes.uuid` from `existsWhere`. Expect every filter to select every recipe, and several tests to fail.

- [ ] **Step 4: Typecheck, lint and commit**

```bash
npm run typecheck && npm run lint
git add library/__tests__/beanFilters.integration.test.ts
git commit -m "Run the bean filters against a real database

Task 4 proved the clause says the right thing; this runs it. The floor counts
rated brews and a cancelled brew makes up none of the number; an unrated brew
does not drag an average down; a custom tag matches through tagKey's fold
rather than SQLite's ASCII-only collation; and 4.0 exactly is highly rated.

Two bean filters are two independent EXISTS, so a recipe with a Natural brew
and a separate Light brew matches both. That is asserted rather than left to be
discovered: each filter asks its own question of the history.

Mutations run against beanFilters.ts: the rated scope widened, the counted
guard removed, the floor loosened, the threshold made exclusive, and the
correlation dropped. Each killed its test.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 7: The ledger on the card

**Files:**
- Create: `components/BeanProfileRow.tsx`
- Create: `components/BeanProfileDeck.tsx`
- Test: `components/__tests__/BeanProfileDeck.test.tsx`

The deck is a ledger. It never says a recipe is good for anything: it shows what was brewed and how those brews went, and leaves the reading to the person who brewed them.

`BeanProfileRow` is the shared line. The deck and the sheet both draw it, for the same reason `PourGlyph` is shared between the brew ladder and the editor tile: the capped list and the full list must be visibly the same list, or the cap reads as a different feature.

Shape of the deck, from the spec:

```
BREWED WITH
15 OF 24 BREWS TAGGED

  FERMENT      Co-ferment            4.8 · 3
  ORIGIN       Ethiopia Guji         4.7 · 3
  PROCESS      Natural               4.6 · 9
  ROAST        Light                 4.5 · 11
  PROCESS      Washed                4.0 · 5
  SHOW ALL 8 ›
  ─────────────────────────────────
  NOT TAGGED   9 brews                   3.9
```

Three columns. The field label is Doto, because those are the app's words. The
value is Inter, because an origin and a custom tag are words a person typed.
The figures are Doto in the recipe's accent, joined by the app's existing
interpunct convention (`18 g · 1:16`), rating first and count second.

The untagged row has no field, so its value column carries the count and only
the average sits in the figures. It is the one row whose shape differs, which
is part of how it reads as a footnote rather than a competitor.

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/BeanProfileDeck.test.tsx`. RNTL v14 cannot inspect a child's props, so every assertion is on text, test IDs or accessible labels.

```ts
import {screen} from "@testing-library/react-native";
import {renderWithProviders} from "@/test-utils/render";
import {BeanProfileDeck} from "@/components/BeanProfileDeck";
import type {BeanProfile} from "@/library/beanProfile";
```

Write a `profile()` helper that builds a `BeanProfile` from partials, then:

- [ ] renders nothing at all when `counted === 0`. A recipe never brewed has no ledger, not an empty one. Assert `screen.queryByText(/BREWS TAGGED/)` is null.
- [ ] renders the subtitle `3 OF 12 BREWS TAGGED` when nine of twelve counted brews are untagged.
- [ ] renders `12 OF 12 BREWS TAGGED` when none are untagged, and draws no untagged row.
- [ ] renders one line per row: the field label, the value, and `4.6 · 9`.
- [ ] names the field from `PROFILE_FIELD_LABEL`, so a `fermentation` row reads `FERMENT` and a `custom` row reads `TAG`.
- [ ] shows the count alone on a row with no rated brews, rather than `0.0 · n`. Assert the row's text contains the count and no `0.0`.
- [ ] shows at most `PROFILE_CAP` rows plus the untagged row, and a `SHOW ALL 9 ›` control when there are more.
- [ ] draws no `SHOW ALL` control when the rows fit.
- [ ] counts only the capped-out rows in `SHOW ALL n`: n is the total row count, not the hidden count. Pick whichever the copy table says and assert it. **The copy table says total.**
- [ ] pins the untagged row last even when its average is the highest, and gives it the accessible label `Not tagged`.
- [ ] writes the untagged row's count as `9 brews` in its value column, and `1 brew` when there is one.
- [ ] draws the untagged row outside the cap: with `PROFILE_CAP` tagged rows and an untagged row, all `PROFILE_CAP + 1` lines are present.
- [ ] shows the empty-state line when every counted brew is untagged: rows are empty, untagged has brews. The line reads as the copy table has it, and the untagged row is still drawn beneath it.
- [ ] calls `onShowAll` when the control is pressed.
- [ ] makes no row pressable. Assert no row has an `accessibilityRole` of `button`. The deck is a ledger and nothing on it is a control except the expander: the spec never gives a row an action, the filter is reached from the rail, and a row that navigated would make the card a place you can be taken away from by accident.

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx jest components/__tests__/BeanProfileDeck.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

`components/BeanProfileRow.tsx`:

- props `{field: string; value: string; brews: number; rating: number; rated: number; accent: string; accessibilityLabel?: string}`. There is no `onPress`: the spec gives a row no action, and a prop added now "for later" is a prop nobody will remove
- an `XStack` at `RailChip`'s `CHIP_HEIGHT`, so a row is comfortably tappable
- the field column in Doto caps, from `PROFILE_FIELD_LABEL`, fixed width so the value column lines up down the deck
- the value in Inter, `numberOfLines={1}` and ellipsised: an origin may be 120 characters and a row is one line
- the figures in Doto in `accent`, as `rating.toFixed(1) · brews`
- **when `rated === 0`, the figures are the count alone**, with no interpunct and no average. `0.0` claims a measurement nobody took, and the spec's wart is that the count shown is counted brews while the floor counts rated ones; showing a bare count here is what keeps that wart from becoming a lie
- no press handling of any kind, so the row is a line of text rather than a control screen readers offer to activate

`components/BeanProfileDeck.tsx`:

- props `{profile: BeanProfile; onShowAll: () => void}`
- returns `null` when `profile.counted === 0`
- a `DeckSection` titled `BREWED WITH`, with the subtitle `15 OF 24 BREWS TAGGED` where the first number is `counted - untagged.brews` and the second is `counted`. The spec's sketch writes it in sentence case and its copy table in Doto caps; the copy table wins, because Doto is all-caps everywhere in this app
- `rankProfileRows(profile.rows).slice(0, PROFILE_CAP)`
- when `profile.rows.length > PROFILE_CAP`, a `SHOW ALL {profile.rows.length} ›` control below the rows
- when `profile.rows.length === 0` and `profile.untagged.brews > 0`, the empty-state line in Inter above the untagged row
- when `profile.untagged.brews > 0`, a thin rule and then the untagged row, unpressable, labelled from the copy table
- all colour from `constants/colors.ts`, all timing from `constants/motion.ts`

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest components/__tests__/BeanProfileDeck.test.tsx`

- [ ] **Step 5: Mutate to prove the tests can fail**

1. Return the deck rather than `null` when `counted === 0`. Expect the never-brewed test to fail.
2. Compute the subtitle's `N` as `counted` rather than `counted - untagged.brews`. Expect the subtitle test to fail.
3. Include the untagged row in the cap's slice. Expect the outside-the-cap test to fail.
4. Render `0.0 · n` when `rated === 0`. Expect the no-rated-brews test to fail.
5. Give every row an `onPress`. Expect the not-pressable test to fail.
6. Drop the `rankProfileRows` call and render `profile.rows` in their given order. Expect the pinned-untagged or the ordering test to fail.

- [ ] **Step 6: Typecheck, lint and commit**

```bash
npm run typecheck && npm run lint
git add components/BeanProfileRow.tsx components/BeanProfileDeck.tsx \
        components/__tests__/BeanProfileDeck.test.tsx
git commit -m "Draw the bean profile as a ledger on the recipe card

Five rows at most, ranked, with the untagged row pinned below a rule and
outside the cap. The subtitle counts tagged brews against all counted brews, so
the deck cannot quietly disagree with the card's own brew count.

A row with no rated brews shows its count alone rather than 0.0, which would
claim a measurement nobody took. No row is pressable: the deck is a ledger, and
the filter that would match a row is reached from the library's own rail.

The row component is shared with the sheet for the reason PourGlyph is shared
with the editor: the capped list and the full list have to read as one list.

Mutations run: the never-brewed guard removed, the subtitle's arithmetic
inverted, the untagged row folded into the cap, a zero average rendered, the
untagged row made pressable, and the ranking dropped. Each killed its test.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 8: The full ledger, in a sheet

**Files:**
- Create: `components/BeanProfileSheet.tsx`
- Test: `components/__tests__/BeanProfileSheet.test.tsx`

`SHOW ALL` opens the same ledger with nothing hidden. It is the capped list without the cap, so it uses the same `BeanProfileRow` and the same ranking, and it must not introduce a second way of reading the same data.

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/BeanProfileSheet.test.tsx`. Remember that pressing inside an `XbrwSheet` needs the `waitFor`-wrapped retry: during the sheet's entrance the node is findable but the press is discarded. Copy the `pressOnSheet` helper from `app/__tests__/brewHistory.test.tsx`.

- [ ] renders every row when open, past the cap.
- [ ] ranks the rows the same way the deck does: assert the order of the rendered text, not that `rankProfileRows` was called.
- [ ] pins the untagged row last here too.
- [ ] renders nothing when `open` is false.
- [ ] shows the same subtitle as the deck.
- [ ] makes no row pressable here either, matching the deck.

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx jest components/__tests__/BeanProfileSheet.test.tsx`

- [ ] **Step 3: Write the implementation**

`components/BeanProfileSheet.tsx`, an `XbrwSheet` consumer following `NameShelfSheet.tsx`:

- props `{open: boolean; onOpenChange: (open: boolean) => void; profile: BeanProfile}`
- title and subtitle matching the deck
- every `rankProfileRows(profile.rows)` drawn, scrollable
- the rule and the untagged row at the end

- [ ] **Step 4: Run the test and watch it pass**

- [ ] **Step 5: Mutate to prove the tests can fail**

1. Slice the sheet's rows to `PROFILE_CAP`. Expect "renders every row" to fail.
2. Drop `rankProfileRows` in the sheet. Expect the ordering test to fail.
3. Drop the untagged row from the sheet. Expect the pinned-untagged test to fail.

- [ ] **Step 6: Typecheck, lint and commit**

```bash
npm run typecheck && npm run lint
git add components/BeanProfileSheet.tsx components/__tests__/BeanProfileSheet.test.tsx
git commit -m "Show the whole bean ledger in a sheet

SHOW ALL opens the capped list without the cap: the same rows, the same
ranking, the same pinned untagged row, drawn with the same row component. A
second way of reading the same data would be a second feature.

Mutations run: the sheet's rows capped, the ranking dropped, and the untagged
row dropped. Each killed its test.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 9: Read the profile and mount the deck

**Files:**
- Modify: `hooks/useBrewHistory.ts` (add `useBeanProfile`)
- Modify: `components/AboutDeck.tsx`
- Modify: `app/editRecipe.tsx`
- Test: `hooks/__tests__/useBeanProfile.test.ts`

Reading SQLite during render is forbidden by `react-hooks/purity`, and seeding
state from an effect by `react-hooks/set-state-in-effect`. `useRecipeRating` in
this same file already solves it: seed `useState` from a **lazy initialiser**,
and re-read in the event handler that could have changed the answer. Copy that
shape exactly rather than inventing a second one.

The event that changes a profile is a rating. `app/editRecipe.tsx` already calls
`rate()`; it calls `refresh()` after.

- [ ] **Step 1: Write the failing test**

Create `hooks/__tests__/useBeanProfile.test.ts`, mocking `expo-sqlite` with
`createTestDatabase` as the other SQL tests do. Remember `renderHook` is async
and `unmount()` needs `await act(...)`.

- [ ] reads the profile once on mount, from the lazy initialiser, with no effect: assert the returned profile matches the seeded data on the first awaited render.
- [ ] returns a zero profile for a recipe with no brews, rather than throwing.
- [ ] re-reads on `refresh()`, picking up a rating written between the two reads.
- [ ] does not re-read when an unrelated render happens: rerender with the same uuid and assert the store was queried once. Pass an injectable store so this is countable.
- [ ] reads a different recipe when the uuid changes.

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx jest hooks/__tests__/useBeanProfile.test.ts`

- [ ] **Step 3: Write the implementation**

In `hooks/useBrewHistory.ts`, beside `useRecipeRating`:

```ts
/**
 * A recipe's bean profile, and a way to ask for it again.
 *
 * Same shape as `useRecipeRating` above, and for the same two reasons: reading
 * SQLite during render is impure, and seeding state from an effect is what
 * `react-hooks/set-state-in-effect` exists to stop. So the first read happens
 * in a lazy initialiser, and every later one in the handler of the event that
 * could have changed the answer.
 *
 * The only such event is a rating. Tagging a brew happens on the brew record
 * screen, and coming back from it remounts this.
 */
export function useBeanProfile(
    recipeUuid: string,
    store: BeanProfileStore = sharedBrewDatabase()
): {profile: BeanProfile; refresh: () => void} {
```

Hold `{uuid, profile}` in one piece of state so a changed uuid is discarded at
render rather than synced, which is the same trick `useTraceAnimation`'s
`ticked.phase` uses.

In `components/AboutDeck.tsx`, render `<BeanProfileDeck>` after
`<HistorySection>`. The deck returns `null` on its own when there is nothing to
show, so `AboutDeck` does not need a condition of its own.

`app/editRecipe.tsx` owns the read and the sheet's open state, passes `profile`
and `onShowAll` down, renders `<BeanProfileSheet>` beside the editor's other
sheets, **adds the sheet to the `screenCovered` guard** alongside the existing
ones (a non-modal `XbrwSheet` does not hide sibling content from a screen reader
on Android on its own), and calls `refresh()` wherever it currently calls
`rate()`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx jest hooks/__tests__/useBeanProfile.test.ts app/__tests__/editRecipe.test.tsx`

- [ ] **Step 5: Mutate to prove the tests can fail**

1. Read the profile directly in the body instead of a lazy initialiser. Expect lint to fail, which is the real assertion here, and note that in the commit.
2. Make `refresh()` a no-op. Expect the re-read test to fail.
3. Keep the profile keyed to nothing, so a uuid change returns the old profile. Expect the changed-uuid test to fail.
4. Drop the sheet from `screenCovered`. Expect the editor's accessibility test to fail.

- [ ] **Step 6: Typecheck, lint and commit**

```bash
npm run typecheck && npm run lint
npx jest components/ hooks/ app/
git add hooks/useBrewHistory.ts hooks/__tests__/useBeanProfile.test.ts \
        components/AboutDeck.tsx app/editRecipe.tsx
git commit -m "Mount the bean profile deck on the recipe card

useBeanProfile copies useRecipeRating's shape exactly: a lazy initialiser for
the first read, the event handler for every later one. Reading SQLite in the
body is impure and seeding from an effect is what set-state-in-effect forbids,
so there is only one shape available and a second invention would be a second
thing to maintain.

The uuid is held together with the profile it produced and discarded at render
when they disagree, the same trick useTraceAnimation uses for its phase.

The sheet joins the editor's screenCovered guard: a non-modal XbrwSheet does
not hide sibling content from a screen reader on Android by itself.

Mutations run: the read moved into the body, refresh made a no-op, the uuid key
dropped, and the sheet removed from screenCovered. Each killed its test or its
lint.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 10: The picker sheet

**Files:**
- Create: `components/BeanFilterSheet.tsx`
- Test: `components/__tests__/BeanFilterSheet.test.tsx`

The sheet offers only values the user's own history contains. There is no text
field: origin and custom tags are free text, and typing one again here would
reintroduce exactly the splitting the ledger tolerates, and would let someone
filter on a value no brew carries and get an empty library with no explanation.

The cost is accepted and stated in the spec: every other filter in this app is
one tap, and a filter behind a door is one some people never find. One rail slot
that survives an unbounded vocabulary is worth it.

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/BeanFilterSheet.test.tsx`, using `pressOnSheet`.

- [ ] groups values under their field headings in `BEAN_FIELDS` order with custom last.
- [ ] **draws no heading for a field with no values.** A user who has never recorded a fermentation never sees an empty Ferment heading.
- [ ] draws nothing at all, not even headings, when the vocabulary is empty, and shows a line of prose saying so.
- [ ] marks a value selected when its id is in `selected`, and marks it selected when the **rated** form of its id is in `selected`. A value is one row whether or not the switch is on.
- [ ] calls `onChange` with the value's id added when an unselected value is pressed.
- [ ] calls `onChange` with the value's id removed when a selected value is pressed.
- [ ] selects more than one value: filters are ANDed and "Natural and Light" is a question worth asking.
- [ ] renders the switch `Highly rated only` with the caption `Average 4★ or better.` and no floor of 3 anywhere in the sheet body, because that lives in the help sheet.
- [ ] flipping the switch on rewrites **every** selected id into its rated form, and flipping it off rewrites them all back. Assert the whole array, not one element.
- [ ] flipping the switch with nothing selected changes no filters but is remembered, so a value selected afterwards arrives rated.
- [ ] shows each value's recipe count.

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx jest components/__tests__/BeanFilterSheet.test.tsx`

- [ ] **Step 3: Write the implementation**

`components/BeanFilterSheet.tsx`:

- props `{open; onOpenChange; vocabulary: BeanVocabularyEntry[]; selected: readonly string[]; ratedOnly: boolean; onRatedOnlyChange: (value: boolean) => void; onChange: (ids: string[]) => void}`
- groups the vocabulary by field, in `BEAN_FIELDS` order with `custom` last, heading each group from `PROFILE_FIELD_LABEL`
- a row per value: the value in Inter, the recipe count muted, a selected state
- selection is by `parseBeanFilterId`, comparing field and value and **ignoring `rated`**, so the switch never changes which rows look chosen
- the switch at the top, above the groups, with its caption
- `onChange` always receives the complete next array, never a delta: the rated rewrite touches every id at once and a delta API could not express it

- [ ] **Step 4: Run the test and watch it pass**

- [ ] **Step 5: Mutate to prove the tests can fail**

1. Draw every field heading regardless of whether it has values. Expect the empty-heading test to fail.
2. Compare full ids when deciding selection, so a rated id stops marking its row. Expect the selected-when-rated test to fail.
3. Rewrite only the first selected id when the switch flips. Expect the whole-array test to fail.
4. Put the floor of 3 in the caption. Expect the caption test to fail.

- [ ] **Step 6: Typecheck, lint and commit**

```bash
npm run typecheck && npm run lint
git add components/BeanFilterSheet.tsx components/__tests__/BeanFilterSheet.test.tsx
git commit -m "Add the bean filter picker

Only values the user's own history contains, with no text field: typing a value
again would reintroduce the splitting the ledger tolerates, and would let
someone filter on a value no brew carries and get an empty library with nothing
to explain it. A field with no values draws no heading.

Selection ignores the rated flag, so the switch never changes which rows look
chosen, and flipping it rewrites every selected id at once. onChange therefore
carries the whole next array rather than a delta, which could not express it.

The floor of 3 is deliberately not in the caption. The caption states the rule
the user is choosing; the floor is a guard on it, and it lives in the help
sheet.

Mutations run: empty headings drawn, selection compared on full ids, the rated
rewrite limited to one id, and the floor put in the caption. Each killed its
test.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 11: The BEANS chip in the rail

**Files:**
- Create: `hooks/useBeanFilters.ts`
- Modify: `hooks/useLibraryQuery.ts` (add `applyFilters`)
- Modify: `components/LibraryRail.tsx` (`RailFilter` gains `caretOpen`)
- Modify: `app/index.tsx`
- Test: `hooks/__tests__/useBeanFilters.test.ts`, `app/__tests__/index.beanFilters.test.tsx`

`app/index.tsx` already has the precedent for a rail chip that is not a filter:
`SELECTED_CHIP = "picker:selected"` is injected into `railFilters` and
intercepted in `onFilterPress` before the toggle. The `BEANS` chip follows it
exactly rather than inventing a second mechanism.

`useLibraryQuery` has no way to replace the whole filter set, only
`toggleFilter`. The rated rewrite changes every bean id at once, so a toggle
loop would pass through states where half the ids are rated and re-query the
library at each one. `applyFilters` takes an updater and applies it in one
`setFilters`.

The hook's existing comment says as much already: the three-valued
`filterRailIntent` was written for "phase 4, where a shelf selects filters
without the rail being open". This is the first caller that applies a filter
from outside the rail, so a filter chosen in the sheet must put the rail on
screen. Assert that.

- [ ] **Step 1: Write the failing tests**

`hooks/__tests__/useBeanFilters.test.ts`:

- [ ] reads the vocabulary once from a lazy initialiser, same shape as `useBeanProfile`.
- [ ] derives `ratedOnly` from the applied ids at mount, so reopening the sheet shows the switch as the filters actually are, rather than as the hook last left it.
- [ ] derives `ratedOnly` as false when the ids disagree with each other, which cannot happen through the UI but can through a restored state.
- [ ] `setRatedOnly(true)` rewrites every applied bean id and **leaves non-bean filters untouched**. Seed `["bean:process:Natural", "tea", "tag:mornings"]` and assert all three come back, two unchanged.
- [ ] `setValues` replaces the bean ids and leaves non-bean filters in place and in order.

`app/__tests__/index.beanFilters.test.tsx`:

- [ ] renders the `BEANS` chip in the rail with a caret.
- [ ] pressing it opens the sheet rather than applying a filter. Assert the applied filter count stays at zero.
- [ ] choosing a value in the sheet applies its filter and narrows the visible library.
- [ ] the chosen filter also appears as its own chip in the rail, tappable to remove, and removing it widens the library again without reopening the sheet.
- [ ] the `BEANS` chip stays in the rail alongside the value chips.
- [ ] applying a filter from the sheet opens the rail, per the `filterRailIntent` comment.
- [ ] `clear()` drops the bean filters along with everything else.

- [ ] **Step 2: Run the tests and watch them fail**

- [ ] **Step 3: Write the implementation**

`hooks/useLibraryQuery.ts`, beside `toggleFilter`:

```ts
    /**
     * Replace the whole applied set in one write.
     *
     * `toggleFilter` cannot express the bean sheet's rated switch, which
     * rewrites every bean id at once: a loop of toggles would pass through
     * states where half the ids are rated and re-query the library at each one.
     * The updater receives the current set so a caller can preserve the filters
     * it does not own, which every caller must.
     */
    applyFilters: (update: (current: readonly string[]) => string[]) => void;
```

`components/LibraryRail.tsx`: `RailFilter` gains an optional `caretOpen?: boolean`, passed through to `RailChip`, which already supports it. No other change.

`hooks/useBeanFilters.ts` owns the vocabulary read, the derived selection, the derived `ratedOnly`, and the two writers. It takes the controller's `filters` and `applyFilters` rather than calling `useLibraryQuery` itself, so there is still exactly one of those in the tree.

`app/index.tsx`: a `BEANS_CHIP = "picker:beans"` constant beside `SELECTED_CHIP`, injected into `railFilters` with `caretOpen` set from the sheet's open state and `active` set from whether any bean filter is applied, intercepted in `onFilterPress` above the toggle, and `<BeanFilterSheet>` rendered beside the other sheets **and added to `screenCovered`**.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx jest hooks/ app/`

- [ ] **Step 5: Mutate to prove the tests can fail**

1. Make `applyFilters` drop non-bean ids. Expect the tea-and-tag test to fail.
2. Have `setRatedOnly` rewrite with `toggleFilter` in a loop. Expect the whole-set test to fail, or if it passes, say so and work out why before accepting it.
3. Let the `BEANS` chip fall through to `toggleFilter`. Expect the opens-the-sheet test to fail, and note that this is exactly the bug `SELECTED_CHIP`'s interception exists to prevent.
4. Store `ratedOnly` as plain state seeded to false rather than deriving it. Expect the reopening test to fail.
5. Drop `caretOpen` from `RailFilter`. Expect the caret test to fail.

- [ ] **Step 6: Typecheck, lint and commit**

```bash
npm run typecheck && npm run lint
npx jest
git add hooks/useBeanFilters.ts hooks/useLibraryQuery.ts hooks/__tests__ \
        components/LibraryRail.tsx app/index.tsx app/__tests__
git commit -m "Put the bean filters in the library rail

One BEANS chip with a caret, following the SELECTED_CHIP precedent already in
index.tsx: injected into railFilters and intercepted in onFilterPress above the
toggle. Chosen values then appear as their own chips, so a filter can be
cleared without reopening the sheet.

useLibraryQuery gains applyFilters. toggleFilter cannot express the rated
switch, which rewrites every bean id at once: a loop of toggles would pass
through states where half the ids are rated and re-query at each one.

ratedOnly is derived from the applied ids rather than stored, so reopening the
sheet shows the switch as the filters actually are rather than as the hook last
left it.

This is the first caller that applies a filter from outside the rail, which is
what filterRailIntent's three-valued null was written for.

Mutations run: applyFilters made to drop foreign ids, the rated rewrite done as
a toggle loop, the BEANS chip allowed to fall through to the toggle, ratedOnly
stored rather than derived, and caretOpen dropped. Each killed its test.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 12: Copy and the help sheet

**Files:**
- Modify: `docs/copy.md`
- Modify: `constants/recipeHelp.ts`
- Test: whichever suite already covers `recipeHelp`

The spec says every string goes into `docs/copy.md` in the same pass, not
afterwards. It is doing it afterwards that leaves a catalogue nobody trusts.

The floor of 3 goes in the help sheet and nowhere else. The switch caption
states the rule the user is choosing; the floor is a guard on it, and a caption
carrying both states would be two sentences long and read as a warning.

- [ ] **Step 1: Write the failing test**

Add to the existing `recipeHelp` suite:

- [ ] the new entry exists, has a `detail`, and is therefore in `DETAILED_TOPICS`.
- [ ] its detail names the floor of 3 and the 4★ rule.
- [ ] **no user-facing string added by this feature contains an em dash.** Write this as a scan over the new copy constants, not a manual check.

- [ ] **Step 2: Run and watch it fail**

- [ ] **Step 3: Write the implementation**

`constants/recipeHelp.ts`: one entry explaining what the ledger counts (a
finished brew, not a cancelled one), that the figures come from brews and not
from anything written on the recipe, and that a filter needs at least three
rated brews of a value before it will match. Sentence case, British spelling,
no dashes.

`docs/copy.md`: every string from the spec's copy table, under a heading for
the recipe card's bean profile and one for the library's bean filter, in the
existing `| ID | Source | Context | Current text |` shape.

- [ ] **Step 4: Run the tests and watch them pass**

- [ ] **Step 5: Mutate to prove the tests can fail**

1. Remove the `detail` from the entry. Expect the `DETAILED_TOPICS` test to fail.
2. Put an em dash in one new string. Expect the dash scan to fail.
3. Drop the floor from the detail. Expect the floor test to fail.

- [ ] **Step 6: Typecheck, lint and commit**

```bash
npm run typecheck && npm run lint
git add docs/copy.md constants/recipeHelp.ts
git commit -m "Catalogue the bean profile copy and explain the floor

Every string in docs/copy.md in the same pass, because doing it afterwards is
what leaves a catalogue nobody trusts.

The floor of three rated brews is in the help sheet and nowhere else. The
switch caption states the rule the user is choosing; the floor is a guard on
it, and a caption carrying both would read as a warning.

Mutations run: the detail removed, an em dash introduced, and the floor dropped
from the detail. Each killed its test.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 13: The gate, the known wart, and the pull request

**Files:** none

- [ ] **Step 1: Run the whole gate**

```bash
npm run typecheck && npm run lint && npx jest && npx expo-doctor
```

Lint must end at **0 errors, 17 warnings**. A new warning is a new warning, not
part of the deliberate baseline, and must be fixed rather than absorbed.

- [ ] **Step 2: Raise the follow-up issue**

The spec ships a known wart: the floor counts **rated** brews while a row
displays **counted** brews, so a row reading `4.5 · 11` can fail a floor of 3
for a reason nothing on screen explains. The rejected alternative was a third
figure, `4.5 · 11 · 2 rated`, turned down as a third number on a line that
already has two.

Raise it as its own issue rather than a comment in the code, because the
decision is a user-facing one and the answer will come from using the feature,
not from reading it. Record the rejected alternative in the issue body, so
whoever picks it up does not re-derive it.

```bash
gh issue create -R hessius/XBRecipeWriterPlus \
  --title "Bean profile: the floor counts rated brews, the row shows counted brews" \
  --body-file <a temp file, because heredocs inside \$(cat) break here>
```

- [ ] **Step 3: Open the pull request**

`gh` resolves to the `upstream` remote, which is a fork. Pass
`-R hessius/XBRecipeWriterPlus` and `--body-file`, never `--body "$(cat ...)"`.

The body must state the three decisions this plan made that the spec left open:

1. The filter id puts the rated flag before the field. The spec's shape cannot be parsed, because the value is the unbounded tail and a custom tag may legally contain a colon.
2. The profile groups on the recorded `origin` column only, never `resolvedOrigin`'s fallback into the stored pod blob, because the filter compares the column and a row the filter cannot reproduce is a row that opens an empty library. A candidate follow-up, not an oversight.
3. `rankProfileRows` breaks a final tie on `field`, because two rows can tie on all three of the spec's keys and would then reshuffle between renders.

It must also state what has not been verified: no device pass, and every figure
in every test is synthetic.

- [ ] **Step 4: The device list**

This feature cannot be signed off from a simulator, and the user has asked to
test this section of the app as a whole rather than as components. Write the
list into the PR body:

1. A recipe with a real history: the deck's tagged-of-counted subtitle agrees with the brew count already on the card.
2. A recipe with brews but no tags: the prose line shows, with no rows and no cap.
3. A recipe never brewed: no deck at all.
4. `SHOW ALL` on a recipe with more than five rows: the sheet's first five rows are the deck's five, in the same order.
5. Rate a brew from the card and watch the figures move without leaving the screen.
6. The `BEANS` chip: open, choose two values, confirm the library narrows to recipes carrying both.
7. Flip `Highly rated only` with two values chosen: both chips gain `· 4★+` together.
8. Remove a value from its rail chip without reopening the sheet.
9. A library with no brews at all: the `BEANS` sheet says so rather than showing empty headings.
10. VoiceOver and TalkBack over the deck: the rows read as text, the expander as a button, and the sheet hides the library behind it.
11. Largest text size: a long origin ellipsises on one line and the figures stay on screen.
12. The four autosave checks still outstanding from #152, since this lands on the same screen.

- [ ] **Step 5: Update the session todos**

Mark the lagging `questions-104`, `approaches-104`, `design-104` and `spec-104`
rows done, and stop the brainstorming visual companion.

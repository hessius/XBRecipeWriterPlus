# Recipe Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `RecipeDatabase` queryable columns and a tag table derived from the existing JSON blob, so library search, filtering and grouping become possible without ever making the blob non-authoritative.

**Architecture:** The JSON blob in `recipes.recipeJSON` stays the only source of truth. A single descriptor array in `library/recipeIndex.ts` declares every index column and how to project it from a `Recipe`; the DDL, indices, write path and rebuild are all generated from that array. A hash of the array is stored in a `schema_meta` table — when it changes, the index is rebuilt from the blobs on next open. Tags live on the `Recipe` object (and therefore in the blob and in backups) and are projected into a derived `recipe_tags` table.

**Tech Stack:** TypeScript, `expo-sqlite` (sync API), Jest, and `node:sqlite` as a real-SQLite test harness (built into Node, no new dependency).

**Design doc:** `docs/superpowers/specs/2026-09-14-recipe-index-design.md`

**Branch:** rebase the existing `recipe-index` branch onto `main`. **Do not start
this plan from scratch.**

> **This plan has already been executed.** That is not obvious from reading it,
> and an earlier note in this same header wrongly said it never had. The work
> lives on the local `recipe-index` branch: 28 commits, roughly 4,300
> insertions, including `library/recipeIndex.ts`, the `recipe_tags` table, the
> rebuild, the `node:sqlite` harness in `test-utils/sqlite.ts`, and five test
> files. It was never pushed and never opened as a PR, which is the only reason
> it looked lost.
>
> So the task is a rebase, not a build. `main` has moved five squashed commits
> since the branch point (2026-09-14, `3e1b956`). Nine files are touched by both
> sides, and three of them are the ones that matter: `library/Recipe.ts`,
> `library/RecipeDatabase.ts` and `library/backup.ts`, all of which M6 changed
> substantially. The other six (`app/settings.tsx`, `components/XbrwSheet.tsx`,
> `components/DeleteAllSheet.tsx` and their tests) are the branch's own
> incidental sheet fixes and may well be redundant now: check whether `main`
> already fixed them before resolving anything by hand.
>
> Read the body of this plan as the record of how the code got the shape it has,
> not as a list of work to do. Where the code and the plan disagree, **the code
> is right** and the plan text is stale — it was corrected during execution and
> the prose was not always updated to match. The rebuild's `reindexRow` is the
> clearest example.

> **Read §0 of the design doc before starting.** M6 has landed
> (gated) and M5 has been designed since, and between them they add four
> descriptors this plan's task list does not name: `xid`, `sharedBy`,
> `favourite` and `hasDescription`. Each is one entry in the descriptor array
> and one `INDEX_REVISION` bump. The last two depend on fields M5 adds to
> `Recipe`, so they arrive with M5 rather than here; `xid` and `sharedBy` can be
> added now, since both fields already exist.

---

## Before you start

Read the design document. This plan implements it and does not repeat its reasoning.

Three rules from the design that are easy to violate and expensive to get wrong:

1. **Never write `recipeJSON` during a rebuild.** The blob is the only copy of a user's recipes.
2. **The column list appears in exactly one place** — `INDEX_COLUMNS`. If you find yourself typing a column name into a second file, stop.
3. **`retrieveAllRecipes()` must keep its exact existing signature and behaviour.** Many callers depend on it.

Verification commands used throughout:

```bash
npm test -- <path>       # single suite
npm run typecheck        # tsc --noEmit
npm run lint             # eslint .
```

---

## File structure

**Create:**

- `test-utils/sqlite.ts` — a real-SQLite adapter presenting the `expo-sqlite` sync surface, for use by `jest.mock("expo-sqlite", …)`.
- `library/recipeIndex.ts` — the descriptor array, the projection function, the generated SQL fragments, and the schema hash.
- `library/__tests__/recipeIndex.test.ts` — descriptor and projection tests.
- `library/__tests__/RecipeDatabase.index.test.ts` — schema, rebuild, migration and idempotence tests.
- `library/__tests__/Recipe.tags.test.ts` — tag normalisation on the model.

**Modify:**

- `library/Recipe.ts` — add `tags`, normalise them, read them in the JSON constructor.
- `library/backup.ts` — validate/sanitise `tags` at the trust boundary.
- `library/RecipeDatabase.ts` — schema creation, rebuild, transactional write path, tag storage, new query methods.
- `library/__tests__/RecipeDatabase.test.ts` — swap the fake mock for the real-SQLite harness. **Assertions must not change.**
- `library/__tests__/backup.test.ts` — add tag cases.

**Deliberately untouched:**

- `library/accent.ts` — `assignAccent` is idempotent by way of `reassignIfCrossed`, which is what stops a save moving a recipe's colour. Task 9 changes only where `RecipeDatabase` gets its tally from, not how the decision is made.

---

## Task 1: A real-SQLite test harness

The existing mock in `RecipeDatabase.test.ts` pattern-matches query strings and ignores SQL. It cannot execute `ALTER TABLE`, hold a column, or honour a collation — so nothing later in this plan could be tested against it. Replace it first.

`node:sqlite` ships with Node itself, so no dependency is added. It stopped
requiring `--experimental-sqlite` in v22.13, and this repo pins Node 24 through
`.nvmrc`, which CI reads via `node-version-file`. So it is available unflagged
both locally and in CI. Do not write a version number into the code: the
requirement is simply "the Node this repo already uses".

**Files:**
- Create: `test-utils/sqlite.ts`
- Modify: `library/__tests__/RecipeDatabase.test.ts:1-63` (the mock only)

- [ ] **Step 1: Write the harness**

Create `test-utils/sqlite.ts`:

```ts
import {DatabaseSync} from "node:sqlite";

/**
 * A real SQLite database presenting `expo-sqlite`'s synchronous surface.
 *
 * `expo-sqlite` is a native module with no implementation under Jest. The
 * previous stand-in was an in-memory array that pattern-matched a handful of
 * query shapes, which was enough while the schema was one table of two
 * columns and became useless the moment the schema had columns, collations
 * and migrations to get right.
 *
 * Node ships SQLite, so the tests can simply use it. A test that says a
 * migration worked now means it.
 */
export type FakeSQLiteDatabase = {
    execSync: (source: string) => void;
    runSync: (source: string, params?: unknown[]) => {changes: number; lastInsertRowId: number};
    getFirstSync: (source: string, params?: unknown[]) => unknown;
    getAllSync: (source: string, params?: unknown[]) => unknown[];
    withTransactionSync: (task: () => void) => void;
};

/**
 * Rows come back from `node:sqlite` with a null prototype, which Jest's
 * `toEqual` reports as unequal to a plain object literal. Copying them makes
 * failures readable.
 */
function plain(row: unknown): unknown {
    return row === undefined || row === null ? null : {...(row as object)};
}

export function createTestDatabase(): FakeSQLiteDatabase {
    const db = new DatabaseSync(":memory:");
    return {
        execSync: (source) => {
            db.exec(source);
        },
        runSync: (source, params = []) => {
            const result = db.prepare(source).run(...(params as never[]));
            return {
                changes: Number(result.changes),
                lastInsertRowId: Number(result.lastInsertRowid)
            };
        },
        getFirstSync: (source, params = []) =>
            plain(db.prepare(source).get(...(params as never[]))),
        getAllSync: (source, params = []) =>
            db.prepare(source).all(...(params as never[])).map(plain),
        withTransactionSync: (task) => {
            db.exec("BEGIN");
            try {
                task();
                db.exec("COMMIT");
            } catch (error) {
                db.exec("ROLLBACK");
                throw error;
            }
        }
    };
}
```

- [ ] **Step 2: Point the existing suite at it**

In `library/__tests__/RecipeDatabase.test.ts`, delete the whole `type Row` declaration and the `jest.mock("expo-sqlite", …)` block (lines 4–63 in the current file — everything from the `/**` above `type Row` down to the closing `}));`) and replace it with:

```ts
import {createTestDatabase as mockCreateTestDatabase} from "@/test-utils/sqlite";

jest.mock("expo-sqlite", () => ({
    // A fresh in-memory database per call, so each `new RecipeDatabase()` in
    // a test is isolated rather than sharing state.
    openDatabaseSync: () => mockCreateTestDatabase()
}));
```

Reference the import directly in the factory rather than reaching for
`jest.requireActual`. A `require` inside the factory trips `no-require-imports`
and leaves the `createTestDatabase` import unused, which is two lint complaints
bought for nothing. Name the import `mockCreateTestDatabase`: Jest allows a
factory to close over an out-of-scope variable whose name begins with `mock`,
which is precisely the escape hatch this case exists for.

**Do not change a single assertion in this file.** The suite passing unaltered against real SQL is the proof that the harness is faithful.

- [ ] **Step 3: Run the suite**

Run: `npm test -- library/__tests__/RecipeDatabase.test.ts`
Expected: PASS, same test count as before.

If a test fails, the fake was lying about something and the real database is right. Read the failure carefully before touching `RecipeDatabase.ts` — but note that `PRAGMA journal_mode = WAL` is a no-op on an in-memory database and is harmless.

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add test-utils/sqlite.ts library/__tests__/RecipeDatabase.test.ts
git commit -m "test: run RecipeDatabase against real SQLite

The in-memory stand-in pattern-matched query strings and ignored SQL, which
was adequate for one table of two columns and cannot test a schema with
columns, collations and migrations. Node ships SQLite; use it.

The assertions are unchanged, which is the point: the suite passing against
real SQL is what says the harness is faithful."
```

---

## Task 2: `Recipe.tags`

Tags live on the model, and therefore in the blob and in every backup. See design §4.1.

**Files:**
- Modify: `library/Recipe.ts`
- Create: `library/__tests__/Recipe.tags.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `library/__tests__/Recipe.tags.test.ts`:

```ts
import Recipe from "@/library/Recipe";

function withTags(tags: unknown): Recipe {
    const recipe = new Recipe();
    const json = JSON.parse(JSON.stringify(recipe));
    json.tags = tags;
    return new Recipe(undefined, JSON.stringify(json));
}

describe("Recipe tags", () => {
    it("defaults to an empty list", () => {
        expect(new Recipe().tags).toEqual([]);
    });

    it("survives a JSON round trip", () => {
        const recipe = new Recipe();
        recipe.setTags(["morning", "filter"]);
        const copy = new Recipe(undefined, JSON.stringify(recipe));
        expect(copy.tags).toEqual(["morning", "filter"]);
    });

    it("trims whitespace and drops empties", () => {
        const recipe = new Recipe();
        recipe.setTags(["  morning  ", "   ", ""]);
        expect(recipe.tags).toEqual(["morning"]);
    });

    it("dedupes case-insensitively, keeping the first spelling", () => {
        const recipe = new Recipe();
        recipe.setTags(["Espresso", "espresso", "ESPRESSO"]);
        expect(recipe.tags).toEqual(["Espresso"]);
    });

    it("drops tags longer than the limit rather than truncating them", () => {
        // A truncated tag is a plausible-looking wrong tag.
        const recipe = new Recipe();
        recipe.setTags(["a".repeat(33), "ok"]);
        expect(recipe.tags).toEqual(["ok"]);
    });

    it("keeps a tag of exactly the limit", () => {
        const recipe = new Recipe();
        recipe.setTags(["a".repeat(32)]);
        expect(recipe.tags).toEqual(["a".repeat(32)]);
    });

    it("caps the number of tags per recipe", () => {
        const recipe = new Recipe();
        recipe.setTags(Array.from({length: 40}, (_, i) => `t${i}`));
        expect(recipe.tags).toHaveLength(20);
        expect(recipe.tags[0]).toBe("t0");
    });

    it("reads a record saved before tags existed", () => {
        const recipe = new Recipe();
        const json = JSON.parse(JSON.stringify(recipe));
        delete json.tags;
        expect(new Recipe(undefined, JSON.stringify(json)).tags).toEqual([]);
    });

    it("ignores a tags field that is not an array", () => {
        expect(withTags("morning").tags).toEqual([]);
        expect(withTags(null).tags).toEqual([]);
        expect(withTags(7).tags).toEqual([]);
    });

    it("drops non-string entries", () => {
        expect(withTags(["morning", 7, null, {}, "filter"]).tags)
            .toEqual(["morning", "filter"]);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- library/__tests__/Recipe.tags.test.ts`
Expected: FAIL — `setTags is not a function`.

- [ ] **Step 3: Implement**

In `library/Recipe.ts`, beside the other public fields (near `public accentIndex?: number;`):

```ts
    /**
     * Free-text labels the user applied.
     *
     * On the model rather than in a table of their own so that a tag travels
     * with the recipe everywhere a recipe already goes: `buildBackup`
     * serialises the object, `duplicateRecipe` copies it through its own JSON
     * form, and a later sync will carry it. A separate table would have been
     * invisible to all three, and export would have dropped tags silently.
     *
     * Always normalised — write through `setTags`, never by assignment.
     */
    public tags: string[] = [];
```

Add these constants at module scope, near the other limits:

```ts
/** Characters. Longer tags are dropped on import rather than truncated. */
export const MAX_TAG_LENGTH = 32;
/** Tags per recipe. Both limits exist to bound a hostile backup, not the user. */
export const MAX_TAGS_PER_RECIPE = 20;
```

Add the normaliser and setter as methods on `Recipe`:

```ts
    /**
     * Normalise and store a set of tags.
     *
     * Deduplication is case-insensitive but keeps the first spelling the user
     * typed, so "Espresso" and "espresso" are one tag and it stays
     * capitalised the way they wrote it. `recipe_tags.tag` is collated NOCASE
     * for the same reason; the two must agree or filtering disagrees with
     * what the user sees.
     */
    public setTags(tags: unknown): void {
        this.tags = Recipe.normaliseTags(tags);
    }

    public static normaliseTags(tags: unknown): string[] {
        if (!Array.isArray(tags)) return [];
        const seen = new Set<string>();
        const kept: string[] = [];
        for (const entry of tags) {
            if (typeof entry !== "string") continue;
            const tag = entry.trim();
            if (tag.length === 0 || tag.length > MAX_TAG_LENGTH) continue;
            const key = tag.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            kept.push(tag);
            if (kept.length === MAX_TAGS_PER_RECIPE) break;
        }
        return kept;
    }
```

In the JSON branch of the constructor, beside `this.accentIndex = jsonRecipe.accentIndex;`:

```ts
            this.tags = Recipe.normaliseTags(jsonRecipe.tags);
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- library/__tests__/Recipe.tags.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Confirm nothing else moved**

Run: `npm test -- library/__tests__/Recipe.persistence.test.ts library/__tests__/shareLink.test.ts library/__tests__/backup.test.ts`
Expected: PASS. In particular `shareLink` must be untouched — `buildSharePayload` selects explicit fields, so `tags` cannot reach a share snapshot.

- [ ] **Step 6: Commit**

```bash
git add library/Recipe.ts library/__tests__/Recipe.tags.test.ts
git commit -m "feat: tags on the recipe model

On the model rather than in a table of their own, so a tag travels wherever a
recipe already does. buildBackup serialises the object; a separate table would
have been dropped by every export without anyone noticing."
```

---

## Task 3: Tags across the backup trust boundary

`backup.ts` is severe because a bad recipe's next stop is a genuine card. A tag reaches no card, so it is sanitised rather than being grounds for rejecting the recipe. See design §4.3.

**Files:**
- Modify: `library/backup.ts` (the validator table around line 226)
- Modify: `library/__tests__/backup.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `library/__tests__/backup.test.ts`, inside the existing top-level `describe`:

```ts
describe("tags", () => {
    function backupWithTags(tags: unknown): string {
        const recipe = new Recipe();
        recipe.name = "Tagged";
        const envelope = JSON.parse(buildBackup([recipe], {}));
        envelope.recipes[0].tags = tags;
        return JSON.stringify(envelope);
    }

    it("round-trips tags through an export and import", () => {
        const recipe = new Recipe();
        recipe.name = "Tagged";
        recipe.setTags(["morning", "filter"]);

        const result = parseBackup(buildBackup([recipe], {}));

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.payload.recipes[0].tags).toEqual(["morning", "filter"]);
    });

    it("reads a backup written before tags existed", () => {
        const recipe = new Recipe();
        recipe.name = "Old";
        const envelope = JSON.parse(buildBackup([recipe], {}));
        delete envelope.recipes[0].tags;

        const result = parseBackup(JSON.stringify(envelope));

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.payload.recipes[0].tags).toEqual([]);
    });

    it("keeps the recipe and drops the tags when the field is malformed", () => {
        // Deliberately unlike every other field in this file. A malformed tag
        // costs the recipe its tags, not its existence: a tag never reaches a
        // card, so rejecting an otherwise-perfect recipe would be the harm.
        for (const hostile of ["nope", 7, null, [1, 2], [{}]]) {
            const result = parseBackup(backupWithTags(hostile));
            expect(result.ok).toBe(true);
            if (!result.ok) continue;
            expect(result.payload.recipes).toHaveLength(1);
            expect(result.payload.recipes[0].tags).toEqual([]);
        }
    });

    it("bounds an absurd number of tags", () => {
        const result = parseBackup(
            backupWithTags(Array.from({length: 500}, (_, i) => `t${i}`))
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.payload.recipes[0].tags).toHaveLength(20);
    });

    it("bounds an absurdly long tag", () => {
        const result = parseBackup(backupWithTags(["a".repeat(10000), "ok"]));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.payload.recipes[0].tags).toEqual(["ok"]);
    });
});
```

If `Recipe`, `buildBackup` or `parseBackup` are not already imported at the top of that file, add them.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- library/__tests__/backup.test.ts`
Expected: FAIL — the malformed-tags cases reject the recipe or carry the bad value through.

- [ ] **Step 3: Implement**

In `library/backup.ts`, add to the validator table beside `shareSnapshot` (line ~226):

```ts
    // Sanitised, not rejected — deliberately unlike every other entry here.
    // This file is severe because a bad recipe's next stop is a genuine card
    // and a malformed write is not trivially recoverable. A tag reaches no
    // card, no machine and no share payload, so refusing an otherwise-perfect
    // recipe over a decorative field would be the harm rather than the guard.
    // `Recipe.normaliseTags` drops whatever it cannot use, so any shape is
    // acceptable here and the constructor decides what survives.
    tags: () => true,
```

Because the `Recipe` constructor already calls `Recipe.normaliseTags`, no further code is needed — but confirm the validator does not reject an *absent* `tags` field. If the table's entries are only consulted when a key is present, nothing more is required; if every key is required, `tags` must be optional in the same way `shareSnapshot` is.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- library/__tests__/backup.test.ts`
Expected: PASS.

- [ ] **Step 5: Confirm `BACKUP_VERSION` is unchanged**

Run: `git diff library/backup.ts | grep -c BACKUP_VERSION`
Expected: `0`. Bumping it would make older apps refuse a file they can in fact read, since `parseBackup` already ignores unknown fields.

- [ ] **Step 6: Commit**

```bash
git add library/backup.ts library/__tests__/backup.test.ts
git commit -m "feat: carry tags through backups, sanitising rather than rejecting

A tag reaches no card, no machine and no share payload, so a malformed tags
field costs the recipe its tags and not its existence. BACKUP_VERSION is
deliberately unchanged: parseBackup already ignores unknown fields, and
bumping would make older apps refuse a file they can read."
```

---

## Task 4: The descriptor module

One array; the DDL, indices, write path and rebuild all derive from it. See design §2.

**Files:**
- Create: `library/recipeIndex.ts`
- Create: `library/__tests__/recipeIndex.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `library/__tests__/recipeIndex.test.ts`:

```ts
import Recipe from "@/library/Recipe";
import Pour from "@/library/Pour";
import {
    INDEX_COLUMNS,
    INDEX_REVISION,
    columnDefinitions,
    indexStatements,
    projectRecipe,
    schemaHash
} from "@/library/recipeIndex";

function pour(volume: number, temperature: number): Pour {
    const p = new Pour();
    p.volume = volume;
    p.temperature = temperature;
    return p;
}

describe("recipeIndex descriptors", () => {
    it("declares unique column names", () => {
        const names = INDEX_COLUMNS.map((c) => c.name);
        expect(new Set(names).size).toBe(names.length);
    });

    it("never collides with the two base columns", () => {
        const names = INDEX_COLUMNS.map((c) => c.name);
        expect(names).not.toContain("uuid");
        expect(names).not.toContain("recipeJSON");
    });

    it("emits a nullable definition for every column", () => {
        // Nullability is what makes ADD COLUMN re-runnable and a partially
        // completed previous run self-healing.
        for (const definition of columnDefinitions()) {
            expect(definition).not.toMatch(/NOT NULL/i);
            expect(definition).not.toMatch(/DEFAULT/i);
        }
    });

    it("emits one CREATE INDEX per indexed column", () => {
        const indexed = INDEX_COLUMNS.filter((c) => c.indexed).length;
        const statements = indexStatements();
        expect(statements).toHaveLength(indexed);
        for (const statement of statements) {
            expect(statement).toMatch(/^CREATE INDEX IF NOT EXISTS/);
        }
    });

    it("pins the schema hash", () => {
        // This value is expected to change whenever INDEX_COLUMNS changes.
        // When it does: confirm the change was intended, bump INDEX_REVISION
        // if you altered a `from` body rather than the column shape, then
        // paste the new hash here. See recipeIndex.ts for why the revision
        // cannot be derived automatically.
        expect(schemaHash()).toBe("__PASTE_ACTUAL_HASH_HERE__");
    });

    it("folds the revision into the hash", () => {
        expect(typeof INDEX_REVISION).toBe("number");
        expect(schemaHash()).not.toBe(schemaHash(INDEX_REVISION + 1));
    });
});

describe("projectRecipe", () => {
    it("produces a value for every declared column", () => {
        const projected = projectRecipe(new Recipe());
        expect(Object.keys(projected).sort())
            .toEqual(INDEX_COLUMNS.map((c) => c.name).sort());
    });

    it("stores NULL rather than the placeholder for a nameless recipe", () => {
        // placeholderName() is locale-dependent; indexing it would freeze the
        // device language into the sort key at save time.
        const recipe = new Recipe();
        expect(recipe.hasName()).toBe(false);
        expect(projectRecipe(recipe).sortName).toBeNull();
    });

    it("stores the display name for a named recipe", () => {
        const recipe = new Recipe();
        recipe.name = "Morning";
        expect(projectRecipe(recipe).sortName).toBe("Morning");
    });

    it("counts pours", () => {
        const recipe = new Recipe();
        recipe.pours = [pour(100, 93), pour(120, 92)];
        expect(projectRecipe(recipe).pourCount).toBe(2);
    });

    it("takes totalVolume from the pours, not from dose times ratio", () => {
        // getTotalVolume() is the target the machine validates against. The
        // two agree on a valid recipe and diverge on a half-authored one; the
        // index must never advertise water that will not arrive.
        const recipe = new Recipe();
        recipe.dosage = 15;
        recipe.ratio = 16;
        recipe.pours = [pour(100, 93)];
        expect(projectRecipe(recipe).totalVolume).toBe(100);
    });

    it("gives a stageless recipe no volume", () => {
        expect(projectRecipe(new Recipe()).totalVolume).toBe(0);
    });

    it("ignores the -1 sentinel when taking temperature bounds", () => {
        // Pour.temperature initialises to -1, the same never-set sentinel as
        // agitation. One half-filled stage would otherwise drag minTemp to -1
        // and every range filter would silently match it.
        const recipe = new Recipe();
        recipe.pours = [pour(100, 93), pour(100, -1), pour(100, 88)];
        const projected = projectRecipe(recipe);
        expect(projected.minTemp).toBe(88);
        expect(projected.maxTemp).toBe(93);
    });

    it("leaves temperature null when no pour has one set", () => {
        const recipe = new Recipe();
        recipe.pours = [pour(100, -1)];
        const projected = projectRecipe(recipe);
        expect(projected.minTemp).toBeNull();
        expect(projected.maxTemp).toBeNull();
    });

    it("asks the recipe whether it is tea rather than reading cupType", () => {
        // The tea byte carries the cup count in its high nibble and legacy
        // cards arrive as 0x13 or 0x23; isTea() owns every one of those
        // normalisations and must not be reimplemented as a cupType compare.
        const recipe = new Recipe();
        recipe.cupType = 0x13;
        expect(recipe.isTea()).toBe(true);
        expect(projectRecipe(recipe).isTea).toBe(1);
    });

    it("stores booleans as 0 and 1", () => {
        const recipe = new Recipe();
        recipe.grinder = false;
        recipe.bypassEnabled = true;
        const projected = projectRecipe(recipe);
        expect(projected.grinder).toBe(0);
        expect(projected.bypassEnabled).toBe(1);
    });

    it("stores an absent accent index as NULL", () => {
        const recipe = new Recipe();
        recipe.accentIndex = undefined;
        expect(projectRecipe(recipe).accentIndex).toBeNull();
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- library/__tests__/recipeIndex.test.ts`
Expected: FAIL — cannot resolve `@/library/recipeIndex`.

- [ ] **Step 3: Implement**

Create `library/recipeIndex.ts`:

```ts
import Recipe from "./Recipe";

/**
 * The recipe index: every column derived from a recipe's JSON blob.
 *
 * The blob in `recipes.recipeJSON` is the only source of truth. Everything
 * declared here is a cache of it and may be dropped and rebuilt at any time
 * without loss, which is what makes a mistake in this file recoverable rather
 * than destructive.
 *
 * The column list exists here and nowhere else. The DDL, the indices, the
 * INSERT column list and the rebuild are all generated from this array, so
 * adding something filterable is one entry and nothing more. The alternative
 * -- the same list written out in four places -- is the failure that produced
 * `Settings.DEFAULTS`, when `showHints` went missing from backups by being
 * named in some places and not others.
 */
export type IndexValue = string | number | null;

export type IndexColumn = {
    name: string;
    type: "TEXT" | "INTEGER" | "REAL";
    collate?: "NOCASE";
    indexed?: boolean;
    from: (recipe: Recipe) => IndexValue;
};

/**
 * Bump this whenever you change the body of a `from` function without
 * changing any column's name, type or collation.
 *
 * The schema hash below covers the shape of the array, which is all it can
 * cover: Hermes compiles to bytecode and `Function.prototype.toString()`
 * returns "[bytecode]" in a release build, so hashing the source of a `from`
 * would work in development and silently stop working in production. A
 * mechanism that is correct in dev and quietly wrong in release is worse than
 * one that asks for a number.
 *
 * `recipeIndex.test.ts` pins the hash, so a forgotten bump fails CI.
 */
export const INDEX_REVISION = 1;

/** Temperatures are stored as -1 until set; see Pour. */
function temperatures(recipe: Recipe): number[] {
    return recipe.pours
        .map((pour) => pour.temperature)
        .filter((temperature) => temperature >= 0);
}

export const INDEX_COLUMNS: IndexColumn[] = [
    {
        name: "sortName", type: "TEXT", collate: "NOCASE", indexed: true,
        // NULL rather than the placeholder: placeholderName() formats a date
        // with toLocaleDateString, so indexing it would freeze the device's
        // language into the sort key and leave it stale if that changed. NULL
        // also lets "sort by name" put unnamed recipes deliberately last
        // instead of scattering them under a localised string.
        from: (r) => (r.hasName() ? r.displayName() : null)
    },
    {name: "createdAt", type: "INTEGER", indexed: true, from: (r) => r.createdAt},
    {name: "source", type: "TEXT", indexed: true, from: (r) => r.source},
    {name: "accentIndex", type: "INTEGER", from: (r) => r.accentIndex ?? null},
    {name: "cupType", type: "INTEGER", indexed: true, from: (r) => r.cupType},
    {
        name: "isTea", type: "INTEGER", indexed: true,
        // Asks the recipe rather than comparing cupType. The tea byte can
        // carry the default cup count in its high nibble and legacy cards
        // arrive as 0x13 or 0x23; isTea() owns every one of those
        // normalisations, and accent.ts already warns that a second copy of
        // the predicate would silently miss the next such fix.
        from: (r) => (r.isTea() ? 1 : 0)
    },
    {name: "dosage", type: "REAL", from: (r) => r.dosage},
    {name: "ratio", type: "INTEGER", indexed: true, from: (r) => r.ratio},
    {name: "grindSize", type: "INTEGER", indexed: true, from: (r) => r.grindSize},
    {name: "grinder", type: "INTEGER", from: (r) => (r.grinder ? 1 : 0)},
    {name: "grindRPM", type: "INTEGER", from: (r) => r.grindRPM},
    {name: "pourCount", type: "INTEGER", indexed: true, from: (r) => r.pours.length},
    {
        name: "totalVolume", type: "REAL",
        // The sum of the pours, not getTotalVolume(), which is dose x ratio --
        // the target the machine validates against. They agree on a valid
        // recipe and diverge on a half-authored one, where a stageless recipe
        // would otherwise claim to make 240 ml while dispensing nothing.
        from: (r) => r.getPourTotalVolume()
    },
    {
        name: "minTemp", type: "INTEGER",
        from: (r) => {
            const set = temperatures(r);
            return set.length === 0 ? null : Math.min(...set);
        }
    },
    {
        name: "maxTemp", type: "INTEGER",
        from: (r) => {
            const set = temperatures(r);
            return set.length === 0 ? null : Math.max(...set);
        }
    },
    {name: "bypassEnabled", type: "INTEGER", from: (r) => (r.bypassEnabled ? 1 : 0)},
    // The one column here that is not a filterable recipe property: it is the
    // share identity a cloud recipe arrived with.
    {name: "sharedTableId", type: "INTEGER", from: (r) => r.sharedTableId ?? null}
];
```

**This array is four descriptors short of what M5 now needs.** It was written
before the account import and before the library redesign. Add these when you
pick the work up, and read §0 of
[`2026-09-14-recipe-index-design.md`](../specs/2026-09-14-recipe-index-design.md)
for why each one earns a column:

```ts
    {name: "xid", type: "TEXT", from: (r) => r.xid || null},
    {name: "sharedBy", type: "TEXT", collate: "NOCASE",
     from: (r) => r.sharedBy || null},
    {name: "favourite", type: "INTEGER", from: (r) => (r.favourite ? 1 : 0)},
    {name: "hasDescription", type: "INTEGER",
     from: (r) => (r.description ? 1 : 0)},
```

Adding them changes the descriptor hash, which is exactly the mechanism that
makes an existing install rebuild itself on first open. That is the intended
path, not a special case.

```ts
/**
 * Every column is nullable with no default. That is what makes the ADD COLUMN
 * pass in RecipeDatabase a no-op on re-run, and a partially completed previous
 * run self-healing.
 */
export function columnDefinitions(): string[] {
    return INDEX_COLUMNS.map((column) =>
        `${column.name} ${column.type}${column.collate ? ` COLLATE ${column.collate}` : ""}`
    );
}

export function indexStatements(): string[] {
    return INDEX_COLUMNS.filter((column) => column.indexed).map((column) =>
        `CREATE INDEX IF NOT EXISTS idx_recipes_${column.name} ON recipes(${column.name});`
    );
}

export function projectRecipe(recipe: Recipe): Record<string, IndexValue> {
    const projected: Record<string, IndexValue> = {};
    for (const column of INDEX_COLUMNS) projected[column.name] = column.from(recipe);
    return projected;
}

/** FNV-1a, the same hash accent.ts uses. Any stable hash would do. */
function fnv1a(input: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
}

/**
 * A hash of the index's shape. When it differs from the value stored in
 * `schema_meta`, RecipeDatabase rebuilds the index from the blobs.
 */
export function schemaHash(revision: number = INDEX_REVISION): string {
    const shape = INDEX_COLUMNS
        .map((c) => `${c.name}:${c.type}:${c.collate ?? ""}:${c.indexed ? 1 : 0}`)
        .join("|");
    return fnv1a(`${revision}|${shape}`);
}
```

- [ ] **Step 4: Fill in the pinned hash**

Run: `npx jest library/__tests__/recipeIndex.test.ts -t "pins the schema hash" 2>&1 | grep -A2 Received`

Copy the received value into the test, replacing `__PASTE_ACTUAL_HASH_HERE__`.

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -- library/__tests__/recipeIndex.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add library/recipeIndex.ts library/__tests__/recipeIndex.test.ts
git commit -m "feat: the recipe index descriptor array

One array declares every derived column and how to project it. The DDL, the
indices, the write path and the rebuild are all generated from it, so the
column list cannot drift across four files the way Settings' did.

The revision constant is manual because Hermes returns [bytecode] from
Function.prototype.toString in release builds, so hashing a projection's
source would work in dev and silently stop working in production."
```

---

## Task 5: Schema creation

**Files:**
- Modify: `library/RecipeDatabase.ts` (`createTable`)
- Create: `library/__tests__/RecipeDatabase.index.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `library/__tests__/RecipeDatabase.index.test.ts`:

```ts
import {createTestDatabase, type FakeSQLiteDatabase} from "@/test-utils/sqlite";
import {INDEX_COLUMNS} from "@/library/recipeIndex";

/**
 * Unlike RecipeDatabase.test.ts, these tests need to reach the underlying
 * database directly — to build a pre-refactor schema before RecipeDatabase
 * opens it, and to inspect columns afterwards. One shared instance per test,
 * reset between them.
 */
let backing: FakeSQLiteDatabase;

jest.mock("expo-sqlite", () => ({
    openDatabaseSync: () => backing
}));

// Imported after the mock so the module picks it up.
import RecipeDatabase from "@/library/RecipeDatabase";
import Recipe from "@/library/Recipe";

beforeEach(() => {
    backing = createTestDatabase();
});

function columnNames(): string[] {
    return (backing.getAllSync("PRAGMA table_info(recipes);") as {name: string}[])
        .map((row) => row.name);
}

describe("schema creation", () => {
    it("creates every declared index column", () => {
        new RecipeDatabase();
        const names = columnNames();
        expect(names).toContain("uuid");
        expect(names).toContain("recipeJSON");
        for (const column of INDEX_COLUMNS) expect(names).toContain(column.name);
    });

    it("creates the tag and metadata tables", () => {
        new RecipeDatabase();
        const tables = (backing.getAllSync(
            "SELECT name FROM sqlite_master WHERE type = 'table';"
        ) as {name: string}[]).map((row) => row.name);
        expect(tables).toContain("recipe_tags");
        expect(tables).toContain("schema_meta");
    });

    it("creates an index for every indexed column", () => {
        new RecipeDatabase();
        const indices = (backing.getAllSync(
            "SELECT name FROM sqlite_master WHERE type = 'index';"
        ) as {name: string}[]).map((row) => row.name);
        for (const column of INDEX_COLUMNS.filter((c) => c.indexed)) {
            expect(indices).toContain(`idx_recipes_${column.name}`);
        }
    });

    it("is idempotent across opens", () => {
        // ALTER TABLE ADD COLUMN throws on a duplicate; IF NOT EXISTS is not
        // portable across the SQLite versions Expo ships, so the failure is
        // caught instead. This is the test that catches that going wrong.
        new RecipeDatabase();
        const first = columnNames();
        expect(() => new RecipeDatabase()).not.toThrow();
        expect(columnNames()).toEqual(first);
    });

    it("tolerates an orphan column left by a retired descriptor", () => {
        new RecipeDatabase();
        backing.execSync("ALTER TABLE recipes ADD COLUMN retiredThing TEXT;");

        const db = new RecipeDatabase();
        const recipe = new Recipe();
        recipe.name = "Still works";
        db.insertRecipe(recipe);

        expect((db.retrieveAllRecipes() ?? []).map((r) => r.name)).toEqual(["Still works"]);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- library/__tests__/RecipeDatabase.index.test.ts`
Expected: FAIL — the index columns do not exist.

- [ ] **Step 3: Implement**

Replace `createTable` in `library/RecipeDatabase.ts`:

```ts
    /**
     * Bring the schema up to date.
     *
     * The base table is created exactly as it always was, so an existing
     * database is untouched by the first statement. Everything after it is
     * additive: every index column is nullable with no default, which makes
     * this method a no-op on re-run and makes a partially completed previous
     * run self-healing.
     *
     * `IF NOT EXISTS` on ADD COLUMN is not portable across the SQLite versions
     * Expo ships, so a duplicate is caught rather than avoided — the same
     * pattern BrewDatabase already uses.
     */
    private createTable(): void {
        this.db.execSync(`
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS recipes (uuid TEXT PRIMARY KEY NOT NULL,recipeJSON TEXT);
            CREATE TABLE IF NOT EXISTS recipe_tags (
                uuid TEXT NOT NULL,
                tag TEXT NOT NULL COLLATE NOCASE,
                PRIMARY KEY (uuid, tag)
            );
            CREATE INDEX IF NOT EXISTS idx_recipe_tags_tag ON recipe_tags(tag);
            CREATE TABLE IF NOT EXISTS schema_meta (
                key TEXT PRIMARY KEY NOT NULL,
                value TEXT NOT NULL
            );`
        );

        for (const definition of columnDefinitions()) {
            try {
                this.db.execSync(`ALTER TABLE recipes ADD COLUMN ${definition};`);
            } catch {
                // Already there.
            }
        }

        for (const statement of indexStatements()) {
            this.db.execSync(statement);
        }
    }
```

Add the import at the top of the file:

```ts
import {columnDefinitions, indexStatements} from './recipeIndex';
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- library/__tests__/RecipeDatabase.index.test.ts`
Expected: PASS.

- [ ] **Step 5: Confirm the original suite still passes**

Run: `npm test -- library/__tests__/RecipeDatabase.test.ts`
Expected: PASS, unchanged.

- [ ] **Step 6: Commit**

```bash
git add library/RecipeDatabase.ts library/__tests__/RecipeDatabase.index.test.ts
git commit -m "feat: create the recipe index schema

Additive and re-runnable: the base table is created as it always was, every
index column is nullable with no default, and a duplicate ADD COLUMN is caught
because IF NOT EXISTS is not portable across the SQLite versions Expo ships.

Columns are never dropped. A retired descriptor leaves a nullable orphan that
nothing reads, which costs a few bytes per row; the alternative is a
create-copy-drop-rename rebuild, and that would be the only operation in this
design that touches the blobs."
```

---

## Task 6: The transactional write path

**Files:**
- Modify: `library/RecipeDatabase.ts` (`insertRecipe`, `updateRecipe`, `deleteRecipe`, `deleteAllRecipes`)
- Modify: `library/__tests__/RecipeDatabase.index.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `library/__tests__/RecipeDatabase.index.test.ts`:

```ts
type IndexRow = {
    uuid: string;
    sortName: string | null;
    pourCount: number;
    isTea: number;
};

function indexRows(): IndexRow[] {
    return backing.getAllSync(
        "SELECT uuid, sortName, pourCount, isTea FROM recipes ORDER BY uuid;"
    ) as IndexRow[];
}

function tagRows(): {uuid: string; tag: string}[] {
    return backing.getAllSync(
        "SELECT uuid, tag FROM recipe_tags ORDER BY uuid, tag;"
    ) as {uuid: string; tag: string}[];
}

describe("write path", () => {
    it("indexes a recipe on insert", () => {
        const db = new RecipeDatabase();
        const recipe = new Recipe();
        recipe.name = "Morning";
        db.insertRecipe(recipe);

        expect(indexRows()).toEqual([
            {uuid: recipe.uuid, sortName: "Morning", pourCount: 0, isTea: 0}
        ]);
    });

    it("reindexes on update", () => {
        const db = new RecipeDatabase();
        const recipe = new Recipe();
        recipe.name = "Before";
        db.insertRecipe(recipe);

        recipe.name = "After";
        db.updateRecipe(recipe.uuid, recipe);

        expect(indexRows()[0].sortName).toBe("After");
    });

    it("stores tags on insert", () => {
        const db = new RecipeDatabase();
        const recipe = new Recipe();
        recipe.name = "Tagged";
        recipe.setTags(["morning", "filter"]);
        db.insertRecipe(recipe);

        expect(tagRows().map((r) => r.tag)).toEqual(["filter", "morning"]);
    });

    it("replaces tags on update rather than accumulating them", () => {
        const db = new RecipeDatabase();
        const recipe = new Recipe();
        recipe.name = "Tagged";
        recipe.setTags(["morning"]);
        db.insertRecipe(recipe);

        recipe.setTags(["evening"]);
        db.updateRecipe(recipe.uuid, recipe);

        expect(tagRows().map((r) => r.tag)).toEqual(["evening"]);
    });

    it("removes tags when the recipe is deleted", () => {
        const db = new RecipeDatabase();
        const recipe = new Recipe();
        recipe.name = "Tagged";
        recipe.setTags(["morning"]);
        db.insertRecipe(recipe);

        db.deleteRecipe(recipe.uuid);

        expect(tagRows()).toEqual([]);
    });

    it("removes every tag when the library is emptied", () => {
        const db = new RecipeDatabase();
        for (const name of ["A", "B"]) {
            const recipe = new Recipe();
            recipe.name = name;
            recipe.setTags([name.toLowerCase()]);
            db.insertRecipe(recipe);
        }

        db.deleteAllRecipes();

        expect(tagRows()).toEqual([]);
    });

    it("finds tags case-insensitively", () => {
        // recipe_tags.tag is collated NOCASE so that filtering agrees with
        // Recipe.setTags' case-insensitive dedupe.
        const db = new RecipeDatabase();
        const recipe = new Recipe();
        recipe.name = "Tagged";
        recipe.setTags(["Espresso"]);
        db.insertRecipe(recipe);

        const found = backing.getAllSync(
            "SELECT uuid FROM recipe_tags WHERE tag = ?;", ["ESPRESSO"]
        );
        expect(found).toHaveLength(1);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- library/__tests__/RecipeDatabase.index.test.ts`
Expected: FAIL — index columns are NULL and `recipe_tags` is empty.

- [ ] **Step 3: Implement**

Add a private helper to `library/RecipeDatabase.ts`:

```ts
    /**
     * Write a recipe's blob, its index columns and its tags as one unit.
     *
     * One statement rather than a blob write followed by an index write: a row
     * must never carry an index describing a different recipe than its blob.
     * `INSERT OR REPLACE` covers both insert and update, so the projection is
     * expressed once.
     */
    private writeRow(recipe: Recipe): void {
        const projected = projectRecipe(recipe);
        const names = Object.keys(projected);
        const placeholders = names.map(() => "?").join(", ");

        this.db.runSync(
            `INSERT OR REPLACE INTO recipes (uuid, recipeJSON, ${names.join(", ")})
             VALUES (?, ?, ${placeholders});`,
            [recipe.uuid, JSON.stringify(recipe), ...names.map((name) => projected[name])]
        );

        this.db.runSync("DELETE FROM recipe_tags WHERE uuid = ?;", [recipe.uuid]);
        for (const tag of recipe.tags) {
            this.db.runSync(
                "INSERT OR IGNORE INTO recipe_tags (uuid, tag) VALUES (?, ?);",
                [recipe.uuid, tag]
            );
        }
    }
```

Add the import:

```ts
import {columnDefinitions, indexStatements, projectRecipe} from './recipeIndex';
```

Replace the body of `insertRecipe` after its existing guard and `assignAccent` call:

```ts
    public insertRecipe(recipe: Recipe): void {
        if (recipe && !this.getRecipe(recipe.uuid)) {
            assignAccent(recipe, this.retrieveAllRecipes() ?? []);
            this.db.withTransactionSync(() => this.writeRow(recipe));
        } else {
            throw new Error("DB: Recipe already exists");
        }
    }
```

Replace `updateRecipe`'s else branch the same way:

```ts
    public updateRecipe(uuid: string, updatedRecipe: Recipe): void {
        let recipe = this.getRecipe(uuid);
        if (!recipe) {
            this.insertRecipe(updatedRecipe);
            return;
        }
        assignAccent(updatedRecipe, this.retrieveAllRecipes() ?? []);
        this.db.withTransactionSync(() => {
            if (updatedRecipe.uuid !== uuid) {
                this.db.runSync("DELETE FROM recipes WHERE uuid = ?;", [uuid]);
                this.db.runSync("DELETE FROM recipe_tags WHERE uuid = ?;", [uuid]);
            }
            this.writeRow(updatedRecipe);
        });
    }
```

Extend `deleteRecipe` and `deleteAllRecipes`:

```ts
    public deleteRecipe(uuid: string): void {
        this.db.withTransactionSync(() => {
            this.db.runSync("DELETE FROM recipes WHERE uuid = ?;", [uuid]);
            this.db.runSync("DELETE FROM recipe_tags WHERE uuid = ?;", [uuid]);
        });
    }

    public deleteAllRecipes(): void {
        this.db.withTransactionSync(() => {
            this.db.runSync("DELETE FROM recipes");
            this.db.runSync("DELETE FROM recipe_tags");
        });
    }
```

Note that `replaceAllRecipes` already wraps its work in `withTransactionSync`. SQLite does not support nested transactions, and `expo-sqlite`'s `withTransactionSync` will throw on a nested `BEGIN`. Guard it with a re-entrancy flag:

```ts
    private inTransaction = false;

    /** SQLite has no nested transactions; the outermost one wins. */
    private atomically(task: () => void): void {
        if (this.inTransaction) {
            task();
            return;
        }
        this.inTransaction = true;
        try {
            this.db.withTransactionSync(task);
        } finally {
            this.inTransaction = false;
        }
    }
```

Use `this.atomically(...)` in place of `this.db.withTransactionSync(...)` in `insertRecipe`, `updateRecipe`, `deleteRecipe`, `deleteAllRecipes`, `insertRecipes` and `replaceAllRecipes`.

`try`/`finally` causes a React Compiler bailout, but this is a plain TypeScript class outside React and the rule does not apply.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- library/__tests__/RecipeDatabase.index.test.ts library/__tests__/RecipeDatabase.test.ts`
Expected: PASS both.

The rollback test in `RecipeDatabase.test.ts` ("leaves the original library untouched when an insert throws") is the one most likely to expose a re-entrancy mistake. If it fails, the nesting guard is wrong.

- [ ] **Step 5: Commit**

```bash
git add library/RecipeDatabase.ts library/__tests__/RecipeDatabase.index.test.ts
git commit -m "feat: write blob, index and tags as one unit

A row must never carry an index describing a different recipe than its blob,
so all three go in one transaction. SQLite has no nested transactions and
replaceAllRecipes already opens one, hence the re-entrancy guard."
```

---

## Task 7: Rebuild on schema change

**Files:**
- Modify: `library/RecipeDatabase.ts`
- Modify: `library/__tests__/RecipeDatabase.index.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `library/__tests__/RecipeDatabase.index.test.ts`:

```ts
import {schemaHash} from "@/library/recipeIndex";

function storedHash(): string | null {
    const row = backing.getFirstSync(
        "SELECT value FROM schema_meta WHERE key = 'indexHash';"
    ) as {value: string} | null;
    return row ? row.value : null;
}

describe("rebuild", () => {
    it("records the schema hash on first open", () => {
        new RecipeDatabase();
        expect(storedHash()).toBe(schemaHash());
    });

    it("rebuilds the index when the stored hash is stale", () => {
        const db = new RecipeDatabase();
        const recipe = new Recipe();
        recipe.name = "Morning";
        recipe.setTags(["filter"]);
        db.insertRecipe(recipe);

        // Simulate a descriptor change: blank the index and stale the hash,
        // leaving the blob untouched.
        backing.runSync("UPDATE recipes SET sortName = NULL, pourCount = NULL;");
        backing.runSync("DELETE FROM recipe_tags;");
        backing.runSync("UPDATE schema_meta SET value = 'stale' WHERE key = 'indexHash';");

        new RecipeDatabase();

        expect(indexRows()[0].sortName).toBe("Morning");
        expect(tagRows().map((r) => r.tag)).toEqual(["filter"]);
        expect(storedHash()).toBe(schemaHash());
    });

    it("does not rebuild when the hash matches", () => {
        const db = new RecipeDatabase();
        const recipe = new Recipe();
        recipe.name = "Morning";
        db.insertRecipe(recipe);

        // A value no projection would produce. If it survives the next open,
        // no rebuild ran.
        backing.runSync("UPDATE recipes SET sortName = 'UNTOUCHED';");
        new RecipeDatabase();

        expect(indexRows()[0].sortName).toBe("UNTOUCHED");
    });

    it("never writes the blob during a rebuild", () => {
        const db = new RecipeDatabase();
        const recipe = new Recipe();
        recipe.name = "Morning";
        db.insertRecipe(recipe);
        const before = (backing.getFirstSync(
            "SELECT recipeJSON FROM recipes;"
        ) as {recipeJSON: string}).recipeJSON;

        backing.runSync("UPDATE schema_meta SET value = 'stale' WHERE key = 'indexHash';");
        new RecipeDatabase();

        const after = (backing.getFirstSync(
            "SELECT recipeJSON FROM recipes;"
        ) as {recipeJSON: string}).recipeJSON;
        expect(after).toBe(before);
    });

    it("leaves the hash unstored when a rebuild fails, so the next open retries", () => {
        const db = new RecipeDatabase();
        const recipe = new Recipe();
        recipe.name = "Morning";
        db.insertRecipe(recipe);

        backing.runSync("UPDATE schema_meta SET value = 'stale' WHERE key = 'indexHash';");
        // A blob that Recipe cannot parse at all makes the rebuild throw.
        backing.runSync("UPDATE recipes SET recipeJSON = '{{{';");

        expect(() => new RecipeDatabase()).toThrow();
        expect(storedHash()).toBe("stale");
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- library/__tests__/RecipeDatabase.index.test.ts`
Expected: FAIL — `schema_meta` is never written.

- [ ] **Step 3: Implement**

Add to `library/RecipeDatabase.ts`, and call `this.migrateIndex()` from the constructor immediately after `this.createTable()`:

```ts
    /**
     * Rebuild the index when the descriptor array has changed.
     *
     * The blob is never written here, so the worst a wrong descriptor can do
     * is produce a wrong index over intact data — which the next rebuild
     * corrects. The hash is stored last and inside the same transaction, so a
     * failure leaves it stale and the next open simply tries again: a
     * half-rebuilt index cannot persist.
     */
    private migrateIndex(): void {
        const current = schemaHash();
        const stored = this.db.getFirstSync(
            "SELECT value FROM schema_meta WHERE key = 'indexHash';"
        ) as {value: string} | null;

        if (stored && stored.value === current) return;

        this.atomically(() => {
            const rows = this.db.getAllSync(
                "SELECT uuid, recipeJSON FROM recipes;"
            ) as {uuid: string; recipeJSON: string}[];

            for (const row of rows) {
                this.reindexRow(new Recipe(undefined, row.recipeJSON), row.uuid);
            }

            this.db.runSync(
                `INSERT INTO schema_meta (key, value) VALUES ('indexHash', ?)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
                [current]
            );
        });
    }
```

Extend the import:

```ts
import {columnDefinitions, indexStatements, projectRecipe, schemaHash} from './recipeIndex';
```

Note that a rebuild must **never touch `recipeJSON`**, which is why it calls
`reindexRow` rather than `writeRow`.

An earlier draft of this plan had the rebuild call `writeRow` and argued the
re-serialisation was a feature, on the grounds that a round trip through
`Recipe`'s constructor upgrades a legacy blob in place. Do not do this. A
rebuild is triggered by the descriptor hash changing, which means it runs on app
open, across the entire library at once, with no user action and nothing to undo
it. If `Recipe` fails to round-trip any field in any blob — a field a newer build
wrote and this one does not know, or one the constructor reads but
`JSON.stringify` does not emit — the rebuild destroys it everywhere
simultaneously. `backup`, `offline_backup` and `uid` carry raw card bytes for the
restore feature, and those are exactly the kind of field that is easy to drop and
impossible to reconstruct.

The upgrade-in-place benefit is not worth that, and it was never needed: legacy
blobs are migrated by the constructor on every read already. That is the whole
point of the blob staying authoritative. An in-place upgrade only changes *when*
the migration runs, not whether it happens.

So the rule is narrower than "the index is derived": **exactly one function
writes `recipeJSON`, and the rebuild is not it.**

Add the index-only projection beside `writeRow`:

```ts
    /**
     * Refresh one row's index columns and tags from its `Recipe`, leaving
     * `recipeJSON` untouched.
     *
     * The uuid is passed separately and taken from the row rather than from the
     * parsed recipe, so a blob whose own `uuid` disagrees with its key cannot
     * move the write to a different row.
     */
    private reindexRow(recipe: Recipe, uuid: string): void {
        const projected = projectRecipe(recipe);
        const names = Object.keys(projected);
        const assignments = names.map((name) => `${name} = ?`).join(", ");

        this.db.runSync(
            `UPDATE recipes SET ${assignments} WHERE uuid = ?;`,
            [...names.map((name) => projected[name]), uuid]
        );

        this.db.runSync("DELETE FROM recipe_tags WHERE uuid = ?;", [uuid]);
        for (const tag of recipe.tags) {
            this.db.runSync(
                "INSERT OR IGNORE INTO recipe_tags (uuid, tag) VALUES (?, ?);",
                [uuid, tag]
            );
        }
    }
```

`writeRow` keeps its `INSERT OR REPLACE` and stays the only blob writer, used by
the normal save path. The two share `projectRecipe`, so the column list still
appears once.

The "never writes the blob during a rebuild" test therefore asserts byte
identity for a *legacy* blob as well as a current one, and both must hold. That
is a stronger test than the earlier draft's, and it is the one that catches this
bug if anyone reintroduces it.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- library/__tests__/RecipeDatabase.index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add library/RecipeDatabase.ts library/__tests__/RecipeDatabase.index.test.ts
git commit -m "feat: rebuild the index when the descriptors change

The hash is stored last and inside the rebuild transaction, so a failure
leaves it stale and the next open retries. A half-rebuilt index cannot
persist, and the blob is never written."
```

---

## Task 8: Migration against a genuinely old database

The test this whole design exists to pass. See design §5.1.

**Files:**
- Create: `library/__tests__/RecipeDatabase.migration.test.ts`

- [ ] **Step 1: Write the test**

```ts
import {createTestDatabase, type FakeSQLiteDatabase} from "@/test-utils/sqlite";

let backing: FakeSQLiteDatabase;

jest.mock("expo-sqlite", () => ({
    openDatabaseSync: () => backing
}));

import RecipeDatabase from "@/library/RecipeDatabase";
import Recipe from "@/library/Recipe";

/** The exact DDL RecipeDatabase used before the index existed. */
function buildLegacyDatabase(blobs: string[]): void {
    backing = createTestDatabase();
    backing.execSync(
        "CREATE TABLE IF NOT EXISTS recipes (uuid TEXT PRIMARY KEY NOT NULL,recipeJSON TEXT);"
    );
    for (const blob of blobs) {
        backing.runSync("INSERT INTO recipes (uuid, recipeJSON) VALUES (?, ?);", [
            JSON.parse(blob).uuid,
            blob
        ]);
    }
}

/**
 * A recipe as an older version of the app would have written it: a legacy tea
 * cup byte, pours stored as JSON strings inside the array, `title` instead of
 * `name`, and no createdAt, source, accentIndex or tags.
 */
function legacyBlob(uuid: string, title: string, cupType: number): string {
    return JSON.stringify({
        uuid,
        title,
        cupType,
        ratio: 16,
        dosage: 15,
        grindSize: 60,
        grindRPM: 120,
        pours: [JSON.stringify({pourNumber: 0, volume: 120, temperature: 93})]
    });
}

describe("migrating a pre-index database", () => {
    it("indexes every existing recipe on first open", () => {
        buildLegacyDatabase([
            legacyBlob("uuid-a", "Legacy Coffee", 0),
            legacyBlob("uuid-b", "Legacy Tea", 0x13)
        ]);

        new RecipeDatabase();

        const rows = backing.getAllSync(
            "SELECT uuid, sortName, isTea, pourCount, totalVolume FROM recipes ORDER BY uuid;"
        ) as {uuid: string; sortName: string; isTea: number; pourCount: number; totalVolume: number}[];

        expect(rows).toEqual([
            {uuid: "uuid-a", sortName: "Legacy Coffee", isTea: 0, pourCount: 1, totalVolume: 120},
            {uuid: "uuid-b", sortName: "Legacy Tea", isTea: 1, pourCount: 1, totalVolume: 120}
        ]);
    });

    it("keeps every recipe readable and loses none", () => {
        buildLegacyDatabase([
            legacyBlob("uuid-a", "Legacy Coffee", 0),
            legacyBlob("uuid-b", "Legacy Tea", 0x13)
        ]);

        const db = new RecipeDatabase();
        const recipes = db.retrieveAllRecipes() ?? [];

        expect(recipes).toHaveLength(2);
        expect(recipes.map((r) => r.displayName()).sort())
            .toEqual(["Legacy Coffee", "Legacy Tea"]);
    });

    it("preserves the legacy migrations Recipe performs", () => {
        // title -> name, the 0x13 tea byte, and pours-as-strings all live in
        // the Recipe constructor. The index must not bypass or break them.
        buildLegacyDatabase([legacyBlob("uuid-b", "Legacy Tea", 0x13)]);

        const recipe = new RecipeDatabase().getRecipe("uuid-b");

        expect(recipe).not.toBeNull();
        expect(recipe!.name).toBe("Legacy Tea");
        expect(recipe!.isTea()).toBe(true);
        expect(recipe!.pours).toHaveLength(1);
        expect(recipe!.pours[0].volume).toBe(120);
    });

    it("gives every legacy recipe an empty tag set", () => {
        buildLegacyDatabase([legacyBlob("uuid-a", "Legacy Coffee", 0)]);

        new RecipeDatabase();

        expect(backing.getAllSync("SELECT * FROM recipe_tags;")).toEqual([]);
        expect(new RecipeDatabase().getRecipe("uuid-a")!.tags).toEqual([]);
    });

    it("is safe to open repeatedly", () => {
        buildLegacyDatabase([legacyBlob("uuid-a", "Legacy Coffee", 0)]);

        new RecipeDatabase();
        new RecipeDatabase();
        const db = new RecipeDatabase();

        expect(db.retrieveAllRecipes()).toHaveLength(1);
        expect(backing.getAllSync("SELECT * FROM recipe_tags;")).toEqual([]);
    });
});
```

- [ ] **Step 2: Run it**

Run: `npm test -- library/__tests__/RecipeDatabase.migration.test.ts`
Expected: PASS. Everything it needs was built in Tasks 4–7.

If it fails, do not adjust the test to match the behaviour. This is the characterisation test for the migration; a disagreement means the implementation is wrong.

- [ ] **Step 3: Commit**

```bash
git add library/__tests__/RecipeDatabase.migration.test.ts
git commit -m "test: index a genuinely pre-index database

Builds the exact old DDL and real legacy blobs -- the 0x13 tea byte,
pours-as-strings, title before it was name -- and only then opens
RecipeDatabase. This is the test the whole design exists to pass."
```

---

## Task 9: Accent assignment from the index

`insertRecipe` parses the entire library to choose a colour, and `insertRecipes`
loops that. See design §3.7.

**Read this before writing any code.** `assignAccent` is deliberately
**idempotent**: it delegates to `reassignIfCrossed`, which returns an existing
valid index unchanged so that calling it on the way into the editor and again
on save does not move the colour. That is a behaviour the user asked for
explicitly. It reassigns only when a recipe crosses between coffee and tea,
which invalidates the old index.

`accentsInUseAmong` also **excludes the recipe from its own tally**, or it would
count as competition for the colour it already holds.

So this task does **not** change `assignAccent`. It leaves that function exactly
as it is for the home screen, which passes a library it already holds in memory,
and gives `RecipeDatabase` a query-backed path to the same two helpers. Both
already exported.

**Files:**
- Modify: `library/RecipeDatabase.ts`
- Modify: `library/__tests__/RecipeDatabase.index.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `library/__tests__/RecipeDatabase.index.test.ts`:

```ts
describe("accent assignment", () => {
    it("gives successive recipes different accents", () => {
        const db = new RecipeDatabase();
        const first = new Recipe();
        first.name = "A";
        const second = new Recipe();
        second.name = "B";

        db.insertRecipe(first);
        db.insertRecipe(second);

        const accents = (db.retrieveAllRecipes() ?? []).map((r) => r.accentIndex);
        expect(new Set(accents).size).toBe(2);
    });

    it("counts only recipes in the same half of the palette", () => {
        const db = new RecipeDatabase();
        const coffee = new Recipe();
        coffee.name = "Coffee";
        const tea = new Recipe();
        tea.name = "Tea";
        tea.cupType = 0x13;

        db.insertRecipe(coffee);
        db.insertRecipe(tea);

        // Separate palettes, so both take index 0.
        expect(db.getRecipe(coffee.uuid)!.accentIndex).toBe(0);
        expect(db.getRecipe(tea.uuid)!.accentIndex).toBe(0);
    });

    it("does not move an accent the recipe already holds", () => {
        // The colour the user edits under is the colour the library row gets.
        // A save must not renumber it -- and the recipe must not be counted as
        // competition for the colour it is already using.
        const db = new RecipeDatabase();
        const recipe = new Recipe();
        recipe.name = "Settled";
        db.insertRecipe(recipe);
        const original = db.getRecipe(recipe.uuid)!.accentIndex;

        recipe.name = "Renamed";
        db.updateRecipe(recipe.uuid, recipe);

        expect(db.getRecipe(recipe.uuid)!.accentIndex).toBe(original);
    });

    it("reassigns when a recipe crosses between coffee and tea", () => {
        // Crossing is what makes the old index name a colour in the wrong
        // half, so moving it then is correct rather than a broken promise.
        const db = new RecipeDatabase();
        const filler = new Recipe();
        filler.name = "Filler";
        filler.cupType = 0x13;
        db.insertRecipe(filler);

        const crossing = new Recipe();
        crossing.name = "Crossing";
        db.insertRecipe(crossing);
        crossing.accentIndex = 999; // invalid for either half

        crossing.cupType = 0x13;
        db.updateRecipe(crossing.uuid, crossing);

        const settled = db.getRecipe(crossing.uuid)!.accentIndex!;
        expect(settled).toBeGreaterThanOrEqual(0);
        expect(settled).not.toBe(999);
    });
});
```

- [ ] **Step 2: Run to verify the new cases pass or fail meaningfully**

Run: `npm test -- library/__tests__/RecipeDatabase.index.test.ts`
Expected: PASS. These describe behaviour that already exists — they are
characterisation tests, written first so that Step 4 cannot change it silently.

If any of them fails now, stop: the behaviour is not what this task assumes and
the optimisation must be redesigned rather than forced.

- [ ] **Step 3: Commit the characterisation**

```bash
git add library/__tests__/RecipeDatabase.index.test.ts
git commit -m "test: pin accent behaviour before optimising the lookup"
```

- [ ] **Step 4: Implement the query-backed lookup**

In `library/RecipeDatabase.ts`, add:

```ts
    /**
     * The accent indices already taken in a recipe's half of the palette.
     *
     * The SQL half of `accentsInUseAmong`. `isTea` is a column precisely so
     * this does not reimplement `Recipe.isTea()`, which owns the 0x13/0x23
     * legacy normalisations -- `accent.ts` warns that a second copy of that
     * predicate would silently miss the next such fix.
     *
     * The recipe is excluded from its own tally, or it would count as
     * competition for the colour it already holds. Repeats are kept: a
     * repeated index is what makes one colour more used than another.
     */
    private accentsInUse(recipe: Recipe): number[] {
        const rows = this.db.getAllSync(
            `SELECT accentIndex FROM recipes
             WHERE isTea = ? AND uuid != ? AND accentIndex IS NOT NULL;`,
            [recipe.isTea() ? 1 : 0, recipe.uuid]
        ) as {accentIndex: number}[];
        return rows.map((row) => row.accentIndex);
    }
```

Replace the call site in `insertRecipe`:

```ts
            recipe.accentIndex = reassignIfCrossed(recipe, this.accentsInUse(recipe));
```

and in `updateRecipe`:

```ts
        updatedRecipe.accentIndex =
            reassignIfCrossed(updatedRecipe, this.accentsInUse(updatedRecipe));
```

Change the import from `./accent`:

```ts
import {reassignIfCrossed} from './accent';
```

`assignAccent` is now unused by this file. **Do not delete it** — the home screen
calls it with a library it already holds in memory, which is the case its
`others: Recipe[]` signature exists to serve.

- [ ] **Step 5: Run to verify nothing moved**

Run: `npm test -- library/__tests__/accent.test.ts library/__tests__/RecipeDatabase.index.test.ts library/__tests__/RecipeDatabase.test.ts`
Expected: PASS all three, with the Step 1 tests still passing. `accent.test.ts`
must be **unchanged** — this task does not alter `accent.ts` at all.

- [ ] **Step 6: Confirm the other caller still exists**

Run: `grep -rn "assignAccent" --include=*.ts --include=*.tsx app/ hooks/ components/ library/`
Expected: at least one caller outside `RecipeDatabase.ts`. If there is none,
`assignAccent` has become dead code — report that rather than deleting it, since
its removal is a separate decision.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add library/RecipeDatabase.ts
git commit -m "perf: choose an accent from the index rather than the whole library

insertRecipe parsed every recipe in the database to pick a colour, and
insertRecipes looped it, so restoring a hundred recipes built thousands of
Recipe objects. One query now.

assignAccent is deliberately untouched: it is idempotent by way of
reassignIfCrossed, so a save does not move a colour, and the home screen
passes a library it already holds. Only the database's lookup changed.

isTea is its own column so the query does not reimplement Recipe.isTea(),
which owns the 0x13/0x23 legacy normalisations."
```

---

## Task 10: Measure the rebuild

The design promises a number rather than an assurance. See design §3.8.

**Files:**
- Modify: `library/__tests__/RecipeDatabase.migration.test.ts`

- [ ] **Step 1: Write the measurement**

Append to `library/__tests__/RecipeDatabase.migration.test.ts`:

```ts
describe("rebuild cost", () => {
    it("indexes a large library within a sane time", () => {
        const blobs = Array.from({length: 500}, (_, i) =>
            legacyBlob(`uuid-${i}`, `Recipe ${i}`, 0)
        );
        buildLegacyDatabase(blobs);

        const started = Date.now();
        new RecipeDatabase();
        const elapsed = Date.now() - started;

        // eslint-disable-next-line no-console
        // Not console.log: jest.setup.js replaces it with a mock, so the line
        // would never reach the terminal you are meant to read it from.
        process.stdout.write(`rebuild of 500 recipes: ${elapsed}ms\n`);

        // A ceiling, not a target. expo-sqlite's sync API runs on the JS
        // thread, so this blocks; it happens once per schema change. If this
        // ever fails, the specified fallback is a lazy per-row rebuild, with
        // the hash written only once every row has been visited.
        expect(elapsed).toBeLessThan(3000);

        expect(backing.getAllSync(
            "SELECT COUNT(*) AS n FROM recipes WHERE sortName IS NOT NULL;"
        )).toEqual([{n: 500}]);
    });
});
```

- [ ] **Step 2: Run and record the number**

Run: `npm test -- library/__tests__/RecipeDatabase.migration.test.ts 2>&1 | grep "rebuild of 500"`

Write the observed figure into this plan below, and into the design doc's §3.8:

> Measured: **14 ms** for 500 recipes, on `node:sqlite` under Jest, stable
> across three runs. Well inside the 500 ms figure that would have called for
> the lazy fallback, so the fallback was not built.

Note that the plan's `console.log` could never have printed: `jest.setup.js`
replaces `console.log` with a mock. The test writes to `process.stdout`
instead.

Note that a real device will be slower than a development machine. If the figure is above roughly 500 ms here, raise it with the user before proceeding — the lazy fallback may be needed.

- [ ] **Step 3: Commit**

```bash
git add library/__tests__/RecipeDatabase.migration.test.ts docs/superpowers/specs/2026-09-14-recipe-index-design.md
git commit -m "test: measure the index rebuild over 500 recipes"
```

---

## Task 11: Full gates and device verification

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all suites pass. Compare the suite and test counts against the pre-branch baseline (166 suites / 2680 tests at 1.6.0) — the count should have risen only.

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors; the six pre-existing `exhaustive-deps` warnings are expected and must not have grown.

Observed: 0 errors, **8 warnings**, which is exactly `main`'s count (all
`no-require-imports` in test files, not `exhaustive-deps` as the plan guessed).
The branch briefly reached 9: the new `RecipeDatabase.test.ts` mock factory used
an inline `require`. Replaced with an import aliased to `mockCreateTestDatabase`
— Jest permits a hoisted factory to close over a binding whose name begins with
`mock`, which is the same idiom already used for `mockBacking`.

Suite counts: **171 suites / 2750 tests**, up from the 166 / 2680 baseline.
Risen only, as required. `npx expo-doctor`: 21/21 checks passed.

- [ ] **Step 3: Dependency health**

Run: `npx expo-doctor`
Expected: pass. CI treats this as a hard failure.

- [ ] **Step 4: Sabotage-check the load-bearing tests**

For each of these, revert the implementation, confirm the test fails, then restore:

| Test | Sabotage |
|---|---|
| "indexes every existing recipe on first open" | Make `migrateIndex` return early always |
| "is idempotent across opens" | Remove the `try/catch` around `ADD COLUMN` |
| "leaves the hash unstored when a rebuild fails" | Store the hash before the row loop |
| "never writes the blob during a rebuild" | Nothing to sabotage — confirm by inspection that `writeRow` is the only blob writer |
| "ignores the -1 sentinel" | Drop the `filter` in `temperatures()` |
| "takes totalVolume from the pours" | Swap to `getTotalVolume()` |
| "asks the recipe whether it is tea" | Swap to `r.cupType === 4 ? 1 : 0` |
| "keeps the recipe and drops the tags when malformed" | Make the `tags` validator return `false` |

A test that still passes after its sabotage is passing for the wrong reason and must be rewritten. The `LivingMark` regression during 1.6.0 is why this step is not optional.

**Results.** Seven of the eight sabotages were detected exactly as written. Two
findings:

- **"leaves the hash unstored when a rebuild fails" survived its sabotage.**
  Reordering the hash write ahead of the loop did not fail it, and neither did
  removing the rebuild's transaction. The two are *independent* defences —
  ordering alone survives a lost transaction, the transaction alone survives a
  reordering — so only removing **both** fails the test, which was confirmed.
  The test is sound and the guarantee is pinned; the plan's single-mutation
  sabotage was simply too weak to show it. `migrateIndex`'s comment now says
  so, so a future reader does not delete one defence believing it redundant.
- **"never writes the blob during a rebuild"** was confirmed by inspection as
  the plan directs: `recipeJSON` is named in exactly one write in
  `RecipeDatabase.ts`, the `INSERT OR REPLACE` inside `writeRow`. Every other
  occurrence is a `SELECT` or the `CREATE TABLE`. Task 7 additionally pinned it
  by mutation with a legacy blob.

The remaining six (`migrateIndex` early return, dropped `ADD COLUMN` try/catch,
dropped `-1` filter, `getTotalVolume()` swap, `cupType === 4` swap, `tags`
validator returning `false`) each failed their named test and nothing else.

- [ ] **Step 5: Verify on the device**

This is the point of shipping the schema before anything depends on it.

```bash
npm run ios -- --device "iPhone14"
```

On the phone, with an existing library already installed:

1. Confirm every recipe is still present and correctly named.
2. Confirm accents are unchanged — `accentIndex` was already persisted, so no card should change colour.
3. Open a recipe, edit it, save, confirm it persists.
4. Read a card and confirm the new recipe appears with a fresh accent.
5. Export a backup, wipe the library, restore it, confirm everything returns.

Nothing in this release is visible, so the test is that **nothing changed**.

- [ ] **Step 6: Commit any fixes, then finish the branch**

Use the `superpowers:finishing-a-development-branch` skill. Merge to `main`, but **do not cut a public release** — the design holds this back until #72 gives it a reason to exist.

---

## Self-review notes

Checked against `docs/superpowers/specs/2026-09-14-recipe-index-design.md`:

| Spec section | Task |
|---|---|
| §1 the rule, blob authoritative | 6, 7 (blob never written in rebuild) |
| §2.1 descriptor array | 4 |
| §2.2 sortName NULL | 4 |
| §2.3 automatic tags unstored | n/a — no storage by construction |
| §2.4 COLLATE NOCASE | 4 (sortName), 5 + 6 (recipe_tags) |
| §2.5 totalVolume from pours | 4 |
| §2.6 -1 sentinel | 4 |
| §2.7 isTea column | 4, 9 |
| §3.1 open sequence | 5 |
| §3.2 rebuild | 7 |
| §3.3 hash and revision | 4 |
| §3.4 no column drops | 5 (orphan tolerance test) |
| §3.5 transactional write | 6 |
| §3.6 compatibility | 1 (unchanged assertions), 6 |
| §3.7 accent | 9 (accent.ts itself unchanged) |
| §3.8 performance | 10 |
| §4.1 tags on the model | 2 |
| §4.2 join table | 5, 6 |
| §4.3 sanitise not reject | 3 |
| §4.4 BACKUP_VERSION unchanged | 3 (explicit check) |
| §4.5 share links unaffected | 2 (shareLink suite run) |
| §5.x verification | 5–8, 11 |
| §6 release | 11 |

**Open risk carried into execution:** Task 6's re-entrancy guard assumes `expo-sqlite`'s `withTransactionSync` throws on nesting. If the real module tolerates it, the guard is harmless; if `node:sqlite` and `expo-sqlite` differ here, the difference shows up only on device, so Step 5 of Task 11 exercises a restore deliberately.

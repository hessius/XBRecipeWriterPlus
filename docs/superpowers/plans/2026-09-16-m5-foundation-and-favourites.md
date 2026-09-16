# M5 Foundation and Favourites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the recipe index on `main`, add the two authored fields M5's library needs (`description`, `favourite`), and ship favouriting end to end: a star on the card, a tile in the swipe tray, and a column to sort by later.

**Architecture:** Everything here is additive and nothing is visible until the last three tasks. The JSON blob in `recipes.recipeJSON` stays the only source of truth; `favourite` and `description` are ordinary `Recipe` fields read forgivingly by the constructor, carried through backup as droppable fields, and projected into index columns that any future query can filter on. The favourite's two entry points are the swipe tray and, later, the recipe screen header; only the tray exists yet.

**Tech Stack:** TypeScript, `expo-sqlite` (sync API), Tamagui, Jest with `@testing-library/react-native` v14, and the `node:sqlite` test harness the recipe index brings with it.

**Design docs:**
- `docs/superpowers/specs/2026-09-16-library-shelves-design.md` (M5)
- `docs/superpowers/specs/2026-09-14-recipe-index-design.md` (the index)

**Branch:** `m5-foundation`, off `main`. Task 1 merges `recipe-index` into it.

---

## Scope, and why it is not the design's phase 2

The design's shipping order puts description and favourite together as "the
row". They are separated here, because they do not become useful at the same
moment.

**A favourite is complete the day it ships.** The user marks a recipe from the
swipe tray and sees a star on the card. Every part of that exists today or is
built below.

**A description has nowhere to be typed.** The design puts the NOTE field on the
ABOUT deck (§"A third deck"), and that deck is phase 5. Shipping a rendered
description with no way to author one would be a dead field, and building a
second temporary entry point in the brew deck would be work done only to be
deleted.

So this plan stores, validates and indexes `description` — the foundation work,
which phase 5 must not have to revisit — and leaves its rendering and its editor
to the recipe screen plan. The card's line budget rule (§"Equal height comes from
an equal line budget") ships there too, because it has no observable effect until
a description exists.

**Also deferred, deliberately:** the evidence suffix on the stats row. It reads
brew aggregates including an average rating, and ratings do not exist until #99.
That is the design's own split between the two registers, authored and derived,
and this plan takes only the authored one.

**What is in scope:** Tasks 1 to 8 below. What ships is a library where recipes
can be favourited and the database can answer questions about them.

---

## Before you start

Read both design documents. This plan implements them and does not repeat their
reasoning.

Repository rules that bite here specifically:

- **Colour comes from `constants/colors.ts`.** No hex literals, no named CSS
  colours, in `app/` or `components/`.
- **The React Compiler is on.** Do not write `useMemo` or `useCallback`. Do not
  read whole `props` inside a hook.
- **Mutate a `Recipe` in place and bump a key counter** rather than cloning into
  state.
- **Component tests await `render`, `fireEvent` and `renderHook`**, and use
  `renderWithProviders` from `test-utils/render.tsx`. RNTL v14 has removed
  `UNSAFE_getAllByType` and `root.findAllByType`: assert on text, test IDs and
  accessible labels.
- **One `render` per `it`.** Never call `unmount()`; a manual unmount makes every
  later render in the file unfindable.
- **No em dashes in user-facing copy**, and dashes avoided generally.
- Run `npm run typecheck`, `npm run lint` and `npm test` before each commit.
  `npx expo-doctor` is a hard CI gate, so if it fails on a patch mismatch that
  you did not cause, bump the pin in `package.json` by hand: `npx expo install
  --fix` is refused by npm 12 with `EALLOWSCRIPTS`.

---

### Task 1: Land the recipe index — DONE

Merged as #116 (`03fa592`). Five review findings were fixed before it landed;
all five were data-loss paths nothing would have reported, and the two worth
carrying forward are recorded under Task 2 below.

The index is built. It is 28 commits on `origin/recipe-index`, branched from
`3e1b956` on 14 September, and it was never opened as a PR. This task rebases it
onto `main` and merges it. **Do not reimplement it from its plan.**

`docs/superpowers/plans/2026-09-14-recipe-index.md` is the record of how that
code got its shape. Read its header before starting. Where the code and the plan
text disagree, the code is right.

**Files:** no new files. The rebase touches nine that both sides changed.

- [ ] **Step 1: Make a worktree outside the repository**

Worktrees inside the repo root get scanned by eslint and jest, which doubles the
suite and exhausts the heap.

```bash
cd /Users/jesperhessius/Dev/XBRecipeWriterPlus
git fetch origin
git worktree add ../XBRW-recipe-index recipe-index
cd ../XBRW-recipe-index
npm install --ignore-scripts
```

- [ ] **Step 2: Record the green baseline before touching anything**

Run: `npm test 2>&1 | tail -5`
Expected: all suites pass. Write the suite and test counts down. If this is not
green before the rebase, stop: you cannot tell a conflict you resolved badly from
a test that was already failing.

- [ ] **Step 3: Rebase onto main**

```bash
git rebase origin/main
```

Expect conflicts in nine files. Three carry the work:

- `library/Recipe.ts` — M6 added `cloudId`, `cloudFingerprint`, `sharedBy`,
  `sharedByAvatar`, `imageURL`. The branch added `tags`. **Take both.** They are
  independent fields with independent constructor reads.
- `library/RecipeDatabase.ts` — the branch rewrites the schema and the write
  path. Take the branch's version wholesale, then re-apply anything M6 added on
  top of it.
- `library/backup.ts` — M6 added `DROPPABLE_RECIPE_FIELDS`; the branch added tag
  sanitising. **Take both.**

The other six are the branch's own incidental sheet fixes:
`app/settings.tsx`, `app/__tests__/settings.test.tsx`, `components/XbrwSheet.tsx`,
`components/__tests__/XbrwSheet.test.tsx`, `components/DeleteAllSheet.tsx`, and
`hooks/__tests__/useRecipeLibrary.realDb.test.ts`. **Check whether `main` already
fixed each one** before resolving by hand. Three of the branch's commits are
sheet fixes (`27f7ca5`, `976d772`, `7c8780f`); if `main` has since fixed the same
bug differently, drop the branch's version rather than merging two fixes for one
bug.

- [ ] **Step 4: Run the full suite**

Run: `npm test 2>&1 | tail -5`
Expected: every suite passes, and the count is at least the baseline from Step 2
plus `main`'s own additions. A *lower* count than the baseline means a conflict
resolution silently dropped a test file.

- [ ] **Step 5: Verify the migration against a real pre-index database**

The branch has a test for exactly this. Run it by name so you see it pass rather
than inferring it from a total:

Run: `npx jest library/__tests__/RecipeDatabase.migration.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify the rebuild leaves the blob alone**

This is the invariant the whole design rests on, and it is the one a bad conflict
resolution in `RecipeDatabase.ts` would break silently.

Run: `npx jest library/__tests__/RecipeDatabase.index.test.ts -t "blob"`
Expected: PASS. Then confirm by inspection that `recipeJSON` is named in exactly
one write in `library/RecipeDatabase.ts` — the `INSERT OR REPLACE` inside
`writeRow` — and that `reindexRow` uses `UPDATE` and does not name it. Every
other occurrence must be a `SELECT` or the `CREATE TABLE`.

- [ ] **Step 7: Typecheck, lint and doctor**

```bash
npm run typecheck && npm run lint && npx expo-doctor
```
Expected: no type errors; lint no worse than `main`; 21/21 doctor checks.

- [ ] **Step 8: Push and open the PR**

```bash
git push --force-with-lease origin recipe-index
gh pr create -R hessius/XBRecipeWriterPlus --base main --head recipe-index \
  --title "M5 · The recipe index" \
  --body "Rebase of the 28-commit recipe-index branch onto main. See docs/superpowers/plans/2026-09-14-recipe-index.md."
```

Wait for CI. Merge with `--squash` once green.

- [ ] **Step 9: Branch for the rest of this plan**

```bash
cd /Users/jesperhessius/Dev/XBRecipeWriterPlus
git worktree remove ../XBRW-recipe-index
git fetch origin
git worktree add ../XBRW-m5-foundation -b m5-foundation origin/main
cd ../XBRW-m5-foundation
npm install --ignore-scripts
```

Every task below runs in this worktree.

---

### Task 2: `favourite` and `description` on `Recipe`

**Files:**
- Modify: `library/Recipe.ts`
- Test: `library/__tests__/Recipe.authored.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `library/__tests__/Recipe.authored.test.ts`:

```ts
import Recipe from "@/library/Recipe";

/**
 * A recipe with enough shape for the constructor to parse. `pours` is the one
 * key it dereferences without guarding, so it cannot be omitted.
 */
function json(extra: Record<string, unknown> = {}): string {
    return JSON.stringify({pours: [], ratio: 16, dosage: 18, ...extra});
}

describe("authored fields", () => {
    it("defaults to not favourite and no description", () => {
        const recipe = new Recipe(undefined, json());

        expect(recipe.favourite).toBe(false);
        expect(recipe.description).toBe("");
    });

    it("reads both when present", () => {
        const recipe = new Recipe(undefined, json({
            favourite:   true,
            description: "Bright and floral, works cold"
        }));

        expect(recipe.favourite).toBe(true);
        expect(recipe.description).toBe("Bright and floral, works cold");
    });

    it("ignores a value of the wrong type rather than throwing", () => {
        const recipe = new Recipe(undefined, json({
            favourite:   "yes",
            description: 42
        }));

        expect(recipe.favourite).toBe(false);
        expect(recipe.description).toBe("");
    });

    it("round-trips through JSON", () => {
        const first = new Recipe(undefined, json({
            favourite:   true,
            description: "Sunday morning"
        }));
        const second = new Recipe(undefined, JSON.stringify(first));

        expect(second.favourite).toBe(true);
        expect(second.description).toBe("Sunday morning");
    });

    it("takes no card bytes", () => {
        const plain = new Recipe(undefined, json());
        const marked = new Recipe(undefined, json({
            favourite:   true,
            description: "Sunday morning"
        }));

        expect(marked.getData(new Array(32).fill(0)))
            .toEqual(plain.getData(new Array(32).fill(0)));
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest library/__tests__/Recipe.authored.test.ts`
Expected: FAIL. The first test reports `undefined` for both fields.

- [ ] **Step 3: Add the fields**

In `library/Recipe.ts`, beside `imageURL`:

```ts
    /**
     * The authored one line answering "why is this recipe", capped at
     * `MAX_DESCRIPTION` where it is typed rather than clipped here.
     *
     * Defaulted to the empty string rather than left undefined, because the
     * library row asks `description.length` on every recipe it draws and an
     * absent one would crash the list rather than read as unwritten. That is the
     * same reasoning as `xid` above.
     *
     * Metadata only: not in `getData`/`parseData`, no card bytes, not in the CRC.
     */
    public description: string = "";
    /**
     * Authored intent, not evidence. Kept off the card for the same reason as
     * the description, and kept off the brew record because #95 is explicit that
     * a brew is an observation and a recipe is an inference.
     */
    public favourite: boolean = false;
```

And in the `if (json)` branch, beside the `imageURL` read:

```ts
            // Read the forgiving way the three above are: a wrong type means the
            // default, not a throw. Every recipe stored before M5 is this case.
            if (typeof jsonRecipe.description === "string") {
                this.description = jsonRecipe.description;
            }
            if (typeof jsonRecipe.favourite === "boolean") {
                this.favourite = jsonRecipe.favourite;
            }
```

Add the cap beside the other limits at the top of the file:

```ts
/**
 * The description's ceiling, in characters.
 *
 * Enforced in the editor with a live counter, not here. A limit a user can see
 * is a limit; a limit they discover by having their words vanish is a bug. This
 * constant is what the editor and the backup validator both read, so the two
 * cannot drift.
 */
export const MAX_DESCRIPTION = 60;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest library/__tests__/Recipe.authored.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Run the existing Recipe suite**

Run: `npx jest library/__tests__/Recipe`
Expected: PASS. The card-format characterisation tests must be untouched. If any
byte expectation changed, you have added a field to `getData` by mistake.

- [ ] **Step 6: Carry both fields across a cloud refresh**

Added to this task after #116, and not optional. `buildImportPlan` replaces a
local recipe with a whole freshly mapped one, so every field the cloud cannot
supply starts empty on it and is written over the local copy. The review caught
this for `tags`; `favourite` and `description` have it the moment they exist,
and the failure is silent — the recipe keeps its name, its uuid and everything
the screen shows.

In `library/cloud/importPlan.ts`, in the `if (replacing !== undefined)` block
beside `recipe.setTags(replacing.tags)`:

```ts
            recipe.favourite = replacing.favourite;
            recipe.description = replacing.description;
```

Safe by construction: `library/cloud/fingerprint.ts` covers brew content only,
so carrying an authored field cannot make a recipe read as edited. Pin that with
a second test as well as the preservation one.

**The general rule, for every later task and every later field:** anything the
user authors and the cloud cannot supply belongs in that block. Task 4's index
columns are derived and need nothing here; a new *stored* field does.

- [ ] **Step 7: Commit**

```bash
git add library/Recipe.ts library/__tests__/Recipe.authored.test.ts \
        library/cloud/importPlan.ts library/cloud/__tests__/importPlan.test.ts
git commit -m "feat: a description and a favourite on the recipe"
```

---

### Task 3: Carry both fields through backup

`library/backup.ts` is a trust boundary. The `Recipe` constructor is deliberately
forgiving so it can migrate its own old shapes, which makes it useless as a
validator, and a bad recipe's next stop is a genuine card.

Both fields are **droppable**, not load-bearing: a malformed description means a
recipe with no description, which is a recipe. Rejecting it would lose a whole
recipe over a field that affects nothing.

**Files:**
- Modify: `library/backup.ts:256-260`
- Test: `library/__tests__/backup.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `library/__tests__/backup.test.ts`, following the file's existing
helpers for building a payload:

```ts
describe("authored fields through backup", () => {
    it("round-trips a description and a favourite", () => {
        const recipe = new Recipe(undefined, JSON.stringify({
            pours: [], ratio: 16, dosage: 18,
            favourite: true, description: "Sunday morning"
        }));

        const parsed = parseBackup(JSON.stringify(buildBackup([recipe], {})));

        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.payload.recipes[0].favourite).toBe(true);
        expect(parsed.payload.recipes[0].description).toBe("Sunday morning");
    });

    it("drops an over-long description and keeps the recipe", () => {
        const file = backupFileWithRecipeFields({
            description: "x".repeat(MAX_DESCRIPTION + 1)
        });

        const parsed = parseBackup(file);

        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.payload.recipes).toHaveLength(1);
        expect(parsed.payload.recipes[0].description).toBe("");
    });

    it("drops a non-boolean favourite and keeps the recipe", () => {
        const file = backupFileWithRecipeFields({favourite: "yes"});

        const parsed = parseBackup(file);

        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.payload.recipes).toHaveLength(1);
        expect(parsed.payload.recipes[0].favourite).toBe(false);
    });
});
```

Write `backupFileWithRecipeFields` beside the file's other helpers if one of the
same shape is not already there:

```ts
/**
 * A backup file whose single recipe carries the given extra keys verbatim,
 * bypassing `Recipe` so a value the model would never produce can be tested.
 */
function backupFileWithRecipeFields(extra: Record<string, unknown>): string {
    const valid = JSON.parse(JSON.stringify(
        buildBackup([new Recipe(undefined,
            JSON.stringify({pours: [], ratio: 16, dosage: 18}))], {})
    ));
    valid.recipes[0] = {...valid.recipes[0], ...extra};
    return JSON.stringify(valid);
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest library/__tests__/backup.test.ts -t "authored fields"`
Expected: FAIL. The over-long description survives, because nothing yet checks it.

- [ ] **Step 3: Add the validators**

In `library/backup.ts`, extend `DROPPABLE_RECIPE_FIELDS`:

```ts
const DROPPABLE_RECIPE_FIELDS: Record<string, (value: unknown) => boolean> = {
    sharedBy:       (v) => typeof v === "string" && v.length <= MAX_SHARED_BY,
    sharedByAvatar: isHttpsUrl,
    imageURL:       isHttpsUrl,
    // Both authored, both droppable: a malformed one costs a note or a star,
    // and dropping the whole recipe would cost the recipe.
    description:    (v) => typeof v === "string" && v.length <= MAX_DESCRIPTION,
    favourite:      (v) => typeof v === "boolean"
};
```

Import the cap:

```ts
import Recipe, {MAX_DESCRIPTION} from "@/library/Recipe";
```

Adjust that import to the file's existing form rather than adding a second one.

- [ ] **Step 4: Run the tests**

Run: `npx jest library/__tests__/backup.test.ts`
Expected: PASS, including every pre-existing test in the file.

- [ ] **Step 5: Commit**

```bash
git add library/backup.ts library/__tests__/backup.test.ts
git commit -m "feat: carry the description and favourite through backups"
```

---

### Task 4: Index columns

Four descriptors, one revision bump. `xid` and `sharedBy` serve shelves that
arrive later; they are added now because adding a descriptor forces a rebuild of
every install, and doing that once is better than four times.

**Files:**
- Modify: `library/recipeIndex.ts`
- Test: `library/__tests__/recipeIndex.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `library/__tests__/recipeIndex.test.ts`, matching the file's existing
style for asserting a projection:

```ts
describe("M5 descriptors", () => {
    it("projects every authored and attribution field", () => {
        const recipe = new Recipe(undefined, JSON.stringify({
            pours: [], ratio: 16, dosage: 18,
            xid: "ABC12345", sharedBy: "BrewMind",
            favourite: true, description: "Sunday morning"
        }));

        const projected = projectRecipe(recipe);

        expect(projected.xid).toBe("ABC12345");
        expect(projected.sharedBy).toBe("BrewMind");
        expect(projected.favourite).toBe(1);
        expect(projected.hasDescription).toBe(1);
    });

    it("stores absence as null rather than an empty string", () => {
        const recipe = new Recipe(undefined,
            JSON.stringify({pours: [], ratio: 16, dosage: 18}));

        const projected = projectRecipe(recipe);

        // An empty string sorts and groups as a value. Null does not, which is
        // what "this recipe has no XID" has to mean to a shelf query.
        expect(projected.xid).toBeNull();
        expect(projected.sharedBy).toBeNull();
        expect(projected.favourite).toBe(0);
        expect(projected.hasDescription).toBe(0);
    });

    it("indexes the three columns a shelf groups by", () => {
        const indexed = INDEX_COLUMNS
            .filter((column) => column.indexed)
            .map((column) => column.name);

        expect(indexed).toEqual(expect.arrayContaining(
            ["xid", "sharedBy", "favourite"]
        ));
        // Presence only, never grouped by, so it earns no index of its own.
        expect(indexed).not.toContain("hasDescription");
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest library/__tests__/recipeIndex.test.ts -t "M5 descriptors"`
Expected: FAIL, `projected.xid` is `undefined`.

- [ ] **Step 3: Add the descriptors**

In `library/recipeIndex.ts`, append to `INDEX_COLUMNS`:

```ts
    // `|| null` rather than `?? null` throughout: these fields default to the
    // empty string on the model, and an empty string is a value to SQL. A shelf
    // asking "which recipes came from someone" must not match every recipe that
    // came from nobody.
    {name: "xid", type: "TEXT", indexed: true,
     from: (r) => r.xid || null},
    {name: "sharedBy", type: "TEXT", collate: "NOCASE", indexed: true,
     from: (r) => r.sharedBy || null},
    {name: "favourite", type: "INTEGER", indexed: true,
     from: (r) => (r.favourite ? 1 : 0)},
    // Presence, not content. Nothing searches a description; one filter asks
    // whether there is one, and a boolean column answers it without carrying
    // the text twice.
    {name: "hasDescription", type: "INTEGER",
     from: (r) => (r.description ? 1 : 0)}
```

Match the descriptor type's actual property names. If the existing array marks
an index differently from `indexed: true`, follow the existing form and adjust
the test's third case to match.

- [ ] **Step 4: Leave `INDEX_REVISION` alone**

The design says each new column comes "with an `INDEX_REVISION` bump". That is
one step too cautious, and following it would be harmless but misleading.

Read the constant's own doc comment. The schema hash covers the *shape* of the
array: every column's name, type and collation. Adding four columns changes that
shape, so the hash changes by itself and every install rebuilds on next open with
nothing further asked for. `INDEX_REVISION` exists for the one case the hash
cannot see: changing the body of a `from` while leaving the shape identical,
which is invisible because Hermes returns `"[bytecode]"` from
`Function.prototype.toString()` in a release build.

This task changes no existing `from` body. So the revision stays at its current
value, and bumping it here would teach the next reader that the number tracks
"any index change", which is exactly the misunderstanding that would later let a
real `from` change ship without one.

If you find yourself editing an existing descriptor's `from` while doing this,
that is the case the number is for, and then you bump it.

Run: `npx jest library/__tests__/recipeIndex.test.ts`
Expected: PASS, including the hash and golden-projection tests. The pinned hash
test fails and wants its new value; that failure is the mechanism working.

- [ ] **Step 5: Verify a real database rebuilds itself**

Add to `library/__tests__/RecipeDatabase.index.test.ts`:

```ts
it("adds the M5 columns to a database written before them", async () => {
    const db = new RecipeDatabase();
    const recipe = new Recipe(undefined, JSON.stringify({
        pours: [], ratio: 16, dosage: 18, favourite: true
    }));
    db.insertRecipe(recipe);

    // Force the rebuild the way a version upgrade does: clear the stored hash
    // so the next open cannot match it.
    forgetIndexHash(db);
    const reopened = new RecipeDatabase();

    expect(favouriteColumnFor(reopened, recipe.uuid)).toBe(1);
});
```

Write both helpers in the test file rather than adding accessors to the
production class, which would exist only for tests:

```ts
/** Clear the stored schema hash, so the next open cannot match it. */
function forgetIndexHash(db: RecipeDatabase) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).db.runSync("DELETE FROM schema_meta WHERE key = 'indexHash';");
}

function favouriteColumnFor(db: RecipeDatabase, uuid: string): number | undefined {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = (db as any).db.getFirstSync(
        "SELECT favourite FROM recipes WHERE uuid = ?;", [uuid]
    ) as {favourite: number} | null;
    return row?.favourite;
}
```

If the file already has an equivalent of either, use that instead of adding a
second one.

Run: `npx jest library/__tests__/RecipeDatabase.index.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add library/recipeIndex.ts library/__tests__/recipeIndex.test.ts \
        library/__tests__/RecipeDatabase.index.test.ts
git commit -m "feat: index the xid, author, favourite and note-presence columns"
```

---

### Task 5: A star glyph

`constants/dotIcons.ts` has no star. Its header says adding an icon means drawing
one and to keep the set small; this is the one M5 needs.

The file's constraint is real: at 9x9 only axis-aligned runs and pure diagonals
survive, which is why the settings icon is two faders rather than a gear. A
five-pointed star is close to the shape that constraint rejects, so this step
ends with looking at it rather than assuming.

**Files:**
- Modify: `constants/dotIcons.ts`
- Test: `components/__tests__/DotIcon.test.tsx`

- [ ] **Step 1: Write the failing test**

Follow the existing file's pattern for asserting an icon exists and renders. If
it asserts a lit-dot count, do the same here:

```ts
it("renders the favourite glyph", async () => {
    await renderWithProviders(
        <DotIcon name="favourite" size={24} color={palette.text}
                 accessibilityLabel="Favourite"/>
    );

    expect(await screen.findByLabelText("Favourite")).toBeTruthy();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest components/__tests__/DotIcon.test.tsx -t "favourite"`
Expected: FAIL, at typecheck or at render: `"favourite"` is not a `DotIconName`.

- [ ] **Step 3: Draw it**

In `constants/dotIcons.ts`, inside `DOT_ICONS`:

```ts
    /**
     * A five-pointed star, filled: a recipe the user has kept.
     *
     * The riskiest shape in this set, for the reason the file header gives about
     * the gear: a star is close to radially symmetric and its points are one dot
     * wide. It survives where the gear did not only because it is drawn solid,
     * so the silhouette carries the meaning and no interior detail has to.
     */
    favourite: [
        "....#....",
        "...###...",
        "...###...",
        "#########",
        ".#######.",
        "..#####..",
        "..#####..",
        ".##...##.",
        ".#.....#."
    ],
```

- [ ] **Step 4: Run the test**

Run: `npx jest components/__tests__/DotIcon.test.tsx`
Expected: PASS.

- [ ] **Step 5: Look at it**

A test proves it renders, not that it reads as a star. Start the dev server and
put it on a screen at the four sizes the header's own comparison used:

```bash
npx expo start
```

Check 12, 16, 24 and 44 px. If it reads as a blob at 12 px, redraw it rather
than shipping it: the header's whole argument is that this grid rejects some
shapes, and discovering that after release is worse than discovering it now.

- [ ] **Step 6: Commit**

```bash
git add constants/dotIcons.ts components/__tests__/DotIcon.test.tsx
git commit -m "feat: a star glyph for favourites"
```

---

### Task 6: The star on the card

A filled star at the **leading** end of the stats row. Evidence takes the
trailing end later; the favourite takes the front. Both are free, and the two
lines of prose rule is untouched.

**Files:**
- Modify: `components/RecipeCard.tsx:174-184` (the summary) and `:303-309` (the stats row)
- Test: `components/__tests__/RecipeCard.test.tsx`

- [ ] **Step 1: Write the failing test**

```ts
it("marks a favourite recipe", async () => {
    await renderWithProviders(
        <RecipeCard recipe={favouriteRecipe()} onPress={() => {}}/>
    );

    expect(await screen.findByTestId("recipe-card-favourite")).toBeTruthy();
});

it("draws no star on a recipe that is not a favourite", async () => {
    await renderWithProviders(
        <RecipeCard recipe={plainRecipe()} onPress={() => {}}/>
    );

    expect(screen.queryByTestId("recipe-card-favourite")).toBeNull();
});

it("says so to a screen reader", async () => {
    await renderWithProviders(
        <RecipeCard recipe={favouriteRecipe()} onPress={() => {}}/>
    );

    // The card is one accessibility element, so anything not in this label is
    // conveyed by a glyph alone.
    const label = (await screen.findByLabelText(/favourite/i));
    expect(label).toBeTruthy();
});
```

Build `favouriteRecipe()` and `plainRecipe()` from the file's existing recipe
helper, setting `favourite` on one of them.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest components/__tests__/RecipeCard.test.tsx -t "favourite"`
Expected: FAIL, no element with testID `recipe-card-favourite`.

- [ ] **Step 3: Draw it**

In `components/RecipeCard.tsx`, in the stats row, before `DOSE`:

```ts
                <XStack justifyContent="space-between" alignItems="flex-end" gap="$4">
                    <XStack gap="$5" alignItems="flex-end">
                        {recipe.favourite && (
                            // Aligned to the values rather than the labels: it
                            // sits on the baseline the numbers sit on, so the
                            // row reads as one line and not as a glyph with
                            // statistics after it.
                            <DotIcon testID="recipe-card-favourite"
                                     name="favourite" size={14}
                                     color={onAccent.text}
                                     accessibilityElementsHidden
                                     importantForAccessibility="no"/>
                        )}
                        <Stat label="DOSE" value={recipe.dosage} suffix="g"/>
```

The glyph is hidden from accessibility deliberately: the card is already one
grouped element and the next step puts the word into its label. Two
announcements for one star is worse than none.

- [ ] **Step 4: Put it in the summary**

In the `summary` array, after `marker.toLowerCase()`:

```ts
        recipe.favourite ? "favourite" : undefined,
```

- [ ] **Step 5: Run the tests**

Run: `npx jest components/__tests__/RecipeCard.test.tsx`
Expected: PASS, including every pre-existing test. The summary tests assert an
exact joined string, so expect to update the ones that build a favourite recipe.

- [ ] **Step 6: Commit**

```bash
git add components/RecipeCard.tsx components/__tests__/RecipeCard.test.tsx
git commit -m "feat: a star on a favourite recipe's card"
```

---

### Task 7: The swipe tile

A third tile beside COPY and DELETE. `components/SwipeableRecipeRow.tsx:38`
already works out that three tiles fit at 320 pt and four would not, so this
takes the last slot that tray has.

**Note the naming.** The design calls that tray "leading" and the BREW/SHARE/WRITE
tray "trailing". The code is the other way round: COPY and DELETE are in
`renderRightActions`. Go by the tray's contents, not by the word: the favourite
joins **the tray that holds COPY and DELETE**.

**Files:**
- Modify: `components/SwipeableRecipeRow.tsx:153-185`
- Test: `components/__tests__/SwipeableRecipeRow.test.tsx`

- [ ] **Step 1: Write the failing test**

```ts
it("offers a favourite tile", async () => {
    const onToggleFavourite = jest.fn();
    await renderWithProviders(
        <SwipeableRecipeRow recipe={plainRecipe()} onPress={() => {}}
                            onDelete={() => {}} onDuplicate={() => {}}
                            onToggleFavourite={onToggleFavourite}/>
    );

    await fireEvent.press(await screen.findByTestId("recipe-row-favourite"));

    expect(onToggleFavourite).toHaveBeenCalledTimes(1);
});

it("reads as KEEP on a recipe that is not a favourite", async () => {
    await renderWithProviders(
        <SwipeableRecipeRow recipe={plainRecipe()} onPress={() => {}}
                            onDelete={() => {}} onDuplicate={() => {}}
                            onToggleFavourite={() => {}}/>
    );

    expect(await screen.findByText("KEEP")).toBeTruthy();
});

it("reads as KEPT on a recipe that is one", async () => {
    await renderWithProviders(
        <SwipeableRecipeRow recipe={favouriteRecipe()} onPress={() => {}}
                            onDelete={() => {}} onDuplicate={() => {}}
                            onToggleFavourite={() => {}}/>
    );

    expect(await screen.findByText("KEPT")).toBeTruthy();
});

it("omits the tile when no handler is given", async () => {
    await renderWithProviders(
        <SwipeableRecipeRow recipe={plainRecipe()} onPress={() => {}}
                            onDelete={() => {}} onDuplicate={() => {}}/>
    );

    expect(screen.queryByTestId("recipe-row-favourite")).toBeNull();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest components/__tests__/SwipeableRecipeRow.test.tsx -t "favourite"`
Expected: FAIL at typecheck: `onToggleFavourite` is not a prop.

- [ ] **Step 3: Add the prop**

In the `Props` type:

```ts
    /**
     * Mark or unmark the recipe. Optional, and the tile is absent rather than
     * disabled without it, which is the same rule the gated cloud import row
     * follows: a control that cannot do anything should not be drawn.
     */
    onToggleFavourite?: () => void;
```

- [ ] **Step 4: Add the tile**

In `renderRightActions`, after the DELETE tile:

```ts
                {onToggleFavourite !== undefined && (
                    <Tile icon="favourite"
                          // Verbs, like the two beside it. KEEP is what the tap
                          // does and KEPT is what it has done, so the tile reads
                          // as an action either way. "FAVOURITE" is a noun and
                          // would be the only label in either tray that is.
                          caption={recipe.favourite ? "KEPT" : "KEEP"}
                          tone={resolveAccent(recipe)}
                          label={recipe.favourite
                              ? "Remove from favourites"
                              : "Add to favourites"}
                          testID="recipe-row-favourite"
                          onPress={onToggleFavourite}/>
                )}
```

The accent as tone, not a fixed colour: the tile says something about *this*
recipe, the way BREW already does, where COPY and DELETE say something about the
operation.

- [ ] **Step 5: Run the tests**

Run: `npx jest components/__tests__/SwipeableRecipeRow.test.tsx`
Expected: PASS, including the pre-existing tray tests.

- [ ] **Step 6: Commit**

```bash
git add components/SwipeableRecipeRow.tsx \
        components/__tests__/SwipeableRecipeRow.test.tsx
git commit -m "feat: a keep tile in the row's management tray"
```

---

### Task 8: Wire it to the library

**Files:**
- Modify: `hooks/useRecipeLibrary.ts:19-26`, `:104-108`, `:153`
- Modify: `app/index.tsx:618-638`
- Test: `hooks/__tests__/useRecipeLibrary.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("toggles a favourite and persists it", async () => {
    const store = fakeStore([plainRecipe()]);
    const {result} = await renderHook(() => useRecipeLibrary(store));

    await act(async () => {
        result.current.toggleFavourite(result.current.recipes[0]);
    });

    expect(store.updateRecipe).toHaveBeenCalledTimes(1);
    expect(result.current.recipes[0].favourite).toBe(true);
});

it("toggles back off", async () => {
    const store = fakeStore([favouriteRecipe()]);
    const {result} = await renderHook(() => useRecipeLibrary(store));

    await act(async () => {
        result.current.toggleFavourite(result.current.recipes[0]);
    });

    expect(result.current.recipes[0].favourite).toBe(false);
});
```

`renderHook` is async here for the same reason `render` is. Extend the file's
existing fake store with an `updateRecipe` jest mock that writes through to its
backing array, so the reload after the write returns the changed recipe.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest hooks/__tests__/useRecipeLibrary.test.ts -t "favourite"`
Expected: FAIL, `toggleFavourite` is not a function.

- [ ] **Step 3: Widen the store type**

In `hooks/useRecipeLibrary.ts`:

```ts
export type RecipeStore = {
    retrieveAllRecipes: () => Recipe[] | null;
    deleteRecipe: (uuid: string) => void;
    cloneRecipe: (uuid: string) => void;
    updateRecipe: (uuid: string, recipe: Recipe) => void;
    deleteAllRecipes?: () => void;
    insertRecipes?: (recipes: Recipe[]) => void;
    replaceAllRecipes?: (recipes: Recipe[]) => void;
};
```

Required, not optional: `RecipeDatabase.updateRecipe` has existed since before
this hook did, and an optional method would let a fake store silently do nothing
while the test passed.

- [ ] **Step 4: Add the action**

```ts
    /**
     * Mark or unmark a recipe.
     *
     * Mutates in place and writes through, which is the house pattern: the
     * editor does the same and bumps a key counter. Here the reload does that
     * job, so no counter is needed.
     */
    function toggleFavourite(recipe: Recipe) {
        recipe.favourite = !recipe.favourite;
        store.updateRecipe(recipe.uuid, recipe);
        reload();
    }
```

Add it to the return and to `RecipeLibrary`:

```ts
export type RecipeLibrary = {
    recipes: Recipe[];
    refresh: () => void;
    deleteRecipe: (recipe: Recipe) => void;
    duplicateRecipe: (recipe: Recipe) => void;
    toggleFavourite: (recipe: Recipe) => void;
    deleteAll: () => DeleteAllOutcome;
    applyRestore: (payload: BackupPayload, choice: RestoreChoice) => RestoreOutcome;
};
```

```ts
    return {
        recipes, refresh: reload, deleteRecipe, duplicateRecipe,
        toggleFavourite, deleteAll, applyRestore
    };
```

- [ ] **Step 5: Run the hook tests**

Run: `npx jest hooks/__tests__/useRecipeLibrary`
Expected: PASS, both files, including the real-database one.

- [ ] **Step 6: Wire the screen**

In `app/index.tsx`, on the `SwipeableRecipeRow`:

```ts
                                onToggleFavourite={() => {
                                    setBounceFirstRow(false);
                                    library.toggleFavourite(item);
                                }}
```

`setBounceFirstRow(false)` for the same reason the two beside it do: the tray
has been found, so the hint has done its job.

- [ ] **Step 7: Run the screen tests**

Run: `npx jest app/__tests__`
Expected: PASS.

- [ ] **Step 8: Full suite, typecheck, lint, doctor**

```bash
npm run typecheck && npm run lint && npm test && npx expo-doctor
```
Expected: no type errors, lint no worse than `main`, every suite green, 21/21.

- [ ] **Step 9: Check it on a device**

NFC and BLE are untouched here, so nothing needs a card or a machine. But the
swipe tray's three-tile geometry is a number only a device can settle, and the
star's legibility is the open question from Task 5.

```bash
npx expo start
```

Confirm on the smallest device you have: the tray opens to three tiles with a
grabbable strip of card still visible, the captions do not wrap, and the star on
the card reads as a star beside the Doto numerals.

- [ ] **Step 10: Commit and open the PR**

```bash
git add hooks/useRecipeLibrary.ts hooks/__tests__/useRecipeLibrary.test.ts app/index.tsx
git commit -m "feat: favourite a recipe from the library"
git push -u origin m5-foundation
gh pr create -R hessius/XBRecipeWriterPlus --base main --head m5-foundation \
  --title "M5 · Foundation and favourites" \
  --body "See docs/superpowers/plans/2026-09-16-m5-foundation-and-favourites.md."
```

---

## What this plan deliberately leaves

Named so the next plan does not have to rediscover them, and so nobody reads the
gaps as oversights.

| Deferred | Why | Where it lands |
|---|---|---|
| The description on the card, and the two-lines-of-prose budget | No effect until a description can be typed | The recipe screen plan, with the ABOUT deck |
| The NOTE editor and its live counter | Belongs on the ABOUT deck | Same |
| Evidence on the stats row | Reads an average rating, which needs #99 | After #99 |
| The favourite control in the recipe screen header | The header rename work is phase 5 | The recipe screen plan |
| `libraryView`, `librarySort`, `librarySortDirection`, `libraryFavouritesFirst` | Settings for a rail that does not exist | The rail plan |
| `showRecipeAvatars` | Needs the row's avatar mark | The row plan |
| `shelfMarkVariant` and its LABS row | Needs shelves | The shelves plan |
| Favourites-first sorting, and the favourites shelf | Both read the column this plan adds, and both need the rail | The rail and shelves plans |

The column exists from Task 4, so every one of those can query it the day it is
written. That is the point of doing the foundation first.

## Remaining plans for M5

One per phase of the design's shipping order, written when the phase before it
has landed rather than all at once:

1. **The rail** — search, sort with direction, favourites first, filter chips,
   the view segmented pair, and the four `librarySort*` settings.
2. **Shelves** — the query model, the grid, stock auto shelves, shelf creation,
   the selection picker, `ShelfMark` and its LABS variant row.
3. **The recipe screen** — the ABOUT deck, the description and its counter, the
   card's line budget, the header rename sheet, the pod section, the favourite in
   the header. Independent of 1 and 2.

#99 (rating capture) and #96 (backups carrying brews) must ship in the same
release as the shelves work: "best rated" would otherwise ship greyed, and a
restore would destroy every rating a user had entered.

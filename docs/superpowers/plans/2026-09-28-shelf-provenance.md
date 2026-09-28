# Shelf Provenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tell a shelf the user made apart from a tag they typed, gate the ones the app invented, give every drawn shelf its art back, and add an ALL RECIPES shelf.

**Architecture:** A new `myShelves` setting stores the filter ids created through NEW SHELF, in the format `hiddenShelves` already uses. `Shelf.kind` grows a third value so the grid can draw YOUR SHELVES, FROM TAGS and AUTO SHELVES, with the middle section passing through the same `availableFilters` gate the app's own shelves do. ALL RECIPES is an ordinary stock filter whose clause is `1 = 1`, waiving suppression with `authored` and kept off the rail with a new `gridOnly` flag.

**Tech Stack:** TypeScript, Expo SDK 57, Tamagui, expo-sqlite, Jest with jest-expo, @testing-library/react-native v14.

**Spec:** `docs/superpowers/specs/2026-09-28-shelf-provenance-design.md`

---

## Before you start

**This branch is based on `auto-shelves` (PR #156), not on `main`.** The
`authored` flag on `StockFilter` arrives with that PR. Once #156 merges, rebase
onto `main`; the duplicated commits drop out.

Read the spec. Then read these four files in full, because every task touches at
least one of them and they carry long comments that explain decisions you must
not undo:

- `library/shelves.ts` (110 lines)
- `library/libraryFilters.ts`, the `STOCK_FILTERS` table and `availableFilters`
- `library/hiddenShelves.ts`
- `components/ShelfGrid.tsx`

**House rules that will bite you:**

- **No colour literals.** Every colour comes from `constants/colors.ts`.
- **No em dashes in user-facing copy.** Avoid dashes generally in strings the
  user reads. Code comments are exempt.
- **British English** in prose and comments.
- **RNTL v14's `render`, `fireEvent` and `renderHook` are async.** Always
  `await` them. Always render through `renderWithProviders` from
  `test-utils/render.tsx`.
- **The React Compiler is on.** Do not hand-write `useMemo`/`useCallback`, and
  do not read whole `props` inside a hook.
- **Prove every test can fail** before you make it pass. A test that passes
  against the unchanged code is not a test.
- Run a single file with `npx jest path/to/file.test.ts`, one test with
  `-t "name"`.

---

## File structure

**Created:**

| File | Responsibility |
|---|---|
| none | every change lands in a file that already owns the concern |

**Modified:**

| File | Change |
|---|---|
| `library/hiddenShelves.ts` | `canonicalShelfId` folds `tag:` ids |
| `library/Settings.ts` | the `myShelves` key and its default |
| `app/settings.tsx` | read `myShelves`, put it in `settingsSnapshot()` |
| `library/libraryFilters.ts` | `allRecipes` filter, `gridOnly` flag, `chipFilters` |
| `constants/dotIcons.ts` | the `shelfAllRecipes` glyph |
| `constants/shelfGlyphs.ts` | map `allRecipes` to it |
| `library/shelves.ts` | three kinds, the `myShelves` input, ALL RECIPES last |
| `hooks/useRecipeLibrary.ts` | `shelfIdsOf` reads art for marked tags at any count |
| `components/ShelfGrid.tsx` | the FROM TAGS section |
| `components/ShelfOverflowSheet.tsx` | promote and demote rows |
| `app/index.tsx` | wiring, the lifecycle writes, the chip drop |
| `components/ShelfRoom.tsx` | `ScrollView` becomes a `FlatList` |

---

## Task 1: A tag id folds like an author id

`canonicalShelfId` folds author ids through `tagKey` and leaves everything else
alone. A tag shelf put away as `Mornings` and later spelled `mornings` presents a
different id, so the stored answer is lost. Task 2 onward stores tag ids in the
same list format, so this has to be right first.

**Files:**
- Modify: `library/hiddenShelves.ts`
- Test: `library/__tests__/hiddenShelves.test.ts`

- [ ] **Step 1: Write the failing tests**

Append inside the existing top-level `describe`, or add a new one at the end of
the file:

```ts
describe("tag ids fold like author ids", () => {
    it("stores a tag id in its folded form", () => {
        expect(canonicalShelfId("tag:Mornings")).toBe("tag:mornings");
    });

    it("keeps a shelf put away when its spelling changes", () => {
        // `tagKey` folds case, so "Mornings" and "mornings" are one shelf
        // everywhere downstream. If this list disagreed, renaming the shelf
        // would quietly bring back a tile the user had put away.
        const stored = serialiseHidden(["tag:Mornings"]);
        expect(isHidden(stored, "tag:mornings")).toBe(true);
    });

    it("leaves a stock id alone", () => {
        expect(canonicalShelfId("tea")).toBe("tea");
    });
});
```

Check the file's existing imports and add `canonicalShelfId` and `isHidden` if
they are not already imported. The predicate is exported near the bottom of
`library/hiddenShelves.ts`; if it is named something other than `isHidden`, use
the real name rather than renaming the export.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx jest library/__tests__/hiddenShelves.test.ts`
Expected: the first two fail, because `canonicalShelfId("tag:Mornings")` returns
`"tag:Mornings"` unchanged.

- [ ] **Step 3: Fold tag ids**

In `library/hiddenShelves.ts`, import the tag helpers and extend the function:

```ts
import {
    AUTHOR_FILTER_PREFIX, authorFromFilterId, TAG_FILTER_PREFIX, tagFromFilterId
} from "@/library/libraryFilters";
import {tagKey} from "@/library/tagKey";

export function canonicalShelfId(id: string): string {
    const trimmed = id.trim();
    const author = authorFromFilterId(trimmed);
    if (author !== null) return `${AUTHOR_FILTER_PREFIX}${tagKey(author)}`;
    // Tags fold for the reason authors do, and it matters more here: a tag is
    // renamed by hand, so the two spellings of one shelf are a thing a person
    // produces on purpose rather than a collision between two strangers.
    const tag = tagFromFilterId(trimmed);
    if (tag !== null) return `${TAG_FILTER_PREFIX}${tagKey(tag)}`;
    return trimmed;
}
```

If `TAG_FILTER_PREFIX` is not exported from `library/libraryFilters.ts`, export
it beside `AUTHOR_FILTER_PREFIX`. Do not hardcode `"tag:"` in this file.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx jest library/__tests__/hiddenShelves.test.ts`
Expected: all pass.

- [ ] **Step 5: Prove the guard**

Temporarily revert the two new lines so tag ids fall through to `trimmed`. Run
the file again and confirm the two new tests fail. Restore.

- [ ] **Step 6: Commit**

```bash
git add library/hiddenShelves.ts library/__tests__/hiddenShelves.test.ts library/libraryFilters.ts
git commit -m "Fold tag ids in a stored shelf list"
```

---

## Task 2: The myShelves setting

**Files:**
- Modify: `library/Settings.ts`
- Modify: `app/settings.tsx:179-189`

There is no test in this task. `settingsSnapshot()` returns
`Record<Exclude<SettingKey, BackupExcluded>, unknown>`, so omitting the key from
the snapshot is a compile error, and `library/__tests__/backup.test.ts`'s
"every setting is carried or deliberately excluded" already pins the other half.
The typecheck is the test.

- [ ] **Step 1: Add the key**

In `library/Settings.ts`, beside `hiddenShelves` in `DEFAULTS`:

```ts
    /**
     * The shelves the user made, as filter ids.
     *
     * A tag and a shelf are one row in `recipe_tags`, so nothing in the data
     * says which door a tag came through: `setShelfMembers` writes a tag and so
     * does the editor's TAGS field. This list is that missing fact. A tag named
     * here is the user's shelf and is never suppressed; every other tag is a
     * tag, and earns a tile only by clearing the same gate the app's own
     * shelves clear.
     *
     * Stored in `hiddenShelves`' format, canonical ids in a JSON array, for the
     * same reasons: a name somebody typed can contain a comma, and an id that
     * is not on screen today must not be forgotten.
     *
     * Empty by default, including on upgrade. There is no record of which
     * existing tags were shelves and inventing one would be a guess, so every
     * tag starts as a tag and one tap promotes the ones that were not.
     */
    myShelves: "",
```

- [ ] **Step 2: Read it on the settings screen**

In `app/settings.tsx`, beside the other `useSetting` calls (near line 105):

```ts
    // Not shown as a row on this screen. Shelves are promoted from their own
    // tile in the grid, which is where the user is when they want to. Read here
    // because a backup carries every preference and this is one.
    const [myShelves] = useSetting("myShelves", settings);
```

- [ ] **Step 3: Put it in the snapshot**

```ts
            libraryView, invertAutoShelves, hiddenShelves, myShelves
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean. If you skipped step 3 it fails on `settingsSnapshot`, which is
the guard doing its job.

- [ ] **Step 5: Run the backup suite**

Run: `npx jest library/__tests__/backup.test.ts`
Expected: pass, including "emits every DEFAULTS key that is not on NOT_IN_BACKUP".

- [ ] **Step 6: Commit**

```bash
git add library/Settings.ts app/settings.tsx
git commit -m "Store which shelves the user made"
```

---

## Task 3: The ALL RECIPES filter

**Files:**
- Modify: `library/libraryFilters.ts`
- Modify: `constants/dotIcons.ts`
- Modify: `constants/shelfGlyphs.ts`
- Test: `library/__tests__/libraryFilters.test.ts`
- Test: `constants/__tests__/dotIcons.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `library/__tests__/libraryFilters.test.ts`:

```ts
describe("ALL RECIPES", () => {
    it("resolves to a clause that matches everything", () => {
        expect(resolveStockFilter("allRecipes")).toEqual({where: "1 = 1"});
    });

    it("is offered however much of the library it holds", () => {
        // Its count is the library, so the 80% ceiling would take it away the
        // moment it worked. It waives both gates the way FAVOURITES does.
        expect(availableFilters({allRecipes: 40}, 40, [])).toContain("allRecipes");
        expect(availableFilters({allRecipes: 1}, 1, [])).toContain("allRecipes");
    });

    it("is not offered by an empty library", () => {
        expect(availableFilters({allRecipes: 0}, 0, [])).not.toContain("allRecipes");
    });

    it("is last in the stock order", () => {
        expect(STOCK_FILTER_ORDER[STOCK_FILTER_ORDER.length - 1]).toBe("allRecipes");
    });
});

describe("chipFilters", () => {
    it("drops a grid-only filter from the rail", () => {
        // A chip that narrows nothing is noise on a rail whose whole job is
        // narrowing. The grid still draws the tile.
        expect(chipFilters(["tea", "allRecipes", "mine"])).toEqual(["tea", "mine"]);
    });

    it("leaves every other filter alone", () => {
        expect(chipFilters(["tea", "mine"])).toEqual(["tea", "mine"]);
    });
});
```

Add `chipFilters` to the file's import from `@/library/libraryFilters`.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx jest library/__tests__/libraryFilters.test.ts`
Expected: the ALL RECIPES describe fails on an unknown id, and `chipFilters`
fails to import.

- [ ] **Step 3: Add the filter**

In `library/libraryFilters.ts`, add to the `FilterId` union:

```ts
    | "mostBrewed"
    | "allRecipes";
```

Add to `StockFilter` beside `authored`:

```ts
    /**
     * Drawn in the grid, never offered as a chip.
     *
     * The one declared exception to "the rail and the grid cannot disagree".
     * ALL RECIPES narrows nothing, so a chip for it would be a control that
     * does not control anything, sitting on the one row whose entire purpose is
     * narrowing. Declared here rather than special-cased at the rail, so a
     * reader who notices the difference finds the reason on the filter itself.
     */
    gridOnly?: true;
```

Add the entry to `STOCK_FILTERS`:

```ts
    // `1 = 1` rather than a special case anywhere downstream. The clause runs
    // in three query shapes and every one of them takes it unchanged, so the
    // count, the list and the shelf art all come through the ordinary path.
    allRecipes: {
        label: "ALL RECIPES",
        clause: () => ({where: "1 = 1"}),
        // Its count is the whole library, so it fails the 80% ceiling at every
        // size above the floor. Waived for the same reason FAVOURITES is: this
        // is not the app inventing a category, it is the way out of one.
        authored: true,
        gridOnly: true
    },
```

Append `"allRecipes"` to the end of `STOCK_FILTER_ORDER`.

Add the helper next to `asStockFilters`:

```ts
/**
 * The ids that may be drawn as chips, from the ids that may be drawn at all.
 *
 * `availableFilters` stays the single suppression gate; this is not a second
 * one. It removes only what has said on its own entry that it does not belong
 * on the rail, so the grid and the chips still cannot disagree about which
 * shelves exist, only about which of them a chip can usefully name.
 */
export function chipFilters(ids: readonly FilterId[]): FilterId[] {
    return ids.filter((id) => STOCK_FILTERS[id].gridOnly !== true);
}
```

- [ ] **Step 4: Add the glyph**

In `constants/dotIcons.ts`, after `shelfMostBrewed`:

```ts
    /**
     * Nine dots on an even grid: the whole field rather than a part of it.
     *
     * Not a stack of rows like `list` or `shelfMostBrewed`, which both mean a
     * number of things. This one means every thing, so it fills the square in
     * both directions instead of counting up one of them.
     */
    shelfAllRecipes: [
        ".........",
        ".#..#..#.",
        ".........",
        ".........",
        ".#..#..#.",
        ".........",
        ".........",
        ".#..#..#.",
        "........."
    ]
```

Update the "Eighteen glyphs is a lot" comment near line 586 to "Nineteen".

In `constants/shelfGlyphs.ts`, add to `SHELF_GLYPHS`:

```ts
    allRecipes:    "shelfAllRecipes",
```

Update the roster in `constants/__tests__/dotIcons.test.ts` to include
`shelfAllRecipes`. Run the file to find the exact assertion.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx jest library/__tests__/libraryFilters.test.ts constants/__tests__/dotIcons.test.ts`
Expected: all pass.

Run: `npm run typecheck`
Expected: clean. `SHELF_GLYPHS` is `Record<FilterId, DotIconName>`, so a missing
glyph fails here rather than drawing a blank tile.

- [ ] **Step 6: Prove the guards**

Three mutations, run `npx jest library/__tests__/libraryFilters.test.ts` after each and restore:

1. Remove `authored: true` from the entry. Expected: the "offered however much"
   test fails.
2. Remove `gridOnly: true`. Expected: the `chipFilters` drop test fails.
3. Move `"allRecipes"` off the end of `STOCK_FILTER_ORDER`. Expected: the order
   test fails.

- [ ] **Step 7: Commit**

```bash
git add library/libraryFilters.ts constants/dotIcons.ts constants/shelfGlyphs.ts library/__tests__/libraryFilters.test.ts constants/__tests__/dotIcons.test.ts
git commit -m "Add an ALL RECIPES shelf that never reaches the rail"
```

---

## Task 4: Keep ALL RECIPES off the rail

**Files:**
- Modify: `app/index.tsx:374-380`

- [ ] **Step 1: Wrap the chip list**

`offeredFilterIds` currently reads:

```ts
    const offeredFilterIds = asStockFilters(availableFilters(
        library.filterCounts,
        library.librarySize,
        libraryQuery.query.filters
    ));
```

Change it to:

```ts
    const offeredFilterIds = chipFilters(asStockFilters(availableFilters(
        library.filterCounts,
        library.librarySize,
        // What is already applied, so suppression cannot withdraw a filter the
        // user switched on and strand the library narrowed with no control.
        libraryQuery.query.filters
    )));
```

Keep the existing comment. Add `chipFilters` to the import from
`@/library/libraryFilters` at the top of the file.

- [ ] **Step 2: Typecheck and run the screen's suite**

Run: `npm run typecheck && npx jest app/__tests__/index.test.tsx`
Expected: clean, and the suite passes.

- [ ] **Step 3: Commit**

```bash
git add app/index.tsx
git commit -m "Drop grid-only filters from the chip row"
```

---

## Task 5: Three kinds of shelf

**Files:**
- Modify: `library/shelves.ts`
- Test: `library/__tests__/shelves.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `library/__tests__/shelves.test.ts`. Match the existing file's helper
style; if it has a `shelvesFor`-style helper, use it and pass the new input
through, otherwise call `buildShelves` directly as below.

```ts
describe("a shelf the user made and a tag they typed", () => {
    it("files a marked tag under YOUR SHELVES at any size", () => {
        const shelves = buildShelves({
            filterCounts: {},
            tagCounts:    [{tag: "Mornings", count: 1}],
            librarySize:  10,
            myShelves:    ["tag:mornings"]
        });

        expect(shelves).toEqual([
            {id: "tag:Mornings", label: "Mornings", kind: "manual", count: 1}
        ]);
    });

    it("matches a marked tag on its folded form", () => {
        // The list stores canonical ids; the shelf carries the spelling the
        // recipe used. Comparing the two raw would demote a shelf on a rename.
        const shelves = buildShelves({
            filterCounts: {},
            tagCounts:    [{tag: "MORNINGS", count: 1}],
            librarySize:  10,
            myShelves:    ["tag:mornings"]
        });

        expect(shelves[0].kind).toBe("manual");
    });

    it("drops an unmarked tag that is below the floor", () => {
        const shelves = buildShelves({
            filterCounts: {},
            tagCounts:    [{tag: "espresso", count: 1}],
            librarySize:  10,
            myShelves:    []
        });

        expect(shelves).toEqual([]);
    });

    it("files an unmarked tag that clears the floor under FROM TAGS", () => {
        const shelves = buildShelves({
            filterCounts: {},
            tagCounts:    [{tag: "espresso", count: 3}],
            librarySize:  10,
            myShelves:    []
        });

        expect(shelves).toEqual([
            {id: "tag:espresso", label: "espresso", kind: "tag", count: 3}
        ]);
    });

    it("keeps an unmarked tag the user is standing in, whatever its size", () => {
        // The applied passthrough. Withdrawing the tile of the shelf someone
        // just opened would leave the library narrowed with nothing naming it.
        const shelves = buildShelves({
            filterCounts: {},
            tagCounts:    [{tag: "espresso", count: 1}],
            librarySize:  10,
            myShelves:    [],
            applied:      ["tag:espresso"]
        });

        expect(shelves[0].kind).toBe("tag");
    });

    it("suppresses an unmarked tag that holds most of the library", () => {
        const shelves = buildShelves({
            filterCounts: {},
            tagCounts:    [{tag: "espresso", count: 9}],
            librarySize:  10,
            myShelves:    []
        });

        expect(shelves).toEqual([]);
    });
});

describe("ALL RECIPES is the last auto shelf", () => {
    it("sits after the author shelves", () => {
        const shelves = buildShelves({
            filterCounts: {tea: 4, allRecipes: 10},
            tagCounts:    [],
            authorCounts: [{author: "Anna", count: 4}],
            librarySize:  10,
            myShelves:    []
        });

        expect(shelves.map((shelf) => shelf.id)).toEqual([
            "tea", "sharedBy:Anna", "allRecipes"
        ]);
    });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx jest library/__tests__/shelves.test.ts`
Expected: failures. `myShelves` is not a parameter, every tag comes back as
`manual`, and `allRecipes` lands before the author shelf.

- [ ] **Step 3: Rewrite buildShelves**

Replace the `manual` block and the return in `library/shelves.ts`:

```ts
export type Shelf = {
    id: string;
    label: string;
    /**
     * Which of the grid's three sections it belongs to.
     *
     * `manual` is a shelf the user made through NEW SHELF, named in the
     * `myShelves` setting. `tag` is every other tag: a word typed onto a recipe
     * in the editor, which nobody assembled into anything. `auto` is a question
     * the app asks of the library.
     *
     * The line between `manual` and `tag` cannot be drawn from the data, which
     * is the whole reason `myShelves` exists: both write the same row in
     * `recipe_tags`.
     */
    kind: "manual" | "tag" | "auto";
    count: number;
};
```

Then inside `buildShelves`, destructure `myShelves = []` from `input` and
replace the manual block:

```ts
    const mine = new Set(myShelves.map(canonicalShelfId));

    const manual: Shelf[] = [];
    const tagged: Record<string, number> = {};
    for (const {tag, count} of tagCounts) {
        const id = tagFilterId(tag);
        // Folded before comparing, because the stored list is canonical and
        // this id carries whichever spelling the tag was written in.
        if (mine.has(canonicalShelfId(id))) {
            manual.push({id, label: tag, kind: "manual", count});
        } else {
            tagged[id] = count;
        }
    }

    // A tag nobody made into a shelf is a shelf the app invented, exactly like
    // an author shelf, so it goes through the same gate: the floor, the
    // ceiling, and the passthrough that keeps an applied shelf on screen.
    const byTag: Shelf[] = availableFilters(tagged, librarySize, applied)
        .map((id) => ({
            id,
            label: filterLabel(id),
            kind: "tag" as const,
            count: tagged[id] ?? 0
        }));
```

Leave the `auto` and `byAuthor` blocks as they are, then replace the return:

```ts
    // ALL RECIPES is pulled out of the stock run and put last, after the author
    // shelves, because it is the way out of every category rather than one more
    // of them. Its position is the only thing about it that is special; its
    // count, its clause and its art all come through the ordinary path.
    const escape = auto.filter((shelf) => shelf.id === "allRecipes");
    const stock = auto.filter((shelf) => shelf.id !== "allRecipes");

    return [...manual, ...byTag, ...stock, ...byAuthor, ...escape];
```

Add `canonicalShelfId` to the imports, from `@/library/hiddenShelves`, and add
`myShelves?: readonly string[];` to the input type with a comment naming the
setting it comes from.

Update the function's own doc comment: the paragraph beginning "Nothing
suppresses a manual shelf" is now true only of `manual`, and must say so.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx jest library/__tests__/shelves.test.ts`
Expected: all pass, old tests included. Existing tests that assumed every tag is
`manual` will need their expectation changed to `tag` **only** where the test
does not pass `myShelves`. Read each one before changing it: a changed
expectation is a regression until proven otherwise.

- [ ] **Step 5: Prove the guards**

Four mutations, restoring after each:

1. Drop the `canonicalShelfId` fold in `mine`. Expected: "matches a marked tag
   on its folded form" fails.
2. Push every tag into `manual`. Expected: the floor and ceiling tests fail.
3. Pass `[]` instead of `applied` to the tag gate. Expected: the passthrough
   test fails.
4. Return `[...manual, ...byTag, ...auto, ...byAuthor]`. Expected: the ALL
   RECIPES order test fails.

- [ ] **Step 6: Commit**

```bash
git add library/shelves.ts library/__tests__/shelves.test.ts
git commit -m "Tell a shelf the user made from a tag they typed"
```

---

## Task 6: The grid grows a third section

**Files:**
- Modify: `components/ShelfGrid.tsx`
- Modify: `app/index.tsx:422-428`
- Test: `components/__tests__/ShelfGrid.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `components/__tests__/ShelfGrid.test.tsx`, following the file's existing
render helper:

```ts
it("draws a FROM TAGS section for tags the user did not make", async () => {
    await renderWithProviders(
        <ShelfGrid
            shelves={[
                {id: "tag:mine", label: "mine", kind: "manual", count: 2},
                {id: "tag:espresso", label: "espresso", kind: "tag", count: 3},
                {id: "tea", label: "TEA", kind: "auto", count: 4}
            ]}
            onOpen={() => {}}
            onNewShelf={() => {}}
            onShelfActions={() => {}}/>
    );

    expect(screen.getByText("YOUR SHELVES")).toBeTruthy();
    expect(screen.getByText("FROM TAGS")).toBeTruthy();
    expect(screen.getByText("AUTO SHELVES")).toBeTruthy();
});

it("draws no FROM TAGS heading when there are no such tags", async () => {
    await renderWithProviders(
        <ShelfGrid
            shelves={[{id: "tea", label: "TEA", kind: "auto", count: 4}]}
            onOpen={() => {}}
            onNewShelf={() => {}}
            onShelfActions={() => {}}/>
    );

    expect(screen.queryByText("FROM TAGS")).toBeNull();
});
```

Check the file's existing tests for the exact prop set `ShelfGrid` is rendered
with, and match it. `renderWithProviders` and `screen` come from
`@/test-utils/render` and `@testing-library/react-native`.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx jest components/__tests__/ShelfGrid.test.tsx`
Expected: the first fails on a missing FROM TAGS heading.

- [ ] **Step 3: Add the section**

In `components/ShelfGrid.tsx`, after the `manual` line:

```ts
    const manual = shelves.filter((shelf) => shelf.kind === "manual");
    const tagged = shelves.filter((shelf) => shelf.kind === "tag");
```

Then between the YOUR SHELVES stack and the AUTO SHELVES stack:

```tsx
            {tagged.length > 0 && (
                <YStack gap="$2">
                    {/*
                      * The nursery. A tag appears here exactly when it has grown
                      * enough to be worth a shelf, which makes the section the
                      * promotion hint as well as the place the tag lives: its
                      * tile offers MAKE THIS A SHELF, and taking it moves the
                      * tag up to YOUR SHELVES for good.
                      */}
                    <Heading label="FROM TAGS"/>
                    <Rows shelves={tagged} marks={marks}
                          onOpen={onOpen} onActions={onShelfActions}/>
                </YStack>
            )}
```

Update the component's doc comment, which currently says "Two sections,
`YOUR SHELVES` then `AUTO SHELVES`".

- [ ] **Step 4: Pass the setting through**

In `app/index.tsx`, read the setting beside the other `useSetting` calls near
line 222:

```ts
    const [myShelves, setMyShelves] = useSetting("myShelves", settings);
```

and pass it into `buildShelves`:

```ts
    const shelves = buildShelves({
        filterCounts: library.filterCounts,
        tagCounts:    library.tagCounts,
        authorCounts: library.authorCounts,
        librarySize:  library.librarySize,
        myShelves:    parseHidden(myShelves),
        applied:      libraryQuery.query.filters
    });
```

`parseHidden` is already imported in this file. It is the reader for this format
and reusing it is the point; do not write a second parser.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx jest components/__tests__/ShelfGrid.test.tsx app/__tests__/index.test.tsx`
Expected: pass. Existing index tests that assert on YOUR SHELVES contents may
need updating, because a tag with no marker is now a `tag`. Read each before
changing it.

- [ ] **Step 6: Commit**

```bash
git add components/ShelfGrid.tsx app/index.tsx components/__tests__/ShelfGrid.test.tsx
git commit -m "Draw tags the user did not make in their own section"
```

---

## Task 7: Every drawn shelf gets its art

`shelfIdsOf` reads art only for tags clearing `MIN_COUNT`, while the grid draws
a marked tag at any count. That is the blank-tile bug.

**Files:**
- Modify: `hooks/useRecipeLibrary.ts:628-639`
- Test: `hooks/__tests__/useRecipeLibrary.test.ts` (or the shelf-art test file, if
  one exists; run `ls hooks/__tests__` and pick the file that already covers
  `shelfMarks`)

- [ ] **Step 1: Write the failing test**

Find how the existing tests in that file build a store, and follow it exactly.
The assertion is:

```ts
it("reads art for a shelf the user made, however small", async () => {
    // A marked tag is drawn at any count, so withholding its art leaves a blank
    // square claiming to be a collection. This was the original bug: the grid
    // and the art reader disagreed about the floor.
    const store = storeWith({
        tagCounts: [{tag: "Mornings", count: 1}],
        myShelves: ["tag:mornings"]
    });

    const {result} = await renderHook(() => useRecipeLibrary(store));

    expect(result.current.shelfMarks["tag:Mornings"]).toBeDefined();
});
```

`renderHook` is async here. Without the `await`, `result` is undefined and the
failure is a confusing one about reading `current`.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest hooks/__tests__/useRecipeLibrary.test.ts -t "however small"`
Expected: fail, `shelfMarks["tag:Mornings"]` undefined.

- [ ] **Step 3: Include the marked tags**

`shelfIdsOf` gains the list:

```ts
function shelfIdsOf(
    tagCounts: readonly {tag: string; count: number}[],
    authorCounts: readonly {author: string; count: number}[],
    myShelves: readonly string[]
): string {
    const mine = new Set(myShelves.map(canonicalShelfId));
    return JSON.stringify([
        ...STOCK_FILTER_ORDER,
        // A tag the user made is drawn at any count, so its art is read at any
        // count too. The floor still applies to every other tag: it is what
        // keeps this read bounded, and the set it now lets through is bounded
        // by hand, because a person makes shelves one at a time.
        ...tagCounts
            .filter(({tag, count}) =>
                count >= MIN_COUNT || mine.has(canonicalShelfId(tagFilterId(tag))))
            .map(({tag}) => tagFilterId(tag)),
        ...authorCounts.filter(({count}) => count >= MIN_COUNT)
            .map(({author}) => authorFilterId(author))
    ]);
}
```

Import `canonicalShelfId` from `@/library/hiddenShelves`. The hook needs the
setting: read it where the hook reads its other inputs, and pass it into the
`shelfIdsOf` call at line 255. If `useRecipeLibrary` has no access to
`Settings`, thread it in as an optional argument defaulting to `[]` rather than
importing the settings screen's state; the hook's existing signature shows the
house pattern.

- [ ] **Step 4: Run it and watch it pass**

Run: `npx jest hooks/__tests__/useRecipeLibrary.test.ts`
Expected: pass.

- [ ] **Step 5: Prove the guard**

Remove the `|| mine.has(...)` clause. Expected: the new test fails. Restore.

- [ ] **Step 6: Commit**

```bash
git add hooks/useRecipeLibrary.ts hooks/__tests__/useRecipeLibrary.test.ts
git commit -m "Read art for a shelf the user made, however small"
```

---

## Task 8: Promote and demote

**Files:**
- Modify: `components/ShelfOverflowSheet.tsx`
- Modify: `app/index.tsx`
- Test: `components/__tests__/ShelfOverflowSheet.test.tsx` (create it if absent,
  modelled on `components/__tests__/RemoveShelfSheet.test.tsx`)

- [ ] **Step 1: Write the failing tests**

```ts
it("offers to make a tag into a shelf", async () => {
    const onPromote = jest.fn();
    await renderWithProviders(
        <ShelfOverflowSheet open shelf="espresso" count={3} mine={false}
                            onOpenChange={() => {}} onRename={() => {}}
                            onDuplicate={() => {}} onDelete={() => {}}
                            onPromote={onPromote} onDemote={() => {}}/>
    );

    expect(screen.getByText("Make this a shelf")).toBeTruthy();
    expect(screen.queryByText("Make this a tag")).toBeNull();
});

it("offers to put a shelf back to being a tag", async () => {
    await renderWithProviders(
        <ShelfOverflowSheet open shelf="Mornings" count={3} mine
                            onOpenChange={() => {}} onRename={() => {}}
                            onDuplicate={() => {}} onDelete={() => {}}
                            onPromote={() => {}} onDemote={() => {}}/>
    );

    expect(screen.getByText("Make this a tag")).toBeTruthy();
    expect(screen.queryByText("Make this a shelf")).toBeNull();
});
```

Pressing a button inside an `XbrwSheet` is racy during the entrance: if you add
a press test, wrap the press in `waitFor`, as `app/__tests__/brewHistory.test.tsx`
does with its `pressOnSheet` helper.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest components/__tests__/ShelfOverflowSheet.test.tsx`
Expected: fail on the missing rows.

- [ ] **Step 3: Add the rows**

Add three props to `ShelfOverflowSheet`:

```ts
    /** Whether this is a shelf the user made, rather than a tag they typed. */
    mine: boolean;
    /** Mark the tag as a shelf of the user's own. */
    onPromote: () => void;
    /** Put it back to being an ordinary tag. */
    onDemote: () => void;
```

and, above the delete row:

```tsx
                {mine
                    ? row("Make this a tag", "revert", onDemote, {})
                    : row("Make this a shelf", "shelves", onPromote, {})}
```

Match the option object the sibling rows pass; read `row`'s signature at line 59
and copy the shape the rename row uses.

- [ ] **Step 4: Wire the screen**

In `app/index.tsx`, add the two handlers beside `deleteShelf`:

```ts
    /**
     * Mark a tag as a shelf the user made, or unmark it.
     *
     * The only writer of `myShelves` besides the shelf lifecycle below. Folded
     * through the same list helpers the hidden list uses, so a promotion
     * survives a rename that only re-spells the name.
     */
    function promoteShelf(tag: string) {
        setMyShelves(serialiseHidden([...parseHidden(myShelves), tagFilterId(tag)]));
        setShelfActions(null);
    }

    function demoteShelf(tag: string) {
        const id = canonicalShelfId(tagFilterId(tag));
        setMyShelves(serialiseHidden(
            parseHidden(myShelves).filter((stored) => stored !== id)
        ));
        setShelfActions(null);
    }
```

Pass them to the sheet, along with whether this shelf is the user's:

```tsx
                mine={shelfActions !== null
                    && parseHidden(myShelves)
                        .includes(canonicalShelfId(tagFilterId(shelfActions)))}
                onPromote={() => {
                    if (shelfActions !== null) promoteShelf(shelfActions);
                }}
                onDemote={() => {
                    if (shelfActions !== null) demoteShelf(shelfActions);
                }}
```

Then the lifecycle. In `nameShelf`, after the successful
`reportShelfWrite(library.setShelfMembers(name, picker.chosen()))`:

```ts
        // Made through NEW SHELF, so it is the user's own from birth. This is
        // the one place a shelf is created, so it is the one place that has to
        // say so.
        setMyShelves(serialiseHidden([...parseHidden(myShelves), tagFilterId(name)]));
```

In `renameShelf`, after the successful `library.renameShelf(...)`:

```ts
        // The marker follows the name. Folded ids mean a rename that only
        // changes case is already the same entry, so this is a no-op there and
        // a move when the word itself changes.
        const was = canonicalShelfId(tagFilterId(renamingShelf));
        const stored = parseHidden(myShelves);
        if (stored.includes(was)) {
            setMyShelves(serialiseHidden(
                [...stored.filter((id) => id !== was), tagFilterId(name)]
            ));
        }
```

In `deleteShelf`:

```ts
    function deleteShelf(tag: string) {
        reportShelfWrite(library.setShelfMembers(tag, []));
        // The shelf is gone, so the claim that the user made it is about
        // nothing. Left behind, it would silently promote a tag of the same
        // name typed months later.
        const id = canonicalShelfId(tagFilterId(tag));
        setMyShelves(serialiseHidden(
            parseHidden(myShelves).filter((stored) => stored !== id)
        ));
        setDeletingShelf(null);
        stopPicking();
    }
```

Add `serialiseHidden` and `canonicalShelfId` to the `@/library/hiddenShelves`
import, and `tagFilterId` to the `@/library/libraryFilters` import.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx jest components/__tests__/ShelfOverflowSheet.test.tsx app/__tests__/index.test.tsx`
Expected: pass.

- [ ] **Step 6: Prove the lifecycle**

Add one screen-level test in `app/__tests__/index.test.tsx`, following the file's
existing shelf tests, asserting a shelf made through NEW SHELF lands under YOUR
SHELVES rather than FROM TAGS. Then mutate: remove the `setMyShelves` line from
`nameShelf` and confirm it fails.

- [ ] **Step 7: Commit**

```bash
git add components/ShelfOverflowSheet.tsx app/index.tsx components/__tests__/ShelfOverflowSheet.test.tsx app/__tests__/index.test.tsx
git commit -m "Promote a tag to a shelf, and put it back"
```

---

## Task 9: The room stops assuming it is small

**Files:**
- Modify: `components/ShelfRoom.tsx:112-196`
- Test: `components/__tests__/ShelfRoom.test.tsx`

- [ ] **Step 1: Check the existing tests first**

Run: `npx jest components/__tests__/ShelfRoom.test.tsx`
Expected: pass. These are your regression net; the room's rendered output must
not change. If the file has no test asserting that a recipe's name appears, add
one now and commit it separately, before touching the component.

- [ ] **Step 2: Swap the container**

Replace the `ScrollView` with a `FlatList` of the same rows. The header moves to
`ListHeaderComponent`; the `rows` array and the row rendering are unchanged.

```tsx
        <FlatList
            testID="shelf-room"
            data={rows}
            keyExtractor={(row) => row[0].uuid}
            onScroll={onScroll}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
                paddingHorizontal: 12, paddingTop: 12, paddingBottom, gap: 12
            }}
            ListHeaderComponent={header}
            renderItem={({item: row}) => (
                <XStack gap="$3" paddingTop="$3">
                    {/* the existing row body, unchanged */}
                </XStack>
            )}/>
```

Lift the existing `<XStack alignItems="center" gap="$3" paddingBottom="$2">`
header block into a `const header = (...)` above the return, so
`ListHeaderComponent` takes an element rather than a function that rebuilds it.

The outer `<YStack gap="$3">` that wrapped the rows disappears; its gap becomes
the `paddingTop="$3"` on each row above. Check the spacing on device against the
grid, which is the view the room is meant to match.

Rewrite the header comment that says a shelf is bounded:

```
 * A `FlatList` of rows. This used to be a row-wrapping stack inside a
 * `ScrollView`, on the argument that a shelf is bounded by what one person
 * saved and nothing here needs recycling. ALL RECIPES is the shelf that is not
 * bounded, so the argument stopped being true. The objection that comment
 * raised, a virtualised list inside a scroll view, does not apply: the
 * `ScrollView` it replaced was the scroll container itself, not a parent.
```

- [ ] **Step 3: Run the tests**

Run: `npx jest components/__tests__/ShelfRoom.test.tsx`
Expected: pass, unchanged. A `FlatList` renders a window rather than everything,
so if a test asserts on the tenth recipe it may now fail legitimately. If that
happens, set `initialNumToRender` high enough for the test's fixture rather than
weakening the assertion, and say why in a comment.

- [ ] **Step 4: Commit**

```bash
git add components/ShelfRoom.tsx components/__tests__/ShelfRoom.test.tsx
git commit -m "Virtualise the shelf room"
```

---

## Task 10: The full gate

- [ ] **Step 1: Run everything**

```bash
npm run typecheck && npm run lint && npm test
```

Expected: typecheck clean, lint 0 errors (17 warnings is the baseline on this
branch), and the whole suite green. The count before this work was 4586 tests on
`auto-shelves`.

- [ ] **Step 2: Check the copy**

```bash
grep -rn "—" app components constants | grep -v "//"
```

Expected: no matches inside user-facing string literals. "Make this a shelf",
"Make this a tag", "ALL RECIPES" and "FROM TAGS" are the new strings.

- [ ] **Step 3: Open the PR**

Body must carry the device list from the spec:

- the four accidental shelves are gone from YOUR SHELVES
- the shelf that was really yours is in FROM TAGS and one tap promotes it
- a promoted shelf stays promoted across a restart
- every drawn tile has art, including a marked shelf holding one recipe
- ALL RECIPES draws, opens, scrolls smoothly, and can be put away and brought back
- a backup taken and restored keeps the promotions
- renaming a promoted shelf keeps it promoted
- deleting a promoted shelf and retyping the same tag does not promote it again

- [ ] **Step 4: Watch CI and the automated review**

Both, to green and to resolution. The reviewer's findings on this repo have been
legitimate every time so far; verify each one rather than either conceding or
dismissing it.

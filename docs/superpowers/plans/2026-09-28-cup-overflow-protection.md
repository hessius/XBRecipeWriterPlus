# Cup Overflow Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the app's claim about which cup type brews without overflow protection. `OTHER`, not `OMNI`, is the one that does, and the fix is copy plus one pair of library shelves.

**Architecture:** No byte on any card changes. `CUP_TYPE` keeps `XPOD 0x00, OTHER 0x01, OMNI 0x02, TEA 0x03`; a new characterisation test pins those four values so a future reader cannot quietly swap them. The `overflowOff` library shelf, which would now select the same recipes as `otherBrewer`, is renamed `omniDripper` and keeps its `cupType = OMNI` clause under an honest label, and the two shelf glyphs change owners. The rest is help copy and documentation.

**Tech Stack:** TypeScript, Jest (jest-expo preset), expo-sqlite via `test-utils/sqlite.ts`, Tamagui.

**Spec:** `docs/superpowers/specs/2026-09-28-cup-overflow-protection-design.md`

**Worktree:** `~/.config/superpowers/worktrees/XBRecipeWriterPlus/cup-overflow-copy`, branch `cup-overflow-copy`, based on `origin/main`.

---

## File Structure

| File | Change | Responsibility |
| --- | --- | --- |
| `library/__tests__/Recipe.card.test.ts` | Modify, `describe('cup type byte 39')` at line 147 | Pins the four `CUP_TYPE` values and records why they are not swapped |
| `library/Recipe.ts` | Modify, lines 10-15 | The enum, with the `// no overflow protection` comment on the right constant |
| `library/libraryFilters.ts` | Modify, lines 45, 180-187, 299 | The `FilterId` union, the two stock clauses, the chip order |
| `constants/dotIcons.ts` | Modify, lines 623-645 | The two 9x9 drawings, renamed so each belongs to the shelf it depicts |
| `constants/shelfGlyphs.ts` | Modify, lines 27-28 | Which glyph each shelf carries |
| `constants/recipeHelp.ts` | Modify, lines 85-91 | The `cup` hint and detail |
| `library/shareLink.ts` | Modify, lines 54-58 | The comment on `cloudCupType` |
| `library/__tests__/libraryFilters.test.ts` | Modify, lines 236-248 | Renamed ids, plus a new test pinning the two shelves apart |
| `library/__tests__/RecipeDatabase.index.test.ts` | Modify, lines 750-766 | Renamed id in the count assertion |
| `constants/__tests__/dotIcons.test.ts` | Modify, lines 5-30 | The closed set of icon names |
| `docs/help-copy.md` | Modify, lines 78-84 | Mirror of the help strings |
| `docs/copy.md` | Modify, lines 167, 306, 308 | Mirror of the help strings and the cup-type name |
| `.github/copilot-instructions.md` | Modify, line 80 | The domain invariant, currently stating the wrong constant |
| `docs/superpowers/specs/2026-09-16-library-shelves-design.md` | Modify, lines 311, 366 | The shelf table and the `cupType` note |

Four tasks, each independently committable: the constants and their pin, the shelves, the help copy, the documentation.

---

### Task 1: Pin the cup type bytes and move the comment

The bytes do not change. What changes is which constant carries the `// no overflow protection` comment, plus a test that makes a future swap fail loudly instead of silently rewriting what every stored recipe does on the machine.

**Files:**
- Modify: `library/Recipe.ts:10-15`
- Test: `library/__tests__/Recipe.card.test.ts:147`

- [ ] **Step 1: Write the failing test**

In `library/__tests__/Recipe.card.test.ts`, inside the existing `describe('cup type byte 39')` block, add this as the **first** test in the block, immediately after the `describe(...)` line at line 147:

```typescript
    /**
     * These four bytes are not ours to choose, and #151 proposed swapping two
     * of them.
     *
     * The argument was that xBloom's cloud API numbers cups `1 xPod, 2 Omni,
     * 3 Other, 4 Tea`, that every position but those two is the cloud value
     * minus one, and that one crossed pair is likelier to be our mistake than
     * the vendor's ordering. Pour patterns cross in exactly the same place:
     * the card numbers them `CENTERED 0, CIRCULAR 1, SPIRAL 2` and the cloud
     * numbers them `1 Centered, 2 Spiral, 3 Circular`. Two crossed pairs is a
     * habit, not an anomaly. `OMNI 0x02` is also the oldest value in the enum,
     * read off real cards before `OTHER` had a byte at all.
     *
     * A swap here would change what every already-stored recipe does on the
     * machine, silently, in an update. So the values are held here rather than
     * merely used, and anyone who wants to move one has to come through this
     * comment first.
     */
    it('holds the four cup type values the machine reads', () => {
        expect(CUP_TYPE.XPOD).toBe(0x00);
        expect(CUP_TYPE.OTHER).toBe(0x01);
        expect(CUP_TYPE.OMNI).toBe(0x02);
        expect(CUP_TYPE.TEA).toBe(0x03);
    });

```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npx jest library/__tests__/Recipe.card.test.ts -t "holds the four cup type values"`

Expected: PASS. This test is a pin, not a red-green cycle: it asserts the behaviour we are deliberately *not* changing. To prove it can fail, temporarily edit `library/Recipe.ts` to read `OMNI: 0x01,` and re-run — it must fail with `Expected: 2, Received: 1`. Put `0x02` back before continuing.

- [ ] **Step 3: Move the comment onto the right constant**

In `library/Recipe.ts`, replace lines 10-15, which currently read:

```typescript
export const CUP_TYPE = {
    XPOD:  0x00,
    OTHER: 0x01,
    OMNI:  0x02, // no overflow protection
    TEA:   0x03  // high bits may contain the default number of cups to brew
}
```

with:

```typescript
/**
 * The cup type byte, and which of them brews without overflow protection.
 *
 * `OTHER` is the one. Omni is xBloom's own dripper, so the machine knows the
 * shape of the vessel and can stop the water before it comes over the rim:
 * `docs/machine-integration/cloud-api.md` calls the cloud value
 * `2 = Omni/Dripper`, and `docs/machine-integration/ble-protocol.md` records a
 * cup weight range of 90-110 g for it against 80-200 g for "other". A 200 g
 * ceiling is not protection. A third-party brewer is one the machine cannot
 * measure, so it does not try.
 *
 * This said the opposite until #151. Only the comment was wrong; the bytes
 * were always right, and `Recipe.card.test.ts` now holds them.
 */
export const CUP_TYPE = {
    XPOD:  0x00,
    OTHER: 0x01, // no overflow protection
    OMNI:  0x02,
    TEA:   0x03  // high bits may contain the default number of cups to brew
}
```

- [ ] **Step 4: Run the card tests to verify nothing moved**

Run: `npx jest library/__tests__/Recipe.card.test.ts`

Expected: PASS, all tests. `cardFixtures.ts` is an independent reimplementation of the byte layout and is deliberately untouched, so a green run here is the proof that no byte changed.

- [ ] **Step 5: Commit**

```bash
git add library/Recipe.ts library/__tests__/Recipe.card.test.ts
git commit -m "Put the overflow protection note on the cup type that has none

OTHER, not OMNI, is the cup type the machine brews without overflow
protection. The bytes were always right and none of them moves here;
the comment was on the wrong line. A new characterisation test holds
all four values so the next person to read xBloom's cloud ordering has
to argue with a failing test rather than with a comment.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Rename the overflow-off shelf and swap the two glyphs

`overflowOff` selects `cupType = OMNI` under a label that, corrected, describes `OTHER`. Left alone it would say the same thing as `otherBrewer` while selecting the opposite recipes. It becomes `omniDripper`, labelled `OMNI DRIPPER`, keeping its clause. The two drawings change owners: the cone dripper is what an Omni Dripper is, and the cup coming over its rim belongs with the brewer that can overflow.

**Files:**
- Modify: `library/libraryFilters.ts:45`, `:180-187`, `:299`
- Modify: `constants/dotIcons.ts:623-645`
- Modify: `constants/shelfGlyphs.ts:27-28`
- Test: `library/__tests__/libraryFilters.test.ts:236-248`
- Test: `library/__tests__/RecipeDatabase.index.test.ts:762-765`
- Test: `constants/__tests__/dotIcons.test.ts:5-30`

- [ ] **Step 1: Write the failing tests**

In `library/__tests__/libraryFilters.test.ts`, replace the whole test at lines 236-248, which currently reads:

```typescript
    it("selects tea, pod, overflow-off and other-brewer by cup type", () => {
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            tea: {createdAt: 1, cupType: CUP_TYPE.TEA},
            pod: {createdAt: 2, cupType: CUP_TYPE.XPOD},
            omni: {createdAt: 3, cupType: CUP_TYPE.OMNI},
            other: {createdAt: 4, cupType: CUP_TYPE.OTHER}
        });
        expect(labelsMatching(db, "tea", uuids)).toEqual(["tea"]);
        expect(labelsMatching(db, "pods", uuids)).toEqual(["pod"]);
        expect(labelsMatching(db, "overflowOff", uuids)).toEqual(["omni"]);
        expect(labelsMatching(db, "otherBrewer", uuids)).toEqual(["other"]);
    });
```

with:

```typescript
    it("selects tea, pod, omni-dripper and other-brewer by cup type", () => {
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            tea: {createdAt: 1, cupType: CUP_TYPE.TEA},
            pod: {createdAt: 2, cupType: CUP_TYPE.XPOD},
            omni: {createdAt: 3, cupType: CUP_TYPE.OMNI},
            other: {createdAt: 4, cupType: CUP_TYPE.OTHER}
        });
        expect(labelsMatching(db, "tea", uuids)).toEqual(["tea"]);
        expect(labelsMatching(db, "pods", uuids)).toEqual(["pod"]);
        expect(labelsMatching(db, "omniDripper", uuids)).toEqual(["omni"]);
        expect(labelsMatching(db, "otherBrewer", uuids)).toEqual(["other"]);
    });

    /**
     * The bug #151 fixed was these two shelves being confused with each other,
     * so this says directly what the pair must never do. It is not implied by
     * the test above: that one would still pass if both shelves selected both
     * recipes and `labelsMatching` happened to sort them the same way.
     *
     * OMNI is what `newRecipe.ts` gives every new recipe, so a mistake that
     * emptied this shelf into the other one would take most of the library
     * with it.
     */
    it("keeps the two cup shelves disjoint", () => {
        const db = new RecipeDatabase();
        const uuids = seed(db, {
            omni: {createdAt: 1, cupType: CUP_TYPE.OMNI},
            other: {createdAt: 2, cupType: CUP_TYPE.OTHER}
        });

        expect(labelsMatching(db, "omniDripper", uuids)).not.toContain("other");
        expect(labelsMatching(db, "otherBrewer", uuids)).not.toContain("omni");
        expect(filterLabel("omniDripper")).toBe("OMNI DRIPPER");
        expect(filterLabel("otherBrewer")).toBe("OTHER BREWER");
    });
```

In `library/__tests__/RecipeDatabase.index.test.ts`, replace lines 761-765, which currently read:

```typescript
        const counts = db.countRecipesByFilter(
            ["pods", "overflowOff"], resolveStockFilter
        );

        expect(counts).toEqual({pods: 1, overflowOff: 2});
```

with:

```typescript
        const counts = db.countRecipesByFilter(
            ["pods", "omniDripper"], resolveStockFilter
        );

        expect(counts).toEqual({pods: 1, omniDripper: 2});
```

In `constants/__tests__/dotIcons.test.ts`, inside the `expect(names.sort()).toEqual([...])` array, replace these two entries:

```typescript
             "shelfNeverBrewed", "shelfOtherBrewer",
             "shelfOverflowOff", "shelfPods", "shelfQuickBrew", "shelfRecent",
```

with:

```typescript
             "shelfNeverBrewed", "shelfOmniDripper",
             "shelfOtherBrewer", "shelfPods", "shelfQuickBrew", "shelfRecent",
```

The list is asserted sorted, and `shelfOmniDripper` sorts before `shelfOtherBrewer`, so the order above is correct.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest library/__tests__/libraryFilters.test.ts library/__tests__/RecipeDatabase.index.test.ts constants/__tests__/dotIcons.test.ts`

Expected: FAIL. The filter tests fail because `"omniDripper"` is not a `FilterId`, which is both a TypeScript error and a runtime miss in `resolveStockFilter`; the icon test fails on the name list.

- [ ] **Step 3: Rename the filter**

In `library/libraryFilters.ts` line 45, in the `FilterId` union, replace:

```typescript
    | "overflowOff"
```

with:

```typescript
    | "omniDripper"
```

Then replace the two stock filter entries at lines 180-187, which currently read:

```typescript
    overflowOff: {
        label: "OVERFLOW OFF",
        clause: () => ({where: "cupType = ?", params: [CUP_TYPE.OMNI]})
    },
    otherBrewer: {
        label: "OTHER BREWER",
        clause: () => ({where: "cupType = ?", params: [CUP_TYPE.OTHER]})
    },
```

with:

```typescript
    // Named for the two cup types rather than for overflow protection, which
    // is the thing #151 got wrong. OTHER is the type the machine cannot
    // measure and so cannot protect, which would have made OVERFLOW OFF and
    // OTHER BREWER two names for one shelf, while OMNI -- what every new
    // recipe starts as -- had none at all. These are the editor's own words
    // for the same choice, so the shelf and the segment agree.
    omniDripper: {
        label: "OMNI DRIPPER",
        clause: () => ({where: "cupType = ?", params: [CUP_TYPE.OMNI]})
    },
    otherBrewer: {
        label: "OTHER BREWER",
        clause: () => ({where: "cupType = ?", params: [CUP_TYPE.OTHER]})
    },
```

Then in `STOCK_FILTER_ORDER` at line 299, replace:

```typescript
    "tea", "pods", "overflowOff", "otherBrewer", "singlePour", "fewStages",
```

with:

```typescript
    "tea", "pods", "omniDripper", "otherBrewer", "singlePour", "fewStages",
```

- [ ] **Step 4: Swap the two glyphs**

In `constants/dotIcons.ts`, replace the block at lines 623-645, which currently reads:

```typescript
    /** A cup with the brew coming over its rim. */
    shelfOverflowOff: [
        ".........",
        ".#.....#.",
        ".##...##.",
        "...###...",
        ".#######.",
        ".#.....#.",
        ".#.....#.",
        "..#####..",
        "........."
    ],
    /** A cone dripper on its stand: a brewer that is not the machine. */
    shelfOtherBrewer: [
        ".........",
        "#########",
        ".#######.",
        "..#####..",
        "...###...",
        "....#....",
        "....#....",
        "...###...",
        "........."
    ],
```

with:

```typescript
    /**
     * A cup with the brew coming over its rim.
     *
     * This drew the OVERFLOW OFF shelf until #151, which established that the
     * cup type without overflow protection is OTHER. The drawing did not
     * change; it simply belongs to the shelf it was always describing.
     */
    shelfOtherBrewer: [
        ".........",
        ".#.....#.",
        ".##...##.",
        "...###...",
        ".#######.",
        ".#.....#.",
        ".#.....#.",
        "..#####..",
        "........."
    ],
    /** A cone dripper on its stand, which is what an Omni Dripper is. */
    shelfOmniDripper: [
        ".........",
        "#########",
        ".#######.",
        "..#####..",
        "...###...",
        "....#....",
        "....#....",
        "...###...",
        "........."
    ],
```

Note the two names are swapped as well as reordered: the overflowing cup now answers to `shelfOtherBrewer`, and the cone dripper to the new `shelfOmniDripper`. Keep them adjacent and in this order so the file reads in the same order as `SHELF_GLYPHS`.

Then in `constants/shelfGlyphs.ts` lines 27-28, replace:

```typescript
    overflowOff:   "shelfOverflowOff",
    otherBrewer:   "shelfOtherBrewer",
```

with:

```typescript
    omniDripper:   "shelfOmniDripper",
    otherBrewer:   "shelfOtherBrewer",
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest library/__tests__/libraryFilters.test.ts library/__tests__/RecipeDatabase.index.test.ts constants/__tests__/dotIcons.test.ts`

Expected: PASS, all suites.

- [ ] **Step 6: Verify nothing else referenced the old names**

Run: `npx tsc --noEmit`

Expected: no output. `SHELF_GLYPHS` is typed `Record<FilterId, DotIconName>`, so a missed rename in either file is a compile error rather than a blank square at runtime.

Then run: `git grep -n "overflowOff\|shelfOverflowOff" -- ':!docs/superpowers'`

Expected: no matches. Hits under `docs/superpowers/specs/` are the two design documents and are correct as history; the shelves design doc is updated in Task 4.

- [ ] **Step 7: Commit**

```bash
git add library/libraryFilters.ts constants/dotIcons.ts constants/shelfGlyphs.ts library/__tests__/libraryFilters.test.ts library/__tests__/RecipeDatabase.index.test.ts constants/__tests__/dotIcons.test.ts
git commit -m "Name the two cup shelves after the cups

OVERFLOW OFF selected OMNI, and OTHER is the cup type without overflow
protection, so corrected the shelf would have said the same thing as
OTHER BREWER while selecting the opposite recipes -- and OMNI, which
every new recipe starts as, would have had no shelf at all. The pair is
now OMNI DRIPPER and OTHER BREWER, the editor's own words for the same
choice. The two drawings change owners rather than being redrawn: the
cone dripper is what an Omni Dripper is, and the cup coming over its rim
belongs with the brewer that can overflow.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Rewrite the cup help copy

**Files:**
- Modify: `constants/recipeHelp.ts:85-91`
- Modify: `library/shareLink.ts:54-58`

- [ ] **Step 1: Rewrite the help entry**

In `constants/recipeHelp.ts`, replace the `cup` entry at lines 85-91, which currently reads:

```typescript
    cup: {
        title:  "Cup",
        hint:   "Omni turns overflow protection off.",
        question: "Which cup type should I pick?",
        detail: "Omni disables overflow protection. Other is for " +
                "third-party brewers."
    },
```

with:

```typescript
    cup: {
        title:  "Cup",
        hint:   "Other turns overflow protection off.",
        question: "Which cup type should I pick?",
        detail: "Omni is xBloom's own dripper, so the machine knows when " +
                "your cup is full and stops. Other is for third-party " +
                "brewers it cannot measure, so nothing stops it."
    },
```

The hint is 40 characters, well inside the ninety `docs/help-copy.md` allows. No em dashes and no dashes at all, which is the house voice.

- [ ] **Step 2: Correct the comment on the cloud mapping**

In `library/shareLink.ts`, replace lines 54-58, which currently read:

```typescript
 * Local `OMNI` is 2 and cloud Omni is 2 by coincidence; local `OTHER` is 1 and
 * cloud Other is 3. A `+1` would silently turn every Other recipe into an Omni
 * one, which changes overflow protection.
```

with:

```typescript
 * Local `OMNI` is 2 and cloud Omni is 2 by coincidence; local `OTHER` is 1 and
 * cloud Other is 3. A `+1` would silently turn every Other recipe into an Omni
 * one, which turns overflow protection back on for a brewer the machine cannot
 * measure. Pour patterns cross in the same place, for the same reason; see
 * `cloudPattern` below.
```

The mapping itself is by name and stays exactly as it is.

- [ ] **Step 3: Run the tests that touch these files**

Run: `npx jest library/__tests__/shareLink.test.ts components/__tests__`

Expected: PASS. Nothing asserts the help strings directly, so this is a regression check rather than a proof; the copy is proven by `docs/help-copy.md` matching it, which Task 4 does.

- [ ] **Step 4: Lint**

Run: `npm run lint`

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add constants/recipeHelp.ts library/shareLink.ts
git commit -m "Say which cup type actually turns overflow protection off

The hint and the help sheet both named Omni. Omni is xBloom's own
dripper and the machine knows its shape well enough to stop; Other is
the third-party brewer it cannot measure, so Other is the one that can
overflow.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Correct the documentation

Four documents repeat the wrong claim, and two of them are the hand-maintained mirrors of strings this branch has already changed. `docs/copy.md` and `docs/help-copy.md` are the contract between the copy and the code, so leaving them stale is the same bug in a different file.

**Files:**
- Modify: `docs/help-copy.md:80`, `:84`
- Modify: `docs/copy.md:167`, `:306`, `:308`
- Modify: `.github/copilot-instructions.md:80`
- Modify: `docs/superpowers/specs/2026-09-16-library-shelves-design.md:311`, `:366`

- [ ] **Step 1: Update the help copy mirror**

In `docs/help-copy.md`, under the `## cup` heading, replace line 80:

```markdown
**Hint:** Omni turns overflow protection off.
```

with:

```markdown
**Hint:** Other turns overflow protection off.
```

and replace line 84:

```markdown
**Answer:** Omni disables overflow protection. Other is for third-party brewers.
```

with:

```markdown
**Answer:** Omni is xBloom's own dripper, so the machine knows when your cup is full and stops. Other is for third-party brewers it cannot measure, so nothing stops it.
```

- [ ] **Step 2: Update the copy table**

In `docs/copy.md`, replace line 167:

```markdown
| `recipe.cup.omni` | `library/Recipe.ts:367` | Cup-type name, Omni ("overflow protection off"). | `Omni` |
```

with:

```markdown
| `recipe.cup.omni` | `library/Recipe.ts:367` | Cup-type name, Omni (xBloom's own dripper, overflow protection on). | `Omni` |
```

Replace line 306:

```markdown
| `help.cup.hint` | `constants/recipeHelp.ts:87` | Cup field hint. | `Omni turns overflow protection off.` |
```

with:

```markdown
| `help.cup.hint` | `constants/recipeHelp.ts:87` | Cup field hint. | `Other turns overflow protection off.` |
```

Replace line 308:

```markdown
| `help.cup.detail` | `constants/recipeHelp.ts:89` | Cup long-form help. | `Omni disables overflow protection. Other is for third-party brewers.` |
```

with:

```markdown
| `help.cup.detail` | `constants/recipeHelp.ts:89` | Cup long-form help. | `Omni is xBloom's own dripper, so the machine knows when your cup is full and stops. Other is for third-party brewers it cannot measure, so nothing stops it.` |
```

Leave the `Source` column line numbers alone: `docs/copy.md` states its own rule that the ID and Source columns are the contract and only `Current text` is edited.

- [ ] **Step 3: Update the repository instructions**

In `.github/copilot-instructions.md`, replace line 80:

```markdown
- `CUP_TYPE.OMNI` is what the UI calls "overflow protection off".
```

with:

```markdown
- `CUP_TYPE.OTHER` is the cup type the machine brews without overflow protection, and the UI says so. `CUP_TYPE.OMNI` is xBloom's own dripper, whose shape the machine knows, so it stops. This file said the opposite until #151; the bytes never moved, and `Recipe.card.test.ts` now holds all four of them.
```

- [ ] **Step 4: Update the shelves design document**

In `docs/superpowers/specs/2026-09-16-library-shelves-design.md`, replace line 311:

```markdown
| Overflow protection off | `cupType = OMNI` |
```

with:

```markdown
| Omni dripper | `cupType = OMNI` |
```

and replace lines 365-366:

```markdown
`cupType` values come from `library/Recipe.ts:7`: `XPOD 0x00`, `OTHER 0x01`,
`OMNI 0x02` (which the UI calls "overflow protection off"), `TEA 0x03`.
```

with:

```markdown
`cupType` values come from `library/Recipe.ts:7`: `XPOD 0x00`, `OTHER 0x01`
(the one the UI calls "overflow protection off", corrected in #151), `OMNI
0x02`, `TEA 0x03`.
```

- [ ] **Step 5: Verify the copy mirrors match the source exactly**

Run:

```bash
grep -n "overflow protection" constants/recipeHelp.ts docs/help-copy.md docs/copy.md .github/copilot-instructions.md
```

Expected: every line that names a cup type names **Other** as the one without protection. Read the hint and detail in `docs/help-copy.md` and `docs/copy.md` against `constants/recipeHelp.ts` word for word; the two documents exist to be diffable against the source by eye.

- [ ] **Step 6: Commit**

```bash
git add docs/help-copy.md docs/copy.md .github/copilot-instructions.md docs/superpowers/specs/2026-09-16-library-shelves-design.md
git commit -m "Correct the documents that recorded the wrong cup type

Four documents repeated the claim the code has just stopped making,
including the two hand-maintained mirrors of the help strings, which are
the contract between the copy and the source and so cannot be left
behind by a copy change.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Full verification

Everything CI checks, on the whole tree, before this is offered as a pull request.

**Files:** none.

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`

Expected: no output, exit 0.

- [ ] **Step 2: Lint**

Run: `npm run lint`

Expected: no errors.

- [ ] **Step 3: Full test suite**

Run: `npm test`

Expected: all suites pass. Watch in particular for `library/__tests__/Recipe.card.test.ts` and anything touching `cardFixtures.ts`: those are the independent check that no byte moved, and a failure there means this branch did something it promised not to.

- [ ] **Step 4: Dependency health**

Run: `npx expo-doctor`

Expected: all checks pass. CI treats this as a hard failure.

- [ ] **Step 5: Confirm no card format change reached the diff**

Run: `git diff origin/main --stat -- library/__tests__/cardFixtures.ts library/NFC.ts`

Expected: empty. Both files must be untouched.

Then run: `git diff origin/main -- library/Recipe.ts | grep -E "^[-+].*0x0[0-3]"`

Expected: the only `+`/`-` lines are the two constants whose trailing comments moved, with `OTHER: 0x01` and `OMNI: 0x02` keeping their values.

- [ ] **Step 6: Push and open the pull request**

```bash
git push -u origin cup-overflow-copy
gh pr create --title "Say which cup type brews without overflow protection" --body "Closes #151."
```

Expand the body from the spec at `docs/superpowers/specs/2026-09-28-cup-overflow-protection-design.md`, leading with the finding that the issue's proposed byte swap is not what is needed: pour patterns cross xBloom's cloud ordering in the same place, `OMNI 0x02` is the oldest value in the enum, and the observation behind the report is about the two names rather than the two bytes. No byte changes, no migration, no hardware confirmation required.

---

## Notes for the implementer

**No hardware test is needed.** #151 asked for one because it proposed changing a byte written to a genuine card. This branch changes no byte. The naming it corrects is attested three ways: the report itself, xBloom's own cloud label `2 = Omni/Dripper`, and the recorded cup weight ranges in `docs/machine-integration/ble-protocol.md`.

**Leave the legacy migration alone.** `library/Recipe.ts:280` reads `else if (this.cupType === 0x04) { this.cupType = 0x01; // 0x01 is for Other }`. #151 raised it as a question that could not be settled from the comment, because a swap would have made the byte and the name disagree. With no swap both readings give the same answer, so it is correct exactly as written. Do not touch it, and do not add a migration anywhere else: no stored recipe's cup type changes.

**Do not "fix" the cloud mappings.** `library/shareLink.ts` and `library/XBloomRecipe.ts` map cup types and pour patterns **by name**, which is why they need no edit. A `+1` looks tempting and is wrong for both.

**The filter ids are transient for the query, but not for a put-away shelf.** `hooks/useLibraryQuery.ts` persists `librarySort`, `librarySortDirection`, `libraryFavouritesFirst` and `libraryView` only, so the live query cannot orphan a stored value. The `hiddenShelves` and `myShelves` settings are a different matter: they store canonical shelf ids as JSON, and `canonicalShelfId` in `library/hiddenShelves.ts` returns a stock id unchanged, so a stored `overflowOff` would stop matching and the shelf would silently come back. Fold the old id onto the new one in `canonicalShelfId`. Do not add a `Settings` key or a database migration for it.

# Bypass Water Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user turn bypass water on, set its volume and temperature, see it in the stage ladder and the profile graph, and send it to the machine over BLE — while keeping it out of the card format, out of the pour-sum invariant, and out of share-link churn.

**Architecture:** Bypass is not a `Pour`. It stays as three fields on `Recipe` (`bypassEnabled`, `bypassVolume`, `bypassTemp` — note `isEnableBypassWater` is the *cloud wire* name only, where 1 = on and 2 = off) and is rendered as a closing rung on the stage ladder — a sibling of the stage tiles, never an entry in `recipe.pours`. Selection is modelled with a sentinel (`openStage: number | "bypass" | null`) so TypeScript forces every consumer that indexes `recipe.pours` to narrow. The graph gains one extra band. The card path is untouched.

**Tech Stack:** Expo SDK 57, React Native 0.86, Tamagui, react-native-svg, expo-sqlite, jest + @testing-library/react-native v14, React Compiler (on in app, off under jest).

**Spec:** `docs/superpowers/specs/2026-09-08-bypass-editing-design.md`

---

## Ground rules for the implementer

Read these once. They are the traps this codebase has already sprung.

1. **Never import a runtime value from `library/NFC.ts`.** It drags `react-native-nfc-manager` into every consumer and broke 37 suites once. That is why `library/cardWriteErrors.ts` exists.
2. **The pour-sum invariant is sacred.** The machine rejects a recipe unless the sum of pour volumes equals `dosage x ratio`. `isPourVolumeValid()`, `autoFixPourVolumes()` and `getTotalVolume()` must **not** learn about bypass.
3. **Mutate `Recipe` in place, then bump a key.** Do not clone into state, do not make `Recipe` immutable. The key goes on the deck, not the ScrollView.
4. **`balance` stays derived** (`hooks/useRecipeEditor.ts:74-78`). The old imperative version went stale; that was issue #40.
5. **React Compiler is on.** No hand-written `useMemo`/`useCallback`. Do not read whole `props` inside a hook. `try`/`finally` bails the compiler out.
6. **Components live at module scope.** A component defined inside another component body is a new type every render and remounts. Fixed twice already.
7. **`@testing-library/react-native` v14 `render` and `fireEvent` are async.** A missing `await` leaves the screen empty and the test passes for the wrong reason. Always render via `renderWithProviders` from `test-utils/render.tsx`.
8. **The fixture-equals-default trap.** A fixture that uses the code default cannot tell a real binding from a hardcoded constant. **No bypass test may use 30 ml or 85 C as its fixture.** Use 45 ml / 60 C.
9. **Copy is British English.** "Tap" on screen; "Press" only for the machine physical button. Units lower-case in Inter prose, upper-case in Doto. No em dashes in app copy. Every new string needs a `docs/copy.md` row with an accurate source line number, re-checked after the final edit.
10. **All colour from `constants/colors.ts`.** No hex literals in `app/` or `components/`.
11. **Commits:** `git -c commit.gpgsign=false commit -F <file>` with the trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`. Write the message to a temp file; heredocs with apostrophes break the tool.
12. **`gh` always needs `-R hessius/XBRecipeWriterPlus`.**

**Validation baseline before you start:** `npm run typecheck` clean, `npm run lint` 0 errors / 6 warnings, `npm test` 149 suites / 2367 tests, `npx expo-doctor` 21/21.

---

## File structure

**Create**
- `library/bypassLimits.ts` — bypass volume range and seed constants. Pure, no React, no NFC.
- `library/__tests__/bypassLimits.test.ts`
- `components/BypassRung.tsx` — the ladder rung plus its dashed ghost.
- `components/__tests__/BypassRung.test.tsx`

**Create (tests only)**
- `hooks/__tests__/useRecipeEditor.bypass.test.ts`
- `hooks/__tests__/useRecipeEditor.xid.test.ts`
- `app/__tests__/editRecipe.bypass.test.tsx`
- `library/machine/__tests__/protocol.bypass.test.ts`
- `library/machine/__tests__/Machine.bypass.test.ts`
- `constants/__tests__/recipeHelp.test.ts` (only if it does not already exist)

**Modify**
- `hooks/useRecipeEditor.ts` — `setBypassEnabled`, `editBypass`, module-scope `applyBypassField`, XID lookup warning.
- `library/XBloomRecipe.ts` — relax import by one field.
- `library/shareLink.ts` — no change expected; pinned by a new test.
- `components/StageProfile.tsx` — one extra band, reduced curve width, truncated target rule, variant-B bypass mark.
- `app/editRecipe.tsx` — sentinel `openStage`, rung placement, split BREW total, stage advisory, XID warning row.
- `constants/recipeHelp.ts` — bypass help entries (a `FieldRow` cannot be drawn without them).
- `library/cardWriteErrors.ts` — receives `SIGNATURE_BYTES`, gains `maxStagesForBytes`.
- `library/NFC.ts` — re-exports `SIGNATURE_BYTES` from `cardWriteErrors`.
- `library/machine/Machine.ts` — real 8102 values, `bypassTempEncoding`, remove `steepEncoding`.
- `library/machine/protocol.ts` — `bypassTempValue`, remove `teaSteepBytes` / `TeaSteepEncoding`.
- `library/machine/commands.ts` — note update only.
- `library/Settings.ts` — add `bypassTempEncoding`, remove `teaSteepEncoding`.
- `hooks/useBrew.ts` — thread the new setting, drop the old one.
- `app/machine.tsx` — swap the console picker.
- `docs/copy.md` — new rows, delete tea-steep rows.

**Delete**
- `components/BypassSection.tsx`
- `components/__tests__/BypassSection.test.tsx`

**Sequencing:** Tasks 9, 10, 14 and 15 all touch `app/editRecipe.tsx`; Tasks 11, 14, 15 and 16 all touch `docs/copy.md`. **Run every task in order. Do not dispatch these in parallel** — those two files are the conflict points, and each is touched four times.

Tasks 8 and 9 share a commit: Task 8 deletes `BypassSection` and Task 9 removes the last import of it, so committing between them would leave a revision that does not typecheck.

---
## Task 1: Bypass limits and seed constants

The bypass ranges are **not** card limits. They must never appear in
`cardWriteProblems` — bypass never reaches a card, so a bypass value can never be
a reason to refuse a write.

**Files:**
- Create: `library/bypassLimits.ts`
- Test: `library/__tests__/bypassLimits.test.ts`

- [x] **Step 1: Write the failing test**

```ts
import {
    BYPASS_VOLUME, BYPASS_DEFAULT_VOLUME, BYPASS_DEFAULT_TEMPERATURE, clampBypassVolume
} from "@/library/bypassLimits";
import {cardLimits} from "@/library/cardLimits";

describe("bypass limits", () => {
    it("allows 1 to 500 ml", () => {
        expect(BYPASS_VOLUME).toEqual({min: 1, max: 500});
    });

    it("seeds a freshly enabled bypass at 30 ml and 85 C", () => {
        expect(BYPASS_DEFAULT_VOLUME).toBe(30);
        expect(BYPASS_DEFAULT_TEMPERATURE).toBe(85);
    });

    it("clamps to the range", () => {
        expect(clampBypassVolume(0)).toBe(1);
        expect(clampBypassVolume(9000)).toBe(500);
        expect(clampBypassVolume(45)).toBe(45);
    });

    it("reuses the card temperature range rather than declaring its own", () => {
        // The machine has one kettle. A bypass temperature outside the range a
        // stage may use is not a thing the hardware can do.
        expect(cardLimits.TEMPERATURE).toEqual({min: 39, max: 99});
    });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npx jest library/__tests__/bypassLimits.test.ts`
Expected: FAIL — `Cannot find module '@/library/bypassLimits'`.

- [x] **Step 3: Write the implementation**

Create `library/bypassLimits.ts`:

```ts
/**
 * What the editor will let a bypass be.
 *
 * Deliberately not in `cardLimits`. Bypass water never reaches a card, so a
 * bypass value can never be a reason to refuse a write, and putting it there
 * would invite exactly that. The temperature range is imported rather than
 * restated: the machine has one kettle, so a bypass temperature outside the
 * range a stage may use is not a thing the hardware can do.
 */

import {cardLimits, type Range} from "@/library/cardLimits";

/** 1 ml because zero water with bypass on is bypass off wearing a hat. */
export const BYPASS_VOLUME: Range = {min: 1, max: 500};

/** The range the temperature control offers. Shared with the stage tiles. */
export const BYPASS_TEMPERATURE: Range = cardLimits.TEMPERATURE;

/**
 * What a freshly enabled bypass starts at.
 *
 * 30 ml is roughly the smallest dilution anyone bothers with, and 85 C is what
 * `Recipe` already defaults an untouched bypass temperature to, so enabling
 * bypass on a recipe that has never had one does not move the number.
 */
export const BYPASS_DEFAULT_VOLUME = 30;
export const BYPASS_DEFAULT_TEMPERATURE = 85;

export function clampBypassVolume(value: number): number {
    return Math.min(Math.max(Math.round(value), BYPASS_VOLUME.min), BYPASS_VOLUME.max);
}
```

If `Range` is not exported from `library/cardLimits.ts`, export the existing type
rather than declaring a second one. Check with:

```bash
grep -n "export type Range\|type Range" library/cardLimits.ts
```

If it is declared but not exported, add `export` to that declaration.

- [x] **Step 4: Run the test and watch it pass**

Run: `npx jest library/__tests__/bypassLimits.test.ts`
Expected: PASS, 4 tests.

- [x] **Step 5: Commit**

```bash
git add library/bypassLimits.ts library/__tests__/bypassLimits.test.ts library/cardLimits.ts
printf '%s\n' "feat(bypass): add bypass volume range and seed constants" "" "Kept out of cardLimits on purpose: bypass never reaches a card, so a" "bypass value must never become a reason to refuse a write." "" "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" > /tmp/xbrw-commit.txt
git -c commit.gpgsign=false commit -F /tmp/xbrw-commit.txt
```

---

## Task 2: Help entries for the bypass controls

`FieldRow` and `StageLabel` both take their words from `RECIPE_HELP` and have no
`label` prop. **A control without a help entry literally cannot be drawn.** So
this comes before the component that needs it.

**Files:**
- Modify: `constants/recipeHelp.ts`
- Test: `constants/__tests__/recipeHelp.test.ts` (create it if it does not exist)

- [x] **Step 1: Write the failing test**

Add to `constants/__tests__/recipeHelp.test.ts`:

```ts
import {RECIPE_HELP} from "@/constants/recipeHelp";

describe("bypass help", () => {
    it("has a topic for the rung and for each of its two controls", () => {
        expect(RECIPE_HELP.bypass.title).toBe("Bypass water");
        expect(RECIPE_HELP.bypassVolume.title).toBe("Volume");
        expect(RECIPE_HELP.bypassTemperature.title).toBe("Temperature");
    });

    it("says in the long form that a card cannot hold it", () => {
        expect(RECIPE_HELP.bypass.detail).toContain("card");
    });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npx jest constants/__tests__/recipeHelp.test.ts`
Expected: FAIL — `Property 'bypass' does not exist` at typecheck, or
`Cannot read properties of undefined` at runtime.

- [x] **Step 3: Add the entries**

In `constants/recipeHelp.ts`, inside the `ENTRIES` object, after the `tea` entry:

```ts
    bypass: {
        title:  "Bypass water",
        hint:   "Extra water added straight to the cup.",
        question: "What is bypass water?",
        detail: "Bypass water is dispensed straight into the cup at the end of " +
                "the brew, without passing through the coffee. It dilutes a " +
                "concentrated brew without weakening the extraction, which is " +
                "how a strong small brew is turned into a full cup. It does " +
                "not count towards the stage volumes, and a card has no room " +
                "to store it, so a recipe written to a card loses it."
    },
    bypassVolume: {
        title: "Volume"
    },
    bypassTemperature: {
        title: "Temperature"
    },
```

Note the two control entries carry no `hint`, `question` or `detail`. A hint that
restates its own label is worse than none, and `DETAILED_TOPICS` only enforces
that `question` and `detail` travel together — it does not demand them.

- [x] **Step 4: Run the test and watch it pass**

Run: `npx jest constants/__tests__/recipeHelp.test.ts && npm run typecheck`
Expected: PASS, and typecheck clean.

- [x] **Step 5: Commit**

```bash
git add constants/recipeHelp.ts constants/__tests__/recipeHelp.test.ts
printf '%s\n' "feat(bypass): add help entries for the bypass controls" "" "FieldRow and StageLabel take their words from RECIPE_HELP and have no" "label prop, so a control without an entry cannot be drawn at all." "" "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" > /tmp/xbrw-commit.txt
git -c commit.gpgsign=false commit -F /tmp/xbrw-commit.txt
```

---

## Task 3: Bypass mutators on the editor hook

`Recipe` is mutated in place and changes are published by bumping `key`. The
writer lives at **module scope** for the same reason `applyStageField` and
`applyGrindMinimum` do: the React Compiler's immutability check rejects a direct
assignment to a value derived from state, even inside a narrowing guard.

**Files:**
- Modify: `hooks/useRecipeEditor.ts`
- Test: `hooks/__tests__/useRecipeEditor.bypass.test.ts` (create)

- [x] **Step 1: Write the failing test**

```ts
import {act, renderHook} from "@testing-library/react-native";

import {useRecipeEditor} from "@/hooks/useRecipeEditor";
import Recipe from "@/library/Recipe";

function editorFor(recipe: Recipe) {
    return renderHook(() => useRecipeEditor({
        recipeJSON:      JSON.stringify(recipe),
        temperatureUnit: "C",
        onSaved:         () => {}
    }));
}

/** 45 ml and 60 C on purpose: neither is a default, so a passing assertion
 *  proves a real binding rather than a constant that happens to agree. */
function recipeWithBypass(): Recipe {
    const recipe = new Recipe();
    recipe.bypassEnabled = true;
    recipe.bypassVolume  = 45;
    recipe.bypassTemp    = 60;
    return recipe;
}

describe("useRecipeEditor bypass", () => {
    it("seeds volume and temperature when bypass is switched on from off", () => {
        const {result} = editorFor(new Recipe());

        act(() => result.current.setBypassEnabled(true));

        expect(result.current.recipe?.bypassEnabled).toBe(true);
        expect(result.current.recipe?.bypassVolume).toBe(30);
        expect(result.current.recipe?.bypassTemp).toBe(85);
    });

    it("keeps the existing values when bypass is switched on again", () => {
        const {result} = editorFor(recipeWithBypass());

        act(() => result.current.setBypassEnabled(false));
        act(() => result.current.setBypassEnabled(true));

        expect(result.current.recipe?.bypassVolume).toBe(45);
        expect(result.current.recipe?.bypassTemp).toBe(60);
    });

    it("leaves the volume and temperature alone when switching off", () => {
        const {result} = editorFor(recipeWithBypass());

        act(() => result.current.setBypassEnabled(false));

        expect(result.current.recipe?.bypassEnabled).toBe(false);
        expect(result.current.recipe?.bypassVolume).toBe(45);
        expect(result.current.recipe?.bypassTemp).toBe(60);
    });

    it("edits each field and publishes the change", () => {
        const {result} = editorFor(recipeWithBypass());
        const before = result.current.key;

        act(() => result.current.editBypass("volume", 120));
        act(() => result.current.editBypass("temperature", 70));

        expect(result.current.recipe?.bypassVolume).toBe(120);
        expect(result.current.recipe?.bypassTemp).toBe(70);
        expect(result.current.key).toBeGreaterThan(before);
    });

    it("clamps the volume to the bypass range", () => {
        const {result} = editorFor(recipeWithBypass());

        act(() => result.current.editBypass("volume", 9000));

        expect(result.current.recipe?.bypassVolume).toBe(500);
    });

    it("never lets bypass water enter the pour-sum invariant", () => {
        // The machine refuses a recipe whose stages do not add up to
        // dose x ratio. Bypass is dispensed outside that sum, so turning it on
        // must not change the balance, the target, or the write gate.
        const {result} = editorFor(new Recipe());
        const target = result.current.balance.target;
        const poured = result.current.balance.poured;
        const balanced = result.current.balance.balanced;

        act(() => result.current.setBypassEnabled(true));
        act(() => result.current.editBypass("volume", 250));

        expect(result.current.balance.target).toBe(target);
        expect(result.current.balance.poured).toBe(poured);
        expect(result.current.balance.balanced).toBe(balanced);
        expect(result.current.writeProblems).toEqual([]);
    });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npx jest hooks/__tests__/useRecipeEditor.bypass.test.ts`
Expected: FAIL — `result.current.setBypassEnabled is not a function`.

- [x] **Step 3: Implement**

In `hooks/useRecipeEditor.ts`, add the import at the top:

```ts
import {
    BYPASS_DEFAULT_TEMPERATURE, BYPASS_DEFAULT_VOLUME, clampBypassVolume
} from "@/library/bypassLimits";
```

Add the type next to the other exported types near `RECIPE_LABELS`:

```ts
/** The two bypass values the rung can edit. */
export type BypassField = "volume" | "temperature";
```

Inside the hook, just after `editStage`:

```ts
    /**
     * Turn bypass water on or off.
     *
     * Switching on seeds a recipe that has never had a bypass, so the rung
     * opens on a usable number rather than on zero millilitres of water. A
     * recipe that already carries values keeps them, so toggling off and back
     * on is not destructive.
     */
    function setBypassEnabled(on: boolean) {
        if (!recipe) return;
        applyBypassEnabled(recipe, on);
        setKey((prev) => prev + 1);
    }

    /** Edit one bypass value. */
    function editBypass(field: BypassField, value: number) {
        if (!recipe) return;
        applyBypassField(recipe, field, value);
        setKey((prev) => prev + 1);
    }
```

Add both to the returned object, immediately after `editStage,`:

```ts
        setBypassEnabled,
        editBypass,
```

And at module scope, next to `applyStageField`:

```ts
/**
 * Turn bypass on or off, seeding an unset bypass on the way on.
 *
 * At module scope for the same reason as `applyStageField`: the React
 * Compiler's immutability check rejects a direct assignment to a value derived
 * from state, even inside a narrowing guard.
 */
function applyBypassEnabled(recipe: Recipe, on: boolean) {
    if (on && recipe.bypassVolume <= 0) {
        recipe.bypassVolume = BYPASS_DEFAULT_VOLUME;
        recipe.bypassTemp   = BYPASS_DEFAULT_TEMPERATURE;
    }
    recipe.bypassEnabled = on;
}

/** Write one bypass value. Module scope, as above. */
function applyBypassField(recipe: Recipe, field: BypassField, value: number) {
    if (field === "volume") recipe.bypassVolume = clampBypassVolume(value);
    else recipe.bypassTemp = Math.round(value);
}
```

- [x] **Step 4: Run the tests and watch them pass**

Run: `npx jest hooks/__tests__/useRecipeEditor.bypass.test.ts && npm run typecheck`
Expected: PASS, 6 tests; typecheck clean.

- [x] **Step 5: Prove the seed test is not tautological**

The second test would also pass if `applyBypassEnabled` seeded unconditionally,
because `Recipe`'s own default temperature is already 85. Confirm the binding by
mutating the source and watching a test go red:

```bash
sed -i '' 's/if (on \&\& recipe.bypassVolume <= 0)/if (on)/' hooks/useRecipeEditor.ts
grep -n "if (on)" hooks/useRecipeEditor.ts
npx jest hooks/__tests__/useRecipeEditor.bypass.test.ts
```

Expected: the `grep` prints the changed line (a `sed` that matched nothing looks
exactly like a surviving mutant), and "keeps the existing values" FAILS with
`Expected: 45, Received: 30`. Then put it back:

```bash
sed -i '' 's/if (on) {/if (on \&\& recipe.bypassVolume <= 0) {/' hooks/useRecipeEditor.ts
grep -n "bypassVolume <= 0" hooks/useRecipeEditor.ts
npx jest hooks/__tests__/useRecipeEditor.bypass.test.ts
```

Expected: PASS again.

- [x] **Step 6: Commit**

```bash
git add hooks/useRecipeEditor.ts hooks/__tests__/useRecipeEditor.bypass.test.ts
printf '%s\n' "feat(bypass): add setBypassEnabled and editBypass to the editor hook" "" "Pinned by a test that bypass volume never enters the pour-sum invariant:" "the machine refuses a recipe whose stages do not add up to dose x ratio," "and bypass is dispensed outside that sum." "" "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" > /tmp/xbrw-commit.txt
git -c commit.gpgsign=false commit -F /tmp/xbrw-commit.txt
```

---

## Task 4: Relax the import by exactly one field

Today `library/XBloomRecipe.ts:77-100` drops **both** bypass values if either is
implausible. That is right for volume, which has no safe default, and wrong for
temperature, which does: 85 C. A recipe whose temperature is missing or garbage
currently arrives with no bypass at all, silently.

**Change exactly one thing.** The volume rule stays.

**Files:**
- Modify: `library/XBloomRecipe.ts:77-100`
- Test: `library/__tests__/XBloomRecipe.bypass.test.ts`

- [x] **Step 1: Write the failing test**

Append to `library/__tests__/XBloomRecipe.bypass.test.ts` (match the fixture
helper already in that file; the shape below is the payload the existing tests
build, so reuse theirs rather than the literal here if they differ):

```ts
describe("bypass import, relaxed temperature", () => {
    it("falls back to 85 C when the temperature is missing", () => {
        const recipe = importWithBypass({
            isEnableBypassWater: 1, bypassVolume: 45, bypassTemp: undefined
        });

        expect(recipe.bypassEnabled).toBe(true);
        expect(recipe.bypassVolume).toBe(45);
        expect(recipe.bypassTemp).toBe(85);
    });

    it("falls back to 85 C when the temperature is out of range", () => {
        const recipe = importWithBypass({
            isEnableBypassWater: 1, bypassVolume: 45, bypassTemp: 4000
        });

        expect(recipe.bypassEnabled).toBe(true);
        expect(recipe.bypassTemp).toBe(85);
    });

    it("still refuses an implausible volume outright", () => {
        // There is no safe default for volume: guessing would brew someone an
        // unexpected dilution, which is the one failure worth being loud about.
        const recipe = importWithBypass({
            isEnableBypassWater: 1, bypassVolume: 9000, bypassTemp: 60
        });

        expect(recipe.bypassEnabled).toBe(false);
        expect(recipe.bypassVolume).toBe(0);
    });
});
```

If the file has no `importWithBypass` helper, add one that builds the minimal
`recipeVo` the existing tests use and runs the importer on it.

- [x] **Step 2: Run it and watch it fail**

Run: `npx jest library/__tests__/XBloomRecipe.bypass.test.ts`
Expected: FAIL — the first two cases give `bypassEnabled: false`.

- [x] **Step 3: Implement**

Replace the block at `library/XBloomRecipe.ts:84-100` with:

```ts
            // Volume has no safe default: guessing one would brew someone an
            // unexpected dilution, so an implausible volume drops the bypass
            // entirely. Temperature does have one -- 85 C, the same value
            // `Recipe` starts from -- so a missing or garbled temperature no
            // longer costs the user their bypass. That asymmetry is deliberate.
            const bypassVolumeValid = typeof rawBypassVolume === "number" && Number.isFinite(rawBypassVolume)
                && rawBypassVolume >= 0 && rawBypassVolume <= 500;
            const bypassTempValid = typeof rawBypassTemp === "number" && Number.isFinite(rawBypassTemp)
                && rawBypassTemp >= 0 && rawBypassTemp <= 100;

            if (bypassVolumeValid) {
                recipe.bypassVolume = rawBypassVolume;
                recipe.bypassTemp   = bypassTempValid ? rawBypassTemp : BYPASS_DEFAULT_TEMPERATURE;
                // isEnableBypassWater: 1 = ON, 2 = OFF — xBloom's inverted scheme.
                // A non-zero volume is also required; flag-on with zero water
                // means the machine dispenses nothing, so treat it as off.
                recipe.bypassEnabled = rawBypassFlag === 1 && rawBypassVolume > 0;
            }
            // An implausible volume leaves bypass at its defaults
            // (bypassEnabled: false, bypassVolume: 0, bypassTemp: 85).
```

Add the import at the top of `library/XBloomRecipe.ts`:

```ts
import {BYPASS_DEFAULT_TEMPERATURE} from "@/library/bypassLimits";
```

- [x] **Step 4: Run the tests and watch them pass**

Run: `npx jest library/__tests__/XBloomRecipe`
Expected: PASS, including every pre-existing case in the file.

- [x] **Step 5: Commit**

```bash
git add library/XBloomRecipe.ts library/__tests__/XBloomRecipe.bypass.test.ts
printf '%s\n' "fix(bypass): keep an imported bypass when only the temperature is bad" "" "Volume still gates the whole import because it has no safe default." "Temperature has one, 85 C, so a garbled temperature no longer silently" "costs the user their bypass." "" "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" > /tmp/xbrw-commit.txt
git -c commit.gpgsign=false commit -F /tmp/xbrw-commit.txt
```

---

## Task 5: Pin the share payload against churn

`Recipe.shareSnapshot` stores the snapshot that produced a link, and staleness is
fresh-versus-stored. If the payload for a recipe **without** bypass shifts by so
much as a field, every already-shared recipe reads as stale and re-mints a
duplicate row in the shared service account. No code change is expected here —
this task exists so a later refactor cannot do it by accident.

**Files:**
- Modify: `library/__tests__/shareLink.test.ts`

- [x] **Step 1: Write the pinning test**

```ts
describe("share payload churn", () => {
    it("sends the same bypass fields for a recipe that has no bypass", () => {
        // Load-bearing constants, not arbitrary. `shareLink` used to hardcode
        // these three; the Recipe defaults were chosen to match, so that
        // adding bypass fields to the model changed nothing on the wire. If
        // this test fails, every already-shared recipe now reads as stale and
        // re-mints a duplicate row in the shared service account.
        const payload = buildSharePayload(new Recipe());

        expect(payload.isEnableBypassWater).toBe(2);
        expect(payload.bypassVolume).toBe(0);
        expect(payload.bypassTemp).toBe(85);
    });

    it("sends a live bypass when one is enabled", () => {
        const recipe = new Recipe();
        recipe.bypassEnabled = true;
        recipe.bypassVolume  = 45;
        recipe.bypassTemp    = 60;

        const payload = buildSharePayload(recipe);

        expect(payload.isEnableBypassWater).toBe(1);
        expect(payload.bypassVolume).toBe(45);
        expect(payload.bypassTemp).toBe(60);
    });

    it("suppresses bypass for tea, which the machine ignores", () => {
        const recipe = new Recipe();
        recipe.cupType = CUP_TYPE.TEA;
        recipe.bypassEnabled = true;
        recipe.bypassVolume  = 45;
        recipe.bypassTemp    = 60;

        const payload = buildSharePayload(recipe);

        expect(payload.isEnableBypassWater).toBe(2);
        expect(payload.bypassVolume).toBe(0);
        expect(payload.bypassTemp).toBe(85);
    });
});
```

Use whatever import block `library/__tests__/shareLink.test.ts` already has;
`buildSharePayload`, `Recipe` and `CUP_TYPE` are all it needs.

- [x] **Step 2: Run it and watch it pass immediately**

Run: `npx jest library/__tests__/shareLink.test.ts`
Expected: PASS. This is the one test in the plan that is green on arrival — it
pins existing behaviour rather than driving new behaviour.

- [x] **Step 3: Prove it is actually watching**

```bash
sed -i '' 's/bypassTemp:          tea ? 85 : recipe.bypassTemp,/bypassTemp:          tea ? 90 : recipe.bypassTemp,/' library/shareLink.ts
grep -n "tea ? 90" library/shareLink.ts
npx jest library/__tests__/shareLink.test.ts
```

Expected: the `grep` prints the changed line, and the tea case FAILS with
`Expected: 85, Received: 90`. Revert:

```bash
sed -i '' 's/bypassTemp:          tea ? 90 : recipe.bypassTemp,/bypassTemp:          tea ? 85 : recipe.bypassTemp,/' library/shareLink.ts
git diff --stat library/shareLink.ts
```

Expected: `git diff --stat` prints nothing — the file is back to HEAD.

- [x] **Step 4: Commit**

```bash
git add library/__tests__/shareLink.test.ts
printf '%s\n' "test(share): pin the bypass fields of the share payload" "" "A shift in the payload for a recipe without bypass makes every" "already-shared recipe read as stale and re-mint a duplicate row." "" "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" > /tmp/xbrw-commit.txt
git -c commit.gpgsign=false commit -F /tmp/xbrw-commit.txt
```

---
## Task 6: The bypass mark on the stage profile

Mockup variant B: a dashed outline in `palette.info` with a faint fill, in its
own band at the right-hand end, with the target rule truncated so it stops at the
last stage. The rule means "the volume the stages have to reach", and bypass is
not stage water — running the rule under the bypass band would say the opposite.

**With no bypass, every pixel must stay exactly where it is today.** That is what
the first test pins.

**Files:**
- Modify: `components/StageProfile.tsx`
- Test: `components/__tests__/StageProfile.test.tsx`

- [x] **Step 1: Write the failing tests**

Append to `components/__tests__/StageProfile.test.tsx`:

```ts
import {profileScale} from "@/components/StageProfile";

describe("profileScale with bypass", () => {
    it("ignores an absent bypass", () => {
        expect(profileScale(260, 260)).toBe(260);
        expect(profileScale(260, 260, 0)).toBe(260);
    });

    it("does not let a bypass taller than the brew overflow the box", () => {
        expect(profileScale(100, 100, 400)).toBe(400);
    });
});

describe("StageProfile bypass mark", () => {
    it("draws nothing extra when bypass is off", async () => {
        await renderWithProviders(
            <StageProfile pours={pours([60, 100, 100])} target={260}
                          accent={palette.brand} width={300} height={92}/>
        );

        expect(screen.queryByTestId("stage-profile-bypass")).toBeNull();
    });

    it("draws the bypass band when a bypass volume is given", async () => {
        await renderWithProviders(
            <StageProfile pours={pours([60, 100, 100])} target={260}
                          accent={palette.brand} width={300} height={92}
                          bypassVolume={45}/>
        );

        expect(screen.getByTestId("stage-profile-bypass")).toBeTruthy();
    });

    it("stops the target rule at the last stage", async () => {
        await renderWithProviders(
            <StageProfile pours={pours([60, 100, 100])} target={260}
                          accent={palette.brand} width={300} height={92}
                          bypassVolume={45}/>
        );

        // Three stages plus one bypass band: the stages own three quarters.
        expect(screen.getByTestId("stage-profile-target").props.x2).toBe(225);
    });

    it("runs the target rule the whole width without a bypass", async () => {
        await renderWithProviders(
            <StageProfile pours={pours([60, 100, 100])} target={260}
                          accent={palette.brand} width={300} height={92}/>
        );

        expect(screen.getByTestId("stage-profile-target").props.x2).toBe(300);
    });

    it("highlights the bypass band when it is the selection", async () => {
        await renderWithProviders(
            <StageProfile pours={pours([60, 100, 100])} target={260}
                          accent={palette.brand} width={300} height={92}
                          bypassVolume={45} selected="bypass"/>
        );

        expect(screen.getByTestId("stage-profile-band").props.x).toBe(225);
    });

    it("offers the bypass band as a control of its own", async () => {
        const onSelect = jest.fn();
        await renderWithProviders(
            <StageProfile pours={pours([60, 100, 100])} target={260}
                          accent={palette.brand} width={300} height={92}
                          bypassVolume={45} onSelect={onSelect}/>
        );

        await fireEvent.press(screen.getByLabelText("Show bypass water"));

        expect(onSelect).toHaveBeenCalledWith("bypass");
    });
});
```

If the file has no `pours(...)` helper, add one:

```ts
function pours(volumes: number[]): Pour[] {
    return volumes.map((volume) => {
        const pour = new Pour();
        pour.volume = volume;
        return pour;
    });
}
```

- [x] **Step 2: Run them and watch them fail**

Run: `npx jest components/__tests__/StageProfile.test.tsx`
Expected: FAIL — `bypassVolume` is not a prop, and `stage-profile-bypass` is not
found. The two "no bypass" cases should already PASS; if either of them fails,
stop — you have misread the current behaviour, not found a bug.

- [x] **Step 3: Implement**

In `components/StageProfile.tsx`, widen the three helpers:

```ts
export function profileScale(pourTotal: number, target: number, bypass = 0): number {
    return Math.max(pourTotal, target, bypass, 1);
}

/** How tall the curve is drawn, inside the box. */
export function curveHeight(pourTotal: number, target: number, height: number,
                            bypass = 0): number {
    return (pourTotal / profileScale(pourTotal, target, bypass)) * height;
}

/** Where the target line sits, measured from the top of the box. */
export function targetY(pourTotal: number, target: number, height: number,
                        bypass = 0): number {
    return height - (target / profileScale(pourTotal, target, bypass)) * height;
}
```

Widen the props:

```ts
    /** Index of the open stage, or the sentinel for the bypass rung. */
    selected?: number | "bypass";
    /**
     * Called with the stage whose part of the curve was tapped, or with the
     * bypass sentinel.
     */
    onSelect?: (index: number | "bypass") => void;
    /**
     * Bypass water, in millilitres, or nothing.
     *
     * Zero and undefined mean the same thing here on purpose: the caller passes
     * `recipe.bypassEnabled ? recipe.bypassVolume : 0` and does not have to
     * think about which of the two absences it is holding.
     */
    bypassVolume?: number;
```

Destructure `bypassVolume` and change the body's geometry block to:

```ts
    const pourTotal = pours.reduce((sum, pour) => sum + Math.max(pour.volume, 0), 0);
    const bypass = Math.max(bypassVolume ?? 0, 0);
    const hasBypass = bypass > 0;

    // The bypass gets a band of its own at the end, so the stage curve is drawn
    // into a narrower box. Same band width for every band, stage or bypass:
    // `bandFor` divides by the same count, so the highlight always lines up
    // with what is drawn under it.
    const bandCount = pours.length + (hasBypass ? 1 : 0);
    const stageWidth = hasBypass && pours.length > 0
        ? (width * pours.length) / bandCount
        : width;

    const drawn = curveHeight(pourTotal, target, height, bypass);
    const line = targetY(pourTotal, target, height, bypass);
    const short = pourTotal < target;
    const bypassHeight = (bypass / profileScale(pourTotal, target, bypass)) * height;

    const stroke = PROFILE_STROKE_WIDTH;
    const bleed = stroke / 2;
    const path = buildProfilePath(pours, stageWidth, drawn);
    const band = selected !== undefined && bandCount > 0
        ? bandFor(selected === "bypass" ? pours.length : selected, bandCount, width)
        : null;
```

Replace the tap-target block with one that adds the bypass control:

```ts
    const bands = onSelect && bandCount > 0 && (
        <View style={{position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                      flexDirection: "row"}}>
            {pours.map((pour, index) => (
                <Pressable key={index} style={{flex: 1}}
                           accessibilityRole="button"
                           // Not the same wording as the tile below, which is
                           // "Stage n of m": two controls with one name is a
                           // screen reader reading the same thing twice and no
                           // way to tell which one it has landed on.
                           accessibilityLabel={`Show stage ${index + 1} of ${pours.length}`}
                           accessibilityState={{selected: selected === index}}
                           onPress={() => onSelect(index)}/>
            ))}
            {hasBypass && (
                <Pressable style={{flex: 1}} accessibilityRole="button"
                           accessibilityLabel="Show bypass water"
                           accessibilityState={{selected: selected === "bypass"}}
                           onPress={() => onSelect("bypass")}/>
            )}
        </View>
    );
```

In the SVG, swap `width` for `stageWidth` in the two curve paths and in the
target line, and add the bypass rect between the curve and the line:

```tsx
            {/* Translated to the bottom of the box: buildProfilePath draws from
                y=0 to y=drawn, and the baseline belongs on the floor. */}
            <Path d={`${path} L${stageWidth} ${drawn} Z`} fill={accent} opacity={0.16}
                  transform={`translate(0 ${height - drawn})`}/>
            <Path d={path} fill="none" stroke={accent} strokeWidth={stroke}
                  strokeLinejoin="round" strokeLinecap="round"
                  transform={`translate(0 ${height - drawn})`}/>

            {/* Bypass, in its own band and in its own colour. Outlined rather
                than filled solid, and dashed rather than continuous, because it
                is not brewed water and should not read as another stage. The
                dash is 9 5 and the target rule below is 4 3: two dashed marks
                on one small chart need to be told apart at arm's length, and
                length is the only free variable once the colour is spoken for.
                A continuous staircase was tried and rejected -- it climbs above
                the target rule, which everywhere else in this app means too
                much water. */}
            {hasBypass && (
                <Rect testID="stage-profile-bypass"
                      x={stageWidth} y={height - bypassHeight}
                      width={width - stageWidth} height={bypassHeight}
                      fill={palette.info} fillOpacity={0.16}
                      stroke={palette.info} strokeWidth={1} strokeDasharray="9 5"/>
            )}

            {/* ... existing comment about red being the whole signal ... */}
            <Line testID="stage-profile-target" x1={0} y1={line} x2={stageWidth} y2={line}
                  stroke={short ? palette.danger : palette.dim}
                  strokeWidth={1} strokeDasharray="4 3"/>
```

Add to the target line's existing comment block:

```
                The rule stops at the last stage rather than running the full
                width. It means "the volume the stages have to reach", and
                bypass is not stage water -- carrying it under the bypass band
                would say the opposite of what it means.
```

- [x] **Step 4: Run the tests and watch them pass**

Run: `npx jest components/__tests__/StageProfile.test.tsx components/__tests__/PourProfile.test.tsx`
Expected: PASS, and every pre-existing case in both files still green.

- [x] **Step 5: Commit**

```bash
git add components/StageProfile.tsx components/__tests__/StageProfile.test.tsx
printf '%s\n' "feat(bypass): draw bypass water as its own band on the stage profile" "" "Dashed outline plus a faint fill, in its own band, with the target rule" "truncated at the last stage: the rule means the volume the stages have to" "reach, and bypass is not stage water." "" "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" > /tmp/xbrw-commit.txt
git -c commit.gpgsign=false commit -F /tmp/xbrw-commit.txt
```

---

## Task 7: Share the stage tile's inner controls

`StageRow`, `StageLabel` and `StageValue` are module-private in `StageTile.tsx`.
The bypass rung needs the same pill so the two rungs are visibly siblings.
Exporting beats copying: a second copy drifts, and the moment the pill's padding
changes the bypass rung stops matching the stages beside it.

**Files:**
- Modify: `components/StageTile.tsx`

- [x] **Step 1: Export the three components**

Change the three declarations in `components/StageTile.tsx` from `function` to
`export function`:

```ts
export function StageRow({topics, row = true, children}: {
```

```ts
export function StageLabel({topic}: {topic: HelpTopic}) {
```

```ts
export function StageValue({topic, value, min, max, step, values, accent, onChange}: StageValueProps) {
```

Add a line to the comment above `StageRow`:

```
 * Exported so the bypass rung can be built from the same parts. A second copy
 * of this pill would drift from this one the first time its padding changed.
```

- [x] **Step 2: Verify nothing else moved**

Run: `npm run typecheck && npx jest components/__tests__/StageTile.test.tsx`
Expected: typecheck clean, all StageTile tests PASS. No behaviour changed.

- [x] **Step 3: Commit**

```bash
git add components/StageTile.tsx
printf '%s\n' "refactor(stages): export StageRow, StageLabel and StageValue" "" "The bypass rung is built from the same parts, so the two rungs stay" "visibly siblings when the pill changes." "" "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" > /tmp/xbrw-commit.txt
git -c commit.gpgsign=false commit -F /tmp/xbrw-commit.txt
```

---

## Task 8: The bypass rung

Replaces the read-only `BypassSection`. Two components in one file: the real rung
and the dashed ghost that offers it.

**The header must use Gesture Handler's `Pressable` and the body must not.** RN
0.86 dropped `delaysContentTouches`, so roughly every third tap on a plain header
was swallowed; but `Collapsible` sets `pointerEvents: none` when closed, and a
Gesture Handler press does **not** honour an ancestor's pointer events, so a
Gesture Handler control inside the fold stays live while invisible. `StageTile`
already splits it exactly this way — follow it.

**The card note is always visible when bypass is on**, whatever the
show-explanations setting says. It is a data-loss warning wearing an
explanation's clothes.

**Files:**
- Create: `components/BypassRung.tsx`
- Create: `components/__tests__/BypassRung.test.tsx`
- Delete: `components/BypassSection.tsx`
- Delete: `components/__tests__/BypassSection.test.tsx`

- [x] **Step 1: Write the failing tests**

Create `components/__tests__/BypassRung.test.tsx`:

```tsx
import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import BypassRung from "@/components/BypassRung";
import {palette} from "@/constants/colors";
import Recipe from "@/library/Recipe";
import {renderWithProviders} from "@/test-utils/render";

/** 45 ml and 60 C on purpose: neither is a default, so a passing assertion
 *  proves a real binding rather than a constant that happens to agree. */
function withBypass(): Recipe {
    const recipe = new Recipe();
    recipe.bypassEnabled = true;
    recipe.bypassVolume  = 45;
    recipe.bypassTemp    = 60;
    return recipe;
}

function props(recipe: Recipe, overrides = {}) {
    return {
        recipe,
        open:              false,
        accent:            palette.brand,
        showHint:          false,
        temperatureUnit:   "C" as const,
        onToggle:          jest.fn(),
        onEnabledChange:   jest.fn(),
        onChange:          jest.fn(),
        ...overrides
    };
}

describe("BypassRung", () => {
    it("offers a ghost rung when bypass is off", async () => {
        await renderWithProviders(<BypassRung {...props(new Recipe())}/>);

        expect(screen.getByTestId("bypass-ghost")).toBeTruthy();
        expect(screen.queryByTestId("bypass-rung")).toBeNull();
    });

    it("turns bypass on from the ghost", async () => {
        const onEnabledChange = jest.fn();
        await renderWithProviders(
            <BypassRung {...props(new Recipe(), {onEnabledChange})}/>
        );

        await fireEvent.press(screen.getByLabelText("Add bypass water"));

        expect(onEnabledChange).toHaveBeenCalledWith(true);
    });

    it("shows the volume and temperature when bypass is on", async () => {
        await renderWithProviders(<BypassRung {...props(withBypass())}/>);

        expect(screen.getByTestId("bypass-rung")).toBeTruthy();
        expect(screen.getByText("45")).toBeTruthy();
        expect(screen.getByText("60")).toBeTruthy();
    });

    it("shows the card note whenever bypass is on, hints or no hints", async () => {
        await renderWithProviders(
            <BypassRung {...props(withBypass(), {showHint: false})}/>
        );

        expect(screen.getByTestId("bypass-card-note")).toBeTruthy();
    });

    it("shows no card note when bypass is off", async () => {
        await renderWithProviders(<BypassRung {...props(new Recipe())}/>);

        expect(screen.queryByTestId("bypass-card-note")).toBeNull();
    });

    it("shows the explanation only with hints on", async () => {
        await renderWithProviders(
            <BypassRung {...props(withBypass(), {open: true, showHint: true})}/>
        );

        expect(screen.getByTestId("bypass-explainer")).toBeTruthy();
    });

    it("hides the explanation with hints off", async () => {
        await renderWithProviders(
            <BypassRung {...props(withBypass(), {open: true, showHint: false})}/>
        );

        expect(screen.queryByTestId("bypass-explainer")).toBeNull();
    });

    it("turns bypass off from the open rung", async () => {
        const onEnabledChange = jest.fn();
        await renderWithProviders(
            <BypassRung {...props(withBypass(), {open: true, onEnabledChange})}/>
        );

        await fireEvent.press(screen.getByLabelText("Remove bypass water"));

        expect(onEnabledChange).toHaveBeenCalledWith(false);
    });

    it("draws nothing at all for tea", async () => {
        const recipe = withBypass();
        recipe.cupType = 4;

        await renderWithProviders(<BypassRung {...props(recipe, {isTea: true})}/>);

        expect(screen.queryByTestId("bypass-rung")).toBeNull();
        expect(screen.queryByTestId("bypass-ghost")).toBeNull();
    });
});
```

- [x] **Step 2: Run them and watch them fail**

Run: `npx jest components/__tests__/BypassRung.test.tsx`
Expected: FAIL — `Cannot find module '@/components/BypassRung'`.

- [x] **Step 3: Write the component**

Create `components/BypassRung.tsx`:

```tsx
import React from "react";
import {View} from "react-native";
import {Pressable as GesturePressable} from "react-native-gesture-handler";
import {Text, XStack, YStack} from "tamagui";

import Collapsible from "@/components/Collapsible";
import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import {StageRow, StageValue} from "@/components/StageTile";
import {palette} from "@/constants/colors";
import {RECIPE_HELP} from "@/constants/recipeHelp";
import {BYPASS_VOLUME} from "@/library/bypassLimits";
import type Recipe from "@/library/Recipe";
import type {BypassField} from "@/hooks/useRecipeEditor";
import {
    displayRange, displayValues, fromDisplay, toDisplay, unitSuffix,
    type TemperatureUnit
} from "@/library/units";

type Props = {
    recipe: Recipe;
    /** The rung is the open one. */
    open: boolean;
    accent: string;
    isTea?: boolean;
    /** Draw the long explanation inside the fold. The card note ignores this. */
    showHint: boolean;
    temperatureUnit: TemperatureUnit;
    onToggle: () => void;
    onEnabledChange: (on: boolean) => void;
    onChange: (field: BypassField, value: number) => void;
};

/**
 * Bypass water, drawn as the closing rung of the stage ladder.
 *
 * Bypass is not a `Pour` and is not in `recipe.pours` -- it is dispensed
 * straight into the cup and never enters the volume the machine checks. It is
 * drawn as a rung anyway because that is how the user experiences it and how
 * the official app presents it: one more thing that happens, at the end.
 *
 * With bypass off this is a dashed ghost in the shape of the rung it will
 * become. A switch in a settings list somewhere else was the alternative, and
 * it costs a screen change to do a thing that belongs where the brew is.
 *
 * The header is a Gesture Handler `Pressable` and everything inside the fold is
 * not -- exactly as in `StageTile`, and for both of its reasons. RN 0.86 dropped
 * `delaysContentTouches`, so a plain header inside a scroll swallowed roughly
 * every third tap; but `Collapsible` closes by setting `pointerEvents: none`,
 * and a Gesture Handler press does not honour an ancestor's pointer events, so
 * one inside the fold stays live while invisible.
 */
export default function BypassRung({
    recipe, open, accent, isTea = false, showHint, temperatureUnit,
    onToggle, onEnabledChange, onChange
}: Props) {
    "use no memo";

    // The model is mutated in place, so the compiler cannot see that a value
    // moved and would serve a cached render.

    // Tea has no bypass anywhere: the machine ignores it, and `shareLink`
    // already suppresses it. An affordance for a thing that cannot happen is
    // worse than a missing one.
    if (isTea) return null;

    if (!recipe.bypassEnabled) {
        return (
            <GesturePressable accessibilityRole="button"
                              accessibilityLabel="Add bypass water"
                              onPress={() => onEnabledChange(true)}>
                <XStack testID="bypass-ghost" alignItems="center" justifyContent="center"
                        gap="$2" marginTop="$2.5" paddingVertical="$3.5"
                        borderRadius="$5" borderWidth={1} borderColor={palette.line}
                        borderStyle="dashed">
                    <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.8}
                                   color={palette.dim}>
                        + BYPASS WATER
                    </DotMatrixText>
                </XStack>
            </GesturePressable>
        );
    }

    return (
        <YStack testID="bypass-rung"
                backgroundColor={open ? palette.surface : palette.raised}
                borderRadius="$5" padding="$3" marginTop="$2.5"
                borderWidth={open ? 1 : 0} borderColor={palette.info}>
            <GesturePressable accessibilityRole="button"
                              accessibilityLabel="Bypass water"
                              accessibilityState={{expanded: open}}
                              onPress={onToggle}>
                <XStack alignItems="center" gap="$2.5">
                    <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.4}
                                   color={palette.info}>
                        BY
                    </DotMatrixText>
                    <XStack flex={1} gap="$3" alignItems="baseline">
                        <XStack gap="$1" alignItems="baseline">
                            <DotMatrixText fontSize={15} weight="bold" color={palette.text}>
                                {String(recipe.bypassVolume)}
                            </DotMatrixText>
                            <Text fontSize={10} color={palette.dim}>ml</Text>
                        </XStack>
                        <XStack gap="$1" alignItems="baseline">
                            <DotMatrixText fontSize={15} weight="bold" color={palette.text}>
                                {String(toDisplay(recipe.bypassTemp, temperatureUnit))}
                            </DotMatrixText>
                            <Text fontSize={10} color={palette.dim}>
                                {unitSuffix(temperatureUnit)}
                            </Text>
                        </XStack>
                    </XStack>
                    <View testID="bypass-caret"
                          style={{transform: [{rotate: open ? "180deg" : "0deg"}]}}>
                        <DotIcon name="more" size={14}
                                 color={open ? palette.info : palette.muted}/>
                    </View>
                </XStack>
            </GesturePressable>

            {/* Outside the fold on purpose. This is not an explanation, it is a
                data-loss warning: writing this recipe to a card silently drops
                the bypass, and someone who folded the notes away has not asked
                to stop being told that. */}
            <XStack testID="bypass-card-note" gap="$2" paddingTop="$2.5">
                <Text fontSize={11} lineHeight={15} color={palette.dim}>
                    A card cannot store bypass water. Writing this recipe to a card
                    leaves it out.
                </Text>
            </XStack>

            <Collapsible open={open}>
                <YStack gap="$2" paddingTop="$3">
                    <StageRow topics={["bypassVolume", "bypassTemperature"]}>
                        <StageValue topic="bypassVolume" value={recipe.bypassVolume}
                                    min={BYPASS_VOLUME.min} max={BYPASS_VOLUME.max}
                                    step={1} accent={palette.info}
                                    onChange={(value) => onChange("volume", value)}/>
                        <StageValue topic="bypassTemperature"
                                    value={toDisplay(recipe.bypassTemp, temperatureUnit)}
                                    min={displayRange(temperatureUnit).min}
                                    max={displayRange(temperatureUnit).max}
                                    step={1}
                                    values={displayValues(temperatureUnit)}
                                    onChange={(value) =>
                                        onChange("temperature",
                                                 fromDisplay(value, temperatureUnit))}/>
                    </StageRow>

                    {showHint && (
                        <Text testID="bypass-explainer" fontSize={11} lineHeight={15}
                              color={palette.dim}>
                            {RECIPE_HELP.bypass.detail}
                        </Text>
                    )}

                    <Pressable accessibilityRole="button"
                               accessibilityLabel="Remove bypass water"
                               onPress={() => onEnabledChange(false)}>
                        <XStack alignSelf="flex-start" paddingVertical="$1.5">
                            <DotMatrixText fontSize={10} weight="bold" letterSpacing={1.6}
                                           color={palette.danger}>
                                REMOVE
                            </DotMatrixText>
                        </XStack>
                    </Pressable>
                </YStack>
            </Collapsible>
        </YStack>
    );
}
```

Add `Pressable` to the `react-native` import at the top:

```tsx
import {Pressable, View} from "react-native";
```

That is React Native's `Pressable`, not the Gesture Handler one — it sits inside
the fold, where a Gesture Handler press would stay live while invisible.

Check the real names before you rely on them:

```bash
grep -n "export" components/Collapsible.tsx components/DotIcon.tsx | head
grep -n "export function \(toDisplay\|fromDisplay\|displayRange\|displayValues\|unitSuffix\)" library/units.ts
```

If `Collapsible` or `DotIcon` are named exports rather than default, adjust the
imports to match — do not change those files.

- [x] **Step 4: Run the tests and watch them pass**

Run: `npx jest components/__tests__/BypassRung.test.tsx`
Expected: PASS, 9 tests.

- [x] **Step 5: Delete the component it replaces**

```bash
git rm components/BypassSection.tsx components/__tests__/BypassSection.test.tsx
npm run typecheck
```

Expected: typecheck reports one error — `app/editRecipe.tsx` still imports
`BypassSection`. That is the next task. **Do not commit yet**; a commit that does
not typecheck is a commit nobody can bisect through.

- [x] **Step 6: Hold**

Go straight to Task 9. The two tasks share a commit.

---
## Task 9: Wire the rung into the editor

The selection model becomes a sentinel: `openStage: number | "bypass" | null`.
That is the point of the string — TypeScript then forces every consumer that
indexes `recipe.pours` to narrow, so a bypass selection cannot silently become
`pours["bypass"]`.

**Files:**
- Modify: `app/editRecipe.tsx`
- Test: `app/__tests__/editRecipe.bypass.test.tsx` (create)

- [x] **Step 1: Write the failing tests**

Create `app/__tests__/editRecipe.bypass.test.tsx`, following the setup the
existing editor tests use (route params, providers, settings):

```tsx
describe("editor bypass rung", () => {
    it("offers the ghost rung on the stages deck", async () => {
        await renderEditor(recipeWithStages());
        await fireEvent.press(screen.getByLabelText("Stages"));

        expect(screen.getByTestId("bypass-ghost")).toBeTruthy();
    });

    it("turns bypass on, and the rung replaces the ghost", async () => {
        await renderEditor(recipeWithStages());
        await fireEvent.press(screen.getByLabelText("Stages"));

        await fireEvent.press(screen.getByLabelText("Add bypass water"));

        expect(screen.getByTestId("bypass-rung")).toBeTruthy();
        expect(screen.queryByTestId("bypass-ghost")).toBeNull();
    });

    it("puts the bypass band on the profile once it is on", async () => {
        await renderEditor(recipeWithStages());
        await fireEvent.press(screen.getByLabelText("Stages"));

        expect(screen.queryByTestId("stage-profile-bypass")).toBeNull();
        await fireEvent.press(screen.getByLabelText("Add bypass water"));

        expect(screen.getByTestId("stage-profile-bypass")).toBeTruthy();
    });

    it("closes the rung when bypass is switched off", async () => {
        await renderEditor(recipeWithStages());
        await fireEvent.press(screen.getByLabelText("Stages"));
        await fireEvent.press(screen.getByLabelText("Add bypass water"));
        await fireEvent.press(screen.getByLabelText("Bypass water"));

        await fireEvent.press(screen.getByLabelText("Remove bypass water"));

        // The ghost is back, and nothing is left selected pointing at a rung
        // that no longer exists.
        expect(screen.getByTestId("bypass-ghost")).toBeTruthy();
        expect(screen.queryByTestId("stage-profile-band")).toBeNull();
    });

    it("shows no bypass affordance for tea", async () => {
        await renderEditor(teaRecipe());
        await fireEvent.press(screen.getByLabelText("Stages"));

        expect(screen.queryByTestId("bypass-ghost")).toBeNull();
        expect(screen.queryByTestId("bypass-rung")).toBeNull();
    });

    it("leaves the stage balance untouched when bypass is added", async () => {
        await renderEditor(recipeWithStages());
        await fireEvent.press(screen.getByLabelText("Stages"));

        await fireEvent.press(screen.getByLabelText("Add bypass water"));

        // Bypass is dispensed outside the sum the machine checks. If this
        // fails, bypass has leaked into the pour-volume invariant.
        expect(screen.queryByTestId("stage-mismatch")).toBeNull();
    });
});
```

Reuse the existing file's `renderEditor` / recipe helpers if it has them; if the
tests live in `app/__tests__/editRecipe.test.tsx`, copy that file's harness
rather than inventing a second one.

- [x] **Step 2: Run them and watch them fail**

Run: `npx jest app/__tests__/editRecipe.bypass.test.tsx`
Expected: FAIL — `bypass-ghost` not found (the screen still renders the deleted
`BypassSection`, so it will fail to compile first; that is the same failure).

- [x] **Step 3: Widen the selection type**

In `app/editRecipe.tsx`, add near the other local types:

```ts
/**
 * What the stages deck has open.
 *
 * A string sentinel rather than an index past the end, so that every consumer
 * that reaches into `recipe.pours` has to narrow before it can. An out-of-range
 * index would have compiled everywhere and been wrong at runtime in exactly one
 * place.
 */
type OpenRung = number | "bypass" | null;
```

Change the state:

```ts
    const [openStage, setOpenStage] = useState<OpenRung>(null);
```

Add a layout ref beside `stageOffsets`:

```ts
    const bypassOffset = useRef(0);
```

Widen `selectStage`:

```ts
    function selectStage(index: number | "bypass") {
        setOpenStage(index);
        const tileY = index === "bypass"
            ? bypassOffset.current
            : stageOffsets.current[index];
        if (tileY === undefined) return;
        scrollRef.current?.scrollTo({
            y:        stageScrollTarget(deckOffset.current, tileY, profileHeight.current),
            animated: true
        });
    }
```

- [x] **Step 4: Thread it through the two prop types**

`StagesDeckProps`:

```ts
    /** The open rung, or null. Held by the screen, not the tile. */
    openStage: OpenRung;
    setOpenStage: React.Dispatch<React.SetStateAction<OpenRung>>;
    /** Reports where a stage sits within the deck, so it can be scrolled to. */
    onStageLayout: (index: number, y: number) => void;
    /** The same, for the bypass rung. */
    onBypassLayout: (y: number) => void;
    editStage: (index: number, field: StageField, value: number) => void;
    setBypassEnabled: (on: boolean) => void;
    editBypass: (field: BypassField, value: number) => void;
    showHint: boolean;
```

`StageProfileCardProps`:

```ts
    /** The rung the list has open, so the curve can highlight its band. */
    selected: OpenRung;
    /** Bypass water in millilitres, or 0 when it is off. */
    bypassVolume: number;
    onSelect: (index: number | "bypass") => void;
```

And in `StageProfileCard`, pass both through:

```tsx
                              bypassVolume={bypassVolume}
                              selected={selected ?? undefined} onSelect={onSelect}/>
```

Add the imports at the top of the file:

```ts
import BypassRung from "@/components/BypassRung";
import type {BypassField} from "@/hooks/useRecipeEditor";
```

and remove:

```ts
import BypassSection from "@/components/BypassSection";
```

- [x] **Step 5: Narrow inside `StagesDeck` and render the rung**

In `StagesDeck`'s signature add the new props:

```ts
function StagesDeck({
    recipe, balance, accent, isTea, openStage, setOpenStage, onStageLayout,
    onBypassLayout, editStage, addPour, deletePour, autoAdjustPourVolumes,
    temperatureUnit, setBypassEnabled, editBypass, showHint,
}: StagesDeckProps) {
```

In the stage-tile map, the `open` test now has to narrow:

```tsx
                           open={openStage === index} accent={accent} isTea={isTea}
```

That already narrows correctly — `openStage === index` with `index: number` is
false for `"bypass"` — so it needs no change. The `onToggle` does:

```tsx
                           onToggle={(i) =>
                               setOpenStage((current) => (current === i ? null : i))}
```

also needs no change, because `i` is a number and the comparison is against
`OpenRung`. Leave both.

After the add-stage `Pressable`, and still inside the deck's `YStack`, add:

```tsx
            {/* The bypass rung closes the ladder, after the add button rather
                than before it: adding a stage is an operation on the list, and
                bypass is the last thing that happens in the cup. */}
            <View onLayout={(event) => onBypassLayout(event.nativeEvent.layout.y)}>
                <BypassRung recipe={recipe} isTea={isTea}
                            open={openStage === "bypass"} accent={accent}
                            showHint={showHint} temperatureUnit={temperatureUnit}
                            onToggle={() =>
                                setOpenStage((current) =>
                                    current === "bypass" ? null : "bypass")}
                            onEnabledChange={(on) => {
                                setBypassEnabled(on);
                                // Open it on the way on so the two controls are
                                // there without a second tap, and close it on
                                // the way off so nothing is selected pointing
                                // at a rung that is no longer drawn.
                                setOpenStage(on ? "bypass" : null);
                            }}
                            onChange={editBypass}/>
            </View>
```

- [x] **Step 6: Pass the new props from the screen body**

Replace the deck render block (currently `app/editRecipe.tsx:958-994`) so that
`StageProfileCard` gets the bypass volume, `StagesDeck` gets the new props, and
`<BypassSection recipe={recipe}/>` is gone:

```tsx
                {deck === "stages" ? (
                    <StageProfileCard pours={recipe.pours} target={balance.target}
                                      accent={accent} selected={openStage}
                                      bypassVolume={recipe.bypassEnabled
                                          ? recipe.bypassVolume
                                          : 0}
                                      collapsed={collapsed}
                                      onSelect={selectStage}
                                      onHeight={(height) => {
                                          profileHeight.current = height;
                                      }}/>
                ) : <YStack/>}
```

and:

```tsx
                    <StagesDeck recipe={recipe} balance={balance} accent={accent}
                                isTea={recipe.isTea()} openStage={openStage}
                                setOpenStage={setOpenStage} editStage={editStage}
                                onStageLayout={(index, y) => {
                                    stageOffsets.current[index] = y;
                                }}
                                onBypassLayout={(y) => {
                                    bypassOffset.current = y;
                                }}
                                setBypassEnabled={setBypassEnabled}
                                editBypass={editBypass} showHint={showHint}
                                addPour={addPour} deletePour={deletePour}
                                autoAdjustPourVolumes={autoAdjustPourVolumes}
                                temperatureUnit={temperatureUnit}/>
```

The `<BypassSection recipe={recipe}/>` line goes. The wrapping `<View onLayout>`
around `StagesDeck` stays exactly as it is — it is what measures `deckOffset`.

Pull the two new callbacks out of the hook, in the existing destructure:

```ts
        setInputError, editStage, setBypassEnabled, editBypass, addPour, deletePour,
        autoAdjustPourVolumes, coarsenGrindToMinimum
```

**Do not touch `stickyHeaderIndices`.** The slots are counted, so the empty
`<YStack/>` placeholders must stay exactly where they are; a conditional that
renders `false` shifts index 2 onto the wrong child and the profile stops
pinning.

- [x] **Step 7: Run the tests and watch them pass**

Run: `npx jest app/__tests__/editRecipe && npm run typecheck`
Expected: PASS, and typecheck clean — including the `BypassSection` error from
Task 8 Step 5, which this task resolves.

- [x] **Step 8: Commit Tasks 8 and 9 together**

```bash
git add app/editRecipe.tsx components/BypassRung.tsx components/__tests__/BypassRung.test.tsx app/__tests__/editRecipe.bypass.test.tsx
git rm --cached -q components/BypassSection.tsx components/__tests__/BypassSection.test.tsx 2>/dev/null; git add -u
printf '%s\n' "feat(bypass): make bypass water editable from the stage ladder" "" "Replaces the read-only BypassSection with a rung that closes the ladder," "and a dashed ghost rung that offers it when bypass is off. The open rung" "is a string sentinel rather than an index past the end, so every consumer" "that indexes recipe.pours has to narrow." "" "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" > /tmp/xbrw-commit.txt
git -c commit.gpgsign=false commit -F /tmp/xbrw-commit.txt
```

---

## Task 10: Split the total on the BREW deck

With bypass on, the ladder shows 60 + 100 + 100 + 30 against a header reading
260 ML TOTAL, and the app looks broken. It is not: 260 is the brew target and 30
is dispensed outside it. **This is the single most important line in the design.**
Without it, the correct arithmetic reads as a bug.

**Files:**
- Modify: `app/editRecipe.tsx` (`BrewDeck`, around line 229)
- Test: `app/__tests__/editRecipe.bypass.test.tsx`

- [x] **Step 1: Write the failing tests**

```tsx
describe("brew deck total", () => {
    it("shows one total when bypass is off", async () => {
        await renderEditor(recipeWithStages());

        expect(screen.getByTestId("brew-target")).toHaveTextContent("260");
        expect(screen.queryByTestId("brew-bypass-split")).toBeNull();
    });

    it("splits the total when bypass is on", async () => {
        const recipe = recipeWithStages();
        recipe.bypassEnabled = true;
        recipe.bypassVolume  = 45;

        await renderEditor(recipe);

        // The stage target is unchanged: the machine still checks 260.
        expect(screen.getByTestId("brew-target")).toHaveTextContent("260");
        expect(screen.getByTestId("brew-bypass-split"))
            .toHaveTextContent("+ 45 ML BYPASS");
    });

    it("shows no split for tea", async () => {
        const recipe = teaRecipe();
        recipe.bypassEnabled = true;
        recipe.bypassVolume  = 45;

        await renderEditor(recipe);

        expect(screen.queryByTestId("brew-bypass-split")).toBeNull();
    });
});
```

- [x] **Step 2: Run them and watch them fail**

Run: `npx jest app/__tests__/editRecipe.bypass.test.tsx -t "brew deck total"`
Expected: FAIL on the second case — `brew-bypass-split` not found.

- [x] **Step 3: Implement**

In `BrewDeck`, replace the header `XStack` (currently at `app/editRecipe.tsx:225`)
with:

```tsx
            <XStack alignItems="baseline" gap="$2" flexWrap="wrap"
                    paddingHorizontal="$4" paddingTop="$4" paddingBottom="$3">
                <DotMatrixText testID="brew-target" fontSize={22} weight="bold" color={accent}>
                    {balanceTarget}
                </DotMatrixText>
                {/* `dim`, not `muted`: muted is 4.12:1 and the palette says in
                    as many words that it is not a text colour. */}
                <Text fontSize={10} letterSpacing={1.6} color={palette.dim}>ML BREW</Text>
                {/* Without this line the ladder adds up to more than the header
                    and the app looks broken. It is not: the header is the
                    volume the machine checks the stages against, and bypass is
                    dispensed outside it. Doto, so the units are upper-case. */}
                {showBypass && (
                    <DotMatrixText testID="brew-bypass-split" fontSize={11} weight="bold"
                                   letterSpacing={1.4} color={palette.info}>
                        {`+ ${recipe.bypassVolume} ML BYPASS`}
                    </DotMatrixText>
                )}
            </XStack>
```

and add, next to `tooFine` in the same component:

```ts
    // Tea has no bypass anywhere in the app; the machine ignores it.
    const showBypass = recipe.bypassEnabled && !isTea;
```

Note the label changes from `ML TOTAL` to `ML BREW`. "Total" was only ever
correct because nothing was dispensed outside it; with bypass on it is a false
claim, and a label that is right on one recipe and wrong on the next is worse
than a slightly duller one. It reads `ML BREW` on every recipe, bypass or not,
because a label that changes shape is a label the eye has to re-read.

- [x] **Step 4: Run the tests and watch them pass**

Run: `npx jest app/__tests__/editRecipe`
Expected: PASS. **Any pre-existing test asserting `ML TOTAL` will fail here** —
update it to `ML BREW` rather than reverting the label. Find them with:

```bash
grep -rn "ML TOTAL" app components docs
```

- [x] **Step 5: Commit**

```bash
git add app/editRecipe.tsx app/__tests__/editRecipe.bypass.test.tsx
printf '%s\n' "feat(bypass): split the brew total when bypass water is on" "" "The ladder sums to more than the header once bypass is enabled, which" "reads as a bug. The header is the volume the machine checks the stages" "against; bypass is dispensed outside it, and now says so." "" "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" > /tmp/xbrw-commit.txt
git -c commit.gpgsign=false commit -F /tmp/xbrw-commit.txt
```

---

## Task 11: Copy register

Every user-visible string gets a row in `docs/copy.md` with an accurate source
line number. British English throughout. "Tap", never "Press", except for the
machine's physical button. Units lower-case in Inter prose, upper-case in Doto.
No em dashes in app copy.

**Files:**
- Modify: `docs/copy.md`

- [x] **Step 1: Replace the Bypass water section**

Delete the three `components/BypassSection.tsx` rows under `### Bypass water`
(currently lines 227-229) and put this in their place. **Read the real line
numbers off the files first** — the numbers below are placeholders you must
replace, and a wrong line number in this register is worse than no register:

```bash
grep -n "BYPASS WATER\|Add bypass water\|Bypass water\|Remove bypass water\|A card cannot store\|REMOVE\|Show bypass water" components/BypassRung.tsx components/StageProfile.tsx
grep -n "ML BREW\|ML BYPASS" app/editRecipe.tsx
```

```markdown
### Bypass water

| ID | Source | Context — when the user sees this | Current text |
|----|--------|-----------------------------------|--------------|
| `editor.bypass.ghost.a11y` | `components/BypassRung.tsx:NN` (a11y) | (a11y) The dashed rung that turns bypass water on. | `Add bypass water` |
| `editor.bypass.ghost.label` | `components/BypassRung.tsx:NN` | Doto label on the dashed rung, shown when bypass is off. | `+ BYPASS WATER` |
| `editor.bypass.rung.a11y` | `components/BypassRung.tsx:NN` (a11y) | (a11y) The bypass rung header, which opens its controls. | `Bypass water` |
| `editor.bypass.rung.marker` | `components/BypassRung.tsx:NN` | Doto marker on the bypass rung, where a stage shows its number. | `BY` |
| `editor.bypass.card.note` | `components/BypassRung.tsx:NN` | Always shown while bypass is on, whatever the hint setting says: a card write silently drops it. | `A card cannot store bypass water. Writing this recipe to a card leaves it out.` |
| `editor.bypass.remove.a11y` | `components/BypassRung.tsx:NN` (a11y) | (a11y) Turns bypass water off. | `Remove bypass water` |
| `editor.bypass.remove.label` | `components/BypassRung.tsx:NN` | Doto label on the remove button inside the open rung. | `REMOVE` |
| `editor.bypass.profile.a11y` | `components/StageProfile.tsx:NN` (a11y) | (a11y) The bypass band on the stage profile. | `Show bypass water` |
| `editor.brew.total.label` | `app/editRecipe.tsx:NN` | Unit label under the brew target on the BREW deck. | `ML BREW` |
| `editor.brew.bypass.split` | `app/editRecipe.tsx:NN` | Doto addendum to the brew target, shown only while bypass is on. `${...}` is millilitres. | `+ ${recipe.bypassVolume} ML BYPASS` |
| `help.bypass.title` | `constants/recipeHelp.ts:NN` | Help sheet and control caption. | `Bypass water` |
| `help.bypass.hint` | `constants/recipeHelp.ts:NN` | One-line hint, shown with hints on. | `Extra water added straight to the cup.` |
| `help.bypass.question` | `constants/recipeHelp.ts:NN` | Help sheet heading. | `What is bypass water?` |
| `help.bypass.detail` | `constants/recipeHelp.ts:NN` | Help sheet body, and the in-rung explanation with hints on. | `Bypass water is dispensed straight into the cup at the end of the brew, without passing through the coffee. It dilutes a concentrated brew without weakening the extraction, which is how a strong small brew is turned into a full cup. It does not count towards the stage volumes, and a card has no room to store it, so a recipe written to a card loses it.` |
| `help.bypassVolume.title` | `constants/recipeHelp.ts:NN` | Caption above the bypass volume stepper. | `Volume` |
| `help.bypassTemperature.title` | `constants/recipeHelp.ts:NN` | Caption above the bypass temperature stepper. | `Temperature` |
```

- [x] **Step 2: Update the stage rows whose line numbers moved**

`app/editRecipe.tsx` has grown, so the `editor.stages.*` rows in the register now
point at the wrong lines. Re-derive them:

```bash
grep -n "OF \${balance.target} ML\|The machine rejects a recipe\|Auto fix\|AUTO FIX\|Add stage\|+ ADD STAGE" app/editRecipe.tsx
```

Update each `editor.stages.*` row's Source cell to the number you just read.

- [x] **Step 3: Verify every line number in the section**

For each row you touched, check that the cited line actually holds that string:

```bash
sed -n 'NNp' components/BypassRung.tsx
```

- [x] **Step 4: Commit**

```bash
git add docs/copy.md
printf '%s\n' "docs(copy): register the bypass editing strings" "" "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" > /tmp/xbrw-commit.txt
git -c commit.gpgsign=false commit -F /tmp/xbrw-commit.txt
```

---
## Task 12: Send the real bypass over BLE

`Machine.ts:832` sends `buildType1(8102, [0, 0, dose])` unconditionally — bypass
is hardcoded off. The descriptor at `library/machine/commands.ts:86-88` already
declares both bypass arguments as `float32`, and `encodeArguments` already writes
float32 little-endian, so **no new encoding machinery is needed**. Only the values
change.

The one thing hardware has to settle is whether `bypass temp x10` means tenths of
a degree or something else, so the reading is a runtime setting rather than a
guess baked into the binary.

**Files:**
- Modify: `library/machine/protocol.ts`
- Modify: `library/machine/Machine.ts`
- Modify: `library/Settings.ts`
- Modify: `hooks/useBrew.ts`
- Modify: `app/machine.tsx`
- Test: `library/machine/__tests__/protocol.bypass.test.ts` (create)
- Test: `library/machine/__tests__/Machine.bypass.test.ts` (create)

- [x] **Step 1: Write the failing protocol test**

Create `library/machine/__tests__/protocol.bypass.test.ts`:

```ts
import {bypassTempValue} from "@/library/machine/protocol";

describe("bypassTempValue", () => {
    it("scales by ten under the scaled reading", () => {
        expect(bypassTempValue(60, "scaled")).toBe(600);
    });

    it("sends the degrees as they are under the plain reading", () => {
        expect(bypassTempValue(60, "plain")).toBe(60);
    });

    it("rounds rather than truncating", () => {
        expect(bypassTempValue(60.06, "scaled")).toBe(601);
        expect(bypassTempValue(60.6, "plain")).toBe(61);
    });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npx jest library/machine/__tests__/protocol.bypass.test.ts`
Expected: FAIL — `bypassTempValue is not a function`.

- [x] **Step 3: Implement it**

Add to `library/machine/protocol.ts`:

```ts
/**
 * Which reading of the bypass temperature argument to send.
 *
 * The command descriptor names the argument "bypass temp x10", which is either
 * tenths of a degree or a scale factor nobody has confirmed on hardware. A
 * wrong choice produces no error at all -- the machine simply dispenses the
 * bypass at the wrong temperature -- so it is a switch rather than a guess.
 */
export type BypassTempEncoding = "scaled" | "plain";

/** The value to send for a bypass temperature in degrees Celsius. */
export function bypassTempValue(celsius: number, encoding: BypassTempEncoding): number {
    return encoding === "scaled" ? Math.round(celsius * 10) : Math.round(celsius);
}
```

- [x] **Step 4: Run it and watch it pass**

Run: `npx jest library/machine/__tests__/protocol.bypass.test.ts`
Expected: PASS, 3 tests.

- [x] **Step 5: Write the failing Machine test**

Create `library/machine/__tests__/Machine.bypass.test.ts`. Follow the harness the
existing `Machine` tests use — they build a fake transport and read the frames it
was handed. Assert on the 8102 frame:

```ts
describe("Machine bypass", () => {
    it("still sends zeros with bypass off, and the dose regardless", async () => {
        const {machine, sent} = machineWithFakeTransport();
        const recipe = coffeeRecipe();
        recipe.dosage = 18;

        await machine.brew(recipe);

        expect(argsOf(sent, 8102)).toEqual([0, 0, 18]);
    });

    it("sends the real bypass values when bypass is on", async () => {
        const {machine, sent} = machineWithFakeTransport();
        const recipe = coffeeRecipe();
        recipe.dosage = 18;
        recipe.bypassEnabled = true;
        recipe.bypassVolume  = 45;
        recipe.bypassTemp    = 60;

        await machine.brew(recipe);

        // 600, not 60: the default reading is the scaled one.
        expect(argsOf(sent, 8102)).toEqual([45, 600, 18]);
    });

    it("honours the plain reading when it is selected", async () => {
        const {machine, sent} = machineWithFakeTransport();
        const recipe = coffeeRecipe();
        recipe.dosage = 18;
        recipe.bypassEnabled = true;
        recipe.bypassVolume  = 45;
        recipe.bypassTemp    = 60;
        machine.setBypassTempEncoding("plain");

        await machine.brew(recipe);

        expect(argsOf(sent, 8102)).toEqual([45, 60, 18]);
    });

    it("sends no bypass for tea", async () => {
        const {machine, sent} = machineWithFakeTransport();
        const recipe = teaRecipe();
        recipe.dosage = 5;
        recipe.bypassEnabled = true;
        recipe.bypassVolume  = 45;

        await machine.brew(recipe);

        expect(argsOf(sent, 8102)).toEqual([0, 0, 5]);
    });
});
```

`argsOf(sent, 8102)` has to decode the frame back: the two bypass arguments are
float32 little-endian and the dose is an integer. If the existing test file has a
frame decoder, reuse it; otherwise write one next to these tests using
`DataView#getFloat32(offset, true)`.

- [x] **Step 6: Run it and watch it fail**

Run: `npx jest library/machine/__tests__/Machine.bypass.test.ts`
Expected: FAIL — the second case gets `[0, 0, 18]`.

- [x] **Step 7: Implement**

In `library/machine/Machine.ts`, alongside the existing encoding property:

```ts
    /**
     * Which reading of the bypass temperature to send.
     *
     * A property rather than a settings lookup, so this file keeps its one-way
     * dependency: `library/` does not reach up into `hooks/`. `useBrew` sets it
     * from the console's switch.
     */
    private bypassEncoding: BypassTempEncoding = "scaled";

    get bypassTempEncoding(): BypassTempEncoding {
        return this.bypassEncoding;
    }

    /**
     * A method rather than a settable field so that callers in `hooks/` are
     * telling the machine something rather than mutating a value the React
     * Compiler believes it owns.
     */
    setBypassTempEncoding(encoding: BypassTempEncoding): void {
        this.bypassEncoding = encoding;
    }
```

Replace the 8102 frame in the brew burst:

```ts
                // The dose has to travel whether or not there is a bypass: the
                // machine needs it to grind correctly, and skipping this frame
                // makes the grind drift. Tea sends no bypass at all -- the
                // machine ignores it there, as `shareLink` already assumes.
                buildType1(8102, tea || !recipe.bypassEnabled
                    ? [0, 0, Math.round(recipe.dosage)]
                    : [
                        Math.round(recipe.bypassVolume),
                        bypassTempValue(recipe.bypassTemp, this.bypassEncoding),
                        Math.round(recipe.dosage)
                    ]),
```

Import both at the top of `Machine.ts`:

```ts
import {bypassTempValue, type BypassTempEncoding} from "./protocol";
```

(add them to the existing `./protocol` import rather than adding a second one).

Update the descriptor note in `library/machine/commands.ts:86-88`:

```ts
     note: "Carries the dose even with bypass off. Skipping it makes the grind drift. The temperature argument's scaling is unconfirmed on hardware; see bypassTempValue."},
```

- [x] **Step 8: Add the setting**

In `library/Settings.ts`, alongside `teaSteepEncoding`:

```ts
    /**
     * Which reading of the bypass temperature argument to send.
     *
     * The command descriptor calls the argument "bypass temp x10", which is
     * either tenths of a degree or a scale factor nobody has confirmed. A wrong
     * choice raises no error: the bypass simply arrives at the wrong
     * temperature. The scaled reading is the one the descriptor implies and is
     * the default; the other is reachable from the machine console so a
     * thermometer can settle it.
     */
    bypassTempEncoding: "scaled" as "scaled" | "plain",
```

In `hooks/useBrew.ts`:

```ts
    const [bypassTempEncoding] = useSetting("bypassTempEncoding");
```

```ts
    useEffect(() => {
        // `useSetting` widens the stored union to `string`, so it is narrowed
        // back to the encoding the machine expects on the way in.
        machine.setBypassTempEncoding(bypassTempEncoding as BypassTempEncoding);
    }, [machine, bypassTempEncoding]);
```

Add `BypassTempEncoding` to the type import from `@/library/machine/protocol`.

In `app/machine.tsx`, add the options constant next to `TEA_STEEP_OPTIONS`:

```ts
/** The bypass temperature scaling is unconfirmed; a thermometer settles it. */
const BYPASS_TEMP_OPTIONS = [
    {value: "scaled", label: "x10"},
    {value: "plain",  label: "Degrees"}
] as const;
```

the setting hook next to the others:

```ts
    const [bypassTempEncoding, setBypassTempEncoding] = useSetting("bypassTempEncoding");
```

and the row in the same `SettingsSection`:

```tsx
                    <SettingsChoiceRow
                        label="Bypass temperature"
                        description="The command carries the bypass temperature multiplied by ten, or so the argument name suggests. A thermometer in the cup settles it."
                        value={bypassTempEncoding}
                        options={BYPASS_TEMP_OPTIONS}
                        onChange={(value) => setBypassTempEncoding(value === "plain" ? "plain" : "scaled")}/>
```

- [x] **Step 9: Run the tests and watch them pass**

Run: `npx jest library/machine hooks/__tests__/useBrew && npm run typecheck`
Expected: PASS, typecheck clean.

- [x] **Step 10: Commit**

```bash
git add library/machine app/machine.tsx hooks/useBrew.ts library/Settings.ts
printf '%s\n' "feat(bypass): send the real bypass volume and temperature over BLE" "" "Command 8102 already declares both arguments as float32, so only the" "values change. The temperature scaling is unconfirmed on hardware, so it" "is a console switch rather than a guess baked into the binary." "" "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" > /tmp/xbrw-commit.txt
git -c commit.gpgsign=false commit -F /tmp/xbrw-commit.txt
```

---

## Task 13: Remove the tea steep encoding switch

Settled on hardware on 2026-09-01: HomoLand's reading is correct. The switch was
there to answer a question that now has an answer, and a live switch that can
only be set wrongly is a trap.

**Delete all seven sites.** `encodeTeaBlob` keeps HomoLand's branch as its only
behaviour.

**Files:**
- Modify: `library/machine/protocol.ts:377-424`
- Modify: `library/machine/Machine.ts:199-212, 834`
- Modify: `library/Settings.ts:50-59`
- Modify: `hooks/useBrew.ts:40, 51-52`
- Modify: `app/machine.tsx:256-259, 333, 495-499`
- Modify: `docs/copy.md:944-947`
- Modify: the tea protocol tests

- [x] **Step 1: Find every site**

```bash
grep -rn "teaSteep\|TeaSteepEncoding\|TEA_STEEP\|saya6k\|homoland" library app hooks components docs
```

Expected: matches in the six source files above, in `docs/copy.md:944-947`, in
`docs/machine-integration/ble-protocol.md` (leave the research docs alone — they
record what was believed, and contradiction C11 is now answered, not deleted),
and in the protocol tests.

- [x] **Step 2: Simplify `teaSteepBytes`**

In `library/machine/protocol.ts`, delete the `TeaSteepEncoding` type and reduce
the function to HomoLand's branch:

```ts
/**
 * Bytes 4 and 5 of a tea segment — the two the coffee format spends on a
 * two's-complement wait and a zero.
 *
 * There used to be a second candidate reading behind a console switch. A
 * stopwatched sixty-second steep on real hardware settled it on 2026-09-01: this
 * is the right one. See contradiction C11 in
 * `docs/machine-integration/ble-protocol.md`, now answered.
 */
export function teaSteepBytes(seconds: number): [number, number] {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return [(-remainder) & 0xFF, (minutes * 32) & 0xFF];
}
```

Drop the `encoding` parameter from `encodeTeaBlob` and its call:

```ts
export function encodeTeaBlob(recipe: BlobRecipe): Uint8Array {
```

```ts
        const [wait, soak] = teaSteepBytes(Math.round(pour.pauseTime));
```

- [x] **Step 3: Strip the machine, the hook, the setting and the console**

In `library/machine/Machine.ts`, delete `private steepEncoding`, the
`teaSteepEncoding` getter and `setTeaSteepEncoding`, and change the call:

```ts
                    buildType1Bytes(4513, encodeTeaBlob(recipe))
```

In `hooks/useBrew.ts`, delete the `teaSteepEncoding` setting read and its
`useEffect`. In `library/Settings.ts`, delete the `teaSteepEncoding` key and its
comment. In `app/machine.tsx`, delete `TEA_STEEP_OPTIONS`, the setting hook and
the `SettingsChoiceRow` for it.

- [x] **Step 4: Update the tests**

Existing protocol tests call `teaSteepBytes(seconds, "homoland")` and
`encodeTeaBlob(recipe, "homoland")`. Drop the second argument. **Delete the
saya6k cases outright** — do not keep them asserting on a branch that no longer
exists.

```bash
grep -rn "teaSteepBytes\|encodeTeaBlob" library/machine/__tests__ hooks/__tests__ app/__tests__
```

- [x] **Step 5: Remove the copy rows**

Delete `docs/copy.md:944-947` — the four `console.teaSteep.*` rows.

- [x] **Step 6: Verify it is all gone**

```bash
grep -rn "teaSteep\|TeaSteepEncoding\|TEA_STEEP\|saya6k" library app hooks components docs/copy.md
```

Expected: no matches. Then:

```bash
npm run typecheck && npx jest library/machine hooks app
```

Expected: typecheck clean, all PASS.

- [x] **Step 7: Commit**

```bash
git add -A
printf '%s\n' "refactor(machine): remove the tea steep encoding switch" "" "A stopwatched sixty-second steep on real hardware settled this on" "2026-09-01. A live switch that can only be set wrongly is a trap." "" "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" > /tmp/xbrw-commit.txt
git -c commit.gpgsign=false commit -F /tmp/xbrw-commit.txt
```

---

## Task 14: Advise on the stage ceiling

The editor lets a user add stages a card cannot hold and only refuses at the
write. An advisory as they cross the line is kinder — but it is **advisory only**:
it does not disable the add button and does not block saving, because a recipe
that is only ever brewed over BLE has no ceiling at all.

Capacity comes from the last card actually read, falling back to 10 (the smaller
of the two capacities seen on genuine cards).

**`SIGNATURE_BYTES` must move.** It lives in `library/NFC.ts:38`, and importing a
runtime value from `NFC` drags `react-native-nfc-manager` into every consumer —
that exact mistake broke 37 suites once, and is the reason `cardWriteErrors.ts`
exists.

**Files:**
- Modify: `library/cardWriteErrors.ts`
- Modify: `library/NFC.ts:38`
- Modify: `app/editRecipe.tsx`
- Test: `library/__tests__/cardWriteErrors.test.ts`
- Test: `app/__tests__/editRecipe.bypass.test.tsx`

- [x] **Step 1: Write the failing capacity test**

Add to `library/__tests__/cardWriteErrors.test.ts`:

```ts
import {maxStagesForBytes, SIGNATURE_BYTES} from "@/library/cardWriteErrors";

describe("maxStagesForBytes", () => {
    it("knows the signature is 32 bytes", () => {
        expect(SIGNATURE_BYTES).toBe(32);
    });

    it("gets ten stages out of a 128-byte card", () => {
        // 128 total, less the 32-byte signature, less 12 of header and
        // trailer, over 8 per stage.
        expect(maxStagesForBytes(128 - SIGNATURE_BYTES)).toBe(10);
    });

    it("gets fourteen out of a 160-byte card", () => {
        expect(maxStagesForBytes(160 - SIGNATURE_BYTES)).toBe(14);
    });

    it("never goes negative", () => {
        expect(maxStagesForBytes(4)).toBe(0);
    });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npx jest library/__tests__/cardWriteErrors.test.ts`
Expected: FAIL — neither export exists there yet.

- [x] **Step 3: Move the constant and extract the arithmetic**

In `library/cardWriteErrors.ts`, add:

```ts
/**
 * The 32 bytes xBloom derives from the card's serial and writes ahead of the
 * recipe. We never regenerate it — we read it off the card and put it back —
 * which is why only genuine cards work, and why overrunning it is fatal.
 *
 * It lives here rather than in `NFC` so that anything wanting to reason about
 * capacity can have it without importing a runtime value from `NFC`, which
 * would drag `react-native-nfc-manager` into every consumer and every test.
 */
export const SIGNATURE_BYTES = 32;

/**
 * The most stages a given number of usable bytes could hold.
 *
 * `available` is already net of the signature: it is what a recipe may spend.
 */
export function maxStagesForBytes(available: number): number {
    return Math.max(
        Math.floor((available - CARD_OVERHEAD_BYTES) / CARD_BYTES_PER_STAGE),
        0
    );
}
```

and have the error delegate:

```ts
    maxStages(): number {
        return maxStagesForBytes(this.availableBytes);
    }
```

In `library/NFC.ts`, replace the declaration at line 38 with a re-export, so
existing importers keep working:

```ts
export {SIGNATURE_BYTES, CardWriteError, CardCapacityError} from "./cardWriteErrors";
```

and add the value import `NFC.ts:324` needs:

```ts
import {SIGNATURE_BYTES} from "./cardWriteErrors";
```

- [x] **Step 4: Run the capacity tests and the card suites**

Run: `npx jest library/__tests__/cardWriteErrors.test.ts library/__tests__/Recipe`
Expected: PASS. Watch the suite count — if suites start failing with
`react-native-nfc-manager` in the trace, an import went the wrong way.

- [x] **Step 5: Write the failing advisory test**

Add to `app/__tests__/editRecipe.bypass.test.tsx`:

```tsx
describe("stage ceiling advisory", () => {
    it("says nothing at ten stages on a 128-byte card", async () => {
        settings.set("lastCardRead", serialiseCapture(captureWithBlocks(32, 4)));
        await renderEditor(recipeWithStageCount(10));
        await fireEvent.press(screen.getByLabelText("Stages"));

        expect(screen.queryByTestId("stage-ceiling")).toBeNull();
    });

    it("advises at eleven stages on a 128-byte card", async () => {
        settings.set("lastCardRead", serialiseCapture(captureWithBlocks(32, 4)));
        await renderEditor(recipeWithStageCount(11));
        await fireEvent.press(screen.getByLabelText("Stages"));

        expect(screen.getByTestId("stage-ceiling")).toHaveTextContent("10");
    });

    it("uses the larger card when that is the one last read", async () => {
        settings.set("lastCardRead", serialiseCapture(captureWithBlocks(40, 4)));
        await renderEditor(recipeWithStageCount(11));
        await fireEvent.press(screen.getByLabelText("Stages"));

        expect(screen.queryByTestId("stage-ceiling")).toBeNull();
    });

    it("falls back to ten when no card has ever been read", async () => {
        settings.set("lastCardRead", "");
        await renderEditor(recipeWithStageCount(11));
        await fireEvent.press(screen.getByLabelText("Stages"));

        expect(screen.getByTestId("stage-ceiling")).toBeTruthy();
    });

    it("still lets the recipe be saved", async () => {
        settings.set("lastCardRead", "");
        await renderEditor(recipeWithStageCount(11));

        expect(screen.getByLabelText("Save").props.accessibilityState.disabled)
            .toBeFalsy();
    });
});
```

`captureWithBlocks(blockCount, blockSize)` builds a `CardCapture` with that
`systemInfo` and any `uid`/`data`; model it on the fixture in
`components/__tests__/CardReadDiagnostic.test.tsx`.

- [x] **Step 6: Run it and watch it fail**

Run: `npx jest app/__tests__/editRecipe.bypass.test.tsx -t "stage ceiling"`
Expected: FAIL — `stage-ceiling` not found.

- [x] **Step 7: Implement**

At module scope in `app/editRecipe.tsx`:

```ts
/**
 * The most stages the last card read could hold.
 *
 * Genuine cards have been read at both 128 and 160 bytes, so the ceiling is a
 * property of the card in the user's hand rather than of the format. Falling
 * back to the smaller of the two is the conservative guess: advising a ceiling
 * that turns out to be generous is a refusal at the write, which is the failure
 * this is trying to save the user from.
 */
const FALLBACK_MAX_STAGES = 10;

function maxStagesFromLastCard(lastCardRead: string): number {
    const info = parseCapture(lastCardRead)?.systemInfo;
    if (!info) return FALLBACK_MAX_STAGES;
    return maxStagesForBytes(info.blockCount * info.blockSize - SIGNATURE_BYTES);
}
```

with the imports:

```ts
import {parseCapture} from "@/library/cardDiagnostics";
import {maxStagesForBytes, SIGNATURE_BYTES} from "@/library/cardWriteErrors";
```

In the screen body, next to the other setting reads:

```ts
    const [lastCardRead] = useSetting("lastCardRead");
```

and pass `maxStages={maxStagesFromLastCard(lastCardRead)}` to `StagesDeck`,
adding `maxStages: number;` to `StagesDeckProps`.

Inside `StagesDeck`, after the stage-mismatch banner and before the tile map:

```tsx
            {/* Advisory, not a gate. The add button stays live and the recipe
                stays saveable: a recipe that is only ever brewed over BLE has
                no ceiling at all, and refusing to let someone build one because
                a card could not hold it would be the app inventing a limit the
                machine does not have. `warn`, not `danger`: nothing is wrong
                yet. */}
            {recipe.pours.length > maxStages && (
                <XStack testID="stage-ceiling" alignItems="center" gap="$2.5"
                        marginTop="$2.5" padding="$3" borderRadius="$4"
                        backgroundColor={palette.raised}
                        borderLeftWidth={2} borderLeftColor={palette.warn}>
                    <YStack flex={1} gap={2}>
                        <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6}
                                       color={palette.warn}>
                            {`${recipe.pours.length} STAGES`}
                        </DotMatrixText>
                        <Text fontSize={12} lineHeight={16} color={palette.dim}>
                            {`A card holds ${maxStages} stages. This recipe can still be saved and brewed over Bluetooth, but it cannot be written to a card.`}
                        </Text>
                    </YStack>
                </XStack>
            )}
```

- [x] **Step 8: Run the tests and watch them pass**

Run: `npx jest app/__tests__/editRecipe library/__tests__/cardWriteErrors.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [x] **Step 9: Add the copy rows**

In `docs/copy.md`, under `### Stages`, with line numbers read off the file:

```markdown
| `editor.stages.ceiling.count` | `app/editRecipe.tsx:NN` | Doto headline of the stage-ceiling advisory. `${...}` is the stage count. | `${recipe.pours.length} STAGES` |
| `editor.stages.ceiling.body` | `app/editRecipe.tsx:NN` | Prose body of the stage-ceiling advisory, shown when a recipe has more stages than the last card read could hold. `${...}` is the card's capacity in stages. | `A card holds ${maxStages} stages. This recipe can still be saved and brewed over Bluetooth, but it cannot be written to a card.` |
```

- [x] **Step 10: Commit**

```bash
git add -A
printf '%s\n' "feat(stages): advise when a recipe outgrows the card in hand" "" "Capacity comes from the last card actually read, since genuine cards have" "been seen at both 128 and 160 bytes. Advisory only: a recipe brewed over" "Bluetooth has no ceiling, so this never blocks a save." "" "SIGNATURE_BYTES moves to cardWriteErrors so capacity can be reasoned" "about without importing a runtime value from NFC." "" "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" > /tmp/xbrw-commit.txt
git -c commit.gpgsign=false commit -F /tmp/xbrw-commit.txt
```

---

## Task 15: Surface the XID lookup failure

`fetchRecipeTitle` (`hooks/useRecipeEditor.ts:99-128`) swallows every failure into
a `console.log`. A user who typed an XID sees nothing happen and cannot tell a
wrong code from a dead network.

**Files:**
- Modify: `hooks/useRecipeEditor.ts:99-128`
- Modify: `app/editRecipe.tsx` (the XID row)
- Test: `hooks/__tests__/useRecipeEditor.xid.test.ts` (create)

- [x] **Step 1: Write the failing test**

```ts
import {act, renderHook, waitFor} from "@testing-library/react-native";

import {useRecipeEditor} from "@/hooks/useRecipeEditor";
import Recipe from "@/library/Recipe";
import {XBloomRecipe} from "@/library/XBloomRecipe";

jest.mock("@/library/XBloomRecipe");

describe("XID lookup failure", () => {
    it("reports a lookup that failed", async () => {
        (XBloomRecipe as jest.Mock).mockImplementation(() => ({
            fetchRecipeDetail: () => Promise.reject(new Error("offline")),
            getRecipeTitle:    () => "",
            getRecipe:         () => null
        }));

        const recipe = new Recipe();
        recipe.xid = "XB0001";
        const {result} = renderHook(() => useRecipeEditor({
            recipeJSON: JSON.stringify(recipe), temperatureUnit: "C", onSaved: () => {}
        }));

        await waitFor(() => expect(result.current.xidLookupFailed).toBe(true));
    });

    it("reports nothing when the lookup succeeds", async () => {
        (XBloomRecipe as jest.Mock).mockImplementation(() => ({
            fetchRecipeDetail: () => Promise.resolve(),
            getRecipeTitle:    () => "Ethiopia Guji",
            getRecipe:         () => null
        }));

        const recipe = new Recipe();
        recipe.xid = "XB0001";
        const {result} = renderHook(() => useRecipeEditor({
            recipeJSON: JSON.stringify(recipe), temperatureUnit: "C", onSaved: () => {}
        }));

        await waitFor(() =>
            expect(result.current.recipe?.xbloomName).toBe("Ethiopia Guji"));
        expect(result.current.xidLookupFailed).toBe(false);
    });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npx jest hooks/__tests__/useRecipeEditor.xid.test.ts`
Expected: FAIL — `xidLookupFailed` is `undefined`.

- [x] **Step 3: Implement**

In `hooks/useRecipeEditor.ts`, add the state next to `volumeError`:

```ts
    /**
     * The XID lookup was tried and did not work.
     *
     * It used to go into a `console.log` and nowhere else, so a user who typed
     * an XID saw nothing happen and could not tell a wrong code from a dead
     * network. Not an error state on the field: the recipe is perfectly valid
     * without a looked-up name, and the XID may simply not be one this account
     * can see.
     */
    const [xidLookupFailed, setXidLookupFailed] = useState(false);
```

and in `fetchRecipeTitle`:

```ts
    const fetchRecipeTitle = async (r: Recipe) => {
        setXidLookupFailed(false);
        try {
            // ... unchanged body ...
        } catch (error) {
            console.log("Failed to fetch recipe title:", error);
            setXidLookupFailed(true);
        }
    };
```

Add `xidLookupFailed` to the returned object next to `volumeError`.

- [x] **Step 4: Run the tests and watch them pass**

Run: `npx jest hooks/__tests__/useRecipeEditor.xid.test.ts`
Expected: PASS, 2 tests.

- [x] **Step 5: Show it on the XID row**

In `app/editRecipe.tsx`, pull `xidLookupFailed` out of the hook's return and pass
it into `BrewDeck` as a prop (add `xidLookupFailed: boolean;` to `BrewDeckProps`),
then annotate the XID `FieldRow`:

```tsx
            <FieldRow topic="xid" showHint={showHint}
                      note={xidLookupFailed ? "not found" : undefined}>
```

`note` rather than `error`: the recipe is valid without a looked-up name, and
`error` is what gates the save button. Find the row with:

```bash
grep -n 'topic="xid"' app/editRecipe.tsx
```

- [x] **Step 6: Write the screen test**

```tsx
it("marks the XID row when the lookup fails", async () => {
    // mock XBloomRecipe to reject, as in the hook test
    await renderEditor(recipeWithXid("XB0001"));

    await waitFor(() =>
        expect(screen.getByText(/not found/i)).toBeTruthy());
});
```

Run: `npx jest app/__tests__/editRecipe`
Expected: PASS.

- [x] **Step 7: Add the copy row and commit**

In `docs/copy.md`, under the BREW deck section, with the real line number:

```markdown
| `editor.xid.notFound` | `app/editRecipe.tsx:NN` | Annotation on the XID label when the online lookup failed. | `not found` |
```

```bash
git add -A
printf '%s\n' "feat(editor): say so when an XID lookup fails" "" "It went into a console.log and nowhere else, so a user who typed an XID" "could not tell a wrong code from a dead network. A note on the label, not" "an error: the recipe is valid without a looked-up name." "" "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" > /tmp/xbrw-commit.txt
git -c commit.gpgsign=false commit -F /tmp/xbrw-commit.txt
```

---

## Task 16: The full gate

- [x] **Step 1: Re-check every copy line number**

Line numbers drift with every edit above. Do this **last**, and do it for every
row you touched:

```bash
grep -n "BYPASS WATER\|Add bypass water\|Remove bypass water\|A card cannot store\|Show bypass water\|ML BREW\|ML BYPASS\|STAGES\|not found" components/BypassRung.tsx components/StageProfile.tsx app/editRecipe.tsx
```

Then read back each cited line and confirm it holds the string the register
claims:

```bash
sed -n 'NNp' <file>
```

- [x] **Step 2: Run the whole gate**

```bash
npm run typecheck
npm run lint
npm test
npx expo-doctor
```

Expected:
- typecheck: clean
- lint: **0 errors.** Warnings may rise above the 6-warning baseline only for
  `react-hooks/exhaustive-deps`, which is a warning on purpose because the
  compiler owns memoisation. Any other new warning is a real finding.
- tests: **all green**, suite count 149 or more, test count 2367 or more.
- expo-doctor: 21/21. This is a hard CI failure, not advisory.

- [x] **Step 3: Confirm nothing dragged NFC into the world**

```bash
npx jest --listTests | wc -l
grep -rn "from \"@/library/NFC\"\|from \"./NFC\"" library app components hooks | grep -v "^library/NFC.ts"
```

Expected: the test count has not dropped, and every remaining `NFC` import is a
`import type` or is in a file that genuinely talks to a card.

- [x] **Step 4: Push**

```bash
git push origin m4-watch-it-brew
gh pr view 84 -R hessius/XBRecipeWriterPlus --json url,state
```

- [x] **Step 5: Hand over for device testing**

Everything up to here is verifiable on a laptop. The next section is not: it
needs the machine, a real card, and a thermometer.

---
# Testing plan

Written to be worked through in order, in one sitting, with the machine and a
genuine card to hand. Every item that needs **your judgement** rather than a
pass/fail is marked **DECISION** and says what to do with each answer.

## Before you start

**No rebuild is needed.** Nothing in this plan touches a native module, an Expo
config plugin, or `app.json`. A JS reload of the existing dev client picks all of
it up. If you do end up rebuilding for an unrelated reason, remember
`runtimeVersion.policy` is `appVersion`, so a native-affecting change would need
an `expo.version` bump — but this one does not.

What you need:
- The dev client already installed, on a physical device (NFC and BLE are both
  impossible in a simulator).
- **Two genuine cards of different capacities**: the 128-byte one
  (UID `E0 04 A2 11 2E 9D 2E CA`, 32 blocks) and the 160-byte one
  (UID `E0 77 3C 02 DC 2D D1 4B`, 40 blocks). Section C needs both.
- The machine, powered, with water and a cup.
- **A thermometer you can put in the cup.** One decision in Section D cannot be
  made without it.
- A recipe with a small brew volume and a large ratio, so the bypass is a
  visible fraction of the cup.

---

## Section A · The editor, no hardware

Do this first. If anything here is wrong, do not waste a card or a brew on it.

- [ ] **A1.** Open any coffee recipe, switch to the STAGES deck. There is a
  dashed rung at the bottom of the ladder reading `+ BYPASS WATER`.

  **DECISION — does the ghost rung read as something you can tap?**
  It is deliberately the same dashed shape as `+ ADD STAGE` directly above it,
  which is the strongest available signal that it is an affordance. If it reads
  as a disabled row or as a label instead, say so: the fallbacks are (a) give it
  the accent colour rather than `dim`, or (b) add a `+` glyph. Do not decide this
  from the simulator — dashed 1px borders read very differently on a real screen.

- [ ] **A2.** Tap it. The rung fills in, opens, and shows two steppers: Volume
  and Temperature.

  **DECISION — are 30 ml and 85 °C the right starting values?**
  30 ml is roughly the smallest dilution worth doing, and 85 °C is what `Recipe`
  already defaults to, so enabling bypass on a fresh recipe does not move the
  number. If you would rather it started somewhere else, the two constants are
  `BYPASS_DEFAULT_VOLUME` and `BYPASS_DEFAULT_TEMPERATURE` in
  `library/bypassLimits.ts` and changing them is a one-line edit plus a test
  fixture update. Decide now, not after the App Store build.

- [ ] **A3.** The profile above the ladder has gained a band at the right-hand
  end: a dashed outline in blue with a faint fill.

  **DECISION — is the bypass mark distinguishable from the target rule?**
  This is the one the mockup could not settle. Both are dashed. The bypass is
  `9 5` and blue, the target is `4 3` and grey (or red when short). Hold the
  phone at normal reading distance. If they read as one kind of mark, the fix is
  to make the bypass solid-outlined rather than dashed — the colour and the
  band separation already carry most of the distinction. **Look at it both
  balanced and unbalanced**, because the target rule turns red when short and
  that changes the comparison.

- [ ] **A4.** Tap the bypass band on the profile. The rung below opens and
  scrolls into view, exactly as tapping a stage band does.

- [ ] **A5.** Change the bypass volume to something large — 200 ml on a 260 ml
  brew. The band grows. Now make it larger than the brew total, say 400 ml.

  **DECISION — does the graph still read correctly when the bypass dominates?**
  The whole chart rescales, so the brew curve shrinks. That is correct
  arithmetic and may still look wrong. If it does, the alternative is to cap the
  bypass band's drawn height rather than rescaling everything — but that lies
  about the proportion, so only ask for it if the honest version is genuinely
  unreadable.

- [ ] **A6.** Read the note under the rung header: "A card cannot store bypass
  water. Writing this recipe to a card leaves it out."

  Now turn hints **off** in settings and come back. **The note is still there.**
  That is deliberate: it is a data-loss warning, not an explanation.

  **DECISION — is that the right call?** The cost is a permanent two-line note on
  every bypass recipe. The benefit is that someone who folded the notes away
  still finds out before a write drops their bypass silently.

- [ ] **A7.** Turn hints **on**. The open rung now also shows the long
  explanation. Turn them off; it goes, the card note stays.

- [ ] **A8.** Switch to the BREW deck. The header reads
  `260  ML BREW  + 30 ML BYPASS`.

  **DECISION — does the split total read clearly?**
  Note the label changed from `ML TOTAL` to `ML BREW` on **every** recipe, bypass
  or not. "Total" became a false claim the moment something was dispensed outside
  it, and a label that changes shape between recipes is a label the eye has to
  re-read. If `ML BREW` reads oddly on a recipe with no bypass, the alternatives
  are `ML WATER` or keeping `ML TOTAL` and accepting the inaccuracy.

- [ ] **A9.** Confirm the stage ladder still sums to the brew target and the
  red mismatch banner does **not** appear. Bypass must not enter that sum — the
  machine refuses a recipe whose stages do not add up to dose × ratio, and this
  is the invariant most at risk from this change.

- [ ] **A10.** Open the rung and tap REMOVE. The ghost comes back, the profile
  band goes, the BREW header drops the split, and nothing is left selected.

- [ ] **A11.** Turn bypass on, set 45 ml / 60 °C, turn it off, turn it on again.
  **It comes back at 45 / 60, not 30 / 85.** Toggling must not be destructive.

- [ ] **A12.** Open a **tea** recipe. Switch to STAGES.
  **There is no bypass rung and no ghost rung**, and the BREW header shows no
  split. The machine ignores bypass for tea, so an affordance for it would be a
  lie.

- [ ] **A13.** Save a bypass recipe, leave the editor, reopen it. The bypass is
  still there with the right numbers.

- [ ] **A14.** Share a recipe that has **no** bypass and that you have shared
  before. **It must not re-mint.** If the app offers a fresh link where it used
  to show the stored one, stop — the share payload has churned and every
  previously shared recipe in the world just went stale.

---

## Section B · Import

- [ ] **B1.** Import the xBloom recipe that carries a bypass (the one from the
  screenshot feedback). The bypass arrives, enabled, with the right volume and
  temperature.

- [ ] **B2.** Import a recipe with no bypass. It arrives with bypass off and the
  ghost rung showing.

---

## Section C · Cards

You need both cards for C3 and C4.

- [ ] **C1.** With bypass **on**, tap WRITE. The existing warning sheet appears
  telling you the bypass will not be written. Confirm and write.

- [ ] **C2.** Read that card back. The recipe is correct and **has no bypass** —
  which is the expected loss, not a bug. This is exactly the behaviour the
  always-visible note in A6 exists to warn about.

- [ ] **C3.** Read the **128-byte** card (32 blocks). Now build a recipe with
  **11 stages**. An amber advisory appears: "A card holds 10 stages. This recipe
  can still be saved and brewed over Bluetooth, but it cannot be written to a
  card."

  **DECISION — does the advisory fire at the right moment?**
  It appears at 11 stages on this card, not at 10. The add button stays live and
  the recipe stays saveable, deliberately: a recipe only ever brewed over BLE has
  no ceiling. If you would rather the button disabled at the ceiling, that is a
  one-line change — but it would then be the app inventing a limit the machine
  does not have.

- [ ] **C4.** Now read the **160-byte** card (40 blocks) and go back to that same
  11-stage recipe. **The advisory is gone**, because this card holds 14. This is
  the test that proves the ceiling comes from the card in your hand rather than
  from a constant.

- [ ] **C5.** Reset the app's stored card read (or use a fresh install) so no
  card has ever been read. The 11-stage recipe shows the advisory again, at the
  conservative fallback of 10.

- [ ] **C6.** Still on the 11-stage recipe: **Save works.** WRITE is refused with
  the capacity message. That split is the point.

---

## Section D · The machine

This is the section that cannot be done anywhere else, and the one open question
in the whole design lives here.

- [ ] **D1.** Connect. Brew a recipe with bypass **off**. It behaves exactly as
  before. If this regressed, stop — the 8102 frame carries the dose, and a
  mistake here makes the grind drift on every recipe, bypass or not.

- [ ] **D2.** Brew a recipe with bypass **on**, 45 ml. Watch the end of the brew.
  **Roughly 45 ml of extra water goes into the cup after the last pour.**

  If nothing extra is dispensed, the encoding is wrong or the machine wants a
  different frame — go to D3 before concluding anything.

- [ ] **D3.** **DECISION — which bypass temperature encoding is correct?**
  This is the single thing only hardware can settle, and it is why the reading is
  a runtime switch rather than a constant.

  1. Set the bypass to a temperature far from the brew temperature — **60 °C on a
     93 °C brew** — so the difference is unmistakable in the cup.
  2. Open the machine console (Settings → machine console) and find
     **Bypass temperature**. Leave it on **x10**, the default.
  3. Brew. Put the thermometer in the bypass water as it lands, or take the cup
     temperature immediately after.
  4. Now switch the console setting to **Degrees** and brew the same recipe
     again. Same thermometer, same timing.

  **What each outcome means:**
  - **x10 gave roughly 60 °C, Degrees gave something much hotter or much cooler**
    → `scaled` is right. It is already the default. Report back and the switch
    can be deleted, exactly as the tea steep switch was.
  - **Degrees gave roughly 60 °C** → `plain` is right. Report back; the default
    flips and the switch can be deleted.
  - **Both gave the same thing** → the argument is not a temperature at all, or
    the machine ignores it. Report back with both readings; this reopens a
    protocol question rather than a UI one.
  - **Neither dispensed anything** → the problem is the volume argument or the
    frame, not the temperature. Report the console log for the 8102 frame.

  Take an actual number in each case. "Felt about right" cannot settle this.

- [ ] **D4.** Brew a **tea** recipe that has bypass values stored on it from
  before. **No bypass is dispensed.** Tea suppresses it everywhere.

- [ ] **D5.** Confirm the tea steep timing is still correct. The encoding switch
  was removed in this round and HomoLand's reading hardcoded — a 60-second steep
  should still take 60 seconds. This is a regression check on a thing that was
  already settled, so a stopwatch on one steep is enough.

- [ ] **D6.** Check the machine console: **Tea steep encoding is gone** and
  **Bypass temperature** is in its place.

---

## What to report back

For each **DECISION** above, one line with the answer. In particular:

1. **D3 — the encoding, with two thermometer readings.** Everything else in this
   plan is reversible from a laptop; this is not.
2. **A1 — does the ghost rung read as tappable.**
3. **A3 — can you tell the bypass mark from the target rule.**
4. **A8 — does `ML BREW` plus the split read clearly.**
5. **A2 — are 30 ml / 85 °C the right seeds.**
6. **A5 — does a dominant bypass still read correctly.**
7. **A6 — is the always-on card note worth its two lines.**
8. **C3 — does the advisory fire at the right moment, and should the add button
   disable at the ceiling.**

Anything in Section A, B or C that failed outright is a bug, not a decision —
report it with the recipe that produced it.

---

## Deferred, on purpose

The visual polish pass is a round of its own. The 19-item inspection checklist is
in section 12 of the design spec
(`docs/superpowers/specs/2026-09-08-bypass-editing-design.md`). Do not fold
cosmetic findings from this round into that round's scope — write them down and
let them be planned.

Also still open and **not** addressed here:
- Event 40520 `RD_Bypass` is single-source and unverified. Nothing in this plan
  relies on it.
- Whether the machine reports bypass progress during a brew at all. The brew
  screen shows nothing for it, which is honest until D2 says otherwise.

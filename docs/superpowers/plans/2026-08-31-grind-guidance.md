# Grind-Size Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tell the user what a grind number means at the point of choosing it, and explain — rather than merely refuse — an imported recipe whose grind is too fine for a card.

**Architecture:** One new domain module, `library/grindBands.ts`, owns the band table and the only lookup. Four presentation layers read from it and hold no band knowledge of their own: the editor's row label, an out-of-range banner in the editor, a notice on the import preview, and the help sheet.

**Tech Stack:** TypeScript, Expo SDK 57, Tamagui, jest-expo, `@testing-library/react-native` v14 (async `render`/`fireEvent`).

**Spec:** `docs/superpowers/specs/2026-08-31-grind-guidance-design.md`

**Branch:** `feature/grind-guidance` (already created, spec already committed).

---

## Background the engineer needs

**Grind on a card is `value − 40`.** `GRIND_SIZE_OFFSET = 40` in `library/Recipe.ts:15`. `cardLimits.ts:24` allows 40–80 and that is **correct and hardware-verified** (#68). Never widen it below 40 — the encoder would emit a negative byte and write a malformed card, which is not trivially recoverable on real hardware.

**81 is not a grind.** `GRINDER_OFF = 41` (`library/Recipe.ts:13`) is the *byte*; the user-facing value is `40 + 41 = 81`, meaning grinder off. It must never render as a coarseness.

**The cloud speaks a different scale.** `library/XBloomRecipe.ts:36` copies `grinderSize` (1–80) straight into `recipe.grindSize`, so an imported espresso recipe legitimately holds e.g. 25. That is not a bug to fix by clamping — see the spec.

**Repo conventions that will bite you:**
- All colour comes from `constants/colors.ts`. No hex literals, no CSS colour names.
- Components must be declared at module scope, never inside another component's body.
- The React Compiler is on: do **not** hand-write `useMemo`/`useCallback`.
- `render` and `fireEvent` from RNTL v14 are **async**. A missing `await` leaves `screen` empty and the test passes for the wrong reason.
- Always render via `renderWithProviders` from `@/test-utils/render`.
- Import via the `@/` alias.

**Commands:** `npx jest <path>` for one file, `npm run typecheck`, `npm run lint`.

---

## File Structure

| File | Responsibility |
|---|---|
| `library/grindBands.ts` | **Create.** The band table and the single lookup. No React. |
| `library/__tests__/grindBands.test.ts` | **Create.** Boundary and sentinel coverage. |
| `constants/recipeHelp.ts` | **Modify.** `grindSize` gains `question` + `detail`. |
| `components/FieldRow.tsx` | **Modify.** Optional `note` appended to the label. |
| `components/ImportResult.tsx` | **Modify.** Notice line for a sub-40 imported grind. |
| `hooks/useRecipeEditor.ts` | **Modify.** `coarsenGrindToMinimum` action. |
| `app/editRecipe.tsx` | **Modify.** Band on the grind row; out-of-range banner. |
| `library/cardLimits.ts` | **Modify.** Explain a below-minimum grind. |
| `components/__tests__/FieldRow.test.tsx` | **Modify.** Existing file; add the `note` cases. |
| `components/__tests__/ImportResult.test.tsx` | **Modify.** Existing file; add the notice cases, reusing its `preview()` fixture. |

---

## Task 1: The band module

**Files:**
- Create: `library/grindBands.ts`
- Test: `library/__tests__/grindBands.test.ts`

- [ ] **Step 1: Write the failing test**

Create `library/__tests__/grindBands.test.ts`:

```typescript
import {grindBand, CARD_GRIND_MIN} from "@/library/grindBands";

describe("grindBand", () => {
    it("names the bands a card can reach", () => {
        expect(grindBand(40)).toMatchObject({label: "Pourover", onCard: true});
        expect(grindBand(55)).toMatchObject({label: "Pourover", onCard: true});
        expect(grindBand(56)).toMatchObject({label: "French press", onCard: true});
        expect(grindBand(80)).toMatchObject({label: "French press", onCard: true});
    });

    it("names the bands a card cannot reach, so an import can be explained", () => {
        expect(grindBand(1)).toMatchObject({label: "Espresso", onCard: false});
        expect(grindBand(15)).toMatchObject({label: "Espresso", onCard: false});
        expect(grindBand(16)).toMatchObject({label: "Aeropress", onCard: false});
        expect(grindBand(30)).toMatchObject({label: "Aeropress", onCard: false});
        expect(grindBand(31)).toMatchObject({label: "Pourover", onCard: false});
        expect(grindBand(39)).toMatchObject({label: "Pourover", onCard: false});
    });

    it("reports the grinder-off sentinel as off, not as a coarseness", () => {
        // 81 is GRIND_SIZE_OFFSET (40) + GRINDER_OFF (41). Rendering it as
        // "coarser than cold brew" is the specific bug this guards.
        expect(grindBand(81)).toBeUndefined();
    });

    it("has no band for values off either end of the grinder's own scale", () => {
        expect(grindBand(0)).toBeUndefined();
        expect(grindBand(82)).toBeUndefined();
        expect(grindBand(-1)).toBeUndefined();
    });

    it("exposes the card floor so the UI does not re-type it", () => {
        expect(CARD_GRIND_MIN).toBe(40);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest library/__tests__/grindBands.test.ts`

Expected: FAIL — `Cannot find module '@/library/grindBands'`.

- [ ] **Step 3: Write the implementation**

Create `library/grindBands.ts`:

```typescript
/**
 * What a grind number means.
 *
 * The bands are the official xBloom app's own guidance. They cover the
 * grinder's full 1-80 scale, not just the 40-80 a card can carry, because an
 * imported recipe can legitimately hold a finer value -- the cloud stores grind
 * on the grinder's scale (`XBloomRecipe.ts` copies it straight through) -- and
 * we have to be able to name what such a recipe was ground for before we can
 * explain why it will not write.
 *
 * This is the only place the band boundaries are written down. Grind size
 * already has four different encodings across card, cloud and BLE (see
 * `docs/machine-integration/roadmap.md`), every one of which fails silently
 * rather than erroring; letting a fifth interpretation spread across call sites
 * is not a risk worth taking for a table this small.
 */

import {GRIND_SIZE_OFFSET, GRINDER_OFF} from "./Recipe";

/** The finest grind a card can store. Below this, `grindSize - 40` goes negative. */
export const CARD_GRIND_MIN = 40;

/**
 * The value that means "grinder off" rather than a coarseness.
 *
 * `GRINDER_OFF` is the byte on the card; the number a user sees is that byte
 * plus the offset. Conflating the two is a mistake that has already been made
 * once, in the original text of #52.
 */
const GRINDER_OFF_VALUE = GRIND_SIZE_OFFSET + GRINDER_OFF;

export type GrindBand = {
    /** Short enough to sit on a row label beside the field's own name. */
    label: string;
    /** The unabbreviated form, for prose. */
    longLabel: string;
    /** Whether a recipe card can store a grind in this band at all. */
    onCard: boolean;
};

const BANDS: readonly {max: number; band: GrindBand}[] = [
    {max: 15, band: {label: "Espresso",     longLabel: "espresso",                  onCard: false}},
    {max: 30, band: {label: "Aeropress",    longLabel: "Aeropress",                 onCard: false}},
    {max: 55, band: {label: "Pourover",     longLabel: "pourover or a coffee maker", onCard: true}},
    {max: 80, band: {label: "French press", longLabel: "French press or cold brew", onCard: true}}
];

/**
 * The band a grind value falls in, or `undefined` if it names no coarseness.
 *
 * Undefined covers two cases the caller must not draw as a band: the
 * grinder-off sentinel, and anything off the ends of the grinder's scale.
 */
export function grindBand(value: number): GrindBand | undefined {
    if (value === GRINDER_OFF_VALUE) return undefined;
    if (!Number.isFinite(value) || value < 1 || value > 80) return undefined;

    const match = BANDS.find((entry) => value <= entry.max);
    if (match === undefined) return undefined;

    // The pourover band straddles the card's floor: 31-39 is pourover and
    // unreachable, 40-55 is pourover and fine. So reachability is decided by
    // the value, not by the band it landed in.
    return {...match.band, onCard: match.band.onCard && value >= CARD_GRIND_MIN};
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest library/__tests__/grindBands.test.ts`

Expected: PASS, 5 tests.

Note the `31` and `39` cases: they are in the pourover band but below the card floor, which is why `onCard` is recomputed from the value.

- [ ] **Step 5: Commit**

```bash
git add library/grindBands.ts library/__tests__/grindBands.test.ts
git commit -m "Add the grind band table

$(printf 'The official app names four grind bands. This is the only place\nthose boundaries are written down: grind size already has four\nencodings across card, cloud and BLE and all of them fail silently,\nso a fifth reading loose in the call sites is not worth the risk.\n\nIt covers the full 1-80 scale rather than the 40-80 a card carries,\nbecause an imported recipe can hold a finer value and we have to name\nwhat it was ground for before we can explain why it will not write.\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>')"
```

---

## Task 2: `FieldRow` carries a note on its label

**Files:**
- Modify: `components/FieldRow.tsx`
- Test: `components/__tests__/FieldRow.test.tsx` (exists — append to its `describe("FieldRow")` block)

- [ ] **Step 1: Write the failing test**

Append these two cases inside the existing `describe("FieldRow", ...)` block in `components/__tests__/FieldRow.test.tsx`. The file already imports `React`, `Text` from `react-native`, `screen`, `FieldRow` and `renderWithProviders`, so no new imports are needed:

```typescript
    it("appends a note to the label", async () => {
        await renderWithProviders(
            <FieldRow topic="grindSize" note="Pourover"><Text>47</Text></FieldRow>
        );

        expect(screen.getByText("Grind size · Pourover")).toBeTruthy();
    });

    it("draws the note whether or not the hint is asked for", async () => {
        // The note is not a hint. Hints are opt-in and off by default, so
        // gating the note behind them would hide it from most users, which is
        // the whole point of drawing it.
        await renderWithProviders(
            <FieldRow topic="grindSize" showHint note="French press">
                <Text>60</Text>
            </FieldRow>
        );

        expect(screen.getByText("Grind size · French press")).toBeTruthy();
        expect(screen.getByText("40 to 80. Lower is finer.")).toBeTruthy();
    });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest components/__tests__/FieldRow.test.tsx`

Expected: FAIL — the two new cases cannot find `Grind size · Pourover`; TypeScript will also reject the unknown `note` prop. The file's pre-existing cases still pass.

- [ ] **Step 3: Write the implementation**

In `components/FieldRow.tsx`, add to the `Props` type, immediately after `topic`:

```typescript
    /**
     * A live annotation on the field's own name, e.g. what the current value
     * means.
     *
     * Deliberately not a hint. Hints are opt-in and off by default, so a note
     * routed through `showHint` would be invisible to most users. It also
     * costs no height, which is what keeps it from re-creating the problem
     * that made hints opt-in in the first place.
     */
    note?: string;
```

Change the signature:

```typescript
export default function FieldRow({topic, note, showHint, error, children}: Props) {
```

Replace the label `Text` element:

```typescript
                    <Text fontSize={11} letterSpacing={1.5}
                          textTransform="uppercase" color={palette.muted}>
                        {note === undefined ? entry.title : `${entry.title} · ${note}`}
                    </Text>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest components/__tests__/FieldRow.test.tsx`

Expected: PASS — the file's pre-existing cases plus the two new ones.

- [ ] **Step 5: Commit**

```bash
git add components/FieldRow.tsx components/__tests__/FieldRow.test.tsx
git commit -m "Let a field row annotate its own label

$(printf 'A note is not a hint. Hints are opt-in and off by default, so a note\nrouted through showHint would be invisible to most people, and the\nnext change wants to say what the current grind number means.\n\nOn the label rather than under it, so it costs no height and does not\nre-create the problem that made hints opt-in.\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>')"
```

---

## Task 3: The band on the grind row

**Files:**
- Modify: `app/editRecipe.tsx`

- [ ] **Step 1: Add the import**

In `app/editRecipe.tsx`, alongside the existing `@/library/...` imports:

```typescript
import {grindBand} from "@/library/grindBands";
```

- [ ] **Step 2: Pass the band to the row**

In `BrewDeck`, replace the grind size `FieldRow` (currently at `app/editRecipe.tsx:229-235`):

```typescript
            {showGrind && (
                <FieldRow topic="grindSize"
                      // What this number means, on the label, where it costs no
                      // height. `grindBand` returns undefined for the
                      // grinder-off sentinel and for anything off the scale, and
                      // the row then just shows its own name.
                      note={grindBand(recipe.grindSize)?.label}
                      showHint={showHint}>
                    <Stepper label="Grind size" value={recipe.grindSize}
                             min={40} max={80} step={1}
                             onChange={(value) => dispatch(RECIPE_LABELS.GRIND_SIZE, String(value))}/>
                </FieldRow>
            )}
```

- [ ] **Step 3: Verify it typechecks**

Run: `npm run typecheck`

Expected: no errors.

- [ ] **Step 4: Run the editor's existing tests to check nothing regressed**

Run: `npx jest app/__tests__/editRecipe.test.tsx`

Expected: PASS. If a test asserted on the exact text `Grind size`, it will now fail because the label reads `Grind size · Pourover`. Update that assertion to the new text rather than removing the note.

- [ ] **Step 5: Commit**

```bash
git add app/editRecipe.tsx
git commit -m "Say what the grind number means

$(printf 'The editor asked for a number between 40 and 80 and said nothing\nabout what those numbers were for. A number without a unit is not a\nchoice, it is a guess.\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>')"
```

---

## Task 4: The fix action

**Files:**
- Modify: `hooks/useRecipeEditor.ts`

- [ ] **Step 1: Add the action**

In `hooks/useRecipeEditor.ts`, directly after `autoAdjustPourVolumes` (currently ending at line 179):

```typescript
    /**
     * Raise a too-fine grind to the finest a card can store.
     *
     * Only ever offered, never applied on the user's behalf: an imported
     * espresso recipe raised to 40 is not a corrected recipe, it is a different
     * drink. The import keeps its original value and this is the button that
     * changes it.
     */
    function coarsenGrindToMinimum() {
        if (recipe && recipe.grindSize < CARD_GRIND_MIN) {
            recipe.grindSize = CARD_GRIND_MIN;
            setKey((prev) => prev + 1);
        }
    }
```

Add the import at the top of the file, with the other `@/library` imports:

```typescript
import {CARD_GRIND_MIN} from "@/library/grindBands";
```

- [ ] **Step 2: Export it**

Find the object the hook returns (the destructuring at `app/editRecipe.tsx:643` shows its shape). Add `coarsenGrindToMinimum` to it, immediately after `autoAdjustPourVolumes`.

- [ ] **Step 3: Verify it typechecks**

Run: `npm run typecheck`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add hooks/useRecipeEditor.ts
git commit -m "Add the grind coarsen action

$(printf 'Offered, never applied on the user behalf. An imported espresso\nrecipe raised to 40 is not a corrected recipe, it is a different\ndrink, so the import keeps its value and this is the button that\nchanges it.\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>')"
```

---

## Task 5: The out-of-range banner

**Files:**
- Modify: `app/editRecipe.tsx`

This mirrors the existing stage-mismatch banner at `app/editRecipe.tsx:413-435`. Read that first; this must look like its sibling, not like a new idea.

- [ ] **Step 1: Add the prop to `BrewDeckProps`**

In `app/editRecipe.tsx`, add to `BrewDeckProps` (the type at line 148) after `dispatch`:

```typescript
    /** Raises a too-fine imported grind to the card minimum. */
    coarsenGrindToMinimum: () => void;
```

And to the destructured parameters of `BrewDeck`:

```typescript
function BrewDeck({
    recipe, accent, balanceTarget, showHint,
    dispatch, onDraft, onInputErrorChange, coarsenGrindToMinimum
}: BrewDeckProps) {
```

- [ ] **Step 2: Compute whether the banner applies**

In `BrewDeck`, directly after the existing `const showGrind = ...` line:

```typescript
    // An imported recipe can carry a grind finer than a card can store: the
    // cloud keeps grind on the grinder's own 1-80 scale and the importer copies
    // it through unchanged. The write is already refused; this is the offer to
    // fix it that the stage mismatch has always had.
    const tooFine = showGrind && recipe.grindSize < CARD_GRIND_MIN;
    const fineBand = tooFine ? grindBand(recipe.grindSize) : undefined;
```

Extend the import added in Task 3:

```typescript
import {CARD_GRIND_MIN, grindBand} from "@/library/grindBands";
```

- [ ] **Step 3: Render the banner**

In `BrewDeck`'s returned tree, immediately **before** the grind size `FieldRow`:

```typescript
            {tooFine && (
                <XStack testID="grind-too-fine" alignItems="center" gap="$2.5"
                        marginHorizontal="$4" marginTop="$3" padding="$3" borderRadius="$4"
                        backgroundColor={palette.raised}
                        borderLeftWidth={2} borderLeftColor={palette.danger}>
                    <YStack flex={1} gap={2}>
                        <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6}
                                       color={palette.danger}>
                            {`GRIND ${recipe.grindSize}`}
                        </DotMatrixText>
                        <Text fontSize={12} lineHeight={16} color={palette.dim}>
                            {fineBand === undefined
                                ? `A card cannot store a grind below ${CARD_GRIND_MIN}.`
                                : `Ground for ${fineBand.longLabel}. A card cannot store a grind below ${CARD_GRIND_MIN}.`}
                        </Text>
                    </YStack>
                    <Pressable accessibilityRole="button"
                               accessibilityLabel={`Set grind size to ${CARD_GRIND_MIN}`}
                               onPress={coarsenGrindToMinimum}>
                        <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6}
                                       color={accent}>
                            {`SET TO ${CARD_GRIND_MIN}`}
                        </DotMatrixText>
                    </Pressable>
                </XStack>
            )}
```

`XStack`, `YStack`, `Text`, `Pressable`, `DotMatrixText` and `palette` are all already imported in this file. `marginHorizontal="$4"` is needed here but not on the stages banner, because `BrewDeck`'s card has no horizontal padding of its own — the `FieldRow`s supply theirs individually.

- [ ] **Step 4: Pass the prop at the call site**

At `app/editRecipe.tsx:801-804`:

```typescript
                    <BrewDeck recipe={recipe} accent={accent} balanceTarget={balance.target}
                              showHint={showHint} dispatch={dispatch}
                              coarsenGrindToMinimum={coarsenGrindToMinimum}
                              onDraft={(label, value) => drafts.current.set(label, value)}
                              onInputErrorChange={setInputError}/>
```

And add `coarsenGrindToMinimum` to the destructuring of the editor hook at line 643, after `autoAdjustPourVolumes`.

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npx jest app/__tests__/editRecipe.test.tsx`

Expected: typecheck clean, editor tests PASS.

- [ ] **Step 6: Commit**

```bash
git add app/editRecipe.tsx
git commit -m "Offer to fix a grind a card cannot store

$(printf 'An imported recipe can carry a grind finer than 40, because the cloud\nkeeps grind on the grinder scale and the importer copies it through.\nThe write was already refused; what was missing was the offer to fix\nit, which the stage mismatch has had all along.\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>')"
```

---

## Task 6: The import notice

**Files:**
- Modify: `components/ImportResult.tsx`
- Test: `components/__tests__/ImportResult.test.tsx` (exists — it already has a `preview()` fixture that takes overrides)

- [ ] **Step 1: Write the failing test**

Append to `components/__tests__/ImportResult.test.tsx`. Its `preview()` helper builds a complete `ImportPreview` and merges overrides, so a grind is set by mutating the recipe it returns. No new imports are needed:

```typescript
describe("ImportResult grind notice", () => {
    it("says nothing when the grind fits on a card", async () => {
        const found = preview();
        found.recipe.grindSize = 50;

        await renderWithProviders(<ImportResult preview={found} onOpen={() => {}}/>);

        expect(screen.queryByTestId("import-grind-notice")).toBeNull();
    });

    it("names the band and frames it as a card limit, not a bad recipe", async () => {
        // The cloud keeps grind on the grinder's 1-80 scale, so this is a
        // value a real import can carry.
        const found = preview();
        found.recipe.grindSize = 25;

        await renderWithProviders(<ImportResult preview={found} onOpen={() => {}}/>);

        expect(screen.getByTestId("import-grind-notice")).toBeTruthy();
        expect(screen.getByText(/Aeropress/)).toBeTruthy();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest components/__tests__/ImportResult.test.tsx`

Expected: FAIL — no element with testID `import-grind-notice`.

- [ ] **Step 3: Write the implementation**

In `components/ImportResult.tsx`, add the import:

```typescript
import {CARD_GRIND_MIN, grindBand} from "@/library/grindBands";
```

After the `customName` declaration:

```typescript
    // The cloud stores grind on the grinder's own 1-80 scale, so an imported
    // recipe can legitimately hold a value finer than a card can carry. It is
    // imported unchanged -- an espresso grind raised to 40 would be a different
    // drink, not a corrected recipe -- so the panel says so instead, here,
    // rather than letting the user find out at the card reader.
    const fineBand = recipe.grindSize < CARD_GRIND_MIN
        ? grindBand(recipe.grindSize)
        : undefined;
```

Immediately after the `isExisting` block:

```typescript
            {fineBand !== undefined && (
                <Text testID="import-grind-notice" color={palette.info} fontSize={13}>
                    {`Ground for ${fineBand.longLabel}. You will need to coarsen it to write a card.`}
                </Text>
            )}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest components/__tests__/ImportResult.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ImportResult.tsx components/__tests__/ImportResult.test.tsx
git commit -m "Say at import time when a grind will not fit a card

$(printf 'Better than finding out at the card reader. The recipe is imported\nunchanged and the notice frames it as a card limit rather than a\ndefect in the recipe, because that is what it is.\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>')"
```

---

## Task 7: The help sheet entry

**Files:**
- Modify: `constants/recipeHelp.ts`
- Test: `constants/__tests__/recipeHelp.test.ts` (existing — run it, do not necessarily change it)

- [ ] **Step 1: Replace the `grindSize` entry**

In `constants/recipeHelp.ts`, replace the current entry (lines 55-58):

```typescript
    grindSize: {
        title: "Grind size",
        hint:  "40 to 80. Lower is finer.",
        question: "What do the grind numbers mean?",
        detail: "40 to 55 is the pourover range, and 56 to 80 suits a French " +
                "press or cold brew. Lower is finer. The xBloom app shows a " +
                "1 to 80 scale, which is the grinder's own range and includes " +
                "espresso and Aeropress grinds; a recipe card stores the grind " +
                "as an offset from 40, so it cannot carry anything finer than " +
                "that. Those finer bands are the ones you would grind for and " +
                "then brew somewhere else. An imported recipe can hold one, and " +
                "the editor will offer to coarsen it."
    },
```

- [ ] **Step 2: Run the help tests**

Run: `npx jest constants/__tests__/recipeHelp.test.ts components/__tests__/HelpSheet.test.tsx`

Expected: PASS. `DETAILED_TOPICS` is derived from whichever entries have a `detail`, so grind size joins the sheet automatically. If a test asserts an exact count or order of topics, update it — the new entry is intended.

- [ ] **Step 3: Commit**

```bash
git add constants/recipeHelp.ts
git commit -m "Explain the grind scale in the help sheet

$(printf 'The 1-80 scale in the xBloom app is the grinder range; a card stores\ngrind as an offset from 40 and cannot go finer. Without saying so,\nthe 40 floor looks like caution on our part rather than the hard\nlimit it is.\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>')"
```

---

## Task 8: The validation message explains itself

**Files:**
- Modify: `library/cardLimits.ts`
- Test: `library/__tests__/cardLimits.test.ts` (existing)

- [ ] **Step 1: Find the existing assertion**

Run: `grep -n "grind size is" library/__tests__/cardLimits.test.ts`

Any test asserting the exact old string must be updated in step 3.

- [ ] **Step 2: Change the message**

In `library/cardLimits.ts`, replace line 86:

```typescript
        // Below the minimum is worth distinguishing: it is what an imported
        // recipe carries when it was ground for espresso, and "the range is
        // 40-80" alone does not explain how it got that way.
        const grindSizeMsg = recipe.grindSize < GRIND_SIZE.min
            ? `The grind size is ${recipe.grindSize}. A card cannot store a grind below ${GRIND_SIZE.min}.`
            : `The grind size is ${recipe.grindSize}. The range is ${GRIND_SIZE.min}-${GRIND_SIZE.max}.`;
```

- [ ] **Step 3: Run the card limit tests**

Run: `npx jest library/__tests__/cardLimits.test.ts`

Expected: PASS. If a test asserted the old below-minimum text, update it to the new sentence.

- [ ] **Step 4: Commit**

```bash
git add library/cardLimits.ts library/__tests__/cardLimits.test.ts
git commit -m "Explain a grind below the card minimum

$(printf 'Stating the range does not tell someone how an imported recipe came\nto be outside it. This message surfaces in places the editor banner\ndoes not reach, so it has to stand on its own.\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>')"
```

---

## Task 9: Full gate and close out

- [ ] **Step 1: Run the whole gate**

Run: `npm run typecheck && npm run lint && npm test && npx expo-doctor`

Expected: all four green. This is what CI runs on the PR — `.github/workflows/ci.yml` treats Expo Doctor as a hard failure, so leaving it out here would let the plan pass locally and fail on the PR.

- [ ] **Step 2: Fix anything that fell out**

Most likely failures, and what they mean:
- An editor test asserting the literal `Grind size` — now `Grind size · Pourover`. Update the assertion.
- A help sheet test asserting a topic count — grind size now has a `detail` and joins `DETAILED_TOPICS`. Update the count.
- A lint error for an unused import if a task was applied partially.

- [ ] **Step 3: Verify on a device or simulator**

Run: `npm run ios`

Check by hand:
1. Open a recipe, BREW deck. The grind row reads `GRIND SIZE · POUROVER`. Step to 56 and it becomes `GRIND SIZE · FRENCH PRESS`.
2. Turn the grinder off. The grind row hides; **no banner appears** and nothing anywhere reads `81` as a coarseness.
3. Import a recipe with a sub-40 grind if one is to hand. The preview shows the notice; the editor shows the banner; `SET TO 40` clears it and the write button ungates.

NFC hardware is not needed for any of this.

- [ ] **Step 4: Open the PR**

```bash
git push -u origin feature/grind-guidance
gh pr create --title "Grind-size guidance" --body "Closes #52. Implements docs/superpowers/specs/2026-08-31-grind-guidance-design.md"
```

- [ ] **Step 5: Verify CI**

Run: `sleep 150 && gh pr checks`

Expected: `Typecheck, lint and test` passes.

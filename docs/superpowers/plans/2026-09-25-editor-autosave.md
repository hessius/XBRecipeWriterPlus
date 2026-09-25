# Recipe editor autosave and leave guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the recipe editor losing a note, a tag or a name when the user backs out, and stop it losing a dose or a stage edit without saying so.

**Architecture:** Two halves that must not be confused with each other. **Metadata** (name, note, tags) writes the moment it is committed, onto the *stored row* rather than the draft, using the `toggleFavourite` pattern already in `useRecipeEditor`. **Card fields** (everything the machine reads) keep travelling with SAVE, but leaving the screen with them changed now asks. Dirtiness is decided by comparing the draft against a projection snapshotted when the screen opened, not by a flag each mutation has to remember to set.

**Tech Stack:** TypeScript, React Native, expo-router (`useNavigation().addListener("beforeRemove")`), Tamagui, Jest + `@testing-library/react-native`.

---

## Background an engineer needs before touching this

Read `hooks/useRecipeEditor.ts:438-452` first. `toggleFavourite` is the pattern this plan copies, and its comment explains the hazard in full:

> The star goes onto the row as it stands in the library, not onto the draft. `persistRecipe` would write the whole bench: a user who changed the dose, starred the recipe and then backed out would find the dose changed too, having saved nothing.

`persistRecipe` (`useRecipeEditor.ts:414`) writes the **whole** recipe. Autosaving a tag through it would also commit an unsaved dose. That is the bug this plan exists to avoid, not a detail.

`RecipeDatabase.updateRecipe` (`library/RecipeDatabase.ts:381-407`) **inserts when there is no row**. So autosave on a recipe that is not in the library yet would silently add it to the library. The editor opens three kinds of recipe that have no row: one just read from a card, one imported from a link, and a brand new one. `onSharePress` (`app/editRecipe.tsx:917-945`) already goes out of its way to avoid exactly this. **Autosave must do nothing when there is no stored row.** On those recipes the metadata travels with SAVE like everything else, and the leave guard catches it.

The editor mutates `Recipe` in place and republishes with a key bump. Do not clone into state. See the repo instructions.

Never import from `@react-navigation/*`. `useNavigation` comes from `expo-router` and the object it returns carries `addListener("beforeRemove", ...)`. This has been spiked and typechecks.

## Decisions already taken

| Question | Answer |
| --- | --- |
| What autosaves | Name, note, tags |
| What does not | Everything the card carries, including the recipe ID (XID). It changes what is written and what Refresh fetches, so it is not metadata |
| Leaving with card edits | Save / Discard / Cancel |
| Pressing BREW with card edits | Save and brew / Brew without saving / Cancel |
| A recipe with no stored row | No autosave. The leave guard still asks |
| Rating and favourite | Already written on the spot. Not touched by this plan |

## File Structure

| File | Responsibility |
| --- | --- |
| `library/recipeDirty.ts` *(new)* | Pure. Projects a `Recipe` down to the fields SAVE owns, and compares two projections. No React, no store. |
| `library/__tests__/recipeDirty.test.ts` *(new)* | Its characterisation tests, including the one that proves a newly added field counts as a change. |
| `hooks/useRecipeEditor.ts` *(modify)* | Gains `saveMetadata()`, a pristine snapshot, `markSaved()` and `hasPendingEdits()`. |
| `hooks/__tests__/useRecipeEditor.autosave.test.ts` *(new)* | The hook's half: that metadata lands on the stored row, that it does not carry the draft with it, that an unsaved recipe is left alone. |
| `components/LeaveEditorSheet.tsx` *(new)* | The three-way prompt, in both its wordings. Presentational. |
| `components/__tests__/LeaveEditorSheet.test.tsx` *(new)* | Its tests. |
| `app/editRecipe.tsx` *(modify)* | Wires autosave onto the name, note and tag commits; wires the guard onto every exit. |
| `app/__tests__/editRecipe.autosave.test.tsx` *(new)* | The screen's half, end to end through the real store. |
| `docs/copy.md` *(modify)* | The new strings. |

---

### Task 1: The dirtiness projection

**Files:**
- Create: `library/recipeDirty.ts`
- Test: `library/__tests__/recipeDirty.test.ts`

The projection is a **denylist**, not an allowlist, and that is the whole point. A `Recipe` has more than thirty public fields and gains them regularly. An allowlist of card fields would quietly stop noticing a newly added one, and the failure mode is a user's work vanishing with no prompt. A denylist fails the other way: a new field counts as a change, which at worst produces a prompt nobody needed.

- [ ] **Step 1: Write the failing test**

Create `library/__tests__/recipeDirty.test.ts`:

```ts
import Recipe from "@/library/Recipe";
import {editsPendingSave, snapshotForSave} from "@/library/recipeDirty";

function recipe(): Recipe {
    const r = new Recipe();
    r.uuid = "u1";
    r.dosage = 18;
    r.ratio = 16;
    r.addOpeningPour();
    return r;
}

describe("recipeDirty", () => {
    it("sees no pending edit in an untouched recipe", () => {
        const r = recipe();
        expect(editsPendingSave(r, snapshotForSave(r))).toBe(false);
    });

    it("sees a changed dose", () => {
        const r = recipe();
        const opened = snapshotForSave(r);
        r.dosage = 19;
        expect(editsPendingSave(r, opened)).toBe(true);
    });

    it("sees a changed stage volume", () => {
        const r = recipe();
        const opened = snapshotForSave(r);
        r.pours[0].volume = 120;
        expect(editsPendingSave(r, opened)).toBe(true);
    });

    it("forgets an edit that was typed back to where it started", () => {
        // A prompt for work that no longer differs from the stored row is a
        // prompt the user cannot act on meaningfully, and it teaches them to
        // dismiss the one that matters.
        const r = recipe();
        const opened = snapshotForSave(r);
        r.dosage = 19;
        r.dosage = 18;
        expect(editsPendingSave(r, opened)).toBe(false);
    });

    it("ignores the fields that write themselves", () => {
        // Name, note and tags autosave; favourite and the rating already did.
        // A prompt for them would offer to discard something already stored.
        const r = recipe();
        const opened = snapshotForSave(r);
        r.name = "Sunday";
        r.description = "Sweet";
        r.setTags(["morning"]);
        r.favourite = true;
        r.accentIndex = 3;
        expect(editsPendingSave(r, opened)).toBe(false);
    });

    it("counts a field nobody thought about", () => {
        // The projection is a denylist on purpose. This test is the reason:
        // it fails if someone turns it into an allowlist of known card fields,
        // because an unlisted field would then go unnoticed and a user's work
        // would be discarded with no prompt.
        const r = recipe();
        const opened = snapshotForSave(r);
        (r as unknown as Record<string, unknown>).somethingAddedLater = 7;
        expect(editsPendingSave(r, opened)).toBe(true);
    });

    it("does not depend on the order the keys were assigned in", () => {
        // The snapshot is compared as text, so an unstable key order would
        // report a change on every open.
        const r = recipe();
        const opened = snapshotForSave(r);
        const rebuilt = new Recipe(JSON.parse(JSON.stringify(r)));
        expect(editsPendingSave(rebuilt, opened)).toBe(false);
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest library/__tests__/recipeDirty.test.ts`
Expected: FAIL, `Cannot find module '@/library/recipeDirty'`.

- [ ] **Step 3: Write the implementation**

Create `library/recipeDirty.ts`:

```ts
/**
 * Which edits are still waiting on SAVE.
 *
 * The editor writes two different kinds of change. Name, note and tags go onto
 * the stored row the moment they are committed, because losing a note by
 * backing out of a screen is not a trade anyone would make. Everything the card
 * carries still travels with SAVE, because a half-typed dose written to the
 * library is worse than one lost.
 *
 * So the screen needs to know whether the second kind has changed, and it has
 * to know without asking each mutation to remember to say so. There are more
 * than a dozen ways to change a card field -- a stepper, a segmented row, a
 * stage added or deleted, the volume auto-fix, a revert, a card read -- and the
 * cost of forgetting one is a user's work disappearing with no prompt. So this
 * compares the recipe against a snapshot taken when the screen opened instead.
 *
 * The projection is a denylist. Everything counts as a card field unless it is
 * named here as one that writes itself. That direction is deliberate: a field
 * added later and not thought about produces a prompt nobody needed, which is a
 * nuisance. The other direction loses work.
 */

import type Recipe from "@/library/Recipe";

/**
 * The fields that do not wait for SAVE.
 *
 * `name`, `description` and `tags` are written as they are committed.
 * `favourite` has always written on the spot (see `toggleFavourite`), and the
 * rating is not on the recipe at all -- it lives in the brew store.
 * `accentIndex` belongs to the library, not to the user: `updateRecipe`
 * reassigns it on write, so a draft and its row disagree about it routinely.
 */
const WRITES_ITSELF = ["name", "description", "tags", "favourite", "accentIndex"];

/** A `JSON.stringify` whose object keys are always in the same order. */
function stable(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (value !== null && typeof value === "object") {
        const entries = Object.entries(value as Record<string, unknown>)
            .filter(([, held]) => held !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([key, held]) => `${JSON.stringify(key)}:${stable(held)}`);
        return `{${entries.join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
}

/**
 * What the recipe's SAVE-owned fields looked like at a moment in time.
 *
 * Text rather than a clone, so that holding one cannot accidentally hold a
 * reference into the live recipe -- which is mutated in place, and would
 * therefore compare equal to itself forever.
 */
export function snapshotForSave(recipe: Recipe): string {
    const plain = JSON.parse(JSON.stringify(recipe)) as Record<string, unknown>;
    for (const field of WRITES_ITSELF) delete plain[field];
    return stable(plain);
}

/** Whether the recipe has changed since the snapshot, in a way SAVE owns. */
export function editsPendingSave(recipe: Recipe, opened: string): boolean {
    return snapshotForSave(recipe) !== opened;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx jest library/__tests__/recipeDirty.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Prove the tests can fail**

Make each of these production edits in turn, run the suite, confirm a failure, then put it back:

1. Change `WRITES_ITSELF` to `[]`. Expected: "ignores the fields that write themselves" fails.
2. Change `stable` to `JSON.stringify`. Expected: no failure is acceptable here *only* if you have confirmed by hand that key order genuinely differs in the rebuilt recipe; if it does not, replace the last test with one that builds an object literal with reversed key order and compares.
3. Make `snapshotForSave` return `""`. Expected: every "sees a change" test fails.

- [ ] **Step 6: Commit**

```bash
git add library/recipeDirty.ts library/__tests__/recipeDirty.test.ts
git commit -m "feat: work out which editor edits are still waiting on SAVE"
```

---

### Task 2: Metadata writes onto the stored row

**Files:**
- Modify: `hooks/useRecipeEditor.ts`
- Test: `hooks/__tests__/useRecipeEditor.autosave.test.ts`

- [ ] **Step 1: Write the failing test**

Create `hooks/__tests__/useRecipeEditor.autosave.test.ts`. Use the real store through `createTestDatabase` if the existing `useRecipeEditor` tests do; otherwise follow whatever those tests already do for the store, and say in a comment which file you copied.

```ts
import {act, renderHook} from "@testing-library/react-native";

import {RECIPE_LABELS, useRecipeEditor} from "@/hooks/useRecipeEditor";
import Recipe from "@/library/Recipe";
import RecipeDatabase from "@/library/RecipeDatabase";

function open(recipe: Recipe) {
    return renderHook(() => useRecipeEditor({
        recipeJSON:      JSON.stringify(recipe),
        temperatureUnit: "C",
        onSaved:         jest.fn()
    }));
}

function stored(): Recipe {
    const row = new RecipeDatabase().getRecipe("u1");
    if (!row) throw new Error("the recipe was not in the library");
    return row;
}

function saved(): Recipe {
    const r = new Recipe();
    r.uuid = "u1";
    r.dosage = 18;
    r.ratio = 16;
    r.addOpeningPour();
    new RecipeDatabase().insertRecipe(r);
    return r;
}

describe("useRecipeEditor autosave", () => {
    it("writes a committed note without waiting for SAVE", async () => {
        saved();
        const {result} = await open(stored());

        await act(async () => {
            await result.current.editInputComplete(RECIPE_LABELS.NOTE, "Sweet");
            result.current.saveMetadata();
        });

        expect(stored().description).toBe("Sweet");
    });

    it("writes tags without waiting for SAVE", async () => {
        saved();
        const {result} = await open(stored());

        await act(async () => { result.current.editTags(["morning"]); });

        expect(stored().tags).toEqual(["morning"]);
    });

    it("does not carry an unsaved dose along with the note", async () => {
        // The whole reason this does not go through `persistRecipe`. A user who
        // changes the dose, types a note and then backs out must find the note
        // kept and the dose as it was.
        saved();
        const {result} = await open(stored());

        await act(async () => {
            await result.current.editInputComplete(RECIPE_LABELS.DOSE, "22");
            await result.current.editInputComplete(RECIPE_LABELS.NOTE, "Sweet");
            result.current.saveMetadata();
        });

        expect(stored().description).toBe("Sweet");
        expect(stored().dosage).toBe(18);
    });

    it("adds nothing to the library for a recipe that is not in it", async () => {
        // `updateRecipe` inserts when there is no row, so an unguarded autosave
        // would put a card read or a half-finished import into the library
        // behind the user's back. On those, metadata travels with SAVE.
        const fresh = new Recipe();
        fresh.uuid = "never-saved";
        fresh.addOpeningPour();
        const {result} = await open(fresh);

        await act(async () => {
            await result.current.editInputComplete(RECIPE_LABELS.NOTE, "Sweet");
            result.current.saveMetadata();
        });

        expect(new RecipeDatabase().getRecipe("never-saved")).toBeNull();
    });

    it("reports a pending card edit, and stops reporting it after a save", async () => {
        saved();
        const {result} = await open(stored());

        expect(result.current.hasPendingEdits()).toBe(false);

        await act(async () => {
            await result.current.editInputComplete(RECIPE_LABELS.DOSE, "22");
        });
        expect(result.current.hasPendingEdits()).toBe(true);

        await act(async () => { result.current.persistRecipe(); });
        expect(result.current.hasPendingEdits()).toBe(false);
    });

    it("does not report a note as a pending edit", async () => {
        saved();
        const {result} = await open(stored());

        await act(async () => {
            await result.current.editInputComplete(RECIPE_LABELS.NOTE, "Sweet");
            result.current.saveMetadata();
        });

        expect(result.current.hasPendingEdits()).toBe(false);
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest hooks/__tests__/useRecipeEditor.autosave.test.ts`
Expected: FAIL, `result.current.saveMetadata is not a function`.

- [ ] **Step 3: Add the hook's three new pieces**

In `hooks/useRecipeEditor.ts`, add the import:

```ts
import {editsPendingSave, snapshotForSave} from "@/library/recipeDirty";
```

Add a ref alongside the hook's other refs:

```ts
/**
 * What the recipe's SAVE-owned fields looked like when this screen opened, or
 * when it last wrote. Text, so it cannot alias the recipe it came from, which
 * is mutated in place and would otherwise always compare equal to itself.
 */
const openedAs = useRef<string | null>(null);
```

Seed it wherever the hook first has a recipe. If that is inside the same place `setRecipe` is called, set it there; the rule is that `openedAs.current` is non-null whenever `recipe` is non-null, and is re-taken on every write. To keep that true without an effect (`react-hooks/set-state-in-effect` is an error here), seed it lazily in `hasPendingEdits`:

```ts
/**
 * Whether anything SAVE owns has changed since the screen opened.
 *
 * Seeded lazily rather than in an effect: the compiler's purity rules make
 * seeding state from an effect an error, and the first caller is always after
 * the recipe has arrived.
 */
function hasPendingEdits(): boolean {
    if (!recipe) return false;
    if (openedAs.current === null) {
        openedAs.current = snapshotForSave(recipe);
        return false;
    }
    return editsPendingSave(recipe, openedAs.current);
}
```

Take a fresh snapshot at the end of `persistRecipe`:

```ts
function persistRecipe() {
    if (!recipe) return;
    // Saves whether or not the volumes add up. Refusing to save a
    // half-finished recipe loses work to enforce a rule that only matters
    // at the moment of writing a card.
    new RecipeDatabase().updateRecipe(recipe.uuid, recipe);
    // The bench is now the row, so nothing is pending. Without this, pressing
    // BREW and coming back would still be offering to save what was saved.
    openedAs.current = snapshotForSave(recipe);
}
```

And the metadata write itself, next to `toggleFavourite` so the two can be read together:

```ts
/**
 * Write the recipe's name, note and tags, and nothing else.
 *
 * The same shape as `toggleFavourite`, for the same reason: these land on the
 * row as it stands in the library, not on the draft. `persistRecipe` would
 * write the whole bench, so a user who changed the dose and then typed a note
 * would find the dose changed too, having saved nothing.
 *
 * Silent when the recipe has no row. `updateRecipe` inserts in that case, so an
 * unguarded write here would add a card read or a half-finished import to the
 * library behind the user's back -- the thing `onSharePress` takes pains to
 * avoid. On those recipes the metadata travels with SAVE, and the leave guard
 * is what keeps it from being lost.
 */
function saveMetadata() {
    if (!recipe) return;
    const store = new RecipeDatabase();
    const saved = store.getRecipe(recipe.uuid);
    if (!saved) return;
    saved.name = recipe.name;
    saved.description = recipe.description;
    saved.setTags(recipe.tags);
    store.updateRecipe(saved.uuid, saved);
}
```

Call it from `editTags`, after `setTags`:

```ts
const editTags = (tags: string[]) => {
    if (!recipe) return;
    recipe.setTags(tags);
    // Tags are metadata, so they do not wait for SAVE. There is no commit
    // moment for a chip the way there is for a text field: the chip is added
    // and the user moves on.
    saveMetadata();
    setKey((prev) => prev + 1);
};
```

Return `saveMetadata` and `hasPendingEdits` from the hook, alongside `persistRecipe`.

- [ ] **Step 4: Run the tests**

Run: `npx jest hooks/__tests__/useRecipeEditor.autosave.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Prove they can fail**

1. Replace the body of `saveMetadata` with `persistRecipe();`. Expected: "does not carry an unsaved dose along with the note" fails, and "adds nothing to the library" fails.
2. Delete the `if (!saved) return;` guard. Expected: "adds nothing to the library" fails.
3. Delete the new last line of `persistRecipe`. Expected: "reports a pending card edit, and stops reporting it after a save" fails.

Record what you saw. If any of them passes, the test is not testing what it says.

- [ ] **Step 6: Commit**

```bash
git add hooks/useRecipeEditor.ts hooks/__tests__/useRecipeEditor.autosave.test.ts
git commit -m "feat: write the editor's name, note and tags without waiting for SAVE"
```

---

### Task 3: The leave prompt

**Files:**
- Create: `components/LeaveEditorSheet.tsx`
- Test: `components/__tests__/LeaveEditorSheet.test.tsx`

One sheet, two wordings. Leaving and brewing are the same question about the same unsaved work, and two components would drift.

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/LeaveEditorSheet.test.tsx`:

```ts
import React from "react";
import {fireEvent, screen, waitFor} from "@testing-library/react-native";

import LeaveEditorSheet from "@/components/LeaveEditorSheet";
import {renderWithProviders} from "@/test-utils/render";

function props(over: Partial<React.ComponentProps<typeof LeaveEditorSheet>> = {}) {
    return {
        open:       true,
        intent:     "leave" as const,
        onSave:     jest.fn(),
        onDiscard:  jest.fn(),
        onCancel:   jest.fn(),
        ...over
    };
}

// During the sheet's entrance the node is findable but the press is discarded,
// so every press here retries. See app/__tests__/brewHistory.test.tsx.
async function pressOnSheet(label: string) {
    await waitFor(async () => {
        await fireEvent.press(screen.getByLabelText(label));
    });
}

describe("LeaveEditorSheet", () => {
    it("offers to save, discard or stay when leaving", async () => {
        await renderWithProviders(<LeaveEditorSheet {...props()}/>);

        expect(screen.getByLabelText("Save changes")).toBeTruthy();
        expect(screen.getByLabelText("Discard changes")).toBeTruthy();
        expect(screen.getByLabelText("Keep editing")).toBeTruthy();
    });

    it("says what will happen when brewing instead", async () => {
        // The brew will run something either way, so "discard" would be a lie:
        // the choice is which recipe the machine gets, not whether it brews.
        await renderWithProviders(<LeaveEditorSheet {...props({intent: "brew"})}/>);

        expect(screen.getByLabelText("Save and brew")).toBeTruthy();
        expect(screen.getByLabelText("Brew without saving")).toBeTruthy();
        expect(screen.getByLabelText("Keep editing")).toBeTruthy();
    });

    it("reports each of the three answers", async () => {
        const handlers = props();
        await renderWithProviders(<LeaveEditorSheet {...handlers}/>);

        await pressOnSheet("Save changes");
        expect(handlers.onSave).toHaveBeenCalled();

        await pressOnSheet("Discard changes");
        expect(handlers.onDiscard).toHaveBeenCalled();

        await pressOnSheet("Keep editing");
        expect(handlers.onCancel).toHaveBeenCalled();
    });

    it("treats a dismissed sheet as keeping editing", async () => {
        // Swiping the sheet away must not be a way to discard work by accident.
        const handlers = props();
        await renderWithProviders(<LeaveEditorSheet {...handlers}/>);

        await pressOnSheet("Keep editing");

        expect(handlers.onDiscard).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest components/__tests__/LeaveEditorSheet.test.tsx`
Expected: FAIL, `Cannot find module '@/components/LeaveEditorSheet'`.

- [ ] **Step 3: Write the component**

Create `components/LeaveEditorSheet.tsx`:

```tsx
import React from "react";
import {Button, Text, YStack} from "tamagui";

import XbrwSheet from "@/components/XbrwSheet";
import {onAccent, palette} from "@/constants/colors";

/**
 * What the user was trying to do when the unsaved work was noticed.
 *
 * `brew` is worded differently because the brew runs either way: the question
 * is which recipe the machine is handed, not whether anything happens. Offering
 * "discard" there would suggest the brew could be called off.
 */
export type LeaveIntent = "leave" | "brew";

type Props = {
    open: boolean;
    intent: LeaveIntent;
    onSave: () => void;
    onDiscard: () => void;
    onCancel: () => void;
};

const WORDS = {
    leave: {
        body:    "The dose and the stages have changed since this recipe was last saved. The name, note and tags are already saved.",
        save:    "Save changes",
        discard: "Discard changes"
    },
    brew: {
        body:    "The dose and the stages have changed since this recipe was last saved. The brew will run whichever you pick.",
        save:    "Save and brew",
        discard: "Brew without saving"
    }
} as const;

export default function LeaveEditorSheet({open, intent, onSave, onDiscard, onCancel}: Props) {
    const words = WORDS[intent];

    return (
        // Dismissing is cancelling, never discarding. A swipe must not be a way
        // to throw work away without having said so.
        <XbrwSheet open={open} onOpenChange={(next) => {if (!next) onCancel();}}
                   title="UNSAVED CHANGES" heightPercent={46}>
            <YStack gap="$3" paddingHorizontal="$4" paddingBottom="$4">
                <Text fontSize={15} lineHeight={21} color={palette.text}>
                    {words.body}
                </Text>

                {/* `palette.text` as the primary fill, matching RenameSheet's
                    SAVE NAME. Not the recipe's accent: the accent marks the act
                    that runs the recipe, and this is a question about storage. */}
                <Button accessibilityRole="button" accessibilityLabel={words.save}
                        backgroundColor={palette.text} color={onAccent.text}
                        onPress={onSave}>
                    {words.save}
                </Button>

                <Button accessibilityRole="button" accessibilityLabel={words.discard}
                        chromeless color={palette.danger} onPress={onDiscard}>
                    {words.discard}
                </Button>

                <Button accessibilityRole="button" accessibilityLabel="Keep editing"
                        chromeless onPress={onCancel}>
                    Keep editing
                </Button>
            </YStack>
        </XbrwSheet>
    );
}
```

`palette.text` on `onAccent.text` is what `RenameSheet.tsx:96-108` uses for its primary action, and this follows it. Do not introduce a colour literal, and do not reach for the recipe's accent: on this screen the accent marks BREW, the act that runs the recipe, and this sheet is a question about storage.

- [ ] **Step 4: Run the tests**

Run: `npx jest components/__tests__/LeaveEditorSheet.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Prove they can fail**

Change `onOpenChange` to call `onDiscard`. Expected: "treats a dismissed sheet as keeping editing" still passes, because it presses rather than dismisses. That is a test that cannot fail. Fix it: either drive a real dismissal, or delete it and rely on the code comment. Do not leave it as written.

- [ ] **Step 6: Commit**

```bash
git add components/LeaveEditorSheet.tsx components/__tests__/LeaveEditorSheet.test.tsx
git commit -m "feat: ask before leaving the editor with unsaved card edits"
```

---

### Task 4: Autosave the name and the note where they are committed

**Files:**
- Modify: `app/editRecipe.tsx`
- Test: `app/__tests__/editRecipe.autosave.test.tsx`

The note commits on `onEndEditing` through `dispatch`. The name commits through the rename sheet, which also goes through `dispatch`. Both arrive at `dispatch(label, value)` in `app/editRecipe.tsx:844`, and `flushDrafts` is the other way a pending one lands.

- [ ] **Step 1: Write the failing test**

Create `app/__tests__/editRecipe.autosave.test.tsx`. Copy the mock preamble from `app/__tests__/editRecipe.test.tsx` verbatim; that file's own header says to.

```tsx
import {fireEvent, screen} from "@testing-library/react-native";

// ... the same mocks as app/__tests__/editRecipe.test.tsx ...

describe("editRecipe autosave", () => {
    it("keeps a typed note after backing out", async () => {
        await openSavedRecipe();

        await fireEvent.changeText(screen.getByTestId("note-field"), "Sweet");
        await fireEvent(screen.getByTestId("note-field"), "endEditing",
                        {nativeEvent: {text: "Sweet"}});
        await fireEvent.press(screen.getByLabelText("Back"));

        expect(new RecipeDatabase().getRecipe("u1")?.description).toBe("Sweet");
    });

    it("leaves the dose alone when it saves the note", async () => {
        await openSavedRecipe();

        await fireEvent.changeText(screen.getByTestId("note-field"), "Sweet");
        await fireEvent(screen.getByTestId("note-field"), "endEditing",
                        {nativeEvent: {text: "Sweet"}});

        expect(new RecipeDatabase().getRecipe("u1")?.dosage).toBe(18);
    });
});
```

`openSavedRecipe` is a helper you write: insert a `Recipe` with `uuid: "u1"`, `dosage: 18`, one pour, then render the screen with that recipe's JSON as the route param. Match how `app/__tests__/editRecipe.test.tsx` renders the screen, including its `Back` label; read it rather than guessing the label.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest app/__tests__/editRecipe.autosave.test.tsx`
Expected: FAIL, the stored note is `""`.

- [ ] **Step 3: Autosave on commit**

In `app/editRecipe.tsx`, pull `saveMetadata` and `hasPendingEdits` out of the hook alongside `persistRecipe` (line 800), then:

```ts
/** The labels that go onto the stored row as soon as they are committed. */
const AUTOSAVED_LABELS: string[] = [RECIPE_LABELS.TITLE, RECIPE_LABELS.NOTE];
```

Declare that at module scope, not inside the component.

```ts
const dispatch: Dispatch = (label, value) => {
    drafts.current.delete(label);
    void editInputComplete(label, value).then(() => {
        // The name and the note do not wait for SAVE. Chained rather than
        // called straight after, because `editInputComplete` is async and the
        // write has to see the value it applied.
        if (AUTOSAVED_LABELS.includes(label)) saveMetadata();
    });
    bumpKey();
};
```

And in `flushDrafts`, after the loop:

```ts
for (const [label, value] of pending) {
    await editInputComplete(label, value);
    if (AUTOSAVED_LABELS.includes(label)) saveMetadata();
}
```

- [ ] **Step 4: Run the tests**

Run: `npx jest app/__tests__/editRecipe.autosave.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Prove they can fail**

Remove the `saveMetadata()` call from `dispatch`. Expected: "keeps a typed note after backing out" fails. Put it back. Then change `saveMetadata` to `persistRecipe` in `dispatch`; expected: "leaves the dose alone when it saves the note" fails.

- [ ] **Step 6: Commit**

```bash
git add app/editRecipe.tsx app/__tests__/editRecipe.autosave.test.tsx
git commit -m "feat: save the recipe name and note as they are committed"
```

---

### Task 5: Guard every way out of the editor

**Files:**
- Modify: `app/editRecipe.tsx`
- Test: `app/__tests__/editRecipe.autosave.test.tsx`

The exits are the header back button (`app/editRecipe.tsx:1008`), the Android hardware back, and the iOS swipe-back. All three end in a navigation action, so one `beforeRemove` listener covers all three and the header button needs no special case beyond flushing first.

`duplicateRecipe` and `deleteRecipe` also navigate back, and must **not** prompt: duplicating already writes the recipe in hand, and deleting it makes the question meaningless.

- [ ] **Step 1: Write the failing tests**

Add to `app/__tests__/editRecipe.autosave.test.tsx`:

```tsx
it("asks before backing out with a changed dose", async () => {
    await openSavedRecipe();

    await fireEvent.changeText(screen.getByLabelText("Dose (g)"), "22");
    await fireEvent(screen.getByLabelText("Dose (g)"), "endEditing",
                    {nativeEvent: {text: "22"}});
    await fireEvent.press(screen.getByLabelText("Back"));

    expect(screen.getByLabelText("Save changes")).toBeTruthy();
    expect(new RecipeDatabase().getRecipe("u1")?.dosage).toBe(18);
});

it("does not ask when nothing SAVE owns has changed", async () => {
    await openSavedRecipe();

    await fireEvent.changeText(screen.getByTestId("note-field"), "Sweet");
    await fireEvent(screen.getByTestId("note-field"), "endEditing",
                    {nativeEvent: {text: "Sweet"}});
    await fireEvent.press(screen.getByLabelText("Back"));

    expect(screen.queryByLabelText("Save changes")).toBeNull();
});

it("saves and leaves when asked to", async () => {
    await openSavedRecipe();

    await fireEvent.changeText(screen.getByLabelText("Dose (g)"), "22");
    await fireEvent(screen.getByLabelText("Dose (g)"), "endEditing",
                    {nativeEvent: {text: "22"}});
    await fireEvent.press(screen.getByLabelText("Back"));
    await pressOnSheet("Save changes");

    expect(new RecipeDatabase().getRecipe("u1")?.dosage).toBe(22);
});

it("leaves the stored recipe alone when asked to discard", async () => {
    await openSavedRecipe();

    await fireEvent.changeText(screen.getByLabelText("Dose (g)"), "22");
    await fireEvent(screen.getByLabelText("Dose (g)"), "endEditing",
                    {nativeEvent: {text: "22"}});
    await fireEvent.press(screen.getByLabelText("Back"));
    await pressOnSheet("Discard changes");

    expect(new RecipeDatabase().getRecipe("u1")?.dosage).toBe(18);
});

it("does not ask on the way out of a delete", async () => {
    // The recipe is gone. Offering to save it would be offering to put it back.
    await openSavedRecipe();

    await fireEvent.changeText(screen.getByLabelText("Dose (g)"), "22");
    await fireEvent(screen.getByLabelText("Dose (g)"), "endEditing",
                    {nativeEvent: {text: "22"}});
    await fireEvent.press(screen.getByLabelText("More"));
    await pressOnSheet("Delete");

    expect(screen.queryByLabelText("Save changes")).toBeNull();
});
```

Check the real accessibility labels for Dose, Back, More and Delete against `app/__tests__/editRecipe.test.tsx` before running; use what that file uses.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest app/__tests__/editRecipe.autosave.test.tsx`
Expected: FAIL on "asks before backing out with a changed dose".

- [ ] **Step 3: Wire the guard**

In `app/editRecipe.tsx`, add state and a held action:

```ts
const [leavePrompt, setLeavePrompt] = useState<LeaveIntent | null>(null);
/**
 * The navigation the guard interrupted, so it can be replayed on Save or
 * Discard. A ref rather than state: replaying it must not wait for a render,
 * and nothing draws from it.
 */
const heldExit = useRef<(() => void) | null>(null);
/**
 * Set while an exit the guard has already answered is in flight, so the
 * listener lets it through instead of asking a second time. Also set by the
 * actions that leave on purpose with the question already settled: a delete
 * has nothing left to save, and a duplicate has already written.
 */
const leaving = useRef(false);
```

The listener:

```ts
useEffect(() => {
    const stop = navigation.addListener("beforeRemove", (event) => {
        if (leaving.current || !hasPendingEdits()) return;
        // Android hardware back and the iOS swipe both arrive here, which is
        // why this is a listener rather than a check in the back button.
        event.preventDefault();
        const action = event.data.action;
        heldExit.current = () => {
            leaving.current = true;
            navigation.dispatch(action);
        };
        setLeavePrompt("leave");
    });
    return stop;
});
```

No dependency array: `hasPendingEdits` closes over the current recipe, and a stale listener would wave through work it could not see. `react-hooks/exhaustive-deps` is a warning here, not an error.

The header back stays as it is, flushing first, because `navigation.goBack()` raises `beforeRemove` and the listener does the rest.

`deleteRecipe` and `duplicateRecipe` each set `leaving.current = true;` immediately before `navigation.goBack()`.

BREW:

```ts
async function onBrewPress() {
    const currentRecipe = recipe;
    if (!currentRecipe) return;
    await flushDrafts();
    if (hasPendingEdits()) {
        heldExit.current = () => brewWith(currentRecipe);
        setLeavePrompt("brew");
        return;
    }
    brewWith(currentRecipe);
}

function brewWith(brewing: Recipe) {
    router.push({
        pathname: "/brew",
        params:   {recipeJSON: JSON.stringify(brewing)}
    });
}
```

Note what this removes: `onBrewPress` used to call `persistRecipe()` unconditionally. It no longer does, because saving is now one of the three answers. The `brew` sheet's Save button is what restores it.

The sheet:

```tsx
<LeaveEditorSheet open={leavePrompt !== null} intent={leavePrompt ?? "leave"}
                  onSave={() => {
                      persistRecipe();
                      setLeavePrompt(null);
                      heldExit.current?.();
                  }}
                  onDiscard={() => {
                      setLeavePrompt(null);
                      heldExit.current?.();
                  }}
                  onCancel={() => {
                      setLeavePrompt(null);
                      heldExit.current = null;
                  }}/>
```

Add `leavePrompt !== null` to `screenCovered`, the TalkBack guard at `app/editRecipe.tsx:978`. Every other sheet on this screen is in that list and this one must be too.

- [ ] **Step 4: Run the tests**

Run: `npx jest app/__tests__/editRecipe.autosave.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 5: Prove they can fail**

1. Remove `event.preventDefault()`. Expected: "asks before backing out" fails.
2. Change `if (leaving.current || !hasPendingEdits())` to `if (leaving.current)`. Expected: "does not ask when nothing SAVE owns has changed" fails.
3. Remove `leaving.current = true` from `deleteRecipe`. Expected: "does not ask on the way out of a delete" fails.
4. Change `onDiscard` to also call `persistRecipe()`. Expected: "leaves the stored recipe alone when asked to discard" fails.

- [ ] **Step 6: Commit**

```bash
git add app/editRecipe.tsx app/__tests__/editRecipe.autosave.test.tsx
git commit -m "feat: ask before leaving or brewing with unsaved card edits"
```

---

### Task 6: The copy inventory and the whole gate

**Files:**
- Modify: `docs/copy.md`

- [ ] **Step 1: Add the strings**

`docs/copy.md` inventories user-facing copy. Add the sheet's title, both bodies and all five button labels, in whatever shape the surrounding entries use. Read the file's own header first.

Check the house rules while you are there: no em dashes, dashes avoided generally, British English.

- [ ] **Step 2: Run the whole gate**

```bash
npm run typecheck && npm run lint && npm test
```

Expected: typecheck clean, lint 0 errors, all tests pass. The lint baseline is 0 errors and 17 warnings; any new error is yours.

- [ ] **Step 3: Commit**

```bash
git add docs/copy.md
git commit -m "docs: inventory the unsaved changes copy"
```

---

## What this plan does not do

- **No device verification.** The `beforeRemove` listener is the only way to catch the Android hardware back and the iOS swipe-back, and neither can be exercised by a unit test. Both have to be tried on a phone before this merges. Say so in the pull request rather than implying it was checked.
- **No autosave on the recipe ID.** It is on the ABOUT deck next to the note, so it looks like metadata, but it changes what is written to a card and what Refresh fetches. It stays with SAVE.
- **No change to favourite or rating.** Both already write on the spot.

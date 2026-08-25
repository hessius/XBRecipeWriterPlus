# Import Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land sub-project 4, then build sub-project 5 — one import sheet behind three doors, accepting an xBloom share link or a pod code and handing the recipe to the editor unsaved.

**Architecture:** Phase 0 clears the outstanding review on PR #43, merges it, and rebases this branch onto the result. Phases 1–5 then build import as four units with hard boundaries: a pure parser (`library/importInput.ts`), a state machine that owns every timing rule (`hooks/useRecipeImport.ts`), and two presentational components (`ImportSheet`, `ImportResult`) plus the tile.

**Tech Stack:** Expo SDK 57, React Native 0.86, Tamagui, expo-sqlite, expo-clipboard (new), Jest + @testing-library/react-native.

**Spec:** `docs/superpowers/specs/2026-08-25-import-overhaul-design.md`

**Worktree:** `/Users/jesperhessius/Dev/xbrw-sp5-import` on branch `sp5-import`, based on `sp4-editor`.

---

## Phase 0 — Land sub-project 4

PR #43 ("The editor, rebuilt") is green and mergeable but carries **14 unresolved review threads**. Seven are marked outdated and were fixed by later commits on the branch; seven are current and need work.

**Phase 0 tasks 1–9 are done in the sub-project 4 worktree, not this one:**

```bash
cd /Users/jesperhessius/Dev/xbrw-sp4-editor
```

Only Task 12 returns to `/Users/jesperhessius/Dev/xbrw-sp5-import`.

### Task 1: Answer the seven already-fixed threads

No code. Six of these were fixed by later commits; one is a considered "won't do" and needs a reasoned reply rather than a change.

**Verify each before replying.** A reply claiming a fix that is not there is worse than no reply.

- [ ] **Step 1: Confirm the six fixes are present**

Run each check and confirm the expected output:

```bash
cd /Users/jesperhessius/Dev/xbrw-sp4-editor
grep -n "setKey((prev) => prev + 1);" hooks/useRecipeEditor.ts | head -3
grep -n "{!isTea && (" app/editRecipe.tsx | head -3
grep -n "duplicateRecipe(source: Recipe)" library/RecipeDatabase.ts
grep -n "Not keyed here: the key belongs on the row" app/editRecipe.tsx
grep -n 'inputMode={Number.isInteger(step) ? "numeric" : "decimal"}' components/Stepper.tsx
grep -n "recipe.xid.trim().length > 0" hooks/useRecipeEditor.ts
```

Expected: every one returns at least one line. If any returns nothing, that thread is **not** fixed — stop and fix it before replying.

- [ ] **Step 2: Reply to and resolve the six fixed threads**

Get the thread IDs:

```bash
gh api graphql -f query='
{ repository(owner:"hessius",name:"XBRecipeWriterPlus"){
    pullRequest(number:43){ reviewThreads(first:50){ nodes{
      id isResolved
      comments(first:1){ nodes{ path line originalLine } } } } } } }' \
  --jq '.data.repository.pullRequest.reviewThreads.nodes[]
        | select(.isResolved | not)
        | "\(.id) \(.comments.nodes[0].path):\(.comments.nodes[0].line // .comments.nodes[0].originalLine)"'
```

For each of the six paths below, reply with the matching text, then resolve. Replace `<THREAD_ID>` and `<BODY>`:

```bash
gh api graphql -f query='
mutation($t:ID!,$b:String!){
  addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$t, body:$b}){ clientMutationId }
}' -f t='<THREAD_ID>' -f b='<BODY>'

gh api graphql -f query='
mutation($t:ID!){ resolveReviewThread(input:{threadId:$t}){ thread{ isResolved } } }' \
  -f t='<THREAD_ID>'
```

Bodies, one per thread:

| Path | Reply body |
|---|---|
| `hooks/useRecipeEditor.ts:96` | `Fixed. The in-place mutation is published through the key counter now; \`setRecipe(r)\` is gone, and the comment beside it records why the setter would have been bailed out of.` |
| `app/editRecipe.tsx:212` | `Fixed. Both rows are wrapped in \`{!isTea && ...}\`, with a comment recording that TEA is deliberately not among the cup options and that the grinder toggle is inert on a tea card.` |
| `app/editRecipe.tsx:609` | `Fixed. \`RecipeDatabase.duplicateRecipe\` now takes a \`Recipe\` rather than a uuid, so the recipe in hand is cloned — including one read or imported that has no stored row, and including unsaved edits.` |
| `app/editRecipe.tsx:214` | `Fixed. The key moved to \`TextFieldRow\`, which owns the \`invalid\` state, so an external change such as a revert remounts the row and recomputes both the local mark and the screen's gate.` |
| `components/Stepper.tsx:160` | `Fixed. \`inputMode\` is \`Number.isInteger(step) ? "numeric" : "decimal"\`, so the stage flow rate (step 0.1) gets a keyboard with a decimal separator.` |
| `hooks/useRecipeEditor.ts:401` | `Fixed. \`hasSource\` trims both online identifiers, so a whitespace-only XID no longer offers an online revert it cannot fulfil.` |

- [ ] **Step 3: Reply to the stage-hints thread without resolving it**

`components/StageTile.tsx:110` is a deliberate decision, not an oversight — `components/StageTile.tsx:63` already records it. Reply, and leave the thread open for the author to resolve:

> Deliberate, and the reasoning is in the code at `components/StageTile.tsx:63`. A stage packs six controls into one tile; a hint line under each turned the tile into prose and pushed the controls off the screen, which is the same failure that made the BREW deck's hints a setting rather than the default. The stage controls do take their labels from `RECIPE_HELP`, so the topics are wired up — and the long-form answers for volume, temperature, flow rate, pause, pattern and agitation are all reachable from the HELP button. If you would still like the hints on stages, the honest way is to extend the existing `showHint` setting to cover them, which I would rather do as its own change than fold into this PR.

- [ ] **Step 4: No commit**

Nothing changed on disk. Move on.

---

### Task 2: A single authority on whether a recipe can be written

Review threads `hooks/useRecipeEditor.ts:70` and `components/RecipeCard.tsx:219`. Both say the same thing: balance alone does not make a recipe writable. With one stage, dose 31 and ratio 100, Auto fix assigns 3100 ml — `isPourVolumeValid()` is then true, and `Recipe.getData()` forwards 3100 as a single byte.

The two call sites must not each grow their own check, so this is one module used twice.

**Files:**
- Create: `library/cardLimits.ts`
- Create: `library/__tests__/cardLimits.test.ts`

- [ ] **Step 1: Write the failing test**

Create `library/__tests__/cardLimits.test.ts`:

```ts
/**
 * The bounds a recipe must satisfy to survive `Recipe.getData()`.
 *
 * These are the same numbers the editor's steppers enforce. They are asserted
 * here rather than trusted there because a recipe can arrive from an import, a
 * restore or Auto fix without passing through a stepper at all.
 */
import Pour, {POUR_PATTERN} from "@/library/Pour";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import {cardWriteProblems} from "@/library/cardLimits";

/** A recipe the machine would accept, as the baseline every case perturbs. */
function validRecipe(): Recipe {
    const recipe = new Recipe();
    recipe.cupType = CUP_TYPE.XPOD;
    recipe.dosage = 18;
    recipe.ratio = 16;
    recipe.grinder = true;
    recipe.grindSize = 50;
    recipe.grindRPM = 120;
    recipe.pours = [new Pour(1, 288, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0)];
    return recipe;
}

describe("a recipe the machine would accept", () => {
    it("has no problems", () => {
        expect(cardWriteProblems(validRecipe())).toEqual([]);
    });
});

describe("a recipe outside the machine's bounds", () => {
    it("rejects a stage volume above 240 ml, even when the sum balances", () => {
        // The reviewer's example: dose 31 at ratio 100 balances at 3100 ml, so
        // the volume sum is valid and the byte is still nonsense.
        const recipe = validRecipe();
        recipe.dosage = 31;
        recipe.ratio = 100;
        recipe.pours = [new Pour(1, 3100, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0)];

        expect(recipe.isPourVolumeValid()).toBe(true);
        expect(cardWriteProblems(recipe)).toContain("Stage 1 pours 3100 ml. The most is 240 ml.");
    });

    it("rejects a dose above 31 g", () => {
        const recipe = validRecipe();
        recipe.dosage = 40;

        expect(cardWriteProblems(recipe)).toContain("The dose is 40 g. The most is 31 g.");
    });

    it("rejects a temperature below 39 C", () => {
        const recipe = validRecipe();
        recipe.pours[0].temperature = 20;

        expect(cardWriteProblems(recipe))
            .toContain("Stage 1 brews at 20 C. The range is 39-99 C.");
    });

    it("reports an unbalanced recipe too, so one call answers the whole question", () => {
        const recipe = validRecipe();
        recipe.pours[0].volume = 100;

        expect(cardWriteProblems(recipe))
            .toContain("The stages pour 100 ml, but the dose and ratio ask for 288 ml.");
    });

    it("collects every problem rather than stopping at the first", () => {
        const recipe = validRecipe();
        recipe.dosage = 40;
        recipe.pours[0].temperature = 20;

        expect(cardWriteProblems(recipe).length).toBeGreaterThanOrEqual(2);
    });
});

describe("a tea recipe", () => {
    it("takes the tea bounds, not the coffee ones", () => {
        const recipe = validRecipe();
        recipe.cupType = CUP_TYPE.TEA;
        recipe.dosage = 5;
        recipe.pours = [new Pour(1, 200, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0)];
        recipe.fixRatio();

        expect(cardWriteProblems(recipe)).toContain("Stage 1 pours 200 ml. The most is 90 ml.");
    });

    it("allows a pause longer than a coffee card would", () => {
        const recipe = validRecipe();
        recipe.cupType = CUP_TYPE.TEA;
        recipe.dosage = 5;
        recipe.pours = [new Pour(1, 90, 93, 30, 0, POUR_PATTERN.CIRCULAR, 300)];
        recipe.fixRatio();

        expect(cardWriteProblems(recipe).some((p) => p.includes("waits"))).toBe(false);
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest library/__tests__/cardLimits.test.ts
```

Expected: FAIL — `Cannot find module '@/library/cardLimits'`.

- [ ] **Step 3: Write the module**

Create `library/cardLimits.ts`:

```ts
import Recipe from "./Recipe";

/**
 * Whether a recipe can be written to a card, and why not.
 *
 * The single authority. Balance alone was the old test, and it is not enough:
 * `autoFixPourVolumes` will happily balance a one-stage recipe at 3100 ml, which
 * satisfies the sum and then goes into `Recipe.getData()` as one byte. Every
 * field written to the card has a range, and a recipe can reach this point from
 * an import, a restore or Auto fix without ever passing a stepper that would
 * have clamped it.
 *
 * Returns prose, in the order a reader would meet the fields on screen, and
 * collects every problem rather than stopping at the first — a recipe with two
 * bad fields should not have to be fixed twice to learn that.
 */

/** Inclusive bounds for one field, in the units the model stores. */
type Range = {min: number; max: number};

const RATIO: Range = {min: 5, max: 100};
const GRIND_SIZE: Range = {min: 40, max: 80};
const GRIND_RPM: Range = {min: 60, max: 120};
const TEMPERATURE: Range = {min: 39, max: 99};
/** Tenths of a millilitre per second: the byte 30 means 3.0 ml/s. */
const FLOW_RATE: Range = {min: 30, max: 35};

/**
 * The pour count is written as `pours.length << 3` in a single byte, so 31 is
 * the last count that does not overflow it.
 */
const MAX_POURS = 31;
/** The editor stops adding tea stages at three, and the card agrees. */
const MAX_TEA_POURS = 3;

function outside(value: number, range: Range): boolean {
    return !Number.isFinite(value) || value < range.min || value > range.max;
}

export function cardWriteProblems(recipe: Recipe): string[] {
    const problems: string[] = [];
    const tea = recipe.isTea();

    const maxDose = tea ? 10 : 31;
    if (outside(recipe.dosage, {min: 1, max: maxDose})) {
        problems.push(`The dose is ${recipe.dosage} g. The most is ${maxDose} g.`);
    }

    if (outside(recipe.ratio, RATIO)) {
        problems.push(`The ratio is 1:${recipe.ratio}. The range is 1:${RATIO.min}-1:${RATIO.max}.`);
    }

    if (!Number.isInteger(recipe.ratio)) {
        // The card holds a whole number, and a half would be silently truncated.
        problems.push(`The ratio is 1:${recipe.ratio}. It has to be a whole number.`);
    }

    // Only when the grinder is on, and never on tea: a tea card always writes
    // the default grind size regardless of what the model holds.
    if (recipe.grinder && !tea) {
        if (outside(recipe.grindSize, GRIND_SIZE)) {
            problems.push(
                `The grind size is ${recipe.grindSize}. The range is ${GRIND_SIZE.min}-${GRIND_SIZE.max}.`
            );
        }
        if (outside(recipe.grindRPM, GRIND_RPM)) {
            problems.push(
                `The grind speed is ${recipe.grindRPM} rpm. The range is ${GRIND_RPM.min}-${GRIND_RPM.max} rpm.`
            );
        }
    }

    const maxPours = tea ? MAX_TEA_POURS : MAX_POURS;
    if (recipe.pours.length < 1) {
        problems.push("The recipe has no stages.");
    } else if (recipe.pours.length > maxPours) {
        problems.push(`The recipe has ${recipe.pours.length} stages. The most is ${maxPours}.`);
    }

    const maxVolume = tea ? 90 : 240;
    const maxPause = tea ? 360 : 59;

    recipe.pours.forEach((pour, index) => {
        const stage = index + 1;

        if (outside(pour.volume, {min: 1, max: maxVolume})) {
            problems.push(`Stage ${stage} pours ${pour.volume} ml. The most is ${maxVolume} ml.`);
        }
        if (outside(pour.temperature, TEMPERATURE)) {
            problems.push(
                `Stage ${stage} brews at ${pour.temperature} C. ` +
                `The range is ${TEMPERATURE.min}-${TEMPERATURE.max} C.`
            );
        }
        if (outside(pour.flowRate, FLOW_RATE)) {
            problems.push(
                `Stage ${stage} flows at ${pour.flowRate / 10} ml/s. ` +
                `The range is ${FLOW_RATE.min / 10}-${FLOW_RATE.max / 10} ml/s.`
            );
        }
        if (outside(pour.pauseTime, {min: 0, max: maxPause})) {
            problems.push(`Stage ${stage} waits ${pour.pauseTime} s. The most is ${maxPause} s.`);
        }
    });

    // Last, because it is a property of the whole recipe rather than one field,
    // and because a reader who has just been told a stage is out of range does
    // not also need to be told the sum is therefore wrong first.
    if (!recipe.isPourVolumeValid()) {
        problems.push(
            `The stages pour ${recipe.getPourTotalVolume()} ml, ` +
            `but the dose and ratio ask for ${recipe.getTotalVolume()} ml.`
        );
    }

    return problems;
}

/** Whether the card can be written at all. */
export function canWriteToCard(recipe: Recipe): boolean {
    return cardWriteProblems(recipe).length === 0;
}
```

- [ ] **Step 4: Run the test**

```bash
npx jest library/__tests__/cardLimits.test.ts
```

Expected: PASS, all cases.

If the tea pause case fails, check that `Recipe.isTea()` reads `cupType === CUP_TYPE.TEA` — the tea branch depends on it.

- [ ] **Step 5: Commit**

```bash
git add library/cardLimits.ts library/__tests__/cardLimits.test.ts
git commit -m "Say what makes a recipe writable, in one place

Balance was the whole test, and it is not enough. Auto fix will
balance a one-stage recipe at 3100 ml, which satisfies the sum and
then goes to the card as a single byte. Every field has a range, and
an imported or restored recipe reaches the write gate without having
passed a stepper that would have clamped it.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Gate WRITE on the validator

**Files:**
- Modify: `hooks/useRecipeEditor.ts` (the `canWrite` derivation, around line 70)
- Test: `hooks/__tests__/useRecipeEditor.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `hooks/__tests__/useRecipeEditor.test.ts`:

```ts
describe("the write gate", () => {
    it("is closed for a balanced recipe whose fields are out of range", async () => {
        // Balanced and unwritable at the same time: dose 31 at ratio 100 asks
        // for 3100 ml, and one stage can hold at most 240.
        const recipe = new Recipe();
        recipe.cupType = CUP_TYPE.XPOD;
        recipe.dosage = 31;
        recipe.ratio = 100;
        recipe.pours = [new Pour(1, 3100, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0)];

        const {result} = await renderHook(() =>
            useRecipeEditor({recipeJSON: JSON.stringify(recipe), onSaved: () => {}})
        );

        expect(result.current.balance.balanced).toBe(true);
        expect(result.current.canWrite).toBe(false);
    });

    it("is open for a recipe within range", async () => {
        const recipe = new Recipe();
        recipe.cupType = CUP_TYPE.XPOD;
        recipe.dosage = 18;
        recipe.ratio = 16;
        recipe.pours = [new Pour(1, 288, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0)];

        const {result} = await renderHook(() =>
            useRecipeEditor({recipeJSON: JSON.stringify(recipe), onSaved: () => {}})
        );

        expect(result.current.canWrite).toBe(true);
    });

    it("still allows saving a recipe that cannot be written", async () => {
        // Keeping a recipe and writing it are different permissions. A recipe
        // the machine would reject is still worth having in the library.
        const recipe = new Recipe();
        recipe.cupType = CUP_TYPE.XPOD;
        recipe.dosage = 31;
        recipe.ratio = 100;
        recipe.pours = [new Pour(1, 3100, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0)];

        const {result} = await renderHook(() =>
            useRecipeEditor({recipeJSON: JSON.stringify(recipe), onSaved: () => {}})
        );

        expect(result.current.canSave).toBe(true);
    });
});
```

Check the top of that file: if `Pour`, `POUR_PATTERN` or `CUP_TYPE` are not already imported, add them:

```ts
import Pour, {POUR_PATTERN} from "@/library/Pour";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest hooks/__tests__/useRecipeEditor.test.ts -t "write gate"
```

Expected: FAIL on the first case — `canWrite` is `true`, because balance alone opens it.

- [ ] **Step 3: Make the change**

In `hooks/useRecipeEditor.ts`, add the import:

```ts
import {cardWriteProblems} from "@/library/cardLimits";
```

Replace the `canWrite` / `canSave` block:

```ts
    /** A recipe the machine would reject cannot be written; it can still be kept. */
    const canWrite = balance.balanced && !inputError && recipe !== null;
    const canSave = !inputError && recipe !== null;
```

with:

```ts
    /**
     * Every reason the machine would refuse this recipe.
     *
     * Balance used to be the whole test, and it let a balanced recipe with a
     * 3100 ml stage through to `getData()`, where the volume became one byte.
     * `cardWriteProblems` includes the balance check, so this is the only
     * question the gate has to ask.
     */
    const writeProblems = recipe ? cardWriteProblems(recipe) : [];

    /** A recipe the machine would reject cannot be written; it can still be kept. */
    const canWrite = writeProblems.length === 0 && !inputError && recipe !== null;
    const canSave = !inputError && recipe !== null;
```

`writeProblems` is deliberately **not** added to what the hook returns. Nothing
draws it yet, and an exported value with no reader is a promise to a caller that
does not exist. When the editor earns a place to explain a closed WRITE gate, it
is one line to expose.

- [ ] **Step 4: Run the tests**

```bash
npx jest hooks/__tests__/useRecipeEditor.test.ts
```

Expected: PASS, including the pre-existing cases.

- [ ] **Step 5: Commit**

```bash
git add hooks/useRecipeEditor.ts hooks/__tests__/useRecipeEditor.test.ts
git commit -m "Close the write gate on any field the card cannot hold

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: The card marker uses the same authority

**Files:**
- Modify: `components/RecipeCard.tsx` (around line 217)
- Test: `components/__tests__/RecipeCard.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `components/__tests__/RecipeCard.test.tsx`:

```ts
it("marks a balanced recipe whose fields are out of range as unwritable", async () => {
    // The card used to ask only whether the volumes summed, so this recipe --
    // balanced, and holding a stage volume no byte can carry -- was shown as
    // writable while writing it would emit nonsense.
    const recipe = new Recipe();
    recipe.cupType = CUP_TYPE.XPOD;
    recipe.dosage = 31;
    recipe.ratio = 100;
    recipe.pours = [new Pour(1, 3100, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0)];

    await renderWithProviders(<RecipeCard recipe={recipe} showCoffeeMarker/>);

    expect(await screen.findByLabelText("Will not write")).toBeTruthy();
});
```

Match the props the file's existing tests pass to `RecipeCard`; if they wrap it differently, follow that. Add the `Pour`/`CUP_TYPE` imports if missing.

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest components/__tests__/RecipeCard.test.tsx -t "out of range"
```

Expected: FAIL — no element with that label, because `isPourVolumeValid()` is true.

- [ ] **Step 3: Make the change**

In `components/RecipeCard.tsx`, add:

```ts
import {canWriteToCard} from "@/library/cardLimits";
```

Replace:

```tsx
                    {!recipe.isPourVolumeValid() && (
```

with:

```tsx
                    {/* The same authority as the editor's WRITE gate. Asking
                        only whether the volumes summed marked a recipe with a
                        3100 ml stage as writable. */}
                    {!canWriteToCard(recipe) && (
```

- [ ] **Step 4: Run the tests**

```bash
npx jest components/__tests__/RecipeCard.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/RecipeCard.tsx components/__tests__/RecipeCard.test.tsx
git commit -m "Mark a card unwritable for any reason the editor would

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Flush a typed draft before any recipe action

Review thread `app/editRecipe.tsx:114`. `TextFieldRow` is uncontrolled and commits on `onEndEditing`. React Native `Pressable` does not blur a focused `TextInput`, so typing a new name and tapping WRITE, SAVE, More or Back acts on the previous value — and navigation unmounts the input before `onEndEditing` can fire.

The field cannot become controlled: each call site is keyed on the value it mirrors (`key={recipe.name}`), so committing per keystroke would remount the row and drop the cursor. The draft is therefore held in a ref and flushed before any action.

**Files:**
- Modify: `app/editRecipe.tsx`
- Test: `app/__tests__/editRecipe.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `app/__tests__/editRecipe.test.tsx`:

```tsx
it("saves the name being typed when SAVE is tapped without blurring first", async () => {
    // A Pressable does not blur a focused TextInput, so `onEndEditing` never
    // fires -- and navigating away unmounts the field before it could.
    const recipe = new Recipe();
    recipe.name = "Old name";
    recipe.dosage = 18;
    recipe.ratio = 16;
    recipe.pours = [new Pour(1, 288, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0)];

    const db = makeFakeDb();   // follow the file's existing helper
    await renderEditor({recipe, db});

    await fireEvent.changeText(await screen.findByLabelText("Name"), "New name");
    await fireEvent.press(await screen.findByLabelText("Save recipe"));

    expect(db.saved?.name).toBe("New name");
});
```

Match the file's existing setup helpers and the accessibility labels its other tests use for the Save control — read the top of the file first and reuse them rather than inventing names.

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest app/__tests__/editRecipe.test.tsx -t "without blurring"
```

Expected: FAIL — the saved name is `"Old name"`.

- [ ] **Step 3: Let a row report its draft**

In `app/editRecipe.tsx`, add to `TextFieldRowProps`:

```ts
    /**
     * Every keystroke, so the screen can flush an unblurred field.
     *
     * A `Pressable` does not blur a focused `TextInput`, so WRITE, SAVE, More
     * and Back can all fire while this row still holds a value the recipe has
     * never seen. The draft goes to a ref rather than to state: this row is
     * keyed on the value it mirrors, so publishing per keystroke would remount
     * it and take the cursor with it.
     */
    onDraft?: (value: string) => void;
```

In `TextFieldRow`, change `onChangeText` so the draft is reported before the validation early-return:

```ts
    function onChangeText(value: string) {
        onDraft?.(value);
        if (!validate) return;
        const bad = !validate(value);
        setInvalid(bad);
        onInvalidChange?.(bad);
    }
```

Add `onDraft` to the destructured parameter list:

```ts
function TextFieldRow({
    topic, label, initialValue, maxLength, autoCapitalize,
    showHint, onCommit, onDraft,
    validate, invalidReason, onInvalidChange
}: TextFieldRowProps) {
```

- [ ] **Step 4: Carry the reporter through the deck**

Add to `BrewDeckProps`:

```ts
    /** Records an unblurred field's current text, for the screen to flush. */
    onDraft: (label: string, value: string) => void;
```

Destructure `onDraft` in `BrewDeck` alongside `dispatch`, and pass it to both text rows:

```tsx
            <TextFieldRow key={recipe.xid} topic="xid" label="Recipe ID" initialValue={recipe.xid}
                          maxLength={8} autoCapitalize="characters"
                      showHint={showHint}
                          validate={isValidXID} onInvalidChange={onInputErrorChange}
                          invalidReason="Not a valid ID — three letters, an optional T, then two or three digits, like CGL12."
                          onDraft={(value) => onDraft(RECIPE_LABELS.XID, value)}
                          onCommit={(value) => dispatch(RECIPE_LABELS.XID, value)}/>

            <TextFieldRow key={recipe.name} topic="name" label="Name" initialValue={recipe.name}
                          maxLength={100}
                      showHint={showHint}
                          onDraft={(value) => onDraft(RECIPE_LABELS.TITLE, value)}
                          onCommit={(value) => dispatch(RECIPE_LABELS.TITLE, value)}/>
```

- [ ] **Step 5: Hold and flush the drafts on the screen**

In the screen component, beside the other refs, add:

```tsx
    /**
     * What the text fields hold but the recipe has not been told about.
     *
     * A ref rather than state: it changes on every keystroke, and nothing on
     * screen renders from it. It is drained before any action that reads the
     * recipe, and cleared when a field commits normally.
     */
    const drafts = useRef(new Map<string, string>());
```

Ensure `useRef` is imported from `react`.

Below `dispatch`, add:

```tsx
    /**
     * Apply anything typed but not committed.
     *
     * Awaited rather than fired and forgotten: `editInputComplete` is async, and
     * the callers of this are about to read the recipe.
     */
    async function flushDrafts() {
        if (drafts.current.size === 0) return;
        const pending = Array.from(drafts.current.entries());
        drafts.current.clear();
        for (const [label, value] of pending) {
            await editInputComplete(label, value);
        }
        bumpKey();
    }
```

Change `dispatch` so a normal commit clears that field's draft:

```tsx
    const dispatch: Dispatch = (label, value) => {
        drafts.current.delete(label);
        void editInputComplete(label, value);
        bumpKey();
    };
```

- [ ] **Step 6: Flush before every action that reads the recipe**

Pass the reporter to the deck:

```tsx
onDraft={(label, value) => drafts.current.set(label, value)}
```

Then make each action flush first. `duplicateRecipe` and `deleteRecipe` become async:

```tsx
    async function duplicateRecipe() {
        await flushDrafts();
        // The recipe in hand, not its stored row. A recipe read from a card or
        // imported from a link has no row yet, so duplicating one used to
        // create nothing and navigate back as though it had; for a saved one it
        // copied the last save and dropped every unsaved edit.
        new RecipeDatabase().duplicateRecipe(recipe!);
        navigation.goBack();
    }

    async function deleteRecipe() {
        await flushDrafts();
        new RecipeDatabase().deleteRecipe(recipe!.uuid);
        navigation.goBack();
    }
```

Wrap the save, write and back handlers at their call sites in the JSX:

```tsx
onSave={async () => { await flushDrafts(); await saveRecipe(); }}
onWrite={async () => { await flushDrafts(); await writeCard(recipe); }}
onBack={async () => { await flushDrafts(); navigation.goBack(); }}
```

Read the existing JSX and match the real prop names on `RecipeHero` and the action bar — `onBack` is at `app/editRecipe.tsx:637`. Do not rename anything; only wrap the handlers.

- [ ] **Step 7: Run the tests**

```bash
npx jest app/__tests__/editRecipe.test.tsx
```

Expected: PASS, including the pre-existing cases.

- [ ] **Step 8: Commit**

```bash
git add app/editRecipe.tsx app/__tests__/editRecipe.test.tsx
git commit -m "Do not act on a name the recipe has not been told about

A Pressable does not blur a focused TextInput, so WRITE, SAVE, More
and Back could all fire while a text row still held a value the model
had never seen -- and navigating away unmounted the field before
onEndEditing could rescue it.

The row cannot become controlled: each is keyed on the value it
mirrors, so committing per keystroke would remount it mid-entry. The
draft goes to a ref instead, and is drained before any action.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Make Cancel work before the session opens

Review thread `library/NFC.ts:73`. `Recipe.readCard` and `writeCard` both `await nfc.init()` before `nfc.open()`, and the overlay is cancellable throughout. A Cancel during a slow `NfcManager.start()` calls `close()`, which sees `isClosed === true` and returns without doing anything; `open()` then sets the flag false and starts a native session behind an overlay the user has already dismissed.

**Files:**
- Modify: `library/NFC.ts`
- Test: `library/__tests__/NFC.session.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `library/__tests__/NFC.session.test.ts`:

```ts
describe("a session being cancelled before it opens", () => {
    it("does not start a request when Cancel arrives during init", async () => {
        // The overlay is up and cancellable while `init()` is still awaiting
        // `NfcManager.start()`. A Cancel then found `isClosed` true, returned
        // without doing anything, and `open()` went on to start a native
        // session behind an overlay that was already gone.
        const nfc = new NFC();

        let releaseStart!: () => void;
        NfcManager.start.mockReturnValueOnce(
            new Promise<void>((resolve) => {
                releaseStart = resolve;
            })
        );

        const starting = nfc.init();
        await nfc.close();
        releaseStart();
        await starting;

        await expect(nfc.open()).rejects.toThrow();
        expect(NfcManager.requestTechnology).not.toHaveBeenCalled();
        expect(nfc.getIsClosed()).toBe(true);
    });

    it("forgets the cancellation when a new session is started", async () => {
        const nfc = new NFC();

        await nfc.init();
        await nfc.close();

        await nfc.init();
        NfcManager.requestTechnology.mockResolvedValueOnce(undefined);
        await nfc.open();

        expect(nfc.getIsClosed()).toBe(false);
    });
});
```

Add `start` to the `beforeEach` reset so the mock does not leak between cases:

```ts
beforeEach(() => {
    NfcManager.start.mockReset();
    NfcManager.requestTechnology.mockReset();
    NfcManager.cancelTechnologyRequest.mockReset();
});
```

Read the file's existing `jest.mock("react-native-nfc-manager", …)` first. If
`start` is not among the mocked methods, add it as `start: jest.fn(async () => {})`
— the tests above drive it directly.

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest library/__tests__/NFC.session.test.ts
```

Expected: FAIL on the first new case — `open()` resolves and `requestTechnology` was called.

- [ ] **Step 3: Track the cancellation across the whole operation**

In `library/NFC.ts`, add a field beside `isClosed`:

```ts
class NFC {
    private isClosed = true;
    /**
     * Whether Cancel has been pressed since this session was started.
     *
     * `isClosed` alone cannot answer that. It is true before `open()` runs, so
     * a Cancel arriving while `init()` awaits `NfcManager.start()` was
     * indistinguishable from a Cancel on a session that had never begun --
     * `close()` returned without doing anything, and `open()` then started a
     * native session behind a dismissed overlay. This flag spans init and open
     * together, which is the window the user is actually looking at.
     */
    private cancelled = false;
```

Reset it when a session begins:

```ts
    async init() {
        // A new ceremony, so a Cancel from the last one does not carry over.
        this.cancelled = false;
        try {
            await NfcManager.start();
        } catch (ex) {
            console.error('NFC Manager failed to start', ex);
        }
    }
```

Record it in `close()`, before the early return:

```ts
    async close() {
        // Recorded even when there is nothing to cancel yet: a Cancel during
        // `init()` has to be remembered until `open()` can honour it.
        this.cancelled = true;

        // Callers close explicitly and again from a `finally`; cancelling a
        // session that has already ended rejects with "Not even registered".
        if (this.isClosed) {
            return;
        }
        this.isClosed = true;
        try {
            await NfcManager.cancelTechnologyRequest();
        } catch (e) {
            console.log("Error closing NFC session: " + e);
        }
    }
```

Honour it in `open()`, before the flag is set:

```ts
    async open() {
        // Cancelled while init was still running. Throwing rather than
        // returning quietly keeps the caller's existing shape: `readCard` and
        // `writeCard` already treat a throw with `getIsClosed()` true as the
        // user having walked away, and report nothing.
        if (this.cancelled) {
            this.isClosed = true;
            throw new Error("NFC session cancelled before it opened");
        }

        // The session is marked open *before* the request resolves, not after.
```

(Leave the rest of `open()` unchanged.)

- [ ] **Step 4: Run the tests**

```bash
npx jest library/__tests__/NFC.session.test.ts
```

Expected: PASS, including the four pre-existing cases — in particular "does not cancel a session that was never opened", which must still see no `cancelTechnologyRequest` call.

- [ ] **Step 5: Commit**

```bash
git add library/NFC.ts library/__tests__/NFC.session.test.ts
git commit -m "Honour a Cancel that arrives before the session opens

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 7: Hide the screen behind a sheet from TalkBack

Review thread `components/XbrwSheet.tsx:177`. `accessibilityViewIsModal` is iOS-only, and `XbrwSheet` is deliberately not `modal`, so on Android TalkBack can still reach and activate the controls behind an open sheet.

**Files:**
- Modify: `components/XbrwSheet.tsx`
- Test: `components/__tests__/XbrwSheet.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `components/__tests__/XbrwSheet.test.tsx`:

```tsx
it("hides the content behind it from Android's screen reader while it is up", async () => {
    // `accessibilityViewIsModal` only isolates siblings on iOS, and this sheet
    // is deliberately not `modal`, so without this TalkBack walks straight
    // past the sheet into the screen underneath.
    await renderWithProviders(
        <XbrwSheet open onOpenChange={() => {}} title="Import">
            <Text>Body</Text>
        </XbrwSheet>
    );

    const guard = await screen.findByTestId("sheet-android-guard");
    expect(guard.props.importantForAccessibility).toBe("no-hide-descendants");
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest components/__tests__/XbrwSheet.test.tsx -t "Android"
```

Expected: FAIL — no element with that test ID.

- [ ] **Step 3: Add the Android half**

`XbrwSheet` cannot hide its own siblings, because it does not render them. The guard therefore goes on the sheet's *host* — an absolutely positioned, zero-size view whose only job is to carry the Android attribute for the subtree the portal escapes.

In `components/XbrwSheet.tsx`, inside the returned `Sheet`, add a sibling of `Sheet.Frame`:

```tsx
            {/* The Android half of `accessibilityViewIsModal`.
                That prop only isolates siblings on iOS, and this sheet is
                deliberately not `modal`, so on Android TalkBack could walk past
                the sheet and fire the controls on the screen behind it. This
                covers the screen for the accessibility tree only: it is
                zero-opacity and untouchable, so nothing about the picture
                changes. */}
            <View testID="sheet-android-guard"
                  pointerEvents="none"
                  accessibilityElementsHidden={false}
                  importantForAccessibility={shown ? "no-hide-descendants" : "auto"}
                  style={{position: "absolute", left: 0, right: 0, top: 0, bottom: 0}}/>
```

This is a partial measure on its own. The complete fix needs the *host screen* to hide its own subtree, which `app/index.tsx` and `app/editRecipe.tsx` already do for the NFC overlay. Do the same for sheets: in `app/editRecipe.tsx`, extend the existing guard on the screen's root `YStack` so it also covers an open sheet:

```tsx
            <YStack flex={1} backgroundColor={palette.base}
                    accessibilityElementsHidden={showNfcOverlay || overflowOpen || revertOpen || helpOpen}
                    importantForAccessibility={
                        showNfcOverlay || overflowOpen || revertOpen || helpOpen
                            ? "no-hide-descendants" : "auto"
                    }>
```

- [ ] **Step 4: Run the tests**

```bash
npx jest components/__tests__/XbrwSheet.test.tsx components/__tests__/XbrwSheet.entrance.test.tsx app/__tests__/editRecipe.test.tsx
```

Expected: PASS. If an editor test now fails to find a control while a sheet is open, that is the guard working — update the test to close the sheet first rather than weakening the guard.

- [ ] **Step 5: Commit**

```bash
git add components/XbrwSheet.tsx app/editRecipe.tsx components/__tests__/XbrwSheet.test.tsx
git commit -m "Keep TalkBack out of the screen behind an open sheet

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 8: Correct the HelpSheet comment

Review thread `components/HelpSheet.tsx:30`. The comment says long-form help lives "behind one entry in the overflow" and that the screen "carries the six-word version under each label". Neither is true: help is opened by the HELP button in `RecipeHero`, and hints are a setting that is off by default.

**Files:**
- Modify: `components/HelpSheet.tsx`

- [ ] **Step 1: Replace the comment**

Replace the paragraph beginning "There used to be a marker beside every complicated label" with:

```
 * There used to be a marker beside every complicated label, and then a mode that
 * unfolded all of them at once. Both put the depth on the screen you were trying
 * to work on: the markers dotted it with fifteen small unanswered questions, and
 * the mode doubled its height. What is left is a six-word hint under each label
 * -- a setting, and off by default -- and everything longer than that in here,
 * opened by the HELP button in the recipe's header rather than from the
 * overflow. Help is not a rare action, so it is not behind a menu.
```

- [ ] **Step 2: Verify nothing else claims the old arrangement**

```bash
grep -rn "overflow" components/HelpSheet.tsx constants/recipeHelp.ts docs/help-copy.md
```

Fix any other statement that says help is reached from the overflow menu.

- [ ] **Step 3: Run the tests**

```bash
npx jest components/__tests__/HelpSheet.test.tsx
```

Expected: PASS (comment-only change).

- [ ] **Step 4: Commit**

```bash
git add components/HelpSheet.tsx
git commit -m "Say where help is actually opened from

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 9: Correct the PR's card-safety claim

Review thread `library/NFC.ts:73` (the second one). The PR description says `library/` touches only `Settings.ts` and that `NFC.ts` is untouched. That was true when written and is not now: sub-project 4 changed native-session cancellation, Task 6 changes it again, and no physical-card round trip has been run.

- [ ] **Step 1: Read the current description**

```bash
cd /Users/jesperhessius/Dev/xbrw-sp4-editor
gh pr view 43 --json body --jq .body > /tmp/pr43-body.md
```

- [ ] **Step 2: Rewrite the card-safety section**

Edit `/tmp/pr43-body.md`. Replace the claim that `NFC.ts` is untouched with:

```markdown
### Card safety

**`library/NFC.ts` is changed, and the change is to session lifecycle.** An
earlier revision of this description said it was untouched; that is no longer
true and reviewers should not approve this as card-transport-neutral.

What changed and what did not:

- **Unchanged:** the byte layout, `Recipe.getData` / `Recipe.parseData`, the
  CRC, block addressing, and the read and write command sequences. The
  characterisation tests in `library/__tests__/` are untouched, and a diff to
  `cardFixtures.ts` in this PR would be a mistake.
- **Changed:** when a session may be cancelled. `open()` marks the session open
  before `requestTechnology` settles, and a Cancel arriving during `init()` is
  now remembered and honoured rather than being lost. Covered by
  `library/__tests__/NFC.session.test.ts`.

**No physical-card round trip has been run.** The changes above are to session
setup and teardown rather than to the bytes, but that is an argument for the
risk being low, not for it being absent. Before release this needs a read and a
write against a genuine card on a physical device, on both platforms, including
a Cancel pressed during the scan.
```

- [ ] **Step 3: Push the description**

```bash
gh pr edit 43 --body-file /tmp/pr43-body.md
```

- [ ] **Step 4: Reply to and resolve the thread**

Reply with:

> Corrected. The description now states that `NFC.ts` is changed, says which part (session lifecycle, not the byte path), and records that no physical-card round trip has been run — with the verification that is still owed before release.

Then resolve it, using the mutation from Task 1.

- [ ] **Step 5: Reply to and resolve the remaining threads**

Threads from Tasks 2–8 are now addressed. Reply to each with what was done and resolve it:

| Thread | Reply |
|---|---|
| `hooks/useRecipeEditor.ts:70` | `Fixed in the new `library/cardLimits.ts`. `cardWriteProblems` checks dose, ratio, grind size and speed, stage count, and per-stage volume, temperature, flow rate and pause -- and includes the balance check, so it is the only question the gate asks. Your 3100 ml example is a test case.` |
| `components/RecipeCard.tsx:219` | `Fixed. The marker calls `canWriteToCard` from the same module as the WRITE gate, so the two cannot drift.` |
| `app/editRecipe.tsx:114` | `Fixed. The row cannot become controlled -- each is keyed on the value it mirrors, so a per-keystroke commit would remount it mid-entry -- so the draft is reported to a ref and drained by `flushDrafts()` before save, write, duplicate, delete and back.` |
| `library/NFC.ts:73` (cancellation) | `Fixed. A `cancelled` flag now spans init and open together, is reset when a session starts, and is honoured by `open()` before it requests a technology. Both the pending-`start()` case and the reset are tested.` |
| `components/XbrwSheet.tsx:177` | `Fixed. The sheet carries an Android guard view, and the editor screen hides its own subtree while a sheet is open -- the same thing it already did for the NFC overlay.` |
| `components/HelpSheet.tsx:30` | `Fixed. The comment now says help is opened by the HELP button in the recipe header, and that hints are a setting that is off by default.` |

---

### Task 10: Green CI, then merge

- [ ] **Step 1: Run every gate locally**

```bash
cd /Users/jesperhessius/Dev/xbrw-sp4-editor
npm run typecheck && npm run lint && npm test && npx expo-doctor
```

Expected: all four pass. `expo-doctor` is a hard failure in CI, so a warning there must be dealt with, not noted.

- [ ] **Step 2: Push**

```bash
git push
```

- [ ] **Step 3: Wait for CI**

```bash
gh pr checks 43 --watch
```

Expected: "Typecheck, lint and test" SUCCESS.

- [ ] **Step 4: Confirm every thread is resolved**

```bash
gh api graphql -f query='
{ repository(owner:"hessius",name:"XBRecipeWriterPlus"){
    pullRequest(number:43){ reviewThreads(first:50){ nodes{ isResolved } } } } }' \
  --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved | not)] | length'
```

Expected: `0`, or `1` if the stage-hints thread was deliberately left for the author. Anything else means a reply was missed.

- [ ] **Step 5: Merge**

```bash
gh pr merge 43 --squash --delete-branch=false
```

`--delete-branch=false` because the `sp4-editor` worktree is still checked out on it; deleting the remote branch under a live worktree makes a mess. Clean it up in Task 12.

- [ ] **Step 6: Confirm main has it**

```bash
cd /Users/jesperhessius/Dev/XBRecipeWriterPlus
git fetch origin && git log --oneline -3 origin/main
```

Expected: the squashed editor commit at the top.

---

### Task 11: Settle milestone 4's issues

Three issues sit in milestone 4: **#40** (changing the ratio leaves the target volume stale), **#41** (header settles a few pixels after a transition), **#42** (drag the pour profile to shape a recipe).

Each is closed only if the merged work actually fixes it. Where it does not, the issue is updated to say what remains — a stale issue is worse than an open one.

- [ ] **Step 1: Check #40 against the merged code**

```bash
cd /Users/jesperhessius/Dev/XBRecipeWriterPlus && git checkout main && git pull
grep -n -B4 "poured:\|target:\|balanced:" hooks/useRecipeEditor.ts | head -20
```

Expected: `balance` is derived on every render, with a comment naming #40. That is the fix — the old editor pushed the total through an imperative handle and left it stale.

Close it:

```bash
gh issue close 40 --comment "Fixed by #43. \`useRecipeEditor\` derives \`balance\` -- poured, target and balanced -- on every render instead of pushing the total through an imperative handle. The stale value came from an edit arriving by a route the imperative repaint did not anticipate, which cannot happen to a derived value.

Verified by the editor tests covering a ratio change and by the write gate tests added alongside \`library/cardLimits.ts\`."
```

- [ ] **Step 2: Check #41**

```bash
grep -rn "useCollapsibleHeader" hooks/useCollapsibleHeader.ts | head -3
sed -n '1,60p' hooks/useCollapsibleHeader.ts
```

#41 is a transition-end settling artefact. Sub-project 4 reworked `useCollapsibleHeader` (+44 lines), so read the file and decide honestly:

- If it addresses the settle, close it with the same style of comment as #40, naming the mechanism.
- If it does not, **leave it open** and comment:

```bash
gh issue comment 41 --body "Still open after #43. The editor rebuild reworked \`useCollapsibleHeader\` (hysteresis between two discrete states rather than interpolation), which changes when the header switches but not what happens as a screen transition settles.

What remains: the header's resting position is measured while the navigator is still animating, so the final position is applied a frame or two after the transition ends. The fix is to defer the measurement until the transition has finished rather than to retune the thresholds.

Needs a physical device to confirm -- it is not reproducible at simulator animation speeds."
```

Replace the "what remains" paragraph with what the code actually shows. Do not paste a description that has not been checked.

- [ ] **Step 3: Update #42**

#42 is a feature — dragging the pour profile to shape a recipe — and sub-project 4 shipped `StageProfile` and `PourProfile` without it. It stays open:

```bash
gh issue comment 42 --body "Not addressed by #43, and still wanted.

What #43 does provide, which this can now build on: \`components/StageProfile.tsx\` draws the profile with a stage selected, and tapping it selects and scrolls to that stage's tile. The geometry for hit-testing a stage from a touch is therefore already there; what is missing is turning a drag into a volume or temperature edit.

Two things to settle before implementing: which axis edits which field, and how a drag interacts with \`autoFixPourVolumes\`, since dragging one stage's volume has to put the difference somewhere."
```

- [ ] **Step 4: Move the milestone on if it is empty**

```bash
gh issue list --milestone "4. The editor" --state open
```

If only #41 and #42 remain and both are follow-up work rather than sub-project 4 scope, move them out so the milestone can close:

```bash
gh issue edit 41 --milestone "6. Settings and About"
gh issue edit 42 --remove-milestone
```

Use judgement — #42 is a new feature with no home yet, so no milestone is honest.

---

### Task 12: Rebase sub-project 5 onto the merged work

- [ ] **Step 1: Tidy the sub-project 4 worktree**

```bash
cd /Users/jesperhessius/Dev/XBRecipeWriterPlus
git worktree remove /Users/jesperhessius/Dev/xbrw-sp4-editor
git branch -D sp4-editor
git push origin --delete sp4-editor
```

- [ ] **Step 2: Rebase this branch onto main**

```bash
cd /Users/jesperhessius/Dev/xbrw-sp5-import
git fetch origin
git rebase origin/main
```

Expected: the single spec commit replays cleanly — it only adds a file under `docs/`.

If the squash merge makes the rebase awkward, reset instead, since this branch holds exactly one commit:

```bash
git reset --hard origin/main
git checkout <spec-commit-sha> -- docs/superpowers/specs/2026-08-25-import-overhaul-design.md
git add docs/superpowers/specs/2026-08-25-import-overhaul-design.md
git commit -m "Design the import overhaul

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

- [ ] **Step 3: Confirm the base**

```bash
git log --oneline -3
npm ci
npm run typecheck && npm test
```

Expected: the editor work is in the history below the spec commit, and every test passes. This is the baseline for Phase 1 — do not start it until this is green.

- [ ] **Step 4: Correct the spec's dependency note**

The spec says sub-project 5 "branches from `sp4-editor` and merges after it". That is now history:

In `docs/superpowers/specs/2026-08-25-import-overhaul-design.md`, replace:

```
This work branches from `sp4-editor` and merges after it.
```

with:

```
This work branched from `sp4-editor`, which merged to main first.
```

```bash
git add docs/superpowers/specs/2026-08-25-import-overhaul-design.md
git commit -m "Record that sub-project 4 landed first

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Phase 1 — Foundations

From here on the work is in `/Users/jesperhessius/Dev/xbrw-sp5-import`.

### Task 13: Add expo-clipboard and mock it

**Files:**
- Modify: `package.json`, `app.json`, `jest.setup.js`

- [ ] **Step 1: Install**

```bash
cd /Users/jesperhessius/Dev/xbrw-sp5-import
npx expo install expo-clipboard
```

If npm rejects this with `EALLOWSCRIPTS`, do it the way this repository already
handles that: read the expected version off `npx expo-doctor`, write it into
`package.json` by hand, then `npm install`.

- [ ] **Step 2: Confirm the version is the one the SDK expects**

```bash
npx expo-doctor
```

Expected: no dependency-version warning for `expo-clipboard`. A warning here is a
CI failure later — expo-doctor is a hard gate.

- [ ] **Step 3: Bump the app version**

`runtimeVersion.policy` is `appVersion`, and a new native module means the
existing runtime cannot load this JS. In `app.json`, raise `expo.version` by one
minor — if it reads `"1.4.0"`, make it `"1.5.0"`.

- [ ] **Step 4: Mock the module for Jest**

Append to `jest.setup.js`:

```js
/**
 * `expo-clipboard` is a native module, so Jest sees nothing without this.
 *
 * `getStringAsync` returns `''` by default, which is the same answer the real
 * module gives for an empty clipboard *and* for a paste the user denied — iOS
 * offers no way to tell those apart, so the app treats both as "nothing
 * happened". Tests that want a value override it per case.
 */
jest.mock("expo-clipboard", () => ({
    hasStringAsync:         jest.fn(async () => false),
    getStringAsync:         jest.fn(async () => ""),
    isPasteButtonAvailable: false,
    ClipboardPasteButton:   () => null
}));
```

`isPasteButtonAvailable` is a boolean constant on the real module, not a
function — a test that wants paste mode re-mocks it rather than calling it.

- [ ] **Step 5: Verify the suite still runs**

```bash
npm test
```

Expected: PASS, unchanged.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json app.json jest.setup.js
git commit -m "Add expo-clipboard

A new native module, so the app version goes up: runtimeVersion.policy
is appVersion and the existing runtime cannot load this JS.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 14: What counts as importable

Spec section 1. Pure, no React, no network — the gate in front of every request,
and the cheapest place in the sub-project to be exhaustive.

**Files:**
- Create: `library/importInput.ts`
- Create: `library/__tests__/importInput.test.ts`

- [ ] **Step 1: Write the failing test**

Create `library/__tests__/importInput.test.ts`:

```ts
/**
 * The whole grammar of what this app will accept from a user.
 *
 * Exhaustive on purpose: everything downstream -- the state machine, the
 * endpoint choice, whether a lookup happens at all -- is decided here, and a
 * pure function with no mocks is the cheapest place in the sub-project to be
 * thorough.
 */
import {parseImportInput} from "@/library/importInput";

describe("share links", () => {
    it("takes the id out of an xBloom share URL", () => {
        expect(parseImportInput("https://share-h5.xbloom.com/recipe?id=abc123"))
            .toEqual({kind: "share", id: "abc123"});
    });

    it("accepts http as well as https", () => {
        expect(parseImportInput("http://share-h5.xbloom.com/recipe?id=abc123"))
            .toEqual({kind: "share", id: "abc123"});
    });

    it("accepts any host, because the id is opaque to us and the server checks it", () => {
        expect(parseImportInput("https://example.com/whatever?id=abc123"))
            .toEqual({kind: "share", id: "abc123"});
    });

    it("finds the id wherever it sits in the query string", () => {
        expect(parseImportInput("https://share-h5.xbloom.com/r?lang=en&id=abc123&ref=x"))
            .toEqual({kind: "share", id: "abc123"});
    });

    it("decodes a percent-encoded id", () => {
        expect(parseImportInput("https://share-h5.xbloom.com/r?id=a%2Bb"))
            .toEqual({kind: "share", id: "a+b"});
    });

    it("rejects a URL with no id", () => {
        expect(parseImportInput("https://share-h5.xbloom.com/recipe")).toBeNull();
    });

    it("rejects a URL whose id is empty", () => {
        expect(parseImportInput("https://share-h5.xbloom.com/recipe?id=")).toBeNull();
    });

    it("rejects a non-http scheme", () => {
        expect(parseImportInput("ftp://share-h5.xbloom.com/r?id=abc123")).toBeNull();
    });

    it("ignores surrounding whitespace, which a paste often carries", () => {
        expect(parseImportInput("  https://share-h5.xbloom.com/r?id=abc123\n"))
            .toEqual({kind: "share", id: "abc123"});
    });
});

describe("pod codes", () => {
    it("takes a three-letter code with three digits", () => {
        expect(parseImportInput("ETH120")).toEqual({kind: "xid", xid: "ETH120"});
    });

    it("takes a three-letter code with two digits", () => {
        expect(parseImportInput("ETH12")).toEqual({kind: "xid", xid: "ETH12"});
    });

    it("takes a tea code", () => {
        expect(parseImportInput("SIGT58")).toEqual({kind: "xid", xid: "SIGT58"});
    });

    it("upper-cases a lower-case code, because the card holds it upper-case", () => {
        expect(parseImportInput("eth120")).toEqual({kind: "xid", xid: "ETH120"});
    });

    it("trims a code", () => {
        expect(parseImportInput("  ETH120  ")).toEqual({kind: "xid", xid: "ETH120"});
    });

    it("rejects two letters", () => {
        expect(parseImportInput("ET120")).toBeNull();
    });

    it("rejects one digit", () => {
        expect(parseImportInput("ETH1")).toBeNull();
    });

    it("rejects four digits", () => {
        expect(parseImportInput("ETH1234")).toBeNull();
    });
});

describe("everything else", () => {
    it("rejects an empty string", () => {
        // `isValidXID` says an empty XID is fine -- a recipe brews without one.
        // Nothing to look up is a different question, and the answer is no.
        expect(parseImportInput("")).toBeNull();
    });

    it("rejects whitespace alone", () => {
        expect(parseImportInput("   ")).toBeNull();
    });

    it("rejects prose", () => {
        expect(parseImportInput("meet me at six")).toBeNull();
    });

    it("rejects a bare word that is not a code", () => {
        expect(parseImportInput("coffee")).toBeNull();
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest library/__tests__/importInput.test.ts
```

Expected: FAIL — `Cannot find module '@/library/importInput'`.

- [ ] **Step 3: Write the module**

Create `library/importInput.ts`:

```ts
import {isValidXID} from "./Recipe";

/**
 * What the import field will accept, and which endpoint it implies.
 *
 * Pure: no React, no network. Everything downstream decides what to do from
 * this answer, so this is the only place that knows what an xBloom link looks
 * like -- `app/index.tsx` used to know it too, and two modules that have to
 * agree eventually do not.
 */
export type ImportSource =
    | {kind: "share"; id: string}
    | {kind: "xid"; xid: string};

/**
 * The parsed source, or `null` when there is nothing to look up.
 *
 * A share link and a pod code cannot be mistaken for one another, which is why
 * the sheet has no mode switch: asking the user to declare which one they are
 * holding would be asking for something the app can already see.
 *
 * The host is deliberately not checked. Any `http(s)` URL carrying an `id` is
 * accepted -- the id is opaque to us, the server rejects a bad one, and an
 * allowlist of xBloom domains would break silently on the day they change
 * domain. The cost of being wrong is one wasted request.
 */
export function parseImportInput(raw: string): ImportSource | null {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
        return null;
    }

    const share = shareId(trimmed);
    if (share !== null) {
        return {kind: "share", id: share};
    }

    // `isValidXID` accepts an empty string -- a recipe brews without an ID --
    // and the empty case is already gone above.
    if (isValidXID(trimmed)) {
        // Upper-cased because that is how the card holds it, so a code typed in
        // lower case produces the same recipe as one pasted from a pack.
        return {kind: "xid", xid: trimmed.toUpperCase()};
    }

    return null;
}

function shareId(candidate: string): string | null {
    let url: URL;
    try {
        url = new URL(candidate);
    } catch {
        return null;
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
        return null;
    }

    // `URL` has already decoded this.
    const id = url.searchParams.get("id");
    return id !== null && id.length > 0 ? id : null;
}
```

- [ ] **Step 4: Run the test**

```bash
npx jest library/__tests__/importInput.test.ts
```

Expected: PASS, every case.

- [ ] **Step 5: Commit**

```bash
git add library/importInput.ts library/__tests__/importInput.test.ts
git commit -m "Say what counts as importable, once

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 15: XBloomRecipe stops guessing, and can be stopped

Spec section 1. `XBloomRecipe` picks its endpoint with `id.length <= 7`. Now that
`parseImportInput` has already decided, that heuristic is redundant and unsound —
a short share id would go to the pod endpoint. It takes the parsed source
instead, and `fetchRecipeDetail` takes an `AbortSignal` so a superseded lookup
can actually be stopped.

**Files:**
- Modify: `library/XBloomRecipe.ts`
- Create: `library/__tests__/XBloomRecipe.endpoint.test.ts`

- [ ] **Step 1: Write the failing test**

Create `library/__tests__/XBloomRecipe.endpoint.test.ts`:

```ts
/**
 * Which endpoint gets called, and whether a request can be called off.
 *
 * The endpoint used to be guessed from the length of the id, which sent a short
 * share id to the pod endpoint. `parseImportInput` has already decided by the
 * time this class is built, so it is told rather than left to infer.
 */
import {XBloomRecipe} from "@/library/XBloomRecipe";

const POD_ENDPOINT = "https://client-api.xbloom.com/tRecipeDetailOfPods.thtml";
const SHARE_ENDPOINT = "https://client-api.xbloom.com/RecipeDetail.html";

function okResponse() {
    return {ok: true, status: 200, json: async () => ({recipeVo: null})};
}

beforeEach(() => {
    global.fetch = jest.fn(async () => okResponse()) as unknown as typeof fetch;
});

it("calls the pod endpoint for a pod code", async () => {
    await new XBloomRecipe({kind: "xid", xid: "ETH120"}).fetchRecipeDetail();

    expect(global.fetch).toHaveBeenCalledWith(POD_ENDPOINT, expect.anything());
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body).xid).toBe("ETH120");
});

it("calls the share endpoint for a share id, however short it is", async () => {
    // Six characters. The old length heuristic sent this to the pod endpoint.
    await new XBloomRecipe({kind: "share", id: "ab12cd"}).fetchRecipeDetail();

    expect(global.fetch).toHaveBeenCalledWith(SHARE_ENDPOINT, expect.anything());
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body).tableIdOfRSA)
        .toBe("ab12cd");
});

it("passes an abort signal through to fetch", async () => {
    const controller = new AbortController();

    await new XBloomRecipe({kind: "xid", xid: "ETH120"})
        .fetchRecipeDetail(controller.signal);

    expect((global.fetch as jest.Mock).mock.calls[0][1].signal).toBe(controller.signal);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest library/__tests__/XBloomRecipe.endpoint.test.ts
```

Expected: FAIL — the constructor takes a string, so TypeScript rejects the object
and the share case hits the pod endpoint.

- [ ] **Step 3: Take the source explicitly**

In `library/XBloomRecipe.ts`, import the type and rewrite the constructor:

```ts
import type {ImportSource} from "./importInput";
```

```ts
    constructor(source: ImportSource) {
        // Told, not guessed. The endpoint used to be chosen by `id.length <= 7`,
        // which sent a short share id to the pod endpoint; `parseImportInput`
        // has already distinguished the two by the time we get here.
        this.byXid = source.kind === "xid";
        this.id = source.kind === "xid" ? source.xid : source.id;
    }
```

Delete the `containsChineseCustomChars` call sites' dependency on nothing here —
leave that method alone.

- [ ] **Step 4: Take a signal**

Change the signature and pass it on:

```ts
    /**
     * Fetch the recipe.
     *
     * The signal lets a superseded lookup actually stop rather than merely have
     * its result ignored: the import field can be edited while a request is in
     * flight, and the hook's generation counter is the braces to this belt.
     */
    public async fetchRecipeDetail(signal?: AbortSignal) {
```

and in the `fetch` call, add `signal` to the options object:

```ts
            body:    JSON.stringify(requestBody),
            method:  "POST",
            signal
        });
```

- [ ] **Step 5: Fix the remaining caller**

```bash
grep -rn "new XBloomRecipe" --include=*.ts --include=*.tsx .
```

Expected: `components/ImportRecipeComponent.tsx`. That file is deleted in Task 22;
until then, keep the build green by giving it a parsed source:

```tsx
const source = parseImportInput(recipeId);
// ... guarded so nothing is fetched when it does not parse
const xb = new XBloomRecipe(source);
```

Import `parseImportInput` from `@/library/importInput` there and bail out when it
returns `null`.

- [ ] **Step 6: Run the tests**

```bash
npx jest library/__tests__/XBloomRecipe.endpoint.test.ts && npm run typecheck
```

Expected: PASS and a clean typecheck.

- [ ] **Step 7: Commit**

```bash
git add library/XBloomRecipe.ts library/__tests__/XBloomRecipe.endpoint.test.ts components/ImportRecipeComponent.tsx
git commit -m "Tell XBloomRecipe which endpoint, and let a lookup be called off

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Phase 2 — The state machine

Spec section 2. `hooks/useRecipeImport.ts` owns every rule about *when* things
happen. It is the only place the paste/typing distinction exists, and it does not
navigate — it calls a callback.

### Task 16: Resolving, and who navigates

**Files:**
- Create: `hooks/useRecipeImport.ts`
- Create: `hooks/__tests__/useRecipeImport.test.ts`

- [ ] **Step 1: Write the failing test**

Create `hooks/__tests__/useRecipeImport.test.ts`:

```tsx
/**
 * The import state machine.
 *
 * `renderHook`, `act` and `fireEvent` are asynchronous in this repository. A
 * missing `await` leaves the assertions running against a hook that has not
 * settled, and the test passes for the wrong reason -- which has happened twice
 * here already.
 */
import {act, renderHook, waitFor} from "@testing-library/react-native";

import Pour, {POUR_PATTERN} from "@/library/Pour";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import {useRecipeImport} from "@/hooks/useRecipeImport";

/** A recipe as the xBloom mapper would produce it. */
function importedRecipe(xid = "ETH120"): Recipe {
    const recipe = new Recipe();
    recipe.cupType = CUP_TYPE.XPOD;
    recipe.xid = xid;
    recipe.dosage = 18;
    recipe.ratio = 16;
    recipe.grinder = true;
    recipe.grindSize = 50;
    recipe.grindRPM = 120;
    recipe.pours = [new Pour(1, 288, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0)];
    return recipe;
}

/**
 * Stands in for the network.
 *
 * `XBloomRecipe` is mocked rather than `fetch`, because what this hook cares
 * about is the recipe that comes back and the timing around it, not the
 * request body -- which `XBloomRecipe.endpoint.test.ts` already covers.
 */
const fetchRecipeDetail = jest.fn(async () => {});
const getRecipe = jest.fn<Recipe | null, []>(() => importedRecipe());

jest.mock("@/library/XBloomRecipe", () => ({
    XBloomRecipe: jest.fn().mockImplementation(() => ({
        fetchRecipeDetail,
        getRecipe,
        getName:     () => "Ethiopia Guji",
        getSubtitle: () => "Washed - Floral",
        getImageURL: () => "https://example.com/pod.png"
    }))
}));

function setup(stored: Recipe[] = []) {
    const onOpenRecipe = jest.fn();
    return {onOpenRecipe, stored};
}

beforeEach(() => {
    fetchRecipeDetail.mockReset().mockResolvedValue(undefined);
    getRecipe.mockReset().mockReturnValue(importedRecipe());
});

describe("a paste", () => {
    it("resolves and navigates without waiting to be asked", async () => {
        // Atomic: the whole value arrived in one event, chosen deliberately.
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.onChangeText("https://share-h5.xbloom.com/r?id=abc123");
        });

        await waitFor(() => expect(onOpenRecipe).toHaveBeenCalledTimes(1));
        expect(onOpenRecipe.mock.calls[0][1]).toBe(false);
    });

    it("is inferred from the size of the change, since RN has no onPaste", async () => {
        // A one-character change is typing, however valid the result.
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        for (const value of ["E", "ET", "ETH", "ETH1", "ETH12", "ETH120"]) {
            await act(async () => {
                result.current.onChangeText(value);
            });
        }

        expect(onOpenRecipe).not.toHaveBeenCalled();
    });
});

describe("a typed value", () => {
    it("shows what it found and waits to be asked", async () => {
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.resolveNow({kind: "xid", xid: "ETH120"}, "deliberate");
        });

        await waitFor(() => expect(result.current.state.status).toBe("found"));
        expect(onOpenRecipe).not.toHaveBeenCalled();
    });

    it("navigates when the panel is pressed", async () => {
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.resolveNow({kind: "xid", xid: "ETH120"}, "deliberate");
        });
        await waitFor(() => expect(result.current.state.status).toBe("found"));

        await act(async () => {
            result.current.openFound();
        });

        expect(onOpenRecipe).toHaveBeenCalledTimes(1);
    });

    it("clears the result when the text changes again", async () => {
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.resolveNow({kind: "xid", xid: "ETH120"}, "deliberate");
        });
        await waitFor(() => expect(result.current.state.status).toBe("found"));

        await act(async () => {
            result.current.onChangeText("ETH12");
        });

        expect(result.current.state.status).toBe("idle");
    });
});

describe("a recipe already in the library", () => {
    it("opens the stored one and says so", async () => {
        // `resolveOnOpen` never creates a second copy; opening the existing
        // recipe is the reveal, exactly as a card read already does.
        const existing = importedRecipe();
        const {onOpenRecipe, stored} = setup([existing]);
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.resolveNow({kind: "xid", xid: "ETH120"}, "atomic");
        });

        await waitFor(() => expect(onOpenRecipe).toHaveBeenCalledTimes(1));
        expect(onOpenRecipe.mock.calls[0][0]).toBe(existing);
        expect(onOpenRecipe.mock.calls[0][1]).toBe(true);
    });
});

describe("failure", () => {
    it("reports an unreachable server without blaming the input", async () => {
        fetchRecipeDetail.mockRejectedValueOnce(new Error("offline"));
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.resolveNow({kind: "xid", xid: "ETH120"}, "atomic");
        });

        await waitFor(() => expect(result.current.state.status).toBe("error"));
        expect(result.current.state).toMatchObject({
            reason:  "network",
            message: "Couldn't reach xBloom. Check your connection."
        });
        expect(onOpenRecipe).not.toHaveBeenCalled();
    });

    it("names the input when nothing came back, because that is where a typo lands", async () => {
        getRecipe.mockReturnValueOnce(null);
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.resolveNow({kind: "xid", xid: "ETH999"}, "atomic");
        });

        await waitFor(() => expect(result.current.state.status).toBe("error"));
        expect(result.current.state).toMatchObject({
            reason:  "notFound",
            message: "No recipe with that code."
        });
    });

    it("refuses a recipe that cannot produce card bytes", async () => {
        // This one must not be swallowed: `findDuplicate` treats a recipe whose
        // fingerprint throws as identity-less, so it would slip past
        // de-duplication and into the library.
        const broken = importedRecipe();
        broken.fingerprint = () => {
            throw new Error("bad bytes");
        };
        getRecipe.mockReturnValueOnce(broken);

        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.resolveNow({kind: "xid", xid: "ETH120"}, "atomic");
        });

        await waitFor(() => expect(result.current.state.status).toBe("error"));
        expect(result.current.state).toMatchObject({reason: "unusable"});
        expect(onOpenRecipe).not.toHaveBeenCalled();
    });
});

describe("two lookups in flight", () => {
    it("discards everything but the newest", async () => {
        // A debounce alone cannot prevent this: a resolved value can be edited
        // while its request is still running.
        let releaseFirst!: () => void;
        fetchRecipeDetail
            .mockImplementationOnce(
                () => new Promise<void>((resolve) => {
                    releaseFirst = resolve;
                })
            )
            .mockResolvedValueOnce(undefined);

        getRecipe
            .mockReturnValueOnce(importedRecipe("OLD11"))
            .mockReturnValueOnce(importedRecipe("NEW22"));

        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.resolveNow({kind: "xid", xid: "OLD11"}, "atomic");
        });
        await act(async () => {
            result.current.resolveNow({kind: "xid", xid: "NEW22"}, "atomic");
        });

        await waitFor(() => expect(onOpenRecipe).toHaveBeenCalledTimes(1));

        await act(async () => {
            releaseFirst();
        });

        expect(onOpenRecipe).toHaveBeenCalledTimes(1);
        expect(onOpenRecipe.mock.calls[0][0].xid).toBe("NEW22");
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest hooks/__tests__/useRecipeImport.test.ts
```

Expected: FAIL — `Cannot find module '@/hooks/useRecipeImport'`.

- [ ] **Step 3: Write the hook**

Create `hooks/useRecipeImport.ts`:

```ts
import {useEffect, useRef, useState} from "react";

import {resolveOnOpen} from "@/library/duplicates";
import {parseImportInput, type ImportSource} from "@/library/importInput";
import type Recipe from "@/library/Recipe";
import {XBloomRecipe} from "@/library/XBloomRecipe";

/**
 * Why a lookup failed.
 *
 * Four reasons rather than one, because "something went wrong" is not worth
 * writing. Each names the thing the reader can act on: their connection, their
 * input, or nothing at all.
 */
export type ImportErrorReason = "network" | "notFound" | "unusable";

/** What the found panel draws. Everything it needs, and nothing else. */
export type ImportPreview = {
    recipe: Recipe;
    /** The library already holds a recipe that would write the same card. */
    isExisting: boolean;
    name: string;
    subtitle: string;
    /** The pod photo, or `""`. Absent for every shared recipe. */
    imageURL: string;
};

export type ImportState =
    | {status: "idle"}
    | {status: "resolving"}
    | {status: "found"; preview: ImportPreview}
    | {status: "error"; reason: ImportErrorReason; message: string};

/**
 * Whether the value arrived whole or a character at a time.
 *
 * Atomic input navigates on its own; deliberate input waits to be asked. A
 * paste, a share intent and the tile's shortcut all deliver a complete value in
 * one event that the user chose. Typing delivers a value that is complete only
 * by guesswork -- see the debounce note in `armDebounce`.
 */
export type ImportIntent = "atomic" | "deliberate";

type Options = {
    /** The library, for de-duplication. Passed in rather than re-opened here. */
    stored: Recipe[];
    /** Navigation belongs to the screen; the timing rule belongs here. */
    onOpenRecipe: (recipe: Recipe, isExisting: boolean) => void;
};

export type RecipeImport = {
    state: ImportState;
    /** The field's text. */
    value: string;
    /** Whether the "paste a link or a code" hint is showing. */
    hint: boolean;
    /** From the field. Decides paste versus typing from the size of the change. */
    onChangeText: (next: string) => void;
    /** From a paste affordance, a share intent, or the tile shortcut. */
    resolveNow: (source: ImportSource, intent: ImportIntent) => void;
    /** Text from a paste affordance, which may or may not parse. */
    onPastedText: (text: string) => void;
    /** Open the recipe the panel is showing. */
    openFound: () => void;
    /** Back to an empty field, cancelling anything in flight. */
    reset: () => void;
};

export function useRecipeImport({stored, onOpenRecipe}: Options): RecipeImport {
    const [value, setValue] = useState("");
    const [state, setState] = useState<ImportState>({status: "idle"});
    const [hint, setHint] = useState(false);

    /**
     * Which request is the newest.
     *
     * The `AbortSignal` is not enough on its own: a request can already have
     * resolved and be queued as a microtask when it is superseded.
     */
    const generation = useRef(0);
    const inFlight = useRef<AbortController | null>(null);

    /**
     * The library, read at the moment a result lands rather than captured when
     * the lookup started -- a save can happen in between.
     */
    const storedRef = useRef(stored);
    useEffect(() => {
        storedRef.current = stored;
    }, [stored]);

    const onOpenRef = useRef(onOpenRecipe);
    useEffect(() => {
        onOpenRef.current = onOpenRecipe;
    }, [onOpenRecipe]);

    useEffect(() => () => {
        generation.current++;
        inFlight.current?.abort();
    }, []);

    async function resolve(source: ImportSource, intent: ImportIntent) {
        setHint(false);
        const mine = ++generation.current;
        inFlight.current?.abort();
        const controller = new AbortController();
        inFlight.current = controller;
        setState({status: "resolving"});

        const xb = new XBloomRecipe(source);

        try {
            await xb.fetchRecipeDetail(controller.signal);
        } catch {
            // An abort lands here too, and is caught by the generation check --
            // a superseded lookup has nothing to say.
            if (mine !== generation.current) return;
            setState({
                status:  "error",
                reason:  "network",
                message: "Couldn't reach xBloom. Check your connection."
            });
            return;
        }

        if (mine !== generation.current) return;

        const candidate = xb.getRecipe();
        if (!candidate) {
            // Named after the input rather than the server: this is where a
            // typo lands, and it is far more likely than an outage.
            setState({
                status:  "error",
                reason:  "notFound",
                message: "No recipe with that code."
            });
            return;
        }

        try {
            candidate.fingerprint();
        } catch {
            // A recipe that cannot produce card bytes must not go any further.
            // `findDuplicate` treats one whose fingerprint throws as
            // identity-less, so it would slip past de-duplication and land in
            // the library as a permanent unwritable copy.
            setState({
                status:  "error",
                reason:  "unusable",
                message: "That recipe can't be used here."
            });
            return;
        }

        const {recipe, isExisting} = resolveOnOpen(storedRef.current, candidate);

        if (intent === "atomic") {
            setState({status: "idle"});
            onOpenRef.current(recipe, isExisting);
            return;
        }

        setState({
            status:  "found",
            preview: {
                recipe,
                isExisting,
                name:     xb.getName(),
                subtitle: xb.getSubtitle(),
                imageURL: xb.getImageURL()
            }
        });
    }

    function resolveNow(source: ImportSource, intent: ImportIntent) {
        void resolve(source, intent);
    }

    function onChangeText(next: string) {
        const previous = value;
        setValue(next);
        setHint(false);

        // React Native 0.86 has no `onPaste` on `TextInput`, so a paste is
        // inferred from the size of the change: more than one character at a
        // time is a paste. A pasted link is dozens of characters and a pasted
        // pod code five or six, so the inference is never close in practice.
        // The one miss -- pasting a single character -- is treated as typing
        // and merely waits, which is why a heuristic is acceptable here.
        const pasted = next.length - previous.length > 1;
        const source = parseImportInput(next);

        if (pasted && source) {
            void resolve(source, "atomic");
            return;
        }

        // Any edit invalidates a result or an error on screen.
        generation.current++;
        inFlight.current?.abort();
        setState({status: "idle"});
    }

    function onPastedText(text: string) {
        // `getStringAsync` answers `''` for an empty clipboard and for a paste
        // the user denied, and iOS offers no way to tell them apart. Treated as
        // nothing having happened: reporting "your clipboard is empty" to
        // someone who has just denied permission would be a lie.
        if (text.trim().length === 0) return;

        setValue(text);
        const source = parseImportInput(text);
        if (source) {
            void resolve(source, "atomic");
        }
    }

    function openFound() {
        if (state.status !== "found") return;
        onOpenRef.current(state.preview.recipe, state.preview.isExisting);
    }

    function reset() {
        generation.current++;
        inFlight.current?.abort();
        setValue("");
        setHint(false);
        setState({status: "idle"});
    }

    return {state, value, hint, onChangeText, resolveNow, onPastedText, openFound, reset};
}
```

- [ ] **Step 4: Run the tests**

```bash
npx jest hooks/__tests__/useRecipeImport.test.ts
```

Expected: PASS, every case.

- [ ] **Step 5: Commit**

```bash
git add hooks/useRecipeImport.ts hooks/__tests__/useRecipeImport.test.ts
git commit -m "Resolve an import, and let the caller decide where to go

Atomic input -- a paste, a share intent, the tile shortcut -- navigates
on its own. A typed value waits to be asked, because typing has no
reliable finished signal.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 17: The two timers

Spec section 2. Both fire on typing and nowhere else, and they do different jobs:
600 ms starts a lookup for a value that parses, 2500 ms explains the format for
one that does not.

**Files:**
- Modify: `hooks/useRecipeImport.ts`
- Test: `hooks/__tests__/useRecipeImport.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `hooks/__tests__/useRecipeImport.test.ts`:

```tsx
describe("the lookup debounce", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("waits 600 ms after a parsing value is typed, then resolves", async () => {
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.onChangeText("ETH12");
        });
        expect(result.current.state.status).toBe("idle");

        await act(async () => {
            jest.advanceTimersByTime(600);
        });

        await waitFor(() => expect(result.current.state.status).toBe("found"));
        // Still does not navigate: it was typed.
        expect(onOpenRecipe).not.toHaveBeenCalled();
    });

    it("does not fire for a value that does not parse", async () => {
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.onChangeText("ETH1");
        });
        await act(async () => {
            jest.advanceTimersByTime(600);
        });

        expect(fetchRecipeDetail).not.toHaveBeenCalled();
    });

    it("restarts on each keystroke", async () => {
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.onChangeText("ETH12");
        });
        await act(async () => {
            jest.advanceTimersByTime(400);
        });
        await act(async () => {
            result.current.onChangeText("ETH120");
        });
        await act(async () => {
            jest.advanceTimersByTime(400);
        });

        expect(fetchRecipeDetail).not.toHaveBeenCalled();

        await act(async () => {
            jest.advanceTimersByTime(200);
        });
        await waitFor(() => expect(fetchRecipeDetail).toHaveBeenCalledTimes(1));
    });
});

describe("the abandonment hint", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("appears after 2500 ms on a value that does not parse", async () => {
        // The sheet is otherwise silent while idle -- there is no button to
        // press -- so without this a user whose value never parses sits in
        // front of a sheet that simply does nothing.
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.onChangeText("ETH1");
        });
        expect(result.current.hint).toBe(false);

        await act(async () => {
            jest.advanceTimersByTime(2500);
        });

        expect(result.current.hint).toBe(true);
    });

    it("says nothing before the timer, because a half-typed code is not a mistake", async () => {
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.onChangeText("ETH1");
        });
        await act(async () => {
            jest.advanceTimersByTime(2400);
        });

        expect(result.current.hint).toBe(false);
    });

    it("never appears for a value that parses", async () => {
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.onChangeText("ETH12");
        });
        await act(async () => {
            jest.advanceTimersByTime(3000);
        });

        expect(result.current.hint).toBe(false);
    });

    it("never appears for an empty field", async () => {
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.onChangeText("E");
        });
        await act(async () => {
            result.current.onChangeText("");
        });
        await act(async () => {
            jest.advanceTimersByTime(3000);
        });

        expect(result.current.hint).toBe(false);
    });

    it("clears as soon as the value parses", async () => {
        const {onOpenRecipe, stored} = setup();
        const {result} = await renderHook(() => useRecipeImport({stored, onOpenRecipe}));

        await act(async () => {
            result.current.onChangeText("ETH1");
        });
        await act(async () => {
            jest.advanceTimersByTime(2500);
        });
        expect(result.current.hint).toBe(true);

        await act(async () => {
            result.current.onChangeText("ETH12");
        });

        expect(result.current.hint).toBe(false);
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest hooks/__tests__/useRecipeImport.test.ts -t "debounce"
```

Expected: FAIL — typing never resolves, because nothing arms a timer.

- [ ] **Step 3: Add the timers**

In `hooks/useRecipeImport.ts`, add the constants below the imports:

```ts
/**
 * How long after a keystroke a parsing value is looked up.
 *
 * This cannot be a "finished typing" detector, and does not pretend to be. The
 * pod grammar is prefix-ambiguous -- `^[A-Za-z]{3}T?[0-9]{2,3}$` takes two or
 * three digits -- so `ETH12` and `ETH120` are both complete, and no timer can
 * tell "finished typing ETH12" from "paused halfway through ETH120". Pausing to
 * think is exactly when it fires.
 *
 * That is survivable only because a typed result does not navigate. A premature
 * resolve costs one wasted request and shows a name the user can see is wrong.
 * If typing is ever made to navigate, this constant becomes dangerous.
 */
const DEBOUNCE_MS = 600;

/**
 * How long a non-parsing value sits before the format is explained.
 *
 * Long, deliberately. Telling someone their half-typed code is invalid is
 * scolding them for not having finished.
 */
const ABANDONED_MS = 2500;
```

They live here rather than in `constants/motion.ts`: that module is the single
source of truth for *motion*, and a network delay is not motion.

Add the timer refs beside `generation`:

```ts
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
```

Add a helper above `resolve`:

```ts
    function clearTimers() {
        if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
        if (hintTimer.current !== null) clearTimeout(hintTimer.current);
        debounceTimer.current = null;
        hintTimer.current = null;
    }
```

Call `clearTimers()` as the first line of `resolve`, of `reset`, and in the
unmount effect:

```ts
    useEffect(() => () => {
        clearTimers();
        generation.current++;
        inFlight.current?.abort();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
```

Replace `onChangeText` in full:

```ts
    function onChangeText(next: string) {
        const previous = value;
        setValue(next);
        clearTimers();
        setHint(false);

        // React Native 0.86 has no `onPaste` on `TextInput`, so a paste is
        // inferred from the size of the change: more than one character at a
        // time is a paste. A pasted link is dozens of characters and a pasted
        // pod code five or six, so the inference is never close in practice.
        // The one miss -- pasting a single character -- is treated as typing
        // and merely waits, which is why a heuristic is acceptable here.
        const pasted = next.length - previous.length > 1;
        const source = parseImportInput(next);

        if (pasted && source) {
            void resolve(source, "atomic");
            return;
        }

        // Any edit invalidates a result or an error on screen.
        generation.current++;
        inFlight.current?.abort();
        setState({status: "idle"});

        if (source) {
            debounceTimer.current = setTimeout(() => {
                void resolve(source, "deliberate");
            }, DEBOUNCE_MS);
            return;
        }

        // Nothing to look up. If they have also stopped, explain the format --
        // the sheet has no button to press and would otherwise sit in silence.
        if (next.trim().length > 0) {
            hintTimer.current = setTimeout(() => setHint(true), ABANDONED_MS);
        }
    }
```

- [ ] **Step 4: Run the tests**

```bash
npx jest hooks/__tests__/useRecipeImport.test.ts
```

Expected: PASS, including every case from Task 16.

- [ ] **Step 5: Commit**

```bash
git add hooks/useRecipeImport.ts hooks/__tests__/useRecipeImport.test.ts
git commit -m "Look up a typed value once it settles, and explain the format once it stops

Two timers with different jobs: 600 ms starts a lookup for a value that
parses, 2500 ms explains the format for one that does not.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Phase 3 — The sheet

### Task 18: The found panel

Spec section 4. Shown only on the typed path, where it is the entire defence
against a typo — so it has to say enough for a wrong result to be recognisable at
a glance.

**Files:**
- Create: `components/ImportResult.tsx`
- Create: `components/__tests__/ImportResult.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/ImportResult.test.tsx`:

```tsx
/**
 * `render` and `fireEvent` are asynchronous in this repository. Without the
 * `await`, `screen` is empty and the test passes for the wrong reason.
 */
import {fireEvent, screen} from "@testing-library/react-native";

import ImportResult from "@/components/ImportResult";
import Pour, {POUR_PATTERN} from "@/library/Pour";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import {renderWithProviders} from "@/test-utils/render";

function preview(overrides: Partial<{name: string; subtitle: string; imageURL: string; isExisting: boolean}> = {}) {
    const recipe = new Recipe();
    recipe.cupType = CUP_TYPE.XPOD;
    recipe.dosage = 18;
    recipe.ratio = 16;
    recipe.pours = [
        new Pour(1, 100, 93, 30, 0, POUR_PATTERN.CIRCULAR, 30),
        new Pour(2, 188, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0)
    ];
    return {
        recipe,
        isExisting: false,
        name:       "Ethiopia Guji",
        subtitle:   "Washed - Floral",
        imageURL:   "https://example.com/pod.png",
        ...overrides
    };
}

it("shows enough for a wrong result to be recognised", async () => {
    await renderWithProviders(<ImportResult preview={preview()} onOpen={() => {}}/>);

    expect(await screen.findByText("Ethiopia Guji")).toBeTruthy();
    expect(await screen.findByText("Washed - Floral")).toBeTruthy();
    expect(await screen.findByText("18")).toBeTruthy();     // dose
    expect(await screen.findByText("1:16")).toBeTruthy();   // ratio
    expect(await screen.findByText("2")).toBeTruthy();      // stages
    expect(await screen.findByTestId("import-result-profile")).toBeTruthy();
});

it("shows the pod mark when there is a photo", async () => {
    await renderWithProviders(<ImportResult preview={preview()} onOpen={() => {}}/>);

    expect(await screen.findByTestId("import-result-pod")).toBeTruthy();
});

it("is silently without a mark when there is no photo", async () => {
    // "Silently hidden" is a behaviour, not an omission: a shared recipe has no
    // pod photo at all, and neither a placeholder nor a gap is acceptable.
    await renderWithProviders(
        <ImportResult preview={preview({imageURL: ""})} onOpen={() => {}}/>
    );

    expect(await screen.findByText("Ethiopia Guji")).toBeTruthy();
    expect(screen.queryByTestId("import-result-pod")).toBeNull();
});

it("says IMPORT for a new recipe", async () => {
    await renderWithProviders(<ImportResult preview={preview()} onOpen={() => {}}/>);

    expect(await screen.findByText("IMPORT")).toBeTruthy();
});

it("says OPEN, and says why, for one already in the library", async () => {
    await renderWithProviders(
        <ImportResult preview={preview({isExisting: true})} onOpen={() => {}}/>
    );

    expect(await screen.findByText("OPEN")).toBeTruthy();
    expect(await screen.findByText("Already in your library")).toBeTruthy();
});

it("hands the press upward", async () => {
    const onOpen = jest.fn();
    await renderWithProviders(<ImportResult preview={preview()} onOpen={onOpen}/>);

    await fireEvent.press(await screen.findByLabelText("Open Ethiopia Guji"));

    expect(onOpen).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest components/__tests__/ImportResult.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/ImportResult'`.

- [ ] **Step 3: Write the component**

Create `components/ImportResult.tsx`:

```tsx
import React, {useState} from "react";
import {Image} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import PourProfile from "@/components/PourProfile";
import {palette} from "@/constants/colors";
import type {ImportPreview} from "@/hooks/useRecipeImport";

/** The pod mark's diameter. Two lines of text tall, so nothing below it moves. */
const POD_SIZE = 44;
const PROFILE_WIDTH = 240;
const PROFILE_HEIGHT = 44;

type Props = {
    preview: ImportPreview;
    onOpen: () => void;
};

/**
 * What the lookup found, on the typed path.
 *
 * A picture of its props: no fetching, no timers, no subscription -- which is
 * what makes the sheet's `prewarm` safe, since a pre-warm renders this a second
 * time before it is seen.
 *
 * It says more than a name because it is the entire defence against a typo. A
 * typed value resolves without navigating precisely so that this panel can be
 * read first, and a panel showing only "Found" would make that pause worthless.
 */
export default function ImportResult({preview, onOpen}: Props) {
    const {recipe, isExisting, name, subtitle, imageURL} = preview;
    const [podLoaded, setPodLoaded] = useState(false);

    return (
        <YStack gap="$3" paddingTop="$2">
            <XStack alignItems="flex-start" gap="$3">
                <YStack flex={1} gap="$1">
                    <Text color={palette.text} fontSize={17} numberOfLines={2}>
                        {name}
                    </Text>
                    {subtitle.length > 0 && (
                        <Text color={palette.dim} fontSize={13} numberOfLines={1}>
                            {subtitle}
                        </Text>
                    )}
                </YStack>

                {/* The pod photo, when there is one. Absent for every shared
                    recipe, so there is no placeholder and no spinner: the panel
                    is only as tall as the two lines of text beside this, and
                    the layout does not lurch between a pod recipe and a shared
                    one. A failed load is indistinguishable from a recipe that
                    never had a photo, and is never reported. */}
                {imageURL.length > 0 && (
                    <Image testID="import-result-pod"
                           source={{uri: imageURL}}
                           onLoad={() => setPodLoaded(true)}
                           style={{
                               width:        POD_SIZE,
                               height:       POD_SIZE,
                               borderRadius: POD_SIZE / 2,
                               opacity:      podLoaded ? 1 : 0
                           }}/>
                )}
            </XStack>

            <PourProfile testID="import-result-profile"
                         pours={recipe.pours}
                         width={PROFILE_WIDTH} height={PROFILE_HEIGHT}
                         stroke={palette.dim} fill={palette.line}/>

            <XStack gap="$4">
                <Figure label="DOSE" value={String(recipe.dosage)}/>
                <Figure label="RATIO" value={`1:${recipe.ratio}`}/>
                <Figure label="STAGES" value={String(recipe.pours.length)}/>
            </XStack>

            {isExisting && (
                <Text color={palette.info} fontSize={13}>
                    Already in your library
                </Text>
            )}

            <XStack
                accessible
                accessibilityRole="button"
                accessibilityLabel={`Open ${name}`}
                onPress={onOpen}
                alignItems="center"
                justifyContent="center"
                paddingVertical="$3"
                borderRadius="$6"
                backgroundColor={palette.raised}
                borderWidth={1}
                borderColor={palette.line}
                pressStyle={{opacity: 0.7, scale: 0.99}}>
                {/* OPEN rather than IMPORT when it is already here: nothing is
                    being brought in, and `resolveOnOpen` never makes a copy. */}
                <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.5}
                               color={palette.text}>
                    {isExisting ? "OPEN" : "IMPORT"}
                </DotMatrixText>
            </XStack>
        </YStack>
    );
}

/** One reading: a Doto value over a small label. Module scope, not inline. */
function Figure({label, value}: {label: string; value: string}) {
    return (
        <YStack gap="$1">
            <DotMatrixText fontSize={18} weight="bold" color={palette.text}>
                {value}
            </DotMatrixText>
            <Text color={palette.muted} fontSize={11} letterSpacing={1}>
                {label}
            </Text>
        </YStack>
    );
}
```

- [ ] **Step 4: Run the tests**

```bash
npx jest components/__tests__/ImportResult.test.tsx
```

Expected: PASS. If `PourProfile` does not forward `testID`, check its props — it
takes one; pass it rather than wrapping the profile in a test-only view.

- [ ] **Step 5: Commit**

```bash
git add components/ImportResult.tsx components/__tests__/ImportResult.test.tsx
git commit -m "Show enough of a found recipe to recognise a wrong one

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 19: The sheet

Spec sections 2, 3 and 6. An `XbrwSheet` holding a field, a paste affordance, and
whichever of the four states applies. Layout only — every rule lives in the hook.

**Files:**
- Create: `components/ImportSheet.tsx`
- Create: `components/__tests__/ImportSheet.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/ImportSheet.test.tsx`:

```tsx
import {fireEvent, screen} from "@testing-library/react-native";

import ImportSheet from "@/components/ImportSheet";
import type {RecipeImport} from "@/hooks/useRecipeImport";
import Pour, {POUR_PATTERN} from "@/library/Pour";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import {renderWithProviders} from "@/test-utils/render";

/** A hook stub. The sheet is layout; every rule under test lives in the hook. */
function stubImport(overrides: Partial<RecipeImport> = {}): RecipeImport {
    return {
        state:        {status: "idle"},
        value:        "",
        hint:         false,
        onChangeText: jest.fn(),
        resolveNow:   jest.fn(),
        onPastedText: jest.fn(),
        openFound:    jest.fn(),
        reset:        jest.fn(),
        ...overrides
    };
}

function foundState() {
    const recipe = new Recipe();
    recipe.cupType = CUP_TYPE.XPOD;
    recipe.dosage = 18;
    recipe.ratio = 16;
    recipe.pours = [new Pour(1, 288, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0)];
    return {
        status:  "found" as const,
        preview: {
            recipe, isExisting: false,
            name: "Ethiopia Guji", subtitle: "Washed", imageURL: ""
        }
    };
}

it("shows the field when there is something to type into it", async () => {
    await renderWithProviders(
        <ImportSheet open onOpenChange={() => {}} showField importer={stubImport()}/>
    );

    expect(await screen.findByLabelText("Share link or pod code")).toBeTruthy();
});

it("hides the field when the value arrived whole", async () => {
    // A share intent and the tile shortcut both deliver a complete value, so
    // there is nothing to put in a field and no reason to draw one.
    await renderWithProviders(
        <ImportSheet open onOpenChange={() => {}} showField={false}
                     importer={stubImport({state: {status: "resolving"}})}/>
    );

    expect(screen.queryByLabelText("Share link or pod code")).toBeNull();
    expect(await screen.findByTestId("import-resolving")).toBeTruthy();
});

it("passes typing to the hook", async () => {
    const importer = stubImport();
    await renderWithProviders(
        <ImportSheet open onOpenChange={() => {}} showField importer={importer}/>
    );

    await fireEvent.changeText(
        await screen.findByLabelText("Share link or pod code"), "ETH120"
    );

    expect(importer.onChangeText).toHaveBeenCalledWith("ETH120");
});

it("shows an error inline, never as an alert or a toast", async () => {
    await renderWithProviders(
        <ImportSheet open onOpenChange={() => {}} showField
                     importer={stubImport({
                         state: {
                             status:  "error",
                             reason:  "notFound",
                             message: "No recipe with that code."
                         }
                     })}/>
    );

    expect(await screen.findByText("No recipe with that code.")).toBeTruthy();
});

it("explains the format once the hook says they have stopped", async () => {
    await renderWithProviders(
        <ImportSheet open onOpenChange={() => {}} showField
                     importer={stubImport({value: "ETH1", hint: true})}/>
    );

    expect(await screen.findByText("Paste an xBloom share link, or a pod code like ETH120."))
        .toBeTruthy();
});

it("shows the found panel and opens what it found", async () => {
    const importer = stubImport({state: foundState()});
    await renderWithProviders(
        <ImportSheet open onOpenChange={() => {}} showField importer={importer}/>
    );

    await fireEvent.press(await screen.findByLabelText("Open Ethiopia Guji"));

    expect(importer.openFound).toHaveBeenCalledTimes(1);
});

it("offers a paste button on a platform without the native control", async () => {
    const importer = stubImport();
    await renderWithProviders(
        <ImportSheet open onOpenChange={() => {}} showField importer={importer}/>
    );

    await fireEvent.press(await screen.findByLabelText("Paste from clipboard"));

    // `getStringAsync` is mocked to `''`, which is both an empty clipboard and
    // a denied prompt -- so the sheet hands it over and the hook says nothing.
    expect(importer.onPastedText).toHaveBeenCalledWith("");
});

it("promotes the native control when iOS has one and there is something to paste", async () => {
    // Not disguised in here, unlike the tile: this is the action the user came
    // for, and the real control means no prompt.
    (Clipboard.isPasteButtonAvailable as unknown as boolean) = true;
    (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(true);

    await renderWithProviders(
        <ImportSheet open onOpenChange={() => {}} showField importer={stubImport()}/>
    );

    await waitFor(() => expect(screen.queryByTestId("native-paste")).not.toBeNull());
    expect(screen.queryByLabelText("Paste from clipboard")).toBeNull();
});
```

The last case needs the module mocked with a rendering `ClipboardPasteButton` and
a writable `isPasteButtonAvailable`, so put this at the top of the file:

```tsx
jest.mock("expo-clipboard", () => ({
    hasStringAsync:         jest.fn(async () => false),
    getStringAsync:         jest.fn(async () => ""),
    isPasteButtonAvailable: false,
    ClipboardPasteButton:   ({testID}: {testID?: string}) => {
        const {View} = require("react-native");
        return <View testID={testID}/>;
    }
}));

beforeEach(() => {
    (Clipboard.isPasteButtonAvailable as unknown as boolean) = false;
    (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(false);
});
```

and import `waitFor` and `* as Clipboard` alongside the existing imports.

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest components/__tests__/ImportSheet.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/ImportSheet'`.

- [ ] **Step 3: Write the component**

Create `components/ImportSheet.tsx`:

```tsx
import * as Clipboard from "expo-clipboard";
import React, {useEffect, useState} from "react";
import {Input, Spinner, Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import ImportResult from "@/components/ImportResult";
import XbrwSheet from "@/components/XbrwSheet";
import {palette} from "@/constants/colors";
import type {RecipeImport} from "@/hooks/useRecipeImport";

const FIELD_LABEL = "Share link or pod code";
const FORMAT_HINT = "Paste an xBloom share link, or a pod code like ETH120.";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /**
     * Whether there is anything to type.
     *
     * False for a share intent and for the tile's paste shortcut: both deliver
     * a complete value in one event, so a field would be an empty box beside a
     * lookup already running. This is the only branch in the sheet, and it is
     * exactly the atomic/deliberate distinction that also decides whether the
     * hook navigates on its own.
     */
    showField: boolean;
    importer: RecipeImport;
};

/**
 * The one import sheet, reached from three doors.
 *
 * Layout only. Every rule about when a lookup starts, whether it navigates and
 * what is said when it fails belongs to `useRecipeImport`.
 */
export default function ImportSheet({open, onOpenChange, showField, importer}: Props) {
    const {state, value, hint, onChangeText, onPastedText, openFound} = importer;
    const [nativePaste, setNativePaste] = useState(false);

    useEffect(() => {
        if (!open || !Clipboard.isPasteButtonAvailable) {
            return;
        }
        let cancelled = false;
        // The presence check, which is silent on both platforms. Whether the
        // clipboard holds an xBloom link cannot be known without reading it,
        // and reading it is what costs a prompt -- so this only decides which
        // affordance to draw.
        void Clipboard.hasStringAsync().then((has) => {
            if (!cancelled) setNativePaste(has);
        });
        return () => {
            cancelled = true;
        };
    }, [open]);

    async function paste() {
        // Contents are read only here, on a tap the user just made. Reading on
        // open would prompt on iOS every single time the sheet was opened,
        // including the times someone came to type a pod code.
        onPastedText(await Clipboard.getStringAsync());
    }

    return (
        <XbrwSheet open={open} onOpenChange={onOpenChange} title="Import" prewarm>
            <YStack gap="$3" paddingHorizontal="$4" paddingBottom="$4">
                {showField && (
                    <>
                        <Input
                            accessibilityLabel={FIELD_LABEL}
                            placeholder={FIELD_LABEL}
                            placeholderTextColor={palette.muted}
                            value={value}
                            onChangeText={onChangeText}
                            autoCapitalize="characters"
                            autoCorrect={false}
                            autoFocus
                            backgroundColor={palette.raised}
                            borderColor={palette.line}
                            color={palette.text}/>

                        {/* Not disguised, unlike the tile: in here the paste is
                            the action the user came for, so it says so. On iOS
                            16+ with something to paste it is the real system
                            control, promoted to the primary action -- which
                            also means no prompt. Everywhere else it is a house
                            button calling `getStringAsync`, where Android's
                            system toast fires on a tap the user just made. */}
                        {nativePaste ? (
                            <Clipboard.ClipboardPasteButton
                                testID="native-paste"
                                displayMode="iconAndLabel"
                                cornerStyle="capsule"
                                backgroundColor={palette.raised}
                                foregroundColor={palette.text}
                                onPress={({text}) => onPastedText(text ?? "")}
                                style={{height: 48, width: "100%"}}/>
                        ) : (
                            <XStack
                                accessible
                                accessibilityRole="button"
                                accessibilityLabel="Paste from clipboard"
                                onPress={paste}
                                alignItems="center"
                                justifyContent="center"
                                paddingVertical="$3"
                                borderRadius="$6"
                                backgroundColor={palette.raised}
                                borderWidth={1}
                                borderColor={palette.line}
                                pressStyle={{opacity: 0.7, scale: 0.99}}>
                                <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.5}
                                               color={palette.text}>
                                    PASTE
                                </DotMatrixText>
                            </XStack>
                        )}
                    </>
                )}

                {state.status === "resolving" && (
                    <XStack testID="import-resolving" alignItems="center" gap="$3"
                            paddingVertical="$3">
                        <Spinner color={palette.dim}/>
                        <Text color={palette.dim} fontSize={14}>Looking it up…</Text>
                    </XStack>
                )}

                {state.status === "error" && (
                    // Inline, under the field that caused it. The sheet is
                    // already open and holding the input, so this is where the
                    // reader is looking -- and the app's vocabulary has no
                    // native alert in it.
                    <Text color={palette.danger} fontSize={13}
                          accessibilityLiveRegion="polite">
                        {state.message}
                    </Text>
                )}

                {/* Guidance, not a validation failure, and deliberately not in
                    `danger`: nobody has done anything wrong, they have stopped.
                    Polite so a screen reader picks it up without interrupting. */}
                {hint && state.status === "idle" && (
                    <Text color={palette.dim} fontSize={13}
                          accessibilityLiveRegion="polite">
                        {FORMAT_HINT}
                    </Text>
                )}

                {state.status === "found" && (
                    <ImportResult preview={state.preview} onOpen={openFound}/>
                )}
            </YStack>
        </XbrwSheet>
    );
}
```

- [ ] **Step 4: Run the tests**

```bash
npx jest components/__tests__/ImportSheet.test.tsx && npm run lint
```

Expected: PASS and a clean lint.

- [ ] **Step 5: Commit**

```bash
git add components/ImportSheet.tsx components/__tests__/ImportSheet.test.tsx
git commit -m "One import sheet, with every rule left in the hook

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Phase 4 — The tile

### Task 20: The paste-through import tile

Spec section 6. On iOS 16+ with text on the clipboard, the `IMPORT` tile is a
disguised `UIPasteControl`: one tap pastes, and a value that parses starts
resolving immediately. Everywhere else, and for a screen reader, it is an
ordinary pressable.

This is a disguised system privacy control and **may be rejected on review**. It
was adopted with that understood; the remedy is one line — force plain mode — and
every other path already works without it.

**Files:**
- Create: `components/ImportTile.tsx`
- Create: `components/__tests__/ImportTile.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/ImportTile.test.tsx`:

```tsx
import {fireEvent, screen, waitFor} from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import {AccessibilityInfo} from "react-native";

import ImportTile from "@/components/ImportTile";
import {renderWithProviders} from "@/test-utils/render";

jest.mock("expo-clipboard", () => ({
    hasStringAsync:         jest.fn(async () => false),
    getStringAsync:         jest.fn(async () => ""),
    isPasteButtonAvailable: true,
    ClipboardPasteButton:   ({onPress}: {onPress: (d: {text?: string}) => void}) => {
        const {Pressable, Text} = require("react-native");
        return (
            <Pressable testID="native-paste-control"
                       onPress={() => onPress({text: "ETH120"})}>
                <Text>Paste</Text>
            </Pressable>
        );
    }
}));

beforeEach(() => {
    (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, "isScreenReaderEnabled").mockResolvedValue(false);
});

it("is a plain button when the clipboard is empty", async () => {
    // `ClipboardPasteButton` disables itself when there is nothing conformant
    // to paste, so a disguised one would be dead furniture.
    await renderWithProviders(<ImportTile onOpen={() => {}} onPasted={() => {}}/>);

    expect(await screen.findByLabelText("Import a recipe")).toBeTruthy();
    expect(screen.queryByTestId("native-paste-control")).toBeNull();
});

it("becomes a paste control when the clipboard holds text", async () => {
    (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(true);

    await renderWithProviders(<ImportTile onOpen={() => {}} onPasted={() => {}}/>);

    await waitFor(() =>
        expect(screen.queryByTestId("native-paste-control")).not.toBeNull()
    );
});

it("hands the pasted text upward", async () => {
    (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(true);
    const onPasted = jest.fn();

    await renderWithProviders(<ImportTile onOpen={() => {}} onPasted={onPasted}/>);
    await waitFor(() =>
        expect(screen.queryByTestId("native-paste-control")).not.toBeNull()
    );

    await fireEvent.press(screen.getByTestId("native-paste-control"));

    expect(onPasted).toHaveBeenCalledWith("ETH120");
});

it("stays a plain button under a screen reader", async () => {
    // The native control announces itself as "Paste" whatever is drawn over it,
    // so a screen reader user would hear a label contradicting the screen. The
    // shortcut is a sighted convenience; what is announced stays honest.
    (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(true);
    (AccessibilityInfo.isScreenReaderEnabled as jest.Mock).mockResolvedValue(true);

    await renderWithProviders(<ImportTile onOpen={() => {}} onPasted={() => {}}/>);

    expect(await screen.findByLabelText("Import a recipe")).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId("native-paste-control")).toBeNull());
});

it("opens the sheet when pressed in plain mode", async () => {
    const onOpen = jest.fn();
    await renderWithProviders(<ImportTile onOpen={onOpen} onPasted={() => {}}/>);

    await fireEvent.press(await screen.findByLabelText("Import a recipe"));

    expect(onOpen).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest components/__tests__/ImportTile.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/ImportTile'`.

- [ ] **Step 3: Write the component**

Create `components/ImportTile.tsx`:

```tsx
import * as Clipboard from "expo-clipboard";
import React, {useEffect, useState} from "react";
import {AccessibilityInfo, AppState, Platform} from "react-native";
import {YStack} from "tamagui";

import CtaTile from "@/components/CtaTile";
import {palette} from "@/constants/colors";
import {useFocusEffect} from "expo-router";

/**
 * The `IMPORT` tile, and its iOS paste shortcut.
 *
 * Wraps `CtaTile` rather than changing it: `CtaTile` is shared with `READ CARD`
 * and should not learn about clipboards.
 *
 * On iOS 16+ with text on the clipboard the tile is a `UIPasteControl` coloured
 * to disappear into itself, so one tap pastes and -- if the value parses --
 * starts resolving, with no prompt, because with that control the tap *is* the
 * consent. Everywhere else it is an ordinary pressable that opens the sheet.
 *
 * `hasStringAsync` reports that text exists, not that it is an xBloom link, so
 * most taps in paste mode will hand over something irrelevant. Every one of
 * those degrades to exactly what the tile would have done anyway: the sheet
 * opens, with an empty field. That fallback is what makes the shortcut safe.
 *
 * Recorded risk: this is a disguised system privacy control and Apple may
 * reject it. The remedy is to force `pasteMode` false, and nothing else breaks.
 */
type Props = {
    /** Open the sheet with an empty field. */
    onOpen: () => void;
    /** Text from the paste control, which may or may not parse. */
    onPasted: (text: string) => void;
};

export default function ImportTile({onOpen, onPasted}: Props) {
    const [pasteMode, setPasteMode] = useState(false);

    useEffect(() => {
        let cancelled = false;

        async function decide() {
            if (Platform.OS !== "ios" || !Clipboard.isPasteButtonAvailable) {
                return;
            }
            // The presence check is the silent one on both platforms. Reading
            // contents here would prompt.
            const [hasText, screenReader] = await Promise.all([
                Clipboard.hasStringAsync(),
                AccessibilityInfo.isScreenReaderEnabled()
            ]);
            if (!cancelled) setPasteMode(hasText && !screenReader);
        }

        void decide();

        // The clipboard changes behind the app's back, so the answer is stale
        // the moment it is computed. Re-asked on foreground, and on focus by
        // the effect below.
        const subscription = AppState.addEventListener("change", (next) => {
            if (next === "active") void decide();
        });

        return () => {
            cancelled = true;
            subscription.remove();
        };
    }, []);

    useFocusEffect(
        React.useCallback(() => {
            if (Platform.OS !== "ios" || !Clipboard.isPasteButtonAvailable) return;
            let cancelled = false;
            void (async () => {
                const [hasText, screenReader] = await Promise.all([
                    Clipboard.hasStringAsync(),
                    AccessibilityInfo.isScreenReaderEnabled()
                ]);
                if (!cancelled) setPasteMode(hasText && !screenReader);
            })();
            return () => {
                cancelled = true;
            };
        }, [])
    );

    if (!pasteMode) {
        return (
            <CtaTile icon="import" label="IMPORT"
                     accessibilityLabel="Import a recipe" onPress={onOpen}/>
        );
    }

    return (
        <YStack flex={1}>
            {/* A pressable stays underneath: if the control ever fails to
                mount, the tile opens the sheet rather than becoming dead
                furniture. */}
            <CtaTile icon="import" label="IMPORT"
                     accessibilityLabel="Import a recipe" onPress={onOpen}/>

            {/* Coloured to the tile rather than zeroed in opacity. An
                opacity-zero control is far more likely to be treated as hidden
                by UIKit than one that is merely the same colour as what is
                behind it. `iconOnly`, so there is no system label to bleed
                through the tile's own. */}
            <Clipboard.ClipboardPasteButton
                testID="native-paste-control"
                displayMode="iconOnly"
                cornerStyle="capsule"
                backgroundColor={palette.raised}
                foregroundColor={palette.raised}
                onPress={({text}) => {
                    // Empty means an empty clipboard or a denied paste, and iOS
                    // gives no way to tell them apart. Either way, open the
                    // sheet as a plain tap would have.
                    if (!text || text.trim().length === 0) {
                        onOpen();
                        return;
                    }
                    onPasted(text);
                }}
                style={{
                    position: "absolute",
                    left:     0,
                    right:    0,
                    top:      0,
                    bottom:   0
                }}/>
        </YStack>
    );
}
```

- [ ] **Step 4: Run the tests**

```bash
npx jest components/__tests__/ImportTile.test.tsx
```

Expected: PASS. The two focus/foreground paths duplicate their body; if lint
objects, hoist it to a module-scope `async function clipboardMode()` returning
the boolean and call it from both.

- [ ] **Step 5: Commit**

```bash
git add components/ImportTile.tsx components/__tests__/ImportTile.test.tsx
git commit -m "Let the import tile paste, on iOS, when there is something to paste

A disguised UIPasteControl: one tap from the home screen to the editor,
with no prompt, because with that control the tap is the consent. Falls
back to a plain tile on Android, iOS 15, an empty clipboard, and under a
screen reader -- where the native label would contradict the screen.

Recorded risk: Apple may reject a disguised privacy control. The remedy
is to force plain mode; nothing else depends on it.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Phase 5 — Wiring and delivery

### Task 21: Wire the home screen, and delete the old dialog

Spec section 5. The screen gains very little, which is the point — it stays
layout.

**Files:**
- Modify: `app/index.tsx`
- Delete: `components/ImportRecipeComponent.tsx`
- Delete: `components/__tests__/ImportRecipeComponent.test.tsx` (if it exists)
- Test: `app/__tests__/index.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `app/__tests__/index.test.tsx`:

```tsx
describe("import", () => {
    it("opens the sheet from the tile", async () => {
        await renderHome();

        await fireEvent.press(await screen.findByLabelText("Import a recipe"));

        expect(await screen.findByLabelText("Share link or pod code")).toBeTruthy();
    });

    it("opens the sheet already resolving when a share intent arrives", async () => {
        // A share intent carries an id and nothing to type. It is the atomic
        // case: it resolves and navigates without asking. The sheet still opens
        // so that a share into a slow network is acknowledged rather than
        // appearing to do nothing.
        await renderHome({
            shareIntent: {type: "weburl", webUrl: "https://share-h5.xbloom.com/r?id=abc123"}
        });

        expect(await screen.findByTestId("import-resolving")).toBeTruthy();
        expect(screen.queryByLabelText("Share link or pod code")).toBeNull();
    });

    it("ignores a shared URL that is not an xBloom link", async () => {
        await renderHome({shareIntent: {type: "weburl", webUrl: "https://example.com/"}});

        expect(screen.queryByTestId("import-resolving")).toBeNull();
    });
});
```

Follow the file's existing helpers for rendering the home screen and for stubbing
`useShareIntentContext` — read the top of the file and reuse them. If the file has
no share-intent stub yet, add one modelled on the module mock it already uses for
`expo-router`.

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest app/__tests__/index.test.tsx -t "import"
```

Expected: FAIL — the tile is `disabled`, so nothing opens.

- [ ] **Step 3: Replace the state**

In `app/index.tsx`, delete:

```tsx
    const [importId, setImportId] = useState<string | null>(null);
```

and add, below `const isEmpty = ...`:

```tsx
    // `importId` used to do double duty -- "is the sheet open" and "what to
    // import" -- which is why `""` meant open-with-nothing and `null` meant
    // closed. Two questions, two answers.
    const [importOpen, setImportOpen] = useState(false);
    const [importShowField, setImportShowField] = useState(true);

    const importer = useRecipeImport({
        stored:       library.recipes,
        onOpenRecipe: (recipe, isExisting) => {
            setImportOpen(false);
            if (isExisting) {
                // The same words a card read already uses when it turns out the
                // library has this one. `resolveOnOpen` never makes a copy, so
                // opening the existing recipe is the whole reveal.
                notify({tone: "info", message: "Already in your library"});
            }
            openRecipe(recipe);
        }
    });
```

Add the imports:

```tsx
import ImportSheet from "@/components/ImportSheet";
import ImportTile from "@/components/ImportTile";
import {notify} from "@/components/XbrwToast";
import {useRecipeImport} from "@/hooks/useRecipeImport";
import {parseImportInput} from "@/library/importInput";
```

and remove the `ImportRecipeComponent` import.

- [ ] **Step 4: Hand the share intent to the parser**

Replace the share-intent effect:

```tsx
    useEffect(() => {
        if (!hasShareIntent || shareIntent.type !== "weburl" || !shareIntent.webUrl) {
            return;
        }
        // The screen no longer knows what an xBloom link looks like. One module
        // does, and it is the same one the field uses -- two that had to agree
        // eventually would not.
        const source = parseImportInput(shareIntent.webUrl);
        if (source) {
            // Reacting to an inbound share intent — an external system pushing
            // into React, which is what effects are for.
            /* eslint-disable react-hooks/set-state-in-effect */
            setImportShowField(false);
            setImportOpen(true);
            /* eslint-enable react-hooks/set-state-in-effect */
            importer.resolveNow(source, "atomic");
        }
        resetShareIntent();
        // `importer` is rebuilt every render; depending on it would re-run this
        // on every render instead of on every intent.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasShareIntent, shareIntent, resetShareIntent]);
```

- [ ] **Step 5: Replace the tile and enable the header glyph**

```tsx
                        <CtaTile icon="scan" label="READ CARD"
                                 accessibilityLabel="Read a card" onPress={readCard}/>
                        <ImportTile
                            onOpen={() => {
                                setImportShowField(true);
                                setImportOpen(true);
                            }}
                            onPasted={(text) => {
                                const source = parseImportInput(text);
                                // A value that does not parse is not put in the
                                // field: the sheet opens exactly as a plain tap
                                // would have, and the user cannot tell the two
                                // apart.
                                setImportShowField(source === null);
                                setImportOpen(true);
                                if (source) importer.resolveNow(source, "atomic");
                            }}/>
```

In the `HomeHeader` call, change `canImport={false}` to `canImport` and its
`onImport` to:

```tsx
                    onImport={() => {
                        setImportShowField(true);
                        setImportOpen(true);
                    }}
```

- [ ] **Step 6: Mount the sheet**

Replace the `{importId !== null && (...)}` block with:

```tsx
            <ImportSheet
                open={importOpen}
                showField={importShowField}
                importer={importer}
                onOpenChange={(open) => {
                    setImportOpen(open);
                    if (!open) {
                        importer.reset();
                        library.refresh();
                    }
                }}/>
```

The sheet is always mounted so it can pre-warm. `XbrwSheet` owns the open state
from here.

- [ ] **Step 7: Delete the dialog**

```bash
git rm components/ImportRecipeComponent.tsx
git rm --ignore-unmatch components/__tests__/ImportRecipeComponent.test.tsx
grep -rn "ImportRecipeComponent" --include=*.ts --include=*.tsx .
```

Expected: no matches. The `setTimeout(..., 0)` iOS modal-race dodge and the
second `RecipeDatabase` both go with it — the sheet needs neither.

- [ ] **Step 8: Run everything**

```bash
npm run typecheck && npm run lint && npm test
```

Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add app/index.tsx components/ app/__tests__/index.test.tsx
git commit -m "Wire import to the tile, the glyph and a share intent

Three doors, one sheet, one state machine. The old Dialog goes, and
with it the setTimeout that dodged an iOS modal race and the second
RecipeDatabase it opened to de-duplicate against.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 22: Prebuild and verify on hardware

Spec section 8. `expo-clipboard` is a native module, so this sub-project cannot
ship from a JS-only update.

- [ ] **Step 1: Regenerate the native projects**

```bash
cd /Users/jesperhessius/Dev/xbrw-sp5-import
npx expo prebuild --clean
```

`ios/` and `android/` are generated and gitignored, so nothing here is committed.
If this fails, fix `app.json` — never hand-edit the generated projects.

- [ ] **Step 2: Confirm the version bump went in**

```bash
grep -n '"version"' app.json
```

Expected: the value raised in Task 13.

- [ ] **Step 3: Build to a physical iPhone**

```bash
npm run ios -- --device
```

- [ ] **Step 4: Walk the iOS checklist**

Tick each:

- [ ] Copy an xBloom share link. The `IMPORT` tile shows no visible paste
      control — no border, no system material, no tint. Tap it: it pastes with
      **no prompt**, the sheet appears already resolving, and the editor opens.
- [ ] Copy an unrelated message. Tap `IMPORT`: the sheet opens with an **empty**
      field, indistinguishable from a plain open.
- [ ] Copy **rich text from Safari** (HTML, no plain text), so the clipboard has
      text but nothing conforming to `plain-text`/`url`. Tap `IMPORT`: the sheet
      still opens. If the disabled `UIPasteControl` swallows the tap and the tile
      does nothing, **force plain mode** — the wrapper fallback only covers a
      control that renders nothing, not one that renders inactive.
- [ ] Clear the clipboard. Tap `IMPORT`: a plain tile, the sheet opens.
- [ ] Turn VoiceOver on. The tile announces "Import a recipe", not "Paste", and
      tapping it opens the sheet.
- [ ] Inside the sheet, use the visible `PASTE` button on a fresh install. The
      "Allow Paste?" prompt appears. **Allow**: the value lands and resolves.
- [ ] Repeat and **Deny**: nothing happens. No error, no state change, focus
      stays in the field.
- [ ] Type `ETH120` slowly. It resolves after the pause and shows the panel, and
      does **not** navigate until the panel is pressed.
- [ ] Type `ETH1` and stop. After roughly two and a half seconds the format hint
      appears, in grey. Type another digit: it clears.
- [ ] Share an xBloom link from Safari. The sheet opens showing only the fetching
      state — no field — then the editor.

- [ ] **Step 5: Build to a physical Android device**

```bash
npm run android
```

- [ ] **Step 6: Walk the Android checklist**

- [ ] The `IMPORT` tile is a plain tile, always. No paste control.
- [ ] The sheet's `PASTE` button reads the clipboard and shows the system
      "pasted from…" toast — on a tap the user just made, which is where it
      belongs.
- [ ] With TalkBack on and the sheet open, swiping does not reach the recipe list
      behind it.

- [ ] **Step 7: Record the result**

Nothing is committed by this task. Carry the outcome into the PR description in
Task 23 — including anything that failed.

If the disguised control is visible, has a border, or swallows the tap in a way
that breaks the fallback, **force plain mode** rather than fighting it: in
`components/ImportTile.tsx`, make the `decide()` body `setPasteMode(false)` and
note it in the PR. Every other path already works without it.

---

### Task 23: Open the pull request

- [ ] **Step 1: Final gates**

```bash
cd /Users/jesperhessius/Dev/xbrw-sp5-import
npm run typecheck && npm run lint && npm test && npx expo-doctor
```

Expected: all four green. expo-doctor is a hard failure in CI.

- [ ] **Step 2: Confirm the card format is untouched**

```bash
git diff origin/main --stat -- library/__tests__/ library/Recipe.ts library/NFC.ts library/Pour.ts
```

Expected: nothing but `library/Recipe.ts` unchanged and no diff at all to
`library/__tests__/cardFixtures.ts` or the characterisation tests. **A diff to
those files in this sub-project is a mistake** — investigate before pushing.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin sp5-import
gh pr create --title "Import, rebuilt" --milestone "5. Import" --body-file - <<'EOF'
Sub-project 5 of the UI overhaul. One import sheet, reached from three doors,
that accepts an xBloom share link or a bare pod code and hands the recipe to the
editor unsaved.

Design: `docs/superpowers/specs/2026-08-25-import-overhaul-design.md`
Plan: `docs/superpowers/plans/2026-08-25-import-overhaul.md`

## What changed

- `library/importInput.ts` — the one place that knows what an xBloom link looks
  like. `app/index.tsx` used to know it too.
- `library/XBloomRecipe.ts` — told which endpoint rather than guessing from
  `id.length <= 7`, which sent a short share id to the pod endpoint. Takes an
  `AbortSignal`.
- `hooks/useRecipeImport.ts` — the state machine. A paste, a share intent and the
  tile shortcut navigate on their own; a typed value resolves and waits to be
  asked, because typing has no reliable "finished" signal.
- `components/ImportSheet.tsx`, `ImportResult.tsx`, `ImportTile.tsx`.
- `components/ImportRecipeComponent.tsx` deleted, and with it a `setTimeout(…, 0)`
  that dodged an iOS modal race and a second `RecipeDatabase` handle.

## Card safety

**No change to the card path.** `Recipe.getData` / `parseData`, the CRC, block
addressing and `library/NFC.ts` are untouched, and there is no diff to
`library/__tests__/cardFixtures.ts` or the characterisation tests. This is the
one sub-project where the genuine-card constraint does not bind.

## Native

`expo-clipboard` is new, so `expo.version` is bumped and this needs a prebuild.
It cannot ship as a JS-only update.

## Reviewer, please look hardest at

**The disguised paste control.** On iOS 16+ with text on the clipboard, the
`IMPORT` tile is a `UIPasteControl` coloured to `palette.raised` on
`palette.raised` with the tile's own icon and label over it. One tap pastes with
no prompt, because with that control the tap is the consent.

This is a disguised system privacy control and Apple may reject it. It was
adopted with that understood. Three mitigations are built in: a screen reader
gets a plain tile, since the native control announces "Paste" regardless of what
is drawn over it; a plain pressable stays underneath so a failed mount is not
dead furniture; and any pasted value that does not parse opens the sheet with an
empty field, indistinguishable from a plain tap. The remedy if it is rejected is
one line — force plain mode — and no other path depends on it.

**The paste-versus-typing heuristic.** RN 0.86 has no `onPaste`, so a paste is
inferred from a change of more than one character. The 600 ms debounce is not a
"finished typing" detector and cannot be: the pod grammar is prefix-ambiguous, so
`ETH12` and `ETH120` are both complete. That is survivable only because a typed
result does not navigate. If typing is ever made to navigate, the timer becomes
dangerous — there is a comment saying so on the constant.

## Verification

Device checklist from Task 22 of the plan, on a physical iPhone and a physical
Android device: [paste the result here, including anything that failed].
EOF
```

- [ ] **Step 4: Watch CI**

```bash
gh pr checks --watch
```

Expected: "Typecheck, lint and test" SUCCESS.

- [ ] **Step 5: Create the milestone's issues if any work was deferred**

If the device checklist turned up something that was not fixed — the disguised
control forced to plain mode, say — open an issue against milestone
"5. Import" describing what remains, rather than leaving it only in the PR body.

---

## What this plan does not do

- **No change to the card format.** `Recipe.getData` / `parseData`, the CRC and
  the block addressing are untouched by Phase 1 onward. Phase 0 changes
  `library/NFC.ts`, but only session lifecycle.
- **No recipe images beyond the transient pod mark.** Deferred programme-wide:
  `imagePath` exists only for pod recipes, is never written to the card, and
  `Recipe` has no field for it.
- **No import history, no recents, no QR scanning, no bulk import.**

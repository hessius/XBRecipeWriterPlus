# Create a Recipe From Scratch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third home-screen call to action that asks coffee or tea, then opens the existing editor on a blank recipe with sensible presets.

**Architecture:** The domain layer gains a blank-recipe factory and an opening-stage method on `Recipe`. A new `NewRecipeSheet` asks the one question the editor cannot ask later, because the editor deliberately hides the cup-type row on tea. The home screen owns the sheet beside the existing import sheet and funnels every new recipe through the existing `openRecipe()`, which also becomes the single place the accent is assigned — fixing a colour change on save that affects card reads and imports today.

**Tech Stack:** Expo SDK 57, React Native, TypeScript, Tamagui, expo-router, Jest + `@testing-library/react-native` v14.

**Spec:** `docs/superpowers/specs/2026-09-14-create-recipe-design.md`

**Branch:** `create-recipe` (already cut from `main` at `8d17093`)

---

## Conventions you must follow

These are house rules in this repository. Breaking them fails lint, fails review, or silently breaks tests.

- **Colour comes only from `constants/colors.ts`.** No hex literals and no named CSS colours anywhere in `app/` or `components/`.
- **`render`, `fireEvent` and `renderHook` are asynchronous** in this repo's RNTL v14 setup. Forget the `await` and `screen` stays empty and the test passes for the wrong reason.
- **Always render component tests through `renderWithProviders`** from `@/test-utils/render` — it supplies the Tamagui and SafeArea providers.
- **RNTL v14 has removed `UNSAFE_getAllByType` and `root.findAllByType`.** Assert on rendered text, test IDs and accessible labels, never on a child component's props.
- **The React Compiler is on.** Do not hand-write `useMemo` or `useCallback`.
- **Recipes are mutated in place** and a `key` counter is bumped to re-render. Do not clone into state.
- **Import with the `@/` alias**, which maps to the repo root.
- Indentation is 4 spaces. Object literals in this codebase align their values; match the surrounding file.

Run a single test file with `npx jest path/to/file.test.ts`, and a single test with `-t "name"`.

---

## File structure

**Created**

| File | Responsibility |
| --- | --- |
| `library/newRecipe.ts` | Builds a blank coffee or tea `Recipe`. Presets live here and nowhere else. |
| `library/__tests__/newRecipe.test.ts` | Tests for the above. |
| `components/NewRecipeSheet.tsx` | The two-door chooser. Holds no state. |
| `components/__tests__/NewRecipeSheet.test.tsx` | Tests for the above. |

**Modified**

| File | Change |
| --- | --- |
| `library/accent.ts` | Gains `accentsInUseAmong` and `assignAccent`. |
| `library/RecipeDatabase.ts` | `insertRecipe` and `updateRecipe` use `assignAccent`; private `accentsInUse` deleted. |
| `library/Recipe.ts` | Gains `addOpeningPour()`. |
| `hooks/useRecipeEditor.ts` | `addPour` routes to `addOpeningPour` on an empty recipe. |
| `app/index.tsx` | `openRecipe` assigns the accent; third CTA tile; owns `NewRecipeSheet`. |
| `app/editRecipe.tsx` | Comment above ADD STAGE corrected. |
| `components/HomeHeader.tsx` | Third slide action; `SLIDE_WIDTH` to `TOUCH_TARGET * 3`. |
| `components/EmptyLibrary.tsx` | Copy names three actions. |
| `constants/dotIcons.ts` | Two comments about the plus glyph rewritten. |
| `app.json` | Version to `1.6.0`. |
| `app/__tests__/native-config.test.ts` | Version pin and its reasoning updated. |

---

## Task 1: Share the accent rule out of the database

**Why:** `RecipeDatabase.accentsInUse` is private, so the home screen cannot apply the same rule to the in-memory library. Moving it lets both use one definition. Nothing behaves differently yet.

**Files:**
- Modify: `library/accent.ts`
- Modify: `library/RecipeDatabase.ts:188-201`
- Test: `library/__tests__/accent.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `library/__tests__/accent.test.ts`. Add `accentsInUseAmong` and `assignAccent` to the existing `@/library/accent` import at the top of the file.

```ts
describe("accentsInUseAmong", () => {
    it("counts only the recipe's own half of the palette", () => {
        const subject = recipeWithCup(CUP_TYPE.OMNI);

        const coffee = recipeWithCup(CUP_TYPE.OMNI);
        coffee.accentIndex = 2;
        const tea = recipeWithCup(CUP_TYPE.TEA);
        tea.accentIndex = 3;

        expect(accentsInUseAmong(subject, [coffee, tea])).toEqual([2]);
    });

    it("does not count the recipe against itself", () => {
        const subject = recipeWithCup(CUP_TYPE.OMNI);
        subject.accentIndex = 5;

        expect(accentsInUseAmong(subject, [subject])).toEqual([]);
    });

    it("ignores recipes that have no index yet", () => {
        const subject = recipeWithCup(CUP_TYPE.OMNI);
        const unsaved = recipeWithCup(CUP_TYPE.OMNI);

        expect(accentsInUseAmong(subject, [unsaved])).toEqual([]);
    });

    it("keeps repeats, because a repeat is what makes an index more used", () => {
        const subject = recipeWithCup(CUP_TYPE.OMNI);
        const first = recipeWithCup(CUP_TYPE.OMNI);
        first.accentIndex = 1;
        const second = recipeWithCup(CUP_TYPE.OMNI);
        second.accentIndex = 1;

        expect(accentsInUseAmong(subject, [first, second])).toEqual([1, 1]);
    });
});

describe("assignAccent", () => {
    it("gives an unassigned recipe the least-used index in its half", () => {
        const subject = recipeWithCup(CUP_TYPE.OMNI);
        const taken = recipeWithCup(CUP_TYPE.OMNI);
        taken.accentIndex = 0;

        assignAccent(subject, [taken]);

        expect(subject.accentIndex).toBe(1);
    });

    it("leaves a valid index alone, so it can be called twice", () => {
        const subject = recipeWithCup(CUP_TYPE.OMNI);
        const taken = recipeWithCup(CUP_TYPE.OMNI);
        taken.accentIndex = 0;

        assignAccent(subject, [taken]);
        const first = subject.accentIndex;
        assignAccent(subject, [taken]);

        expect(subject.accentIndex).toBe(first);
    });

    it("gives a tea recipe an index inside the shorter tea half", () => {
        const subject = recipeWithCup(CUP_TYPE.TEA);

        assignAccent(subject, []);

        expect(subject.accentIndex).toBeLessThan(accents.tea.length);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest library/__tests__/accent.test.ts`
Expected: FAIL — `accentsInUseAmong is not a function` and `assignAccent is not a function`.

- [ ] **Step 3: Add the two functions**

Append to `library/accent.ts`:

```ts
/**
 * The accent indices already taken in a recipe's half of the palette.
 *
 * Only the same half counts: the coffee library is larger, and letting its
 * indices into the tea tally would skew tea towards colours nothing uses. The
 * recipe is excluded from its own tally, or it would count as competition for
 * the colour it already holds.
 *
 * Repeats are kept deliberately — a repeated index is what makes a colour more
 * used than another, which is the whole input to `nextAccentIndex`.
 *
 * Takes the candidates rather than reading them, so the home screen can pass
 * the library it already holds in memory and the database can pass the table.
 */
export function accentsInUseAmong(recipe: Recipe, others: Recipe[]): number[] {
    const group = accentGroupFor(recipe);
    return others
        .filter((other) => other.uuid !== recipe.uuid &&
                           accentGroupFor(other) === group)
        .map((other) => other.accentIndex)
        .filter((index): index is number => typeof index === "number");
}

/**
 * Settle a recipe's accent against the company it keeps.
 *
 * Idempotent: `reassignIfCrossed` returns an existing index unchanged when it
 * is valid for the recipe's group, so this can be called on the way into the
 * editor and again on save without the colour moving. That is the point of it —
 * the colour the user edits under is the colour the library row gets.
 */
export function assignAccent(recipe: Recipe, others: Recipe[]): void {
    recipe.accentIndex = reassignIfCrossed(recipe, accentsInUseAmong(recipe, others));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest library/__tests__/accent.test.ts`
Expected: PASS.

- [ ] **Step 5: Point the database at the shared rule**

In `library/RecipeDatabase.ts`, delete the whole private `accentsInUse` method (the doc comment and the method, currently the last member of the class). It has **two** callers, and both become `assignAccent`.

In `insertRecipe`, change:

```ts
            recipe.accentIndex = reassignIfCrossed(recipe, this.accentsInUse(recipe));
```

to:

```ts
            assignAccent(recipe, this.retrieveAllRecipes() ?? []);
```

In `updateRecipe`, change:

```ts
            updatedRecipe.accentIndex =
                reassignIfCrossed(updatedRecipe, this.accentsInUse(updatedRecipe));
```

to:

```ts
            assignAccent(updatedRecipe, this.retrieveAllRecipes() ?? []);
```

These are exactly equivalent: `assignAccent` is `accentIndex = reassignIfCrossed(recipe, accentsInUseAmong(recipe, others))`, and the deleted `accentsInUse(recipe)` was `accentsInUseAmong(recipe, this.retrieveAllRecipes() ?? [])`. `accentsInUseAmong` excludes the recipe from its own tally, which is what made `updateRecipe` safe on a recipe already in the table — keep that in mind if you are tempted to simplify the filter.

Then fix the imports at the top of the file. They currently read:

```ts
import {accentGroupFor, reassignIfCrossed} from "./accent";
```

Replace with:

```ts
import {assignAccent} from "./accent";
```

Check whether `accentGroupFor` is used anywhere else in the file before removing it; if it is, keep it in the import.

- [ ] **Step 6: Run the database and accent tests**

Run: `npx jest library/__tests__/RecipeDatabase.test.ts library/__tests__/accent.test.ts`
Expected: PASS, no change in the number of tests.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: exit 0. If it reports an unused import in `RecipeDatabase.ts`, remove the name it mentions.

- [ ] **Step 8: Commit**

```bash
git add library/accent.ts library/RecipeDatabase.ts library/__tests__/accent.test.ts
git commit -m "Move the accent-in-use rule out of RecipeDatabase

The home screen needs the same rule against the library it already holds in
memory, and a private method on the database cannot be reached. One definition
in accent.ts, used by both."
```

---

## Task 2: Assign the accent before the editor opens

**Why:** Card reads, imports and (shortly) new recipes all reach the editor unsaved with no `accentIndex`, so `resolveAccent` falls back to a uuid hash. `insertRecipe` then picks a different, least-used colour on save. The row in the library is a different colour from the one the user just spent a minute looking at.

**Files:**
- Modify: `app/index.tsx` (the `openRecipe` function, around line 434)
- Test: `app/__tests__/index.test.tsx`

- [ ] **Step 1: Write the failing test**

Append inside the existing top-level `describe` in `app/__tests__/index.test.tsx`. The file already has `named()`, `store()` and `memoryStorage()` helpers and renders the screen as `<HomeScreen db={store([...])} settings={new Settings(memoryStorage())}/>` — use that shape, not a bare `<HomeScreen/>`.

A library row is the cheapest way to reach `openRecipe` without mocking NFC, and a freshly built `Recipe` has `accentIndex` undefined, which is exactly the unsaved state under test.

```tsx
describe("the accent a recipe is edited under", () => {
    it("is settled before the editor sees it", async () => {
        // The editor is pushed with the recipe serialised, and a recipe is only
        // written to the table on SAVE. Without an index assigned here, the
        // editor draws a uuid-hash colour and the library row later draws the
        // least-used one -- so the colour the user edited under is not the
        // colour they then have to find in the list.
        const unsaved = named("Ethiopia");
        expect(unsaved.accentIndex).toBeUndefined();

        await renderWithProviders(
            <HomeScreen db={store([unsaved])} settings={new Settings(memoryStorage())}/>
        );
        await fireEvent.press(await screen.findByLabelText("Open Ethiopia"));

        await waitFor(() => expect(mockPush).toHaveBeenCalled());

        const pushed = JSON.parse(mockPush.mock.calls[0][0].params.recipeJSON);
        expect(typeof pushed.accentIndex).toBe("number");
    });

    it("does not move for a recipe that already has one", async () => {
        // Re-assigning here would repaint a saved recipe every time it was
        // opened. `assignAccent` keeps a valid index, which is what makes it
        // safe to call on every route into the editor.
        const saved = named("Kenya");
        saved.accentIndex = 5;

        await renderWithProviders(
            <HomeScreen db={store([saved])} settings={new Settings(memoryStorage())}/>
        );
        await fireEvent.press(await screen.findByLabelText("Open Kenya"));

        await waitFor(() => expect(mockPush).toHaveBeenCalled());

        const pushed = JSON.parse(mockPush.mock.calls[0][0].params.recipeJSON);
        expect(pushed.accentIndex).toBe(5);
    });

    it("does not hand a second recipe the colour the first one took", async () => {
        const first = named("Ethiopia");
        first.accentIndex = 0;
        const second = named("Kenya");

        await renderWithProviders(
            <HomeScreen db={store([first, second])} settings={new Settings(memoryStorage())}/>
        );
        await fireEvent.press(await screen.findByLabelText("Open Kenya"));

        await waitFor(() => expect(mockPush).toHaveBeenCalled());

        const pushed = JSON.parse(mockPush.mock.calls[0][0].params.recipeJSON);
        expect(pushed.accentIndex).not.toBe(0);
    });
});
```

Take the row's accessibility label from the existing test that presses `"Open Imported"` if `"Open Ethiopia"` does not resolve — the label is built from the recipe's display name.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest app/__tests__/index.test.tsx -t "is settled before the editor sees it"`
Expected: FAIL — `expect(typeof pushed.accentIndex).toBe("number")` receives `"undefined"`.

- [ ] **Step 3: Assign the accent in `openRecipe`**

In `app/index.tsx`, add `assignAccent` to the imports:

```ts
import {assignAccent} from "@/library/accent";
```

If the file already imports something from `@/library/accent`, add the name to that import rather than adding a second line.

Then in `openRecipe`, after the push guard and before `router.push`:

```ts
    function openRecipe(recipe: Recipe): boolean {
        if (Date.now() - lastEditorPushAt < EDITOR_PUSH_GUARD_MS) {
            return false;
        }
        lastEditorPushAt = Date.now();
        // Every route into the editor comes through here: a card read, an
        // import, a new recipe, and a tap on a row that is already saved. The
        // accent is settled here rather than on save, so the colour the user
        // edits under is the colour the library row gets. `assignAccent` is
        // idempotent, so the already-saved row is a no-op.
        assignAccent(recipe, library.recipes);
        router.push({
            pathname: "/editRecipe",
            params:   {recipeJSON: JSON.stringify(recipe)}
        });
        return true;
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest app/__tests__/index.test.tsx`
Expected: PASS, including every test that was passing before.

- [ ] **Step 5: Commit**

```bash
git add app/index.tsx app/__tests__/index.test.tsx
git commit -m "Settle a recipe's accent before the editor opens it

A read or an import reached the editor with no accentIndex, drew a uuid-hash
colour, and was then given a different least-used colour on save -- so the
colour the recipe was edited under was not the one to look for in the list.
openRecipe is the one place every route into the editor passes through."
```

---

## Task 3: An opening stage worth having

**Why:** ADD STAGE calls `addPour(recipe.pours.length - 1)`, which on a stage-less recipe is `addPour(-1)`. It falls through to a placeholder branch that has never run in this app and yields a stage of **1 ml at 39 °C** — both the bottom of their ranges.

That placeholder branch stays exactly as it is. `addPour(0, false)` and `addPour(-1, false)` are the test suite's idiom for "give me an empty pour I will fill in", used in `Recipe.ratio.test.ts`, `units.roundtrip.test.ts`, `shareLink.test.ts`, `useRecipeEditor.test.ts` and others. That is a different question from "what should the user's first stage be", and it gets a different method.

**Files:**
- Modify: `library/Recipe.ts` (add a method next to `addPour`, around line 244)
- Test: `library/__tests__/Recipe.volume.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `library/__tests__/Recipe.volume.test.ts`. Check the file's existing imports and add `CUP_TYPE` and `POUR_PATTERN` if they are not already there.

```ts
describe("addOpeningPour", () => {
    it("opens a coffee recipe with a stage that satisfies the balance", async () => {
        // dose x ratio is the sum the machine demands, and a single-pour recipe
        // is what autoFixPourVolumes would produce anyway. Matching it means one
        // tap of ADD STAGE carries a new recipe from invalid to writable.
        const recipe = new Recipe();
        recipe.cupType = CUP_TYPE.OMNI;
        recipe.dosage = 15;
        recipe.ratio = 16;
        recipe.grindSize = 65;

        recipe.addOpeningPour();

        expect(recipe.pours).toHaveLength(1);
        expect(recipe.pours[0].volume).toBe(240);
        expect(recipe.pours[0].temperature).toBe(93);
        expect(recipe.pours[0].flowRate).toBe(30);
        expect(recipe.pours[0].pourPattern).toBe(POUR_PATTERN.CENTERED);
        expect(recipe.pours[0].agitation).toBe(0);
        expect(recipe.pours[0].pauseTime).toBe(0);
        expect(recipe.pours[0].pourNumber).toBe(1);
        expect(recipe.isPourVolumeValid()).toBe(true);
    });

    it("opens a tea recipe at 90 ml and 85 degrees", () => {
        const recipe = new Recipe();
        recipe.cupType = CUP_TYPE.TEA;
        recipe.dosage = 5;

        recipe.addOpeningPour();

        expect(recipe.pours).toHaveLength(1);
        expect(recipe.pours[0].volume).toBe(90);
        expect(recipe.pours[0].temperature).toBe(85);
    });

    it("fixes a tea recipe's ratio, which is derived rather than chosen", () => {
        // Coffee's volume comes from its ratio. Tea is the other way round:
        // fixRatio derives the ratio from the volumes. A bare Recipe sits at
        // the -1 "not set" sentinel until this call -- below RATIO.min, and a
        // negative brew target if anything renders it. (blankRecipe seeds tea
        // at 18 for exactly that reason; this test covers the bare class.)
        const recipe = new Recipe();
        recipe.cupType = CUP_TYPE.TEA;
        recipe.dosage = 5;

        recipe.addOpeningPour();

        expect(recipe.ratio).toBe(18);
    });

    it("leaves the placeholder pour idiom alone", () => {
        // addPour(0, false) is how the test suite builds a pour it is about to
        // fill in. It must keep yielding the minimum-valued placeholder.
        const recipe = new Recipe();
        recipe.addPour(0, false);

        expect(recipe.pours[0].volume).toBe(1);
        expect(recipe.pours[0].temperature).toBe(39);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest library/__tests__/Recipe.volume.test.ts -t "addOpeningPour"`
Expected: FAIL — `recipe.addOpeningPour is not a function`. The fourth test in the block passes already; that is intentional, it is the guard that Task 3 does not change the placeholder.

- [ ] **Step 3: Add the method**

In `library/Recipe.ts`, directly above `public addPour(`, add:

```ts
    /**
     * The first stage of a recipe that has none.
     *
     * Separate from `addPour` on purpose. `addPour(n, false)` answers "give me
     * an empty pour I will fill in" and yields a minimum-valued placeholder;
     * the test suite depends on that. This answers "what should the user's
     * first stage be", which is a different question with a different answer.
     *
     * Coffee opens at the whole target volume because that is what
     * `autoFixPourVolumes` gives a single-pour recipe anyway, so one tap of ADD
     * STAGE carries a new recipe from invalid to writable rather than to a
     * second problem. Tea opens at 90 ml because tea clamps every pour there,
     * and has its ratio fixed because tea derives the ratio from the volumes
     * rather than the other way round.
     */
    public addOpeningPour() {
        const tea = this.isTea();
        const pour = new Pour(
            1,
            tea ? 90 : this.getTotalVolume(),
            tea ? 85 : 93,
            30,
            AGITATION.ALL_OFF,
            POUR_PATTERN.CENTERED,
            0
        );
        this.pours.push(pour);
        if (tea) {
            this.fixRatio();
        }
    }
```

Check the file's existing import of `./Pour` and make sure `AGITATION` and `POUR_PATTERN` are both named in it; add whichever is missing.

`getTotalVolume()` is the existing method that returns `dosage × ratio`. Confirm that by reading it before relying on it — if it is named differently, use the real name and say so in the commit message.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest library/__tests__/Recipe.volume.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole library suite, to prove the placeholder is untouched**

Run: `npx jest library/`
Expected: PASS. Any failure here means the placeholder branch was changed after all — revert that part.

- [ ] **Step 6: Commit**

```bash
git add library/Recipe.ts library/__tests__/Recipe.volume.test.ts
git commit -m "Give a stage-less recipe a first stage worth having

ADD STAGE on a recipe with no pours reaches addPour's copy-from-previous
fallback, which has never run in this app and yields 1 ml at 39 C. Those
literals stay: addPour(n, false) is the suite's idiom for a pour it is about to
fill in. The user's first stage is a different question, so it gets its own
method."
```

---

## Task 4: Route ADD STAGE to the opening stage

**Files:**
- Modify: `hooks/useRecipeEditor.ts:244-255`
- Modify: `app/editRecipe.tsx:648-652` (comment only)
- Test: `hooks/__tests__/useRecipeEditor.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `hooks/__tests__/useRecipeEditor.test.ts`. The file already has a `renderEditor` helper that builds a two-pour recipe; this needs a stage-less one, so add a second helper beside it:

```ts
/** A recipe with no stages at all, as the create flow produces one. */
async function renderBlankEditor() {
    const recipe = new Recipe();
    recipe.cupType = CUP_TYPE.OMNI;
    recipe.dosage = 15;
    recipe.ratio = 16;
    recipe.grindSize = 65;
    recipe.grindRPM = 120;

    return renderHook(() => useRecipeEditor({
        recipeJSON:      JSON.stringify(recipe),
        temperatureUnit: "C",
        onSaved:         jest.fn()
    }));
}
```

Then the tests:

```ts
describe("a recipe with no stages", () => {
    it("opens with a real first stage rather than the placeholder", async () => {
        // The editor's ADD STAGE passes pours.length - 1, which is -1 when
        // there are none. Routed to addPour that lands on the copy-from-
        // previous fallback and yields 1 ml at 39 C.
        const {result} = await renderBlankEditor();

        await act(async () => {
            result.current.addPour(-1);
        });

        expect(result.current.recipe!.pours).toHaveLength(1);
        expect(result.current.recipe!.pours[0].volume).toBe(240);
        expect(result.current.recipe!.pours[0].temperature).toBe(93);
    });

    it("is writable after that one tap", async () => {
        const {result} = await renderBlankEditor();

        expect(result.current.canWrite).toBe(false);

        await act(async () => {
            result.current.addPour(-1);
        });

        expect(result.current.canWrite).toBe(true);
    });

    it("still copies the previous stage once there is one", async () => {
        const {result} = await renderBlankEditor();

        await act(async () => {
            result.current.addPour(-1);
        });
        await act(async () => {
            result.current.addPour(0);
        });

        expect(result.current.recipe!.pours).toHaveLength(2);
        expect(result.current.recipe!.pours[1].temperature).toBe(93);
    });
});
```

`renderHook` is asynchronous in this repository exactly as `render` is — without the `await`, the destructured `result` is `undefined` and the test fails on a confusing `Cannot read properties of undefined`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest hooks/__tests__/useRecipeEditor.test.ts -t "opens a stage-less recipe"`
Expected: FAIL — volume is 1, temperature is 39.

- [ ] **Step 3: Route it**

In `hooks/useRecipeEditor.ts`, change the body of `addPour`:

```ts
    function addPour(pourNumber: number) {
        if (recipe) {
            // Limit tea recipes to maximum 3 pours
            if (recipe.isTea() && recipe.pours.length >= 3) {
                notify({tone: "info", message: "Tea recipes are limited to 3 pours."});
                return;
            }
            // A recipe with no stages has nothing to copy from, and the screen
            // passes -1 for it. `addPour` would fall through to its placeholder
            // branch and produce 1 ml at 39 C.
            if (recipe.pours.length === 0) {
                recipe.addOpeningPour();
            } else {
                recipe.addPour(pourNumber);
            }
            setVolumeError(null);
            setKey((prev) => prev + 1);
        }
    }
```

- [ ] **Step 4: Correct the stale comment in the editor**

In `app/editRecipe.tsx`, the ADD STAGE press handler is preceded by:

```tsx
                           // `Recipe.addPour(n)` copies `pours[n]` and splices
                           // in after it, so appending is the last index.
```

Replace those two lines with:

```tsx
                           // `Recipe.addPour(n)` copies `pours[n]` and splices
                           // in after it, so appending is the last index. On a
                           // recipe with no stages that index is -1, and the
                           // hook routes it to `addOpeningPour` instead —
                           // there is nothing to copy.
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest hooks/__tests__/useRecipeEditor.test.ts app/__tests__/editRecipe.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add hooks/useRecipeEditor.ts app/editRecipe.tsx hooks/__tests__/useRecipeEditor.test.ts
git commit -m "Route ADD STAGE to the opening stage when there are none"
```

---

## Task 5: The blank recipe

**Files:**
- Create: `library/newRecipe.ts`
- Test: `library/__tests__/newRecipe.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `library/__tests__/newRecipe.test.ts`:

```ts
import {accents} from "@/constants/colors";
import {cardWriteProblems} from "@/library/cardLimits";
import {blankRecipe} from "@/library/newRecipe";
import {CUP_TYPE} from "@/library/Recipe";

describe("blankRecipe", () => {
    it("builds a coffee recipe on the agreed presets", () => {
        const recipe = blankRecipe("coffee");

        expect(recipe.ratio).toBe(16);
        expect(recipe.dosage).toBe(15);
        expect(recipe.grindSize).toBe(65);
        expect(recipe.grindRPM).toBe(120);
        expect(recipe.cupType).toBe(CUP_TYPE.OMNI);
        expect(recipe.grinder).toBe(true);
    });

    it("builds a tea recipe at a 5 g dose", () => {
        const recipe = blankRecipe("tea");

        expect(recipe.dosage).toBe(5);
        expect(recipe.cupType).toBe(CUP_TYPE.TEA);
        expect(recipe.isTea()).toBe(true);
    });

    it("starts with no stages, for either beverage", () => {
        expect(blankRecipe("coffee").pours).toHaveLength(0);
        expect(blankRecipe("tea").pours).toHaveLength(0);
    });

    it("records that the user wrote it", () => {
        expect(blankRecipe("coffee").source).toBe("manual");
    });

    it("shows a placeholder name until the user types one", () => {
        expect(blankRecipe("coffee").displayName()).toBe("Untitled Brew");
        expect(blankRecipe("coffee").hasName()).toBe(false);
    });

    it("gives every recipe its own identity", () => {
        expect(blankRecipe("coffee").uuid).not.toBe(blankRecipe("coffee").uuid);
    });

    it("cannot be written to a card until it has a stage", () => {
        // The gate already exists; this pins that a blank recipe trips it
        // rather than reaching a card half-formed.
        expect(cardWriteProblems(blankRecipe("coffee")))
            .toContain("The recipe has no stages.");
        expect(cardWriteProblems(blankRecipe("tea")))
            .toContain("The recipe has no stages.");
    });

    it("is one tap from writable, for either beverage", () => {
        const coffee = blankRecipe("coffee");
        coffee.addOpeningPour();
        expect(cardWriteProblems(coffee)).toEqual([]);

        const tea = blankRecipe("tea");
        tea.addOpeningPour();
        expect(cardWriteProblems(tea)).toEqual([]);
    });

    it("draws from the half of the palette its beverage owns", () => {
        // Not a colour assertion for its own sake: the chooser shows these
        // swatches on the door, so the door and the recipe must agree.
        expect(accents.coffee.length).toBeGreaterThan(0);
        expect(accents.tea.length).toBeGreaterThan(0);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest library/__tests__/newRecipe.test.ts`
Expected: FAIL — cannot find module `@/library/newRecipe`.

- [ ] **Step 3: Write the factory**

Create `library/newRecipe.ts`:

```ts
import type {AccentGroup} from "@/constants/colors";
import Recipe, {CUP_TYPE} from "@/library/Recipe";

/**
 * A blank recipe for the editor to open.
 *
 * The beverage is asked before the editor opens, not inside it, because
 * `editRecipe` deliberately hides the cup-type row on tea: `CUP_OPTIONS`
 * excludes `TEA`, so on a tea recipe the row showed nothing selected and
 * tapping any option silently turned the recipe into a coffee card. Tea is a
 * one-way door, and this is the only place in the app that can open it.
 *
 * Coffee's presets are a starting point a filter brewer would recognise. Tea
 * sets only the dose and the cup type: the editor hides grind size, grind
 * speed, cup type and the grinder toggle on tea, and `getData` writes the
 * default grind size for a tea card whatever the model holds, so setting them
 * would be theatre. Tea's ratio is not ours to choose either — `fixRatio`
 * derives it from the volumes, which is why it stays 0 until `addOpeningPour`
 * gives it a stage to derive from.
 *
 * No stages, deliberately. The recipe is not writable or brewable until the
 * user adds one, and every gate that enforces that already exists.
 */
export function blankRecipe(group: AccentGroup): Recipe {
    const recipe = new Recipe();
    recipe.source = "manual";

    if (group === "tea") {
        recipe.cupType = CUP_TYPE.TEA;
        recipe.dosage = 5;
        return recipe;
    }

    recipe.cupType = CUP_TYPE.OMNI;
    recipe.dosage = 15;
    recipe.ratio = 16;
    recipe.grindSize = 65;
    recipe.grindRPM = 120;
    recipe.grinder = true;
    return recipe;
}
```

`AccentGroup` is `"coffee" | "tea"` and is reused here rather than a second two-valued type being declared: the beverage and the half of the palette are the same distinction, and `accentGroupFor` already maps a recipe onto it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest library/__tests__/newRecipe.test.ts`
Expected: PASS. If "is one tap from writable" fails for tea, read the reported problems — the likely cause is `addOpeningPour` not calling `fixRatio`, which Task 3 covers.

- [ ] **Step 5: Commit**

```bash
git add library/newRecipe.ts library/__tests__/newRecipe.test.ts
git commit -m "Add a blank-recipe factory

The presets live in one place. Tea sets only what the editor will show it,
because the rest is hidden on tea and would be theatre."
```

---

## Task 6: The chooser sheet

**Files:**
- Create: `components/NewRecipeSheet.tsx`
- Test: `components/__tests__/NewRecipeSheet.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `components/__tests__/NewRecipeSheet.test.tsx`:

```tsx
/**
 * `render` and `fireEvent` are asynchronous in this repository. Without the
 * `await`, `screen` is empty and the test passes for the wrong reason.
 */
import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import NewRecipeSheet from "@/components/NewRecipeSheet";
import {renderWithProviders} from "@/test-utils/render";

describe("NewRecipeSheet", () => {
    it("offers both beverages", async () => {
        await renderWithProviders(
            <NewRecipeSheet open onOpenChange={() => {}} onChoose={() => {}}/>
        );

        expect(await screen.findByText("COFFEE")).toBeTruthy();
        expect(await screen.findByText("TEA")).toBeTruthy();
    });

    it("reports the beverage chosen", async () => {
        const onChoose = jest.fn();
        await renderWithProviders(
            <NewRecipeSheet open onOpenChange={() => {}} onChoose={onChoose}/>
        );

        await fireEvent.press(await screen.findByLabelText("New coffee recipe"));

        expect(onChoose).toHaveBeenCalledWith("coffee");
    });

    it("reports tea distinctly", async () => {
        const onChoose = jest.fn();
        await renderWithProviders(
            <NewRecipeSheet open onOpenChange={() => {}} onChoose={onChoose}/>
        );

        await fireEvent.press(await screen.findByLabelText("New tea recipe"));

        expect(onChoose).toHaveBeenCalledWith("tea");
    });

    it("says what each door will produce", async () => {
        // The door is the only place the presets are stated. A user who takes
        // the coffee door and finds a 15 g dose should have been told.
        await renderWithProviders(
            <NewRecipeSheet open onOpenChange={() => {}} onChoose={() => {}}/>
        );

        expect(await screen.findByText(/15 g/)).toBeTruthy();
        expect(await screen.findByText(/5 g/)).toBeTruthy();
    });

    it("draws nothing while closed", async () => {
        await renderWithProviders(
            <NewRecipeSheet open={false} onOpenChange={() => {}} onChoose={() => {}}/>
        );

        expect(screen.queryByText("COFFEE")).toBeNull();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest components/__tests__/NewRecipeSheet.test.tsx`
Expected: FAIL — cannot find module `@/components/NewRecipeSheet`.

- [ ] **Step 3: Write the component**

Create `components/NewRecipeSheet.tsx`:

```tsx
import React from "react";
import {Pressable} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import XbrwSheet from "@/components/XbrwSheet";
import {accents, palette, type AccentGroup} from "@/constants/colors";

/** How many swatches a door shows. The tea half only has four. */
const SWATCH_COUNT = 4;
const SWATCH_SIZE = 10;

/**
 * The two doors, in the order they are offered.
 *
 * The summary states the presets `blankRecipe` will apply. The door is the only
 * place a user is told what they are about to get, so the two have to agree —
 * `library/__tests__/newRecipe.test.ts` pins the numbers on the other side.
 */
const DOORS: {group: AccentGroup; label: string; summary: string}[] = [
    {group: "coffee", label: "COFFEE", summary: "15 g · 1:16 · grind 65 · OMNI"},
    {group: "tea",    label: "TEA",    summary: "5 g · 90 ml steeps · up to 3"}
];

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Called with the beverage chosen. The sheet does not close itself. */
    onChoose: (group: AccentGroup) => void;
};

/**
 * Asks the one question the editor cannot ask later.
 *
 * `editRecipe` hides the cup-type row on a tea recipe, so a recipe that opens
 * as coffee can never become tea. Deferring the choice would be offering a
 * change the editor does not permit.
 *
 * The swatches are not decoration. `constants/colors.ts` splits the accent
 * palette into a coffee half and a tea half, and `accentGroupFor` chooses
 * between them on `isTea()` — so a door shows the colours the recipe it makes
 * will actually be drawn in.
 *
 * No `prewarm`. `ImportSheet` opts in because it builds a text field and reads
 * the clipboard; two static rows have nothing to warm.
 *
 * Holds no state: it is a picture of its props, and the screen owns both the
 * open flag and what a choice means.
 */
export default function NewRecipeSheet({open, onOpenChange, onChoose}: Props) {
    return (
        <XbrwSheet open={open} onOpenChange={onOpenChange}
                   title="New recipe" heightPercent={42}>
            <YStack gap="$3" paddingHorizontal="$4" paddingBottom="$4">
                {DOORS.map((door) => (
                    <Pressable key={door.group}
                               accessibilityRole="button"
                               accessibilityLabel={`New ${door.group} recipe`}
                               onPress={() => onChoose(door.group)}>
                        <XStack alignItems="center" gap="$3"
                                paddingVertical="$3.5" paddingHorizontal="$3.5"
                                borderRadius="$6"
                                backgroundColor={palette.raised}
                                borderWidth={1} borderColor={palette.line}>
                            <XStack gap="$1"
                                    accessibilityElementsHidden
                                    importantForAccessibility="no-hide-descendants">
                                {accents[door.group].slice(0, SWATCH_COUNT).map((colour) => (
                                    <YStack key={colour}
                                            width={SWATCH_SIZE} height={SWATCH_SIZE}
                                            borderRadius="$1"
                                            backgroundColor={colour}/>
                                ))}
                            </XStack>
                            <YStack gap="$1.5" flex={1}>
                                <DotMatrixText fontSize={13} weight="bold"
                                               letterSpacing={1.5} color={palette.text}>
                                    {door.label}
                                </DotMatrixText>
                                <Text fontSize={12} color={palette.muted}>
                                    {door.summary}
                                </Text>
                            </YStack>
                        </XStack>
                    </Pressable>
                ))}
            </YStack>
        </XbrwSheet>
    );
}
```

Two things to be careful about here:

- `DotMatrixText` children must be **a single string or number**, not mixed nodes. `{door.label}` is one string, which is why the label and the summary are separate elements rather than one line.
- The outer press target is a React Native `Pressable`, not a Tamagui view. Tamagui drives presses through the responder system rather than an `onPress` prop on the host view, and `fireEvent.press` walks up the tree until it finds a real `onPress` — which would be the component's own prop, making the test pass whether or not anything is wired up. A real `Pressable` puts a genuine handler where RNTL can find it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest components/__tests__/NewRecipeSheet.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/NewRecipeSheet.tsx components/__tests__/NewRecipeSheet.test.tsx
git commit -m "Add the coffee-or-tea chooser sheet

Each door shows the half of the accent palette its recipes draw from, so the
choice is shown in the colours it produces."
```

---

## Task 7: The third tile

**Files:**
- Modify: `app/index.tsx` (imports, a `newOpen` state beside `importOpen`, the tile row around line 548, and the sheet beside `ImportSheet`)
- Test: `app/__tests__/index.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `app/__tests__/index.test.tsx`, using the file's existing `store()` and `memoryStorage()` helpers. Add `CUP_TYPE` to the existing `@/library/Recipe` import.

```tsx
describe("writing a recipe from scratch", () => {
    function blankScreen() {
        return <HomeScreen db={store([])} settings={new Settings(memoryStorage())}/>;
    }

    it("offers a third way to get a recipe", async () => {
        await renderWithProviders(blankScreen());

        expect(screen.getByLabelText("Create a recipe")).toBeTruthy();
    });

    it("asks coffee or tea before opening the editor", async () => {
        // The editor hides the cup-type row on tea, so the beverage cannot be
        // changed later. Opening straight into a coffee recipe would be
        // offering a change the editor does not permit.
        await renderWithProviders(blankScreen());

        await fireEvent.press(screen.getByLabelText("Create a recipe"));

        expect(await screen.findByLabelText("New coffee recipe")).toBeTruthy();
        expect(mockPush).not.toHaveBeenCalled();
    });

    it("opens the editor on a blank coffee recipe", async () => {
        await renderWithProviders(blankScreen());

        await fireEvent.press(screen.getByLabelText("Create a recipe"));
        await fireEvent.press(await screen.findByLabelText("New coffee recipe"));

        await waitFor(() => expect(mockPush).toHaveBeenCalled());

        const pushed = JSON.parse(mockPush.mock.calls[0][0].params.recipeJSON);
        expect(pushed.cupType).toBe(CUP_TYPE.OMNI);
        expect(pushed.dosage).toBe(15);
        expect(pushed.ratio).toBe(16);
        expect(pushed.grindSize).toBe(65);
        expect(pushed.pours).toHaveLength(0);
        expect(pushed.source).toBe("manual");
    });

    it("opens the editor on a blank tea recipe", async () => {
        await renderWithProviders(blankScreen());

        await fireEvent.press(screen.getByLabelText("Create a recipe"));
        await fireEvent.press(await screen.findByLabelText("New tea recipe"));

        await waitFor(() => expect(mockPush).toHaveBeenCalled());

        const pushed = JSON.parse(mockPush.mock.calls[0][0].params.recipeJSON);
        expect(pushed.cupType).toBe(CUP_TYPE.TEA);
        expect(pushed.dosage).toBe(5);
    });

    it("gives the new recipe a colour on the way in", async () => {
        await renderWithProviders(blankScreen());

        await fireEvent.press(screen.getByLabelText("Create a recipe"));
        await fireEvent.press(await screen.findByLabelText("New coffee recipe"));

        await waitFor(() => expect(mockPush).toHaveBeenCalled());

        const pushed = JSON.parse(mockPush.mock.calls[0][0].params.recipeJSON);
        expect(typeof pushed.accentIndex).toBe("number");
    });

    it("closes the chooser once a beverage is taken", async () => {
        await renderWithProviders(blankScreen());

        await fireEvent.press(screen.getByLabelText("Create a recipe"));
        await fireEvent.press(await screen.findByLabelText("New coffee recipe"));

        await waitFor(() =>
            expect(screen.queryByLabelText("New coffee recipe")).toBeNull());
    });
});
```

The last test may need to allow for `XbrwSheet`'s `EXIT_GRACE`, which keeps a dismissed sheet mounted so it can animate away. If `waitFor` times out, advance the timers the way the import tests do — `await act(async () => { jest.advanceTimersByTime(500); });` — before asserting.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest app/__tests__/index.test.tsx -t "offers a third way"`
Expected: FAIL — unable to find an element with label "Create a recipe".

- [ ] **Step 3: Add the tile and the sheet**

In `app/index.tsx`, add the imports:

```ts
import NewRecipeSheet from "@/components/NewRecipeSheet";
import {blankRecipe} from "@/library/newRecipe";
import type {AccentGroup} from "@/constants/colors";
```

Add the state beside the existing `importOpen` declaration:

```ts
    const [newOpen, setNewOpen] = useState(false);
```

Add the handler next to `openRecipe`:

```ts
    function createRecipe(group: AccentGroup): void {
        setNewOpen(false);
        // Straight to `openRecipe`, so a new recipe gets the same push guard
        // and the same accent settling as a read or an import.
        openRecipe(blankRecipe(group));
    }
```

Add the third tile to the row, after `ImportTile`:

```tsx
                        <CtaTile icon="plus" label="NEW"
                                 accessibilityLabel="Create a recipe"
                                 onPress={() => setNewOpen(true)}/>
```

And render the sheet beside the existing `ImportSheet` — find where `ImportSheet` is rendered and put this next to it:

```tsx
                <NewRecipeSheet open={newOpen} onOpenChange={setNewOpen}
                                onChoose={createRecipe}/>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest app/__tests__/index.test.tsx`
Expected: PASS, including every previously passing test.

- [ ] **Step 5: Commit**

```bash
git add app/index.tsx app/__tests__/index.test.tsx
git commit -m "Add a NEW tile to the home screen

CtaTile's own note says a third action joins the row if it earns equal weight.
Writing a recipe from scratch is the third thing you can do with this app."
```

---

## Task 8: The third header glyph

**Files:**
- Modify: `components/HomeHeader.tsx` (`SLIDE_WIDTH` at line 34, the slide contents at lines 180-183, and the `Props` type)
- Modify: `app/index.tsx` (pass the new handler)
- Test: `components/__tests__/HomeHeader.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append inside the `describe("HomeHeader")` block in `components/__tests__/HomeHeader.test.tsx`, and add `onNew: jest.fn()` to the `props()` helper's defaults:

```tsx
    it("takes new in with scan and import once the tiles are gone", async () => {
        await renderWithProviders(<HomeHeader {...props({collapsed: true})}/>);
        expect(screen.getByLabelText("Create a recipe")).toBeTruthy();
    });

    it("leaves new to the tile while expanded", async () => {
        await renderWithProviders(<HomeHeader {...props({collapsed: false})}/>);
        expect(screen.queryByLabelText("Create a recipe")).toBeNull();
    });

    it("reports a tap on the new glyph", async () => {
        const onNew = jest.fn();
        await renderWithProviders(<HomeHeader {...props({collapsed: true, onNew})}/>);

        await fireEvent.press(screen.getByLabelText("Create a recipe"));

        expect(onNew).toHaveBeenCalled();
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest components/__tests__/HomeHeader.test.tsx -t "takes new in"`
Expected: FAIL — unable to find an element with label "Create a recipe".

- [ ] **Step 3: Widen the slide**

In `components/HomeHeader.tsx`, change `SLIDE_WIDTH` and extend its doc comment:

```ts
/**
 * The width the three arriving glyphs occupy once they have landed.
 *
 * It is stated rather than measured because the animation has to know the
 * target before the glyphs have anywhere to be measured in: they start at zero
 * width, so an `onLayout` would report zero and the slide would never leave.
 * Each glyph is exactly one touch target wide by construction above.
 */
const SLIDE_WIDTH = TOUCH_TARGET * 3;
```

Add `onNew: () => void;` to the `Props` type beside `onImport`, and add it to the destructured parameters.

Then add the third `Action` inside the slide, after import:

```tsx
                        <XStack alignItems="center" width={SLIDE_WIDTH}>
                            <Action icon="scan" label="Read a card" onPress={onScan}/>
                            <Action icon="import" label="Import a recipe"
                                    disabled={!canImport} onPress={onImport}/>
                            <Action icon="plus" label="Create a recipe" onPress={onNew}/>
                        </XStack>
```

The glyphs are added at the left edge of the group so it grows leftwards and edit and settings stay where the user last saw them — the existing comment above the slide explains this, and appending inside the slide preserves it.

- [ ] **Step 4: Pass the handler from the home screen**

In `app/index.tsx`, add to the `HomeHeader` props beside `onImport`:

```tsx
                    onNew={() => setNewOpen(true)}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest components/__tests__/HomeHeader.test.tsx app/__tests__/index.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/HomeHeader.tsx app/index.tsx components/__tests__/HomeHeader.test.tsx
git commit -m "Take the NEW glyph into the collapsed header"
```

---

## Task 9: Say there are three things you can do

**Files:**
- Modify: `components/EmptyLibrary.tsx:41`
- Test: `components/__tests__/EmptyLibrary.test.tsx`

- [ ] **Step 1: Write the failing test**

Append inside the `describe("EmptyLibrary")` block:

```tsx
    it("names every way into the library, not two of three", async () => {
        // The copy lists the actions explicitly, so it goes stale the moment
        // the tile row changes. A user with an empty library is exactly the
        // one who needs to know they can write a recipe themselves.
        await renderWithProviders(<EmptyLibrary/>);
        expect(screen.getByText(
            "Read a card, import a recipe, or write one from scratch using the buttons above."
        )).toBeTruthy();
    });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest components/__tests__/EmptyLibrary.test.tsx -t "names every way"`
Expected: FAIL — unable to find the text.

- [ ] **Step 3: Update the copy**

In `components/EmptyLibrary.tsx`, replace:

```tsx
                    Read a card or import a recipe using the buttons above.
```

with:

```tsx
                    Read a card, import a recipe, or write one from scratch using
                    the buttons above.
```

JSX collapses the line break and surrounding whitespace into a single space, so the rendered string matches the test exactly.

Also update the component's doc comment, which says "the first thing a new user sees is the two things they can do":

```tsx
/**
 * What the list area shows when there are no recipes.
 *
 * It replaces the list only. The header and all three CTA tiles stay exactly
 * where they are, so the first thing a new user sees is the three things they
 * can do — which is also why there is no button in here.
 */
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest components/__tests__/EmptyLibrary.test.tsx`
Expected: PASS, all five tests, including "points at the tiles rather than repeating them".

- [ ] **Step 5: Commit**

```bash
git add components/EmptyLibrary.tsx components/__tests__/EmptyLibrary.test.tsx
git commit -m "Name all three ways into an empty library"
```

---

## Task 10: Correct the comments the plus glyph now contradicts

**Why:** Two comments in `constants/dotIcons.ts` say a bare plus is not used to mean "new". It now is, and a comment that contradicts the code is worse than no comment.

**Files:**
- Modify: `constants/dotIcons.ts:143-147` and `:391`

- [ ] **Step 1: Update the `duplicate` note**

Find the comment on the `duplicate` icon containing "A plus was considered and rejected". It currently reads roughly:

```ts
     * A plus was considered and rejected: on its own a plus reads as "new", and
     * duplicating a recipe is not the same offer as writing one from scratch.
```

Replace with:

```ts
     * A plus was considered and rejected: on its own a plus reads as "new", and
     * duplicating a recipe is not the same offer as writing one from scratch.
     * That reading is now load-bearing rather than hypothetical — the home
     * screen's NEW tile is a bare plus, and it means exactly that.
```

Read the surrounding lines first and keep the existing indentation and any sentences either side of this one.

- [ ] **Step 2: Update the `plus` note**

Replace:

```ts
    /** Steps a value up. Never used on its own to mean "new". */
```

with:

```ts
    /**
     * Steps a value up in a stepper, and stands alone for "new" on the home
     * screen's NEW tile and its collapsed-header glyph. Those are the only two
     * readings it carries; see `duplicate` for the offer it must not stand for.
     */
```

- [ ] **Step 3: Verify nothing else asserted the old wording**

Run: `npx jest components/__tests__/DotIcon.test.tsx constants/`
Expected: PASS. Comments are not behaviour, so this should be unaffected; the run is to prove it.

- [ ] **Step 4: Commit**

```bash
git add constants/dotIcons.ts
git commit -m "The plus glyph now does mean new

Two comments said it never would. A comment that contradicts the code is worse
than no comment."
```

---

## Task 11: Ship it as 1.6.0

**Files:**
- Modify: `app.json` (`expo.version`)
- Test: `app/__tests__/native-config.test.ts:5-23`

- [ ] **Step 1: Update the test and its reasoning**

Replace the doc comment and the assertion on the first test in `app/__tests__/native-config.test.ts` with:

```ts
    /**
     * 1.6.0.
     *
     * `runtimeVersion.policy` is `appVersion`, so the version string is also
     * the runtime version: an over-the-air update built against new native code
     * must never land on a binary that does not have it. This release adds no
     * native code — it is a new screen, a sheet and domain logic — but it does
     * follow 1.5.0 into the store, and a released version is not reused.
     *
     * 1.5.0 build 9 is the M4 release candidate; the 1.5.1 builds 7 and 8 that
     * preceded it have been retired. This release is 1.6.0 build 1.
     */
    it("ships the create-recipe release as 1.6.0, on the appVersion runtime policy", () => {
        expect(appConfig.expo.version).toBe("1.6.0");
        expect(appConfig.expo.runtimeVersion.policy).toBe("appVersion");
    });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest app/__tests__/native-config.test.ts`
Expected: FAIL — expected `"1.6.0"`, received `"1.5.0"`.

- [ ] **Step 3: Bump the version**

In `app.json`, change `"version": "1.5.0"` to `"version": "1.6.0"`. Change nothing else — `eas.json` sets `appVersionSource: "remote"`, so EAS holds the build number server-side and there is no build number in this file to touch.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest app/__tests__/native-config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app.json app/__tests__/native-config.test.ts
git commit -m "Ship the create-recipe release as 1.6.0"
```

---

## Task 12: All four gates

**Why:** CI runs typecheck, lint, tests and expo-doctor on every push and pull request. All four must be green, and expo-doctor is a hard failure.

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: exit 0, no output.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 0 errors. Eight pre-existing `require()` warnings are expected and are not yours to fix. If a new error appears, fix it — `react-hooks/set-state-in-effect` and `react-hooks/purity` are errors here, and state cannot be seeded or reset from an effect.

- [ ] **Step 3: The whole suite**

Run: `npm test`
Expected: PASS. The baseline on `main` is 164 suites / 2623 tests; this branch adds two suites and should be comfortably above that with zero failures.

- [ ] **Step 4: Dependency and config health**

Run: `npx expo-doctor`
Expected: 21/21 checks pass.

- [ ] **Step 5: Commit anything the gates changed**

If nothing changed, skip. Otherwise:

```bash
git add -A
git commit -m "Satisfy lint and typecheck for the create-recipe branch"
```

---

## Task 13: Device verification

**Why:** Three of these are fit questions a simulator answers wrongly, and NFC cannot be exercised in a simulator at all. A malformed write to a genuine card is not trivially recoverable, so the card round trip is not optional.

Run on a physical iPhone with `npm run ios -- --device`.

- [ ] **Step 1: The three-tile row**

Check that `READ CARD` — the longest label in the row — still reads at a third of the screen width, and that `NEW` sits comfortably rather than lost. If `READ CARD` wraps or clips, report it rather than fixing it silently; the answer is a design decision, not a nudge to the font size.

- [ ] **Step 2: The collapsed header**

Scroll the library until the tiles collapse. The row is now six glyphs plus the title: read, import, new, edit, the machine dot, and settings. Check the title is not crowded and every glyph is still a comfortable touch target.

- [ ] **Step 3: The sheet**

Tap NEW. Check `heightPercent={42}` leaves the two doors sitting properly rather than floating in a tall empty sheet or being cramped. Adjust the number if needed, and say so.

- [ ] **Step 4: The round trip**

Create a coffee recipe, tap ADD STAGE once, confirm the stage reads 240 ml at 93 °C and that WRITE has become available. Write it to a genuine card. Read the card back and confirm the values survive.

- [ ] **Step 5: The tea path**

Create a tea recipe, tap ADD STAGE once, and confirm the stage reads 90 ml at 85 °C and that the ratio has settled to 1:18 rather than sitting at zero.

- [ ] **Step 6: The accent**

Create a recipe, note the accent colour in the editor, tap SAVE, and confirm the library row is that same colour. Repeat with a card read, which is the path that had the defect before this branch.

---

## Definition of done

- All four gates green, with output read rather than assumed.
- Every device check in Task 13 performed on real hardware, with a genuine card written and read back.
- `docs/superpowers/specs/2026-09-14-create-recipe-design.md` still describes what was built; if the implementation diverged, the spec is updated in the same branch.
- Issue #25, "Decide whether the app should author a recipe from scratch", closed with a link to the spec.

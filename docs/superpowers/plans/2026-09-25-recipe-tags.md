# Tags on a Recipe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user put tags on a recipe from the recipe editor, and expose `intentTags(recipe)` as the derived reading #104 will compare against brew evidence.

**Architecture:** The storage half already exists. This adds one derived reading (`library/intentTags.ts`), one named operation on the editor hook (`editTags`), and one control (`components/TagSection.tsx`) placed in the About deck after the note. Nothing is stored that was not stored before, and nothing new goes into backup or onto the card.

**Tech Stack:** TypeScript, React Native, Expo SDK 57, Tamagui, Jest with `@testing-library/react-native` v14.

---

## Before you start

Read, in this order, and treat all three as required context:

1. `.github/copilot-instructions.md` in the repo root. The house rules.
2. `docs/superpowers/specs/2026-09-25-recipe-tags-design.md`. The approved design.
3. `docs/superpowers/specs/2026-09-25-recipe-tags-visual.html`. Open it in a browser. The frames are at true device width, so the chips are the size they will be.

Four rules this plan rests on, in descending order of how easy they are to break:

- **A test that cannot fail is worse than no test.** It advertises cover it does not provide. Six such assertions were found and closed on the sibling branch for #100. Every test here must be proved to fail by mutating the code it covers, running it, watching it fail, and restoring the code.
- **Tags are written through `setTags`, never by assignment.** Direct assignment bypasses normalisation and `MAX_TAGS_PER_RECIPE`, and this control is the one place a user can reach it.
- **Every tag draws the same.** Do not reintroduce the two-typeface distinction. It was considered and dropped; the spec says why.
- **The editor mutates its `Recipe` in place and republishes with a key bump.** Do not clone into state, and do not make `Recipe` immutable.

Also: British English in comments and prose. No em dashes in user-facing copy. All colour from `constants/colors.ts`. The React Compiler is on, so no hand-written `useMemo`/`useCallback` in new code, and destructure props rather than reading `props.x` inside a hook.

Component tests must `await renderWithProviders` from `test-utils/render.tsx`. RNTL v14's `render` and `fireEvent` are asynchronous, and a forgotten `await` leaves `screen` empty and the test passing for the wrong reason.

---

## File structure

| File | Responsibility |
| --- | --- |
| `library/intentTags.ts` | **Create.** `intentTags(recipe)`, the derived reading. No React, no database. |
| `library/__tests__/intentTags.test.ts` | **Create.** Tests for the above. |
| `components/TagSection.tsx` | **Create.** The whole control: chips, remove, add field, suggestions. |
| `components/__tests__/TagSection.test.tsx` | **Create.** Component tests. |
| `hooks/useRecipeEditor.ts` | **Modify.** Add `editTags`, a named operation beside `toggleFavourite`. |
| `hooks/__tests__/useRecipeEditor.test.ts` | **Modify.** Test `editTags`. |
| `components/AboutDeck.tsx` | **Modify.** Render `TagSection` after `NoteSection`. |
| `app/editRecipe.tsx` | **Modify.** Pass `editTags` and the library's tags down. |

---

### Task 1: The derived reading

**Files:**
- Create: `library/intentTags.ts`
- Test: `library/__tests__/intentTags.test.ts`

The vocabulary lives in `library/brew/beanTags.ts` and must not be copied. Only the three closed lists take part: origin is free text and a tag cannot be read as one without guessing. See the spec section "Intent covers three of #100's four fields".

- [ ] **Step 1: Write the failing test**

Create `library/__tests__/intentTags.test.ts`:

```ts
import Recipe from "@/library/Recipe";
import intentTags from "@/library/intentTags";

function recipeWith(tags: string[]): Recipe {
    const recipe = new Recipe();
    recipe.setTags(tags);
    return recipe;
}

describe("intentTags", () => {
    it("reads a roast, a process and a fermentation as intent", () => {
        expect(intentTags(recipeWith(["Light", "Washed", "Anaerobic"])))
            .toEqual(["Light", "Washed", "Anaerobic"]);
    });

    it("ignores a word that is only the user's own", () => {
        expect(intentTags(recipeWith(["Morning", "Dad's"]))).toEqual([]);
    });

    it("reads a vocabulary term whatever case it was typed in", () => {
        expect(intentTags(recipeWith(["washed"]))).toEqual(["washed"]);
    });

    // The chip shows what the user typed, so the reading has to as well: a
    // reading that recased their word would disagree with the control that
    // produced it.
    it("keeps the user's own spelling rather than the vocabulary's", () => {
        expect(intentTags(recipeWith(["LIGHT"]))).toEqual(["LIGHT"]);
    });

    // Origin is free text in #100, so there is no closed list to match a tag
    // against and no way to tell a place from a mood. Guessing here is the
    // thing podCoffee.ts already refused to do.
    it("does not read a place name as intent", () => {
        expect(intentTags(recipeWith(["Huila", "Nyeri"]))).toEqual([]);
    });

    it("reads a multi-word fermentation", () => {
        expect(intentTags(recipeWith(["Carbonic maceration"])))
            .toEqual(["Carbonic maceration"]);
    });

    // Near misses are refused rather than repaired, the same rule beanTags
    // applies: isProcess("washed beans") is false, so this is too.
    it("does not read a near miss as intent", () => {
        expect(intentTags(recipeWith(["Washed beans", "Lightly roasted"])))
            .toEqual([]);
    });

    it("reports nothing for a recipe with no tags", () => {
        expect(intentTags(new Recipe())).toEqual([]);
    });

    it("keeps the order the tags are in on the recipe", () => {
        expect(intentTags(recipeWith(["Morning", "Natural", "Dad's", "Dark"])))
            .toEqual(["Natural", "Dark"]);
    });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx jest library/__tests__/intentTags.test.ts`
Expected: FAIL, `Cannot find module '@/library/intentTags'`.

- [ ] **Step 3: Write the implementation**

Create `library/intentTags.ts`:

```ts
import type Recipe from "@/library/Recipe";
import {FERMENTATIONS, PROCESSES, ROASTS} from "@/library/brew/beanTags";
import {tagKey} from "@/library/tagKey";

/**
 * The words a recipe's tags share with the coffee vocabulary.
 *
 * Intent is not a separate field and never was. A recipe has one set of tags;
 * a tag that is also a word the brews are described in is additionally read as
 * intent, because that is the only property that lets #104 hold the two sides
 * against each other. Derived rather than stored, so removing the tag removes
 * the intent and nothing can drift out of agreement with the shelf.
 *
 * Three of #100's four bean fields take part. Origin is free text there, so
 * there is no closed list to match a tag against and no way to tell "Huila"
 * from "Morning" without the app guessing -- the same guess `podCoffee.ts`
 * refused when it left out a roast rather than invent one.
 *
 * Matched on `tagKey`, the JavaScript-folded form, so "washed" and "Washed"
 * are one intent. The tag is returned as the user spelled it: the chip shows
 * their spelling, and a reading that recased it would disagree with the
 * control that produced it.
 */
export default function intentTags(recipe: Recipe): string[] {
    return recipe.tags.filter((tag) => VOCABULARY.has(tagKey(tag)));
}

const VOCABULARY = new Set(
    [...ROASTS, ...PROCESSES, ...FERMENTATIONS].map(tagKey)
);
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx jest library/__tests__/intentTags.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Prove the tests can fail**

Run each of these, confirm the named test fails, then restore the file:

| Mutation in `library/intentTags.ts` | Must fail |
| --- | --- |
| Drop `FERMENTATIONS` from the vocabulary set | "reads a roast, a process and a fermentation as intent" |
| `VOCABULARY.has(tagKey(tag))` → `VOCABULARY.has(tag)` | "reads a vocabulary term whatever case it was typed in" |
| Return the matched vocabulary word instead of `tag` | "keeps the user's own spelling rather than the vocabulary's" |
| Match with `.some((v) => tagKey(tag).includes(v))` | "does not read a near miss as intent" |

If any mutation survives, the test is decoration. Strengthen it until it fails and say so in your report.

- [ ] **Step 6: Commit**

```bash
git add library/intentTags.ts library/__tests__/intentTags.test.ts
git commit -m "Read a recipe's intent from its tags"
```

---

### Task 2: The editor operation

**Files:**
- Modify: `hooks/useRecipeEditor.ts`
- Test: `hooks/__tests__/useRecipeEditor.test.ts`

The editor's `dispatch` is `(label: string, value: string) => void` and tags are an array, so they do not go through it. The hook already carries named operations beside the string dispatch for exactly this reason: `toggleFavourite`, `addPour`, `setBypassEnabled`. Add one more.

- [ ] **Step 1: Write the failing test**

Add to `hooks/__tests__/useRecipeEditor.test.ts`. Match the file's existing setup for rendering the hook; do not invent a new one. Note that `renderHook` is asynchronous in this repo's RNTL v14 setup, so it must be awaited or `result` is undefined.

```ts
    it("writes tags through setTags rather than assigning them", async () => {
        const {result} = await renderHook(/* the file's existing arrangement */);

        await act(async () => {
            result.current.editTags(["Light", "light", "  Washed  ", ""]);
        });

        // setTags folds case-insensitively keeping the first spelling, trims,
        // and drops blanks. Getting these for free is the whole reason the
        // control does not do its own validation.
        expect(result.current.recipe?.tags).toEqual(["Light", "Washed"]);
    });

    it("republishes the recipe so the deck repaints", async () => {
        const {result} = await renderHook(/* the file's existing arrangement */);
        const before = result.current.key;

        await act(async () => {
            result.current.editTags(["Morning"]);
        });

        // The recipe is mutated in place, so a key bump is the only signal a
        // change happened. Without it the chip row draws the old tags.
        expect(result.current.key).toBeGreaterThan(before);
    });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest hooks/__tests__/useRecipeEditor.test.ts -t "writes tags through setTags"`
Expected: FAIL, `result.current.editTags is not a function`.

- [ ] **Step 3: Write the implementation**

In `hooks/useRecipeEditor.ts`, add this beside the other named operations, and add `editTags` to the object the hook returns:

```ts
    /**
     * Replace the recipe's tags.
     *
     * A named operation rather than a `dispatch` label because the dispatch
     * signature is `(label: string, value: string)` and tags are an array.
     * `toggleFavourite` and `setBypassEnabled` sit here for the same reason.
     *
     * Through `setTags`, never by assignment: it folds case, trims, drops
     * blanks and holds `MAX_TAGS_PER_RECIPE`, and the editor is the one place
     * a user can reach any of that.
     */
    const editTags = (tags: string[]) => {
        if (!recipe) return;
        recipe.setTags(tags);
        setKey((prev) => prev + 1);
    };
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx jest hooks/__tests__/useRecipeEditor.test.ts`
Expected: PASS.

- [ ] **Step 5: Prove the tests can fail**

| Mutation | Must fail |
| --- | --- |
| `recipe.setTags(tags)` → `recipe.tags = tags` | "writes tags through setTags rather than assigning them" |
| Delete the `setKey` line | "republishes the recipe so the deck repaints" |

Restore after each.

- [ ] **Step 6: Commit**

```bash
git add hooks/useRecipeEditor.ts hooks/__tests__/useRecipeEditor.test.ts
git commit -m "Let the editor write a recipe's tags"
```

---

### Task 3: The control

**Files:**
- Create: `components/TagSection.tsx`
- Test: `components/__tests__/TagSection.test.tsx`

Read `components/NoteSection.tsx` first. It is the closest sibling: a `DeckSection` wrapper, a plain React Native `TextInput` styled from `palette`, uncontrolled because the recipe is mutated in place. Follow it.

Four states, all in the visual: untagged (a lone "+ Add"), tagged (chips then "+ Add"), adding (a field, with suggestions beneath), and the font-scale cap (chips wrap rather than truncate).

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/TagSection.test.tsx`:

```tsx
import {fireEvent, screen} from "@testing-library/react-native";
import React from "react";

import TagSection from "@/components/TagSection";
import {renderWithProviders} from "@/test-utils/render";

function setup(tags: string[], known: string[] = []) {
    const onChange = jest.fn();
    return {onChange, tags, known};
}

describe("TagSection", () => {
    it("shows every tag the recipe has", async () => {
        const {onChange} = setup([]);
        await renderWithProviders(
            <TagSection tags={["Light", "Morning"]} known={[]} onChange={onChange}/>);

        expect(screen.getByText("Light")).toBeTruthy();
        expect(screen.getByText("Morning")).toBeTruthy();
    });

    // A recipe with no tags is the normal case and by far the commonest. It
    // must not look like a form somebody abandoned half-filled.
    it("says nothing at all when the recipe has no tags", async () => {
        const {onChange} = setup([]);
        await renderWithProviders(
            <TagSection tags={[]} known={[]} onChange={onChange}/>);

        expect(screen.queryByText(/no tags/i)).toBeNull();
        expect(screen.queryByText(/add a tag/i)).toBeNull();
        expect(screen.getByLabelText("Add a tag")).toBeTruthy();
    });

    it("reports the remaining tags when one is removed", async () => {
        const {onChange} = setup([]);
        await renderWithProviders(
            <TagSection tags={["Light", "Morning"]} known={[]} onChange={onChange}/>);

        await fireEvent.press(screen.getByLabelText("Remove tag Light"));

        expect(onChange).toHaveBeenCalledWith(["Morning"]);
    });

    it("reports the new tag appended when one is typed", async () => {
        const {onChange} = setup([]);
        await renderWithProviders(
            <TagSection tags={["Morning"]} known={[]} onChange={onChange}/>);

        await fireEvent.press(screen.getByLabelText("Add a tag"));
        await fireEvent.changeText(screen.getByLabelText("New tag"), "Washed");
        await fireEvent(screen.getByLabelText("New tag"), "submitEditing",
            {nativeEvent: {text: "Washed"}});

        expect(onChange).toHaveBeenCalledWith(["Morning", "Washed"]);
    });

    it("offers a matching tag from elsewhere in the library", async () => {
        const {onChange} = setup([]);
        await renderWithProviders(
            <TagSection tags={[]} known={["Wash day", "Morning"]} onChange={onChange}/>);

        await fireEvent.press(screen.getByLabelText("Add a tag"));
        await fireEvent.changeText(screen.getByLabelText("New tag"), "Was");

        expect(screen.getByLabelText("Use tag Wash day")).toBeTruthy();
        expect(screen.queryByLabelText("Use tag Morning")).toBeNull();
    });

    it("offers a matching word from the coffee vocabulary", async () => {
        const {onChange} = setup([]);
        await renderWithProviders(
            <TagSection tags={[]} known={[]} onChange={onChange}/>);

        await fireEvent.press(screen.getByLabelText("Add a tag"));
        await fireEvent.changeText(screen.getByLabelText("New tag"), "Was");

        expect(screen.getByLabelText("Use tag Washed")).toBeTruthy();
    });

    // Offering a tag the recipe already has is an action with no effect, and
    // the user cannot tell that until they tap it.
    it("does not offer a tag the recipe already has", async () => {
        const {onChange} = setup([]);
        await renderWithProviders(
            <TagSection tags={["Washed"]} known={[]} onChange={onChange}/>);

        await fireEvent.press(screen.getByLabelText("Add a tag"));
        await fireEvent.changeText(screen.getByLabelText("New tag"), "Was");

        expect(screen.queryByLabelText("Use tag Washed")).toBeNull();
    });

    it("adds a tag when its suggestion is tapped", async () => {
        const {onChange} = setup([]);
        await renderWithProviders(
            <TagSection tags={[]} known={[]} onChange={onChange}/>);

        await fireEvent.press(screen.getByLabelText("Add a tag"));
        await fireEvent.changeText(screen.getByLabelText("New tag"), "Nat");
        await fireEvent.press(screen.getByLabelText("Use tag Natural"));

        expect(onChange).toHaveBeenCalledWith(["Natural"]);
    });

    // The section adds no rules of its own: setTags is the authority, and a
    // second opinion here would give the user two different answers about the
    // same tag depending on how it arrived. It passes the blank on and lets
    // setTags drop it, which it does.
    it("does not report anything for an empty submission", async () => {
        const {onChange} = setup([]);
        await renderWithProviders(
            <TagSection tags={["Morning"]} known={[]} onChange={onChange}/>);

        await fireEvent.press(screen.getByLabelText("Add a tag"));
        await fireEvent(screen.getByLabelText("New tag"), "submitEditing",
            {nativeEvent: {text: "   "}});

        expect(onChange).not.toHaveBeenCalled();
    });

    it("stops offering to add once the recipe is full", async () => {
        const {onChange} = setup([]);
        const full = Array.from({length: 20}, (_, i) => `tag-${i}`);
        await renderWithProviders(
            <TagSection tags={full} known={[]} onChange={onChange}/>);

        expect(screen.queryByLabelText("Add a tag")).toBeNull();
    });
});
```

RNTL v14 has removed `UNSAFE_getAllByType` and `root.findAllByType`, so do not try to inspect a child's props. Assert on text, test IDs and accessible labels only.

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest components/__tests__/TagSection.test.tsx`
Expected: FAIL, `Cannot find module '@/components/TagSection'`.

- [ ] **Step 3: Write the implementation**

Create `components/TagSection.tsx`. The shape below is the contract the tests pin; fill in the styling from `NoteSection.tsx` and the visual, taking every colour from `palette`.

```tsx
import React, {useState} from "react";
import {TextInput} from "react-native";
import {Text, XStack} from "tamagui";

import DeckSection from "@/components/DeckSection";
import {palette} from "@/constants/colors";
import {MAX_TAG_LENGTH, MAX_TAGS_PER_RECIPE} from "@/library/Recipe";
import {FERMENTATIONS, PROCESSES, ROASTS} from "@/library/brew/beanTags";
import {tagKey} from "@/library/tagKey";

/**
 * Where a recipe's tags are made.
 *
 * Until this existed a tag could only be created by filing a recipe onto a
 * shelf from the library, so the editor could show you a recipe without
 * offering any way to say what it was for.
 *
 * One face for every tag. A tag that is also a coffee word is read as intent
 * by `intentTags`, but it is not drawn differently: that distinction was
 * considered and dropped, because until #104 puts a comparison on screen a
 * second typeface is a difference the user has to guess the meaning of.
 *
 * Inter rather than Doto, and the user's own casing kept, for the reason
 * `ShelfRoom` draws a manual shelf plain: the matrix face is the app printing
 * a label, and these are a person's own words.
 *
 * No validation here. `setTags` folds case, trims, drops blanks and holds the
 * ceilings, and a second opinion in this component would answer differently
 * depending on whether a tag arrived by typing or from the library.
 */
export default function TagSection({tags, known, onChange}: {
    tags: string[];
    /** Every tag used elsewhere in the library, for suggestions. */
    known: string[];
    /** The whole new set, for `setTags`. */
    onChange: (tags: string[]) => void;
}) {
    const [adding, setAdding] = useState(false);
    const [typed, setTyped] = useState("");

    const full = tags.length >= MAX_TAGS_PER_RECIPE;
    const suggestions = suggestionsFor(typed, tags, known);

    function commit(value: string) {
        const tag = value.trim();
        setTyped("");
        setAdding(false);
        if (tag.length === 0) return;
        onChange([...tags, tag]);
    }

    return (
        <DeckSection title="TAGS" testID="about-tags">
            {/* chips, each with a remove control labelled `Remove tag ${tag}`;
                then either the field or an add control labelled "Add a tag",
                suppressed when `full`; then the suggestion row, each labelled
                `Use tag ${suggestion}`. */}
        </DeckSection>
    );
}

/**
 * What to offer for what has been typed so far.
 *
 * Two sources in one undifferentiated list: tags already used somewhere in the
 * library, and the coffee vocabulary. They are not labelled or separated,
 * because under the one-face decision there is nothing to tell the user, and a
 * heading over one group would reintroduce the very distinction that was
 * dropped.
 *
 * Matched on `tagKey`. SQLite's NOCASE is ASCII-only and would call "CAFÉ" and
 * "café" two tags while the model calls them one, so the folding has to be
 * JavaScript's here as it is everywhere else that compares a tag.
 */
function suggestionsFor(typed: string, tags: string[], known: string[]): string[] {
    const query = tagKey(typed.trim());
    if (query.length === 0) return [];
    const already = new Set(tags.map(tagKey));
    const seen = new Set<string>();
    const out: string[] = [];
    for (const candidate of [...known, ...ROASTS, ...PROCESSES, ...FERMENTATIONS]) {
        const key = tagKey(candidate);
        if (already.has(key) || seen.has(key)) continue;
        if (!key.startsWith(query)) continue;
        seen.add(key);
        out.push(candidate);
        if (out.length === MAX_SUGGESTIONS) break;
    }
    return out;
}

/**
 * Enough to be useful, few enough not to push the rest of the deck off screen
 * while somebody is typing.
 */
const MAX_SUGGESTIONS = 6;
```

The `TextInput` takes `accessibilityLabel="New tag"`, `maxLength={MAX_TAG_LENGTH}`, `autoFocus`, `returnKeyType="done"`, `onChangeText={setTyped}` and `onSubmitEditing={(e) => commit(e.nativeEvent.text)}`, mirroring `NoteSection`. Chips must wrap (`flexWrap="wrap"`) and must not set a fixed height or `numberOfLines`, so they grow with the system font rather than truncating.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx jest components/__tests__/TagSection.test.tsx`
Expected: PASS, 10 tests.

- [ ] **Step 5: Prove the tests can fail**

| Mutation in `components/TagSection.tsx` | Must fail |
| --- | --- |
| Drop the `already.has(key)` check | "does not offer a tag the recipe already has" |
| Drop `...ROASTS, ...PROCESSES, ...FERMENTATIONS` from the candidates | "offers a matching word from the coffee vocabulary" |
| `key.startsWith(query)` → `true` | "offers a matching tag from elsewhere in the library" |
| Remove the `full` guard on the add control | "stops offering to add once the recipe is full" |
| `if (tag.length === 0) return;` → always call `onChange` | "does not report anything for an empty submission" |
| `onChange([...tags, tag])` → `onChange([tag])` | "reports the new tag appended when one is typed" |

Restore after each. If a mutation survives, strengthen the test until it fails and report it.

- [ ] **Step 6: Commit**

```bash
git add components/TagSection.tsx components/__tests__/TagSection.test.tsx
git commit -m "Draw the recipe tag control"
```

---

### Task 4: Wiring

**Files:**
- Modify: `components/AboutDeck.tsx`
- Modify: `app/editRecipe.tsx`
- Test: `components/__tests__/AboutDeck.test.tsx` if it exists; otherwise add to `app/__tests__/editRecipe.test.tsx`

Place `TagSection` immediately after `NoteSection`, before `PodSection`. Both are the user's own words about the recipe; the pod, the provenance mark and the brew history below are things the app knows.

`known` comes from `RecipeDatabase.countRecipesByTag()`, which already returns every tag in the library with a count, ordered largest first. No new query. Read how `app/editRecipe.tsx` reaches the database for its other reads and follow that; do not open a second connection.

- [ ] **Step 1: Write the failing test**

Find the existing test that renders the About deck and follow its arrangement. Add:

```tsx
    it("offers the tag control between the note and the pod", async () => {
        // ... the file's existing render of the deck, with a recipe carrying
        // tags ["Morning"] ...

        expect(screen.getByTestId("about-tags")).toBeTruthy();
        expect(screen.getByText("Morning")).toBeTruthy();
    });
```

If a test in the repo already asserts the deck's section order, extend it rather than adding a second one.

- [ ] **Step 2: Run to verify it fails**

Run the file. Expected: FAIL, unable to find `about-tags`.

- [ ] **Step 3: Write the implementation**

In `components/AboutDeck.tsx`, add `tags: string[]`, `knownTags: string[]` and `onTags: (tags: string[]) => void` to `Props`, and render between `NoteSection` and `PodSection`:

```tsx
            <TagSection tags={tags} known={knownTags} onChange={onTags}/>
```

In `app/editRecipe.tsx`, pass `recipe.tags`, the library's tags, and `editTags` from the hook.

- [ ] **Step 4: Run the tests and make sure they pass**

Expected: PASS.

- [ ] **Step 5: Prove the test can fail**

Remove the `<TagSection .../>` line and confirm the test fails. Restore.

- [ ] **Step 6: Commit**

```bash
git add components/AboutDeck.tsx app/editRecipe.tsx components/__tests__ app/__tests__
git commit -m "Put the tag control on the about deck"
```

---

### Task 5: Finishing

- [ ] **Step 1: Confirm the vocabulary still has one home**

```bash
grep -rn "Washed\|Anaerobic\|Carbonic maceration\|Co-ferment" --include=*.ts --include=*.tsx . \
  | grep -v node_modules | grep -v beanTags | grep -v __tests__ | grep -v docs/
```

Expected: no output. A preset spelled anywhere else is the drift the single vocabulary exists to prevent.

Note that the companion grep for the *identifiers* has two legitimate answers now:

```bash
grep -rln "ROASTS\|PROCESSES\|FERMENTATIONS" --include=*.ts --include=*.tsx . \
  | grep -v node_modules | grep -v __tests__ | grep -v docs/
```

Expected: `beanTags.ts` (the definition), `intentTags.ts` (the derived reading) and `TagSection.tsx`
(the suggestion list, which offers the vocabulary alongside the user's own tags by decision).
Importing the list is the opposite of drift; respelling a preset is the drift.

- [ ] **Step 2: Confirm nothing writes a tag on the user's behalf**

```bash
grep -rn "setTags\|editTags" --include=*.ts --include=*.tsx . | grep -v node_modules | grep -v __tests__
```

Expected: `Recipe.ts` (the definition), `useRecipeLibrary.ts` (shelf filing), `useRecipeEditor.ts` (the new operation), the wiring in `editRecipe.tsx`, and comments in `app/index.tsx` and `TagSection.tsx`.

One further site is legitimate and will show up: `library/cloud/importPlan.ts:224`, which calls
`setTags` with the tags the *local* recipe already had, so that a cloud refresh preserves them.
xBloom has no concept of a tag, so this writes nothing new; it stops the refresh from erasing the
user's own work. Nothing else in an import path, a pod path or a brew path. A recipe's intent is
authored or it does not exist.

- [ ] **Step 3: Confirm nothing new reaches the card or the backup**

```bash
git diff origin/brew-history --stat -- library/backup.ts library/NFC.ts library/Recipe.ts
```

Expected: no changes to `backup.ts` or `NFC.ts`. Tags already round-trip through backup and were never written to the card; this plan adds no storage, so a diff here means something has gone wrong.

- [ ] **Step 4: Run the gate**

```bash
npm test
npm run typecheck
npm run lint
npx expo-doctor
```

`npm run lint` baseline is 0 errors and 17 warnings. `expo-doctor` is a hard failure in CI.

- [ ] **Step 5: Open the PR**

Base `brew-history`, head `intent-tags`. Say in the body that this has not been seen on a device, and that the thing to check when it is, is chip wrapping at large system font sizes with "Carbonic maceration" present.

---

## Self-review notes

Checked against the spec:

- One set of tags, intent a derived reading: Task 1.
- Three fields not four, origin excluded: Task 1, tested.
- One face: enforced by the absence of any face-switching code, and by Task 5 Step 1.
- Section after the note: Task 4.
- Suggestions from both sources, undifferentiated: Task 3, both tested.
- Written through `setTags`: Task 2, tested by mutation.
- Not written to the card, nothing automatic: Task 5 Steps 2 and 3.
- Empty state says nothing: Task 3, tested.
- Font-scale wrapping: Task 3 Step 3 names the constraint. It cannot be unit-tested and is the one thing on the device list.

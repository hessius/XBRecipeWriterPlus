# Package 2 — Papercuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five unrelated small defects in release 2.1.0 — an overflowing
button label, placeholders that read as entered values, the editor calling a
dripper a cup, the brew detail row clipping on the right, and a plain recipe
showing no grind size at all.

**Architecture:** Four of the five are copy or constant changes confined to one
or two files each. The fifth, the detail row, moves layout arithmetic into
`library/brew/figureGeometry.ts` as pure functions so the fit can be tested
without a renderer, then rebuilds the row in `components/BrewFigures.tsx` to
read those functions. The GRIND defect adds a third variant to the existing
`GrindFigure` union rather than branching in a component.

**Tech Stack:** TypeScript, React Native, Tamagui, Jest + @testing-library/react-native.

**Spec:** `docs/superpowers/specs/2026-10-07-release-2-1-0-design.md`, section
"Package 2 — papercuts". Where this plan and the spec disagree, the spec wins —
raise it rather than silently diverging.

---

## Before you start

Read these three repo rules; this package trips all of them.

1. **All colour comes from `constants/colors.ts`.** No hex literals in `app/` or
   `components/`. Task 3 edits the palette itself, which is the one place a hex
   literal belongs.
2. **No em dashes in user-facing copy, and avoid dashes generally.** They read
   as AI-written. This applies to every string in Tasks 1, 2 and 3. It does not
   apply to code comments or to this document.
3. **The suite runs twice**, as jest projects `ios` and `android`. Every test
   count you see is doubled. A file with 6 tests reports 12. Do not "fix" that.

Component tests are asynchronous in RNTL v14. `await` every `render`,
`fireEvent` and `renderHook`, and render through `renderWithProviders` from
`test-utils/render.tsx`. Forgetting the `await` leaves `screen` empty and the
test passes for the wrong reason.

---

## Task 0: Branch and baseline

**Files:** none.

- [ ] **Step 1: Cut the branch from current main**

```bash
cd /Users/jesperhessius/Dev/XBRecipeWriterPlus
git fetch origin
git checkout -b fix/package-2-papercuts origin/main
```

- [ ] **Step 2: Confirm the baseline is green before you touch anything**

Run: `npm run typecheck && npx jest --runTestsByPath components/__tests__/BrewFigures.test.tsx library/brew/__tests__/dialAfterBrew.test.ts`

Expected: typecheck silent, both suites pass.

If anything fails here it is pre-existing. Stop and report it; do not fix it
inside this branch.

> **Note on `npx expo-doctor`:** at time of writing main fails it because five
> Expo packages drifted a patch behind. That is being fixed on its own branch,
> `chore/expo-patch-bump`. If you see it, it is not yours.

---

## Task 1: (a) The SEND button overflows

`app/brewHistory.tsx` passes `HANDOFF_TARGETS[0].buttonLabel`, which is "Send to
Beanconqueror" — 170.6 pt of text in a row that must also hold a count and a
cancel, so it spills off the left.

`components/ExportButton.tsx` already decided against this in its own doc
comment: the history batch button prints `SEND`. The `accessibilityLabel` one
line above is already the full sentence. Somebody passed the long label past a
component that had already ruled it out.

**Only the history batch button changes.** `app/brew.tsx:546` and
`app/brewRecord.tsx:423` also pass `buttonLabel`, and there the long label is
right: those act on a single brew with no row context, so the button must say
where it is sending. Do not touch them, and do not change
`library/brew/handoff/targets.ts`.

**Files:**
- Modify: `app/brewHistory.tsx:194-206`

- [ ] **Step 1: Replace the label and the comment that defended it**

The comment immediately above currently argues *for* the long label, so it has
to go with it. Replace lines 194-206 (the comment block through the closing
`)}` of the `canSend` guard) with:

```tsx
                    {/* SEND, not the target's full label. This button sits
                        among the rows it acts on, so the destination is
                        already in view and the long label only costs width
                        the count and the cancel need. The screen reader hears
                        the whole sentence below, where there is no row in
                        earshot to supply it. */}
                    {canSend && (
                        <ExportButton
                            label="SEND"
                            accessibilityLabel="Send selected brews to Beanconqueror"
                            busy={busy}
                            disabled={count === 0 || tooLarge || blocked > 0}
                            onPress={onSend}
                        />
                    )}
```

- [ ] **Step 2: Drop the import if it is now unused**

`HANDOFF_TARGETS` may still be used elsewhere in the file. Check:

Run: `grep -n "HANDOFF_TARGETS" app/brewHistory.tsx`

If the only remaining hit is the `import` line, delete that import. If there
are other uses, leave it.

- [ ] **Step 3: Verify nothing asserted on the printed label**

Run: `npx jest --runTestsByPath app/__tests__/brewHistory.test.tsx`

Expected: PASS. The tests query by `accessibilityLabel`, which has not moved.

If a test fails because it asserted the printed text, update it to expect
`SEND` — that is the point of the change, not a regression.

- [ ] **Step 4: Commit**

```bash
git add app/brewHistory.tsx
git commit -m "Say SEND where the rows are already in view

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: (g) A brewer is not a cup

The recipe editor calls the dripper a cup, which collides with the cup the
coffee lands in. The editor's field title comes from `constants/recipeHelp.ts`'s
`cup` block, surfaced by `SegmentedRow topic="cup"` at `app/editRecipe.tsx:299`.

**Scope is the editor only.** `CompareWithSheet`, `app/brewCompare.tsx`,
`BrewJudgement`, `TeaBanner` and `constants/brewCopy.ts` all say "in the cup"
about grams of liquid, where cup is the right word and brewer would be wrong.
`BrewFigures`' `CUP` label is that same liquid figure. The collision is exactly
why the rename is confined.

**Do not rename the `cup` key itself**, nor `RECIPE_LABELS.CUP`, nor
`CUP_OPTIONS`, nor `CUP_TYPE`. Those are identifiers, not copy, and renaming
them churns the card format's vocabulary for no user-visible gain. The spec
names `CUP_OPTIONS` as a site to check; having checked, its labels are `XPOD`,
`OMNI` and `OTHER`, none of which contain the word. Nothing to do there.

**Files:**
- Modify: `constants/recipeHelp.ts:89-96`

- [ ] **Step 1: Rewrite the cup block's copy**

Replace lines 89-96 with:

```ts
    cup: {
        title:  "Brewer",
        hint:   "Other turns overflow protection off.",
        question: "Which brewer should I pick?",
        detail: "Omni is xBloom's own dripper, so the machine knows when " +
                "your cup is full and stops. Other is for third-party " +
                "brewers it cannot measure, so nothing stops it."
    },
```

Three deliberate non-changes in that block:

- The key stays `cup`.
- `hint` is unchanged; it names the setting's effect, not the object.
- `detail` keeps "your cup is full". There *cup* means the vessel the liquid
  lands in, which is correct and is the very distinction this task draws.

- [ ] **Step 2: Check nothing asserted the old title**

Run: `grep -rn '"Cup"' --include=*.ts --include=*.tsx app components constants library | grep -v node_modules`

Expected: no hits. If a test asserts `"Cup"`, update it to `"Brewer"`.

- [ ] **Step 3: Run the editor suite**

Run: `npx jest --runTestsByPath app/__tests__/editRecipe.test.tsx`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add constants/recipeHelp.ts
git commit -m "Call the dripper a brewer, where it is not the cup

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: (b) The placeholder reads as input

Two parts, because dimming alone cannot fix it.

What actually reads as input is the copy. `PodSection` writes its placeholder as
an example prefixed `e.g.`, and `palette.placeholder`'s own doc comment asks for
that convention. Five placeholders have drifted and read as values.

`RailSearch`, `ImportSheet` and `HubFilterSheet` are deliberately left alone:
those are labels for what the field does, not examples of what to type, and
`e.g.` would be a lie.

**Files:**
- Modify: `components/BeanNameSheet.tsx:88`
- Modify: `components/RenameSheet.tsx:85`
- Modify: `components/NameShelfSheet.tsx:106`
- Modify: `components/NoteSection.tsx:42`
- Modify: `components/BrewJudgement.tsx:77`
- Modify: `constants/colors.ts:68` and its doc comment above

- [ ] **Step 1: Prefix the five placeholders**

Exact replacements, one per file. Keep each value's existing casing; the `e.g.`
stays lowercase even before a capitalised example, matching `PodSection`'s
`"e.g. CGL12"`.

| File | From | To |
|---|---|---|
| `components/BeanNameSheet.tsx:88` | `placeholder="ETHIOPIA GUJI"` | `placeholder="e.g. ETHIOPIA GUJI"` |
| `components/RenameSheet.tsx:85` | `placeholder="Yirgacheffe"` | `placeholder="e.g. Yirgacheffe"` |
| `components/NameShelfSheet.tsx:106` | `placeholder="MORNINGS"` | `placeholder="e.g. MORNINGS"` |
| `components/NoteSection.tsx:42` | `placeholder="Sweet and light, good for mornings"` | `placeholder="e.g. Sweet and light, good for mornings"` |
| `components/BrewJudgement.tsx:77` | `placeholder="Sweet, a little thin. Grind finer."` | `placeholder="e.g. Sweet, a little thin. Grind finer."` |

- [ ] **Step 2: Take the token to its last available step**

`#868686` is today's value. The darkest value still clearing WCAG AA on the
lightest surface it appears over is `#7F7F7F`: 4.52:1 on `raised`, 4.73 on
`surface`, 5.21 on `base`. Seven steps out of 255, which nobody can see on its
own — it is the remaining headroom, spent rather than left.

In `constants/colors.ts`, replace `placeholder: "#868686",` with
`placeholder: "#7F7F7F",` and update the doc comment above it so the quoted
ratios match the new value. The comment currently reads "4.97:1 on `raised` and
better on `surface` and `base`". Replace that sentence with:

```
     * 4.52:1 on `raised`, 4.73 on `surface` and 5.21 on `base`, so it clears
     * the floor wherever a field is drawn while sitting far enough below `dim`
     * to read as an example rather than an entry. This is the darkest value
     * that still clears AA on the lightest surface it appears over, so there
     * is no headroom left: a placeholder that still reads as input has to be
     * fixed in its words. Call sites help by phrasing theirs as examples
     * ("e.g. CGL12"); the colour is not asked to carry that alone.
```

Leave the rest of the comment, including the sentence about the note field,
untouched.

- [ ] **Step 3: Write a test that pins the convention**

The point of this task is a convention, and a convention nobody checks drifts
again — which is how five placeholders got here. Pin it.

Create `components/__tests__/placeholderConvention.test.ts`:

```ts
import {readFileSync} from "node:fs";
import {join} from "node:path";

/**
 * Placeholders are examples, not values.
 *
 * `palette.placeholder` sits close enough to body text that a placeholder
 * phrased as a value reads as one somebody typed. The colour has no headroom
 * left to fix that, so the words have to: an example is prefixed `e.g.`.
 *
 * Three fields are exempt and named below. Those label what the field does
 * rather than exemplify what to type, and `e.g.` would be a lie about them.
 */
const EXAMPLE_FIELDS = [
    "components/BeanNameSheet.tsx",
    "components/RenameSheet.tsx",
    "components/NameShelfSheet.tsx",
    "components/NoteSection.tsx",
    "components/BrewJudgement.tsx",
    "components/PodSection.tsx"
];

const LABEL_FIELDS = [
    "components/RailSearch.tsx",
    "components/ImportSheet.tsx",
    "components/HubFilterSheet.tsx"
];

function placeholders(file: string): string[] {
    const source = readFileSync(join(__dirname, "..", "..", file), "utf8");
    return [...source.matchAll(/placeholder=(?:"([^"]*)"|\{"([^"]*)"\})/g)]
        .map((match) => match[1] ?? match[2]);
}

describe("placeholder convention", () => {
    it.each(EXAMPLE_FIELDS)("%s phrases its placeholder as an example", (file) => {
        const found = placeholders(file);
        expect(found.length).toBeGreaterThan(0);
        found.forEach((text) => expect(text).toMatch(/^e\.g\. /));
    });

    it.each(LABEL_FIELDS)("%s is exempt and says what the field does", (file) => {
        placeholders(file).forEach((text) => expect(text).not.toMatch(/^e\.g\. /));
    });
});
```

- [ ] **Step 4: Run it**

Run: `npx jest --runTestsByPath components/__tests__/placeholderConvention.test.ts`

Expected: PASS, 18 tests (9 distinct, doubled across the two projects).

If a `LABEL_FIELDS` file has no `placeholder=` at all the assertion loop is
empty and passes vacuously. Check the file still has one:

Run: `grep -n "placeholder=" components/RailSearch.tsx components/ImportSheet.tsx components/HubFilterSheet.tsx`

Expected: at least one hit per file. If a file has none, remove it from
`LABEL_FIELDS` rather than leaving a test that asserts nothing.

- [ ] **Step 5: Commit**

```bash
git add components/BeanNameSheet.tsx components/RenameSheet.tsx \
        components/NameShelfSheet.tsx components/NoteSection.tsx \
        components/BrewJudgement.tsx constants/colors.ts \
        components/__tests__/placeholderConvention.test.ts
git commit -m "Say for instance, so a placeholder is not mistaken for an answer

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: (i) The column arithmetic, as pure functions

On the finished brew the drawdown rate runs off the right edge. The cause is
arithmetic, not styling: at 402 pt with 16 pt padding and a 13 pt column gap,
three columns are 114.7 pt at scale 1.0, and the inline drawdown time plus its
recipe badge measures exactly 114.7 pt. It overflows by a hair, which is why it
looks like a rendering glitch rather than a layout decision.

**The design is four columns with unequal shares.** `DRAWDOWN` is the only
eight-character label and takes 1.4 flex shares; the other three take one each.
The rate stops being a badge on the drawdown column and becomes a column of its
own.

One string cannot survive that at large type: `RECIPE 58` needs about 99.8 pt
against the 71.7 pt its column would get at the 1.4 cap. **Above a text scale
of 1.2, fall back to three wide columns.** Four columns are a comfort large type
cannot afford, and the fallback is the design rather than a failure of it.

This task is the arithmetic alone, with no rendering. Doing it first means the
fit is provable before anything is drawn.

**Files:**
- Modify: `library/brew/figureGeometry.ts` (append)
- Create: `library/brew/__tests__/figureGeometry.test.ts` (there is none today)

- [ ] **Step 1: Write the failing test**

Create `library/brew/__tests__/figureGeometry.test.ts`:

```ts
import {
    brewFigureColumnWidths,
    brewFigureUsesFourColumns,
    BREW_FIGURE_FOUR_COLUMN_MAX_SCALE,
    brewFigureTextGeometry,
    brewFigureBadgeWidth
} from "@/library/brew/figureGeometry";
import {dotoTextWidth, DOTO_MIN_FONT_SIZE, DOTO_MAX_FONT_SCALE} from "@/library/dotoMetrics";

/**
 * The detail row on the narrowest screen the app supports: 402 pt of device
 * with 16 pt of padding each side.
 *
 * Measured rather than asserted as a magic number, because the whole defect
 * this pins was a column that was 0.0 pt too narrow. A snapshot test would
 * have passed happily while the text clipped, which is how it shipped.
 */
const CONTENT_WIDTH = 402 - 16 * 2;

function labelWidth(text: string, fontScale: number): number {
    const geometry = brewFigureTextGeometry();
    return dotoTextWidth(
        text, geometry.labelSize, fontScale, geometry.labelTracking, DOTO_MIN_FONT_SIZE
    );
}

describe("detail row columns", () => {
    it("gives four columns at the default text size", () => {
        expect(brewFigureUsesFourColumns(1)).toBe(true);
        expect(brewFigureColumnWidths(CONTENT_WIDTH, 1)).toHaveLength(4);
    });

    it("falls back to three above the threshold, and not at it", () => {
        expect(brewFigureUsesFourColumns(BREW_FIGURE_FOUR_COLUMN_MAX_SCALE)).toBe(true);
        expect(brewFigureUsesFourColumns(BREW_FIGURE_FOUR_COLUMN_MAX_SCALE + 0.01))
            .toBe(false);
        expect(brewFigureColumnWidths(CONTENT_WIDTH, DOTO_MAX_FONT_SCALE))
            .toHaveLength(3);
    });

    it("fits every label in four columns at the default size", () => {
        const [grind, delay, drawdown, rate] = brewFigureColumnWidths(CONTENT_WIDTH, 1);
        expect(labelWidth("GRIND", 1)).toBeLessThanOrEqual(grind);
        expect(labelWidth("DELAY", 1)).toBeLessThanOrEqual(delay);
        expect(labelWidth("DRAWDOWN", 1)).toBeLessThanOrEqual(drawdown);
        expect(labelWidth("RATE", 1)).toBeLessThanOrEqual(rate);
    });

    it("fits DRAWDOWN at the threshold, which is why it is wider", () => {
        const scale = BREW_FIGURE_FOUR_COLUMN_MAX_SCALE;
        const [, , drawdown] = brewFigureColumnWidths(CONTENT_WIDTH, scale);
        expect(labelWidth("DRAWDOWN", scale)).toBeLessThanOrEqual(drawdown);
    });

    it("fits the recipe badge in four columns at the default size", () => {
        const [grind] = brewFigureColumnWidths(CONTENT_WIDTH, 1);
        expect(brewFigureBadgeWidth("RECIPE 58", 1)).toBeLessThanOrEqual(grind);
    });

    it("is the recipe badge that forces the fallback", () => {
        // The reason the threshold exists at all. If this ever passes, the
        // badge got shorter or the row got wider and the fallback could go.
        const scale = DOTO_MAX_FONT_SCALE;
        const fourWide = brewFigureColumnWidths(CONTENT_WIDTH, 1)[0];
        expect(brewFigureBadgeWidth("RECIPE 58", scale)).toBeGreaterThan(fourWide);

        const [grind] = brewFigureColumnWidths(CONTENT_WIDTH, scale);
        expect(brewFigureBadgeWidth("RECIPE 58", scale)).toBeLessThanOrEqual(grind);
    });

    it("fits every label in the three column fallback at the cap", () => {
        const scale = DOTO_MAX_FONT_SCALE;
        const [grind, delay, drawdown] = brewFigureColumnWidths(CONTENT_WIDTH, scale);
        expect(labelWidth("GRIND", scale)).toBeLessThanOrEqual(grind);
        expect(labelWidth("DELAY", scale)).toBeLessThanOrEqual(delay);
        expect(labelWidth("DRAWDOWN", scale)).toBeLessThanOrEqual(drawdown);
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest --runTestsByPath library/brew/__tests__/figureGeometry.test.ts`

Expected: FAIL. TypeScript cannot resolve `brewFigureColumnWidths`,
`brewFigureUsesFourColumns` or `BREW_FIGURE_FOUR_COLUMN_MAX_SCALE`.

- [ ] **Step 3: Implement**

Append to `library/brew/figureGeometry.ts`:

```ts
/**
 * The text scale above which the detail row drops to three columns.
 *
 * Four columns hold at the default size and up to here. Past it the only
 * string that cannot follow is the `RECIPE nn` badge, which needs about
 * 99.8 pt at the 1.4 accessibility cap against the 71.7 pt a quarter of the
 * row would give it. Nothing is truncated and nothing is abbreviated; the row
 * simply spends its width on three columns instead of four.
 *
 * Exact, and here rather than inline at the call site, so the fallback is a
 * documented threshold both the layout and its test read from one place.
 */
export const BREW_FIGURE_FOUR_COLUMN_MAX_SCALE = 1.2;

/**
 * DRAWDOWN is the only eight-character label in the row, so its column is
 * wider than the others rather than the row being sized for its longest word.
 */
export const BREW_FIGURE_DRAWDOWN_FLEX = 1.4;

/** Whether the detail row can afford four columns at this text scale. */
export function brewFigureUsesFourColumns(fontScale: number): boolean {
    return fontScale <= BREW_FIGURE_FOUR_COLUMN_MAX_SCALE;
}

/** The flex shares the detail row's columns take, left to right. */
export function brewFigureColumnFlex(fontScale: number): number[] {
    return brewFigureUsesFourColumns(fontScale)
        ? [1, 1, BREW_FIGURE_DRAWDOWN_FLEX, 1]
        : [1, 1, 1];
}

/**
 * What each detail column actually measures, so a test can ask whether the
 * text fits instead of looking at a picture of it.
 *
 * @param contentWidth the row's width, after the screen's padding.
 * @param fontScale the user's text scale, which decides the column count.
 * @param scale the story card's shrink from the reference width.
 */
export function brewFigureColumnWidths(
    contentWidth: number,
    fontScale: number,
    scale = 1
): number[] {
    const flex = brewFigureColumnFlex(fontScale);
    const free = contentWidth - BREW_FIGURE_COLUMN_GAP * scale * (flex.length - 1);
    const total = flex.reduce((sum, share) => sum + share, 0);
    return flex.map((share) => (free * share) / total);
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx jest --runTestsByPath library/brew/__tests__/figureGeometry.test.ts`

Expected: PASS.

If "is the recipe badge that forces the fallback" fails, **do not change the
threshold to make it green.** It is the test that justifies the threshold
existing. Report the measurement you actually got.

- [ ] **Step 5: Commit**

```bash
git add library/brew/figureGeometry.ts library/brew/__tests__/figureGeometry.test.ts
git commit -m "Measure the detail row before drawing it

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: The GRIND defect

Found in the screenshot that reported (i), not in the original list: a plain
recipe showed no grind size at all.

`dialNote()` in `library/brew/dialAfterBrew.ts` stays silent when the grinder
ran but no post-brew dial reading arrived. That silence enforces a real rule: a
*dial reading* is a measurement and must be post-brew, because a pre-brew
reading is a guess dressed as an observation.

**The rule is right and the silence is wrong**, because it throws away something
we do know. The recipe's grind size is snapshotted on the record. Show it, in
the dashed outline that already means asked-for rather than confirmed. This
consciously overturns the silence while keeping the rule that produced it.

**Files:**
- Modify: `library/brew/dialAfterBrew.ts` — `GrindFigure` and `dialNote`
- Modify: `components/BrewFigures.tsx:313-318` — only enough to compile; Task 6 draws it properly
- Test: `library/brew/__tests__/dialAfterBrew.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `library/brew/__tests__/dialAfterBrew.test.ts`, inside the existing
`dialNote` describe block if there is one. Use the file's existing record
factory; the literal below assumes one called `record()` that fills the rest.

```ts
    it("falls back to the recipe's own grind when no dial reading arrived", () => {
        const figure = dialNote(record({
            grinderUsed: true, pouringAt: 1, grindSize: 58, dialAfter: undefined
        }));
        expect(figure).toEqual({kind: "recipe", recipe: 58});
    });

    it("prefers the confirmed dial over the recipe when it has one", () => {
        const figure = dialNote(record({
            grinderUsed: true, pouringAt: 1, grindSize: 58, dialAfter: 62
        }));
        expect(figure).toEqual({kind: "dial", dial: 62, recipe: 58});
    });

    it("still says nothing when the grinder never ran", () => {
        // The fallback is about a missing reading, not a missing grind. A brew
        // that ground nothing has no grind to report whatever the recipe said.
        expect(dialNote(record({
            grinderUsed: undefined, pouringAt: 0, grindSize: 58, dialAfter: undefined
        }))).toBeNull();
    });

    it("still says nothing when the recipe grind is not a real setting", () => {
        expect(dialNote(record({
            grinderUsed: true, pouringAt: 1, grindSize: undefined, dialAfter: undefined
        }))).toBeNull();
    });

    it("prefers the off fact over the recipe fallback", () => {
        expect(dialNote(record({
            grinderUsed: false, pouringAt: 1, grindSize: 58, dialAfter: undefined
        }))).toEqual({kind: "off"});
    });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest --runTestsByPath library/brew/__tests__/dialAfterBrew.test.ts`

Expected: FAIL. The first test gets `null` where it wants
`{kind: "recipe", recipe: 58}`. The last three should already pass; they are
there to pin that this change does not widen past its case.

- [ ] **Step 3: Add the variant**

In `library/brew/dialAfterBrew.ts`, extend the union:

```ts
export type GrindFigure =
    | {kind: "off"}
    | {
        kind: "dial";
        dial: number;
        recipe: number | null;
    }
    | {
        /**
         * No dial reading arrived, so this is the recipe's own setting: what
         * was asked for rather than what was confirmed. Surfaces must draw it
         * in the dashed outline that already carries that distinction.
         */
        kind: "recipe";
        recipe: number;
    };
```

- [ ] **Step 4: Replace the silent return**

In `dialNote`, replace:

```ts
    const after = record.dialAfter ?? 0;
    if (after <= 0) return null;
```

with:

```ts
    const after = record.dialAfter ?? 0;
    if (after <= 0) {
        // No confirmed reading. The post-brew rule still holds and this is not
        // being presented as one: the recipe's own setting is what was asked
        // for, drawn in an outline that says so. Reporting it is strictly more
        // than the silence this replaced, which threw away a fact we had.
        return typeof recipeGrind === "number" && grindBand(recipeGrind) !== undefined
            ? {kind: "recipe", recipe: recipeGrind}
            : null;
    }
```

- [ ] **Step 5: Update the doc comment**

`dialNote`'s doc comment lists four rules. The third currently reads "**Only the
post-brew reading may be reported.**" Replace that bullet with:

```
 * - **Only the post-brew reading may be reported as a dial.** The pre-send one
 *   may have been taken before the machine caught up with a dial that had just
 *   been moved, so a record holding only that cannot be presented as fact. A
 *   record with no post-brew reading falls back to the recipe's own grind as
 *   `recipe`, which is not a reading and must not be drawn as one.
```

- [ ] **Step 6: Run and watch them pass**

Run: `npx jest --runTestsByPath library/brew/__tests__/dialAfterBrew.test.ts`

Expected: PASS.

- [ ] **Step 7: Let the compiler find every surface, and satisfy them**

Run: `npm run typecheck`

Expected: **one error**, in `components/BrewFigures.tsx`, where the grind value
reads `String(grind.dial)` on a figure that may now have no `dial`. That error
is the point of a union: the compiler names every surface that has to decide
what to do with the new variant.

Give it the minimal honest answer now; Task 6 gives it the outline. Change the
grind `Figure`'s `value` prop at `components/BrewFigures.tsx:313` from:

```tsx
                                    value={grind.kind === "off" ? "OFF" : String(grind.dial)}
```

to:

```tsx
                                    value={grind.kind === "off"
                                        ? "OFF"
                                        : String(grind.kind === "recipe"
                                            ? grind.recipe
                                            : grind.dial)}
```

and the `badge` prop's guard on the next lines from
`grind.kind === "off" || grind.recipe === null` to
`grind.kind !== "dial" || grind.recipe === null`, so a recipe-only figure does
not also hang a `RECIPE nn` badge off a value that already is the recipe.

Re-run `npm run typecheck`. Expected: silent.

- [ ] **Step 8: Read the two call sites that branch on `kind`**

Neither should need changing. Say so explicitly in your report rather than
assuming it:

- `app/brewRecord.tsx:85` — `withoutRecipeBadge` returns the figure unchanged
  for any kind other than `"dial"`. Correct: on a `"recipe"` figure the number
  *is* the value, not a badge, so suppressing the badge must not blank it.
- `app/brewRecord.tsx:620` — the story card's fit check is
  `grind?.kind === "dial" && grind.recipe !== null`. Correct: a `"recipe"`
  figure has no separate badge row to make room for.

`library/brew/storyCard.ts` does not take a `GrindFigure` at all; it mentions
`dialNote` only in a comment. Nothing to do there.

If either call site turns out to need a change, make it and say why.

- [ ] **Step 9: Run the brew record and figures suites**

Run: `npx jest --runTestsByPath library/brew/__tests__/dialAfterBrew.test.ts components/__tests__/BrewFigures.test.tsx app/__tests__/brewRecord.test.tsx`

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add library/brew/dialAfterBrew.ts library/brew/__tests__/dialAfterBrew.test.ts \
        components/BrewFigures.tsx
git commit -m "Say what the recipe asked for, when the machine never said

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: (i) The four column detail row

Now draw it. Each column becomes **label / value / optional quiet line**.

The rate stops being a badge hung off the drawdown value and becomes the fourth
column. Its unit moves off the value line onto the quiet line, which is what
keeps that column narrow enough to exist.

**The quiet line is all or nothing, and the recipe badge decides.** When there
is a recipe badge to carry, the quiet line exists: the badge sits on it under
GRIND, and `G/S` sits on it under RATE. When there is no recipe badge, the whole
quiet line is dropped and the `RATE` label absorbs the unit instead, reading
`RATE G/S` over a bare `1.0`.

**Files:**
- Modify: `components/BrewFigures.tsx` — `Figure` (`:136-173`), `BrewFigures` (`:185-230`), the detail row (`:292-370`)
- Test: `components/__tests__/BrewFigures.test.tsx`

- [ ] **Step 1: Rewrite `Figure` and `FigurePlaceholder`**

`Figure` gains four props: `flex` (so the drawdown column can be wider),
`quiet` (a third line under the value), `outlined` (the dashed treatment Task 5
needs) and `textScale` (so it can size its own dashed border).

`badge` stays. The bypass badge on the top row at `:194` still uses it, and it
means something different: beside the value rather than below it.

Replace `components/BrewFigures.tsx:136-178` — the whole of `Figure` and
`FigurePlaceholder` — with:

```tsx
function Figure({
    label, value, color, badge, badgeGap, fontSize, labelSize, labelTracking, valueTracking,
    testID, accessibilityLabel, flex = 1, quiet, outlined = false, textScale = 1
}: {
    label: string;
    value: string;
    color: string;
    badge?: React.ReactNode;
    badgeGap: number;
    fontSize: number;
    labelSize?: number;
    labelTracking?: number;
    valueTracking?: number;
    testID?: string;
    accessibilityLabel?: string;
    /** The column's share of the row. DRAWDOWN takes more; see `figureGeometry`. */
    flex?: number;
    /**
     * A third line under the value, in label colour.
     *
     * Separate from `badge`, which sits beside the value: the detail row needs
     * its extra text below, where it costs height the row already has rather
     * than width the row does not.
     */
    quiet?: React.ReactNode;
    /**
     * Draw the value in the dashed outline that means asked for rather than
     * confirmed. Used by the grind figure when the machine never reported a
     * dial and the recipe's own setting is all the record can say.
     */
    outlined?: boolean;
    textScale?: number;
}) {
    const badgeGeometry = brewFigureBadgeGeometry(textScale);
    const valueText = (
        <DotMatrixText fontSize={fontSize} weight="bold" color={color}
                       letterSpacing={valueTracking ?? 0.5}
                       numberOfLines={1}>
            {value}
        </DotMatrixText>
    );
    return (
        <YStack flex={flex} gap={BREW_FIGURE_INTERNAL_GAP} testID={testID}
                minWidth={0}
                accessible={accessibilityLabel !== undefined}
                accessibilityLabel={accessibilityLabel}>
            <DotMatrixText fontSize={labelSize ?? BREW_FIGURE_LABEL_SIZE}
                           weight="bold" numberOfLines={1}
                           letterSpacing={labelTracking ?? 1.6} color={palette.dim}>
                {label}
            </DotMatrixText>
            <XStack testID={testID === undefined ? undefined : `${testID}-value-row`}
                    alignItems="center" gap={badgeGap}>
                {outlined ? (
                    <XStack testID={testID === undefined ? undefined : `${testID}-outline`}
                            borderWidth={badgeGeometry.borderWidth}
                            borderStyle="dashed" borderColor={palette.line}
                            borderRadius={badgeGeometry.borderRadius}
                            paddingHorizontal={badgeGeometry.paddingHorizontal}
                            alignSelf="flex-start" flexShrink={0}>
                        {valueText}
                    </XStack>
                ) : valueText}
                {badge}
            </XStack>
            {quiet}
        </YStack>
    );
}

function FigurePlaceholder({testID, flex = 1}: {testID: string; flex?: number}) {
    return <YStack testID={testID} flex={flex} />;
}
```

- [ ] **Step 2: Check `FigureBadge` cannot be squeezed**

A badge on the quiet line must be measured, not compressed. Look at the
`XStack` inside `FigureBadge` (around `:120`). If it has no `flexShrink`, add
`flexShrink={0}`. If it already has one, leave it.

- [ ] **Step 3: Rebuild the detail row**

Replace the whole `<XStack testID="figures-detail-row" ...>` block
(`components/BrewFigures.tsx:297-369`, from the opening tag to its closing
`</XStack>`) with the following.

Four things to notice before you paste it:

- The flex shares come from `brewFigureColumnFlex(textScale)`, not from
  literals, so the row and Task 4's test cannot disagree.
- `figures-drawdown-rate` keeps its testID even though it is now a column
  rather than a badge. Two tests in `app/__tests__/brewRecord.test.tsx` assert
  it, and they still mean the right thing.
- `hasQuietLine` is computed once and governs both columns. It is the only
  thing that decides whether the row is three lines tall or two.
- The three columns in the fallback are GRIND, DELAY and DRAWDOWN. The rate
  rejoins drawdown as its quiet line there, which is what it was before this
  change — so the fallback is the old layout, and the old layout's one defect
  is gone because the badge is no longer inline.

```tsx
                        <XStack testID="figures-detail-row" gap={figureText.columnGap}>
                            {/* TIME is the right figure above, and DRAWDOWN is
                                also a duration, so the right column rhymes. */}
                            {grind === null ? (
                                <FigurePlaceholder testID="figures-grind-placeholder"
                                                   flex={columnFlex[0]} />
                            ) : (
                                <Figure
                                    testID="figures-grind"
                                    flex={columnFlex[0]}
                                    label="GRIND"
                                    value={grindValue}
                                    outlined={grind.kind === "recipe"}
                                    color={palette.text}
                                    fontSize={figureText.detailValueSize}
                                    badgeGap={badgeGeometry.gap}
                                    textScale={textScale}
                                    labelSize={figureText.labelSize}
                                    labelTracking={figureText.labelTracking}
                                    valueTracking={figureText.valueTracking}
                                    quiet={recipeBadgeText === null ? undefined : (
                                        <FigureBadge testID="figures-grind-recipe"
                                                     textScale={textScale}>
                                            {recipeBadgeText}
                                        </FigureBadge>
                                    )}
                                    accessibilityLabel={grindAccessibility}
                                />
                            )}
                            {delay === null ? (
                                <FigurePlaceholder testID="figures-delay-placeholder"
                                                   flex={columnFlex[1]} />
                            ) : (
                                <Figure
                                    testID="figures-delay"
                                    flex={columnFlex[1]}
                                    label="DELAY"
                                    value={`+${delay}`}
                                    color={palette.warn}
                                    fontSize={figureText.detailValueSize}
                                    badgeGap={badgeGeometry.gap}
                                    textScale={textScale}
                                    labelSize={figureText.labelSize}
                                    labelTracking={figureText.labelTracking}
                                    valueTracking={figureText.valueTracking}
                                    accessibilityLabel={delayAccessibility}
                                />
                            )}
                            {drawdownText === null ? (
                                <FigurePlaceholder testID="figures-drawdown-placeholder"
                                                   flex={columnFlex[2]} />
                            ) : (
                                <Figure
                                    testID="figures-drawdown"
                                    flex={columnFlex[2]}
                                    label="DRAWDOWN"
                                    value={drawdownText}
                                    color={palette.text}
                                    fontSize={figureText.detailValueSize}
                                    badgeGap={badgeGeometry.gap}
                                    textScale={textScale}
                                    labelSize={figureText.labelSize}
                                    labelTracking={figureText.labelTracking}
                                    valueTracking={figureText.valueTracking}
                                    quiet={rateInDrawdown === null ? undefined : (
                                        <DotMatrixText
                                            testID="figures-drawdown-rate"
                                            fontSize={badgeGeometry.fontSize}
                                            weight="bold" color={palette.dim}
                                            letterSpacing={badgeGeometry.tracking}
                                            numberOfLines={1}>
                                            {`${rateInDrawdown} G/S`}
                                        </DotMatrixText>
                                    )}
                                    accessibilityLabel={drawdownAccessibility}
                                />
                            )}
                            {rateColumn !== null && (
                                <Figure
                                    testID="figures-rate"
                                    flex={columnFlex[3]}
                                    label={hasQuietLine ? "RATE" : "RATE G/S"}
                                    value={rateColumn}
                                    color={palette.text}
                                    fontSize={figureText.detailValueSize}
                                    badgeGap={badgeGeometry.gap}
                                    textScale={textScale}
                                    labelSize={figureText.labelSize}
                                    labelTracking={figureText.labelTracking}
                                    valueTracking={figureText.valueTracking}
                                    quiet={hasQuietLine ? (
                                        <DotMatrixText
                                            testID="figures-drawdown-rate"
                                            fontSize={badgeGeometry.fontSize}
                                            weight="bold" color={palette.dim}
                                            letterSpacing={badgeGeometry.tracking}
                                            numberOfLines={1}>
                                            G/S
                                        </DotMatrixText>
                                    ) : undefined}
                                    accessibilityLabel={drawdownAccessibility}
                                />
                            )}
                        </XStack>
```

- [ ] **Step 4: Derive the six new values in the component body**

Add this block to `BrewFigures`' body, immediately after the existing
`const grindAccessibility = ...` declaration (around `:228`):

```tsx
    // Four columns normally, three once the text is large enough that the
    // recipe badge can no longer fit a quarter of the row. The threshold and
    // the shares both live in `figureGeometry`, so what is drawn and what is
    // measured cannot drift apart.
    const fourColumns = brewFigureUsesFourColumns(textScale);
    const columnFlex = brewFigureColumnFlex(textScale);
    const grindValue = grind === null
        ? ""
        : grind.kind === "off"
            ? "OFF"
            : String(grind.kind === "recipe" ? grind.recipe : grind.dial);
    const recipeBadgeText = grind === null || grind.kind !== "dial"
            || grind.recipe === null
        ? null
        : `RECIPE ${grind.recipe}`;
    // The quiet line is all or nothing. It exists to carry the recipe badge;
    // with no badge to carry there is nothing worth a third line, so the rate's
    // unit goes up into its own label instead and the row stays two lines tall.
    const hasQuietLine = fourColumns && recipeBadgeText !== null;
    const rateColumn = fourColumns ? drawdownRateText : null;
    const rateInDrawdown = fourColumns ? null : drawdownRateText;
```

Add the two new imports to the `figureGeometry` import block at the top:

```tsx
    brewFigureUsesFourColumns,
    brewFigureColumnFlex,
```

- [ ] **Step 5: Update the drawdown accessibility label**

The rate is now a separate column but it is still one spoken fact. The existing
`drawdownAccessibility` already says "Drawdown, N seconds, average X grams per
second", which remains correct and is passed to both columns above. **Leave it
as it is**, and do not add a second label for the rate column: two columns
carrying the same sentence is deliberate, so a screen reader hears the pair
together however it lands on them.

- [ ] **Step 6: Write the tests**

Append to `components/__tests__/BrewFigures.test.tsx`, inside the top-level
`describe("BrewFigures", ...)`. The file renders `BrewFigures` directly through
`renderWithProviders`; there is no shared helper, so this adds a small local one
rather than inventing a convention the file does not have.

Add `DOTO_MAX_FONT_SCALE` to the existing `@/library/dotoMetrics` import, or add
the import if the file has none.

```tsx
    describe("the detail row's columns", () => {
        /** The three figures above are required props and say nothing here. */
        const detail = (props: Partial<React.ComponentProps<typeof BrewFigures>>) =>
            renderWithProviders(
                <BrewFigures water={182} cup={174} seconds={126}
                             accent={TEST_ACCENT} drawdown={30} {...props} />
            );

        it("gives the rate its own column at the default text size", async () => {
            await detail({
                drawdownRate: 1.04, grind: {kind: "dial", dial: 62, recipe: 58}
            });
            expect(screen.getByTestId("figures-rate")).toBeTruthy();
            expect(screen.getByText("RATE")).toBeTruthy();
            expect(screen.getByTestId("figures-grind-recipe")).toBeTruthy();
        });

        it("drops the quiet line and moves the unit into the label with no badge",
            async () => {
                await detail({
                    drawdownRate: 1.04, grind: {kind: "dial", dial: 62, recipe: null}
                });
                expect(screen.getByText("RATE G/S")).toBeTruthy();
                expect(screen.queryByText("RATE")).toBeNull();
                expect(screen.queryByTestId("figures-grind-recipe")).toBeNull();
            });

        it("falls back to three columns above the threshold", async () => {
            await detail({
                drawdownRate: 1.04, textScale: DOTO_MAX_FONT_SCALE,
                grind: {kind: "dial", dial: 62, recipe: 58}
            });
            // The rate rejoins drawdown as its quiet line, which is the layout
            // large type can afford. It is still said, just not in a column.
            expect(screen.queryByTestId("figures-rate")).toBeNull();
            expect(screen.getByTestId("figures-drawdown-rate")).toBeTruthy();
        });

        it("still says nothing about a rate nobody could measure", async () => {
            await detail({
                drawdownRate: null, grind: {kind: "dial", dial: 62, recipe: 58}
            });
            expect(screen.queryByTestId("figures-rate")).toBeNull();
            expect(screen.queryByTestId("figures-drawdown-rate")).toBeNull();
        });

        it("draws a recipe-only grind in the outline that means asked for",
            async () => {
                // Task 5's variant, seen from the renderer. The outline is the
                // whole distinction: 58 plain would read as a measurement.
                await detail({grind: {kind: "recipe", recipe: 58}});
                expect(screen.getByText("58")).toBeTruthy();
                expect(screen.getByTestId("figures-grind-outline")).toBeTruthy();
                expect(screen.queryByTestId("figures-grind-recipe")).toBeNull();
            });

        it("draws a confirmed dial without the outline", async () => {
            await detail({grind: {kind: "dial", dial: 62, recipe: 58}});
            expect(screen.queryByTestId("figures-grind-outline")).toBeNull();
        });
    });
```

The last two tests are how Task 5's new variant reaches a screen. Task 5 proved
`dialNote` returns it; these prove the row draws it, and draws it differently
from a confirmed dial.

- [ ] **Step 7: Run the component tests**

Run: `npx jest --runTestsByPath components/__tests__/BrewFigures.test.tsx components/__tests__/BrewFigures.storyScale.test.tsx app/__tests__/brewRecord.test.tsx`

Expected: PASS.

`app/__tests__/brewRecord.test.tsx:1123` and `:1134` assert
`figures-drawdown-rate` is present. They should still pass: at default scale it
is now the RATE column's quiet line, which carries the same testID. If they fail
because the default scale in that test is above 1.2, read the test before
changing anything — the fallback engaging is correct behaviour.

- [ ] **Step 8: Commit**

```bash
git add components/BrewFigures.tsx components/__tests__/BrewFigures.test.tsx
git commit -m "Give the drawdown rate a column of its own

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 7: The full gate

**Files:** none, unless something fails.

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`

Expected: silent.

- [ ] **Step 2: Lint**

Run: `npm run lint`

Expected: 0 errors. There are around 26 pre-existing warnings; that is the
baseline, not a regression. If your count is higher, the new ones are yours.

- [ ] **Step 3: The whole suite**

Run: `npm test`

Expected: all suites pass, in both the `ios` and `android` projects.

- [ ] **Step 4: expo-doctor**

Run: `npx expo-doctor`

Expected: 21/21. If it reports packages out of date, that is the pre-existing
drift noted in Task 0 and is not this branch's to fix.

- [ ] **Step 5: Report, do not push**

Summarise what changed and stop. **Do not open a pull request and do not merge
one.** The repo owner opens PRs himself.

Two things to raise explicitly in the report:

1. **A divergence worth confirming.** When asked about the no-badge case the
   owner said "no visible unit for the drawdown rate", and the approved spec
   instead has the `RATE` label absorb it, reading `RATE G/S` over a bare
   `1.0`. This plan follows the spec. If that was not the intent, the fix is
   one line in `components/BrewFigures.tsx` and the test beside it.
2. **The GRIND fallback is visible on a real device in a way tests cannot
   check.** A dashed outline around a value is a treatment this row has not
   used before. It wants a look on hardware before it ships.

---

## What this plan does not do

Named so a reader does not go looking for them:

- **`library/brew/storyCard.ts`** is untouched. The shared card's grind row
  already measures the badge it draws, and the new `"recipe"` variant has no
  badge, so its fit logic is correct unchanged. Task 5 Step 7 confirms this
  rather than assuming it.
- **`library/brew/handoff/targets.ts`** keeps "Send to Beanconqueror". Two other
  screens still print it and are right to.
- **The three exempt placeholders** stay as they are, pinned by the test in
  Task 3 so a future tidy-up cannot sweep them in.
- **Idea j, the scroll affordance**, is package 3 and has its own plan.

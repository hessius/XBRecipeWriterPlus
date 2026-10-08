# Package 6 — quick edits

Adjust a recipe for one brew without saving the change.

Spec: `docs/superpowers/specs/2026-10-07-release-2-1-0-design.md` §"Package 6 —
quick edits". Read it before starting. This plan adds the decisions the spec
left open and the file-level detail needed to execute.

## What is being built

Four knobs. **Dose, ratio and grind are absolute**; you set the value.
**Temperature is an offset** applied to every stage, because a recipe's stage
temperatures are a shape (92, 90, 88) and the user wants the shape moved, not
flattened.

Two doors: the editor's BREW button splits (tap the word to brew as saved, tap
the chevron to open quick edits), and the home screen's swipe action tray
replaces SHARE with quick edit. The panel grows upward out of the editor's
action bar. Nothing is persisted; the panel opens at the saved recipe every
time.

## Decisions this plan makes

### The deviation is stored, not just a flag

The spec says both "shows changed figures with dashed badges" and "an explicit
`adjusted` flag, following the `watched` precedent". Those are incompatible: a
boolean says *that* something was adjusted, not *which* figures changed, so
nothing can decide which badges to dash. Comparing against the saved recipe at
render time is not available either, because the recipe may have been edited or
deleted since, which is exactly why the record snapshots its values.

So the record stores the deviation. Approved by the user on 2026-10-08.

### The storage sentinel is 0, as the house rule already requires

Every optional numeric in `brews` is `NOT NULL DEFAULT 0`, with `0` the storage
sentinel and `hydrate` the single place it is translated back to absence. That
rule happens to fit perfectly here: a dose of 0 is impossible, a ratio of 0 is
impossible, a grind of 0 is impossible (the band is 40 to 80), and a temperature
offset of 0 means no adjustment, which is the same thing as absence. So no new
sentinel convention is needed.

### What is stored is the recipe's own value, not the delta

For dose, ratio and grind the record stores the **saved recipe's** value, so the
figure can render the brewed value dashed with "recipe 72" beside it. The brewed
value is what the record already snapshots. For temperature the record stores
the **signed offset**, because the baseline is per stage and the offset is the
single number that describes the whole move.

### The adjustment travels as a route parameter, never on the Recipe

`/brew` already carries `recipeJSON`, so the adjusted Recipe itself travels
free. The adjustment description travels as a **separate route parameter**. It
must not become a field on `Recipe`: `Recipe` is serialised into backups and
into the editor's own drafts, and a value that must never be saved has no
business on a model whose constructor is deliberately forgiving.

## Tasks

---

### Task 1 — the pure quick-edit domain

**Files:** new `library/quickEdit.ts`, new `library/__tests__/quickEdit.test.ts`,
and an edit to `library/cardLimits.ts`.

`library/` is plain TypeScript with no React. All of this task is pure and fully
testable without a renderer.

**Export `RATIO` from `library/cardLimits.ts`.** It is currently private
(`library/cardLimits.ts:27`) while `DOSE`, `GRIND_SIZE` and `TEMPERATURE` beside
it are exported. The panel needs all four bounds.

**Add `cloneRecipe(recipe: Recipe): Recipe`.** There is no copy helper today;
the only working mechanism is a serialisation round trip through the JSON
constructor, `new Recipe(undefined, JSON.stringify(recipe))`
(`library/Recipe.ts:291`). Wrap that so the quick-edit path has one named,
tested clone rather than the idiom scattered around.

Test that the clone is genuinely independent (mutating the copy's `pours[0]`
does not touch the original) and, importantly, that `backup`, `offline_backup`
and `uid` survive the round trip. Those hold raw card bytes for the restore
feature and the repo's contributor instructions require preserving them through
any serialisation change. If they do not survive, that is a finding to report,
not something to paper over.

**Define the adjustment type.**

```ts
export type QuickEditAdjustments = {
    dose?: number;        // absolute grams
    ratio?: number;       // absolute
    grind?: number;       // absolute, 40 to 80, or GRINDER_OFF_VALUE (81)
    tempOffset?: number;  // signed degrees C, applied to every stage
};
```

A field is present only when it differs from the saved recipe. An empty object
means no adjustment, and the caller must treat it as such.

**`applyQuickEdit(recipe: Recipe, adjustments: QuickEditAdjustments): Recipe`.**
Clones, applies, and returns the clone. Never mutates its argument. Order
matters:

1. Apply `grind` if present. Nothing downstream of it changes.
2. Apply `tempOffset` if present, mapping over `recipe.pours` and setting each
   `pour.temperature`. Each stage **clamps independently** against `TEMPERATURE`
   (39 to 99), so the offset **saturates** rather than overflowing: a +5 on a
   recipe already at 97 raises what it can and leaves the rest. There is no
   Recipe-level temperature helper today, so this maps over `pours` directly.
3. Apply `dose` and/or `ratio` if present, then call `autoFixPourVolumes()`,
   because the machine rejects a recipe unless stage volumes sum to
   `dose x ratio`.

Note that `autoFixPourVolumes()` special-cases tea: it sets every stage to 90 ml
and then calls `fixRatio()` (`library/Recipe.ts:883-890`), which **recomputes
the ratio**. So on a tea recipe the ratio the user set may not be the ratio that
results. Test this explicitly and decide, in the test's name, what the correct
behaviour is: my reading is that tea's recomputation wins, because it is what
the machine will accept, and the panel should therefore not offer a ratio knob
for tea at all. Confirm against `isTea()` and say so in your report.

**`quickEditBounds(recipe: Recipe)`.** Returns the four ranges for this recipe,
applying the tea narrowing: tea dose maxes at 10 g rather than 31
(`library/cardLimits.ts:78-86`). Derive from the `cardLimits` exports; do not
restate the numbers.

**`describeAdjustment(recipe, adjustments): string | null`.** The explainer
line. Returns null when nothing downstream changes. Dose or ratio changes
produce a line stating the resulting total, for example:

> Stage volumes rescale to 320 ml to match the new dose.

Grind and temperature produce no line, because nothing downstream of them
changes. Get the total from the adjusted clone's `getStageTargetVolume()` rather
than recomputing it. When both dose and ratio changed, the line should say so
once rather than twice; word it yourself, keep it one sentence.

**`describeTemperatureBaseline(recipe, fontScale): string`.** The offset needs
its baseline visible inline, like the other knobs show their current value.

- Up to three stages list them: `recipe 88, 88, 90`.
- Four or more collapse to a range: `recipe 80 to 90`. Use the word "to", never
  a dash, per the copy rule.
- At the 1.4 font cap the list form drops the word "recipe", taking it from
  154 pt to 90 pt in a 148 pt slot.

Where stages share a temperature the list still repeats it, as shown. If every
stage is identical, a single value is correct output for the list form.

**Copy rule, and it is a hard one:** no em dashes in user-facing copy, and avoid
dashes generally. Code comments are exempt.

**Tests.** Cover: each knob alone; dose and ratio together; the saturating
temperature offset at both bounds; a negative offset; tea's dose cap and ratio
recomputation; grinder off (81) passing through unchanged; an empty adjustment
returning an equal but distinct recipe; the explainer line's presence and
absence; and every branch of the baseline string including the 1.4 cap and the
three-to-four stage boundary from both sides.

---

### Task 2 — the record remembers what was moved

**Files:** `library/brew/BrewRecord.ts`, `library/BrewDatabase.ts`,
`library/backup.ts` if its validation needs it, and their tests.

Follow the `watched` precedent exactly, which is the house pattern for adding a
field to a brew record without rewriting history
(`library/BrewDatabase.ts:118-123`, `:190-194`, `:307-310`, `:503-507`,
`:1154-1159`). Read all five sites before writing anything.

**Before designing the columns, establish what the record already snapshots.**
Read `library/brew/BrewRecord.ts` and the insert in `library/BrewDatabase.ts`
and report which of dose, ratio, grind and stage temperatures are already kept
on a record. The dashed badge needs **both** the brewed value and the recipe's
value, so any brewed value that is not currently snapshotted must be added in
this task. Do not assume; check.

**Add to `BrewRecord`:**

```ts
adjustedFromDose?:   number;  // the saved recipe's dose, when dose was adjusted
adjustedFromRatio?:  number;
adjustedFromGrind?:  number;
adjustedTempOffset?: number;  // signed, when temperature was adjusted
```

All four optional, all omitted when absent.

**Columns:** four `INTEGER NOT NULL DEFAULT 0`, added both to the
`CREATE TABLE IF NOT EXISTS` and as guarded `ALTER TABLE ... ADD COLUMN`
migrations, following the existing mechanism. `0` is the sentinel meaning "this
figure was not adjusted", and `hydrate` is the **single** place it is translated
back to absence.

**Serialisation must be byte-for-byte compatible.** `hydrate` emits each
property **only when non-zero**, so every existing record stays exactly what it
was and a 2.0 backup restores unchanged. `BACKUP_VERSION` does **not** move; an
older file simply has no adjustment keys. Write a test that pins this: hydrate a
row with all four at 0 and assert the resulting object has none of the four
keys, using something that distinguishes an absent key from an undefined one.

**Backups.** `library/backup.ts:88-92` maps brews and strips `hasStream`; the
new fields ride along as ordinary record fields. Check whether the restore-side
validation enumerates permitted keys, and if it does, extend it. Remember this
is a trust boundary: a malformed backup's next stop is a real machine.

**Evidence and rating must not change.** An adjusted brew still counts toward
the recipe's evidence and rating average, because you brewed that recipe and a
rating of a two-degree variation is a rating of the recipe. Add no adjusted
filter anywhere near `library/librarySort.ts` or the evidence read. Add a test
asserting an adjusted brew counts, so a future change cannot quietly exclude it.

---

### Task 3 — the panel

**Files:** new `components/QuickEditPanel.tsx`, new
`components/__tests__/QuickEditPanel.test.tsx`.

A presentational panel. It takes a recipe, the current adjustments and an
`onChange`, and owns no persistence and no navigation. Build it standalone in
this task; it gets mounted in task 4.

**Module scope.** Declare it and any sub-component at module scope. A component
defined inside another component's body is a new type on every render, so React
remounts it and throws away its state. That bug has been fixed twice in this
repo already.

**Four knobs**, using `components/Stepper.tsx`, which already owns min/max/step,
long-press repeat and the per-field limits idiom. Bounds come from
`quickEditBounds` from task 1.

Dose, ratio and grind are absolute and `Stepper` suits them as they are. **The
temperature knob is the one that does not fit:** `Stepper` treats `value` as
absolute, renders `String(value)` and clamps against absolute bounds. An offset
knob must show a signed value (`+2`, `0`, `-3`) and clamp against offset bounds
rather than absolute ones. Decide between extending `Stepper` with an optional
signed formatter and writing a thin wrapper, pick the one that leaves `Stepper`
simplest for its existing callers, and say in your report which you chose and
why. Do not fork `Stepper`.

The temperature knob shows its baseline inline from
`describeTemperatureBaseline`, in the same slot where the other knobs show their
current value. The slot is 148 pt; the 1.4 font cap behaviour from task 1 is
what keeps the list form inside it.

Hide the ratio knob for tea if task 1 concluded that tea recomputes it.

**The explainer line** sits below the knobs, from `describeAdjustment`, and
adapts to whatever has been changed. It is absent for grind and temperature.
Give it a stable testID so a test can assert both its content and its absence.

**Accent:** quick edit inherits BREW's accent, because adjusting and then
brewing is still running the recipe, not a lesser act. All colour from
`constants/colors.ts`; no hex literals, no named CSS colours. All timing from
`constants/motion.ts`.

**A RESET affordance** returning every knob to the saved recipe. The panel opens
at the saved recipe every time, so this is only for undoing within one sitting.

**Tests** render through `renderWithProviders` from `test-utils/render.tsx` and
`await` every `render` and `fireEvent`, since RNTL v14's are asynchronous and a
missing `await` leaves the screen empty while the test silently passes. Assert
on text, testIDs and accessible labels only: v14 removed `UNSAFE_getAllByType`
and `root.findAllByType`, so a test cannot inspect a child's props.

---

### Task 4 — the split BREW button and the panel in the editor

**Files:** `app/editRecipe.tsx`, its tests.

**Split the button.** `BarButton` at `app/editRecipe.tsx:657-676` draws the bar's
buttons and BREW is the `flex={2}` one at `:700-716`. Tapping the word brews the
recipe as saved; tapping a chevron segment opens quick edits. The two segments
must read as one control, share the accent, and expose **two distinct
accessibility labels**, since a screen reader user has to be able to tell them
apart. Keep the bar's existing flex relationship with WRITE and SAVE intact at
both the two-button and three-button configurations.

**The panel grows upward out of the action bar.** The bar does not move, so the
chevron stays visible and the panel visibly belongs to the control that opened
it. The deck behind dims. The bar is absolutely positioned at `:688-692` with
safe-area handling at `:694-697` and the scroll reserves `actionBarHeight + 16`
at `:1151-1161`; work with those rather than around them.

**This is a bespoke surface, not an `XbrwSheet`, so it must knowingly restate
three behaviours `XbrwSheet` would have supplied.** `XbrwSheet` exists precisely
because this pattern was being re-derived and got subtly wrong each time:

1. **Accessibility isolation.** `accessibilityViewIsModal` on the panel
   (`components/XbrwSheet.tsx:214-219`).
2. **Backdrop dismissal.** A pressable backdrop that closes it
   (`components/XbrwSheet.tsx:205-207` for the overlay, `:169-172` for the
   explicit close path).
3. **The Android `screenCovered` guard.** `app/editRecipe.tsx:1111` computes it
   and `:1124-1125` applies `accessibilityElementsHidden` and
   `importantForAccessibility="no-hide-descendants"`. **The open panel must be
   added to that expression.** On Android, `accessibilityViewIsModal` on the
   panel does not hide sibling screen content; this repo has learned that once
   already. Write a test that fails if the panel is left out of the guard.

**Brewing with the adjustment.** `brewWith` at `app/editRecipe.tsx:1011-1037`
pushes `/brew` with `params: {recipeJSON: JSON.stringify(brewing)}`. Pass the
**adjusted clone** as `brewing` and add a second parameter carrying the
adjustments. Note `brewWith` calls `persistRecipe()` when the recipe is not
already in the database: a quick-edited recipe keeps its UUID, so the saved
recipe is found and nothing is persisted, which is what we want. **Verify that,
and write a test asserting a quick-edited brew does not write to the recipe
database.** The promise that the saved recipe stays unchanged is the whole
feature.

Hold the adjustments in screen state. They are deliberately not persisted
anywhere: a deviation lives for one brew.

---

### Task 5 — quick edit in the home screen's action tray

**Files:** `components/SwipeableRecipeRow.tsx`, `app/index.tsx`,
`library/drawerHint.ts`, and their tests.

**Replace SHARE with quick edit.** The tray stays three tiles. Sharing remains
reachable from the editor, and the tray is for things you do often, which this
is and sharing is not. The SHARE tile is at
`components/SwipeableRecipeRow.tsx:344-352` with testID `recipe-row-share` and
`palette.info`; its handler comes from `app/index.tsx:1486`.

**Update `DRAWER_ACTIONS` in `library/drawerHint.ts:35-40`.** This is not
bookkeeping: `DRAWER_ACTION_SIGNATURE` is derived from that list, and changing it
**re-arms the package 5 drawer hint**, so everyone gets shown the new tray once.
That is intended. There is a test pinning the declared list against the rendered
tiles; it is what forces this, and it must end green with the new list rather
than be relaxed.

Pick the new identifier and caption yourself. Keep the caption short enough for
the tile, and remember the favourite tile's visible caption already differs from
its testID, so tests should key on testID.

**From the home screen the panel has no action bar to grow out of**, since the
tray lives on a list row. Choose the presentation and justify it: an `XbrwSheet`
is the obvious answer here, and using it from the home screen while the editor
uses the bespoke upward panel is defensible, because each matches the control
that opened it. If you reach a different conclusion, say why.

Brewing from the home tray goes through the same `/brew` route
(`app/index.tsx:1154-1166`), so it carries the adjusted recipe and the
adjustment parameter the same way.

If the home screen gains a new sheet, **add it to the `screenCovered`
expression at `app/index.tsx:1205`.**

---

### Task 6 — the brew carries the adjustment into its record

**Files:** `app/brew.tsx`, `hooks/useBrewRun.ts` or
`library/brew/BrewRecorder.ts` as appropriate, and their tests.

`app/brew.tsx:85-95` reads `recipeJSON` and reconstructs the Recipe; `:97-109`
calls `start(localRecipe)`. Read the adjustment parameter beside it, carry it
through to wherever the completed `BrewRecord` is built, and write the four
fields from task 2.

Keep `library/brew/` free of React, as it is today. If the recorder is where the
record is built, the adjustment should reach it as data rather than through a
hook.

**An unobserved brew can also be adjusted.** `unobservedBrew()` writes a record
for rating a recipe the machine never brewed. Decide whether that path can carry
an adjustment and handle it consistently; say what you decided.

Test that a brew with no adjustment writes a record with none of the four keys,
and that an adjusted brew round-trips all four through insert and hydrate.

---

### Task 7 — dashed badges on the record

**Files:** `components/BrewFigures.tsx`, `library/brew/figureGeometry.ts` if the
figure model needs extending, and their tests.

The dashed outline already means **asked for rather than confirmed**
(`components/BrewFigures.tsx:172-175`), used by the grind figure when the
machine never reported a dial. An adjusted figure is a different claim: it was
confirmed, it just was not the recipe's value. Decide whether to reuse the
dashed treatment as the spec asks or to distinguish the two, and say which and
why. The spec asks for dashed; if reusing it makes two different things look
identical on the same card, that is worth raising rather than shipping.

The existing machinery is: `FigureBadge` applies the dashed border at
`components/BrewFigures.tsx:124-137`, `FigureValue` takes `outlined` at
`:370-377`, and the recipe badge renders at `:384-389` with testID
`figures-grind-recipe`. The grind figure's source kind is a union handled at
`:269-285`; today only grind has such a kind, so extending this to dose, ratio
and temperature means either generalising the model or adding an equivalent
source marker. Pick one, and keep the geometry work that merged in #194 intact.

**Mind the width budget.** `components/BrewSummary.tsx:40` exports
`CAPTURE_MARGIN = 12` and `:164` defaults `capturePadding` to
`SCREEN_PADDING + CAPTURE_MARGIN`, which is 30, and that is the padding the
figures actually live in. A measured fit check landed in
`library/brew/figureGeometry.ts` in #194 precisely because a badge was clipping
on a 393 pt iPhone. Adding up to four more badges to that row will stress it.
**Measure, with the repo's own functions, at 375, 393, 402 and 430 pt and at the
1.4 font cap, and report the table.** Do not reason about it from the markup.

---

### Task 8 — the gate

Run all four and paste exact output:

```bash
npm run typecheck
npm run lint
npm test
npx expo-doctor
```

Expected: typecheck silent; lint 0 errors and about 26 pre-existing warnings;
the full suite green across both the `ios` and `android` projects; expo-doctor
21/21, which is a hard CI failure if it is not.

Then update `.github/copilot-instructions.md` for anything this package changed
that a future contributor would be misled by: at minimum the action tray's
contents, the quick-edit domain module, and the new brew record fields.

While you are in that file, fix the stale version claim. It says `expo.version`
is `1.2` spelled with two components; it has been `2.0.0` with three since
`0b3ea8f`. The two-component reasoning no longer applies and the paragraph
should say what is true now.

## Risks

**The clone is a serialisation round trip, not a deep copy.** If `backup`,
`offline_backup` or `uid` do not survive it, a quick-edited brew could lose the
raw card bytes the restore feature depends on. Task 1 tests this first for that
reason.

**Tea recomputes the ratio.** `autoFixPourVolumes()` on tea overwrites the ratio
the user just set. Task 1 resolves it; if the answer turns out to be anything
other than "do not offer the knob", the panel needs to show what happened.

**The figure row is already tight.** #194 fixed a badge clipping on a 393 pt
iPhone by 2.51 pt, and the fit at 402 pt was 0.05 pt, which is a coincidence
rather than a fit. Task 7 adds badges to that row. Measure rather than reason.

**The panel is bespoke.** It cannot inherit `XbrwSheet`'s focus trapping,
backdrop and `screenCovered` guard, so it must repeat all three knowingly. The
Android guard in particular is a lesson this repo has already learned once.

## Out of scope

Persisting an adjustment per recipe, and offering to save an adjustment back to
the recipe. Both were considered and deferred in the spec: brew history will say
whether repeated adjustment is common enough to justify either.

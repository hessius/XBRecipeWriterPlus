# Create a recipe from scratch — design

Status: approved
Branch: `create-recipe`
Target: version 1.6.0

Until now every recipe in the library arrived from somewhere else: a card, a
share link, a pod code, or a duplicate of one of those. There is no way to
author a recipe in the app. This release adds one.

The work is deliberately small. It adds a third call to action on the home
screen, a sheet that asks the one question the editor cannot ask later, and a
blank recipe for the existing editor to open. It does not redesign the editor,
and it does not add templates — though it leaves the one place templates would
go.

It also corrects a defect the feature exposes in the accent assignment, which
affects card reads and imports today.

---

## 1. Why the beverage must be chosen up front

`app/editRecipe.tsx` hides the cup-type row on a tea recipe. The comment there
records why: `CUP_OPTIONS` deliberately excludes `TEA`, so on a tea recipe the
row showed nothing selected and tapping any option silently turned the recipe
into a coffee card.

Tea is therefore a one-way door. Nothing in the app can turn a coffee recipe
into a tea one, and nothing should: the fix that produced this state was
deliberate. A create flow that opened a coffee recipe and left the user to
change it later would be offering a change the editor does not permit.

So the choice is made before the editor opens, and the create flow becomes the
only place in the app where a tea recipe can be authored.

## 2. Entry surfaces

### 2.1 A third tile

`components/CtaTile.tsx` documents that "the home screen shows two of these at
equal weight … if a third action ever earns equal weight it joins the row". A
third `CtaTile` joins the row in `app/index.tsx`, with `icon="plus"` and the
label `NEW`. The component already sets `flex={1}`, so three tiles divide the
row without any change to it.

`NEW` is the shortest label in the row. The fit to verify on device is
`READ CARD`, which is the longest, at roughly a third of the screen width.

### 2.2 The collapsed header

`components/HomeHeader.tsx` slides two icon-only `Action` glyphs in when the
list has scrolled past the tiles. A third joins them, and `SLIDE_WIDTH` becomes
`TOUCH_TARGET * 3`.

`SLIDE_WIDTH` is stated rather than measured, for the reason given in its own
doc comment: the glyphs start at zero width, so an `onLayout` would report zero
and the slide would never leave. Each glyph is exactly one touch target wide by
construction, so the arithmetic stays correct at three.

The header actions carry no text, so there is no label fitting problem here.
What does need a device check is density: collapsed, the row becomes six glyphs
(read, import, new, edit, machine dot, settings) beside the title.

### 2.3 The plus glyph

The existing `plus` glyph in `constants/dotIcons.ts` is reused rather than a new
one drawn. Two comments become false and are rewritten as part of this work:

- `plus` is documented as "Steps a value up. Never used on its own to mean
  'new'." It now is.
- `duplicate` carries a note that a plus was considered and rejected there
  because "on its own a plus reads as 'new', and duplicating a recipe is not the
  same offer as writing one from scratch". That reasoning is now the argument
  *for* this use, and the note should say so rather than read as a prohibition.

### 2.4 The empty state

`components/EmptyLibrary.tsx` says "Read a card or import a recipe using the
buttons above." It names the available actions explicitly, so it names three.

Its own doc comment — that the empty state has no button of its own because the
tiles above are the answer — remains true and is unchanged.

## 3. The chooser sheet

A new `components/NewRecipeSheet.tsx`, built on `XbrwSheet` with
`title="New recipe"`. It follows `ImportSheet.tsx` as the house pattern for a
sheet reached from the home screen.

Two pressable doors, `COFFEE` and `TEA`. Each shows the accent swatches its half
of the palette draws from, and a one-line summary of the recipe it will
produce. The swatches are not decoration: `constants/colors.ts` already splits
`accents` into a coffee half of eight and a tea half of four, and
`accentGroupFor()` chooses between them on `isTea()`. The door therefore shows
the colours the recipe will actually be drawn in.

Props are `{open, onOpenChange, onChoose}` and nothing else. The sheet holds no
state; it is a picture of its props.

`prewarm` is **off**. `ImportSheet` opts in because it builds a text field and
reads the clipboard, and the cost of building that early is worth paying. Two
static rows have nothing to warm.

`heightPercent` is sized to the two rows and tuned on device. A share of the
screen rather than `fit`, for the reason `XbrwSheet` documents: a fit-mode frame
collapses to nothing behind `Adapt`.

`app/index.tsx` owns a `newOpen` boolean beside the existing `importOpen`.
`onChoose` closes the sheet, builds the recipe, and calls the existing
`openRecipe()`, which already carries the `EDITOR_PUSH_GUARD_MS` guard against a
double push.

The sheet is the only entry to the editor for a new recipe, from both the tile
and the header glyph.

## 4. What a blank recipe is

`new Recipe()` with no arguments already mints a uuid, copies it to `key`, and
stamps `createdAt`. The create flow sets the rest.

Both beverages:

- `source = "manual"`

`source` already exists as a `RecipeSource` and already renders as
**"Untitled Brew"** through `placeholderName()`. It is currently also the
fallback for a legacy stored recipe with no recorded source. That overload is
accepted rather than resolved: those recipes have names or XIDs, so the
placeholder is not what they display.

Coffee:

| Field      | Value  |
| ---------- | ------ |
| `ratio`    | 16     |
| `dosage`   | 15     |
| `grindSize`| 65     |
| `grindRPM` | 120    |
| `cupType`  | `OMNI` |
| `grinder`  | `true` |

Tea:

| Field     | Value |
| --------- | ----- |
| `dosage`  | 5     |
| `cupType` | `TEA` |

Tea sets nothing else, and this is deliberate. The editor hides grind size,
grind speed, cup type and the grinder toggle on tea, and `getData` writes the
default grind size for a tea card regardless of what the model holds. Setting
those fields would be theatre. `ratio` is not ours to choose either: `fixRatio()`
derives it from the pour volumes, and on a recipe with no pours it is 0 until
the first stage exists.

Neither recipe has any stages, which is what the next section is about.

## 5. The first stage

### 5.1 The defect

The ADD STAGE button in `app/editRecipe.tsx` calls
`addPour(recipe.pours.length - 1)`, which on a recipe with no pours is
`addPour(-1)`.

This does not throw. `Recipe.addPour` guards its copy-from-previous branch with
`copyFromPrevious && this.pours.length > 0`, so an empty recipe falls through to
the else branch and gets `new Pour(pourNumber + 2, 1, 39, 30, 0, 0, 0)`: one
millilitre at 39 °C.

Both numbers are the bottom of their permitted ranges. That branch has never run
in this app, because until this feature every recipe reached the editor with at
least one stage. Its values were placeholders, and this release is what makes
them real.

### 5.2 The specified first stage

A stage added to a recipe that has none takes these values:

| Field         | Coffee        | Tea   |
| ------------- | ------------- | ----- |
| `volume`      | `dosage × ratio` (240 ml at the presets) | 90 ml |
| `temperature` | 93 °C         | 85 °C |
| `flowRate`    | 30 (3.0 ml/s) | 30    |
| `pourPattern` | centered      | centered |
| `agitation`   | none          | none  |
| `pauseTime`   | 0             | 0     |

The coffee volume is `dosage × ratio` because `autoFixPourVolumes()` already
assigns exactly that to a single-pour recipe. Matching it means one tap of ADD
STAGE carries the recipe from invalid to writable, with the machine's balance
requirement satisfied rather than pending.

The tea volume is 90 ml because tea clamps every pour to 90 ml anyway. On tea,
`addOpeningPour` also calls `fixRatio()`, which sets the ratio to 18 from
90 ml at a 5 g dose. Without it the ratio would still be 0 — below `RATIO.min`
— and tea alone would need a second, unexplained tap on auto-adjust to reach
the state coffee reaches in one. Coffee needs no such call: its ratio is a
preset the user chose from, and the volume was derived from it.

Subsequent stages copy the previous stage, which is the existing behaviour and
is unchanged.

### 5.3 Where it lives

Not in `addPour`'s else branch. That branch is load-bearing: `addPour(0, false)`
and `addPour(-1, false)` are the established idiom for building a fresh pour in
the test suite — `Recipe.ratio.test.ts`, `units.roundtrip.test.ts`,
`shareLink.test.ts`, `useRecipeEditor.test.ts` and others all call it and then
set the fields they care about. Redefining its literals would change a contract
a dozen tests depend on in order to answer a question none of them is asking.
"Give me an empty pour I will fill in" and "what should the user's first stage
be" are different questions and get different methods.

So `Recipe` gains `addOpeningPour()`, which appends the stage in §5.2 and
branches on `isTea()` as the rest of `Recipe` does. It belongs in the domain
class rather than the screen: it answers "what is a stage when there is no stage
to copy", which is a question about the model.

`useRecipeEditor.addPour` routes to it when `recipe.pours.length === 0` and to
`recipe.addPour(pourNumber)` otherwise. That keeps `app/editRecipe.tsx`'s
handler unchanged — it still passes `pours.length - 1` — and puts the branch in
the hook that already owns every other mutation of the recipe.

The comment in `app/editRecipe.tsx` above the ADD STAGE press handler says
`addPour(n)` "copies `pours[n]` and splices in after it". That is now true only
of the non-empty case, and the comment is extended to say so.

## 6. Pinning the accent

### 6.1 The defect

This affects card reads and imports today, not only the new flow.

`RecipeDatabase.insertRecipe` assigns `accentIndex` via `reassignIfCrossed`,
which picks the least-used colour in the recipe's half of the palette. Until
that happens, `resolveAccent` falls back to a hash of the uuid.

Every route that brings a new recipe into the library pushes the editor with the
recipe **unsaved**: `readCard` at `app/index.tsx:364`, the import path at
`:234`, and now create. `insertRecipe` runs only from the editor's SAVE, through
`useRecipeEditor`'s `updateRecipe`. So the user sees a hash-derived colour for
the whole time they are editing, and a different, least-used colour once the
recipe reaches the list — which is exactly when the colour becomes useful for
finding the row.

### 6.2 The correction

`RecipeDatabase` gains a public `assignAccent(recipe)` holding the line
`insertRecipe` already runs:

```ts
recipe.accentIndex = reassignIfCrossed(recipe, this.accentsInUse(recipe));
```

`insertRecipe` calls it instead of inlining it. The three entry points call it
after building the recipe and before pushing the editor.

It is idempotent by construction: `reassignIfCrossed` returns an existing index
unchanged when it is valid for the recipe's group, and only reassigns when the
recipe has crossed between halves or has no index at all. So calling it early
and again on save cannot change the answer, and `insertRecipe` needs no
knowledge of whether it has already run.

Distribution is unaffected — the colour is still the least-used one in the half.
Only the moment of assignment moves.

Two unsaved recipes could in principle be handed the same index, since neither
is in the table to count against the other. This is accepted: the editor holds
one recipe at a time, and the second save reassigns nothing because the index it
holds is still valid. The result is a repeated colour no worse than the ones the
palette already repeats once the library outgrows eight recipes.

## 7. What is already handled

A recipe with no stages is already refused everywhere it should be. These gates
exist and need no change:

- `cardWriteProblems` emits "The recipe has no stages.", closing WRITE. `canBrew`
  is `canWrite` in the editor, so BREW closes with it.
- `shareBlockReason` returns `noPours` for an empty recipe.
- Tea is refused twice over: `fixRatio()` on no pours gives a ratio of 0, below
  `RATIO.min` of 5.
- SAVE stays open. This is deliberate, and the `ActionBar` comment says so: a
  half-finished recipe is still worth keeping.

The create flow does not run the `duplicates` check. That check exists to stop a
card read or an import depositing an unwanted twin. Two blank recipes created on
purpose are not a mistake to be caught.

## 8. Testing

**Unit**

- `addOpeningPour` produces the stage specified in §5.2, for coffee and for tea.
- `useRecipeEditor.addPour` routes to `addOpeningPour` on an empty recipe and to
  `Recipe.addPour` otherwise. This is the regression test: against current
  `main` the empty case yields 1 ml at 39 °C.
- `Recipe.addPour(0, false)` still yields the placeholder pour it always has, so
  the existing idiom is unchanged.
- A coffee recipe with one opening stage passes `cardWriteProblems`, and so does
  a tea one — one tap from invalid to writable for both.
- A blank coffee recipe and a blank tea recipe carry the presets in §4 and
  `source === "manual"`.
- A blank recipe displays as "Untitled Brew".
- `assignAccent` is idempotent, and a recipe saved after it has run keeps the
  index it was shown with.
- `cardWriteProblems` on a blank recipe of each beverage reports the missing
  stages.

**Component**

- `NewRecipeSheet` renders both doors and reports the chosen group.
- The home screen renders three CTA tiles, and the third opens the sheet.
- `HomeHeader` renders three actions in the slide when collapsed.
- `EmptyLibrary` names all three actions.

Assertions are on rendered text, test IDs and accessible labels. RNTL v14 has
removed `UNSAFE_getAllByType` and `root.findAllByType`, so a test cannot inspect
a child's props.

**Device**

NFC and the machine cannot be exercised in a simulator, and three of these
checks are about fit:

- `READ CARD` at a third of the tile row.
- The collapsed header at six glyphs plus the title.
- The sheet's height at two rows.
- One full round trip: create a coffee recipe, add a stage, write it to a
  genuine card, and read it back.

## 9. Out of scope

- **Templates.** §3 leaves room for them in the sheet and nothing more. They
  need real requirements, not guessed ones.
- **Promoting the sheet to a route.** If templates outgrow a sheet, the sheet's
  body is a component and moving it is a small change to make then.
- **Remembering the last beverage chosen.** The choice is one tap and cannot be
  undone in the editor; skipping it would be the wrong thing to optimise.
- **Naming a recipe at creation.** The editor renames, and "Untitled Brew" is a
  working label until it does.

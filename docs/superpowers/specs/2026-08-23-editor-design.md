# XBRW++ sub-project 4 — the editor

*Design spec. 23 August 2026.*

## What this is

Sub-project 4 rebuilds `app/editRecipe.tsx`. It is the last screen still wearing
the old clothes: no Doto, no accents, no dot-matrix glyphs, no pour profile, and
a structure inherited from the app it was forked from rather than chosen.

The roadmap lists this sub-project as "recipe list and editor redesign". The list
was rebuilt in sub-project 3, so what remains is the editor alone.

## The finding that shapes everything

Asked what a trip into this screen actually is, the answer was:

> Most often I just look at it to understand which recipe is which and to change
> out which recipe is written to a given NFC card. When editing I mostly nudge a
> parameter or two like the grind setting.

The editor is a **viewing** surface that happens to be editable. Recipes are
never authored here — they arrive already formed, read off a card or imported
from a link, and creating one from scratch is deferred (#25). That inverts the
old design's priorities: a form optimised for filling in becomes a document
optimised for reading, with editing available in place.

Two consequences follow, and they are the two the rest of this document keeps
returning to:

- **Writing the recipe to a card is the primary action.** It is currently a
  small unlabelled glyph in the header.
- **Nothing is hidden.** Progressive disclosure was offered and declined: every
  field the recipe has stays visible. The screen is organised by how often a
  field is touched, not by whether it is advanced.

## Structure

```
┌──────────────────────────────┐
│  ‹                     [ ⌄ ]  │   header: back, overflow
├──────────────────────────────┤
│ ░░ Ethiopia Guji Natural ░░░ │   hero, filled with the recipe's accent,
│ ░ [COFFEE] [CGL12]   ~~~~~░░ │   pour profile as a watermark
├──────────────────────────────┤
│ [   BREW   ][ STAGES · 3  ]  │   deck switch
├──────────────────────────────┤
│                              │
│         the active deck      │
│                              │
├──────────────────────────────┤
│ [   WRITE CARD   ][  SAVE  ] │   action bar
└──────────────────────────────┘
```

Chosen from three candidates: the accent-slab document (A), the card-continued
sheet (B), and the two-deck switch (C). The choice was A's skin and ordering with
C's switch, because A reads as one continuous document and C's switch is what
kills the nested scrolling — today a horizontal pager of pours lives inside a
vertical scroll, and the two fight each other and the sliders.

### The hero

An accent-filled slab carrying the recipe name, the beverage marker, the XID
chip and the pour profile as a watermark, drawn with the same `PourProfile` and
the same `onAccent` inks as the card in the list. Everything in it is display
only — the name and the XID are edited as fields on the BREW deck, and the hero
mirrors them. Nothing on the hero is tappable, so there is no hidden affordance
to discover. This is the tie between the two
screens: the object you tapped is still the object you are looking at.

It collapses on scroll the way `HomeHeader` does, using the same measured-height
animation and the same shared-value discipline (§ *Motion*).

### The deck switch

One control, two decks: `BREW` and `STAGES · n`. Neither deck ever contains a
scroll view of its own, so there is exactly one scrolling surface on the screen
at any moment.

The switch is Doto, accent-filled when active. It is not a tab bar — it does not
navigate, it does not appear on any other screen, and it carries no icons.

## The BREW deck

A flat list of fields, each a label, an optional hint line, and a value.

| Field | Control | Range |
|---|---|---|
| Dose | stepper + tap to type | 1–31 g (1–10 for tea) |
| Ratio | stepper + tap to type | 5–100, whole numbers only |
| Grind size | stepper + tap to type | 40–80, hidden when the grinder is off or the recipe is tea |
| Grind speed | stepper + tap to type | 60–120 rpm, step 10, same visibility rule |
| Cup | segmented | XPOD / OMNI / OTHER |
| Grinder | segmented | ON / OFF |
| Recipe ID | tap to type | the XID, 3-letter vendor code + optional T + 2–3 digits |
| Name | tap to type | the local name, mirrored in the hero |

**Sliders are removed.** They were a listed pain and they are the reason
`editRecipe` carries a map of `ScrollView` refs whose only job is to disable
scrolling mid-drag. A stepper pair around a tap-to-type Doto value covers both
the nudge (the common case) and the jump (the rare one) without fighting the
scroll. Long-press to repeat, as `ValidatedInput` already does.

Values are Doto and tabular. The two that drive the balance — dose and ratio —
are drawn in the accent; everything else is white.

## The STAGES deck

A live `PourProfile` on a raised panel at the top, then the stages as a list.

### The live profile

Full width, accent stroke (it sits on black here rather than on an accent fill,
so the ink inverts), with a **dashed target line** at `dose × ratio`. When the
stages balance, the line sits exactly on the final plateau. When they do not, it
lifts clear of the curve and the gap between them is hatched in `danger`. The
gap *is* the error, drawn to scale.

Selecting a stage tints its band in the profile.

The profile is a readout, not a control. Dragging it to shape a recipe was
considered and deferred to #42: direct manipulation is an authoring gesture, and
the app cannot yet author.

### The stages

Each stage is a raised tile with air around it — the object is the tap target.
Chosen over three flatter alternatives because nothing in the flat rows said
they opened, and the tap targets ran together.

Collapsed, a tile shows its index in the accent, its volume, temperature,
pattern and pause as Doto facts, that stage's share of the curve drawn behind
them, and a caret. Expanded, it adds volume, temperature, flow rate and pause as
steppers, and pattern and agitation as segmented controls.

Below the list: `+ ADD STAGE`, and a delete affordance on the expanded tile.
Both exist today as bare `+`/`×` glyphs in each pour's header.

## The balance, and #40

`getTotalVolume()` is `dosage × ratio` and is already live in the model. The
staleness reported in #40 is a **display** fault: `TotalVolumeComponent` repaints
only when something calls `forceUpdate()` on an imperative handle, and the Auto
button's enabled state is pushed through `setNativeProps` on a ref. Two hand-wired
repaint paths, either of which can be missed, and a display that then disagrees
with the model it is describing.

The rebuilt deck **derives the balance at render** from the recipe. The
key-bump-on-mutation convention stays — `Recipe` is not becoming immutable, and
that was a deliberate performance decision — but per-widget imperative repainting
goes. `TotalVolumeComponent` and its `forceUpdate` handle are deleted.

#40 must be reproduced by a failing test before it is fixed. The report also
mentions that after auto-fixing and then editing volumes by hand the save still
errors, which suggests more than one fault; the test is what tells us how many.

### Gating

| State | WRITE | SAVE |
|---|---|---|
| Stages balance | enabled | enabled |
| Stages do not balance | **disabled** | **enabled** |
| A field is invalid | disabled | disabled |

Today `saveRecipe()` refuses an unbalanced recipe outright. That changes: an
unfinished recipe is worth keeping, so SAVE stays live and only WRITE is gated.
The library can therefore hold recipes that cannot be written to a card, so:

- Such a recipe carries a warning marker on its card in the home list.
- Attempting to write one from the home screen is refused the same way.

The mismatch is announced where it happens, not on save: a banner under the
profile naming the shortfall in millilitres, with an `AUTO FIX` action. That is
the existing `autoFixPourVolumes()`; it stops being a button called "Auto"
floating beside the totals and becomes the remedy offered by the error.

## Actions

The bar holds `WRITE CARD` (accent-filled, primary) and `SAVE`. The header holds
back and an overflow caret, and nothing else — the beverage marker lives on the
hero, where it belongs to the recipe rather than to the chrome.

The overflow sheet holds:

- **Duplicate** — a copy you can change freely.
- **Refresh the name from xBloom** — today a sync glyph beside the title, which
  is inert without an XID and gives no clue why. Moving it here lets it be
  labelled and explained, and it is not a per-keystroke concern.
- **Revert…** — see below.
- **Help** — the long-form explanations, in the T4 mode only (§ *Help*).
- **Delete** — destructive, `danger` ink.

### Revert

Today's `Restore` button is one word standing in for up to four different
actions. `restoreRecipe()` assembles whichever of these the recipe has and opens
a picker:

1. the raw bytes backed up off the NFC card,
2. a cached copy fetched from xBloom,
3. a live lookup by XID,
4. a live lookup by share link.

A recipe may offer four, one, or none — and today the button looks identical in
every case and merely raises an error when it can do nothing.

It is **demoted** out of the action bar into the overflow, because it is rare and
destructive and was competing with the two things you came to do. Its glyph is
`rev_chevrons`, two backward chevrons — the rewind mark, drawn from pure
diagonals (§ *Glyphs*).

The sheet it opens **names every source**, with a line saying what each actually
is and an `OFFLINE`/`ONLINE` tag. Sources this recipe does not have are shown
greyed rather than hidden, so the sheet teaches what the feature is. The sheet
is the confirmation; there is no second one.

## Help

The tooltips carry knowledge that exists nowhere else — the grinder-off
workaround is a full paragraph and describes machine behaviour that is not
documented anywhere. It cannot be dropped.

**Hint lines are always present.** Every label that needs one gets a short line
beneath it covering the ordinary case: the range, the unit, the gotcha in six
words. "Whole numbers only." "Omni turns overflow protection off." "Off is
experimental — see Help."

Beyond that, two modes ship, chosen by a setting, because which reads better in
practice is a question the mockups cannot answer:

- **`markers`** — a small dot-matrix marker beside any label with more to say,
  opening a sheet for that one field. Closest to today's behaviour.
- **`explain`** — an `EXPLAIN` toggle in the header. Off, the screen is hint
  lines. On, every note unfolds in place and stays unfolded until turned off.

The setting is `helpStyle`, defaulting to `explain`: its resting state is the
calmer of the two, and one visible control is more discoverable than fifteen
small ones. This default is expected to be revisited after device testing.

## Tea

Tea recipes are special-cased throughout `Recipe`: volumes clamp to 90 ml, dose
defaults to 5 g, the ratio is recomputed by `fixRatio()`, the grinder fields do
not apply, and tea cards always write the default grind size.

The screen says so rather than quietly behaving differently. A `TEA` banner under
the hero explains the 90 ml clamp and that the machine adds roughly 30 ml per
steep to trigger the siphon, so the cup holds about 120 ml — and that a siphon
triggering early means reducing the later steeps. That is knowledge currently
buried in the totals tooltip.

Tea-only and coffee-only fields appear and disappear as they do today. The cup
count for tea (byte 39's high nibble) is a field on the BREW deck.

## Colour

The recipe's accent, already resolved for the card in the list, is the screen's
accent. It fills the hero, the active half of the deck switch, the stage indices,
the WRITE button, the live profile stroke, and the dose and ratio values.

Everything else is the existing palette. No new colours. `onAccent` inks are
reused unchanged on the hero, which is the same surface as a card.

## Glyphs

Two new 9×9 bitmaps in `constants/dotIcons.ts`:

- **`revert`** — two backward chevrons, pure diagonals.
- **`more`** — a downward caret, pointing at the sheet that will rise.

A curved arrow was drawn first for revert and rejected on inspection. The icon
set's own note says why: at 9×9 a stroke is one dot wide, so anything that is not
axis-aligned or a pure 45° diagonal aliases into noise. That rule is why settings
is two faders and not a gear, and it held here too.

The `caret` used on the stage tiles is the same bitmap as `more`, rotated.

## Motion

The header collapse reuses the pattern proven in sub-project 3, and its two hard-
won rules:

- An animated style is only re-evaluated when a **shared value it reads** changes.
  A measurement held in React state must be mirrored onto a shared value.
- A subtree that unmounts cannot animate away, because it has already left
  layout. Anything that collapses keeps its children mounted and animates height.

`Collapsible` already exists and does both. Stage tiles expand with it.

Everything respects the reduce-motion hook.

## What changes, file by file

**New**

- `components/DeckSwitch.tsx` — the BREW/STAGES control.
- `components/FieldRow.tsx` — label, hint, and a value slot.
- `components/Stepper.tsx` — the ±/tap-to-type numeric control that replaces the
  slider half of `ValidatedInput`.
- `components/StageTile.tsx` — a stage, collapsed and expanded.
- `components/StageProfile.tsx` — the live profile with the target line, the
  hatched shortfall, and the selected band.
- `components/RecipeOverflowSheet.tsx` — duplicate, refresh, revert, help, delete.
- `components/RevertSheet.tsx` — the four named sources.
- `components/HelpSheet.tsx` — the long-form text, both modes.
- `constants/recipeHelp.ts` — the help copy, as data.

**Changed**

- `app/editRecipe.tsx` — rebuilt. It should end up close to layout only; today it
  is 333 lines of layout with logic threaded through it.
- `hooks/useRecipeEditor.ts` — the imperative repaint handles go; the save gate
  splits from the write gate; `RECIPE_LABELS` stays as the edit vocabulary.
- `components/RecipeCard.tsx` — the unwritable marker.
- `library/Settings.ts` — `helpStyle`.
- `app/settings.tsx` — the help-style row.
- `constants/dotIcons.ts` — `revert`, `more`.

**Deleted**

- `components/TotalVolumeComponent.tsx` — replaced by derived rendering.
- The `ScrollView` ref map and `handleSlidingChange`, which existed only to stop
  sliders fighting the scroll.

`ValidatedInput`, `LabeledInput`, `MyButtonGroup` and `TooltipComponent` are the
old vocabulary. They are replaced rather than restyled, and deleted once nothing
imports them.

## Testing

The existing gates apply unchanged: `npx jest`, `npx tsc --noEmit`,
`npx eslint .`, `npx expo-doctor`, all four green before every push.

- `library/__tests__/Recipe.card.test.ts` and `cardFixtures.ts` **must not be
  edited**. This sub-project changes no bytes. A diff in those files is a
  regression until proven otherwise.
- #40 gets a failing test first, in `hooks/__tests__/`.
- Volume-balance behaviour — the target recomputing, the gate splitting, auto-fix
  — is tested at the hook level, where it is pure, not through the screen.
- Component tests use `renderWithProviders`, and `render`/`fireEvent` are async.
- Dot glyphs hide from the accessibility tree when unlabelled, so queries for
  them need `{includeHiddenElements: true}`.
- Reanimated's jest mock captures an animated style at mount only. Animation
  arithmetic is extracted into pure functions and tested there.

NFC cannot be exercised in a simulator. Writing a card from the rebuilt screen
must be verified on a physical device against a genuine card before merge.

## Accessibility

- Every glyph-only control carries an `accessibilityLabel`.
- The balance is announced as text, not only as a colour and a line. Colour is
  never the sole signal — `danger` is always paired with the shortfall in words.
- Steppers expose `adjustable` with increment and decrement actions.
- The deck switch is a `tablist`; the stage tiles are `button`s reporting
  expanded state.
- Hint lines are real text, not placeholder text.

## Out of scope

- **Dragging the profile to shape a recipe** — #42.
- **Authoring a recipe from scratch** — #25.
- **Recipe images** — deferred at programme level.
- **Import** — sub-project 5.
- **The settings screen itself** — sub-project 6. This sub-project adds one row
  to it, as sub-project 3 did.
- **The card byte format** — untouched.
- **#41**, the header settling a few pixels after a transition. It is a
  navigation-shell fault, not an editor one, and it is filed separately.

## Risks

- **The screen is load-bearing for card writes.** Every field on it maps to a
  byte. A rebuild that silently drops a field produces cards that are wrong in a
  way the app cannot see. Mitigation: the field table in this document is the
  checklist, and `RECIPE_LABELS` is the vocabulary both sides share.
- **`useRecipeEditor` is 419 lines and does everything.** Splitting it is
  tempting and out of scope beyond what the new gating requires.
- **Two help modes is two code paths.** Accepted deliberately, to be resolved to
  one after device testing.

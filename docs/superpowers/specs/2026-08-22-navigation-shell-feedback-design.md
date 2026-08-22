# Sub-project 3: Navigation shell and feedback — design

Status: approved
Date: 2026-08-22
Depends on: sub-project 1 (design language and branding), sub-project 2 (data model and persistence)

## What this ships

A finished home screen, and the vocabulary the app uses to tell you what
happened.

Sub-project 1 delivered a parts bin — `CtaTile`, `RecipeCard`, `DotBloom`,
`WriteSweep`, `ScreenTitle`, `DigitRoll` — and deliberately changed no
behaviour, so none of it is referenced by a screen. Only `Wordmark` ships, inside
the splash. This sub-project is where that inventory becomes the screen you
actually look at.

## Scope correction to the roadmap

The roadmap gives sub-project 3 "screen structure, empty state, CTA hierarchy,
and the toast and NFC overlay redesign", and sub-project 4 "the two main screens
rebuilt". Taken literally that ships a home screen with a new header, new tiles
and a new empty state wrapped around the *old* swipeable rows.

**The recipe list moves into this sub-project.** The empty state and the card are
one design conversation, and splitting them means designing the empty state
twice — once against a placeholder and again against the real thing.
Sub-project 4 shrinks to the editor alone.

No new native modules are introduced, so no `expo prebuild` and no `expo.version`
bump.

## Decisions

| Question | Decision |
|---|---|
| Where the CTA tiles sit | Under the header, above the list |
| What happens on scroll | Tiles fly into the header; the title shrinks |
| Collapse mechanism | Two discrete states with hysteresis, not interpolation |
| Icon rendering | Dot matrix, all of them, including the settings gear |
| The scan glyph | Three concentric squares on a 9×9 grid |
| Feedback surfaces | Toast, inline, sheet — no native `Alert` anywhere |
| Toast implementation | Keep `@backpackapp-io/react-native-toast`, skin it |
| iOS NFC composition | Dim the app, stage the bloom above the system sheet |
| Settings | A minimal real screen now, not a gear that goes nowhere |

## 1. The dot icon set

### Why a set and not a font

`@expo/vector-icons` glyphs cannot be dot-rendered. A dot icon is authored as a
bitmap on a fixed grid, so adopting this means owning a small curated set rather
than picking from a library.

The benefit is that the machine voice extends from the labels to the glyphs, and
the icons inherit `DotBloom`'s existing dot geometry rather than introducing a
second idea of what a dot is — the scan glyph in the header and the scanning
animation become visibly the same object at two sizes.

The cost, accepted knowingly: a dot glyph carries roughly a quarter of the detail
of a vector one at the same size. Curves alias into noise; only axis-aligned
shapes, arrows and coarse arcs survive. Every future icon is hand-drawn. **The
set stays small on purpose.**

### Grid resolution

**9×9.** Evaluated against 11×11 at 16, 20, 26 and 44 px. A finer grid holds more
of a shape in the abstract, but at the 20 px header size each dot falls under
2 px and the icon greys into a smudge on anything but a high-density screen.

### The bitmaps

Authored, not generated. Signed-distance rasterisation was tried first and
produced blobs at these sizes.

```
scan (three rings)   import (download)    settings (gear)
#########            ·········            ···#·#···
#·······#            ····#····            ·#··#··#·
#·#####·#            ····#····            ··#####··
#·#···#·#            ····#····            ·###·###·
#·#·#·#·#            ··#·#·#··            ###···###
#·#···#·#            ···###···            ·###·###·
#·#####·#            ····#····            ··#####··
#·······#            ·#######·            ·#··#··#·
#########            ·········            ···#·#···

success (check)      error (cross)        info
·········            ·········            ·········
·········            ·#·····#·            ····#····
·······#·            ··#···#··            ·········
······#··            ···#·#···            ···##····
·#···#···            ····#····            ····#····
··#·#····            ···#·#···            ····#····
···#·····            ··#···#··            ···###···
·········            ·#·····#·            ·········
·········            ·········            ·········

edit (pencil)
·········
·······#·
······##·
·····##··
····##···
···##····
··##·····
·##······
·········
```

The pencil is a pure diagonal, one dot per row, which is the other shape class
that survives a coarse grid intact.

The scan glyph is three concentric rings rather than two because it reads as
signal radiating outward, which is what the action does. Two rings were the safer
choice and were rejected deliberately.

### Component

`components/DotIcon.tsx` renders a bitmap from `constants/dotIcons.ts`.

- Bitmaps live in `constants/`, as data. `DotIcon` contains no icon-specific code.
- Props: the icon name, a pixel size, a colour, and an optional animation state.
- Dot radius is derived from the cell size, never a literal, so an icon rendered
  at 44 px and one at 16 px are the same drawing.
- Accessibility: an icon used as a control carries a spelled-out
  `accessibilityLabel`. The dots are decorative and are hidden from the
  accessibility tree; the bitmap must never be the only description of an action.

## 2. Home screen

### Structure

```
┌──────────────────────────────────┐
│ Recipes⁰⁷            ◉  ↓  ⚙    │   header
├──────────────────────────────────┤
│  ┌───────────┐  ┌───────────┐    │
│  │     ◉     │  │     ↓     │    │   CTA tiles, equal weight
│  │ READ CARD │  │  IMPORT   │    │
│  └───────────┘  └───────────┘    │
├──────────────────────────────────┤
│  ▓▓▓ Ethiopia Guji         ▓▓▓   │
│  ▓▓▓ 18g   16   62         ▓▓▓   │   list of RecipeCard
│  ▓▓▓ Colombia Wush         ▓▓▓   │
└──────────────────────────────────┘
```

The title is `ScreenTitle`, already built: prose title, Doto superscript count.
The count is the number of saved recipes and is hidden at zero.

Two `CtaTile`s only. `NEW` was cut from the home screen in sub-project 1 and
remains cut; whether the app should author a recipe from nothing is tracked as
its own question.

### The scroll collapse

At rest the tiles are full tiles. Once the list scrolls, they migrate into the
header and the title shrinks, reclaiming the whole strip.

**Two discrete states, with hysteresis.** Not a continuously interpolated shrink.
Interpolation is more expensive, and it leaves the tiles at an awkward half-size
whenever a list rests mid-threshold. Discrete states cannot do that.

The dead band matters: a single threshold makes a list parked a few pixels either
side flap between states on the smallest touch. Collapse and expand therefore use
different offsets.

The decision is a **pure function** — current offset and current state in, next
state out — living beside the component and tested directly, with no renderer
involved.

Reduced Motion swaps the two states instantly rather than animating between them.

Neither state removes an action. Both tiles are reachable at every scroll
position, which is what lets the collapse be aggressive.

### Empty state

Replaces the list only. The header and both tiles stay exactly where they are, so
the first thing a new user sees is the two things they can do.

A bloom mark, "No recipes yet", and one line pointing at the tiles. No
illustration and no third call to action inside the empty state — the tiles above
it already are the call to action, and repeating them would be two affordances
for one job.

### Row actions

Swipe-to-delete and swipe-to-duplicate stay.

A dot-matrix edit toggle reveals the same two actions inline on every card at
once. This is the "no hidden functionality" rule from the roadmap: a gesture may
be a shortcut, but it may not be the only route to a destructive action.

It sits in the header's right cluster, before the three navigation glyphs, and is
hidden when the library is empty — there is nothing to edit. That makes four
glyphs in the collapsed header, which is the tightest the strip gets and part of
why the title shrinks. If it proves crowded on a small device, the edit toggle is
the one that moves down into the list, not one of the three navigation actions.

## 3. Feedback

### The problem being fixed

Feedback today is split by outcome, not by meaning: successes go to a toast,
failures go to a native `Alert`. Thirteen `Alert` call sites. The app speaks in
its own voice when things go well and in the system's voice when they go badly —
switching exactly when the user is most frustrated — and `Alert` is the one
surface the design language cannot touch.

Some of them are not messages at all. "Your individual pour volumes must add up
to the total volume" is a *validation state* belonging to the save button,
delivered as a modal you dismiss and then have to remember.

### Three surfaces, one of them an API

A message is classified by what it demands of the reader. Only the first of the
three is a runtime API; the other two are rules about which messages may **not**
be toasts. Routing all three through one function would be a false abstraction —
an inline validation message is a rendered component, not a dispatched event.

**Toast** — something happened, nothing is required of you. `notify()` is this
surface, and only this surface.
Recipe read. Restored from NFC backup. Restored by XID. Write failed.
And sub-project 2's duplicate detection finally gets its surface: opening a
recipe that is already saved says **"Already in your library"**.

**Inline** — validation attached to a control, which must persist until fixed.
The pour-volume mismatch becomes a message beside the save button.

**Sheet** — a decision, or long-form content.
The restore options list. `TooltipComponent`'s help text, currently an `Alert`,
which is a strange way to present a paragraph of explanation.

**No native `Alert` remains.** One of the thirteen reaches into the editor, which
is otherwise sub-project 4's territory. That is accepted: shipping this
sub-project claiming "one voice" while a system modal still fires would make the
claim false.

### Toast implementation

`@backpackapp-io/react-native-toast` is **kept and skinned**. It exposes a
`customToast` option per call and a `children` render prop on `<Toasts>` that
takes arbitrary JSX, so the styling constraint that would have justified writing
our own does not exist.

Rebuilding would re-implement queueing, swipe-to-dismiss, timing, safe-area
insets, reanimated enter and exit transitions, and the promise API — for no gain.

Every toast is skinned in **one place**, via the render prop on `<Toasts>`, not
per call site. A `notify()` caller passes meaning, never styling.

### Layering

`library/` holds plain TypeScript with no React. `notify` respects that by
splitting in two:

- `library/notify.ts` — pure. Maps a semantic event onto `{ tone, glyph,
  duration, message }`. No React, no toast-library import, and therefore testable
  as a function.
- `components/XbrwToast.tsx` — the skinned body, plus the thin dispatcher that
  hands the mapped result to the toast library.

Each toast carries an animated `DotIcon`: the glyph's dots illuminate in sequence
as it enters. Duration and easing come from `constants/motion.ts`; nothing
defines its own timing.

## 4. NFC overlay

### Two very different constraints

On **iOS**, `library/NFC.ts` calls `requestTechnology(NfcTech.Iso15693IOS)`, so
CoreNFC presents a system sheet that covers roughly the lower half of the screen
and that the app cannot draw over. The only controllable element is a single line
of text, via `setAlertMessageIOS`.

On **Android** there is no system sheet at all. Our own overlay is the entire
experience.

One `NfcOverlay` component, two compositions. It replaces `AndroidNFCDialog`.

### iOS

The app dims to near-black and the bloom is staged in the strip above the system
sheet, with a Doto status line beneath it. The dimming visually joins our half to
the system's half, so the two read as one event rather than two overlapping UIs.

The status line is mirrored into `setAlertMessageIOS`, since that one line is the
only thing we can put on the system half.

A card-shaped target drawn at the antenna position was considered and rejected:
the antenna is not in the same place on every device, so the drawing would be
wrong on some of them. **The teaching moves into the copy instead** — "hold the
card to the top of the phone" — which is right everywhere.

### Android

The same content inside our own sheet: bloom, Doto status, and on writes a
progress bar with the percentage rendered as a dot-matrix value rather than a
numeral.

### States

Reading and writing bloom outward continuously. On success every dot converges
into the three-ring mark and flashes green. On failure the dots collapse inward
and the mark turns red.

Reduced Motion cross-fades between the same two states. **Never nothing** — a
user who has disabled motion must still see that something changed.

### The existing cancellation quirk stays

A user-cancelled Android scan throws, so NFC paths check `nfc.getIsClosed()`
before surfacing an error. That behaviour is preserved: cancelling a scan must not
produce a failure toast.

## 5. Settings

The gear needs somewhere to go. Sub-project 2 shipped a working settings store
whose one key, `showCoffeeMarker`, currently has nothing reading it, and the
roadmap forbids affordances that do nothing.

So a **minimal real settings screen** ships here: a new route, one section, the
`showCoffeeMarker` toggle wired end to end to `library/Settings.ts`, and
`RecipeCard` reading it.

Sub-project 6 then adds About, attribution and the toggles that sub-projects 4
and 5 accumulate, to a screen that already exists rather than building one from
nothing.

`hooks/useSetting.ts` — a React hook over the sub-project 2 store — is pulled
forward from sub-project 6 because the toggle cannot be wired without it.

## 6. Components

| Path | Change | Purpose |
|---|---|---|
| `constants/dotIcons.ts` | new | The bitmaps, as data |
| `components/DotIcon.tsx` | new | Renders a bitmap; optional entry animation |
| `components/HomeHeader.tsx` | new | Title, count, and the three dot actions |
| `hooks/useCollapsibleHeader.ts` | new | Scroll offset → collapsed state, with hysteresis |
| `components/EmptyLibrary.tsx` | new | Empty state |
| `components/NfcOverlay.tsx` | new | Both platform compositions |
| `library/notify.ts` | new | Pure event → `{ tone, glyph, duration, message }` |
| `components/XbrwToast.tsx` | new | Skinned toast body and dispatcher |
| `app/settings.tsx` | new | Minimal settings route |
| `hooks/useSetting.ts` | new | Reads one key from `library/Settings.ts` |
| `components/AndroidNFCDialog.tsx` | deleted | Replaced by `NfcOverlay` |
| `app/index.tsx` | rebuilt | Header, tiles, list, empty state |
| `components/SwipeableRecipeRow.tsx` | modified | Hosts `RecipeCard`; reveal toggle |
| `components/TooltipComponent.tsx` | modified | `Alert` → sheet |
| `hooks/useRecipeEditor.ts` | modified | `Alert` → `notify` |
| `hooks/useCardWriter.ts` | modified | `Alert` → `notify`; uses `NfcOverlay` |
| `app/_layout.tsx` | modified | `<Toasts>` render prop |

`app/index.tsx` is currently doing far too much — data loading, share-intent
handling, NFC reading, dialog state and layout. The list and the read path move
into hooks as part of this work, on the same principle that produced
`useRecipeEditor`: a route file should stay close to layout.

## 7. Testing

Component tests through `renderWithProviders` from `test-utils/render.tsx`.
`@testing-library/react-native` v14's `render` and `fireEvent` are asynchronous —
a missing `await` leaves the screen empty and the test passes for the wrong
reason.

Tested directly, without a renderer, because they are pure:

- the collapse threshold, including that the dead band actually prevents flapping
- the bitmaps: every icon is square, 9×9, and contains only `#` and `·`
- `notify`'s routing: a given kind of message reaches the surface it should

Verified by assertion, not by eye:

- the empty state renders both CTAs, so the tiles are never the thing that
  disappears when there is nothing to show
- a cancelled Android scan produces no error toast
- `showCoffeeMarker` off actually hides the marker on `RecipeCard`

### Hard constraints

**The card byte format is untouched.** `library/__tests__/Recipe.card.test.ts`
and `library/__tests__/cardFixtures.ts` must have an empty diff against `main`.
`cardFixtures.ts` is a deliberately independent reimplementation of the byte
layout, so a round-trip test is not tautological; editing either to make
something pass is a regression, and a malformed write to a genuine card is not
trivially recoverable.

**NFC cannot be exercised in a simulator.** The overlay must be verified on a
physical device against a genuine card, on **both** platforms, before merge. This
is the one gate that cannot be automated.

## Done when

- The home screen is the new design end to end: header, collapsing tiles, list of
  `RecipeCard`, empty state.
- No `Alert.alert` call remains in `app/`, `components/` or `hooks/`.
- The NFC overlay is one component with two platform compositions, verified on
  real hardware with a real card.
- The gear opens a settings screen with one working toggle, and `showCoffeeMarker`
  is no longer dead code.
- Typecheck, lint, tests and expo-doctor are green.

## Deliberately not here

- **The editor.** Rebuilt in sub-project 4, apart from the one inline validation
  message that removing the last `Alert` requires.
- **Import UI.** The paste field, clipboard detection and import sheet are
  sub-project 5. This sub-project only gives the IMPORT tile somewhere to go —
  the existing dialog.
- **The rest of settings.** About, attribution and later toggles are
  sub-project 6.
- **List sorting and filtering.** Sub-project 4.
- **Creating a recipe from scratch.** Still cut, still its own question.

# Home screen chrome: the BREW shortcut, the connection dot, the wordmark

**Status:** approved
**Tracking:** #87
**Follows:** the brew screen rebuild spec, `2026-09-04-brew-screen-rebuild-design.md`

## Why

The same device test that produced the brew screen rebuild produced four
findings about the home screen. Three are design; one is a bug and has already
been fixed. This spec covers what is left.

None of it is new capability. Every item is something the app already does,
done wrong or wired to the wrong trigger.

## The BREW shortcut

### What is wrong with the one that shipped

`components/BrewCapsule.tsx` is a 21 pt column inset 5 pt from the card's right
edge, running its full height, with `B` `R` `E` `W` stacked one letter per line.
Five faults, and they are not one fault seen from five angles:

1. **The radius is wrong and wrongly derived.** The capsule uses
   `borderRadius: WIDTH / 2` = 10.5. The card's radius is 16. A shape inset 5 pt
   inside a 16 pt corner is concentric at 11. So the capsule is half a point off
   *and* arrived at by a rule that only coincides with the right answer at one
   width. Two curves that nearly agree read as a sticker; one curve inside
   another, sharing a centre, reads as a cut-out.
2. **It collides with the marker.** The capsule is absolutely positioned at
   `right: 5`. The `TEA`/`COFFEE` marker and the will-not-write icon sit in
   normal flow at the same edge and know nothing about it. On a tea recipe the
   capsule sits on top of the `T`.
3. **The label cannot be centred.** Four 9 pt Doto glyphs stacked in a 21 pt
   column. Doto's advance width leaves the column visually left-heavy and there
   is no room to correct it.
4. **The target is 21 pt.** Under the 44 pt minimum. The existing comment in
   `BrewCapsule.tsx` explains why the slop cannot be widened leftward: it would
   steal presses from the card body, which is the bigger and more common target.
   Reaching 44 pt means widening the capsule, which is a visual decision.
5. **It shares an edge with the swipe tray.** Duplicate and delete slide out
   over exactly the strip that says BREW.

Fault 5 was written down as a risk in `BrewCapsule.tsx` before it shipped, with
a note reading "on the hardware checklist to confirm in the hand". The hand has
confirmed it. It is being **accepted** rather than fixed: in use, a tap and a
horizontal drag are distinguishable by intent, and the alternatives that avoid
it cost more than it does.

### What replaces it

Not one design. Four shapes behind a setting, plus the off switch that already
exists — because what went wrong last time was committing to a shape that had
only ever been seen in a mockup.

- **`edge`** — a 34 pt band on the trailing edge, bled to the card's boundary so
  the card's own `overflow: hidden` clips it. There is no second radius to get
  wrong because there is no second shape. **Default.**
- **`tab`** — the same band, inset 4 pt, radius 12, which is `16 - inset` and
  therefore concentric with the card.
- **`chip`** — 78 × 34 in the bottom-right corner, radius `14 0 16 0` so its
  outer corner matches the card's and its inner corner is a fold. The word is
  horizontal, so centring stops being a question, and the target is honest with
  no slop at all. Covers the tail of the pour profile.
- **`swipe`** — no card chrome. BREW becomes a third tile in the swipe tray, in
  the recipe's accent so it reads as the non-destructive one beside two
  neutrals.
- **off** — no shortcut. Not a fifth variant: this is the toggle that already
  exists, `showBrewOnRecipeRows`, unchanged and in its current place.

### Why `edge` is the default

The band on the trailing edge is reached by the eye last, after the name and the
figures, which is the correct order of importance. The same band on the leading
edge was rejected for exactly that reason.

Its cost is real and should be watched for on device: full bleed means the bands
touch top and bottom, so a scrolled list stacks them into a near-continuous dark
strip down the right of the screen. `tab` keeps roughly 8 pt of breath between
rows and exists partly as the answer if that strip is unbearable.

### The setting

The existing boolean stays exactly as it is. `showBrewOnRecipeRows` already
decides whether there is a shortcut at all, already restores from a backup, and
is already the row a user would look for. Nothing about it changes.

One new key on `Settings` chooses the shape when it is on:

```ts
brewShortcut: "edge" as "edge" | "tab" | "chip" | "swipe",
```

Added, not renamed. `Settings` has no migration machinery — `get` simply falls
back to `DEFAULTS[key]` when a row is absent — so a key that changed name or
type would silently reset, and someone who had turned the shortcut off would
find it back on after updating. Adding a second key avoids the problem instead
of solving it, which at this size is the better trade.

It renders as a `SettingsChoiceRow`, unchanged, with four short labels:
`EDGE` `TAB` `CHIP` `SWIPE`. Four segments across the settings card's inner
width is roughly 83 pt each, comfortable at the row's existing type size. No new
component.

The row sits directly beneath the toggle it depends on, in the same section, and
is hidden while the toggle is off. Both are already gated on a machine being
remembered.

When one variant wins, this row and the losing variants are deleted and the
toggle remains. That is the end state the two-key shape arrives at cleanly.

The backup snapshot in `app/settings.tsx` gains `brewShortcut`, and its restore
path gains the same per-key check the other keys have: accept it only if it is
one of the four, otherwise leave the default. A backup written before this key
existed restores everything else and leaves the shape at `edge`.

### Structure

`BrewCapsule.tsx` becomes `BrewShortcut.tsx`, which takes the variant and
renders one of four. Each variant is a small function in that one file rather
than four files: they are alternatives to each other, never composed, and
reading them side by side is the entire point while the choice is open.

`swipe` is the exception and cannot live there, because it is a tile in
`SwipeableRecipeRow` rather than anything drawn on the card. `RecipeCard` draws
nothing for it; `SwipeableRecipeRow` grows a third tile.

## The connection dot

### What is wrong

`MachineDot` draws a 9 pt circle. It takes an `accent` prop, and `app/index.tsx`
passes `palette.success` to it — so the colour is already from the palette, and
the guess that it was showing the recipe accent was wrong. What is actually
wrong is subtler, and worse:

- **Connected and connecting are the same colour.** Both take `accent`; they are
  told apart by `opacity: 0.5` and nothing else. A half-strength dot does not
  read as "connecting", it reads as a dot. So of three states the dot really
  distinguishes two, and `palette.warn` is unused here despite meaning exactly
  "in progress" everywhere else in the app.
- **`success` at full strength is loud for ambient chrome.** #5DDC8A is the
  brightest thing in a header of grey glyphs on black, and it is lit whenever a
  machine is remembered, which for an owner is always. That is what "steals
  focus" describes: not the wrong hue, the wrong *insistence*.
- **The state is carried by colour alone.** Which is why it could not simply be
  desaturated: desaturating it would delete the only thing it says.
- **It is the one item in the toolbar that is not a dot-matrix glyph.** A filled
  circle beside five 9 x 9 bitmaps.

The faint ring drawn when connected is a fourth symptom: it exists because a
filled circle had no way to say "more present than the other filled circle".

Once the shape speaks, the accent prop has no remaining job, and `MachineDot`
stops taking one. `app/index.tsx` keeps passing `palette.success` to
`MachinePopover`, which is a different component and out of scope.

### What replaces it

**One diamond at three amounts of presence**, on the 9 × 9 grid the rest of the
icon set uses. Shape carries the state; colour reinforces it.

| State | Glyph | Colour |
|---|---|---|
| connected | filled diamond, 9 wide | `palette.success` |
| connecting | the same diamond, hollow | `palette.warn` |
| disconnected / failed | the diamond shrunk to four dots | `palette.muted` |

A family rather than three unrelated symbols, decreasing monotonically, so the
ranking is legible before the colour is. Read the three with the colour stripped
and they still say three different things, which is the test that makes the rest
of this possible.

Diamonds because `constants/dotIcons.ts` states the grid's constraint: only
axis-aligned runs and pure diagonals survive at this resolution. A diamond is
the only closed shape that is entirely diagonal, so it is the one form that is
unmistakably not a square and still lands cleanly on every dot.

Three new glyphs in `DOT_ICONS`: `link-on`, `link-wait`, `link-off`. These grids
are the design, not an illustration of it — they were drawn and reviewed at size
and are what was approved:

```
link-on      link-wait    link-off
....#....    ....#....    .........
...###...    ...#.#...    .........
..#####..    ..#...#..    .........
.#######.    .#.....#.    .........
#########    #.......#    ....#....
.#######.    .#.....#.    ...#.#...
..#####..    ..#...#..    ....#....
...###...    ...#.#...    .........
....#....    ....#....    .........
```

`link-off` is four lit cells, not three. It is the same diamond at its smallest
drawable size, which is what keeps it in the family rather than making it a
separate "absent" symbol.

The existing faint ring is deleted; the filled diamond is already the "present"
signal and the ring was compensating for a shape that could not say so.

### Collapsing

**Desaturate, do not dim.** As the header collapses, the dot's colour
interpolates toward a desaturated twin of itself. It does not lose opacity and
neither does the rest of the icon row.

Dimming was considered and rejected: it makes the dot the odd one out again in
the opposite direction, and an opacity ramp on a monochrome glyph at 20 pt is
indistinguishable from the glyph being broken.

React Native has no colour filter, so the twins are palette entries and the
interpolation is `interpolateColor` between a colour and its twin:

```ts
/** `success`, desaturated. For chrome that has stepped back. */
successMuted: "#9BCDA8",
/** `warn`, desaturated. Same reason. */
warnMuted:    "#DAC799",
```

Each is its original converted to OKLCH with the chroma multiplied by 0.45 and
the lightness and hue left alone. So the transition changes saturation and
nothing else, which is what reads as receding rather than as a different state,
and contrast against `base` is unchanged: 11.7:1 and 12.6:1, against 12.1:1 and
12.5:1 for the originals. `muted` needs no twin — it is already grey.

`MachineDot` takes `collapsed` and runs its own `withTiming` on a local shared
value, rather than being handed the header's. That is the pattern `HomeHeader`
already argues for in its own comment: it drives `travel` and `fade` as two
values because a single shared progress would have forced two unrelated
animations onto one curve.

The existing `opacity: 0.5` applied while connecting is deleted along with the
ring. It was the second thing compensating for a shape that could not speak, and
with a hollow diamond saying "connecting" a half-faded dot only muddies the
desaturation this section adds.

## The wordmark

### What is wrong

Nothing, except the trigger.

`HomeTitle` already draws the lockup twice — the settled copy underneath, and
over it a copy whose `++` is `palette.brand`, cross-fading out. That is already
the flash of colour, and it already resolves to the desaturated `palette.muted`
`++`. It fires once, on a timer, in the first second of the session, and then
the mechanism sits unused for the rest of the app's life.

### What changes

Drive the existing `tint` shared value from the header's expansion instead of
from a `setTimeout`.

- Collapsing carries `tint` to 0. That is the muted `++` it already settles to,
  so the desaturation asked for is not a new treatment: `++` going from pink to
  muted **is** the desaturation.
- Expanding replays it: up, then falling away on the same
  `DURATION.deliberate` / `EASING.inOut` it uses today.

No new mechanism, no new colour, and the app's one moment of brand pink comes to
mark every return to the top rather than only the launch.

The launch tint stays as it is. It is the same animation with a different
trigger and both may fire.

### Rate limiting

A flash on every expansion strobes on a fast scroll up and down. The guard is a
minimum interval between replays: an expansion that arrives sooner than that
settles to the muted `++` without replaying, silently.

The floor is `2000` ms, in `constants/motion.ts` beside the durations it
governs. It is a judgement, not a measurement, and it is in `motion.ts` so it is
tunable in the one place motion is tuned.

`useReducedMotion` already suppresses the launch tint by jumping `tint` to 0.
The replay obeys the same check, unchanged.

## Out of scope

- The machine popover rendering empty. Diagnosed and fixed separately: a
  non-modal Tamagui sheet renders in place, and it was mounted inside the
  header's animated, height-constrained icon row, so it was clipped to nothing.
  Now mounted at screen root beside the import sheet.
- Issue #86, the brew record not snapshotting its plan.
- Anything on the brew screen. That is the other spec.

## Testing

- **`library/`** — `brewShortcut` defaults to `edge`; a stored value outside the
  four is rejected in favour of the default, which the existing `get` type-check
  does not catch because every candidate is a string. The restore path accepts a
  known value, ignores an unknown one, and leaves the default in place for a
  backup written before the key existed.
- **`constants/`** — the three new glyphs exist and are 9 × 9; the existing
  `dotIcons` test enumerates icon names in a hard-coded list and must gain them.
  The two new palette entries are the same hue as their originals at lower
  chroma, and both clear the 3:1 floor for a non-text graphic against `base`.
- **`components/`** — `RecipeCard` renders each of the three card-drawn variants,
  and nothing for `swipe` or when the toggle is off; the marker is not
  overlapped in any of them;
  `SwipeableRecipeRow` shows a third tile only for `swipe`. `MachineDot` renders
  the right glyph and the right colour for each of the four `LinkStatus` values,
  and its colour desaturates rather than fades as collapse progresses.
- **`HomeTitle`** — the tint replays on expansion; a second expansion inside the
  floor does not replay; reduced motion suppresses it.

Nothing here needs hardware. All of it needs a device: the strip of dark bands
down the right of a scrolled list, and whether the pink still reads as a nod
rather than a distraction, are the two things a mockup cannot settle.

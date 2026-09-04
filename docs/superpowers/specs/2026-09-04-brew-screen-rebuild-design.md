# Watching it brew, honestly

**Date:** 2026-09-04
**Status:** approved
**Supersedes:** nothing. Extends `2026-09-03-machine-ux-design.md`.
**Tracking:** issue #87

## Why

M4 shipped and was tested on a real machine with a real card for the first time.
The mockups it was built from are good and were not the problem. The problem is
that the implementation drifted from them in ways that only show up on a device,
and that the screen says a number of things that are not true.

This spec covers the brew screen and the mini bar. It does **not** cover the
BREW shortcut on the recipe card, the home header wordmark, or the connection
dot; those are their own design, and the machine popover rendering empty is a
bug fix rather than a design question.

## The findings, and what they turned out to be

Three of the reported symptoms share one root cause, and it is worth stating up
front because it accounts for most of the perceived "bare bones" quality of the
live screen.

`Machine.onEvent` reads the machine's pour index as:

```ts
pour: Math.min(Math.max(value ?? 1, 1), this.pourCount)
```

The machine's index is **zero-based**. Our own captured trace
(`research/PROTOCOL.md`) records `pour_index=0` for the first pour and then 1,
2, 3, 4, 5 for a six-pour recipe. `Math.max(value, 1)` clamps the zero up to
one, which makes the first stage correct by accident and every later stage wrong
by one:

| Stage | Machine sends | App showed |
|---|---|---|
| 1 | `0` | 1/4 |
| 2 | `1` | 1/4 |
| 3 | `2` | 2/4 |
| 4 | `3` | 3/4 |

From that single line follow: the counter that stayed on 1/4 during stage 2; the
first rung that filled its whole bar and stayed there; the second rung that never
animated at all; the fourth stage that never became active; and the holding
warning that appeared and never cleared, because `holding` is
`stageElapsed > stageSpan` and a frozen `activeIndex` makes that permanently
true.

The corrected expression is `(value ?? 0) + 1`, clamped to the pour count.

## Layout: nothing keeps a fixed height

The screen felt empty on a four-stage recipe because it is built from fixed
heights inside a flexible space. `TRACE_HEIGHT` is a constant 150. `LANE_WIDTH`
is a constant 120, where the mockup always specified `flex: 1`. The ladder is
given `flex={1}` and has nothing to grow with, so on a four-stage recipe roughly
230 pt of the screen is black.

The screen becomes a stack of bands, each with a floor and a cap. Leftover
height is offered to them in order:

All figures are points.

| Band | Floor | Cap | Receives slack |
|---|---|---|---|
| Trace height | 120 | 200 | first |
| Rung bar height | 9 | 15 | second |
| Rung vertical spacing | 3 | even fill | third |
| Now card | content height | — | never |
| Nav, figures, action | fixed | — | never |

The lane inside a rung is `flex: 1` and spans the full row width, as the mockup
specified. On a nine-stage recipe every band sits at its floor and the ladder
scrolls, auto-scrolled to the live rung with a fade at the bottom edge so it
reads as continuing. On a four-stage recipe on a large phone every band is at or
near its cap and there is no black floor.

## The trace

The trace gains the treatment it was drawn with and never received:

- A gradient fill beneath the poured-water line.
- Faint vertical gridlines at stage boundaries.
- A **legend in its own row beneath the graph** — water, cup, plan. Not
  superimposed: top-left is clear at the end of a brew but sits on the plan
  dashes at the start, so overlaying it trades one legibility problem for
  another. A dedicated row costs about 14 pt and never collides.

The stage counter moves to the nav row as **`3/4`**, top right, where the mockup
had it. It can then never disagree with the trace, because there is only one of
it.

## The rung

The lane is one continuous track whose width is the stage's share of the longest
stage in the recipe, split into a **solid water segment** and a **hatched
waiting segment**. Fill runs left to right through both and means a different
quantity in each.

**The solid segment fills by water delivered**, not by elapsed time:
`(water - waterAtStageStart) / pour.volume`. This is the quantity the machine is
actually controlling and the one the rung's right-hand column already names in
millilitres. Elapsed time is the fallback only until the first sample of a stage
arrives.

**The hatched segment fills by time**, because during a planned rest millilitres
are not the thing changing.

The right-hand column follows the same rule: `41/70 ml` while pouring, `14 s
left` while resting. The number and the bar always describe the same quantity.

### The five states

- **Pending** — empty track at 45% opacity. The shape of the stage is readable
  before it happens.
- **Pouring** — solid accent advancing with millilitres.
- **Waiting** — water segment complete, hatched segment filling with time, same
  colour family. A planned pause is not a problem and must not look like one.
  This is a **texture** change.
- **Holding** — see below. This is a **hue** change. Texture says "a different
  kind of time"; hue says "pay attention".
- **Done** — both segments full in the dimmed accent, with any stall bands
  retained.

### Holding, and where it held

A hold is defined as **water is not moving when the plan says it should be**. It
is measured from the water samples, not from an elapsed-time comparison against
the plan, which is what made a planned pause raise a warning that then never
cleared. It clears by itself the instant water resumes.

A stalled stage does **not** turn amber as a whole. Each stall is drawn as an
amber band **inserted at the millilitre where it began, as wide as it was long**.
Water either side of it keeps flowing rightwards. Count, position and duration
are all readable at once, so a stage that stopped once badly is visibly
different from one that stopped three times briefly.

This gives the lane a property worth having: **the amount by which it overruns
its planned width is exactly the time the stage lost.** A clean stage ends flush
with its neighbours; a stage that struggled sticks out past them. Live, the
overrun grows a second at a time. Stall bands are retained after the stage
finishes, so the completed ladder still shows where the brew struggled.

Each stage records a list of `{atMl, seconds}` on the brew record, so history and
export keep the full detail regardless of how it is drawn.

## The now card

A fixed-height card between the figures and the ladder, replacing the four-item
pattern legend that currently lists every possible pour pattern whether or not
it is in use. It says what **this** stage is doing:

```
POURING · SPIRAL · 92°
Out from the centre and back, then it stirs the bed and rests 20 s.
```

It never grows. The figures row already shows water and cup in large type, so a
second large number here would be a duplicate; the value of this card is the
sentence, not a statistic.

## Saying true things

### The handshake

`PHASE_COPY.idle` is "Ready when you are." The brew screen mounts, commands a
run, and sits in `idle` until the machine's first frame arrives — so the moment
that most needs to say "working on it" claims to be finished.

**No spinner.** The ladder is already a progress metaphor and a second one
competes with it; a spinner says "busy" without saying "busy with what"; and the
steps here have real names.

- The brew screen never renders `idle` copy. A commanded run whose machine has
  not moved yet reads **"Connecting to the machine…"**.
- Motion comes from the beat that already exists. `useTraceAnimation` pulses the
  plan line during grinding; the same beat drives the headline's opacity during
  `connecting`, `waking` and `sending`. One vocabulary of motion.
- The sequence is a single self-replacing line: Connecting → Waiting for the
  machine to answer → Sending the recipe (this takes a few seconds) → Recipe
  loaded.

### Refusals, said once

A refusal currently appears three times: the dot-matrix headline, the body
sentence, and a red line beneath. The red line is `useLiveBrew`'s `error`, a
transport channel being used to restate a brew outcome.

- `error` renders only when `phase.name !== "failed"`. If the phase already
  explains it, the channel stays quiet; it speaks only about things the phase
  cannot, such as a dropped link or a failed write.
- **"nothing has been sent to the machine" is removed.** It is false to the
  user's ear, because opening a session beeps. Replacement: **"No recipe was
  sent. Your dose is still in the hopper."** — true, and it says the thing that
  matters.
- The em dashes in `blockedWaterCopy` and `lostContact` are removed.

### The machine is not busy

`Machine.state` is written only when a status frame arrives and cleared only on
disconnect. After a refusal it holds `NO_WATER` or `NO_BEANS` indefinitely, and
`STARTABLE` contains only `{IDLE, COMPLETE, READY}`, so every later attempt is
refused as busy — on an idle machine with a full tank — until the app is force
quit. `brew()` refreshes `info` in its pre-flight but not `state`.

- `brew()` refreshes `state` alongside `info`.
- `NO_WATER` and `NO_BEANS` stop being classed as busy. They are faults, and
  they get their own block kinds with their own sentences.

### Beans

Event `40517` maps to `idling` unconditionally. Arriving during grinding it
almost certainly means the machine is flashing `+BEANS`. During grinding it
becomes **"The machine stopped during grinding. Check there are beans in the
hopper."** Outside grinding it keeps the existing wording.

## What kind of screen this is

The brew screen becomes **the mini bar, expanded** — the Now Playing model.

- Presented as a modal from the bottom.
- A **chevron-down** dismisses it. There is no bottom DONE button, which removes
  the duplication with the back arrow and removes a control currently painted in
  `palette.line`, the hairline colour, which is why it read as disabled.
- The mini bar slides out downward as the screen rises, on the same timing, so
  the two read as one object changing size.

The morph — the mini bar's text physically growing into the screen — is a
shared-element animation and is deliberately **not** in scope. The rise-and-drop
pairing reads almost the same for a fraction of the cost, and the morph remains
available later without structural change.

`brew` is currently not declared in the navigator at all, which is why it falls
through to the default native bar with a `< index` back title. It is declared
with `headerShown: false` and draws the mockup's own nav row: connection dot and
recipe name left, stage counter right.

Modal presentation also resolves the mini bar appearing over the export screen,
because a modal covers it.

## The mini bar

- Padding on the close button, which currently sits flush.
- **The chevron is removed.** It does nothing — the whole bar is the tap target —
  and two affordances nine points apart compete.
- Dismissal animates: slides down and out rather than vanishing.
- It uses the recipe's accent, which it currently does not.
- Hidden on `brew`, `brewRecord` and `brewHistory`.

The compact layout itself is kept; it was judged to work.

## Testing

- **`library/machine/`** — the pour index off-by-one gets a characterisation
  test driven from the captured trace in `research/PROTOCOL.md`: indices 0..5 on
  a six-pour recipe must produce stages 1..6. Stale `state` after a refusal must
  not refuse a later attempt. `NO_WATER` and `NO_BEANS` must not report as busy.
  `40517` during grinding must report beans.
- **`library/brew/`** — stall detection from a sample series: no stall during a
  planned pause; a stall recorded with the millilitre it began at and its
  duration; several stalls in one stage; stalls surviving onto the record.
- **`components/`** — the rung renders each of the five states; the lane is
  `flex: 1`; the fill follows volume not time; the overrun equals the held time.
  The ladder's band allocation at four stages and at nine.
- **`app/brew.test.tsx`** — `idle` copy never renders for a commanded run;
  `error` is suppressed when the phase is `failed`; the counter comes from the
  nav row.

NFC is not involved. The BLE paths are exercised against the existing fake
machine; the visual result needs a device.

## Out of scope

The BREW shortcut on the recipe card, the home header wordmark hue, the
connection dot icon and colour, and the empty machine popover. The first three
are a separate design; the last is a bug — the popover is mounted inside the
header's animated, fixed-height icon row, so the sheet is clipped by its parent.

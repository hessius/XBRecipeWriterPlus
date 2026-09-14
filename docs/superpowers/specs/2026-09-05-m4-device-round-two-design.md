# M4 device round two — design

*2026-09-05 · branch `m4-watch-it-brew` · closes the design-dependent half of #92, plus #88*

The second on-device pass produced seventeen findings. Eleven were plain bugs and
are already fixed and pushed. Six remain, and each of them is a design decision
rather than a defect: what a control should look like, what a colour should
mean, where the spare height should go. This is that set, plus #88, which was
deferred until there was a device to judge it on.

Two threads run through all of it. The first is that the brew screen spends hue
on meaning — the accent means *this recipe*, amber means *the machine stopped* —
and every new colour has to survive that budget. The second is that several of
these controls were built to be correct and never built to be *legible*: they
work, and there is no way to tell that they worked.

---

## 1 · The machine panel opens the header

**The finding.** The panel rises from the bottom of the screen, opened by a
control in the top-right corner. It arrives from the wrong end.

**The change.** `MachinePopover` stops being presented through `XbrwSheet` and
becomes a panel the header owns. It is renamed `MachinePanel`, because the
current name describes a presentation it will no longer have.

`HomeHeader` renders it beneath the title row when open. It is not an overlay:
there is no scrim, the list below is pushed down rather than covered, and the
only way to dismiss it is to tap the machine dot again — the same control that
opened it, still visible, still in place. Nothing is hidden behind it, so there
is nothing to have to get back to.

It opens and closes by animating its height and opacity, using the header's
existing Reanimated conventions and `useReducedMotion`. Under Reduced Motion it
fades without travelling, exactly as the header's collapse already does.

It works in both header states. Collapsed, the header is shorter and the panel
opens under the shrunken title; nothing about the panel depends on the tiles
being present.

**Type.** There is room, and the current sizes do not use it. Row labels 10 → 11,
values 13 → 18, the age 10 → 11.

---

## 2 · REFRESH becomes a button, and stops lying about the time

**The finding.** The refresh control is a bare `Pressable` around a 12 pt icon.
It has no pressed state, no busy state and a target far under 44 pt. The only
evidence it worked is that the machine beeps.

**The change.** A full-width bordered button below the three readings, 44 pt
tall, labelled `↻ REFRESH`. It sits under the rows rather than on the water row
because the round trip re-reads all three; putting it on one row claims a
narrower effect than it has.

Four states:

| State | Appearance |
|---|---|
| Idle | Accent border and label |
| Pressed | Accent wash behind, reduced opacity |
| Asking | `◐ CHECKING…`, dimmed, not pressable |
| No answer | `! NO ANSWER` in `warn`, then back to idle |

**The state machine is a hook, not a component.** `useRefreshRequest` takes the
current `askedAt` and returns the state plus a `press` callback. Pressing moves
it to *asking*; a **change in `askedAt`** — the machine having actually answered
— returns it to *idle*; six seconds without one moves it to *no answer*, which
holds briefly and then returns to idle. It is a pure hook over a number and a
clock, so it is tested without a machine. *No answer* holds for four seconds
before returning to idle.

**And the bug underneath.** `app/index.tsx:547` calls `setPopoverNow(Date.now())`
the instant the control is pressed, which resets the displayed age to `JUST NOW`
before the machine has said anything at all. It is the reason the control could
not show progress even in principle: it had already claimed to have finished.
That call goes. The age is derived from `vitals.askedAt` and nothing else, which
is exactly what makes *asking* observable.

---

## 3 · The cup line takes the accent's complement

**The finding.** The cup line is `palette.muted` dotted `1 3` — effectively
invisible. It wants a contrasting colour.

**The constraint.** A fixed colour cannot work. The accent is chosen by the user
from twelve, two of which (Peach, Oolong) are themselves orange, and amber is
already spoken for: it is what the water stroke turns when the machine is
holding, and what a stall segment is filled with.

**The change.** A pure function `cupLineFor(accent)` beside `mix` in
`constants/colors.ts` — with the rest of the colour, for the same reason every
literal lives there. It converts the accent to HSL, rotates the hue 180°, holds
saturation, and holds lightness with a floor of 60 % so the result stays legible
on black.

Then the guard: **if the rotated hue lands within 25° of `warn`'s hue (≈43°), it
is pushed to the nearer edge of that band.** Amber keeps meaning one thing.

Across the twelve accents the guard fires for exactly one. Sky's complement lands
at 33°, ten degrees from amber, and is pushed out to 18° — a coral. The two next
nearest, Ice at 16° and Lilac at 72°, are 27° and 29° clear and are left alone.
The band is deliberately tight for that reason: widening it would start moving
colours that do not need moving.

`BrewTrace` uses the result for `trace-cup` in both the compact and the full
render, and in the legend. The dash stays `1 3`; the width goes 1.5 → 2.

---

## 4 · A wait is striped, always

**The finding.** The wait segments are not striped as the mock-up had them, and
during an active stage the wait reads as indistinguishable from the water beside
it — one long undifferentiated bar.

**The cause.** These are one bug. `rungGeometry` already models a `pause` segment
as its own kind, and `BrewStageRung` already gives its *track* a dashed outline —
but its *fill* is `fillColour(kind, accent, done)`, which returns the same solid
accent as water. The distinction exists in the geometry and is thrown away in the
paint.

**The change.** The pause segment is filled with diagonal stripes, in two layers:

- faint stripes across the whole wait, from the moment the ladder is drawn, in
  the accent mixed toward `base`;
- accent stripes over them, clipped to the elapsed fraction.

Faint-from-the-start rather than filling-from-empty, so that the rests in a
recipe are visible before it runs and the ladder reads as a plan, not only as a
progress bar. When the stage is done, both layers go `muted`, matching what the
solid fill already does.

**Mechanism.** A `HatchFill` component drawn with `react-native-svg`, which is
already a dependency, using a `Pattern`. Not a row of skewed views: the lane is
`flex`-sized from each segment's seconds, so nothing in the tree knows its width,
and a pattern fills whatever size it is handed without being told.

**And a gap.** Segments gain 3 pt of space between them, so water and wait can
never merge into one bar even at a glance. The gap is taken out of the lane, not
out of the shared time scale, so the segments stay proportional to their seconds.

---

## 5 · #88 — the spare height reaches the bars

**The finding.** `BAR_CAP` is 15 pt and saturates immediately, so every remaining
point falls through to `rungGap`, which has a floor and no cap. At four stages
and 600 pt of flexible height the bar is 15 pt in an 85 pt row — 15 % of its own
row. The screen is full, but it is full of spacing.

**The change.** Both caps rise, a gap cap is added, and the allocator makes a
**second pass** in the same priority order, so that what the soft caps refuse is
offered again against hard ceilings before any of it is left over.

| Band | Floor | Soft cap | Hard ceiling |
|---|---|---|---|
| Trace | 120 | 200 | 300 |
| Bar | 9 | 28 | 44 |
| Gap | 3 | 20 | 34 |

Pass one fills to the soft caps in the order trace, bar, gap. Pass two repeats it
against the ceilings. Anything still left is **breathing room, with the ladder
block centred** — space around well-proportioned content reads as deliberate,
where stretched content reads as a fault.

At 600 pt:

| Stages | Trace | Bar | Gap | Bar as % of row | Left over |
|---|---|---|---|---|---|
| 2 | 300 | 44 | 34 | 56 % | 144 |
| 3 | 300 | 44 | 34 | 56 % | 66 |
| 4 | 300 | 44 | 31 | 59 % | 0 |
| 6 | 300 | 30 | 20 | 60 % | 0 |
| 9 | 204 | 28 | 16 | 64 % | 0 |
| 12 | 204 | 28 | 5 | 85 % | 0 |

The bar is between 56 % and 85 % of its row everywhere, against 7 % to 38 %
today. Two and three stages cannot fill 600 pt without a ladder thick enough to
look like a bug, so there the ceilings bite and the remainder is centred — the
old candidate's answer, applied only at the two stage counts where every layout
has the same problem.

---

## 6 · A new brew does not wear the last one's status

**The finding.** Starting a brew, the previous status is shown until grinding
begins. It should be blank while we wait.

**The cause.** `useBrewRun.ts:74`. Until a phase has been heard for this run, the
machine's own phase stands in. A previous fix mapped *terminal* stand-ins to
`waking`, which removed the stale `STOPPED`; a non-terminal leftover still shows
through unchanged.

**The rule.** *If the app started this brew, nothing the machine said before the
run began belongs to it.* Such a run shows `waking` until it hears something of
its own.

**The constraint that shapes it.** The stand-in cannot simply be removed. A brew
started by pressing play on the machine itself has no app-side send, and the
machine's phase is then the only truth there is — the app has to join it in
progress. So the fix is a distinction between a run the app initiated and a run
it joined, not a blanket refusal to read the machine.

The mechanism is left to implementation, which should establish first, by test,
which of the two paths the current code takes in each case.

---

## Testing

Everything above except the panel's presentation is a pure function or a state
machine, and is specified that way on purpose.

- `cupLineFor` — a table test over all twelve accents asserting the result
  differs from both the accent and `warn`, that the guard fires for Sky and for
  no other, and that lightness never falls below the floor.
- `useRefreshRequest` — idle → asking on press; asking → idle when `askedAt`
  changes; asking → no answer after the timeout; no answer → idle.
- `allocateBands` — the existing tests assert the constants by name and should
  mostly survive. The "gives everything left to the spacing" test asserts the
  remainder is smaller than the stage count and must be rewritten. New: the
  second pass, the ceilings, and that nothing is left over at four stages or
  more at realistic heights.
- `HatchFill` — both layers present, the bright layer clipped to the fill
  fraction, `muted` when done.
- `BrewStageRung` — a pause segment is not painted the same as a water segment
  in any state. This is the assertion that would have caught the original fault.
- `useBrewRun` — an app-started run shows `waking` until it hears its own phase,
  whatever the machine was last doing; a joined run still adopts the machine's.

Every new guard is mutation-tested by reintroducing the fault it claims to catch.

## Not in scope

- The no-beans copy in #92. Both strings in the source are grammatical; the
  report is most likely a dot-matrix reading artefact and needs a look at a
  device, not a change.
- #90, which needs a hardware measurement before anything can be designed.
- `docs/copy.md` is now committed. Edits to it are a separate pass, applied
  across the app by ID.

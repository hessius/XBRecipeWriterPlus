# Showing the bypass while the machine brews

**Date:** 2026-09-10
**Status:** approved
**Milestone:** M4 · Watch it brew

## The defect

A real brew of a three-stage recipe with a 5 ml bypass rendered no bypass at
all. From the device screenshot:

- The bypass was invisible before it happened — nothing on the ladder, nothing
  on the trace.
- Stage 03 read `90/85 ml`. The bypass water was folded into the last stage.
- Stage 03's lane was painted amber, as though the machine had stalled for a
  minute, and the summary carried a `+53` overrun badge.

None of that is what happened. The machine brewed correctly.

## Root cause

One cause, three symptoms: **the whole brew path is `recipe.pours`-shaped, and
a bypass is not a `Pour`.**

`BrewRecorder.push` stamps every sample with `this.pour`
(`library/brew/BrewRecorder.ts:159-166`), and `this.pour` only ever changes on
a `pouring` phase (`:183-185`). The machine emits `POUR_START` (`40510`) once
per pour and **never a fourth one for the bypass** — confirmed by a live frame
log, which shows `40510(0)`, `40510(1)`, `40510(2)` and no more. So every
sample from the drawdown wait and from the bypass itself is stamped `pour: 3`.

From that single fact:

1. **The water is folded in.** `stageWaterFrom(samples, 3)` is the stage's last
   reading minus the total before the stage began. With the bypass samples in
   the stage, that is 90 rather than 85.

2. **The stall is a phantom.** During the 61 s drawdown the water sits flat at
   85 ml, which is the stage's target — and `stallsInStage`'s *trailing*
   plateau is guarded by `TARGET_TOLERANCE_ML`, so it would have been spared.
   But the bypass then raises the water 85 → 90 while still stamped `pour: 3`.
   That rise calls `onRise`, which **closes** the plateau through `push`, and
   `push` has no target guard — only the trailing clause does. A 61 s stall is
   recorded at 85 ml. That is the amber.

3. **It is invisible beforehand.** `planFromPours`, `planPoints`,
   `plannedSeconds` and `stageSpans` all iterate `pours`. There is no bypass in
   the plan, so there is nothing to draw in advance, and no lane for the
   machine's wait to sit in — which is what produced the `+53` time overrun.

### What the frame log established

From the brew of 04:26–04:30:

- `40510` (`POUR_START`) carries a zero-based pour index; three pours, no
  fourth.
- **`40520` = `RD_Bypass`, now verified.** Emitted once, at 04:30:12.731 — 61 s
  after the last pour began, 8 s before `40511 BREWER_STOP` and 10 s before
  `40512 ENJOY`. This is the bypass firing after the drawdown wait, and it is
  the detection hook the app needs. It was previously documented as
  single-source and unverified in four places
  (`docs/machine-integration/ble-protocol.md:157`,
  `docs/superpowers/plans/2026-09-07-bypass-water.md:208`,
  `docs/superpowers/plans/2026-09-08-bypass-editing.md:3080`,
  `docs/superpowers/specs/2026-09-08-bypass-editing-design.md:411`); all four
  should be promoted when this lands.
- The arming frame `→ 58 01 01 A6 1F 18 … 00 00 A0 40 00 80 54 44 …` decodes as
  little-endian floats `5.0` ml and `850` → 85 °C, matching the recipe. That
  confirms the frame is `buildBypassDose` and that the machine received the
  bypass it was asked for.

## The design

### 1 · Domain — the bypass is stage *n* + 1

`Machine` gains a `{name: "bypass"}` phase, entered when `EVENT.RD_BYPASS`
(`40520`) arrives during a brew. `EVENT` in `library/machine/protocol.ts` gains
the constant.

`BrewRecorder` treats that phase like a pouring phase whose index is
`pours + 1`. Every sample from the bypass onward is stamped with that index.

This single change fixes symptoms 1 and 2 with no edit to `stalls.ts`:

- Stage 3's samples now end flat at 85 ml. The plateau is never closed by a
  rise, so it falls to the trailing clause, which the target guard spares. No
  stall.
- `stageWaterFromSamples` is called with `stages + 1`, so the 5 ml lands in its
  own bucket and stage 3 reads `85/85`.

Leaving `stalls.ts` alone is deliberate. Its target guard is load-bearing for
the #87 fix, and re-cutting it to special-case a bypass would put that at risk
for no gain.

### 2 · Plan — where the box sits

`brewShape` gains an optional bypass span. It begins at the end of the last
stage's pause and lasts `volume / flow`, so a machine that fires the bypass
promptly matches the plan exactly. If the machine waits longer for the dripper
to drain, the live box **slides right** while it waits; the plan is not
rewritten.

The water target line stays at the sum of the pour volumes. The bypass box is
drawn **above** it, which is the same story the editor tells: bypass water sits
on top of the brew target rather than inside it.

### 3 · Record — optional, back-compatible

`BrewRecord` gains:

```ts
bypass?: {
    volume: number;       // ml asked for
    temperature: number;  // °C asked for
    delivered: number;    // ml the scale actually saw
    startedAt: number;    // ms into the brew that 40520 arrived
};
```

Absent on every row written before it existed, exactly like `pouringAt`,
`stalls`, `plan` and `stageWater`. An old record therefore renders precisely as
it does today. The asked-for figures are copied from the recipe at brew time,
alongside `plan`, so editing the recipe afterwards cannot rewrite history.

`finalOutcome`'s `plannedWater` stays the sum of the pour volumes. The bypass
is not brew water and a large one must not be able to mask a short brew.

### 4 · Rendering — one dash, three places

The dashed outline already means *bypass* in the editor
(`components/BypassRung.tsx`). The same mark is used everywhere it appears, so
the reader learns it once.

**Ladder.** A fourth rung, dashed, in both the live screen and the summary. Its
states:

| state | when |
| --- | --- |
| pending | the brew has not reached the last stage's pause |
| waiting | the last stage's planned pause has elapsed and `40520` has not arrived |
| filling | `40520` has arrived and water is moving |
| done | the brew ended after the bypass |

*waiting* is a neutral state with its own copy (the machine is letting the
dripper finish), never the stall colour. This is the part that stops a
legitimate drawdown reading as a fault.

No stall detection runs on the bypass lane. Five millilitres is too short for
the plateau test to say anything true.

`app/brew.tsx` allocates its bands from `recipe.pours.length`; that count needs
the bypass rung when there is one.

**Trace.** A dashed-outline box above the target line, in the same position the
plan puts it, sliding right while the machine waits.

**Figures.** `BrewFigures` keeps its three `flex={1}` columns. `WATER` shows the
brew water (240) with a small dashed-outlined `+5` badge beside it, shown only
when the brew had a bypass. A fourth column was rejected: at 28 px on a narrow
phone the four columns are too tight to read.

### 5 · Edge cases

- **Bypass enabled, no `40520`.** Older firmware, or a machine that skips it.
  The rung stays in *waiting* and the water falls where it does today. This
  degrades to current behaviour rather than failing.
- **`40520` on a recipe with no bypass.** The lane opens anyway, so the water is
  attributed honestly rather than smeared onto the last stage.
- **Tea.** Sends no bypass, so no rung.
- **A brew that ends during the bypass.** The rung shows what was delivered
  against what was asked, like any other stage.

### 6 · Testing

Unit:

- `protocol` — `40520` decodes as `RD_Bypass`.
- `Machine` — the notification moves the phase to `bypass`, and does not clamp
  into the last pour.
- `BrewRecorder` — samples after the bypass phase carry index `pours + 1`.
- `brewShape` — the span starts after the last pause and is `volume / flow`
  long.
- `BrewRecord` — a record without `bypass` behaves exactly as before.

Replay: a fixture built from the frame log in this document, asserting stage 3
reads `85/85` with **zero** stalls and the bypass lane reads `5/5`. This is the
test that would have caught the defect.

Component: the four rung states, the trace box, the figures badge, and a
`brew.test.tsx` case for a bypass brew end to end.

Device: brew a bypass recipe and confirm the rung appears before it fires,
waits without amber, fills, and that the summary reads `240 +5`.

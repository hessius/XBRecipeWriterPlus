# Gravimetric flow rate

**Date:** 2026-09-29
**Status:** implemented

## The request

The brew chart already carries the answer: the cup line's angle *is* the flow
rate. Reading an angle off a line is a skill, though, and it is not a glance.
What was asked for is the same fact in a form you can take in without
measuring anything by eye.

## 1. Which rate

Two rates exist in the stream and they are not the same thing.

- **Cup rate**, `d(cup)/dt`, in g/s. How fast liquid is leaving the bed and
  landing in the cup. Nobody told the machine to do this; it is what the coffee
  and the grind decided. It keeps running after the last pour, through the
  drawdown, and it is the only one of the two that moves when the grind moves.
- **Pour rate**, `d(water)/dt`, in ml/s. How fast the machine is dispensing.
  The recipe already asks for this per stage as `Pour.flowRate`, so it can be
  read as asked against delivered. It is zero through every pause and through
  the whole drawdown.

The cup rate is the subject. The pour rate rides along beside it, because it
costs almost nothing once the machinery exists and it answers a different and
occasionally urgent question: is the machine doing what it was told.

## 2. Why the number is not enough on its own, and why it is windowed

A rate is a derivative, and differentiating a scale stream amplifies its noise.

The scale reports roughly ten samples a second, and `stalls.ts` already fixes
the noise floor at `NOISE_FLOOR_ML = 0.5`. Differenced across one sample gap
that is 0.5 / 0.1 = **5 g/s of noise on a signal of about 2 g/s**. The figure
would be more noise than reading, and it would read as a machine misbehaving
when nothing was wrong. `BrewFigures` has already written down the milder
version of this complaint about the figures it draws today: *"Rounded to whole
units because the scale reports tenths and they flicker; a figure this size
that changes every 100 ms cannot be read at all."*

So the live rate is fitted, not differenced:

- A **two second window**, `FLOW_WINDOW_MS = 2000`.
- A **least-squares slope across every sample in the window**, not a secant
  between its endpoints. A secant divides the noise of two readings; a fit
  spreads it across the twenty or so readings the window holds. This is the
  reason two seconds is usable at all. A two point secant at two seconds would
  carry about 0.25 g/s of jitter, which at the size this is drawn still
  flickers; the fit is what buys the responsiveness back.

The fit also requires a spanned second of readings,
`FLOW_MIN_WINDOW_MS = 1000`. The first second of a brew therefore reports
nothing, and the live figure goes quiet for about a second after a bypass ends.
That silence is intentional. The alternative was the opening tick of every brew
reporting 6.25 g/s against a true 2 g/s, then donating that artefact to
`maxRateOf` and setting the chart axis from it.

Two seconds and not three: the window is also a lag, and the live figure trails
reality by half of it. A second of lag is the most a live readout can carry
before it stops describing what is in front of you.

And a single instant of a rate says very little in any case. `1.8 g/s` is not
actionable; `it was 2.4 and is now 1.8` is. So wherever the live figure is
drawn it is drawn with a short history beside it.

Amendment, 2026-09-30: the retained chart does not share the live estimator.
The live readout remains causal on `FLOW_WINDOW_MS`, but a finished record has
the whole stream available. Its chart uses `retrospectiveFlowSeries`, a
degree-two Savitzky-Golay smoother over a centred six second window. The window
is measured in time, not as a sample count, and sparse streams widen it from
their own median cadence so the fit is made from real neighbouring points. Each
centred window shrinks at the ends instead of padding. The smoothing is applied
inside the contiguous rate runs the path builder already draws, so it cannot
turn a gap nobody measured into a line.

## 3. The bypass, which would otherwise corrupt everything

`BrewSample.water` and `BrewSample.cup` are raw scale totals, and the bypass
goes onto the same scale. `app/brew.tsx` already subtracts for this when it
names the brew water.

This matters more here than it does there, because of *when* the bypass fires.
The verified frame log of 2026-09-10 in
`docs/machine-integration/ble-protocol.md` has it opening 61 seconds after the
last pour began and `BREWER_STOP` following eight seconds later. The bypass
lands **inside the drawdown**, which is precisely the stretch the cup rate is
being read over.

Left alone it would do two things, both wrong:

1. Put a cliff in the cup channel that looks exactly like a channelling event.
2. Inflate the drawdown figure by the whole bypass volume, because `cupTotal`
   is the last raw reading.

The existing code already solves half of this, and the solution is reused
rather than reinvented. `drawdownFrom` discriminates bypass samples by
`sample.pour > stages`: the recorder tags bypass samples with a pour index
above the recipe's stage count, which is why the bypass cannot move the
drawdown boundary today. **`flowRate.ts` uses the same test.** One
discriminator, already proven on hardware, rather than a second one derived
from `bypass.startedAt` that could drift out of step with it.

The remaining half, the inflated total, is handled by subtracting
`bypass.delivered` from `cupTotal`, which is the idiom `app/brew.tsx:156`
already establishes.

The drawdown **timer** needs no change. It was already protected, for this
reason and by this mechanism.

## 4. `library/brew/flowRate.ts`

A new module beside `stalls.ts`, `brewShape.ts` and `stageStory.ts`. Plain
TypeScript, no React, no database, no knowledge of how any of it is drawn.

```ts
export const FLOW_WINDOW_MS = 2000;

/** A windowed rate pair at one instant. */
export type FlowPoint = {at: number; cup: number; water: number};

/** Both channels across the whole stream, for the chart. */
export function flowSeries(samples: BrewSample[], stages: number): FlowPoint[];

/** Both channels across a retained stream, smoothed for stored charts. */
export function retrospectiveFlowSeries(samples: BrewSample[], stages: number): FlowPoint[];

/** The latest windowed pair, for the live row. Zeroes on an empty stream. */
export function flowNow(samples: BrewSample[], stages: number): FlowPoint;

/** The cup reading at the drawdown boundary, for the recorder to store. */
export function cupAtDrawdown(samples: BrewSample[], drawdownAt: number): number;

/** The stored figure. Null whenever any term is missing. */
export function drawdownRate(record: BrewRecord): number | null;
```

`stages` rather than a bypass object, so the module needs to know only the one
fact that separates a bypass sample from a brew sample.

Amendment, 2026-09-30: the finished record and the live screen cannot share
`drawdownFrom` directly. A review found the finished helper is a whole-stream
argmax, which is stable enough when it runs once at the end but visibly wrong
when it runs every render on a growing, noisy stream. The live screen now uses
`library/brew/liveDrawdown.ts`:

```ts
export const DRAWDOWN_OPEN_MARGIN_MS = 2100;
export type LiveDrawdown = {
    drawdownAt: number;
    drawdown: number | null;
    reserveDrawdown: boolean;
};
export type LiveDrawdownOptions = {
    samples: BrewSample[];
    stages: number;
    elapsedSeconds: number;
    phaseName: BrewPhase["name"];
    running: boolean;
    finalStageTargetMl?: number;
};
export function liveDrawdownFrom(samples: BrewSample[], stages: number): number;
export function liveDrawdown(
    options: LiveDrawdownOptions
): LiveDrawdown;
```

It keeps the same physical boundary as `drawdownFrom`, the point where the last
stage's brew water stopped rising, but retakes that boundary only after a rise
greater than the scale noise floor and measures that retake from the highest
final-stage level actually seen. The record still uses `drawdownFrom`; the
live helper exists because a live stream is not finished yet.

`drawdownRate` is

```
(cupTotal - (bypass?.delivered ?? 0) - cupAtDrawdown) / drawdownSeconds(record)
```

and returns `null` if `cupAtDrawdown` is absent, if `drawdownSeconds` is null,
or if the result is not finite and positive. Null means nobody can say. It
never guesses, and it never returns 0, for the same reason `drawdownSeconds`
does not: a drawdown rate of nothing is a claim this app is not in a position
to make.

## 5. The live screen

One flow row plus a smaller second figures row in `BrewFigures`. The second row
aligns under WATER, CUP and TIME, so a partial row keeps its column rather than
stretching across the card. The drawdown clock is hidden until the gate
described in §5.1 opens:

```
WATER 214⁺³⁰        CUP 189          TIME 3:26
FLOW  ▁▂▄▆▇▆▄      1.8 G/S          POUR 3.1 ML/S
DRAWDOWN            DELAY            GRIND
0:32 ⌐2.1 G/S¬      +5               53 ⌐RECIPE 60¬
```

When the record positively says the grinder was switched off, the third
figure is `GRIND` / `OFF` with no recipe badge. It still occupies the same
second-row slot as a numeric grind figure.

- A sparkline of the last 30 seconds of cup rate, then the current value, then
  the pour rate as a smaller second figure. Both carry their unit: the cup
  rate is grams per second and the pour rate millilitres per second, and a
  bare second number would be read in the first one's units.
- The sparkline is the point. It is what stops the number being a lone instant.
- **Absent until the brew is pouring.** `flowNow` returns zeroes on an empty
  stream, and a row reading `0.0 g/s` through waking, sending and grinding
  would be a measurement of nothing presented as a measurement. The row appears
  with the first drop, on the same condition the stage counter already uses.
- The live screen draws **no drawdown rate** and no grind figure. `drawdownRate`
  averages over a finished drawdown, and an average of a thing still happening
  changes meaning as it is read. The live rate is the FLOW row's instantaneous
  one, and the two must not be conflated. The grind dial is read after the brew.
- The live screen reserves the second figures row once the drawdown boundary is
  known, even before the clock opens. That is the same anti-jump rule the FLOW
  row already follows, applied at the moment the row can later gain DRAWDOWN or
  DELAY.
- No new band, so `bands.ts` is untouched and no height is taken from the trace
  or the ladder.
- No control, no mode, nothing to operate with wet hands and a timer running.

### 5.1 The live drawdown clock

The live screen gains a **drawdown clock**, counting up, in the same
`DRAWDOWN` line the record uses. It is a clock only: no rate beside it.

It is the record's boundary adapted for a partial stream. The live helper keeps
the final-stage water boundary aligned with `drawdownFrom`, while adding the
noise and phase gates a finished record does not need. Because the live clock
and the stored figure use the same physical boundary over the same samples, the
clock **converges exactly** on `drawdownSeconds(record)`. There is no moment
where the screen says 0:41 and the record it writes says 0:38.

**Rejected: the machine's own `settling` phase.** It opens on `BREWER_STOP`,
which the verified frame log puts about 69 seconds after the real boundary. A
clock started there would report 8 seconds for a drawdown that ran over a
minute. That is the precise error `drawdownAt` exists to prevent, and it must
not be reintroduced on the live screen.

**The gate.** Amendment, 2026-09-30: the original gate,
`activeIndex >= pours.length - 1`, was insufficient. It opened at the first
final-stage sample, which printed `DRAWDOWN 0:00` for the whole final pour; it
closed throughout `bypass`, even though the verified frame log puts bypass
inside the drawdown; and the whole-stream argmax reset the clock on sub-ml
scale wobble.

The clock is now computed by `liveDrawdown({samples, stages, elapsedSeconds,
phaseName, running, finalStageTargetMl})`. The boundary is final-stage only, so
a planned pause between earlier stages still cannot open it. The boundary is
retaken only by a water rise greater than `NOISE_FLOOR_ML`, and the retake
threshold is measured from the highest final-stage water level actually seen
rather than the ratcheted boundary level, so plateau wobble does not spend the
floor's headroom.

The open gate has two paths. First, the final stage's planned volume opens the
clock immediately, even while the machine still reports `pouring`. This is the
normal hardware path: there is no event for "water stopped", and the verified
frame log shows most of the drawdown happens before `bypass` or `settling`.
"Delivered" is `stalls.ts`'s `TARGET_TOLERANCE_ML` predicate, the same one
`stalledNow` uses, so a stage that lands a millilitre under plan has met it.
The two must agree: a zero tolerance here would let the screen show no HOLDING
warning and no drawdown clock at once, one saying the stage finished and the
other saying it had not, and routine shortfall would push every such brew onto
the backstop. Second, `bypass` and `settling` act as a backstop for a final
stage that ended short of plan. That backstop waits until the boundary is at
least `DRAWDOWN_OPEN_MARGIN_MS` behind the sample clock.

`DRAWDOWN_OPEN_MARGIN_MS` is 2100 ms: `MIN_STALL_SECONDS` plus one nominal
scale frame. `MIN_STALL_SECONDS` is the minimum duration that makes a real
in-pour stall worth naming, not a maximum duration a stall can last. A quiet
water channel below the target therefore cannot prove the pour has ended while
the machine is still in `pouring`; it would also match a genuine long stall.
For that reason the quiet margin never opens the clock during `pouring`. It
only debounces the post-pour phase backstop.

Hidden is hidden, not reset: the clock keeps accumulating underneath, so it
appears already reading the elapsed drawdown rather than starting from zero at
the moment the gate opens.

The phase classification is exhaustive over `BrewPhase["name"]`, so a new
machine phase cannot compile until it is classified as `veto`, `water`, or
`backstop`.

The clock is absent before the gate opens and absent on a brew that failed or
was cancelled before pouring, on the same rule as the FLOW row.

Rejected: a fourth and fifth column in the figures row. That row has already
refused a fourth column twice on the record, and both refusals are written into
the file: the bypass became a badge and the drawdown became a line, both because
*"at 28 pt a fourth column is too tight to read on a narrow phone."*

## 6. The record screen

A `BrewRateChart` section inside `BrewSummary`, below the trace and **inside the
`ViewShot`**, so the finished brew screen, the record screen and the shared
image all carry it. The share is not yet released, so there is no established
card to uphold and the chart can simply be part of it.

Amendment, 2026-09-30: the finished brew modal passes the same retained stream
through `retrospectiveFlowSeries` and passes the final drawdown clock plus
average drawdown rate. A brew shared immediately from the modal and the same
brew shared later from the record therefore carry the same chart and figure.
The story card uses
a prescriptive height budget from `storyCard.ts`, with the measured card width,
stage count, bypass row, figure rows and bounded Doto font scale as inputs. It
drops story-only rows in this order: tags, rating, coffee. If the card is still
too full it drops the rate chart, then shrinks the trace to its story floor, and
only then drops the stage ladder on very compact cards with many stages. The
ladder floor is the same `stageLadderRungMinHeight` used by
`BrewStageLadder`, so the budget includes the text row, the rung gap and the
optional bypass closing rung. The recipe name does not wrap in the summary: it
is the single-line `MarqueeText` path held still for capture. Tags may wrap, and
the budget counts their rows before deciding whether they fit.

- Both channels on one rate axis, on the same real-seconds time axis the trace
  uses, so the two charts line up vertically and a feature in one can be found
  in the other.
- The chart carries one visible label, `FLOW RATE`, above the plot. It does not
  repeat `WATER` and `CUP`, because those colours have already been named on
  the trace immediately above. It also does not print a numeric y-axis label:
  the axis has a deliberate 4 G/S floor and is there to compare shapes, not to
  invite exact reading from an unmarked scale.
- The bypass interval is **omitted from the cup channel** rather than smoothed
  across, because a smoothed bypass is an invented reading.
- Gated on `hasStream`. A record whose samples the retention sweep took omits
  the section entirely. It does not draw an empty box, and there is no control
  to disable.
- The summary does not duplicate the chart's two-point drawing threshold. It
  asks for the section whenever `hasStream` is true, and `BrewRateChart`
  returns null when the retained rate series cannot honestly form a line. That
  null return leaves no wrapper, no border and no spacer behind.

Amendment, 2026-09-30: the rate chart's horizontal axis is not sized from its
own last point. It is handed the same time extent the volume trace uses, the
maximum of planned time, last raw sample time, and bypass extent. That keeps the
same second at the same x in both stacked charts even when a plan tail, overrun
or bypass box reaches past the last fitted rate point.

Amendment, 2026-09-30: the chart has a named `RATE_TOP_GAP` of 18 pt and keeps
the 12 pt `RATE_BOTTOM_GAP`. The volume trace legend immediately above the
rate chart is text, so it needs more air than the figure block below. The story
card budget spends `RATE_TOP_GAP + RATE_HEIGHT + RATE_BOTTOM_GAP` for the rate
chart and passes those same values into `BrewSummary`.

Amendment, 2026-09-30: a measured on-screen `BrewSummary` reserves a 44 pt
`SUMMARY_SCROLL_PEEK` before sizing the stage ladder. That reveals enough of
the judgement section below the fold for `HOW WAS IT` to be recognisable on the
record screen and finished live brew. Story-card summaries pass fixed
`storyBands` and no viewport height, so they do not spend the peek.

The rate chart does not inset horizontally. Its plot is the full `width`, just
like `BrewTrace`, and only the vertical dimension is inset by half the widest
rate stroke so high and low rates do not clip. Horizontal stroke caps are
allowed to draw with visible overflow rather than moving the time axis.

Every missing rate point breaks the line. `retrospectiveFlowSeries` emits at
the sample cadence when it can smooth a retained run and emits no point when it
cannot, so adjacent array entries are connected only if their timestamps are
adjacent at the stream's own cadence. A dense stream keeps the original 150 ms
floor, while slower streams derive the allowance from their median gap. A real
pause still starts a new subpath.

The y axis keeps the 4 g/s floor and does not label it. The chart is a compact
shape companion to the trace, not a calibrated readout; labelling that floor
would invite reading quiet brews against an axis chosen only to stop a nearly
flat stream being stretched into a mountain.

Rejected: a toggle swapping the trace for the rate chart. The trace lives
inside the `ViewShot`, so the toggle would change what gets shared rather than
only what is seen; it would need a rule about whether the mode persists between
brews, with a bad answer either way; and on a swept record it would be a control
that leads nowhere.

## 7. What survives the sweep

The chart needs the stream, and the stream expires. So the record keeps one
number.

**One new optional field on `BrewRecord`:**

```ts
/**
 * Grams in the cup when the drawdown began, on the same clock as drawdownAt.
 * Absent on every row written before it existed, and on any brew that never
 * drew down.
 */
cupAtDrawdown?: number;
```

Optional and absent on old rows, which is the convention `pouringAt`, `plan`,
`stageWater`, `stalls`, `bypass` and `watched` already set six times over. Every
existing record goes on reading exactly as it reads today.

It stores a **raw observation, not a computed statistic**. This is deliberate
and is the reason a `peakCupRate` field was rejected: a peak is only defined
relative to a smoothing window, so the window would be frozen into the data, and
the day `FLOW_WINDOW_MS` is retuned every old row would silently stop being
comparable with every new one. `stalls` are stored for the opposite reason, and
the distinction is worth keeping straight: a stall is an observation whose
definition the record is deliberately pinning, because the definition is a
judgement about hardware. A rate is arithmetic.

Backups carry it with no `BACKUP_VERSION` move. It is another optional key on a
record that already merges by `id` and never overwrites.

**Where it is shown:**

- On the **record** and on the **finished brew**, `BrewFigures` draws DRAWDOWN
  as the first figure in the smaller second row. The average drawdown rate is a
  dashed badge on that figure, for example `0:38 ⌐1.7 G/S¬`. The displayed rate
  is deliberately rounded to one decimal place. The badge is dropped whenever
  `drawdownRate` is null, which is the same rule the drawdown figure itself
  already follows. Not on the live screen, whose drawdown figure (§5.1) is a
  clock only: a rate averaged over a drawdown still happening changes meaning
  as it is read.
- The same row carries DELAY when the pour end can be separated from drawdown:
  `pourEnd = seconds - drawdown`, then `delay = pourEnd - plannedSeconds`.
  Unknown drawdown means unknown delay, and a delay below the reporting floor is
  omitted rather than shown as zero. This replaces the old trace overrun badge,
  which counted normal drawdown as lateness because a recipe plan has no
  drawdown stage.
- The same row carries GRIND on a finished record when the post-brew dial was
  confirmed and the record positively says the grinder ran. If the recipe's
  snapshotted grind differs, it appears as the badge `RECIPE ${grindSize}`.
  When the record explicitly says the grinder was off, or the snapshotted
  recipe grind is the grinder-off sentinel, the row draws `GRIND` / `OFF` and
  no badge. A legacy row that only has a dial reading still draws nothing,
  because a missing grinder flag means "did not learn" rather than "learned it
  was off". The old prose line `MACHINE DIAL ...` is gone.
- The **history list row** gains one figure, `1.7 g/s`, beside the water and
  cup figures it already draws and before the stars. Silent when null, exactly
  as the pin and the rating already are. It joins the row's accessibility
  label, which `BrewHistoryRow` builds by hand because `Pressable` with an
  explicit label replaces the whole subtree for a screen reader.

## 8. The compare screen

`CompareTrace` is handed `maxT` and `maxV` by the screen rather than sizing
itself, because two lanes are not a comparison unless the same second is at the
same x and the same millilitre at the same y. A rate lane needs a third bound
negotiated the same way, `maxRate`, taken across both brews.

Two compact rate lanes sit under the two volume lanes. They use the same
retrospective smoothing as the record chart. If **either** brew has no stream,
the rate lanes are omitted for **both**: half a comparison invites reading a
present lane against an absent one, which is worse than showing neither.

## 9. Beanconqueror: nothing to do

Cut from scope after checking, not on judgement.

`library/brew/handoff/envelope.ts` already ships `HandoffFlow.weight`, the
entire cup weight series, delta coded, with `encode.ts` degrading it through a
downsampling ladder to a 1 Hz floor before it will drop it. Beanconqueror
derives and draws flow from that itself, at a fidelity no scalar could match.

The `metrics` array is not a home for it either: it carries what the recipe
*asked for*, and a measured drawdown rate is not a target.

So the flow rate is already exported, and has been since the handoff shipped.

## 10. Also rejected

- **A rate band on the live screen.** The honest answer to "show me the rate" is
  to draw it, but `bands.ts` allocates every leftover point to the trace, then
  the bars, then the gaps, against hard ceilings. Forty points for a second
  chart would come out of the trace, and two charts on a live screen compete.
- **A whole brew average**, `cupTotal / (endedAt - pouringAt)`. Free, needs no
  schema change, and works retroactively on every brew already on the phone,
  which is genuinely attractive. Rejected because it measures how fast the cup
  filled rather than how fast the bed drew down: a recipe with long pauses
  scores low for reasons that have nothing to do with the coffee. Two figures
  under one label, meaning different things depending on the record's age, is
  worse than one figure that is sometimes absent.
- **A library sort axis.** Drawdown rate is a property of a brew, not of a
  recipe.

## 11. Testing

`library/brew/__tests__/flowRate.test.ts` carries the weight:

- A synthetic stream of known constant slope with 0.5 g of injected noise: the
  fitted rate lands within tolerance, and a two point secant over the same
  stream does not. That second assertion is the one that stops somebody
  simplifying the fit away.
- A ramping stream: the fitted rate tracks the ramp, lagging by about half the
  window and no more.
- A stream with bypass samples tagged `pour > stages`: the cup channel has no
  spike at the bypass, and `drawdownRate` equals the figure from the same brew
  with the bypass removed.
- A record with `cupAtDrawdown` absent, with `drawdownAt` of 0, and with a
  swept stream: `drawdownRate` returns null in all three, never 0.

`BrewRecorder` tests pin that `cupAtDrawdown` is written at the same boundary
`drawdownAt` is taken from, and that a brew which never drew down writes
neither.

The live drawdown clock is pinned by a convergence test rather than by a
mockup: feed a stream through the live derivation sample by sample, finish the
brew, and assert the last live reading equals `drawdownSeconds(record)`. A
second test feeds a stream with a planned pause in a middle stage and asserts
the clock stays hidden through it. A third asserts the clock, once revealed,
reads the elapsed drawdown rather than zero.

Component tests assert on rendered text, test IDs and accessible labels only.
RNTL v14 has removed `UNSAFE_getAllByType` and `root.findAllByType`, so a test
cannot inspect a child's props. `renderWithProviders` is awaited.

Round trip: a record written with `cupAtDrawdown`, exported to a backup and
parsed back, keeps it; a backup written before the field existed parses to a
record that reports null rather than 0.

## 12. Open against hardware

The two second window and the least squares fit are arithmetic, and the
arithmetic is checkable here. What is not checkable here is whether a two second
window is the right *instrument* for a real bed: whether a genuine channelling
event is fast enough to be flattened by it. That wants a real brew, and it is
the same kind of open question `TARGET_TOLERANCE_ML` and `STAGE_SHORT_ML`
already carry in `stalls.ts` and `stageStory.ts`.

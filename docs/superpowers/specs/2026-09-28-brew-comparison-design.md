# Compare brews of the same recipe

Date: 2026-09-28
Issue: #103 (part of #95, the brew history roadmap)
Status: designed, not built

## The problem

Brew history records what happened. It does not let you hold two brews against
each other, which is where the learning is. Two brews of one recipe, overlaid,
so you can see where they diverged.

## What the machine makes interesting

The machine pours to plan. Two brews of one recipe will usually deliver the
same water on the same schedule, because that is the machine's job and it is
good at it. The difference lives in the **cup**: how fast the bed gave the
water up. So the cup channel leads this screen and the water channel becomes a
verdict.

That inverts the emphasis of the existing brew trace, where water is the
subject and cup is a secondary line. It is deliberate. On the live screen the
question is "is this brew going to plan"; here the question is "why was one of
these better", and the water channel usually has no answer to give.

When the water channels do agree, the screen says so as a positive statement
rather than drawing two identical lines and leaving the reader to check. That
statement is what licenses the rest of the screen: if both brews poured the
same, every difference below is the coffee, the grind or the bean.

## Constraints inherited from the issue

- **The real-seconds axis.** `library/brew/brewShape.ts` scales the plan by
  `pourSeconds` and `pauseSeconds`, and `BrewTrace` draws on that axis. It is
  the only axis on which two brews can be overlaid coherently.
- **Not `PourProfile`'s axis.** That one divides time evenly between pours
  because a card's mark is an identifying shape rather than a chart. Both are
  correct, both files say so, and they must not be reconciled.
- **Streams expire.** A brew without one still shows its figures but has no
  trace to draw. Comparison degrades rather than refusing, and says why.
- **`brews.plan` records what each brew actually ran.** Recipes are mutable, so
  two brews "of the same recipe" may not be comparable. Detect it and say so.
- **Stalls survive the overlay.** A brew that stalled is not simply a slower
  brew, and the amber that marks a stall elsewhere keeps its meaning here.
- **Accent identifies a recipe**, so two brews of one recipe share one. They are
  told apart by something other than hue.
- **Two, not n.** An n-way overlay is a different visual problem with no
  evidence behind it.

## The drawing grammar, and why grey

The existing chart already spends its vocabulary:

- **Hue** means recipe. The accent is the recipe's, and `cupLineFor` derives the
  cup hue from it.
- **Dotted** means cup. `BrewTrace`'s legend spells this out.
- **Grey dashed** means the plan.
- **Amber** means the machine stopped: a stall, or an overflow hold.

Nothing is left for "which brew". So line style keeps meaning channel, and the
pairing device is **colour versus grey**: the subject brew draws in the accent
and its cup complement, the reference brew draws the same two channels in
palette greys. Grey already means "not the live thing" on this chart, which is
the meaning wanted.

## Architecture

Three new units, one existing component extended.

### `library/brew/compare.ts` (new, pure TypeScript)

Takes two `StoredBrew` records with their sample streams and returns one value:

```ts
type PourVerdict = "same" | "stalled" | "differed" | "incomplete";
type PlanDrift   = "none" | "detail" | "shape";

type CompareRow = {label: string; a: string; b: string; shared: boolean};

type Comparison = {
    subject: StoredBrew;
    reference: StoredBrew;
    pour:   {verdict: PourVerdict; why: string};
    drift:  {grade: PlanDrift; fields: string[]};
    rows:   CompareRow[];
    cupGap: Point[];
};
```

**The pour verdict is measured on events and totals, not on curve divergence.**
A curve envelope is noisy (the scale carries a 0.5 ml noise floor) and a brew
that stalled and recovered can still finish inside one. Events are also cheaper
to explain to a user who disagrees with the verdict.

`same` requires all four of:

- neither record carries a stall (`stalls`, flattened, is empty),
- both outcomes pass `countsAsBrewed` from `library/brew/brewPopulation.ts`,
  the same gate the library's aggregates already use, so that a brew the rest
  of the app does not count as a cup is not counted as evidence here either,
- `|waterTotal difference| <= COMPARE_WATER_TOLERANCE_ML` (3 ml),
- `|duration difference| <= COMPARE_TIME_TOLERANCE_SECONDS` (5 s), where
  duration is `(endedAt - pouringAt) / 1000`, the figure the library's
  `TIMED_SQL` already averages.

Precedence when it is not `same`: a non-counted outcome gives `incomplete` and
names which brew, because "these differed" is a silly thing to say about a brew
that stopped. A stall in either gives `stalled` and names it. Otherwise
`differed`, and `why` names the term that exceeded its tolerance.

Both tolerances are named constants and both carry the disclaimer
`TARGET_TOLERANCE_ML` already sets in `library/brew/stalls.ts`: whether these
are the right numbers is a hardware question, not an arithmetic one, and wants
checking against real brews.

**Plan drift** compares the stored `PlanStage[]` of each brew and grades the
difference:

- `shape` when the stage count, a `volume`, a `flowRate` or a `pauseTime`
  differs. These are exactly the fields `planPoints` reads to build the
  staircase, so a shape difference is one that moves the drawn line.
- `detail` when only `temperature`, `pourPattern` or `agitation` differs. These
  change the coffee without moving the line.
- `none` otherwise.

The split is derived from which fields `planPoints` consumes, and a comment in
`compare.ts` says so, so that a new field on `PlanStage` forces the question
rather than defaulting to silence.

**The rows** are the side-by-side ledger: date, outcome, time, water, cup,
bypass, dose, ratio, grind, grinder RPM, rating, and the bean tags. Each row
carries `shared: true` when the two values are equal. Shared rows are kept, not
dropped: what stayed the same is evidence too, and a reader who cannot see that
the dose was identical cannot conclude anything from the grind that was not.

**The cup gap** is subject minus reference, interpolated onto a one second
grid, covering the span both streams reach. Both streams are already zeroed on
`pouringAt` (`livePoints` reads `sample.at` directly), so there is no alignment
problem to invent. The gap is empty when either stream is missing.

### `library/brew/traceStyle.ts` (new, pure TypeScript)

The channel vocabulary, extracted so that two components cannot disagree about
it: stroke width, dash pattern and colour resolver for water, cup, plan and
stall, plus the role modifier that turns a channel grey for the reference brew.

This is the same rule `constants/colors.ts` and `constants/motion.ts` already
enforce for colour and timing: a value that is not in the module cannot take
part when the thing is retuned. `BrewTrace` is refactored to read from it,
which is what actually binds the two components together. Geometry stays in
`brewShape.ts`; this module owns appearance only.

### `components/CompareTrace.tsx` (new)

Draws OVERLAY mode, and only that. Deliberately smaller than `BrewTrace`: no
bypass box, no temperature band, no stage tapping, no travelling head. A bypass
difference is a table row here, not a chart element. Less surface means less to
drift, and the reduction is documented rather than accidental.

- When the verdict is `same`, the water is drawn **once**, in the accent,
  labelled BOTH. The success state is the chart declining to draw a second line
  it would be lying about.
- Otherwise two water lines: subject in the accent, reference in grey.
- Cup is always two lines: subject in `cupLineFor(accent)`, reference in
  `palette.dim`. Both dotted, because dotted means cup.
- The two greys are not interchangeable. The reference cup takes the brighter
  `palette.dim` and the reference water the quieter `palette.muted`, because
  cup is the channel this screen is about. Both clear the 3:1 floor for a
  non-text graphic.
- Plan: one grey dashed line when the drift grade is not `shape`; two faint
  ones, one per brew, when it is.
- Stalls keep their amber bar on whichever line carries them.
- Paths are named `trace-water-subject`, `trace-water-reference`,
  `trace-cup-subject`, `trace-cup-reference`.
- One `accessibilityLabel` describing the comparison in words, the way
  `BrewTrace` already describes its thermal shape.

### `components/BrewTrace.tsx` (changed)

Three changes, all small:

- reads its stroke widths, dashes and colours from `traceStyle.ts`,
- uses the promoted `TraceLegend` rather than its local `LegendItem`,
- gains an optional `axis?: {maxT: number; maxV: number}` that overrides its
  self-sizing. Two SEPARATE lanes that do not share an axis are not a
  comparison. Absent, the existing behaviour is unchanged: the box is sized to
  the longer of the plan and the run.

### `app/brewCompare.tsx` (new route)

Layout only, taking `a` and `b` brew ids as params. Top to bottom:

1. `ScreenHeader` titled Compare, with the recipe name beneath it.
2. The verdict chip beside the OVERLAY / SEPARATE switch. Its four readings, in
   `constants/brewCopy.ts` with the rest of the brew vocabulary:
   POURED THE SAME (green), ONE STALLED (amber), THEY DIFFERED (amber),
   ONE DID NOT FINISH (amber). Green only for `same`: the chip is a claim about
   whether the water can be ruled out as the cause, and three of the four
   readings say it cannot.
3. The chart.
4. The differences table, shared values centred between the two columns.
5. Each brew's stars and note.

The mode switch is local state defaulting to OVERLAY. Not a setting: a
persisted key costs a `DEFAULTS` entry and a line in `settingsSnapshot()` for a
preference nobody has asked to keep.

**SEPARATE mode is two `BrewTrace compact` lanes** sharing one axis, with the
cup gap band drawn between them. It is not a second drawing of the same chart,
which is why that half of the feature inherits every future `BrewTrace` change
for free. `compact` is already a production mode; `BrewMiniBar` uses it.

**Subject and reference.** Colour means subject, grey means reference. Arriving
from a record, the brew you came from is the subject. Arriving from the history
selection, the newer one is. Tapping either legend entry swaps them, which is
cheaper than getting the default right for everyone.

### Two doors

**History selection.** A COMPARE button joins the existing
`SelectionActionRow` in `app/brewHistory.tsx`, live only when exactly two rows
are ticked and both carry the same `recipeUuid`. When it is not live, the
existing blocked-reason line explains why: "Select two brews of the same recipe
to compare them."

**The brew record.** A COMPARE WITH control on `app/brewRecord.tsx` opens
`components/CompareWithSheet.tsx`, an `XbrwSheet` listing that recipe's other
brews from `BrewDatabase.brewsFor(recipeUuid)`, newest first, each row showing
the date, the stars and the cup volume. Rows whose stream has expired are
marked, so the choice is informed. The control is hidden entirely when the
recipe has fewer than two brews.

## Degradation

**One stream expired.** The chart stays and draws the surviving brew alone. A
line beneath states that the other brew's trace expired under the retention
setting, and offers to pin the surviving brew so that it does not happen to
this one too. The table is unaffected: figures, verdicts and tags all survive
the sweep, so a figures comparison is still a comparison.

**Both expired.** No chart at all. The table alone, with the same explanation.

**Plan drift.** A `shape` grade raises a banner above the chart naming the
stages that differ, and the single plan line is replaced by one faint plan per
brew. A `detail` grade raises no banner: the differing fields appear as ordinary
rows in the table, which is where a difference that does not move the line
belongs.

## Guarding against drift between the two charts

`CompareTrace` and `BrewTrace` draw the same channels and must keep saying the
same thing about them. Five guards, in descending order of how much work they
do:

1. **SEPARATE mode is `BrewTrace`,** not a reimplementation. Half the feature
   cannot drift because it is the same component.
2. **`traceStyle.ts` owns the appearance** and both components read it.
3. **One `TraceLegend`,** promoted out of `BrewTrace`, so the two screens
   cannot name the channels differently.
4. **`CompareTrace` is deliberately smaller.** Fewer features, less surface.
5. **Paired comments.** Both files point at each other, the way the two time
   axes already do, inverted: these two must stay in step.

And a test that fails when they stop agreeing, below.

## Testing

`library/brew/__tests__/compare.test.ts`

- the verdict at, just inside and just outside each tolerance,
- precedence: `incomplete` over `stalled` over `differed`,
- drift grading, one case per field of `PlanStage`, asserting that shape fields
  grade `shape` and detail fields grade `detail`,
- shared versus differed rows, including a row that differs only in formatting,
- cup gap alignment across streams of different lengths and sample rates,
- an empty cup gap when either stream is missing.

`components/__tests__/traceGrammar.test.tsx` — the drift guard. Renders
`BrewTrace` and `CompareTrace` over the same single brew and asserts the drawn
SVG attributes agree: `stroke`, `strokeWidth` and `strokeDasharray` on the
water path and on the cup path. RNTL v14 cannot inspect a child component's
props, but these are host `Path` elements found by testID, so their attributes
are readable. The test holds `trace-water-subject` and `trace-cup-subject`
against `trace-water` and `trace-cup`. Retune the cup dash in one file and not
the other and this goes red, rather than the two screens quietly disagreeing
about what dotted means.

`components/__tests__/CompareTrace.test.tsx`

- one water path when the verdict is `same`, two when it is not,
- two plan paths on `shape` drift, one otherwise,
- the surviving brew drawn alone when the other stream is missing,
- a stall keeps its amber mark.

`app/__tests__/brewCompare.test.tsx`

- the verdict chip copy for each of the four verdicts,
- shared rows rendered once and centred, differed rows rendered twice,
- the mode switch moves between overlay and separate,
- both streams expired gives a table and no chart,
- the swap control exchanges subject and reference.

`app/__tests__/brewHistory.test.tsx` (extended)

- COMPARE is live on two ticked brews of one recipe,
- and not live on two of different recipes, on one, or on three.

Component tests render through `renderWithProviders` and await both `render`
and `fireEvent`, per this repo's RNTL v14 rules. Nothing here needs a device:
the arithmetic is pure and the drawing is asserted on rendered SVG attributes.

## What this does not do

- **No n-way overlay.** Two, per the issue.
- **No export button.** #105 owns share compositions, and a comparison card is
  a composition question, not a capability one.
- **No cross-recipe comparison.** The accents differ, the plans are unrelated,
  and the scope is one recipe.
- **No temperature band on the overlay.** Two bands on one chart is a second
  visual problem. Temperature differences appear as a `detail` drift row.
- **No new settings key**, no schema change, no migration. Everything the
  comparison needs is already stored.
- **No `expo.version` bump.** Nothing here affects native code.

## The part that can only be judged on hardware

The chart is the point of this feature and the chart cannot be validated in a
test. Whether the cup lines actually separate enough to read, whether 3 ml and
5 s are the right tolerances, and whether OVERLAY or SEPARATE is the mode people
reach for are all questions for real brews of one recipe on a real machine.
Build it, brew the same recipe twice with a different grind, and look.

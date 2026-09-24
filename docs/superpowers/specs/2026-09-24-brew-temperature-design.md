# Temperature on the brew graph

Design for showing each stage's water temperature on `BrewTrace`, live and in
history. Part of the brew history strand (#95).

## The problem

The brew chart draws water, cup and plan. It says nothing about heat, which is
one of the four things a recipe actually specifies and the one the drinker is
most likely to have deliberately chosen. A recipe that steps 94 / 92 / 90 and a
recipe that holds 93 throughout draw identically today.

The number is not missing from the app. `BrewStageRung` already prints
`${pour.temperature}°` in `palette.dim`, so a user who taps a stage can read it.
What is missing is the *shape*: the ability to see, without tapping anything,
that this recipe descends and that one is flat.

Two constraints shaped every decision below, and both are worth stating before
the design, because neither is obvious.

### Temperature is never measured

`BrewSample` is `{at, water, cup, pour}`. It has no temperature and cannot get
one: the BLE protocol only ever sends temperature *out*, as commands (4510
set-temp, 8102 bypass temp). Notification 8108 "Brewer Temp" carries no payload
and belongs to the FreeSolo path, not to recipe brewing. See
`docs/machine-integration/ble-protocol.md`.

So a stage temperature is a **setpoint**, piecewise constant, identical on every
brew of an unedited recipe. Three things follow.

1. A smooth curve is forbidden. It would imply both a measurement and an
   interpolation, neither of which exists.
2. "Spot the anomaly across brews" is not an available job. The value cannot
   vary between runs of the same recipe.
3. The mark belongs to the *plan*, not to the *run*, and should behave like the
   plan line does.

### There is no free hue

`constants/colors.ts` spends hue on meaning. The accent **is** the recipe, one
of twelve user-chosen values. Amber `warn` means the machine stopped, red
`danger` means it failed. `cupLineFor` derives the cup line as the accent's
complement with an `AMBER_GUARD`, precisely because no fixed colour is safe
across all twelve accents.

`info` (#7FB4FF) is the only uncommitted hue, and it collides with the Sky and
Ice accents, where the temperature mark and the water line would both be blue.

The design therefore uses **no hue at all**. Temperature is drawn in
`palette.dim` (#A3A3A3), the same grey the rung already prints the number in, so
the chart mark and the rung readout read as one fact rather than two. Grey is
neutral against all twelve accents, and it is honest: grey in this chart already
means "what the recipe asked for".

## The mark

For each stage, a horizontal rule at that stage's temperature, spanning that
stage's **pour only**, with a short gradient fading below it.

```
  94°              92°                        90°
 ────            ──────────              ────────────
 ▓▓▓▓            ▓▓▓▓▓▓▓▓▓▓              ▓▓▓▓▓▓▓▓▓▓▓▓
```

| Element | Value |
| --- | --- |
| Rule | `palette.dim`, stroke width 2, round caps, full opacity |
| Fade | Rect from the rule down 16px, vertical gradient `palette.dim` 0.38 to 0 |
| Label | The temperature and a degree sign, 11px, `palette.dim`, centred on the rule, baseline 4px above it |
| Depth | Behind the water fill, the water line, the cup line and the plan line |

### Why a rule and not a filled column

A column encodes temperature twice, as a height *and* as an area, and area is
the louder of the two while meaning nothing at all: a hot stage is not a bigger
stage. Dropping to a rule leaves only the measurement that exists. Nothing is
lost, because height, extent and printed value all survive.

The 16px fade is kept because a bare rule reads as a boundary, while a rule with
a little weight under it reads as a body of water at a temperature. It is short
enough never to reach the water fill, so the two never mix.

### Why the pour only, and not the whole stage

A stage is mostly waiting. In a typical stage, 12.5s of pouring sits inside 42.5s
of stage. A full-stage rule spends most of its width asserting a water
temperature at a moment when no water is moving.

Clipping to the pour removes a claim we cannot support and buys a second reading
free: the gaps **are** the waits, so the recipe's rhythm becomes visible without
drawing anything extra. Each rule then sits directly under the rising part of
the water line it caused.

`stageSpans` already returns `{start, pourEnd, end}`, so the extent is
`start → pourEnd` with no new arithmetic.

**Guard.** A small rinse pour on a long recipe is a sliver. The rule's drawn
width is `Math.max(width, 2)`, the same floor the bypass box already uses.

### The label may overhang

At 11px a three-character reading is about 24px wide, which is wider than a very
short pour's rule. The label is allowed to overhang its own rule. The space
beside it is a wait and is empty by construction, so there is nothing to collide
with. The degree sign is kept; it is not worth trading legibility for a third of
the width.

### A flat recipe repeats its label

When every stage is the same temperature, every stage still prints its own
number, at the same height. The repetition is honest, and three identical
labels on one line scan as "flat" instantly. No special case.

## The scale

An absolute axis over the full temperature range is useless. `cardLimits.ts`
allows 39–99 because of tea; across that range every coffee recipe is a flat
line, and a 94/92/90 spread lands under 3px apart. A fixed narrow band is also
wrong, since coffee occasionally goes as low as 60.

So the band adapts to the recipe:

1. Take the minimum and maximum temperature across the **brew stages**.
2. Pad by 2° on each side.
3. Round outwards to the nearest 5°.
4. Enforce a minimum span of 15°, growing the band symmetrically about its
   midpoint, so a flat recipe does not become a bar chart of noise.
5. Clamp inside 39–100, preserving the span by shifting rather than shrinking
   where the clamp bites.

The band occupies a fixed vertical region of the plot: its top edge at 5% of
the plot height and its floor at 45%, leaving the lower half to the water fill
and the 16px fades room to finish. The region is fixed even though the degrees
it spans are not, so the marks never wander into the busy part of the chart.

**Cost, accepted deliberately:** rule heights are no longer comparable between
two recipes with different bands. Only the printed numbers stay true across
recipes. This is why **both ends of the band are always printed** small at the
chart's right edge. A bar whose scale is unstated is a lie; a bar whose scale is
printed beside it is a reading.

The band is computed from brew stages only, and is **never widened for the
bypass**. See below for why.

## The bypass

`BypassView` already carries `temperature`. The bypass is genuinely different
water at a different heat, and it deserves the same treatment as a stage, with
one exception forced by the scale.

- **Inside the band:** the bypass gets the full mark, rule and fade and label,
  spanning its own x extent, directly beneath the dashed box it already owns.
  The box sits on the volume axis and the rule sits on the temperature band, so
  they share an x extent and never overlap.
- **Outside the band:** the bypass loses its rule and prints its number inside
  its box instead.

The fallback exists because bypass water is usually much cooler than brew water.
Admitting a 55° bypass into the band would stretch it to roughly 53–100, at
which point the three brew rules sit about 5px apart with their labels on top of
one another. One cool bypass would destroy the reading for the part of the chart
that matters most. A rule whose entire meaning is its height cannot be drawn off
the scale, so when it does not fit, it does not get drawn.

In practice most recipes bypass near the brew temperature and get the full
four-mark version.

## Known overlap

Water is monotonically increasing, so the water line always ends at the top
right, and in the last third of a brew it climbs through the band. A late label
can therefore have a line drawn across it.

This is accepted rather than solved. The marks are behind every line, the water
line is 2.5px, and the alternative is either moving labels at render time, which
makes the chart's layout depend on the run, or reserving space the chart does
not have. If it reads badly on a device, the fix is to nudge the affected label
to the other side of its rule, not to move the band.

## Behaviour

### Live

**Every rule is drawn from t=0**, including stages that have not started. Every
stage temperature is known the moment the recipe is sent.

This matches the plan line, which is already drawn in full from the start and
which nobody reads as having happened. The chart has therefore already
established that a grey mark ahead of the water means intent. Temperature is
part of the same plan and behaves the same way.

There is **no animation and no reveal**. The marks are static for the whole
brew. This is consistent with `useTraceAnimation`, which deliberately does not
run during `pouring`.

### Compact

`compact` renders nothing new. It is only used by `BrewMiniBar`, a thumbnail
beside a title, where an 11px label cannot live and the mark would be noise.
Compact stays three lines.

### History

Identical to live, drawn from the stored plan.

## Data

**No schema change and no new props.** Everything needed already exists.

- `PlanStage.temperature` is snapshotted by `planFromPours` at brew start, so
  every record written since `plan` existed already carries it.
- `BypassView.temperature` is already on the prop `BrewTrace` receives.

The temperature source inside `BrewTrace` is `stages ?? pours`, the same
fallback `stageBounds` already uses. This matters: `BrewSummary` passes
`pours={[]}` and supplies `stages` separately, so reading `pours` alone would
silently draw nothing in history, which is the main place this feature is for.

**Degradation.** A record written before `plan` existed has no stages, so it
draws no rules and no band labels. The chart is otherwise unchanged. This is the
same silent fallback `stageWater`, `stalls` and `bypass` already use.

## Accessibility

The chart's `accessibilityLabel` gains the temperature run, so a screen reader
gets the shape it cannot see: "Brew trace, 94, 92 and 90 degrees". The band
labels are decorative and are not announced separately.

## Out of scope

- Any measured temperature. There is no sensor on this path.
- Temperature on `PourProfile`. That axis divides time evenly between pours and
  is an identifying silhouette, not a chart. It stays as it is.
- A setting to hide the marks. They are quiet enough not to need one, and every
  toggle is a branch to test forever.
- Comparing bands across recipes, or any cross-recipe temperature view. That is
  a brew history question, not a chart question.

## Testing

`BrewTrace` tests assert on what the renderer produced, since RNTL v14 cannot
inspect a child's props. Each of these needs a `testID`.

1. A descending recipe draws three rules at three distinct y values, in
   descending order.
2. A flat recipe draws three rules at one y value, and three labels.
3. Rule extents match `stageSpans().pourEnd`, not `.end`. A recipe with a long
   pause must produce rules that stop short of their stage boundary.
4. A 5ml pour still produces a rule at least 2px wide.
5. The band honours the 15° minimum span for a flat recipe, and both band
   labels are rendered.
6. A bypass inside the band draws a fourth rule; a bypass below the band draws
   no fourth rule and prints its number.
7. `compact` draws no temperature marks.
8. A record with no `stages` and empty `pours` draws no marks and does not
   throw.
9. Temperature is read from `stages` when `pours` is empty.

Every test must be mutation-checked: revert the behaviour and confirm the test
fails.

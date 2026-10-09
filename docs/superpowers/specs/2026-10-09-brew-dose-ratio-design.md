# Dose and ratio on the brew and Story Card

Approved design for the remaining improvement in #199. The four reported bugs
were addressed in #203 and are outside this work.

## Goal and scope

Show what the recipe asked for without making fixed inputs look like measured
results. Dose and ratio appear on:

- The live brew screen, including its pre-pour and failure states.
- The just-finished brew summary.
- The history record screen and its in-place image export.
- The Story Card, subject to its own remembered content toggle.

No changes to brewing commands, recipe validation, card encoding, recording,
database schema, backup version, or machine connection behaviour.
The history list, comparison screen and mini brew bar are outside scope.

## Presentation

Use the compact recipe line selected during brainstorming:

```text
COLOMBIA WASHED
DOSE 15 G   RATIO 1:16
[brew chart]
```

On the live screen, the existing navigation row contains the recipe name.
Place the line directly below that row, before the chart region. On finished
and history summaries, place it below the summary's recipe name and before
the trace. The Story Card inherits that placement through `BrewSummary`.

Labels are `palette.dim`; values are `palette.text`. Use the existing Doto
typography, initially 12 pt bold with 1.2 pt tracking, and an 8 pt gap between
the line and the chart. Keep the existing name-to-content spacing before
the line. These sizes scale through the existing Story Card `textScale`;
OS font scaling remains a separate input. Do not change the large WATER,
CUP and TIME readouts or introduce a new accent or colour.

The units and formatting are explicit: `DOSE 15 G` and `RATIO 1:16`.
Use the recorded numeric value without rounding it to an invented whole dose.
Recipe ratios remain whole numbers under the existing domain rules.

Treat each label/value pair as a unit. At narrow widths or larger text sizes,
wrap between the dose and ratio units rather than truncate either value.
Comparison badges can move beneath their corresponding value. Layout
arithmetic must account for both wrapping and badge height.

Expose a descriptive accessibility label for each unit, for example
"Recipe dose, 15 grams" and "Recipe ratio, 1 to 16". Include the saved-recipe
comparison when present. Missing values must not leave an empty focus target.
No interaction is attached to the line.

## What the numbers mean

These are the recipe inputs for this run, not observations of the grinder,
grounds, water or cup.

During a live run, source `dosage` and `ratio` from the active provider's
`run.recipe`. Before the provider publishes the first snapshot, the same
local recipe already used by the brew screen may supply the initial line.
Once a run exists, its recipe takes precedence, including when the user
reopens the screen from the mini bar.

For a just-finished brew, use `run.record.dose` and `run.record.ratio` when
the record exists. Before publication of the finished record, retain the
active run's recipe values, so the transition does not briefly erase the
line. Do not fill an absent field in an existing record from a saved recipe.

History and Story Cards use only `record.dose` and `record.ratio`. The
recorder already snapshots these fields. Editing or deleting the saved recipe
cannot change them. Never reconstruct a missing ratio from delivered water,
planned stages, cup weight or today's recipe.

Either value may appear alone. If neither is available, omit the whole line
and its spacing. Older records can legitimately lack these fields; absence
is not an error and must not become zero, a placeholder or a guessed value.
Only finite, positive values are displayable; this presentation guard does
not replace the existing recipe or backup validators.

Early endings and bypass water do not change the printed ratio. Tea uses
its recipe or recorded dose and ratio by the same rule. Do not add a coffee-only
gate or present tea's recipe ratio as a user-adjustable knob.

## Quick edits

The line shows the values the one-brew recipe actually requests.
For changed dose or ratio, carry the existing saved-recipe comparison badge:

```text
DOSE 16 G             RATIO 1:17
[RECIPE 15]           [RECIPE 1:16]
```

Preserve the existing dashed badge styling and its meaning. Prefer beside
the corresponding value when there is room; otherwise put it underneath.
Do not repeat dose or ratio in `BrewFigures`' adjustment grid. Temperature
and grind adjustments remain in that grid, unchanged.

For finished and history records, comparisons come from `adjustedFromDose`
and `adjustedFromRatio`. Live comparisons come from the active owner's
`QuickEditRecordAdjustments`, not a route-only reading: reopening a brew
must retain the same comparisons.

`RunOwner` already retains this metadata but `LiveBrewSnapshot` does not expose
it. Add the optional read-only metadata to that snapshot. Do not add another
run owner, recorder or database lookup. Missing comparison metadata never
suppresses the current values or prevents a brew.

## Story Card toggle and fitting

Add the content key `recipe` for the recipe line, with the visible label
`DOSE & RATIO`. Offer it when at least one input is displayable.

It starts on and remembers the user's choice through the existing
`storyCardHidden` setting. Extend the content-key vocabulary and its
serialization; do not add a separate settings key. Existing hidden lists
have no new key, so the line is enabled without a migration.

The toggle controls the whole line, including dose/ratio comparison badges.
It is independent of `DETAILS`, which continues to control grind, drawdown,
delay and the remaining temperature/grind adjustments. Turning DETAILS off
must not erase dose or ratio.

Include actual formatted values, badge widths, wrapping, font scale, line
height and spacing in the Story Card's horizontal and vertical budget.
Use the same pure geometry for the component and the budget so they cannot
disagree about the number of rows drawn.

Preserve the existing fitting sequence: full charts, reduced charts, stage
ladder omission, then declining tags, rating, coffee, note, details and flow.
Append recipe-line omission after those existing optional-content declines.
This makes the compact inputs the last optional content removed, without
changing the relative priorities of existing content.

If the line is declined for space, mark its toggle unavailable using the
existing `declinedContent` mechanism. Do not persist a layout refusal as
a user preference. Wider layouts can restore it. Never clip text, overlap
other content or cross the Story Card's safe bands to keep the line.

## Implementation boundaries

Introduce one module-scope presentational component,
`BrewRecipeContext`, accepting the current inputs, optional saved-recipe
comparisons, available width and Story Card text scale.

Keep geometry pure and reuse the existing Doto metrics and badge geometry.
Extend the existing figure-geometry module with the small recipe-line layout
calculation rather than duplicating width estimation inside `storyCard.ts`.
The component and Story Card budget consume that calculation.

Wire the component directly into `app/brew.tsx` for live states and through
`BrewSummary` for finished/history/export states. The record screen's existing
shared summary description supplies the snapshots and comparison metadata
once to its screen and Story Card renderings.

Move dose/ratio comparison presentation out of the adjustment grid. Update
the grid's measures and the record screen's DETAILS availability/row counts
to consider only its remaining content. A record with only dose/ratio
adjustments must not offer a now-empty DETAILS toggle.

Keep measurement through existing layout-event patterns. The live chart
region takes the remaining height, so the recipe line must not introduce
a phase-dependent resize while the brew runs. Do not add a timer or effect
to reset layout state.

## Verification requirements

Use the repository's existing dual-platform component and screen tests.
Cover the observable line and its accessibility labels, not child props.

- Normal, dose-only, ratio-only and absent snapshots.
- Positive-value guards, decimal dose formatting and whole ratio formatting.
- Quick edits, saved-value comparisons and removal of duplicate figures.
- Active provider precedence and reopening an adjusted live brew.
- Finished record precedence and the brief pre-publication transition.
- History values surviving saved-recipe edits and deletion.
- Early-ended brews, bypass and tea preserving recipe ratio semantics.
- Independent DOSE & RATIO and DETAILS toggles, default-on behaviour,
  remembered choice and old hidden-list compatibility.
- No empty DETAILS toggle after moving dose/ratio comparisons.
- Missing fields omitting their space rather than reserving a blank row.

Extend the pure Story Card budget sweep over the existing widths, font scales
and stage counts. Include the line on/off, one or two values, maximum supported
display widths, comparison badges and every relevant content combination.
Update the independent drawn-height calculation, not only the budget function's
own assertions. Verify horizontal fit, non-negative vertical margin, safe
bands and the new decline priority.

Visual review should include a narrow phone, larger OS text, adjusted values
and a dense seventeen-stage Story Card, as well as the common three-stage brew.
No physical NFC or BLE verification is required by this presentation-only
change because the card format and machine commands are unchanged.

## Alternatives considered

A dedicated input row beside the measured readouts makes the values prominent
but spends more height and gives static recipe inputs nearly the same weight
as live results. Expanding the figure grid reuses its styling, but mixes inputs
and outputs and adds wrapping complexity. The compact line keeps recipe context
near its name while preserving the existing hierarchy.

# Grind-size guidance

Design for #52, the whole of milestone M1 · Sharper cards. Agreed 2026-08-31.

## The problem

The editor asks for a grind size between 40 and 80 and says nothing about what
those numbers mean. A number without a unit is not a choice, it is a guess.

There is a second, quieter problem behind it. The xBloom cloud stores grind on a
**1–80** scale, our importer passes that value straight through, and a card can
only carry **40–80**. So importing a recipe ground for espresso today produces
one that saves happily into the library and then fails card validation with
"The grind size is 25. The range is 40-80." — accurate, unexplained, and
discovered at the card reader rather than at import.

## What the numbers mean

From the official xBloom app:

| Range | Method | On a card |
|---|---|---|
| 1–15 | Espresso | no |
| 16–30 | Aeropress | no |
| 31–55 | Pourover / coffee maker | from 40 |
| 56–80 | French press, cold brew | yes |

**Our 40–80 range is correct and complete**, confirmed on hardware (#68). The
1–80 scale belongs to the grinder itself, including standalone grinding into
another vessel; a card stores grind as `value − 40`. The bands a card cannot
reach are exactly the ones you would grind for and then brew somewhere else.

**81 is not a coarseness.** It is the grinder-off sentinel (`GRIND_SIZE_OFFSET`
40 plus the `GRINDER_OFF` byte 41). Nothing may ever render it as coarser than
cold brew.

## Design

### Where the knowledge lives

A new `library/grindBands.ts` — plain TypeScript, no React, tested. It owns the
band table and a single lookup returning a band's name and whether it is
reachable on a card.

It knows the full 1–80 scale. Not because we offer sub-40 as a choice, but
because an imported recipe can *hold* one and we need to be able to name what it
is. It also knows 81 is the off sentinel and reports it as such rather than as a
band.

Every consumer below reads from this one module. The four-way grind encoding
mess documented in `docs/machine-integration/roadmap.md` is a standing argument
against letting this knowledge spread to call sites.

### In the editor: annotate the label

The band is appended to the row's own label: `GRIND SIZE · POUROVER`, flipping
to the coarse band at 56 as you step. No new line, no added height, and it
leaves `Stepper` alone — that component's layout is tuned around a 54px value
column, two 32px buttons and hold-to-repeat, and is not somewhere to add text
casually.

Three rejected placements, recorded so they are not re-proposed:

- **A new always-on line under the label.** `FieldRow`'s hints are opt-in by
  deliberate design — nine of them turned the deck into prose once already.
  Adding an ungated line for one field bends that rule.
- **Inside the hint.** Respects the rule, but hints are off by default, so the
  guidance would be invisible to most users and #52 would land almost entirely
  in the help sheet — which is not "at the point of choosing it".
- **Beside the value, in the stepper's unit slot.** There is no such slot.
  `Stepper` takes a `unit` prop but uses it only in the accessibility label
  (`components/Stepper.tsx:182`); units are spoken, never drawn. Building one is
  #77, and it is not this issue's job.

The label placement is neither a hint nor a restatement: it names what the
current value *means*, and it moves as the value moves.

The coarse band's name must fit on a label line beside the field name, so it is
shortened for this placement. The full wording lives in the help sheet.

### In the editor: when the grind is out of card range

An inline banner directly mirroring the existing stage-mismatch one — `danger`
left border, the reading in dot-matrix, a sentence, and an action:

> **GRIND 25** — Ground for espresso. A card cannot store a grind below 40.
> `SET TO 40`

`cardWriteProblems` already refuses the write. What was missing is the offer to
fix it, which the pour-volume mismatch has had all along as `AUTO FIX`.

The banner shows only when the grind is outside 40–80 and the grinder is on. It
is not shown for 81, which is the off sentinel and a valid state.

### At import

A notice line in `ImportResult`, in the same `info` treatment as "Already in
your library", naming the band and framing it as a card constraint:

> Ground for espresso. You will need to coarsen this to write it to a card.

The recipe itself is imported **faithfully and unchanged**. Clamping it to 40
was considered and rejected: an espresso grind raised to 40 is not a corrected
recipe, it is a different drink, and presenting it as fixed would be a small
lie. Refusing the import outright was also rejected — it stops someone even
looking at a recipe they were sent.

### In the help sheet

`grindSize` gains its first `question` and `detail`: the bands, and the thing
that would otherwise confuse people permanently — that the 1–80 scale they may
have seen in the xBloom app is the *grinder's* range, while a recipe card
carries 40–80, and that this is a real constraint rather than caution on our
part.

### Validation copy

`cardLimits` keeps its existing message shape but explains itself when the grind
is below the minimum, so the reason is legible wherever it surfaces rather than
only in the editor banner.

## Testing

- `library/__tests__` — band boundaries at 15/16, 30/31, 39/40, 55/56, 80, and
  the 81 sentinel. Pure functions, so this is where the real coverage is.
- `components/__tests__` — the label annotation, the out-of-range banner and its
  action, and the import notice. Via `renderWithProviders`; `render` and
  `fireEvent` are async in v14 and a missing `await` passes for the wrong
  reason.

## Out of scope

- Widening the card range below 40. It is correct; the encoder would emit a
  negative byte.
- Anything about the grinder-off path beyond not mis-rendering 81. The existing
  `grinder` help entry already documents that workaround.
- A visual band strip. Considered; it would be the only chart-like element in an
  editor built from rows, and two bands do not earn it.
- Drawing units on steppers. A real gap, found while designing this, but its own
  problem: #77.

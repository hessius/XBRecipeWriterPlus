# M4 — Watch it brew

**Date:** 2026-09-03
**Milestone:** M4 · Watch it brew
**Issues:** #63 (live brew telemetry), #71 (iOS Live Activity)
**Depends on:** M3 (#60, #61). **Feeds:** M5 (#55 post-brew notes and rating).

---

## 1. What this ships

M3 made the app able to brew. It reports lifecycle stages as prose on a plain
route and then tells you it is done. Everything the machine actually says while
it works — the water it has dispensed and the weight in the cup, both arriving
about ten times a second — is decoded and discarded.

M4 spends it. It ships:

- **A brew you can watch.** A sheet showing the recipe's own drawing being
  traced in real time, the three figures that matter, and a stage-by-stage
  breakdown of the plan with the machine's position in it.
- **A brew that survives dismissal.** A persistent mini-bar over the library,
  and the same drawing as an iOS Live Activity (#71) — the Activity's reach
  while the app is suspended is the one thing §11 leaves open.
- **A machine that is present in the app**, not only inside Settings: a status
  dot in the home header with a popover, and a BREW action on every recipe row.
- **A record of every brew**, with the full sample stream, browsable per recipe
  and library-wide, exportable as an image or as data.
- **One component family** shared by the brew breakdown and the recipe editor,
  so the two read as the same system rather than two designs with a shared
  form language.

### Not in this milestone

- **Easy Mode slots (#62)** and **machine settings beyond what the popover
  shows (#64).** Unchanged from M3's reasoning.
- **Background BLE.** No `bluetooth-central` background mode. The Live Activity
  updates while the app is foregrounded or recently backgrounded; it does not
  keep a radio session alive. See §11.
- **Post-brew notes and rating (#55).** M4 stores the record and shows it. What
  a human thinks of the cup is M5's problem, and the schema in §9.3 leaves room
  for it rather than trying to answer it now.

---

## 2. The decisions that shape everything else

### 2.1 The recipe's drawing already is the water curve

`buildProfilePath` in `components/PourProfile.tsx` builds a cumulative-volume
staircase: each pour adds its volume and the line steps up. That is exactly the
shape of "water dispensed over the course of the brew". The mark on a recipe
card, the profile in the editor, and the live chart of a running brew are all
the same drawing.

So the brew does not introduce a new visualisation. It takes the drawing the
user already knows, dims it to a dashed **plan**, and has the machine trace over
it in the recipe's accent, with the cup's weight trailing beneath as a dotted
line. Everything else in this spec follows from that.

**One deliberate divergence.** `buildProfilePath` divides time evenly per pour,
which is documented and correct there — the shape is an identifying mark, not a
chart. The brew trace needs a **real-seconds axis**, because the stage ladder
beneath it draws pause bars to real duration and the two must agree about where
"now" is. The consequence is that the live line drifts off the dashed plan when
the machine runs long. That is not an error to hide; it is the most useful thing
on the screen.

### 2.2 The plan comes alive, so nothing ever transitions

Every phase before the first drop — waking, sending, ready, grinding — is drawn
as behaviour **on the plan**, which is present from the moment the sheet opens.
Nothing is added, removed, or swapped, so there is no transition anywhere in the
brew, and a failure can always show *where it got to*.

### 2.3 The brew breakdown and the editor are one family

The editor already has this architecture: a profile with a target line and a
highlighted band for the selected stage, and a tile with an accent zero-padded
index, dot-matrix facts, and expansion in place. The brew adopts all of it. In
exchange the editor gains the brew's **timing bar and glyphs** — a collapsed
editor stage today shows three numbers and cannot convey rhythm at all.

The only difference between the two: where the brew rung shows progress, the
editor tile shows a caret.

### 2.4 The popover holds at most one action

The machine's status popover shows facts. Its button slot holds exactly one
thing — the action that matters right now — and when the link is healthy it
holds nothing. Row-level actions live on their rows.

---

## 3. The connection is app-wide state

M3 connects lazily, when the user presses BREW. M4 makes the link **warm**:

- Connect on launch if a machine is remembered (`machineDeviceId` is set).
- Hold the connection for the app's lifetime.
- Reconnect on foreground.

This is what makes a status dot honest. It costs a beep at launch, which is the
same beep M3 already spends at the first brew, moved earlier and spent once.

**The dot appears only when a machine is remembered.** A user who does not own a
J15 sees no dot, no popover and no BREW capsule — the same rule the editor
already follows in offering BREW only to owners. Pairing therefore stays in
Settings; the popover is never an onboarding surface.

---

## 4. The home screen

### 4.1 The title

The home header shows the `XBRW++` wordmark where `Recipes` was, with the
library's count as a Doto superscript beside it. The `++` arrives in brand and
gives the colour up after ten seconds, once per session, timed from launch.

*(Built ahead of the rest of M4 on branch `home-wordmark`, and folded into this
milestone rather than shipped alone. Recorded here because it is part of this
milestone's shape.)*

### 4.2 The status dot and its popover

A 9 px dot sits left of the settings gear. Three states: connected (accent, with
a soft ring), connecting (half-lit, breathing), not in range (grey). Tapping it
opens a popover.

| State | Facts shown | Action |
|---|---|---|
| Connected | Water · Mode · Grind size | none |
| Connected, tank low | as above, water in warn, plus a strip: "FILL THE TANK, THEN REFRESH" | none |
| Connecting | — | none |
| Not in range | last seen, and that it will reconnect by itself | **TRY NOW** |

`EASY` is drawn in warn, because it will refuse a brew and this is where a user
finds that out before pressing BREW.

**The water row carries its own age and its own control.** The value is followed
by a timestamp ("4 MIN AGO") and a small refresh glyph, tinted accent normally
and warn when the answer is Low. It acts on one row, so it lives on that row.

There is **no MACHINE SETTINGS button**: the gear is 20 px away in the same
header and leads to the same place. Auto-start, forget and the full vitals list
stay in Settings → Machine, one tap further than the popover — which is right,
since they are set once and the popover holds only what changes.

**Why the water level needs asking for.** `waterEnough` arrives only inside an
info blob, and asking for one opens a session, which beeps. Presence is free;
water level is not. This is also why the BREW capsule is **not** marked when the
tank is low: a stale flag would discourage a brew that would work.

### 4.3 The BREW capsule

Each recipe row grows a thin ink capsule on its right edge: ~21 px wide, inset
~5 px from the card's edges so it reads as part of the card, filled with the
card's ink colour, with `BREW` set upright — one letter per line — in the card's
accent. `hitSlop` gives it a full touch target without making it wider.

It collides with the swipe-to-delete tiles on the same edge. Judged acceptable;
worth confirming in the hand.

Controlled by a Settings switch (§8), and shown only when a machine is
remembered.

### 4.4 The mini-bar

When the brew sheet is dismissed the brew keeps running, and a bar pins to the
bottom of the library: **the trace in miniature**, then the recipe's name with
one line of Doto status beneath it, then a chevron. Tapping it reopens the
sheet.

It is the sheet's own drawing at 86×34 — the same plan, live line and trailing
cup — so there is nothing new to learn, and it is the only arrangement in which
an unplanned hold is visible rather than inferred.

| Bar state | Line | Words |
|---|---|---|
| Grinding | plan only, buzzing (§6) | `Grinding` / `ETHIOPIA GUJI · 18 G` |
| Pouring | traced to now | `Ethiopia Guji` / `POUR 3 OF 5 · 1:42` |
| Holding | flat amber run | `Waiting for the cup` / `+11 S · CARRIES ON BY ITSELF` |
| Done | full trace in success | `Ready` / `254 G · 3:48 · TAP TO SEE IT` |
| Stopped | frozen in danger, with a tick where it stopped | `Stopped — no water` / `KEPT IN YOUR BREW HISTORY` |

The done and stopped states persist until dismissed. The finished trace is the
record, and the bar is the way into it.

**This is also the Live Activity.** On a lock screen the bar is the whole brew,
which is why it had to be the drawing rather than an arrangement of figures: at
46 px of height a familiar graph says more than any three numbers, while the
name, pour count and time sit around it.

---

## 5. The brew sheet

A sheet over the library, dismissible, with the mini-bar behind it. Three
regions, top to bottom:

### 5.1 The trace (pinned)

The plan as a dashed staircase; the machine's water as a solid line in the
recipe's accent; the cup's weight as a dotted line trailing beneath. A stage
counter (`3/5`) sits top right.

### 5.2 The figures (pinned)

Three Doto values: **WATER**, **CUP**, **TIME**. Same typographic scale as the
rest of the app's machine readouts.

### 5.3 The stage ladder (scrolls)

One rung per pour, auto-scrolled to keep the live stage in view. Explicitly not
compacted at nine stages — the xBloom's maximum — because scrolling costs less
than legibility.

**The rung**, one line, fixed left column:

```
06   ◎   94°   ▓▓▓▓▓▓▓▒▒▒▒        45 ml
     │    │     │                  └ volume
     │    │     └ timing lane
     │    └ temperature
     └ pour pattern
```

- The **timing lane** is scaled so the longest stage (pour plus its pause) fills
  it. Pauses are hatched bars on the same lane, drawn to real seconds.
- The **agitation mark** sits on the bar's *leading* edge for agitation before
  and the *trailing* edge for after — placed where the event happens in time, so
  it needs no label.

Six facts on one line, and the shape of the recipe legible without reading any
of them.

**The active rung expands in place**, directly beneath itself and never at the
bottom of the list, into a card carrying each glyph beside its word — a legend
built into the thing it explains — then folds away as the stage ends.

### 5.4 The glyphs

| Mark | Drawing |
|---|---|
| Centred | A target: outer ring r≈3.4, inner ring r≈1.9, filled bullseye r≈0.85, in a 9-unit box |
| Circular | A plain ring, r≈2.9, stroke 1 |
| Spiral | A true Archimedean curve, `r = 0.285θ` over two turns (θ: 0→4π), sampled at 120 points |
| Agitation | Five vertical tremor strokes of unequal height — a shake meter |

Pattern marks are **smooth SVG, not dot matrix**: a spiral in a 9×9 grid
strains, and smooth stays crisp at 12 px, which is the size that matters. Dot
bitmaps remain the vocabulary for action icons.

The word is **agitation** throughout, never "shake", even though a shake of the
basket is what it is.

### 5.5 Overflow protection

The machine halts the water when the cup falls behind, injecting a pause the
recipe never asked for. Two responses, together:

- **The bars re-scale.** As the brew stretches, the lane quietly re-scales, an
  amber hatched wedge grows as the unplanned wait, and the live fill turns
  amber.
- **The open card explains.** "HOLDING — THE CUP IS BEHIND / The machine has
  stopped the water until the bed drains. It will carry on by itself."

**The trace keeps the record for free.** The live line runs level where the
machine held, then rejoins, finishing right of the plan by exactly the time
lost, with the gap labelled (`+14 S`). No extra storage, and the finished chart
is a truthful account of what happened rather than a tidied one.

---

## 6. Statuses and failures

All of it drawn on the plan (§2.2). Animations respect both the system
Reduced Motion preference (already honoured via `constants/motion.ts`) and the
app's own switch (§8); when motion is off, each animation holds its end state.

| Phase | The line does |
|---|---|
| `waking` | A 3.4 s opacity breath of the whole dashed plan, warming toward the accent at each peak |
| `sending` | A short lit segment travelling the length of the curve |
| `readyToStart` | The dashes fuse into a solid dim line — it is in the machine now |
| `grinding` | Opacity untouched; the stroke flicks between dark and accent at ~0.42 s. Intense rather than pretty, which is what grinding is |
| `pouring` | The trace, as designed |

`pressPlay` is a **notice, not a button** — it currently looks pressable and is
not. It is only reached when the machine parks in `awaiting_confirm`; the normal
path is START in the app.

### 6.1 Water is two different events

M3 conflates them. They are not the same, and one of them happens almost daily.

**`blocked` — refused before anything was sent.** `waterEnough` is false, so no
frame goes out. Drawn **amber** with the plan untouched behind it:

> **NOT ENOUGH WATER FOR THIS BREW**
> The tank will not cover this recipe's 250 ml. Fill it and try again — nothing
> has been sent to the machine.

The volume is the recipe's own total, not a constant. That last clause is the
point: it tells the user their dose is safe. Offers TRY AGAIN. **Writes no
history record**, because nothing happened.

**`noWater` (event 40522) — the machine stopped mid-brew.** Rare. Drawn **red**,
the trace frozen where it stopped, and deliberately **no TRY AGAIN**: the dose
is spent and offering a retry would be a lie about what one press costs. Still
written to history — a half brew is a fact worth keeping.

Other failures (`noBeans`, `gearPosition`, `doseMismatch`, `idling`,
`rejected`) keep M3's copy and adopt the frozen-trace treatment.
`lostContact` stops the live line at the limit of our knowledge, which is
exactly what it means.

---

## 7. Brew history

### 7.1 What is stored

A **summary** plus the **full sample stream** — roughly 10 Hz for the length of
the brew. A four-minute brew is about 2 400 samples, 30–60 KB as JSON.

The stream is what makes the record worth keeping: it is the difference between
"that one tasted better" and knowing why.

### 7.2 Where it is reached

- **Per recipe**, from the recipe's overflow sheet.
- **From a brew.** The finished mini-bar opens the brew just made; that screen's
  header offers `All brews`. History is reached from a brew, which is when a
  person is thinking about brews.
- **Settings → Library**, a `Brew history` row, as the backstop for wanting last
  Tuesday's brew with nothing on screen to get there from.

### 7.3 Export

Both, because they answer different questions:

- **An image.** The finished trace rendered as a PNG and handed to the share
  sheet — for showing someone.
- **The data.** The summary and the stream as JSON — for dialling in.

Needs `expo-sharing` and `react-native-view-shot`, neither of which is currently
a dependency. Install with `npx expo install`. The data export needs neither.

---

## 8. Settings

Four controls, all in the existing Machine and Recipe list sections rather than
a new one:

| Control | Default | Why it exists |
|---|---|---|
| Show BREW on recipe rows | on | The capsule is a permanent mark on every card; someone will want it gone |
| Animate the brew chart | on | Layers on top of the system Reduced Motion preference. Not everyone enjoys a breathing graph |
| Keep raw brew data | last 50 brews | Retention, stated rather than silent. A picker, not a switch. Old streams are swept; the records they belong to survive |
| *(existing)* Start brewing automatically | off | Unchanged |

The machine console keeps its seven-tap secret entry, but is no longer the only
route to anything.

---

## 9. Architecture

The `library/` (no React) → `hooks/` → `app/` split holds throughout.

### 9.1 New in `library/`

| File | Responsibility |
|---|---|
| `brew/BrewRecord.ts` | The record and sample types; derives a summary from a stream. Pure. |
| `brew/BrewRecorder.ts` | Subscribes to `Machine.onNotification` and `onPhase`, accumulates samples, emits a record on any terminal phase. Injectable clock, so the whole path is testable without a radio. |
| `brew/brewShape.ts` | The plan path on a **real-seconds** axis, and the live path from a sample stream. |
| `BrewDatabase.ts` | expo-sqlite, beside `RecipeDatabase.ts`, same synchronous style. |

`Machine.ts` is already 892 lines and gains nothing here: `onNotification`
exposes decoded `waterWeight` and `cupWeight` notifications today, which is
everything the recorder needs.

### 9.2 New in `hooks/` and `components/`

- `useBrewRun` — the live brew as React state: phase, latest sample, elapsed.
  Wraps `useBrew` rather than replacing it.
- `useBrewHistory` — list, open, delete, and the retention sweep.
- `BrewTrace` — one component, three sizes (sheet, mini-bar, Live Activity),
  varying only by size and whether it draws the figures.
- `PourGlyph` — the four marks, consumed by both the brew rung and the editor's
  `StageTile`. This shared component is what makes §2.3 real rather than a
  resemblance.
- `BrewStageRung` / `BrewStageLadder`, `BrewMiniBar`.

`app/brew.tsx` stays thin — layout only, logic in hooks. It is the file most
likely to grow back into a monolith, and it is already the file M4 largely
replaces.

### 9.3 The data model

Two tables, deliberately:

```
brews(id            TEXT PRIMARY KEY,
      recipeUuid    TEXT,      -- may point at a recipe since deleted
      recipeName    TEXT,      -- copied, so the record survives a rename
      accent        TEXT,      -- copied, so it draws in its own colour forever
      startedAt     INTEGER,
      endedAt       INTEGER,
      outcome       TEXT,      -- done | cancelled | lostContact | failed
      failure       TEXT,      -- the BrewFailure name, when outcome is failed
      pours         INTEGER,
      waterTotal    INTEGER,   -- ml
      cupTotal      INTEGER,   -- g
      heldSeconds   INTEGER)   -- unplanned pauses, from overflow protection

brew_samples(brewId TEXT PRIMARY KEY, stream TEXT)
```

`recipeName` and `accent` are **copied, not joined**. A brew is a record of
something that happened; renaming a recipe, or deleting it, must not rewrite or
erase history.

Splitting the stream out is what lets the retention sweep drop old streams
without losing records — a brew from a year ago should still appear in the list
with its summary intact. It also keeps the list query off a 60 KB blob.

Recipes are stored as a whole JSON blob in `recipes`; brews are **not**, because
the list screen sorts and filters on the summary columns.

`brews` leaves room for M5's notes and rating (#55) without pre-empting them.

---

## 10. Testing and verification

- **Pure logic** — `BrewRecord`, `brewShape`, the recorder's accumulation and
  its terminal-phase behaviour — gets unit tests. The recorder is driven by a
  scripted notification stream standing in for the machine, including a hold, a
  mid-brew `noWater`, and a `lostContact`.
- **Components** get `@testing-library/react-native` tests via
  `renderWithProviders`, remembering that `render` and `fireEvent` are async.
- **`BrewDatabase`** gets tests for the retention sweep in particular: dropping
  a stream must leave its record.
- **Hardware.** None of the brew path can be exercised in a simulator. A
  verification brew on a real J15 is owed before any EAS release build — the
  whole M3 brew path has changed since the last confirmed successful brew, and
  M4 changes it again.
- **Android has never been run at all** (#5) and carries the only
  Android-specific BLE code (MTU negotiation).

---

## 11. Open questions and risks

- **`ffe3` (#81) has never produced a single log line.** If it is a push
  characteristic, the popover's water figure could be live rather than asked
  for, and the refresh glyph could go. Until it speaks, the design assumes it
  does not exist.
- **Whether `tank ×N` (40523) climbs during a brew** is untested. If it does, it
  is a second water signal and worth having.
- **Background operation.** Without `bluetooth-central` background mode, a Live
  Activity cannot be updated from a suspended app. What it shows when the app is
  not running — a last-known state with an honest age, or nothing — needs
  settling during implementation, not now. It does not block the sheet or the
  mini-bar, which are both foreground.
- **Sample volume on a very long brew.** 10 Hz is the machine's rate, not a
  choice; a decimation pass is available if the stream proves unwieldy, but is
  not being written speculatively.
- **The BREW capsule and the swipe tiles share an edge.** Judged acceptable on
  screen; it needs a hand to confirm.

---

## 12. Follow-ups

- **#71 (Live Activity)** is fully specified by §4.4 and stays in this milestone
  as its own issue, gated on the background question above.
- **#62 / #64 (Easy Mode slots, machine settings)** remain deferred.
- **#55 (post-brew notes and rating)** is M5 and slots into §9.3's schema.

# Bypass water editing, and the last of M4 — design

Status: approved
Branch: `m4-watch-it-brew`
Follows `2026-09-06-m4-device-round-three-design.md`.

Bypass water arrived by the back door. A reviewer's screenshot feedback made us
look, and we found the app had been silently discarding it on import for as long
as import has existed. Three commits since then taught the app to *preserve*
bypass, *display* it, and *warn* when a card write is about to drop it. What the
app still cannot do is let anyone *change* it, and the machine is still told
there is none.

This round closes that, and sweeps up the two remaining unstarted items from
M4's backlog. The visual polish pass is deliberately deferred; this document
ends with the inspection checklist that replaces it.

---

## 1. What bypass water is, and the invariant that governs it

Bypass water is hot water the machine dispenses **around** the coffee bed rather
than through it, diluting the finished cup. It is additional to brew water. The
distinction is not cosmetic — it is the invariant that the rest of the app rests
on:

> Stage volumes must still sum to `dosage × ratio`. Bypass is not part of that
> sum.

`isPourVolumeValid()`, `autoFixPourVolumes()` and `getTotalVolume()` must **not**
learn about bypass. The machine rejects a recipe whose pours do not balance, and
those three functions are the only thing standing between a user and a rejected
brew. Every design decision below is downstream of protecting them.

Bypass has three delivery boundaries, and they differ:

| Channel | Bypass survives? | Why |
| --- | --- | --- |
| NFC card | **No** | The 32-byte signature is derived from the card serial and cannot be recomputed. There is no spare field, and two genuine card dumps confirm the layout is full. |
| Share link | **Yes** | `buildSharePayload()` already carries `isEnableBypassWater`, volume and temperature. |
| BLE brew | Not yet | Command 8102 exists and carries it. We currently hardcode zero. Section 6 fixes this. |

The card row is the awkward one, and it drives the copy decision in section 3.

---

## 2. Bypass is a rung on the stage ladder

The obvious engineering answer is that bypass is not a stage and should not look
like one. We are not taking it, because the user's mental model wins:

> "For the end user it makes sense to have it as a stage because mentally that is
> how the end user is seeing it — as an additional step at the end of the brew
> (that is also basically how the official app shows it)."

So bypass renders as a **closing rung beneath the last stage**, in the STAGES
deck, and it is tappable and editable exactly as a stage is.

That choice buys usability and imports a risk: anything that looks like a stage
invites the assumption that it behaves like one. Sections 3 and 4 are the two
defences against that assumption, and they are not optional trimmings.

### The entry point: a permanent ghost rung

When bypass is off, a dashed, dimmed rung reading `+ BYPASS WATER` sits where the
real rung would go. One tap enables it. The alternative — enabling on a settings
screen and editing on the editor — was rejected by the user:

> "B costs fewer taps, better UX. While C is clean it is weird UX to enable on
> one screen and set the parameters on another."

The ghost rung is drawn in the shape the real rung will take, so enabling it is a
transformation rather than an appearance. Nothing is drawn in the graph while
bypass is off.

**Tea shows neither rung.** Tea recipes are special-cased throughout the codebase
already, and import and share both refuse bypass on tea. The editor now agrees
with them.

---

## 3. Two pieces of copy that carry real weight

**The BREW deck total splits.** Today the header reads `260` above `ML TOTAL`.
With bypass enabled it becomes an explicit split:

```
260 ml brew water + 30 ml bypass
```

The second half appears only when bypass is enabled. This is the single most
important line in the design, because it is where a user who has just added
30 ml of bypass discovers that the balance target did not move. Without it the
ladder shows four rungs summing to 290 while the target says 260, and the app
looks broken.

**The card note is always visible.** Explanatory prose in the editor is gated
behind the show-explanations toggle. The bypass rung's explanation follows that
rule with one exception:

> Bypass water cannot be stored on a card.

That note is shown **whenever bypass is enabled**, regardless of the toggle. A
user who turns explanations off has said they understand how the editor works;
they have not said they know that one of these rungs will silently vanish when
they write a card. This is a data-loss warning wearing an explanation's clothes,
and it is the direct counterweight to the decision in section 2.

The existing write-time warning sheet (`BypassWriteSheet`) stays as it is. The
note is the earlier, quieter half of the same message.

---

## 4. The model: a sentinel, not a fourth pour

`recipe.pours` is **not** touched. Bypass never becomes a `Pour`.

Making it one was considered and rejected outright: it would break the pour-sum
invariant, count against `MAX_POURS`, and — worst — reach `getData()` and be
written to a card as a real stage. The card format has no idea what bypass is.

Instead, selection state widens:

```ts
openStage: number | "bypass" | null
```

The bypass rung is a **sibling** of the stage tiles, not an element of the list
that renders them. Editing goes through a separate `editBypass(field, value)`
alongside the existing `editStage(index, field, value)`.

The value of the sentinel is that TypeScript then makes the invariant
unbreakable. Every existing `openStage` consumer that indexes `recipe.pours`
fails to compile until it narrows, so the compiler finds the call sites rather
than a device session finding them. A view-model union list would have read more
prettily and left us one careless `.map` away from treating bypass as a stage.

Two follow-on details:

- `selectStage` currently scrolls to `stageOffsets.current[index]`. It gains a
  bypass branch reading its own offset. The scroll-into-view behaviour is
  identical.
- The delete-then-close ordering warning at `app/editRecipe.tsx:526` applies
  equally: disabling bypass while its rung is open must reset `openStage` to
  `null`, or selection points at a rung that no longer exists.

### Ranges, and where they do not belong

- **Temperature** reuses `cardLimits.TEMPERATURE` (39–99 °C). It sits inside the
  share API's 0–100 bound, and reusing it means the °C/°F setting and
  `library/units.ts` conversion come along for free.
- **Volume** takes the share API's ceiling of 500 ml, minimum 1 ml.

Bypass is not a card field, so these bounds do **not** go in `cardLimits.ts` and
bypass values must **never** appear in `cardWriteProblems`. A recipe with
out-of-range bypass is not an invalid card; bypass is simply not on the card.

Because the volume minimum is 1, the state `bypassEnabled && volume === 0` stays
unreachable through the stepper. Turning bypass off is an explicit action on the
rung, not something a user can stumble into by decrementing.

### What a freshly enabled bypass holds

**30 ml, at the existing default of 85 °C.** This was never put to the user, so
it is called out here: enabling with 0 ml would produce an enabled-but-inert
bypass, which is exactly the incoherent state the model is trying to avoid. 30 ml
is a small, conventional, obviously-adjustable starting point.

---

## 5. The graph

Bypass appears in `StageProfile`. The user asked for it directly, overruling an
earlier decision to leave it out, and suggested a dashed line.

A dashed line is already taken. The target rule at `StageProfile.tsx:139` is
`strokeDasharray="4 3"`, and that file's own comment records a past failure where
two marks changed at once and the eye blamed the wrong one. So the treatment
below is deliberately *near* the user's suggestion rather than literally it, and
was chosen from mockups:

- Bands become `pours.length + 1`. Bypass owns the rightmost band, and the stage
  curve is built at the reduced width
  `width × pours.length / (pours.length + 1)`.
- The bypass mark is a **rectangle with a faint fill and a dashed outline** in
  `palette.info` — the fill at the same 0.16 opacity the stage curve uses, so it
  reads as part of the same family, and `strokeDasharray="9 5"`, long enough that
  it is never confused with the target rule's `4 3`.
- **The target rule stops at the last stage band.** `dosage × ratio` is a
  brew-water target and bypass is not counted against it. Truncating the rule
  says so geometrically, before any copy is read.
- `profileScale` becomes `max(pourTotal, target, bypassVolume, 1)`. In practice
  bypass rarely sets the scale, but the guard means a large bypass cannot
  overflow the viewBox.
- The bypass band selects like any other: same `Rect` highlight at
  `palette.text` / 0.07, and tapping it opens the bypass rung.

A continuous dashed staircase climbing past the last stage was mocked up and
rejected: it rises **above** the target rule, and a curve above that rule means
"too much water" everywhere else in this app.

Accessibility follows the existing pattern — a laid-out `Pressable`, not
coordinate maths, labelled distinctly from the rung below it so a screen reader
does not read the same name twice.

`StageProfile` keeps its `"use no memo"` directive. The model is mutated in
place and `pour.getVolume()` is a method call the React Compiler cannot see.

---

## 6. Telling the machine about it

`Machine.ts:832` currently sends:

```ts
buildType1(8102, [0, 0, Math.round(recipe.dosage)])
```

The command descriptor at `commands.ts:87` already declares
`[float32("bypass volume"), float32("bypass temp x10"), int("dose g")]`, and
`encodeArguments` already writes float32 little-endian per argument. **No new
encoding machinery is needed.** Only the values change: send the real volume and
temperature when bypass is enabled, and keep sending `0, 0` when it is not, so
existing behaviour for non-bypass recipes is byte-identical.

### The one thing we cannot resolve without hardware

`ble-protocol.md:558` records an open question: is the second argument tenths of
a degree, or literally temperature × 10 in some other unit? The command's
confidence is rated `spec` — it comes from an APK decompile, not from a live
capture. The user is away from the machine this round, so this cannot be
settled now.

The repo already has a house pattern for exactly this situation, and the user
chose it: a **`bypassTempEncoding` setting** mirroring `teaSteepEncoding`. Two
candidate readings, defaulting to the spec's, with a picker in the machine
console so it is runtime-switchable without a rebuild. When hardware is
available the correct one can be found in two brews rather than two builds.

### Removing `teaSteepEncoding`

The same setting for tea steeping has served its purpose.
`ble-protocol.md:352` records the hardware verdict of 2026-09-01 on firmware
J15 V12.0D.500: HomoLand's encoding was confirmed by stopwatch. The switch is
now dead weight carrying a resolved question, and the user asked for it to go:

> "We've also settled tea encoder so we can clean that up."

Remove it across `library/Settings.ts:59`, the `TEA_STEEP_OPTIONS` and picker in
`app/machine.tsx`, `hooks/useBrew.ts`, the `Machine` getter and its use at
`Machine.ts:834`, and the four copy rows at `docs/copy.md:944–947`. `encodeTeaBlob`
keeps the confirmed encoding as its only behaviour.

---

## 7. Import: relax the temperature, keep the volume

`XBloomRecipe.ts:77–100` currently imports bypass only when volume **and**
temperature are both valid and volume is greater than zero. That was the right
call when bypass was not editable — a half-understood bypass the user could not
correct was worse than none.

Editing changes the calculus, so the rule relaxes by exactly one field. This was
never put to the user, so it is stated explicitly:

- **Volume still gates the import.** Zero or missing volume means no bypass.
  There is no safe default for volume; inventing one would fabricate a brew
  parameter the recipe's author never chose.
- **Temperature no longer gates it.** A valid volume with a missing or
  out-of-range temperature now imports as bypass at the 85 °C default. The
  temperature is visible and adjustable in the rung, so a wrong guess is
  correctable, whereas silently discarding the whole feature is not.

---

## 8. The share-link churn constraint

`canonicalSnapshot()` turns a payload into a stable string, and
`Recipe.shareSnapshot` stores the snapshot that produced an existing link.
Staleness is fresh-versus-stored.

Therefore: **if the payload shifts at all for recipes with no bypass, every
already-shared recipe looks stale and re-mints a duplicate row in the shared
service account.** The model's defaults (`bypassEnabled=false`, `volume=0`,
`temp=85`) were chosen to match what `shareLink.ts` previously hardcoded, so this
falls out naturally — but only as long as nothing in this round disturbs them.

A mutation-confirmed test pins it. Note the inversion while reading that code:
`isEnableBypassWater` is **1 = on, 2 = off**.

---

## 9. Stage count: an advisory from the card that is actually in the room

A reviewer asked for more than nine pours. Investigation found the app already
allows them — `app/editRecipe.tsx:480` caps only tea, at three, and coffee runs
to `MAX_POURS = 31`. It is the *official* app that stops at nine.

What the app lacks is warning. The byte layout is a 41-byte header, 8 bytes per
stage, 3 trailing bytes, so a 128-byte card holds about **10** stages and a
160-byte card about **14**. The write-time capacity guard (`bb69540`) already
refuses an oversized write safely, but it refuses it at the worst moment: card
held to the phone, intent formed.

The advisory therefore uses **the real capacity of the last card read**, which
the user chose over a fixed threshold. `lastCardRead` (`Settings.ts:161`) holds a
serialised `CardCapture` including `systemInfo`, and `app/index.tsx:384` writes it
unconditionally on every read, so the number is genuinely available. `systemInfo`
is nullable; when it is absent, or no card has ever been read, fall back to 10.

This is advisory only. It does not disable the add button, and it does not block
saving — a recipe that exceeds card capacity is still a perfectly good recipe to
brew over BLE or share by link.

---

## 10. The XID lookup that fails in silence

`fetchRecipeTitle` (`useRecipeEditor.ts:99–128`) swallows every failure into a
`console.log`. A user who types an XID and gets no name back has no way to tell
a network failure from an XID that does not exist.

Surface it: an inline, non-blocking message on the XID field distinguishing "we
could not reach xBloom" from "no recipe with that XID". It must not block saving
or clear the field — the XID is legitimately usable without a looked-up name.

Mind the effect's existing shape: it only runs when `xid` is non-empty and
`xbloomName` is empty, and it carries an
`eslint-disable-next-line react-hooks/set-state-in-effect`.

---

## 11. Testing

- **Round-trip and card format.** `library/__tests__/Recipe.realCards.test.ts`
  guards `getData`/`parseData`. Neither is touched by this round; if either test
  moves, something has gone wrong.
- **The pour-sum invariant.** A test asserting that enabling bypass and setting a
  volume leaves `getTotalVolume()` and `isPourVolumeValid()` unchanged. This is
  the invariant from section 1 and deserves a test that names it.
- **Share payload churn.** Mutation-confirmed: a recipe with bypass off must
  produce a byte-identical payload and an unchanged `canonicalSnapshot()`.
- **Import relaxation.** Two fixtures: valid volume with broken temperature
  imports at 85 °C; zero volume imports no bypass at all.
- **BLE frame.** Assert the bytes of 8102 for both encoding options and for
  bypass off, so the fallback to `0, 0` is pinned.
- **Graph.** `profileScale` including bypass; band count `pours.length + 1`; the
  target line's shortened width.

Two traps this repo has already paid for twice each, restated because this round
touches both kinds of code:

- **The fixture-equals-default trap.** A fixture using the code's own default
  cannot distinguish a real binding from a hardcoded constant. Bypass defaults
  are 30 ml / 85 °C — no test may use those as its fixture values.
- **Async render.** `@testing-library/react-native` v14's `render` and
  `fireEvent` are asynchronous. A missing `await` leaves the screen empty and the
  test passes for the wrong reason. Always go through `renderWithProviders`.

Colour assertions read the rendered node's resolved style, never palette
constants — `components/__tests__/BypassWriteSheet.test.tsx` is the pattern.

---

## 12. Deferred: the visual polish pass

The visual pass is **not** in this round. The user's instruction:

> "We defer it from this round but make a plan for it — so at the end of this
> round you give me a list of all areas to inspect, I can then go through and
> feedback on the ones needing more attention."

Nothing since device round two has been on hardware, so the checklist below is
partly a verification list and partly a design-review list. NFC and BLE cannot be
exercised in a simulator at all.

**Landed since the last device session, never seen on a device:**

1. Brew record header — the date and time folded into the app chrome.
2. The scrolling profile-name marquee on a brew record, including its rest beats.
3. Expandable stage detail on a brew record, and that its content scrolls.
4. The export flow and the rendered PNG.
5. The WRITE tray against a genuine card.
6. The card capacity guard's refusal message, on a card too small for the recipe.
7. The bypass card and the write-time warning sheet.
8. Split swipe trays on the home screen.
9. The glyph BREW shortcut.
10. Thin stage bars (#88).

**Added by this round:**

11. The bypass ghost rung, and the transition when it is enabled.
12. The bypass rung open, with its stepper behaviour.
13. The split BREW total, and that it reverts cleanly when bypass is disabled.
14. The always-visible card note.
15. The bypass mark in the stage profile, selected and unselected.
16. That tea shows no bypass affordance anywhere.
17. The stage-count advisory, on a device that has and has not read a card.
18. The XID lookup failure message, offline and with a bogus XID.
19. A bypass brew over BLE, and which temperature encoding is correct.

---

## Out of scope

- Any change to `getData` / `parseData`, or any attempt to store bypass on a
  card. It is not possible; the signature is derived from the card serial.
- Teaching `autoFixPourVolumes` or `getTotalVolume` about bypass.
- The visual polish pass itself (section 12).
- Open bug issues, which the user excluded from this round.
- Event 40520 `RD_Bypass` — single-source and unverified. Not relied upon.

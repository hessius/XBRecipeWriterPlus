# M4 device round three — design

Status: approved
Issue: #93
Branch: `m4-watch-it-brew`
Supersedes nothing; follows `2026-09-05-m4-device-round-two-design.md`.

Twelve findings from a live brewing session, transcribed. Round two's fixes
largely landed — the machine panel opens from the header, the trace and ladder
read well, the wait stripes are in, and a brew **started on the machine** was
picked up and followed correctly, which closes the open question from #87.

What follows is grouped by cause, not by the order they were reported, because
several of the findings turn out to be one bug seen twice.

---

## 1. The ladder collapses wherever its parent is unbounded

**Finding 1. A regression I introduced in round two.**

`BrewStageLadder`'s non-scrolling branch returns `<YStack flex={1}>`. `flex: 1`
resolves against a parent with a bounded height; the live brew view provides
one, so it has always looked right there. `app/brewRecord.tsx` does not — the
ladder sits in an auto-height `View` inside the `ViewShot` — so the box
computes to zero height. Before round two the rows simply overflowed downwards
and still read correctly. Commit b73b731 added `justifyContent="center"` to
centre a short ladder in its room, and centring content in a zero-height box
stacks every rung on top of the next. Hence the mangling, on screen and in the
PNG alike.

React Native Testing Library performs no layout: every style prop can be
asserted and every one of them is correct. No test could have caught this, and
no test can catch the next one either.

**The design.** The ladder stops guessing. It takes an explicit `fill` prop:

- `fill: true` — the parent bounds the height. Use `flex: 1` and centre.
- `fill: false` — the parent does not. Lay out at content height, no `flex`,
  no centring.

Both call sites pass it explicitly; there is no default. A caller that must
choose cannot silently get it wrong, and the type makes the requirement
visible at the call site rather than buried in the component.

This is the honest fix rather than a padding tweak: the component genuinely has
two layout modes and had been assuming one of them.

## 2. The results view and the record screen are two drawings of one brew

**Findings 10 and 11.**

"Export this brew" pushes `/brewRecord`, which re-renders the same brew from
the same data using differently-sized components. It reads as landing on an
older layout because it *is* a second layout. The mangled ladder made it worse,
but fixing the ladder would still leave two things to keep in agreement.

**The design.** One `BrewSummary` component — trace, figures, stage ladder —
used by three callers:

1. the results state of the brew modal,
2. the `brewRecord` history screen,
3. the capture that produces the PNG.

Export happens **in place**. The results view gains SAVE AS IMAGE and EXPORT THE
DATA; the "Export this brew" navigation goes away. `brewRecord` remains, reached
from history, and renders the same component.

The capture wraps the same subtree, so the PNG is by construction the thing that
was on screen. It gains a margin around its content (finding 11) — the capture
supplies its own background and padding, because a `ViewShot` inherits neither
from its ancestors.

## 3. Two clocks disagree about how long the machine may take

**Finding 5. REFRESH usually reports NO ANSWER although the machine answers.**

Arithmetic, not a flake. `Machine.askHowItIsDoing` may legitimately spend:

| Step | Budget |
|---|---|
| Handshake, when the session is stale | `HANDSHAKE_WINDOW_MS` 200 ms |
| Gap after the handshake | `FRAME_GAP_MS` 2000 ms |
| 3 attempts × wait for a frame | `INFO_WAIT_MS` 2000 ms each = 6000 ms |
| 2 inter-attempt gaps | 2000 ms each = 4000 ms |
| **Worst case** | **~12 200 ms** |

`useRefreshRequest` declares `noAnswer` after `ASK_TIMEOUT_MS` = 6000 ms. The
control gives up with half the machine's budget unspent, then the answer
arrives and quietly updates the reading. That is precisely the reported
behaviour, including the third press appearing to be the one that "worked".

**The design.** Stop racing a blind timer against a promise whose duration we
already know. `useRefreshRequest` takes `ask: () => Promise<boolean>` and is
driven by its resolution:

- press → `asking`
- resolves `true` → `idle` (the reading has moved; the age says `JUST NOW`)
- resolves `false` → `noAnswer` for `NO_ANSWER_MS`, then `idle`

`ASK_TIMEOUT_MS` is deleted. A backstop timer is retained at a value safely
above the machine's own ceiling, for the case where the promise never settles
at all; it is a bug net, not part of the normal path.

The hook stays pure over its inputs and remains testable without a machine.

## 4. Connected is not the same as having readings

**Finding 4. The dot was green and the panel said "not in range".**

Not a fluke, and fully explained. `MachinePanel` branches:

```
if (status === "connected" && vitals !== null)  → the readings
else if (status === "connecting")               → CONNECTING…
else                                            → "Not in range", TRY NOW
```

A machine that is connected but whose info blob has not arrived — `status`
`"connected"`, `vitals` `null` — falls through to the final `else` and is
described as out of range. `TRY NOW` calls `onConnect`, which has nothing to do
because the machine is already connected, so pressing it does nothing. Every
symptom, including the one that looked most like a phantom.

**The design.** A fourth branch for connected-without-readings: it says so, and
offers **REFRESH** rather than TRY NOW, because asking for the readings is the
action that would actually help. `TRY NOW` appears only when the machine is
genuinely not connected.

## 5. The brew is cut short

**Finding 6.**

The recorder treats `done` as terminal and unsubscribes
(`library/brew/BrewRecorder.ts`). `Machine.onEvent` maps **three** distinct
events to `done`:

| Event | Code | Documented meaning | Captured at |
|---|---|---|---|
| `BREWER_STOP` | 40511 | "Brew complete" | 178.0 s |
| `ENJOY` | 40512 | "Final 'coffee ready' notification" | 180.1 s |
| `ENJOY_2` | 40513 | — | 186.4 s |

They arrive in order and 8.4 s apart in the repo's own captured trace, and we
stop at the first. Whatever drawdown follows is lost, so the timer stops early
and the cup total is under-read.

Two further facts from the protocol notes: the weight stream is documented as
continuous at ~10 Hz **while connected**, and `done` does not close the link —
only `forget()` does, on disconnect. State `0x24` is described as "cup still on
scale; machine waits for cup removal before → idle", so the cup being lifted is
itself a physical end-of-brew signal.

**The design.** `BREWER_STOP` stops the *pour*, not the *brew*. The run enters a
new non-terminal phase, `settling`, and the recorder keeps sampling until the
first of:

- the cup reading has been flat for `SETTLE_FLAT_MS`, using the existing noise
  floor of 0.5 ml,
- the cup reading **falls** materially — the cup was lifted,
- `ENJOY_2` arrives,
- a hard cap of `SETTLE_CAP_MS` elapses.

The cap is not optional. It is the only thing standing between us and a run
that never ends if the machine goes quiet mid-settle.

`endedAt` is taken at that point, so the duration and the cup total describe the
coffee rather than the pour. The trace keeps drawing during settling, which is
also the answer to "the brew ends when the cup line flattens" — now it visibly
does.

**Unverified, and it must be verified on hardware:** that weight frames actually
continue to arrive after 40511. The documentation says the stream is continuous
while connected, but says nothing specifically about the post-`done` window, and
no capture in the repo covers it. If the frames stop, `settling` degrades to
"wait for `ENJOY_2`, then stop", which is still 8.4 s more brew than today.

## 6. A ratio changed on the machine cannot be seen

**Finding 7.**

Investigated and answered: **no**. There is no event, no readable
characteristic and no notification carrying the current ratio or dose. The info
blob (40521) carries grind size, mode and the water flag — not ratio. Pour-start
notifications carry a pour index and nothing else, so the machine never states
its intended volume for a stage. Unhandled event codes hit `default: break` and
are dropped without a log, so a ratio-change event, if one existed, would leave
no trace we could find.

**The design.** Stop reporting a certainty we do not have. Today a brew that the
machine ended early is summarised as *off target*, which blames the brew for
something the user deliberately did. Where the machine reports the brew complete
while the plan expected materially more water, the outcome is described as
**ended on the machine** rather than off target — a statement of what was
observed, not an inference about why.

Detecting the *cause* is out of scope; it would need a packet capture while the
setting is changed, which is a hardware investigation and belongs in its own
issue.

## 7. The agitation mark

**Finding 8.** Chosen from three rendered options: **the notch**.

Today the mark is a 10 pt spiral in `palette.dim` placed after the wait *and*
after the slack — the far right of the lane. For "agitates after" that is
neither when it happens nor where the eye goes.

**The design.** A tick taller than the bar, drawn at the water→wait seam, with
the spiral above it. It reads as an instant rather than a property of a segment.

The cost is vertical: every rung needs clearance above it for the glyph.
`allocateBands` must budget for that clearance, or the ladder will scroll a
stage earlier than it does today — which would undo part of #88, whose whole
point was that the ladder was too short.

`agitates before` keeps its mark at the start of the lane, so a stage that does
both shows two marks and they cannot be confused.

## 8. Small visual corrections

- **Finding 2.** The mini player is clipped by the display's rounded corners:
  the close control is half visible and the trace is cut. It takes the bottom
  safe-area inset.
- **Finding 3.** The expanded machine panel needs bottom padding.
- **Finding 9.** The recipe title on the brew screen is unstyled body text where
  nearly everything else is the dot-matrix face. It joins them.

## 9. Copy

**Finding 12.** `docs/copy.md` catalogues alerts, errors and prompts. It gains
the descriptive strings too — the pour-pattern explanations and their kin — so
the whole user-facing voice can be edited in one place and applied back by ID.

---

## Out of scope

- Diagnosing *why* a mid-brew ratio change is invisible (needs a packet capture).
- Any change to the card format or the NFC path.
- The `docs/copy.md` edit pass itself, which waits on the user's edits.

## What only hardware can settle

1. Whether weight frames continue after `BREWER_STOP` (§5). Everything else in
   §5 is contingent on this.
2. Whether the settle-flat window and cap are well chosen in practice.
3. That the notch does not make a nine-stage ladder scroll (§7).
4. That the connected-without-readings state (§4) is reachable and reads well.

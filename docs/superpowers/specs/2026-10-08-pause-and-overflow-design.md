# Pause, resume, and overflow protection for a cup the machine does not know

Design for packages 8 and 9 of release 2.1.0. They are one document because
package 9 is package 8 plus a number: custom overflow protection is a pause
with a threshold, and without a pause it has no mechanism at all.

Both were held back from the release plan pending Appendix A, which has now
run. The spike answered every question it asked, and the answers are good, so
both packages are buildable. What follows is what to build and, more usefully,
the four places where this is easy to get wrong.

## What the hardware said

Measured 2026-10-08 on V12.0D.500, written up in
`docs/machine-integration/ble-protocol.md`.

`40518` pauses a running recipe. It is acknowledged, `40515` reports the volume
delivered so far, and the state settles on `0x1f`. `40524` resumes: `40516`
acknowledges, the state returns to `0x23`, and **the brew carries on from where
it stopped** rather than restarting the stage. Both are inert when they do not
apply, so neither needs a state guard around it.

Two things that look like a pause are not. `8019`, which all three upstream
sources name "Brewer pause", abandons the recipe and starts a FreeSolo water
pour. And `0x1f` is `ARMED`.

## The four hard parts

### 1. The machine cannot tell you it is paused

`0x1f` is the same code a loaded-but-unstarted brew reports. There is no
paused state, no paused flag in the info frame, and no event that means "still
paused". The only thing in the world that knows a brew is paused is the thing
that sent the pause.

So `Machine` has to remember, and that memory is the design's weak point
rather than an implementation detail. A remembered flag can outlive the thing
it describes: the brew can end on the machine, the link can drop and come
back, the user can press the machine's own buttons. A flag that is only ever
set by us and cleared by us will eventually say "paused" about a brew that
finished ten minutes ago, and the UI will offer RESUME for it.

The rule that avoids this: **the flag is set optimistically, confirmed by the
machine, and cleared by anything that contradicts it.**

- Sending `40518` sets `pauseRequested`.
- `40515` arriving turns that into a real paused phase.
- If `40515` does not arrive within `PAUSE_ACK_MS`, the request is dropped and
  the phase never changes. The machine did not pause; saying it did would be
  the lie that matters most here, because the next thing the user does is
  walk away from a running machine.
- `40516`, any `40510`, `40511`, `40512`, `40513`, any failure event, any
  state that is not `0x1f`, and losing contact all clear it.

The last one is the important one and it is written as a default rather than a
list: anything that moves the brew clears the pause. A new protocol event
nobody has catalogued yet should fall through to "not paused", because the
failure mode of forgetting a pause (an offered RESUME that does nothing, and
`40524` is inert) is far cheaper than the failure mode of inventing one.

### 2. A pause is not a stall, and the UI must not mix them up

`stalls.ts` already draws an indicator when the delivered volume stops moving,
and a paused brew is exactly that shape: water stops, the trace flattens,
`TARGET_TOLERANCE_ML` is not reached. Without a change, pausing a brew would
raise a stall warning about the user's own button press.

The paused phase therefore has to suppress stall detection for its duration,
and the trace has to draw the pause as a pause. Reusing the stall's visual
language would be worse than drawing nothing: it would report a fault.

### 3. A paused brew takes longer than it planned to, and the record has to say so

The brew chart's time axis is real seconds. A two-minute pause pushes the
drawn position two minutes past the plan, which is correct and which will look
like a catastrophic over-run on the finished summary unless the summary knows
why.

`BrewRecord` therefore gains `pausedSeconds`, summed across every pause in the
brew. It is a schema addition under the rules in `library/BrewDatabase.ts`:
`NOT NULL DEFAULT 0`, with `0` as the storage sentinel meaning "no pause"
rather than "a pause of no length", translated in `hydrate` like every other
optional numeric there.

It is deliberately **not** folded into `heldSeconds`. Held time is the machine
holding water back on its own judgement; paused time is a person stopping it.
A record that could not distinguish them would be unable to answer the only
question worth asking of the pair, which is whose decision made this brew long.

**And it has to be subtracted from `heldSeconds`, not merely kept beside it.**
`summarise` derives held time as `elapsed - plannedSeconds`: it is not measured
at all, it is whatever the brew took beyond its plan. So a two-minute pause
lands in `heldSeconds` on its own, without anybody writing a line of code, and
the finished brew reports two minutes of the machine holding water back that
the machine never held. `summarise` therefore takes the paused seconds and
removes them, and `heldSeconds` goes back to meaning what it says.

This is the one place in either package where doing nothing produces a wrong
answer rather than a missing one.

### 4. Package 9 is a safety feature built on an untested assumption

Custom overflow protection means: for a cup type the machine does not protect,
watch the scale and pause the brew before the cup goes over. The pieces all
exist now. What does not exist is any measurement of **how much water arrives
after the pause command is sent**.

That number is the whole feature. A pause that takes two seconds to take
effect at 4 ml/s overshoots by 8 ml, and the threshold has to lead the target
by at least that much or the protection protects nothing. Nobody has measured
it, and it cannot be measured without a machine, a scale and a deliberate
overfill.

This is why the prototype PR stays open rather than merging. Everything up to
and including the pause can be built and tested; the number that makes package
9 honest cannot.

## Package 8 — pause and resume

### Protocol layer

`library/machine/protocol.ts` gains the two events:

```ts
COFFEE_PAUSED:    40515,
COFFEE_RESUMED:   40516,
```

`PAUSED_STATE` is already there from the spike, with the ambiguity documented
on it.

### Machine

A new phase, carrying the stage it was paused in so the UI can keep drawing
the ladder in the right place:

```ts
| {name: "paused"; pour: number; pours: number; was: BrewPhase}
```

`was` is what resuming restores. The alternative, recomputing the phase from
the next event, loses the distinction between a pause during `grinding` and a
pause during `pouring`, and the machine does not re-announce a stage it is
already in.

Two methods:

```ts
async pauseBrew(): Promise<void>
async resumeBrew(): Promise<void>
```

`pauseBrew` sends `buildType1(40518, [1])`, sets `pauseRequested` with a
timer, and returns. It does **not** set the phase: the phase changes when
`40515` arrives, because the only honest report of a paused machine is the
machine's.

`resumeBrew` sends `buildType1(40524, [1])` and clears the flag optimistically,
which is the safe direction: a resume that did not take leaves the UI saying
"running" about a stopped machine, and the next pour event corrects it, while
the opposite leaves the UI saying "paused" about a machine pouring into a cup.

### UI

The brew screen offers PAUSE during `grinding`, `pouring` and `bypass`, and
RESUME in `paused`. CANCEL stays available throughout, including while paused,
and this is the one case where two destructive-looking controls sit together:
the copy has to carry it, since RESUME and CANCEL are opposite answers to the
same question.

A paused brew keeps the wake lock. The screen is the only thing in the room
that knows the machine is paused.

## Package 9 — overflow protection for a cup the machine does not know

### Where the threshold lives

On the `Recipe`, in the JSON blob only, never on the card. The byte layout has
no room and the machine has no field for it, which is the point: this is the
app protecting a cup the machine was never told about.

That makes it free to add (`recipeJSON` is a whole-blob column), free to back
up, and automatically absent from anything written to a card.

### When it applies

Only when the cup type is one the machine does not protect, which since #151
is `CUP_TYPE.OTHER`. Offering it for `OMNI` would be offering to duplicate a
protection the machine already performs, with worse information.

### The trigger

The live cup reading, which is the scale, so it already includes the bypass.
That is correct: overflow is about what is in the cup, not about what went
through the dripper.

It fires on **consecutive samples over the threshold**, not on one. The scale
is noisy enough that `flowRate.ts` fits a least-squares line over a two second
window rather than trusting two readings, and a single spurious sample here
would stop a brew.

On firing it calls `pauseBrew()` and the screen says why, in those words: the
cup is near full and the brew is paused. The user resumes or cancels. The app
never cancels on its own; a cup that is nearly full is not an emergency, and
deciding for somebody that their brew is over is not the app's call.

### What it cannot promise

The overshoot. See hard part 4. Whatever the UI says about this feature must
not promise a cup will not overflow, because the app cannot know the latency
between the command and the water stopping. It can say it will try to stop the
brew near a volume you choose.

## Testing

The pause flag's lifecycle is the thing worth testing hardest, and all of it is
testable without hardware, because `Machine`'s state machine is driven by
decoded notifications and the test harness already feeds those.

The cases that matter are the ones where the flag should clear and might not:
a brew that ends while paused, a failure event while paused, a lost link while
paused, a `40515` that never arrives, a `40524` sent when nothing is paused,
and a pause followed by the user pressing the machine's own buttons, which
arrives as ordinary stage events.

The overshoot cannot be tested. It has to be measured.

## What needs hardware before either ships

1. The pause acknowledgement timeout. `PAUSE_ACK_MS` is a guess until somebody
   times a real `40515`.
2. The overshoot after a pause, in millilitres, at a known flow rate. Package 9
   is not honest without it.
3. Whether a pause survives the app backgrounding and the link dropping and
   reconnecting, which is the realistic way a user will discover whether the
   remembered flag is trustworthy.

## A pause is not a stall, in the end

`stalls.ts` calls flat water a stall when the stage still owes millilitres,
and it requires the plateau to have been *seen*. A pause is flat water by
design, the stage still owes its millilitres, and the scale goes on reporting
at about 10 Hz throughout. Every clause is satisfied, so without a gate a brew
reports the user's own button press back to them as a fault.

The gate is in `BrewRecorder.receive`: nothing is kept while a pause is open.
That is the right layer, because the recorder is the only place that knows a
pause happened. Inferring it in `stalls.ts` from a gap in the timestamps was
tried and abandoned: the rule is sound, but the file's fixtures use readings
several seconds apart to mean watched stalls, so any gap threshold low enough
to catch a pause also rewrites seven existing characterisation tests, and the
threshold itself is a number nobody can pick without a real stream.

The live HOLDING warning needs no gate: it requires the `pouring` phase, and a
paused brew is not in it.

One residual, and it wants a real stream rather than an argument. If the water
was *already* flat when the user pressed PAUSE, the plateau's anchor sits
before the pause, so the stall that follows the resume is reported with the
pause's seconds inside it. Water rising up to the moment of the press -- the
ordinary case -- is unaffected, because the first reading after the resume is
a rise and closes the plateau at zero. Worth timing once the overshoot round
happens.

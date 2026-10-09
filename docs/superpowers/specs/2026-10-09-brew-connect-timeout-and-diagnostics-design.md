# Brew connect timeout and per-attempt diagnostics

## Problem

A user reports that connecting to the machine and starting a brew
"often takes a few tries," and in one instance repeated in-app attempts
all failed and only an app restart fixed it. He does hear an audible
beep from the machine in these episodes, so at least one frame is
reaching it.

Issue #199 bug 4 (shipped in PR #203) already added a narrow one-shot
relink-and-retry to `hooks/useBrew.ts`: a pre-flight `blocked` refusal of
kind `notConnected`/`noVitals`, or any attempt that died before the
machine was ever reached, drops the link and tries exactly once more on
a fresh one. That is deliberately the smallest safe retry -- resending
after a frame has actually gone out risks a second dose, since the
transport writes without acknowledgement (Write Without Response).

That fix cannot reach one specific failure mode: a hung native BLE
call. `library/machine/Transport.ts`'s `connect()` has no timeout
around `BleManager.connect`, `retrieveServices`, `negotiateMtu` or
`readModelNumber`. If any of those never resolves -- which the file's
own comments already anticipate, describing an OS-held "ghost" link
left over from a crash or a JS reload -- the promise just never
settles. Nothing fails, so nothing retries, and nothing is even logged
beyond the "connecting to {id}" line that starts it. The only way out
is recreating the app's one `Machine` singleton (`let shared` in
`hooks/useMachine.ts`), which only happens on a full app restart. This
matches the report closely enough to be worth fixing, without being
reproduced on real hardware.

We cannot get a confirmed repro from the field this release. The
approach is a middle ground: ship a fix that's safe even if it isn't
the actual cause, ship enough diagnostics that a future report is
actionable, and ask the user to enroll in TestFlight so the next
occurrence (if any) comes with a log attached.

## Goals

- Turn a hung native connect call into an actual, timely failure,
  so the existing one-shot retry (#203) can act on it, and so a full
  app restart is no longer the only way out of it.
- Make a hung connect attempt visible in the diagnostics the user can
  already copy, instead of a silently dangling log line.
- Give the user a one-tap way to copy a diagnostic log scoped to the
  attempt that just failed, directly from the brew failure screen,
  without having to find the machine console.
- Do all of this with changes small and safe enough to ship without a
  hardware repro: nothing here should make a working connect slower or
  less reliable than it is today.

## Non-goals

- A full link-health state machine (periodic keepalives, proactive
  teardown). Disproportionate for one unreproduced report; revisit if
  the diagnostics show this is a real, recurring class of failure.
- Changing anything about the one-shot retry's scope or the frames it
  is willing to resend. That boundary (#203, tightened by its Copilot
  review) stays exactly as it is.
- New instrumentation beyond the timeout itself. `Machine`'s existing
  `linkHistory`/`frameHistory` (via `note()` and `retainFrame()`) and
  `frameLogSince()` already capture everything needed; the gap was
  purely that a hang never produced a line at all because the call
  never returned.

## Design

### 1. A bounded `Transport.connect()`

New constant in `constants/machine.ts`:

```
export const CONNECT_TIMEOUT_MS = 10_000;
```

Sized from the user's own session log (pasted earlier in this issue's
thread): real connects there completed in 1.5-3.5 s, including the
existing ghost-link retry-once. `waitForRadio()` already has its own
5 s timeout before this point, so 10 s is budget for the rest of the
sequence alone, roughly 3x the slowest observed real connect.

`connect()`'s existing body -- `BleManager.connect` (with its existing
retry-once-after-a-ghost-link attempt), `retrieveServices`,
`listenToEverythingThatTalks`, `negotiateMtu`, `readModelNumber` -- is
raced against that timeout. The race is wrapped in `try`/`catch`/
`finally`: `finally` always clears the timer, so a connect that
succeeds well under the timeout does not leave it armed. If the timer
wins, the `catch` block:

- Fires `BleManager.disconnect(id).catch(() => {})` -- best effort,
  exactly like the existing ghost-link cleanup a few lines above it --
  so a hung attempt does not also leave the OS holding the link open
  for the *next* attempt to trip over. This call is deliberately **not
  awaited**: if the native disconnect itself hangs, awaiting it would
  hold the whole `catch` block open behind it, and a timeout built to
  bound one hang would be defeated by a second, unrelated one in its
  own cleanup path. The caller's rejection must not wait on it.
- Throws `new Error("The machine took too long to connect.")`. Plain
  sentence, matching every other thrown message in this file (e.g.
  "The machine is already in use by another app.").

A `timedOut` flag, local to that one `connect()` call, is read in the
`catch` block solely to decide whether this disconnect-and-cleanup path
runs (a non-timeout failure has nothing to clean up here). It does
**not** guard the `this.deviceId = id` assignment on the success path --
that line runs unconditionally once `Promise.race` resolves, and by
construction it only resolves that way when the real connect sequence
won the race, so `timedOut` is trivially false there already. What
protects the transport from retroactively believing it is connected is
structural: `this.deviceId = id` sits on the `try` side, immediately
after the `await`, so a native sequence that eventually settles after
the timeout has already fired and been reported to the caller never
reaches that line for this call -- the `catch` block (and its `throw`)
already ran instead.

### 2. No changes needed in `Machine.ts`, `useBrew.ts`, or `useMachine.ts`

- `Machine.connect()` already narrates every outcome through `note()`:
  `"connecting to {id}"`, then either `"connected"` or
  `"refused — {message}"`. A timeout error flows through the existing
  catch block unchanged and produces `"refused — The machine took too
  long to connect."` in the link history, with no new code.
- `hooks/useBrew.ts`'s `worthRelinking()` already returns `true` for
  "died before any active brew phase," which is exactly what a thrown
  connect timeout is. The existing one-shot relink (#203) already
  covers it.
- `hooks/useMachine.ts`'s background/launch reconnect
  (`holdLinkAcrossAppState` / `openLink`, retried at `CONNECT_DELAYS_MS`
  intervals) already tolerates and retries a rejected `connect()`. A
  timeout there is just one more rejection it was always built to
  retry.

### 3. A per-attempt diagnostic log on the brew failure screen

`app/brew.tsx` already calls `useMachine()`; add `machine` to that
existing destructure (`app/machine.tsx`'s console does the same, so
this is not a new pattern).

The shared `LiveBrewProvider` (`hooks/useLiveBrew.tsx`) stamps a
`startedAt: number` on its run snapshot the moment a run is registered
in `begin()` -- not a ref local to `app/brew.tsx`. A screen-local ref
only gets stamped on a call to `start(...)`, and the brew screen can
also be reopened via the mini bar (`view=1`) to look at an
already-finished run without calling `start()` again; a local ref would
silently keep its initial value in that case and scope the diagnostic
log to "everything" instead of the real attempt. Storing the timestamp
on the shared run instead means both the original `start(...)` call and
a "Try again" retry -- which both route through the same `begin()` --
stamp it exactly once each, and reopening via the mini bar reads the
same `startedAt` the run was actually given, with no new tracking code
in the screen itself. `copyDiagnosticLog` reads `run?.startedAt ?? 0`.

On any failure (`blocked || failed`), below the existing `Action`
button stack, render a plain pressable text line -- not another bordered
`Action`, since this is a diagnostic aid rather than a recovery action
and must not visually compete with TRY AGAIN. Same treatment as the
existing `FIRST_BREW_REMINDER` line: `palette.dim`, 13 pt, underlined to
read as tappable. Label: "Copy diagnostic log". Shown on every failure,
including `NO_RETRY` endings like `stopped`, where there is no retry
button at all to sit near -- diagnostics matter there too.

On press: build the same two-part block `app/machine.tsx`'s existing
`copyLog()` already builds -- `machine.linkHistory` lines, a blank
line, then `machine.frameLogSince(attemptStartedAt)` -- except the
`linkHistory` half is also filtered to `at >= attemptStartedAt` (today
`frameLogSince` only filters `frameHistory`; this needs the same filter
applied to `linkHistory` inline in the screen, not a new exported
method, since nowhere else needs it). Copy the result with
`Clipboard.setStringAsync`, then call
`notify({tone: "success", message: "Diagnostic log copied"})` --
identical confirmation copy and tone to the console's own.

## Error handling

No new failure modes beyond the timeout's own forced disconnect, which
is deliberately best-effort and must never replace or mask the timeout
error itself with a disconnect failure. Every other path in this design
reuses error handling that already exists and is already tested:
`Machine.connect()`'s catch block, `worthRelinking()`'s retry decision,
and `openLink`'s own retry loop.

## Testing

`library/machine/__tests__/Transport.test.ts`, inside the existing
"connecting" describe block:

- A `BleManager.connect` mocked to never resolve rejects with the
  timeout error once `CONNECT_TIMEOUT_MS` elapses (fake timers).
- That same timeout forces `BleManager.disconnect` to have been called.
- A connect that resolves just under the timeout still succeeds
  (regression guard against a timeout that is too tight).
- A connect that resolves *after* the timeout has already fired does
  not retroactively make `isConnected()` true (the late-resolution
  guard -- the highest-value test in this set).
- The existing ghost-link retry-once test continues to pass unchanged,
  confirming the timeout wraps around it rather than replacing it.

`app/__tests__/brew.test.tsx` (or wherever the brew screen's tests
live):

- "Copy diagnostic log" is not rendered while a brew is running or
  done, only on `blocked`/`failed`.
- Pressing it calls `Clipboard.setStringAsync` with text built only
  from link/frame history entries at or after the current attempt's
  start (a fixture with an older, pre-attempt entry pins that it is
  excluded).
- Pressing it shows the same success toast the console's copy uses.
- A "Try again" press followed by a second failure and a second copy
  reflects only the second attempt's window, pinning that the provider's
  attempt timestamp is reset on retry rather than accumulating.

Full existing gates before merge: typecheck, lint, both jest projects
(`ios` and `android`), `expo-doctor` -- same bar as every prior PR this
session.

## Rollout

This ships as its own small PR, independent of #204 (the BP temperature
clamp) and PR #202 (pause/resume, still not merged). After merge, ask
the user to enroll in the TestFlight beta; if the reported failures
stop recurring on this build, or recur with a diagnostic log attached,
either outcome is useful evidence for whether the "juice was worth the
squeeze."

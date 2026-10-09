# Custom dripper overflow protection v1

Approved in the 2026-10-09 design conversation. Package 9 of 2.1.0.
This feature is developed without hardware access; device verification remains
a release gate.

## Corrected telemetry meaning

Protect the dripper, not the receiving cup. `cupWeight` is collected coffee
weight and normally rises while the dripper drains. A policy that waits for
that weight to fall would not resume an ordinary brew.

Use estimated retained water:

`max(0, dispensed brew water - collected coffee weight)`

Both inputs must be valid and fresh. The estimate includes water absorbed by
the grounds. It is not a direct measurement of liquid level, and v1 performs
no guessed absorption correction or adaptive overshoot modelling.

This supersedes the receiving-cup threshold descriptions in the earlier
pause/overflow and release-delivery designs. Bypass goes directly to the
receiving cup, so it must not trigger dripper protection.

## Configuration

Configuration belongs to each recipe, beside its OTHER brewer controls.
Protection is off until the user explicitly supplies a valid retained-water
limit in grams. Do not suggest a supposedly safe threshold for an unknown
dripper.

The check interval offers 15, 30 and 45 seconds, default 15. It is an interval
between checks, not a maximum pause duration. Switching to another brewer
type must prevent protection from running. Quick edits remain unchanged.

These fields belong to recipe JSON, not NFC bytes or BLE recipe blobs. Preserve
them through save/load, copy, backup and supported recipe migrations. Existing
recipes with no fields retain their previous behaviour.

Explain that the retained-water estimate includes water held by the grounds.
A threshold below that absorption can keep extending the pause indefinitely;
manual RESUME and CANCEL must remain available.

## Ownership

Use an independent controller owned by the live run above the navigator.
Subscribe to raw water/cup notifications and phase events. Do not derive
control from chart samples: the recorder deliberately omits paused samples,
but the controller needs readings throughout an automatic pause.

Keep recipe policy out of the transport. Use the existing Machine pause/resume
path and coordinate shared machine-operation changes with the slot-writing
session. Screen navigation must not unmount the controller or start a second
one.

## Automatic lifecycle

1. While actively pouring brew water into the dripper, evaluate valid paired
   telemetry. Reject isolated threshold spikes.
2. A sustained retained-water reading at or above the configured limit requests
   PAUSE. Send one request; do not repeatedly send while awaiting confirmation.
3. Confirm through the machine's paused phase, driven by 40515. This is BLE
   acknowledgement, not a user-confirmation step.
4. Start the selected interval only after confirmation.
5. At each boundary, fresh below-limit readings allow automatic RESUME and
   re-arm protection for the next crossing.
6. At/above-limit, invalid, missing or stale readings keep the machine paused
   for another selected interval. Explain missing data separately from a
   measured high estimate.

No manual interaction is required in normal operation. The implementation
plan must define explicit freshness and sustained-crossing bounds, test their
exact boundaries and identify them as software policy rather than measurements
of valve latency.

The controller must not pause during bypass, grinding or a terminal phase.
Telemetry recorded while paused must remain available to control even though
it is excluded from stall detection.

## Manual intervention and invalidation

A manual PAUSE must never be automatically resumed.
Once a confirmed ordinary pause returns to running, including through a
machine-origin resume, protection re-arms with fresh crossing evidence.
Running events before pause confirmation do not lift manual-pause suppression.

Manual RESUME during an automatic pause disables automatic protection for the
rest of that brew and explains that override visibly. This avoids immediate
re-pause and honours the user's explicit action. CANCEL and terminal events
dispose all outstanding automatic actions.

Backgrounding and link loss disable automatic protection for the remainder
of this run. V1 never restores it automatically on foregrounding or reconnect,
and never executes an overdue resume. A new run creates fresh ownership.
An ARMED state by itself does not prove the machine is paused. Late callbacks
from an old attempt cannot reset the new run's controller or recorder.

Pause/resume rejection or missing confirmation must be surfaced explicitly,
never represented as successful control. An error must not silently turn an
automatic pause into a manually owned one or leave a stale resume armed.

## Presentation

At configuration and protected-brew initiation, use persistent inline copy:

> Keep XBRW++ open while brewing. Leaving or closing the app disables custom
> overflow protection.

No modal, confirmation checkbox, extra tap or delay. Keep the caution visible
during protected brewing; omit it for unprotected brews. Backgrounding,
closing or phone locking is leaving the app; internal navigation is not.

The live status names the dripper protection pause and time until the next
check. Show extensions, unavailable telemetry, loss of coverage and manual
override as distinct states. Never claim guaranteed overflow prevention.

The ladder preserves the active stage and delivered progress, with an
automatic-pause indication rather than pending or stalled appearance.
Manual pauses remain distinguishable.

The graph marks automatic-pause intervals, including extensions, on real
elapsed time. Keep pause intervals/reasons in the brew record for historical
graphs and relevant graph exports. Preserve interval metadata across backup,
restore and stream-retention sweeps; absence in older records is normal.
Do not change the identifying PourProfile silhouette's even-per-stage axis.

## Validation

Pure controller tests cover exact threshold/freshness boundaries, isolated
spikes, paired channels, absorbed-water floor, pause confirmation, extensions,
automatic resume/rearming, bypass exclusion, unavailable readings, manual
pause/override, command errors, background/link loss, cancellation and late
callbacks.

Lifecycle tests cover one controller per run, navigation, retained owner
metadata, stopped-brew handling and no duplicate brew. Persistence tests cover
new recipe fields, old JSON, backup validation, pause intervals and retained
records after sample sweeping. Use the repository's real SQLite test harness
for SQL behaviour.

UI tests cover OTHER-only controls, explicit limit entry, interval selection,
foreground cautions without extra interaction, live statuses, graph intervals,
history/export coverage, stage progress, and accessibility.

Run targeted iOS/Android tests, typecheck and lint during implementation. Run
integrated validation serially with the slot session. Keep the release ledger
current.

Hardware checks remain outstanding: estimate behaviour during firmware tare,
pause acknowledgement and valve-stop overshoot, continued telemetry while
paused, manual machine controls, background/link-drop recovery and normal
brewing after recovery. Native graph/layout, screen-reader and foreground
checks also remain required before release.

## Implemented software policy and evidence (Task 10, 2026-10-09)

Tasks 1-10 are implemented on `feat/custom-overflow-v1`. This is completion of
software implementation and scripted verification, **not validated overflow
safety**. The release ledger holds the reproducible commands and final counts.

| Policy | Actual v1 behaviour |
|--------|---------------------|
| Configuration | Optional `overflowProtection: {retainedGrams, checkSeconds}` in recipe JSON. A positive safe integer limit must be supplied explicitly; no threshold default. Intervals are exactly 15/30/45 seconds, with 15 as the UI default. Only OTHER runs activate stored configuration. |
| Freshness | Both finite, non-negative channels must be at most 1,000 ms old, inclusively; future readings are rejected. |
| Pairing | Channel skew at most 250 ms, inclusively. The older channel's timestamp is the evidence timestamp. |
| Sustained evidence | Distinct paired timestamps spanning at least 500 ms. High means `>= limit`; resume means `< limit`. Polling a stored pair cannot grow evidence. Invalid data, stale gaps and phase/stage changes reset it; a contradictory value at a duplicate timestamp also breaks it. |
| Publication | 250 ms host polling/publication; mode/deadline changes publish immediately. Host ticks need not land exactly on a deadline: a due check runs on the first eligible tick, using fresh readings then. These are chosen software constants, not measured scale or valve performance. |
| Pause ownership | One `40518` request per crossing, through `Machine.pauseBrew("overflow")`. Write completion is not confirmation. Only a confirmed overflow `paused` phase from `40515` opens automatic ownership and the check interval. |
| Checks | Extend by the selected interval while high, unavailable or not sustainably below. Extension is from the actual check time, not a catch-up loop. No second PAUSE is sent during the same hold. |
| Resume | One `40524` through the existing optimistic Machine resume path; it restores the remembered phase before the write completes. V1 does not wait for `40516` to claim a hardware-verified resume. Rejection is an explicit protection error. |
| Eligibility | Machine-reported `pouring`, with a valid brew-stage index. No initiation in grinding, bypass, settling or terminal phases. A phase is not independent evidence that a physical valve is open. |
| Failures | Missing pause confirmation expires at `PAUSE_ACK_MS` (currently an unmeasured 3,000 ms). Write rejection or missing confirmation clears automatic deadlines and shows actionable error copy. Manual RESUME/CANCEL remain available. |
| Invalidation | Manual PAUSE relinquishes automatic ownership and is never auto-resumed. Confirmed ordinary pause/resume can re-arm with new evidence. Manual RESUME during an automatic request/hold/resume disables protection visibly. Background/inactive/unknown initial app state and link loss disable it for this run; foreground does not restore it. |

`RunOwner` is above the navigator, with one real run hook, recorder and protection
controller. Internal navigation does not re-send the brew or replace ownership.
The raw notification subscription continues during pauses even though the recorder
omits paused samples. Commands, publications and retry callbacks are generation-
and owner-scoped; old completion/rejection cannot re-arm a disposed controller.

A `noVitals`/`notConnected` automatic preflight retry sends nothing on its refused
first attempt. It synchronously replaces **both** protection and the stopped
recorder on the same machine/provider `runId`, retaining the run's original recipe,
quick edits and fixed protection configuration. Replacement starts with no stale
phase or crossing evidence and rechecks foreground state. A delayed callback after
an actual machine/run switch cannot replace the new recorder or reset its disabled
controller; old-machine notifications cannot publish or insert a new-owner record.
This ownership guarantee does not undo a native write already handed to a transport.

Confirmed pause epochs are retained internally until publication. Intervals are
then converted to milliseconds relative to first moving water (`pouringAt`), with
pour-open/start fallbacks if water never moves; pre-water spans clamp to zero.
They do not start at a high reading or at request-send time. Total `pausedSeconds`
keeps its legacy whole-second rounding. Interval precision is retained separately,
including extensions and terminal closure. Stall arithmetic subtracts actual
overlap once; live pour-end DELAY excludes interval overlap before the drawdown
boundary, without hiding genuine extra delay.

The integrated script uses injected epoch readings and fake host ticks, real
controller/Machine/run/provider/recorder logic, and raw fake-transport frames:

| Epoch relative to run start | Observed scripted result |
|-----------------------------|--------------------------|
| 0 | One protected OTHER brew, foreground caution, owner survives child navigation. |
| 1,000 / 1,500 ms | High pairs request one PAUSE; no confirmed interval yet. First moving water is at 1,000 ms. |
| 1,700 ms | `40515` confirms; first check is at 16,700 ms. |
| 16,700 ms | Fresh high estimate extends to 31,700 ms without another PAUSE. |
| 31,700 ms | Stale/missing fresh cup pair extends to 46,700 ms, with unavailable-reading copy. |
| 46,000 / 46,500 ms | Fresh below-limit pairs establish resume evidence. |
| 46,700 ms | Due host tick sends one RESUME and re-arms. |
| 50,000 / 50,500 ms | High pairs request the second PAUSE. |
| 50,700 ms | Confirmation opens the second interval. |
| 52,000 ms | User RESUME visibly disables protection for the remainder of the run. |
| 53,000 ms / terminal | Late resume event/ticks add no automatic commands; complete planned water and `40512` emit exactly one record. |

The record contains exactly `[700, 45700]` and `[49700, 51000]` ms on the
first-water axis, both reason `overflow`, with zero pause-as-stall time.
Real Node SQLite behind the expo-sqlite test surface preserves these through
insert/hydrate, stream sweep, backup parsing and restore without inventing a
restored stream. Existing history tests cover recipe deletion, ordinary and Story
capture, hidden-chart choice, and retained reason copy after a sweep.

Full, compact mini-bar, finished, historical, ordinary capture, Story and compare
traces carry interval metadata. The mini-bar also carries bypass extent so its
self-sized axis agrees with the full live trace; a paused bar no longer says
Grinding. Bands remain inside existing chart heights. Volume and rate charts share
real seconds; automatic gaps are not connected by fabricated observation paths.
Compared lanes keep their own reasons and observed gaps; swept lanes contribute no
imaginary graph or interval extent. PourProfile's identifying axis is unchanged.

Independent card fixtures and BLE blob fixtures prove configured/unconfigured
**byte equality** for all three check intervals. No native configuration, app
version or `BACKUP_VERSION` was changed. Byte equality is not a real-card or BLE
hardware verification. Screen tests use scripted telemetry and native-module
mocks; simulated text, announcements and layout are not native accessibility or
export-image validation.

Release gates explicitly remain: firmware tare and retained-water/ground-absorption
behaviour; continued paused raw scale availability and freshness; ACK/valve latency
and overshoot; background/phone-lock/reconnect and physical machine buttons; narrow
UI and large text; VoiceOver/TalkBack and native iOS queued announcements; recorded,
ordinary export, Story and compared graph images; real NFC devices/genuine cards and
BLE recipe bytes. No actual safety claim is made.

## Isolation and scope

Worktree: `custom-overflow-v1`, branch `feat/custom-overflow-v1`, based on
`origin/integration/2.1.0` at `d0f60dd`.

This session owns the brew/provider/controller/recorder and graph/ladder pause
changes. The parallel slot session owns its assignment model, persistence,
screen and library/context entry. Coordinate Recipe, backup and Machine changes
before either session edits shared surfaces.

No new PR, main merge, additional automated review round, deployment or hardware
claim is authorised by approval of this feature design.
Implementation commits remain local; the last pushed feature commit is the plan
`c0ee7bc`. Task 10 does not authorise a push.

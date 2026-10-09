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

Backgrounding and link loss invalidate timers. Returning to the foreground
must reconcile current machine state and fresh telemetry before restoring
automatic control; never execute an overdue resume. An ARMED state by itself
does not prove the machine is paused. Late callbacks from an old attempt
cannot affect a new run.

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

## Isolation and scope

Worktree: `custom-overflow-v1`, branch `feat/custom-overflow-v1`, based on
`origin/integration/2.1.0` at `d0f60dd`.

This session owns the brew/provider/controller/recorder and graph/ladder pause
changes. The parallel slot session owns its assignment model, persistence,
screen and library/context entry. Coordinate Recipe, backup and Machine changes
before either session edits shared surfaces.

No new PR, main merge, additional automated review round, deployment or hardware
claim is authorised by approval of this feature design.

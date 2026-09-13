# Brew continuity polish — design

Status: approved
Branch: `m4-watch-it-brew`
Target: version 1.5.1 build 7

This release addresses three issues observed after build 6:

1. the live brew ladder loses a few pixels at its bottom edge and can make a
   small corrective scroll when the active stage changes;
2. the agitation wave stretches vertically on recipes whose shorter stage
   count produces taller rung bars; and
3. backgrounding the app immediately releases Bluetooth, so briefly switching
   apps loses an active brew.

The implementation is a targeted correction to the existing ladder, rung, and
shared-machine boundaries. It does not redesign the brew screen or add a
general-purpose background task.

---

## 1. Account for the trace-to-ladder gap

`app/brew.tsx` measures the full flexible `YStack` that contains the trace and
ladder. That measured height includes the stack's `$3` gap, but
`allocateBands()` currently treats all of it as drawable trace-or-ladder
height. The allocation therefore overstates the usable space by the gap.

The live screen will use one numeric `BREW_BAND_GAP` constant for both:

- the `YStack` gap between `BrewTrace` and `BrewStageLadder`; and
- the amount removed from `flexHeight` before calling `allocateBands()`.

The constant is 13 points, the current value of Tamagui's `$3` space token.
Using the same value for rendering and arithmetic prevents the two from
drifting. The usable height passed to the allocator is clamped at zero.

`library/brew/bands.ts` remains responsible only for sharing already-usable
height between the trace, bars, and rung gaps. `BrewStageLadder` remains the
authority on real measured overflow. No two-pass per-rung measurement or
arbitrary bottom padding is introduced.

This leaves the ladder viewport itself unchanged while ensuring its planned
content no longer consumes space occupied by the inter-band gap. A ladder that
fits remains centred and non-scrolling, so changing its active stage cannot
produce the small reveal scroll seen in build 6.

## 2. Tile a fixed-period agitation wave

`BrewStageRung` keeps the approved 11-point agitation column and the existing
before/after placement. The mark remains contained within `barHeight`, so it
never changes rung height.

The current SVG maps one 14-point wave onto every bar height with
`preserveAspectRatio="none"`. That stretches the wavelength when a short recipe
receives tall bars.

The replacement uses one continuous path whose geometry is generated in the
same coordinate space as the rendered bar:

- width remains 11 points;
- each half-wave advances 7 vertical points;
- identical cubic segments repeat until they cover `barHeight`;
- the SVG view box height equals `barHeight`;
- the SVG clips the path at its top and bottom edges.

Short bars therefore show fewer cycles and tall bars show more cycles. The
wavelength, stroke width, colour, slot width, placement, and accessibility
description do not vary with rung height. There are no discrete asset
breakpoints and no vertically scaled path.

## 3. Give active brews a background connection lease

`hooks/useMachine.ts` continues to own the shared connection's AppState policy.
The current polite-disconnect rule remains the default: when the app enters
`background` outside a brew, it immediately releases the machine's single BLE
connection slot and reconnects on a later foreground transition only if this
handler released it.

An active brew is the narrow exception. The shared machine keeps its existing
connection when the app backgrounds in any of these phases:

- `waking`
- `sending`
- `readyToStart`
- `armed`
- `pressPlay`
- `grinding`
- `pouring`
- `bypass`
- `settling`

One exported machine-layer predicate defines this set. `Machine` uses it for
its internal brewing state, `useMachine` uses it for the background lease, and
the brew screen uses it for running controls and the wake lock. This removes
the current risk that three lifecycle decisions drift onto different phase
lists.

`holdLinkAcrossAppState()` tracks whether the app is backgrounded and subscribes
to machine phase changes as well as AppState changes:

1. `inactive` remains ignored because iOS emits it for transient system UI.
2. On `background`, a connected inactive machine is released exactly as today.
3. On `background` during an active brew, the connection and subscriptions are
   retained and no reconnect flag is set.
4. While backgrounded, the first terminal phase releases the retained
   connection exactly once.
5. Returning to the foreground during the brew keeps the existing `Machine`
   instance and performs no reconnect.
6. Returning after this handler released a connection follows the existing
   bounded reconnect behavior.

The cleanup returned by `holdLinkAcrossAppState()` removes both its AppState
subscription and its machine-phase subscription.

## 4. Enable iOS central-role background delivery

Normal iOS suspension does not reliably deliver Core Bluetooth delegate events
to a foreground-only app. The iOS app will therefore declare:

```json
"UIBackgroundModes": ["bluetooth-central"]
```

under `expo.ios.infoPlist`.

This allows Core Bluetooth to wake the suspended app for central-role events,
including characteristic notifications and connection changes, while the
active brew lease is held. The app does not declare `bluetooth-peripheral`, run
a timer, scan continuously, or perform unrelated background work.

The `react-native-ble-manager` plugin's current `modes` option is not consumed
by the installed plugin version. The stale `"modes": []` entry will be removed
so `app.json` does not imply that the plugin owns this configuration.

Because this changes native Info.plist configuration and
`runtimeVersion.policy` is `appVersion`, the app version advances from 1.5.0
to 1.5.1. EAS remote app-version management and the production profile's
`autoIncrement` produce build 7 when the release is built.

## 5. Failure behavior and limits

The lease prevents an intentional lifecycle disconnect; it does not disguise
real transport failure. Bluetooth being disabled, the machine moving out of
range, another genuine disconnect, or a force-quit continues through the
existing `lostContact` behavior.

The app will not replace the `Machine` or reconnect into an in-flight brew.
Doing so could attach the live recorder to a machine whose current run state is
unknown.

iOS process restoration after the operating system terminates the app is out
of scope. Supporting that would require Core Bluetooth state preservation,
restoring the central manager and peripheral subscriptions, and reconstructing
the live brew owner. This release guarantees continuity for ordinary app
switching and suspension while the process remains available, not continuity
after process death.

If a terminal phase arrives while backgrounded, disconnect is best-effort and
idempotent. A transport that has already disconnected remains on the existing
loss path rather than being treated as a successful terminal cleanup.

## 6. Tests

Focused automated tests will cover:

- the live screen subtracting the exact rendered trace-to-ladder gap before
  allocation;
- band allocation preserving its current floors, caps, and overflow behavior
  once it receives usable height;
- an edge-fitting ladder remaining fully visible and making no active-stage
  scroll;
- agitation paths using the same 7-point half-period at short, medium, and tall
  bar heights;
- taller agitation marks adding repeated segments rather than scaling one
  segment;
- unchanged before, after, both, and no-agitation placement and accessibility;
- idle backgrounding still disconnecting immediately;
- every active brew phase retaining the connection in background;
- a terminal phase while backgrounded disconnecting exactly once;
- foregrounding an active retained brew neither reconnecting nor replacing the
  machine;
- the existing foreground retry behavior after a lifecycle release;
- cleanup removing both lifecycle subscriptions.

After focused tests, the implementation must pass the repository's typecheck,
lint, full Jest suite, and Expo Doctor checks.

Physical-device validation is required because simulators cannot validate the
BLE lifecycle. On an iPhone connected to a real xBloom machine:

1. start a multi-stage brew;
2. switch to another app through several stage notifications;
3. return and confirm phase, stage, trace, and elapsed state remained
   continuous;
4. background the app through brew completion and confirm the connection is
   released afterward;
5. background outside a brew and confirm the existing immediate release and
   foreground reconnect behavior;
6. inspect short and tall recipes to confirm the ladder bottom is visible and
   agitation wavelength is constant.

## 7. Out of scope

- reconnecting or restoring a brew after process termination;
- a time-based background grace period;
- keeping Bluetooth connected while no brew is active;
- changing BLE frames, parsing, machine phase transitions, recorder storage,
  NFC behavior, or recipe serialization;
- redesigning the ladder, trace, or brew-screen layout beyond the gap
  accounting and wave rendering described above.

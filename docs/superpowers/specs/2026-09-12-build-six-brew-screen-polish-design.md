# Build 6 brew-screen polish — design

Status: approved
Branch: `m4-watch-it-brew`
Target: version 1.5.0 build 6

Build 6 combines four related brew-screen refinements: keep the display awake
while a commanded brew remains actionable, apply the revised agitation copy,
replace the oversized agitation marker, and stop short ladders from clipping or
moving when the active stage changes.

The machine refresh and first-ENJOY timing fixes are already committed
separately in `12fa286`.

---

## 1. Keep the display awake during an actionable brew

The display stays awake while the brew phase belongs to the existing `RUNNING`
set:

- waking,
- sending,
- ready to start,
- armed,
- waiting for the machine's play button,
- grinding,
- pouring,
- bypass,
- settling.

This starts the wake lock as soon as the app begins commanding the machine,
rather than waiting for water to move. It releases on completion,
cancellation, failure, lost contact, leaving the screen, or any other phase
outside `RUNNING`. The finished summary does not keep the display awake.

A small brew-screen-only component owns Expo's `useKeepAwake` hook. The
component mounts only while the phase is in `RUNNING`, which preserves the
Rules of Hooks and lets unmounting perform the matching cleanup. The brew
screen decides whether the component exists; the machine and recorder layers
remain unaware of display policy.

`expo-keep-awake` becomes an explicit SDK-pinned dependency. It is currently
present only as a transitive Expo dependency, which is not a supported import
contract for application code.

## 2. Apply the revised agitation copy

The three agitation descriptions in `constants/brewCopy.ts` change to match the
approved edits in `docs/copy.md`:

- `Agitates the bed before pouring.`
- `Agitates the bed after pouring.`
- `Agitates the bed before and after pouring.`

The copy document is the user's source edit and must not be reverted or
rewritten as part of applying it.

## 3. Replace the agitation glyph and notch with a contained wave

The current marker combines a glyph above the rung with a vertical notch
through it. Its overhang changes the clearance a rung needs, and the
before-pour variant was previously easy to hide against the filled pour.

The replacement is the approved compact wave:

- a smooth vertical oscillation,
- centred in its gap,
- no taller than the rung's `barHeight`,
- no overhang above or below the pills,
- the same state-derived colour as the current marker.

Before-pour agitation occupies a narrow gap immediately before the solid pour
pill. After-pour agitation occupies the seam between the solid pour and the
hatched wait. A stage with both settings shows both waves. A stage without a
wait still places the after marker immediately after the pour and before lane
slack.

The wave is part of `BrewStageRung`, because that component owns segment
composition and agitation placement. It does not alter the business model,
segment timing, lane scale, or accessibility sentence.

Containing the marker within `barHeight` removes agitation from vertical layout
arithmetic. `rungGap` can therefore describe spacing between rows rather than
clearance for an ornament.

## 4. Make measured overflow authoritative

The ladder already measures its viewport and content. Those measurements,
rather than the stage-count prediction from `allocateBands`, become the final
authority on whether it may scroll.

The stage-count prediction remains an initial hint so an obviously long ladder
does not flash once as non-scrollable before layout completes. Once both
measurements exist:

- content that fits remains centred and non-scrollable;
- content taller than the viewport becomes top-aligned and scrollable;
- short ladders never move merely because the active stage changed.

This directly covers the reported three-rung case: agitation cannot increase
row height, and a ladder whose measured content fits has no active-stage scroll
behavior at all.

## 5. Reveal only the clipped part of an active rung

For a genuinely overflowing ladder, stage changes retain automatic tracking,
but no longer send every active rung near the top.

`BrewStageLadder` records each rung's measured top and height, the viewport
height, and the current scroll offset. When the active index changes:

1. do nothing if the ladder does not overflow;
2. do nothing if the active rung is already fully visible;
3. if its top is clipped, scroll upward only enough to reveal its top;
4. if its bottom is clipped, scroll downward only enough to reveal its bottom;
5. keep a small, stable inset where the content bounds permit it.

The target is clamped to the content's valid scroll range, so the first and last
rungs cannot be pulled beyond their natural bounds. Movement remains animated
because it follows a discrete stage transition, not continuous brew telemetry.

This is deliberately not a virtualized-list rewrite. Recipe stage counts are
small, the existing ladder must also render into auto-height exports, and
replacing it would add gesture and measurement complexity without improving the
reported behavior.

## 6. Existing call sites

The live brew screen uses the bounded, measured ladder and receives the new
minimal reveal behavior.

The finished summary and history/export views receive the same contained wave.
Their `fill={false}` ladders remain content-sized and non-scrolling; no
viewport-following logic runs there.

No NFC, BLE protocol, card serialization, brew-state transition, recorder, or
database behavior changes.

## 7. Tests and device validation

Component tests will cover:

- before, after, both, and no-agitation placement;
- equal rendering for before and after marks;
- a wave whose height is contained by `barHeight`;
- after-agitation remaining before lane slack when no wait exists;
- unchanged accessibility descriptions;
- no scrolling when measured content fits;
- no movement when an overflowing ladder's active rung is fully visible;
- the minimum upward or downward movement required to reveal a clipped rung;
- clamping at the first and last rung;
- wake-lock activation for every `RUNNING` phase;
- wake-lock release for terminal phases and unmount.

Copy tests continue to guard the central copy table.

Physical-device validation is still required. React Native Testing Library does
not perform native layout and cannot prove pixel clipping, animated scroll
position, or operating-system sleep behavior. Device checks must include short
one- and three-stage recipes, a genuinely overflowing recipe, before-only,
after-only, and both agitation settings, and completion/cancellation paths that
release the wake lock.

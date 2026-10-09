# 2.1.0 delivery design

Approved through the release-planning conversation on 2026-10-09.
This is a coordination design. Each new feature still needs a bounded,
code-level implementation plan; this document does not invent those APIs.

## Scope and baseline

Use `integration/2.1.0` as the integration base, not a concurrent main checkout.
The release change ledger is `docs/release-2.1.0-changes.md`.

| Package | Remaining work |
|---------|----------------|
| 1: #191 review close-out | Release regression testing only. |
| 2: Papercuts | Native narrow-screen and large-text regression checks. |
| 3: Scroll affordance | Native scroll/fade and pinned-action checks. |
| 4: Beanconqueror GA | Confirm released-app support, then remove the Labs gate last. |
| 5: Drawer reveal | Persisted cadence, both trays and reduced-motion checks. |
| 6: Quick edits | Cross-surface and brew/history regression checks. |
| 7: Hardware spike | Remaining pause/recovery measurements and slot recovery checks before release. |
| 8: Pause/resume | Software stabilisation now; hardware verification later. |
| 9: Custom overflow protection | Implement the approved automatic v1 described below. |
| 10: Three-slot writer | Implement and ship, superseding issue-only/deferred scope. |

The #199 follow-ups are integrated but need device coverage: account-import
action, invalid-temperature feedback/import clamping, stopped-brew history,
connection retry/deadline, diagnostics, and dose/ratio on all four surfaces.

## Hardware is a release gate, not a development gate

The user cannot access the machine during this session. Continue feature
design, implementation, scripted transport tests, persistence tests and UI
tests without it. Build a diagnostic spike only where a specific unresolved
question needs evidence; do not claim that a spike was executed.

Do not delay software development for acknowledgement latency or overshoot
measurements. Do not introduce adaptive timing or a model of overshoot in v1.
Keep unverified behaviour and guessed constants visible in the release ledger.
Physical verification remains required before shipping.

## Package 9: approved automatic overflow v1

### Policy

Protection is opt-in for a configured cup threshold and applies to
`CUP_TYPE.OTHER`, not OMNI. Keep the threshold out of NFC card bytes.

A threshold crossing triggers an automatic PAUSE. Reuse the machine's
acknowledged pause path rather than treating an outgoing command as proof of
stopped water. The existing 40515 notification is machine confirmation;
there is no user-confirmation dialog or required tap.

The interval is selectable as 15, 30 or 45 seconds, default 15. It is the
interval between resume checks, not a maximum pause duration. Start it when
the pause is confirmed:

1. At the interval boundary, inspect a fresh cup reading.
2. At or above the threshold: remain paused for another selected interval.
3. Below the threshold: automatically resume and re-arm for the next crossing.
4. Missing or stale reading: remain paused, explicitly explaining why.

Normal operation requires no manual interaction. A timed check must never
resume a manual pause. Cancellation, terminal events and connection loss
invalidate outstanding automatic actions. Do not blindly restart timers or
resume after reconnect; recovery semantics need their own feature design.
Do not claim the feature guarantees that a cup cannot overflow.

### Presentation and recording

The live UI explains that the cup threshold caused the pause and shows time
until the next check. Explain an extension if the cup remains above the
threshold, and distinguish unavailable readings from a measured full cup.

The graph marks automatic-pause intervals on its real-time axis, including
extensions. Preserve those intervals and their automatic reason on the
record so recorded graphs do not lose the explanation after the brew.

The ladder keeps its current stage and delivered progress in place and marks
it as automatically paused, not pending or stalled. It must also work during
the bypass. Manual pause and automatic overflow pause remain distinguishable.

### Bounded follow-on design

The feature-specific design must settle threshold units/range, configuration
placement and persistence, reading freshness, noise rejection and threshold
crossing semantics. It must cover duration changes during a run, manual
interventions, pause/resume command failures, backgrounding/reconnection,
and pause interval storage/backup/sample-retention behaviour.

These are engineering decisions still to resolve, not permission to silently
choose arbitrary defaults or make the normal path require manual confirmation.

## Package 10: three-slot writer

Ship the agreed shape from #62:

- Dedicated A/B/C screen owns the complete batch.
- Recipe context menu opens it prefilled; library markers expose assignments.
- Prepare and validate all three blobs before the first frame.
- Warn that a write replaces all three slots and leaves the machine in EASY.
- Reuse the existing recipe encoder and hardware-proven flags nibble 0x02.
- Track last-written snapshots honestly: BLE provides no slot read-back.
- An incomplete batch needs completion/recovery, not a success-shaped fallback.

Its feature-specific design must address unknown existing contents on first
use, per-machine drafts versus written snapshots, edited/deleted recipes,
durable incomplete-batch recovery, lost acknowledgements, final completion
evidence and exclusion of concurrent brew/write operations.

Do not assume a native write completion proves receipt. All three slot
acknowledgements use the same code, and a lost acknowledgement cannot be
handled by pretending the next slot is known. A physical recovery check must
use three distinct ratios and include grinder-on/off recipes.

## Delivery order and ownership

| Stage | Work | Prerequisite |
|-------|------|--------------|
| A | Specify overflow v1 and slot writer in separate bounded designs. Define shared machine-operation exclusion and recovery ownership. | Approved scope; no hardware prerequisite. |
| B | Stabilise pause software and implement overflow domain policy/recording. Build slot assignment model, persistence and screen in parallel against the agreed transport contract. | Relevant feature design approved. |
| C | Complete slot transaction/recovery and overflow live UI, graph and ladder. Add scripted failure and lifecycle tests. | Shared machine contract established; pause path ready for overflow. |
| D | Integrate serially, updating the ledger after each package. Generate the full release checklist from it. | Feature-local checks pass. |
| E | Execute device/hardware checks when available; repair defects and rerun affected regressions. | Integrated build. |
| F | Complete Beanconqueror GA only after released-app verification, then perform final release validation. | External capability confirmed; required device gates cleared before shipping. |

Independent work may overlap stages; these are dependencies, not a demand to
finish every task in a row before starting the next row.

### Parallel sessions

Use separate worktrees branching from the same agreed integration commit.
Merge completed work serially into the integration branch.

**Pause/overflow owner:** `hooks/useBrewRun.ts`, `hooks/useLiveBrew.tsx`,
`app/brew.tsx`, brew recording, pause policy and graph/ladder pause surfaces.

**Slot owner:** new slot domain/persistence/screen work, recipe-context entry
and library markers. Shared recipe/backup changes require explicit coordination.

**Machine boundary:** one named owner for `library/machine/Machine.ts`,
`protocol.ts` and shared command exclusion. The slot session and overflow
session must not independently edit the machine state machine. Land shared
contracts first, then consume them from independent feature work.

**Verification session:** native layout/accessibility and existing-package
regression checks; route findings to owners instead of competing lifecycle edits.

Do not run competing physical BLE clients or shared-device builds. Serialise
heavy full-suite runs on this machine. Do not launch parallel agents or open
new PRs merely because the work can be split; session execution is a separate
decision.

## Evidence and release closure

Scripted tests should cover automatic pause confirmation, repeated extensions,
fresh below-threshold resume, rearming, missing data, manual pauses, cancellation,
late callbacks, link loss and record/backup compatibility. Slot tests should
cover complete prevalidation, ordering, acknowledgement/failure paths,
durable recovery, staleness and concurrent-operation exclusion.

Physical checks include pause acknowledgement latency, valve-stop overshoot,
background/link-drop recovery, pre-pause flat-water/stall behaviour, short-tank
stopping, connection retry without duplicate brewing, slot batch interruption,
distinct slot ratios, grinder flags and brewing after the EASY side effect.

Native checks include both platforms, large text, screen readers, pause
graph/ladder state and recorded/exported graph presentation. Genuine-card NFC
checks require real cards and devices.

Keep package status, changes, automated evidence and unverified hardware claims
in the ledger throughout. No store build, deployment, main merge or additional
automated review round is authorised by this coordination design.

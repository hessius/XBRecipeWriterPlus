# 2.1.0 change ledger

This is the source for the full release-testing checklist, not a claim that
device testing is complete. Update it whenever release scope or behaviour changes.

## Final slot/overflow consolidation

PR #209 was merged into `integration/2.1.0` as `3c6f0230` after its single
Copilot review finding was fixed in `01d2897` and CI passed. Pending manual
pause suppression now rolls back on native rejection and expires at the
existing acknowledgement deadline; confirmed manual pauses remain manual.
No additional automated review round was requested.

PR #207 finalization implements the previously disconnected production port:
exclusive machine operations, actual connection identity/generation,
bounded notification-driven receipts/completion, durable recovery reservations
and shared-owner installation before link opening. Raw dosage is validated
before Recipe construction, and the overwrite/EASY warning remains beside the
write/recovery action. An app-side pre-send slot refusal now terminates and
releases the rejected live-run owner without sending, reconnecting, recording
a brew or replaying after recovery.

The shared Machine merge retains both slot exclusion and overflow pause
provenance/request tokens. Parent validation of combined head `6df753d6`:

| Command | Result |
|---------|--------|
| `npm run typecheck` | Passed, no diagnostics. |
| `npm run lint` | Passed; 0 errors, 27 warnings. |
| `npx expo-doctor` | Passed; 21/21 checks. |
| `npm test -- --ci` | 710 suites passed; 13,640 tests passed, 24 skipped, 13,664 total; two snapshots passed. Both iOS and Android, 579.735 seconds. |

Logs are session artifacts `release-combined-{typecheck,lint,doctor,full}.log`.
The finalization received independent local reviews; fixes cover setup-time
disconnects, superseded notification subscriptions and refused brew ownership.
The original three #207 automated review findings remain fixed; no second
automated review was requested.

The heads of #202, #204, #205 and #206 are already ancestors of the release
branch through `6c1cdb97`, `d06d249e`, `27a2f931` and `61521aaa`, respectively.
GitHub refuses to retarget an already-included PR with no new commits.
Closing those superseded PRs references their existing release integration;
it does not merge their main-targeted PRs or change `main`.

This is completed software integration, not a release safety sign-off.
Physical BLE/NFC and native layout/accessibility gates below remain open.
Slot dispatch/receipt/completion budgets are unmeasured software choices;
code-only delayed receipts and unknown recovery still require firmware
evidence. No native configuration, app version or backup version changed.

## Initial integration

`integration/2.1.0` starts at main `9dbe819` and includes the original four PRs:
#204, #205, #206 and prototype #202. Main and the original PR branches remain
unchanged. Including #202 here is permission to test it together, not approval
to ship its unmeasured hardware behaviour.

The only merge conflicts were between #205 and #206. Both the provider's
attempt timestamp and owner-held quick-edit metadata are retained, together
with both sets of brew-screen test fixtures.

## Original release packages

The package numbers refer to
`docs/superpowers/specs/2026-10-07-release-2-1-0-design.md` on
`docs/release-2-1-0-design`. Its original state column predates implementation.

| Package | Current state | Change and later testing focus |
|---------|---------------|--------------------------------|
| 1: #191 review close-out | On main | Blank bean fields no longer defeat meaningful fallbacks; helper renamed and documentation corrected. Check blank origin with a real country, false decaffeination, and zero elevation in a handoff. |
| 2: Papercuts | On main via #194 | History batch says SEND; example placeholders are marked as examples; placeholder contrast adjusted; editor calls the dripper Brewer; detail row has a separate RATE column and large-type fallback; missing observed grind falls back to a dashed recipe grind. Check narrow screens, large text, actual versus requested grind, and history selection. |
| 3: Scroll affordance | On main via #201 | Finished summary has a bottom fade only while more content remains. Check short/long summaries, end-of-scroll clearing, and pinned judgement/export controls. |
| 4: Beanconqueror GA | Not implemented; external release gate | `beanconquerorHandoff` remains a Labs setting, off by default. Remove it only after confirming Beanconqueror's released app recognises the handoff URL. Do not infer availability from a development build. |
| 5: Drawer reveal | On main via #195 | Both trays taught with persisted cadence, retirement, rearming and reduced-motion handling. Check first launch, repeated launches, manual opens, and changed action signature. |
| 6: Quick edits | On main via #196/#197 | One-brew dose, ratio, grind and temperature offset; shared home/editor panel; changed keys only; comparison metadata in history. Check reset-to-baseline, discard-on-close, saturation, tea without ratio, grinder-off baseline, and the single editor BREW action. |
| 7: Hardware spike | Initial questions answered via #198 | 40518 pauses, 40524 resumes without restarting; 8019 instead abandons the recipe for a water pour. Easy Mode batch behaviour documented. Pause latency, overshoot and reconnect survival still require measurement below. |
| 8: Pause/resume | Prototype integrated from #202; hardware-blocked | Pause is acknowledged rather than inferred from ARMED; resume is optimistic; pause time is recorded, backed up and excluded from held-time/delay; paused readings are omitted; ladder/bypass remain in place. |
| 9: Custom overflow protection | Tasks 1-10 software-complete; hardware/native release gates open | Protect the dripper using estimated retained water (brew water minus collected coffee), not receiving-cup weight. Explicit positive per-recipe limit beside OTHER controls; check every 15/30/45 seconds, default 15. Extend while high/unavailable; resume and re-arm when freshly below. Manual RESUME overrides protection for that brew. Background/link loss disable it for the run, without automatic restoration. UI, ladder, full/compact/history/export/compare traces and persisted intervals are wired. This is not validated overflow safety. |
| 10: Easy Mode slots | Production software wired; hardware/native verification pending | Persistent machine-bound A/B/C snapshots, whole-set replacement, coffee only, no bypass. The shared owner installs the bounded port before exposing Machine or opening its link. The route uses the actual connected identity and installed port, with busy/serial guards, persistent overwrite copy and strict raw-dose validation. Receipts and recovery remain subject to the hardware gates below. |

## Additional 2.0 feedback and integration changes

| Source | Change | Later testing focus |
|--------|--------|---------------------|
| #203 / #199 | Account import action pinned below the list | Many account recipes, selection, safe area, empty selection. |
| #203 / #199 | Editor exposes out-of-range values before BREW/WRITE; SAVE remains possible | Celsius/Fahrenheit, stage bounds, invalid saved recipe, unchanged volume AUTO FIX. |
| #203 / #199 | A started brew returning to ARMED becomes a terminal stopped brew and enters history | Reproduce short-tank/manual-stop endings on hardware; do not invent a cause or offer retry after spending the dose. Distinguish explicit pause from an unexpected ARMED transition. |
| #203 / #199 | One relink/retry for a link failure before grinding | No retry for machine refusals, radio unavailable, or a brew that already started; no duplicate dose. |
| #204 | Imported stage/bypass temperatures rounded and clamped to 39–99 C | BP-like 211 F import, both machine models, tea, bypass, already-valid temperatures. Documentation now correctly identifies boiling point as 100 C. |
| #205 | Native connect sequence bounded to 10 seconds; nonblocking timeout cleanup | Native connect/disconnect hangs, late completion, successful connection and retry. Hardware report has not been reliably reproduced. |
| #205 | Failure offers an attempt-scoped diagnostic log | Retry excludes the previous attempt; reopening via mini bar retains the original attempt boundary; clipboard and toast; no copy control during running/done. |
| #206 | Dose/ratio context on live, finished, historical and Story Card surfaces | Adjusted run versus saved recipe, absent historical fields, recipe deletion/rename, tea/bypass semantics, narrow screens and large text. Use recorded inputs, never a measured-water ratio. |
| #206 | Independent remembered DOSE & RATIO Story Card toggle and measured fitting | Other toggles unchanged; recipe line declined last; fit refusal never writes a hidden preference; exported image includes the line when budgeted. Actual VoiceOver/TalkBack and native image/layout checks remain open. |
| Integration | Attempt timestamp and quick-edit context coexist in the owner snapshot | Reopen an adjusted brew after navigation, then retry; diagnostic boundary and comparison badges must both remain correct without a second brew. |

The version is already 2.1.0 via #200. This integration does not introduce
another version bump or deploy anything.

## Existing Copilot review audit

No additional automated review round was requested. Thread resolution state
is not proof of whether a finding was fixed.

| PR | Existing findings | Verified disposition in this branch |
|----|-------------------|-------------------------------------|
| #202 | Bypass start overwritten on resume; paused ladder/bypass projection reset | Fixed in `ae17d3a`, present in the merged head `befb236`. Recorder stamps bypass start once; run projection reads `paused.was`. Regression tests cover bypass timing, paused stage/drawdown, and now the paused bypass rung explicitly. |
| #204 | Helper comment said boiling point was a clean 98 C | Corrected to 100 C in this integration branch; behaviour unchanged. The original PR branch still has the comment typo. |
| #205 | Cleanup disconnect could defeat deadline; design described a nonexistent assignment guard and screen-local timestamp | Fixed in `3dd7da9`: timeout cleanup is not awaited and has a hanging-disconnect regression; design explains Promise.race and shared snapshot timestamp. Remaining test-description reference to a local ref corrected here. |
| #206 | No inline findings | No finding fixes required; native visual/accessibility verification remains outstanding. |
| #209 | Sole automated finding, `discussion_r4234333876`: failed/unconfirmed manual PAUSE permanently suppresses overflow policy | Verified against `81823385` and fixed in the local follow-up below. Native failure rolls back only its pending request; unconfirmed suppression expires at the existing ACK deadline. Confirmed manual pauses never grant automatic resume ownership. |

Original review threads and PR metadata were not changed.

### #209 manual PAUSE lifecycle follow-up

The ordinary `useBrew.pauseBrew` catch previously resolved after recording a
native write error, leaving `OverflowController.manualPaused` latched while
the machine continued pouring. A silent Machine ACK timeout had the same
effect. Both paths are reproduced through the real `useBrewRun`, `useBrew`
and `Machine`, with only native transport substituted.

Manual suppression now starts before sending and has a controller-held deadline
using the existing **unmeasured 3-second `PAUSE_ACK_MS`**. Ticks expire it without
readings; raw notifications and phases also enforce the inclusive deadline.
Failure/expiry clears crossing evidence, requiring a new sustained high before
one automatic PAUSE. Rollback is generation-scoped: old native rejections cannot
clear newer manual/automatic requests or revive a cancelled, disposed,
background-disabled or lost-contact run.

An ordinary confirmed pause remains manually owned until resume. Taking over an
already confirmed automatic hold has no pending deadline, and an overflow-kind
confirmation arriving while a manual request is pending cannot reclaim automatic
resume ownership. An ordinary paused phase arriving after expiry also blocks
policy and relinquishes a newer automatic request. Neither confirmation nor a
late native rejection schedules an automatic RESUME.

API changes are limited to `useBrew.pauseBrew(onFailure?: () => void)` and
`OverflowController`/`useOverflowProtection.manualPause` returning an optional,
request-scoped rollback closure. The ordinary hook retains `Promise<void>` and
its existing visible `brewer.error` path; the public run/UI pause action remains
parameterless. Machine/Transport, native configuration, dependencies and slots
implementation are unchanged.

| Command | Observed result, both Jest projects |
|---------|------------------------------------|
| Controller + real hook regressions, verified red | Exit 1; 4 suites failed, 36 tests failed, 196 passed. Failures show missing expiry/rollback and ignored subsequent high readings. |
| Same controller + real hook paths, green | Exit 0; 4 suites passed, 232 tests passed. |
| Controller/policy + four hooks + lifecycle selector below | Exit 0; 14 suites passed, 458 tests passed, no skipped tests/snapshots. |
| Brew route selector below | Exit 0; 2 suites passed, 68 tests passed, 194 deselected, no snapshots. |
| `npm run typecheck` | Exit 0; no diagnostics. |
| Changed-code ESLint below | Exit 0; zero errors, one existing `useBrewRun` exhaustive-deps warning. |
| `git diff --check` | Passed. |

```bash
npm test -- --ci --runTestsByPath \
  library/brew/__tests__/OverflowController.test.ts \
  library/brew/__tests__/overflowPolicy.test.ts \
  hooks/__tests__/useBrew.test.ts hooks/__tests__/useBrewRun.test.ts \
  hooks/__tests__/useOverflowProtection.test.ts hooks/__tests__/useLiveBrew.test.tsx \
  hooks/__tests__/overflowLifecycle.test.tsx
npm test -- --ci --runTestsByPath app/__tests__/brew.test.tsx \
  -t 'Pause|Resume|pause|transport error|custom overflow protection'
npm run typecheck
npx eslint library/brew/OverflowController.ts \
  library/brew/__tests__/OverflowController.test.ts \
  hooks/useBrew.ts hooks/useBrewRun.ts hooks/useOverflowProtection.ts \
  hooks/__tests__/useBrew.test.ts
git diff --check
```

Final targeted evidence is **526 passing tests**. The direct controller guards
cover exact expiry via tick/reading/phase, fresh crossing evidence, superseded
manual/automatic generations, late ordinary/overflow confirmation, existing
automatic ownership and terminal/disabled states. Real-hook scripts additionally
prove native failure visibility, no-40515 expiry, confirmed ordinary manual
ownership and two manual writes whose older rejection must not clear the newer.
Self-review found no outstanding issue in this scoped patch.

No expensive full-suite/Doctor/CI run or further GitHub review round was made;
the parent owns final integration and push after validation. This follow-up is
software evidence only, not hardware safety verification. All existing physical
and native release gates remain open. Logs are session artifacts
`pr209-manual-red.log`, `pr209-manual-green.log`, `pr209-manual-targeted.log`
and `pr209-manual-app.log`.

## Release gates still open

1. Measure real 40515 acknowledgement latency before choosing PAUSE_ACK_MS
   (currently a 3-second guess).
2. Verify water overshoot after PAUSE before release. V1 can be built without
   adaptive timing or an overshoot model; do not promise overflow prevention.
3. Verify pause through backgrounding, BLE loss and reconnect, plus machine-button
   interventions, missed acknowledgements and terminal/fault events.
4. Capture a stream where water was already flat before PAUSE. The recorder's
   stall anchor can precede the pause. Software now subtracts confirmed interval
   overlap from that anchor, and the scripted lifecycle reports no pause-as-stall;
   verify against a real stream rather than treating scripts as physical evidence.
5. Exercise short-tank stopping and pre-brew connection retry/timeout on hardware.
6. Complete native dose/ratio and Story Card layout, export, VoiceOver and
   TalkBack checks, including narrow widths and large text.
7. Confirm Beanconqueror's public release before package 4. Package 9 is in
   planned 2.1.0 scope under the approved fixed-check-interval v1 design.
8. Wire the implemented three-slot production port at shared-owner construction
   and restore incomplete reservations before allowing other machine operations. Verify
   real receipt correlation and fresh final completion, not native dispatch or
   idle. Physical checks must use three distinct ratios, grinder on/off,
   interrupted A/B writes, lost acknowledgements, restart/reconnect and ordinary
   brewing after the machine changes to EASY. Establish safe recovery for an
   unknown receipt or missing final completion before enabling production writes.
9. Check the Easy Mode screen and library markers on native iOS/Android:
   narrow widths, large text, fixed marked shelf tile geometry, pinned action,
   VoiceOver/TalkBack and recipe-picker accessibility isolation.
10. Verify the brewer/cup and overflow behaviour of stored slots before release.
    The documented coffee blob does not encode cup type or phone-side overflow
    policy; do not imply those protections carry over to standalone EASY brewing.

Package 10 was promoted from issue-only/deferred to an actual 2.1.0 feature
by the user's decision on 2026-10-09. This supersedes the older release design
and #62's deferral wording. Its approved bounded design is
`docs/superpowers/specs/2026-10-09-easy-mode-slots-design.md`; uncertain receipt
and final-completion recovery remain deliberately blocked pending verified
machine evidence.

## Package 10 software and shared-owner handoff

The original domain/UI package was implemented in `feat/easy-mode-slots` based on
`origin/integration/2.1.0` at `d0f60dd`; not merged into this integration branch.
That original package did not edit the shared Machine/protocol or Recipe/backup.
The separate production-port finalization on `integration/finalize-easy-mode-slots`
adds Machine/Transport exclusion and connection scoping; Recipe/backup and UI
remain unchanged. It does not integrate or merge the separate overflow #209.

`easy_mode_slots` uses the existing app database and BLE device ID. Drafts,
last-written snapshots and incomplete journals survive relaunch and source
recipe deletion. Library changes require an explicit snapshot update; markers
distinguish draft and last-written letters, including repeated assignments.
Machine-bound slot records are intentionally excluded from recipe backups.
All three frames are prepared before A. The journal persists before each send
and after each receipt; only three receipts plus fresh final completion promote
the set. A failed replacement retains the previous last-written set.

The dedicated `/easyMode` screen has entries in the machine panel, library
recipe actions and editor recipe actions. The picker reads `allRecipes()`,
not the current search/shelf answer. Full sets require an explicit replacement
choice; incomplete sets lock assignment and display the frozen recovery set.
Incoming route JSON and persisted snapshots share `readSlotRecipe`, which
validates raw dosage against the existing coffee DOSE bounds before the
forgiving Recipe constructor can invent a default. Grinder, brewer, stages and
prepared bytes are also validated. Legacy Recipe migrations are unchanged.

`installMachineSlotPort(machine, sharedSlotDatabase())` now implements
`SlotPort` / `SlotLease`. `sharedMachine()` installs it while constructing the
shared Machine, **before exposing the singleton or calling openLink, not in a
route effect**. It retains the port/database across navigation and passes it
through `useMachine` to `useEasyModeSlots`. The route uses `machine.slotIdentity`,
not the remembered setting, for
the actual peripheral and freshly reported serial. A known serial cannot be
replaced by null. Installation and reconnect read the per-device journal
synchronously; ordinary operations are refused while that journal remains.
Connection setup alone may send the existing handshake (8100) and info probe
(40521), so a reserved machine can reconnect and identify itself. Public probes
are not a bypass during an attempt or incomplete journal.

The shared owner seeds and forwards AppState through `machine.setAppState`
before its existing background/link handling. Any non-active or unknown state
blocks acquisition and invalidates the attempt; only `background` gives back an
idle link. Returning to the foreground reconnects where the existing lifecycle
requires it but never replays slot frames. The AppState listener belongs to the
singleton, not a route or each hook consumer.

Settings forget checks both actual and remembered device IDs before disconnect
or cleanup, notifies on an incomplete-write refusal and preserves the records.
An offline route may display last-known assignments, but cannot send without
the actual connected identity. A conflicting known serial, running brew or held
brew disables WRITE and recovery with an explicit explanation.

The complete A/B/C overwrite and EASY-mode warning lives with the bottom action,
outside the card scroll. Its bounded action scroll keeps warning and button
together when large text outgrows the space; neither gets a truncating fixed
height or extra confirmation tap. Native layout/accessibility verification
remains a gate, not something the renderer's style assertions can prove.

`SlotOperationError` prevents ambient `useBrew` configuration effects from
crashing or treating exclusion as a reason to reconnect and retry. Refused
settings updates notify, are not queued behind slot completion, and are applied
only on an explicit new brew. The local setters send no native commands.
Settings refresh refusals also notify rather than disappearing in a catch.
The single live RunOwner and pause/resume signatures are unchanged.

Acquisition rejects busy operations immediately. A standalone console command
also blocks slot acquisition until a fresh terminal machine state or reconnect:
native acceptance alone cannot prove a grind/water action ended. The entire
brew upload/preflight and its pacing gaps are excluded, as are held/paused
brews. Pause/resume retain their existing SEND promise semantics; the surgical
entry guards must coexist with #209's later pause-provenance integration.
Slot traffic reuses the whole-frame Write Without Response, budget checks and
accepted-send log, with the existing 2,000 ms gap and no retries. A stale session
is refused before journal creation; reconnect explicitly rather than assuming
the machine still accepts it.

`release(false)` removes attempt observers/timers but leaves durable recovery
exclusion. Recovery sends only remaining immutable frames from a known boundary;
SAVING_SLOTS is the only non-terminal machine state allowed for that recovery.
An in-flight slot or all receipts without final completion stays blocked.
An optional `SlotLease.assertCurrent` checks invalidation immediately before
durable mutations, including atomic promotion. Safe release requires no journal.

Real Machine + fake transport + real SQLite tests now exercise receipt parsing,
early ACK/final buffering, hung native dispatch, exact timeout thresholds and
pacing, duplicates/refusals, stale callbacks, identity, restart/reconnect,
background invalidation, contention and persistence failures. They do **not**
prove firmware ordering, replay semantics or physical storage.

**UNMEASURED software limits:** native dispatch (including its pacing gap),
receipt after native resolution, and final completion each have a separate
15,000 ms budget. Early receipts never bypass a hung native dispatch. Final
completion must be a fresh attempt-scoped SLOTS_SAVED (0x25), not cached state,
idle or three native successes. The existing 8-second brew ACK timer is not
slot timing evidence.

**Firmware-order assumption and hardware gate:** byte 9 is the command status
(C2 ACK), not a slot ID. Serialization and one outstanding receipt reject
observable out-of-window/duplicate receipts, but a delayed duplicate A arriving
while B is outstanding is intrinsically indistinguishable from B's receipt.
No software test clears that ambiguity. Native callback generations reject old
registrations/known old peripheral scopes; the wire also carries no connection
epoch to identify a same-peripheral old packet delivered as a new native event.
Verify these ordering/lifecycle assumptions on actual iOS/Android BLE hardware.

Full release testing should cover both iOS and Android. NFC regressions require
physical devices and genuine cards; neither simulator proves card safety.

## Approved development order

The software-first order and parallel-session boundaries are recorded in
`docs/superpowers/specs/2026-10-09-release-2-1-0-delivery-design.md`.
Hardware is unavailable during this session. Build software and scripted
machine tests now; do not treat their results as physical verification.

Custom overflow v1 must caution at enable/configuration and protected-brew
initiation: keep XBRW++ open because leaving/closing the app disables protection.
Use persistent inline copy, not a confirmation or extra tap. Include phone
locking/backgrounding in coverage; internal app navigation must preserve the
live owner's protection. Foreground recovery must not issue stale resumes.

The detailed package 9 design is
`docs/superpowers/specs/2026-10-09-custom-overflow-v1-design.md`.
It corrects earlier receiving-cup wording: collected coffee normally rises
during drain-down; the dripper's retained-water estimate can fall.

## Automated validation

Validated locally on 2026-10-09, rather than relying only on the individual
PRs' green checks:

- Full iOS/Android run: 672 suites passed, 12,304 tests passed, 24 skipped,
  two snapshots passed.
- Final owner-metadata and paused-bypass regression edits: four project suites,
  92 tests passed. These ran after the full suite started.
- Typecheck passed, including after the final test edits.
- Repository lint: zero errors, 26 existing warnings; final changed-code lint
  also passed.
- Expo Doctor: 21/21 checks passed.

These are local integration results, not a GitHub CI run on this branch or
device verification. No integration PR has been opened.

Package 10's isolated worktree was additionally validated on 2026-10-09:

- Final bounded feature and affected regression run: 34 iOS/Android project
  suites passed, 1,002 tests passed and four existing tests skipped. Selectors
  include the slot model/store/writer/hook, route/screen/surface tests and
  affected home, editor, card, tile, shelf, selection and machine-panel tests.
- Whole-worktree typecheck passed.
- Changed-code lint passed with zero errors and one pre-existing
  `no-require-imports` warning in the home test harness.
- `git diff --check` passed; the shared Machine/protocol and Recipe/backup
  files remain unchanged from the integration base.

At that isolated feature checkpoint, no full release suite, new Expo Doctor run,
native build or physical device verification was performed for package 10.
Owner/UI wiring was still open then; the finalization below closes the software
wiring gate only. All physical/native release gates above remain open.

The single Copilot review on #207 found three software issues, reproduced on
both Jest platforms and corrected: recipe-context preparation now claims
navigation before assigning a slot; the Easy Mode route hides from
accessibility while the global brew-note sheet is open; and marked shelf tiles
retain `TILE_HEIGHT`, using a one-line visual marker with the full status in
their accessibility label. No second review round was requested.

Bounded production-port finalization was validated separately on 2026-10-09:

```bash
npx jest --runTestsByPath \
  library/slots/__tests__/{machineSlotPort,slotWriter,SlotDatabase,slotModel}.test.ts \
  library/machine/__tests__/{Machine,Machine.pause,Machine.bypass,Transport,protocol,frameLog}.test.ts \
  hooks/__tests__/{useMachine,useMachine.persistence}.test.ts --runInBand --silent
npm run typecheck
npx eslint library/machine/{Machine,Transport,protocol,frameLog}.ts \
  library/machine/__tests__/Transport.test.ts library/slots/{slotWriter,machineSlotPort}.ts \
  library/slots/__tests__/machineSlotPort.test.ts constants/machine.ts
git diff --check
```

All 24 project suites and 704 tests passed (both platforms); typecheck,
changed-file lint and whitespace checks passed. The new production-port suite
contains 47 cases per platform, using real Machine and SQLite rather than
resolving mocked leases. Test-first failures were observed for the missing
port/receipt decode and subsequent lifecycle refinements. Self-review tightened
pre-journal invalidation, the final durable promotion boundary, pacing cleanup,
standalone-action exclusion and stale native identity/handshake completion.
No agents, full release suite, native build, deployment, push or merge were used.
All hardware gates, code-only ACK ordering assumptions and parent wiring remain
explicitly open; these counts are software evidence only.

Owner/UI finalization was validated separately on 2026-10-09:

```bash
npx jest --runTestsByPath \
  library/slots/__tests__/{machineSlotPort,slotWriter,SlotDatabase,slotModel}.test.ts \
  library/machine/__tests__/{Machine,Machine.pause,Machine.bypass}.test.ts \
  hooks/__tests__/{machineSlotOwner.test.tsx,useEasyModeSlots.test.ts,useMachine.test.ts,useMachine.persistence.test.ts,useBrew.test.ts,useBrewRun.test.ts,useLiveBrew.test.tsx} \
  app/__tests__/easyMode.test.tsx \
  components/__tests__/{EasyModeSlots,MachineSection,slotSurfaces}.test.tsx \
  --runInBand --silent
npm run typecheck
git diff --name-only -- '*.ts' '*.tsx' | xargs npx eslint
npx eslint hooks/__tests__/machineSlotOwner.test.tsx
git diff --check
```

All 36 project suites and 874 tests passed across iOS and Android. Typecheck
passed; changed-code lint had zero errors and the two existing
`no-require-imports` warnings in the machine-section test harness. The new
shared-owner suite uses real Machine, the installed port, actual notifications
and real SQLite, including the route's A/B/C completion, busy/serial guards,
non-active startup, background/drop, navigation, restart reservation, explicit
recovery and settings-forget refusal. Test-first failures reproduced both
raw-dose paths, displaced warning, missing owner wiring, ambient lock crash,
unsafe brew retry, retargeting during acquisition and hidden settings refusal.

The earlier independent production-port review selector covered **450 tests**,
not the initially reported 492. That review run, the 704-test port finalization
above and this 874-test owner run are distinct evidence sets.

The three automated #207 review fixes are preserved. No new automated review
round, agent, push, main merge, deployment, native build or full release suite
was used. The new domain/UI/owner changes received local self-review; another
independent review has not been performed. App version, native configuration,
NFC/Recipe serialization and BACKUP_VERSION remain unchanged.

Production software wiring is complete, but the 15-second budgets remain
unmeasured and code-only receipt ambiguity/unknown-receipt recovery still
require hardware evidence. No automatic reset or replay was added. Parent
integration and its full release validation remain separate: integration/2.1.0
is checked out in another worktree, excluded from this task.

### Bounded P2: slot-refused live attempt ownership

Follow-up on `integration/finalize-easy-mode-slots`, based on merge head
`de2ea66e` (including reviewed overflow #209 at `3c6f0230`). An incomplete
slot journal correctly refused configuration with `SlotOperationError`, before
`Machine.brew` or any brew frame. But `useBrew` only published an error: the
provider's synthetic `waking` attempt never ended. Recovery could clear the
reservation without clearing that phantom owner, so later explicit starts were
ignored and neither CANCEL nor mini-bar dismissal could retire it.

`useBrew` now reports that specific refusal to its attempt owner, including the
explicit PRO retry entry and the existing preflight retry's final catch.
`useBrewRun` checks the machine and run generation, stops its recorder without
emitting, cancels/disposes its overflow controller and timer, unsubscribes its
phase listener, and publishes an **app-local** `failed/blocked/busy` snapshot
with the original recovery instruction. This uses the existing visible refusal,
retry and dismissal UI; it never changes `Machine.phase` or writes a history row.
Later hardware phases cannot revive that refused attempt, and a retired
callback cannot end the next explicit generation.

The durable journal and transport exclusion remain authoritative until safe
recovery. Recovery sends only its stored slot frames, and clearing the journal
does not replay rejected settings or brew commands. The next explicit start
applies current configuration and sends exactly one recipe/commit. No provider
generation bump or automatic retry was added to the refusal/recovery path.
Existing preflight recorder/controller replacement and manual-pause failure
rollback from #209 are preserved.

Seven new cases run on each platform: ordinary and overflow-configured
refusal/recovery, both start entries against an independently running real
Machine, and stale callback delivery after a new explicit generation. The
provider integration uses real `useBrew`, `useBrewRun`, `useLiveBrew`,
`useMachine`, the installed slot port and SQLite stores. It checks zero refused
attempt traffic/reconnects, terminal/dismissible ownership, no recording even
when another real brew subsequently finishes, released controller listeners
and intervals, continuing reservation/busy exclusion, atomic stored slot
completion, no implicit replay, and one later real `8001`/`8002` sequence.
The existing slot suites retain the three-receipts-plus-SLOTS_SAVED atomic gate.

Test-first runs reproduced eight `waking` failures across both platforms.
Removing only the PRO-entry refusal callback separately reproduced four more
`waking` failures; restoring it passed. Final targeted validation:

```bash
npx jest --runTestsByPath \
  hooks/__tests__/{machineSlotOwner.test.tsx,useBrew.test.ts,useBrewRun.test.ts,useLiveBrew.test.tsx,useMachine.test.ts,useMachine.persistence.test.ts,useOverflowProtection.test.ts,useEasyModeSlots.test.ts} \
  library/slots/__tests__/{machineSlotPort,slotWriter,SlotDatabase,slotModel}.test.ts \
  library/machine/__tests__/{Machine,Machine.pause,Machine.bypass,Transport}.test.ts \
  --runInBand --silent
npm run typecheck
npx eslint hooks/useBrew.ts hooks/useBrewRun.ts hooks/useOverflowProtection.ts \
  hooks/__tests__/machineSlotOwner.test.tsx hooks/__tests__/useLiveBrew.test.tsx
git diff --check
```

**32 project suites / 1,016 tests passed**, both iOS and Android, no skips or
snapshots (24.884 s). The narrow provider selector passed 12 executions; the
generation callback adds two more in the combined run. Typecheck and whitespace
passed; changed-code lint has zero errors and the existing `openRecorder`
exhaustive-deps warning. Logs are session artifacts `slot-owner-refusal-red.log`,
`slot-owner-pro-refusal-red.log`, `slot-owner-refusal-green.log` and
`slot-owner-refusal-targeted.log`. Local self-review found no unresolved software
finding in this bounded fix. Prior feature checkpoints/counts above are retained,
not superseded by these narrower checks.

No agents, other worktrees, push, PR, main changes, deployment or merge were used.
Machine frame bytes, timing budgets, recovery protocol, native version and
approved design/specification documents are unchanged. The full parent
integration gate and previously listed physical/native release gates remain open.

## Custom overflow v1 completion (Task 10)

Implemented locally from head `67990e1` in the specified `custom-overflow-v1`
worktree on `feat/custom-overflow-v1`. Tasks 1-9 had already been reviewed.
Task 10 added the real controller/Machine/provider/run/recorder/visible-status/
SQLite lifecycle script; strengthened old-owner retry and terminal waiting-state
guards; checked all interval choices against independent card/BLE fixtures; and
extended Story chart-height invariance to 120/393/600-point widths.

Two tightly coupled consumer bugs were reproduced before fixing them:
the mini-bar discarded pause/bypass metadata and displayed Grinding during a pause;
live DELAY included confirmed pause time after resume. The compact trace now shares
the live interval/bypass extent at its existing 86 x 34 size, and live delay
subtracts pause overlap before drawdown while retaining genuine delay.
No new height, colour literal, dependency, native/version change or backup-version
bump was introduced.

The complete injected-clock script confirms at 1.7 s, extends at 16.7 s for high
water and 31.7 s for unavailable data, resumes at 46.7 s after fresh 46/46.5 s
below-limit pairs, requests a second pause at 50/50.5 s, confirms at 50.7 s, and
disables visibly on user RESUME at 52 s. Late events/ticks add no automatic action.
Exactly two intervals survive the single terminal write, SQLite stream sweep,
backup and restore: 700-45,700 ms and 49,700-51,000 ms, relative to first water at
1 s. There is no pause-as-stall; rounded total pause time remains 46 seconds.
History/capture/Story/compare tests retain their own record metadata after recipe
deletion or stream expiry, never reconstructing a trace from the current recipe.

The chosen software policy is freshness **1,000 ms**, channel skew **250 ms**,
sustained high/low crossing **500 ms**, and host publication **250 ms**.
All are **unmeasured software choices**, not validated safety margins. The existing
3-second `PAUSE_ACK_MS` is also unmeasured. Resume remains the existing optimistic
transport path. The spec records inclusive boundaries, confirmed interval epochs,
first-water conversion and same-`runId` preflight ownership replacement for both
protection and recorder.

### Task 10 commands and results (before the final drawdown fix)

These full-suite/Doctor results remain valid evidence for the prior Task 10
head, before `49e8558d` changed finished/history delay arithmetic. They are not
a full validation of the latest head. The parent rerun after the final
drawdown-pause follow-up is recorded below. The narrow follow-up itself did
not repeat the full suite or the Story layout sweep.

All commands ran serially using the repository's existing Jest worker pool and
both projects. Read-only process checks found no other Jest/tsc/Doctor validation
processes before heavy launches; no other process was stopped.

| Command | Final observed result |
|---------|-----------------------|
| Combined targeted selector below | Exit 0; 78 project suites passed, 3,080 tests passed, 0 failed/skipped, 0 snapshots. 116.813 s. |
| `npm run typecheck` | Exit 0; `tsc --noEmit`, no diagnostics. |
| `npm run lint` | Exit 0; 0 errors, 27 warnings (25 require-import warnings, one existing unused Pour, one run-hook exhaustive-deps warning). |
| `npm test -- --ci` (post-fix full run) | Exit 0; 692 suites passed, 13,196 tests passed, 24 skipped, 13,220 total; 2/2 snapshots passed. Both iOS and Android. 333.025 s. |
| `npx expo-doctor` (after full run) | Exit 0; 21/21 checks passed, no issues. |
| `git diff --check` | Passed. |

```bash
npm test -- --ci --runTestsByPath \
  app/__tests__/brew.test.tsx app/__tests__/brewCompare.test.tsx \
  app/__tests__/brewRecord.test.tsx app/__tests__/editRecipe.test.tsx \
  components/__tests__/BrewStageLadder.test.tsx components/__tests__/BrewStageRung.test.tsx \
  components/__tests__/BrewSummary.test.tsx components/__tests__/BrewTrace.test.tsx \
  components/__tests__/CompareTrace.test.tsx components/__tests__/LiveBrewBar.test.tsx \
  components/__tests__/OverflowSection.test.tsx components/__tests__/OverflowStatus.test.tsx \
  constants/__tests__/brewCopy.test.ts \
  hooks/__tests__/useBrew.test.ts hooks/__tests__/useBrewRun.test.ts \
  hooks/__tests__/useLiveBrew.test.tsx hooks/__tests__/useOverflowProtection.test.ts \
  hooks/__tests__/useRecipeEditor.overflow.test.ts hooks/__tests__/overflowLifecycle.test.tsx \
  library/__tests__/BrewDatabase.pauseIntervals.test.ts library/__tests__/Recipe.card.test.ts \
  library/__tests__/Recipe.persistence.test.ts library/__tests__/RecipeDatabase.migration.test.ts \
  library/__tests__/backup.test.ts \
  library/brew/__tests__/BrewRecord.test.ts library/brew/__tests__/BrewRecorder.test.ts \
  library/brew/__tests__/OverflowController.test.ts library/brew/__tests__/brewShape.test.ts \
  library/brew/__tests__/compare.test.ts library/brew/__tests__/overflowConfig.test.ts \
  library/brew/__tests__/overflowPolicy.test.ts library/brew/__tests__/pauseIntervals.test.ts \
  library/brew/__tests__/stalls.test.ts \
  library/machine/__tests__/Machine.pause.test.ts library/machine/__tests__/blob.test.ts \
  library/brew/__tests__/storyCard.test.ts \
  components/__tests__/BrewSummary.storyScale.test.tsx components/__tests__/BrewStoryCard.test.tsx \
  components/__tests__/BrewStoryCard.storyScale.test.tsx
```

Earlier full attempt, before the final live-delay regression/fix: 691 suites
passed, one failed; 13,189 tests passed, one failed, 24 skipped; 2 snapshots passed.
The sole failure was iOS `HomeScreen bean filters > applies a chosen value,
narrows the library, and keeps removable chips`, a `waitFor` sheet timeout in
untouched `app/__tests__/index.beanFilters.test.tsx`. Its isolated rerun
(`npm test -- --ci --runTestsByPath app/__tests__/index.beanFilters.test.tsx`)
passed both project suites and all 12 tests (0 skipped/snapshots). No unrelated
fix was made. The required full run after the real live-delay fix passed, as above.

TDD evidence: mini-bar wiring test initially failed twice (one per platform;
22 other tests passed); final targeted coverage is green. Live-delay selector
initially failed all 6 cases; after the fix all 6 passed with 252 tests deselected
by `-t 'excludes a confirmed'`. A test-harness purity lint error was corrected
before final validation, without suppressing the lint rule.

Passing tests are not warning-free: final targeted output contains 4 `console.warn`
and 99 `console.error` blocks; full output contains 215 and 2,522 respectively.
These include existing native-module/react-test-renderer, animation/act and
intentional error-path diagnostics; they are not Jest test failures. Counts are
log blocks, not an ESLint warning count or a claim of native correctness.
Verbose logs and the literal selector list remain in session artifacts, not the
repository (`task10-targeted-final.log`, `task10-typecheck-final.log`,
`task10-lint-final.log`, `task10-full-final.log`, `task10-doctor-final.log`).

### Final drawdown-pause arithmetic regression follow-up

#### Final parent validation

After the bounded final quality review approved the drawdown fix and its
screen/export regressions, the parent ran these commands serially against
`f5ceb004`, with no concurrent Jest/typecheck process present:

| Command | Observed result |
|---------|-----------------|
| `npm run typecheck` | Exit 0; no diagnostics. |
| `npm run lint` | Exit 0; 0 errors, 27 warnings. |
| `npx expo-doctor` | Exit 0; 21/21 checks passed. |
| `npm test -- --ci` | Exit 0; 692 suites passed; 13,222 tests passed, 24 skipped, 13,246 total; 2/2 snapshots passed. Both iOS and Android, 321.853 s. |

This full run includes the Story height sweep and supersedes the earlier
full-suite result for the completed implementation. Logs remain in session
artifacts: `overflow-parent-typecheck.log`, `overflow-parent-lint.log`,
`overflow-parent-doctor.log`, and `overflow-parent-full.log`.
Hardware and native release gates below remain unverified.

Production fix `49e8558d` is unchanged by this test-only follow-up. The
counterexample has a 30-second plan, sample-relative `drawdownAt = 40,000 ms`,
one overflow interval `40,700-55,700 ms`, and completion at `60,000 ms` with
`pausedSeconds = 15`. `startedAt` and `pouringAt` are distinct epoch timestamps;
neither is added to the interval or drawdown boundary. Recorded drawdown is
`(endedAt - pouringAt - drawdownAt) / 1000 = 20 s`, including that tail pause.
Subtracting drawdown from elapsed already cancels time after the boundary.
Only pause overlap **before** drawdown comes off DELAY:
`60 - 20 - 30 - 0 = 10 s`, not null. A `35,000-50,000 ms` straddling pause
has 5 seconds before the boundary and therefore DELAY 5 s, not null.

Eight new integration cases run on each platform (16 executions). They render
the real `BrewSummary`: live-to-done convergence and the finished image capture,
record-interval priority over a stale run view plus the run fallback, and
ordinary/history and full Story summaries with deleted or edited recipes.
The record's stored plan and intervals win over current recipe/configuration;
removing live configuration does not erase the finished figure. Full Story cases
also press Share, inspect DELAY inside the actual ViewShot subtree at the mocked
native capture call, and assert the PNG URI passed to sharing. These remain
rendered-tree/export-wiring checks, not native PNG or hardware verification.

Regression proof used `apply_patch` to temporarily replace **only** the two
finished/history helper callsites and their imports with the pre-fix total-pause
argument. With no test/helper changes, all 16 new executions failed on missing
DELAY (including independently selected ordinary and full Story panels), while
the 6 existing live-delay executions passed. The production callsites were
restored exactly; their final diff is empty.

```bash
npm test -- --ci --runTestsByPath \
  app/__tests__/brew.test.tsx app/__tests__/brewRecord.test.tsx \
  -t 'drawdown pause regression|excludes a confirmed'
npm test -- --ci --runTestsByPath library/brew/__tests__/brewShape.test.ts
npm run typecheck
npx eslint app/__tests__/brew.test.tsx app/__tests__/brewRecord.test.tsx
git diff --check
```

| Narrow follow-up check | Observed result, both Jest projects |
|------------------------|------------------------------------|
| Route selector with reverted callsites (red) | Exit 1; 4 suites failed; 16 failed, 6 passed, 472 deselected, 0 snapshots. |
| Same selector with restored callsites (green) | Exit 0; 4 suites passed; 22 passed, 472 deselected, 0 snapshots. |
| Existing `brewShape` helper suite | Exit 0; 2 suites passed; 74 passed, 0 skipped, 0 snapshots. |
| Typecheck | Exit 0; no diagnostics. |
| Changed-test ESLint | Exit 0; 0 errors, 1 existing require-import warning at `brewRecord.test.tsx:85`. |
| Diff whitespace and production restoration | Passed; no production-file diff. |

Targeted total: **96 passed** (22 route and 74 arithmetic tests). Green route
output retains 10 existing animation/act `console.error` blocks and no
`console.warn` blocks, not test failures. Logs are session artifacts named
`finalbugdrawdowndoublepause-red.log`, `finalbugdrawdowndoublepause-green.log`
and `finalbugdrawdowndoublepause-unit.log`. Latest full validation remains for
the parent; all physical/native release gates below remain open.

### Unverified release gates and persistence

Physical BLE hardware was unavailable. Firmware tare/retained-water behaviour
and ground absorption, raw scale availability/freshness while paused, ACK/valve
latency/overshoot, phone locking/background/reconnect and physical machine buttons
remain release gates. So do narrow UI/large text, VoiceOver/TalkBack, native iOS
queued announcements, recorded/export/Story/compare graph images, and genuine NFC
cards plus BLE bytes on real devices. Byte-for-byte fixture equality and simulated
screens are software evidence only; they do **not** prove actual safety.

Implementation and documentation are persisted in a local Task 10 commit with the
requested Copilot co-author trailer. Only plan `c0ee7bc` had been pushed; this task
does not push, create a PR/review, merge main, deploy, touch another worktree or
claim hardware verification.

# 2.1.0 change ledger

This is the source for the full release-testing checklist, not a claim that
device testing is complete. Update it whenever release scope or behaviour changes.

## Integration

`integration/2.1.0` starts at main `9dbe819` and includes all four open PRs:
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
| 9: Custom overflow protection | Approved v1; not implemented | Threshold-triggered automatic pause, with resume checks every 15/30/45 seconds (default 15). Extend while at/above threshold; resume and re-arm on a fresh below-threshold reading. Include live UI, graph intervals and ladder state. Hardware verification gates release, not development. |
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

Original review threads and PR metadata were not changed.

## Release gates still open

1. Measure real 40515 acknowledgement latency before choosing PAUSE_ACK_MS
   (currently a 3-second guess).
2. Verify water overshoot after PAUSE before release. V1 can be built without
   adaptive timing or an overshoot model; do not promise overflow prevention.
3. Verify pause through backgrounding, BLE loss and reconnect, plus machine-button
   interventions, missed acknowledgements and terminal/fault events.
4. Capture a stream where water was already flat before PAUSE. The recorder's
   stall anchor can precede the pause and include pause seconds after resume.
   This is a known residual requiring a real stream, not a verified fix.
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

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
| 9: Custom overflow protection | Tasks 1-10 software-complete; hardware/native release gates open | Protect the dripper using estimated retained water (brew water minus collected coffee), not receiving-cup weight. Explicit positive per-recipe limit beside OTHER controls; check every 15/30/45 seconds, default 15. Extend while high/unavailable; resume and re-arm when freshly below. Manual RESUME overrides protection for that brew. Background/link loss disable it for the run, without automatic restoration. UI, ladder, full/compact/history/export/compare traces and persisted intervals are wired. This is not validated overflow safety. |
| 10: Easy Mode slots | Promoted to implementation scope on 2026-10-09 | Ship a dedicated three-slot screen, recipe-context entry and library markers. Warn that every write replaces all three slots and leaves the machine in EASY. Slots are write-only, so last-written state must not imply read-back verification. Detailed design and implementation remain to be completed. |

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
   stall anchor can precede the pause. Software now subtracts confirmed interval
   overlap from that anchor, and the scripted lifecycle reports no pause-as-stall;
   verify against a real stream rather than treating scripts as physical evidence.
5. Exercise short-tank stopping and pre-brew connection retry/timeout on hardware.
6. Complete native dose/ratio and Story Card layout, export, VoiceOver and
   TalkBack checks, including narrow widths and large text.
7. Confirm Beanconqueror's public release before package 4. Package 9 is in
   planned 2.1.0 scope under the approved fixed-check-interval v1 design.
8. Implement and verify the three-slot writer. Prepare all three valid blobs
   before sending A; recover incomplete batches without pretending a sent frame
   proves storage; verify distinct ratios, grinder on/off, interrupted writes,
   reconnect and ordinary brewing after the machine changes to EASY.

Package 10 was promoted from issue-only/deferred to an actual 2.1.0 feature
by the user's decision on 2026-10-09. This supersedes the older release design
and #62's deferral wording; it does not resolve the detailed first-use,
acknowledgement-loss or persistence/recovery design.

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

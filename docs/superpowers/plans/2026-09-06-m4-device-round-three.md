# M4 device round three — implementation plan

Spec: `docs/superpowers/specs/2026-09-06-m4-device-round-three-design.md`
Issue: #93
Branch: `m4-watch-it-brew`

Twelve tasks. Each is committed separately. The gate for every task is
`npm run typecheck && npm run lint && npm test`, all green, plus a mutation
check where the task says so.

**House rules that bit us repeatedly last round — read these first.**

1. **Never assert a computed value against the constant that produced it.**
   `expect(gap).toBe(SEGMENT_GAP)` passes even when `SEGMENT_GAP` is mutated to
   0. Pin a literal.
2. **`react-native-svg` parses its props.** A colour prop arrives as
   `{payload: <int>, type: 0}` — compare with
   `expect.objectContaining({payload: processColor("#rrggbb")})`. A
   `fill="url(#x)"` arrives as `{brushRef: "x", type: 1}` — never `toBe` two of
   them, they are always distinct objects.
3. **RNTL performs no layout.** Every style prop can be asserted and still be
   wrong on screen. Where a task's real risk is layout, say so in the commit
   message rather than pretending a test covers it.
4. Components at module scope. Colour only from `constants/colors.ts`. No
   hand-written `useMemo`/`useCallback` — the React Compiler is on. Reading a
   ref during render is an ESLint **error** here.
5. `renderHook`, `render` and `fireEvent` are **async** in this codebase.

---

## Task 1 — The ladder is told whether it has room

**Files:** `components/BrewStageLadder.tsx`, its test, `app/brew.tsx`,
`app/brewRecord.tsx`, `app/__tests__/brewRecord.test.tsx`

`BrewStageLadder`'s non-scrolling branch currently returns:

```tsx
<YStack testID="ladder" flex={1} justifyContent="center">{rows}</YStack>
```

`flex: 1` resolves against a bounded parent. `app/brew.tsx` gives it one;
`app/brewRecord.tsx` does not — the ladder is inside an auto-height `View`
within a `ViewShot` — so the box is zero-height and centring piles the rungs on
top of each other.

**Add a required `fill: boolean` prop.** No default: both call sites must state
which case they are.

- `fill === true` → `<YStack testID="ladder" flex={1} justifyContent="center">`
  (today's behaviour).
- `fill === false` → `<YStack testID="ladder">` — no `flex`, no
  `justifyContent`. Content height.

The `scrolls` branch is unchanged; leave it exactly as it is.

Call sites: `app/brew.tsx:181` passes `fill={true}`, `app/brewRecord.tsx:272`
passes `fill={false}`.

**Tests.** Two, in the ladder's own test file:

- with `fill={false}` and `scrolls={false}`, the `ladder` node's flattened style
  has **no** `flex` and **no** `justifyContent`;
- with `fill={true}` and `scrolls={false}`, it has `flex: 1` and
  `justifyContent: "center"`.

Use `StyleSheet.flatten(getByTestId("ladder").props.style)`. Update every
existing call in both test files to pass `fill` — TypeScript will list them.

**Mutation check.** Make `fill={false}` return the `flex: 1` branch; the first
test must fail.

**In the commit message, say plainly** that RNTL cannot see layout, so these
tests pin the intent rather than the result, and the actual rendering is a
device check.

---

## Task 2 — `BrewSummary`, the one drawing of a brew

**Files:** new `components/BrewSummary.tsx` + test; `app/brewRecord.tsx`

Do **not** touch `app/brew.tsx` in this task — task 3 wires it in.

Extract from `app/brewRecord.tsx:234-292` (the `ViewShot` subtree) a
module-scope component:

```tsx
type Props = {
    recipeName: string;
    hasStream: boolean;
    samples: BrewSample[];
    stages: Pour[];
    accent: string;
    width: number;
    plannedSeconds: number;
    water: number;
    cup: number;
    seconds: number;
    activeIndex: number;
    stageWater: number[];
    stalls: Stall[][];
    /** True when the recipe is gone and no stage snapshot was kept. */
    stagesUnavailable: boolean;
};
```

It renders, in order: the trace (or the `NO TRACE KEPT` block), `BrewFigures`,
then the ladder in a `YStack marginTop="$3"` with `fill={false}` and
`scrolls={false}` — or the `Recipe deleted.` line when `stagesUnavailable`.

Keep the existing `styles.capture` background and padding **inside**
`BrewSummary`, since a `ViewShot` inherits neither from its ancestors. Raise the
padding so the PNG has a visible margin: `SCREEN_PADDING` currently, plus a
`CAPTURE_MARGIN = 12` on top of it. Keep `testID="brew-capture"` on that view so
the existing capture test still finds it.

The recipe name moves **inside** the summary, so the exported image is titled.
It is rendered with `DotMatrixText` (task 11 covers the on-screen title; here it
is dot-matrix from the start).

`app/brewRecord.tsx` becomes: fetch, compute, render `<ViewShot><BrewSummary
…/></ViewShot>`, then the two export buttons. Its existing tests must keep
passing unchanged apart from anything that asserted on the old title node.

**Tests** for `BrewSummary`: renders the trace when `hasStream`; renders
`NO TRACE KEPT` when not; renders the ladder when stages exist; renders the
deleted-recipe line when `stagesUnavailable`; the capture view's flattened style
has `padding` strictly greater than `SCREEN_PADDING` (**pin the literal**, do
not compute it from the constants).

---

## Task 3 — Export happens where you already are

**Files:** `app/brew.tsx`, `app/__tests__/brew.test.tsx`

The results state of the brew modal (`phase.name === "done"`, around
`app/brew.tsx:264`) currently offers `Export this brew`, which does
`router.push("/brewRecord?latest=1")`.

Replace that with the export controls themselves, acting on the view in place:

- Render the results through `BrewSummary` wrapped in a `ViewShot`.
- Offer `SAVE AS IMAGE` and `EXPORT THE DATA`, reusing the `shareImage` and
  `shareData` logic from `app/brewRecord.tsx`. **Lift that logic into a hook**,
  `hooks/useBrewExport.ts`, rather than copying it — it carries a
  double-press guard and a temp-file cleanup that must not be duplicated and
  allowed to drift. `brewRecord` uses the same hook.
- Delete the `Export this brew` action and the navigation.

`/brewRecord` stays reachable from history (`app/brewHistory.tsx:124`); do not
remove the route.

**Tests:** the done state shows both export labels and no longer shows
`Export this brew`; pressing `SAVE AS IMAGE` calls the capture once and twice in
quick succession still calls it once (the guard). Move the existing guard test
from the `brewRecord` suite into the hook's own test file if that is cleaner.

**Note for the implementer:** `useBrewExport` will want `try`/`finally` around
the temp-file cleanup. That causes a React Compiler bailout, which is accepted
in this repo (`useRecipeEditor` and `RestoreDialog` already do it). Do not
contort the code to avoid it.

---

## Task 4 — The refresh control waits as long as the machine may take

**Files:** `hooks/useRefreshRequest.ts`, its test, `components/MachinePanel.tsx`,
`app/index.tsx`

`askHowItIsDoing` may legitimately take ~12.2 s; `ASK_TIMEOUT_MS` is 6000, so
the control reports `NO ANSWER` while the machine is still answering.

Change the signature to `ask: () => Promise<boolean>` and drive the state from
the promise:

- `press()` → set `asking`, then `void ask().then(ok => …)`.
- resolves `true` → `idle`.
- resolves `false` → `noAnswer`, cleared to `idle` after `NO_ANSWER_MS` (keep
  4000).
- Guard against a resolution arriving for a **superseded** request: if the user
  presses again, an older promise settling must not overwrite the newer state.
  Tag each request with a monotonically increasing id and ignore stale
  resolutions.
- Delete `ASK_TIMEOUT_MS`. Add `ASK_BACKSTOP_MS = 20_000` — comfortably above
  the machine's ~12.2 s ceiling — as a bug net for a promise that never
  settles, and say in a comment that it is not part of the normal path.

`app/index.tsx`'s `refreshWater` already returns a promise but resolves to
`undefined`; make it `Promise<boolean>` returning whether the machine answered.

**Tests:** answering resolves to idle; a false resolution shows `noAnswer` then
returns to idle after `NO_ANSWER_MS`; a slow answer at 10 s still resolves to
idle and never shows `noAnswer` (this is the regression test for the reported
bug — it must fail against the old 6 s timer); a second press while the first is
in flight, with the first resolving late, leaves the newer state intact.

**Mutation check.** Reinstate a 6 s timeout that flips to `noAnswer`; the slow-
answer test must fail.

---

## Task 5 — Connected is not the same as having readings

**Files:** `components/MachinePanel.tsx`, its test

`MachinePanel` falls through to a final `else` whose copy is
`Not in range. It will reconnect by itself when it is.` whenever it is not
`connected`-with-vitals or `connecting`. A **connected** machine whose info blob
has not arrived lands there, and its `TRY NOW` calls `onConnect`, which does
nothing because the machine is already connected.

Add a branch **before** the final `else`:

```
status === "connected" && vitals === null
```

It says the machine is connected but has not reported yet, and offers the same
`RefreshButton` used by the readings branch — not `TRY NOW`. Wording is a copy
decision; use `CONNECTED. NO READINGS YET.` and add it to `docs/copy.md` in
task 12.

**Tests:** with `status="connected"` and `vitals={null}`, the out-of-range copy
is absent, `Try now` is absent, and the refresh control is present; the existing
disconnected-with-vitals and disconnected-without-vitals cases still show
`Try now`.

**Mutation check.** Remove the new branch; the first test must fail.

---

## Task 6 — The brew ends when the coffee does

**Files:** `library/machine/Machine.ts`, `library/brew/BrewRecorder.ts`,
`hooks/useBrewRun.ts`, `constants/machine.ts`, and their tests

The largest task. **Dispatch this one to the most capable model.**

`Machine.onEvent` maps `BREWER_STOP` (40511), `ENJOY` (40512) and `ENJOY_2`
(40513) all to `{name: "done"}`, so the recorder — which treats `done` as
terminal and unsubscribes — stops at the earliest of the three. The repo's own
captured trace has them at 178.0 s, 180.1 s and 186.4 s.

**Step 1, and it is a gate.** Before changing anything, write a test proving
today's behaviour: feed `BREWER_STOP` and assert the phase becomes `done` and
the recorder has stopped sampling. If that does **not** hold, stop and report —
the premise is wrong and the rest of this task is void.

Then:

- Add `{name: "settling"}` to `BrewPhase`, **non-terminal**.
- `BREWER_STOP` sets `settling`. `ENJOY_2` sets `done`. `ENJOY` sets `settling`
  **only if the phase is still `pouring`** — if we somehow miss `BREWER_STOP`,
  `ENJOY` is the next best entry into settling; if we are already `settling` it
  changes nothing, because it is a "coffee ready" beep rather than a state
  change.
- `BrewRecorder` keeps sampling through `settling` and stops on the first of:
  - the cup reading flat within `NOISE_FLOOR_ML` (0.5, from
    `library/brew/stalls.ts`) for `SETTLE_FLAT_MS`,
  - the cup reading falling by more than `NOISE_FLOOR_ML` from its peak — the
    cup was lifted,
  - `done`,
  - `SETTLE_CAP_MS` since entering `settling`.
- New constants in `constants/machine.ts`: `SETTLE_FLAT_MS = 4000`,
  `SETTLE_CAP_MS = 90_000`. Document why the cap exists — without it a quiet
  machine leaves a run that never ends.
- `endedAt` is stamped when settling finishes, so duration and cup total
  describe the coffee rather than the pour.
- `useBrewRun` must render `settling` sensibly; it is not `pouring` and not
  `done`. The status line should say the coffee is finishing draining.

**Tests:** settling is entered on `BREWER_STOP`, not `done`; `ENJOY` alone from
`pouring` also enters settling; samples arriving during settling are recorded; a
flat cup for `SETTLE_FLAT_MS` ends it; a falling cup ends it immediately;
`ENJOY_2` ends it; the cap ends it with no frames at all; `endedAt` reflects the
settle end, not `BREWER_STOP`.

**Mutation checks.** (a) Make `BREWER_STOP` set `done` again — the first test
must fail. (b) Remove the cap — the no-frames test must fail or hang; if it
hangs, that is the point, but make sure the test uses fake timers so it fails
fast instead.

**Say clearly in the commit message** that this rests on an unverified hardware
fact — that weight frames continue after 40511 — and that if they do not, the
behaviour degrades to waiting for `ENJOY_2`, which is still 8.4 s more brew than
today.

---

## Task 7 — A brew the machine ended early is not "off target"

**Files:** `library/brew/BrewRecord.ts`, `app/brewRecord.tsx` /
`components/BrewSummary.tsx` as needed, and tests

A mid-brew ratio change on the machine is not observable (established: no event,
no characteristic, and pour-start frames carry only an index). So do not infer a
cause — report the observation.

In `summarise()`, where the outcome is decided, add: when the machine reported
the brew complete and the water delivered is **materially** below the plan —
more than `ENDED_EARLY_ML = 15` short — the outcome is `endedOnMachine` rather
than off-target. Add the variant to the outcome type and give it copy:
`ENDED ON THE MACHINE`.

**Tests:** a brew 40 ml short of plan with a normal completion is
`endedOnMachine`; one 3 ml short is not; a cancelled brew is still `cancelled`.

**Mutation check.** Set `ENDED_EARLY_ML = 0`; the 3-ml test must fail. Pin the
literals in the tests — do not derive them from the constant.

---

## Task 8 — The agitation mark becomes a notch

**Files:** `components/BrewStageRung.tsx`, its test

Today the mark is a 10 pt spiral in `palette.dim` at `rung-agitation-after`,
placed after the segments **and** after the slack — the far right of the lane.

Move it to the water→wait seam and make it a notch:

- A vertical tick, 2 pt wide, extending `NOTCH_OVERHANG = 3` above and below the
  bar, in the accent colour (or the done colour for a finished stage).
- The spiral glyph above it, 11 pt, same colour.
- Positioned at the boundary between the last water segment and the first pause
  segment. It is drawn absolutely over the lane so it does not consume flex.
- `agitation-before` keeps its existing position at the start of the lane.
- Keep both testIDs.

A stage with no pause has no seam; put the after-mark at the end of the last
water segment in that case.

**Tests:** the after-notch is present and its rendered colour is the accent for
an active stage; it sits before `rung-slack` in the tree, not after it; a stage
with both before and after has two marks; **pin the notch colour with a literal
hex**, not with `accent`.

---

## Task 9 — The ladder budgets for the notch

**Files:** `library/brew/bands.ts`, its test

The notch overhangs the bar by `NOTCH_OVERHANG` above and below, so each rung
needs that much clearance or rungs will clip each other. `allocateBands` must
add `2 * NOTCH_OVERHANG` to the per-rung height it reserves.

Do this **after** task 8 so the real number is known. The risk is that the
ladder scrolls one stage earlier than it does today, undoing part of #88 — so
also assert the 12-stage case still does not scroll.

**Tests:** recompute the allocation table for 2/3/4/6/9/12 stages and pin the
new numbers as literals. Verify independently in node before trusting the
implementation, exactly as was done for #88.

---

## Task 10 — The mini player clears the rounded corners

**Files:** `components/BrewMiniBar.tsx`, its test

`BrewMiniBar` has `padding="$2.5"` and no bottom inset. It is mounted beside the
navigator, so it sits at the very bottom of the display and the corner radius
clips the close control and the trace.

Take `useSafeAreaInsets().bottom` and add it to the bar's bottom padding. Keep
the top and sides as they are.

**Test:** the bar's flattened style has `paddingBottom` at least
`TEST_INSETS.bottom` — and, per house rule 1, assert against the literal inset
from `test-utils/render.tsx`, not against the constant the component uses.

---

## Task 11 — Two small styling corrections

**Files:** `components/MachinePanel.tsx`, `app/brew.tsx`, their tests

- The expanded machine panel gains bottom padding so its last row is not flush
  against the edge of the header.
- The recipe title at `app/brew.tsx:154-155` is a plain `Text` at `fontSize=13`
  in `palette.dim`. Make it `DotMatrixText`, matching the rest of the screen.
  `DotMatrixText` delivers size through `style`, never as a host prop — so a
  test must read `StyleSheet.flatten(node.props.style).fontSize`.

**Tests:** the title node is the dot-matrix component; the panel's flattened
style has a non-zero `paddingBottom`.

---

## Task 12 — The copy catalogue grows

**Files:** `docs/copy.md`

`docs/copy.md` holds 577 catalogued user-facing strings — alerts, errors,
prompts. Add the descriptive strings: the pour-pattern explanations, the
agitation descriptions, and any other explanatory copy in `library/Pour.ts`,
`components/` and `app/`, each with a stable ID in the existing format.

Add the new strings introduced by this plan: `CONNECTED. NO READINGS YET.` from
task 5, the settling status line from task 6, and `ENDED ON THE MACHINE` from
task 7.

Documentation only — no test, no lint, no build.

---

## Order and dependencies

1 → 2 → 3 (2 needs 1's `fill`; 3 needs 2's component)
8 → 9 (9 needs the notch's real overhang)
4, 5, 6, 7, 10, 11 are independent.
12 last, so it can catalogue everything the other tasks introduced.

## Not covered here

Diagnosing why a mid-brew ratio change is invisible — that needs a packet
capture and belongs in its own issue.

## What only the device can settle

- Whether weight frames continue after `BREWER_STOP` (task 6). Everything in
  that task is contingent on it.
- Whether `SETTLE_FLAT_MS` and `SETTLE_CAP_MS` are well chosen.
- That the notch does not make a nine-stage ladder scroll (tasks 8 and 9).
- That the ladder renders correctly in the export (task 1) — the tests cannot
  see it.

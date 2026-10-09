# Custom Dripper Overflow Protection v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically pause an OTHER-dripper brew at an explicit retained-water limit, extend timed pauses until fresh telemetry permits resume, and explain the event in live UI and recorded graphs.

**Architecture:** A pure telemetry policy and a run-owned controller consume raw machine notifications independently of chart samples. Machine-confirmed pause phases carry their reason; the recorder owns interval timing, and existing record/summary/chart surfaces render those intervals. Recipe configuration and brew intervals persist through their existing JSON and SQLite boundaries.

**Tech Stack:** Expo SDK 57, TypeScript, React Native, Tamagui, react-native-svg, synchronous expo-sqlite, Jest's iOS/Android projects, asynchronous RNTL v14.

---

## Execution boundary

Approved spec:
`docs/superpowers/specs/2026-10-09-custom-overflow-v1-design.md`.

Branch `feat/custom-overflow-v1`, dedicated worktree
`/Users/jesperhessius/.config/superpowers/worktrees/XBRecipeWriterPlus/custom-overflow-v1`.
Do not switch or edit the concurrent checkout. No feature code is implemented
by writing this plan.

The slot session owns slot assignments, persistence, screen and recipe-context
entry. This session owns pause/overflow, recorder, live provider and pause
graph/ladder surfaces. Announce the following shared edits before executing:
`library/Recipe.ts`, `library/backup.ts`, `library/machine/Machine.ts`,
`hooks/useRecipeEditor.ts`, `app/editRecipe.tsx`. Do not independently invent a
second machine command-lock API; consume the slot session's agreed operation
boundary if one is introduced.

Hardware is unavailable. Never mark valve behaviour, scale/tare behaviour,
background BLE behaviour or recovery as verified by Jest.

Each task follows red test, smallest implementation, green targeted tests,
typecheck, commit. Include the Copilot co-author trailer in every commit.
Do not install dependencies until a selected validation command reports a
missing dependency. Do not add packages for this feature.

## File responsibilities

| File | Responsibility |
|------|----------------|
| `library/brew/overflowConfig.ts` (new) | Config types, interval vocabulary, strict validation and recipe applicability. |
| `constants/overflow.ts` (new) | Explicit software freshness/debounce/publish policy. Not animation timings. |
| `library/brew/overflowPolicy.ts` (new) | Paired raw telemetry, retained-water estimate and sustained crossing. No React/radio/timers. |
| `library/brew/OverflowController.ts` (new) | One run's automatic ownership, confirmation deadline, periodic checks, commands and invalidation. |
| `hooks/useOverflowProtection.ts` (new) | Subscribe controller to raw machine/phase/AppState events; publish tagged run state. |
| `library/brew/pauseIntervals.ts` (new) | Pause interval type/validation, duration subtraction and plot geometry. |
| `library/Recipe.ts`, `library/backup.ts` | Recipe JSON field and untrusted-backup validation. No card/BLE encoding changes. |
| `library/machine/Machine.ts` | Optional pause reason propagated from request to confirmed phase; clear failed/past request metadata. |
| `library/brew/BrewRecorder.ts`, `BrewRecord.ts` | Record confirmed intervals, keep pause observations out of stalls and retain closed intervals on cancellation. |
| `library/BrewDatabase.ts` | JSON interval column, migration, insert/restore/hydration. |
| `hooks/useBrewRun.ts`, `useLiveBrew.tsx` | Own one controller, manual override wrappers, snapshot/status and live interval publication. |
| `components/OverflowSection.tsx` (new) | Explicit recipe configuration, explanation and foreground caution. |
| `components/OverflowStatus.tsx` (new) | Accessible live status/next check/disabled/error state, no confirmation. |
| `components/BrewTrace.tsx`, `BrewStageLadder.tsx`, `BrewStageRung.tsx` | Interval bands and current-stage pause marker; do not relabel a pause as a stall. |
| `components/BrewSummary.tsx`, `app/brewRecord.tsx` | Historical and captured interval propagation. |
| `library/brew/brewShape.ts`, `compare.ts`, `components/CompareTrace.tsx` | Shared real-time extent and compare rendering. |
| `constants/brewCopy.ts`, `recipeHelp.ts` | User-facing copy and help, no em dashes. |
| `docs/release-2.1.0-changes.md` | Behaviour/evidence/hardware gates, coordinated with integration owner. |

## Concrete engineering policy

These values are chosen software policy, not hardware measurements:

```ts
// constants/overflow.ts
export const OVERFLOW_READING_MAX_AGE_MS = 1_000;
export const OVERFLOW_PAIR_MAX_SKEW_MS = 250;
export const OVERFLOW_CROSSING_MS = 500;
export const OVERFLOW_PUBLISH_MS = 250;
```

Freshness accepts the exact maximum age/skew boundary and rejects negative
ages. A sustained crossing needs at least two distinct paired observations
spanning 500 ms; polling cannot turn a single observation into a crossing.
Require the same sustained below-limit evidence before automatic resume.
At exactly the limit the brew stays paused.

Only `pouring` is eligible for initiating automatic pause. A manual/automatic
pause preserves its remembered phase; bypass and settling cannot initiate a
new protection pause. A below-limit check after the final stage still resumes
the existing pause, allowing the machine to progress normally.

Configuration is snapshotted at run start. Editing the saved recipe during a
brew does not change that run's threshold/check interval. Unconfigured recipes
do not allocate a controller timer or show the caution.

For v1, backgrounding disables automatic protection for the remainder of the
run, visibly. Returning does not re-enable it or execute overdue commands.
This is the conservative reconciliation outcome: manual RESUME remains
available if the machine is paused. A new brew gets a new controller. Never
claim uninterrupted background protection. Hardware may justify a richer
recovery policy in a later change, not a hidden assumption in this one.

## Task 1: Config and recipe persistence without encoder changes

**Create:** `library/brew/overflowConfig.ts`,
`library/brew/__tests__/overflowConfig.test.ts`.
**Modify:** `library/Recipe.ts`, `library/backup.ts`.
**Extend tests:** `library/__tests__/Recipe.card.test.ts`,
`library/__tests__/backup.test.ts`,
`library/__tests__/RecipeDatabase.migration.test.ts`.

- [ ] Add the config unit tests first:

```ts
import {isOverflowProtection, overflowFor} from "@/library/brew/overflowConfig";
import Recipe, {CUP_TYPE} from "@/library/Recipe";

it.each([15, 30, 45])("accepts interval %i with an explicit limit", checkSeconds => {
    expect(isOverflowProtection({retainedGrams: 100, checkSeconds})).toBe(true);
});

it.each([
    null, {}, {retainedGrams: 0, checkSeconds: 15},
    {retainedGrams: -1, checkSeconds: 15},
    {retainedGrams: NaN, checkSeconds: 15},
    {retainedGrams: Infinity, checkSeconds: 15},
    {retainedGrams: 10.5, checkSeconds: 15},
    {retainedGrams: 100, checkSeconds: 20}
])("rejects invalid config %#", value => {
    expect(isOverflowProtection(value)).toBe(false);
});

it("applies only to OTHER", () => {
    const recipe = new Recipe();
    recipe.overflowProtection = {retainedGrams: 100, checkSeconds: 15};
    for (const cupType of [CUP_TYPE.OMNI, CUP_TYPE.XPOD, CUP_TYPE.TEA]) {
        recipe.cupType = cupType;
        expect(overflowFor(recipe)).toBeUndefined();
    }
    recipe.cupType = CUP_TYPE.OTHER;
    expect(overflowFor(recipe)).toEqual(recipe.overflowProtection);
});
```

- [ ] Run `npx jest --runTestsByPath library/brew/__tests__/overflowConfig.test.ts`.
  Expect import/field failures before implementation.
- [ ] Implement the config module:

```ts
export const OVERFLOW_INTERVALS = [15, 30, 45] as const;
export type OverflowInterval = typeof OVERFLOW_INTERVALS[number];
export type OverflowProtection = {
    retainedGrams: number;
    checkSeconds: OverflowInterval;
};

export function isOverflowProtection(value: unknown): value is OverflowProtection {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const row = value as Record<string, unknown>;
    return typeof row.retainedGrams === "number"
        && Number.isSafeInteger(row.retainedGrams)
        && row.retainedGrams > 0
        && (row.checkSeconds === 15 || row.checkSeconds === 30 || row.checkSeconds === 45);
}

export function overflowFor(recipe: {
    cupType: number;
    overflowProtection?: OverflowProtection;
}): OverflowProtection | undefined {
    // OTHER is the hardware-stable 0x01 discriminator; avoid importing Recipe.
    return recipe.cupType === 0x01 ? recipe.overflowProtection : undefined;
}
```

Use a type-only import of `OverflowProtection` in Recipe and a value import of
the guard. The config module imports no Recipe, so the graph is cycle-free.
Add `public overflowProtection?: OverflowProtection;` with no default.
After legacy cup-type migration in the JSON constructor:

```ts
if (jsonRecipe.overflowProtection !== undefined) {
    if (!isOverflowProtection(jsonRecipe.overflowProtection)) {
        throw new Error("Invalid dripper overflow protection configuration.");
    }
    this.overflowProtection = {
        retainedGrams: jsonRecipe.overflowProtection.retainedGrams,
        checkSeconds: jsonRecipe.overflowProtection.checkSeconds
    };
}
```

- [ ] Add `overflowProtection: isOverflowProtection` to strict `RECIPE_FIELDS`,
  not droppable decoration. Test invalid backup config reports the field and
  does not silently enable/erase protection.
- [ ] Add JSON-round-trip and duplicate tests; absence remains absence for old
  JSON. Change cup type away from OTHER without erasing the saved config, but
  prove `overflowFor` suppresses it.
- [ ] Capture `recipe.getData(prefix)` before adding the config and assert
  byte equality afterward. Keep existing independent card fixtures unchanged.
  Prove the BLE blob has no new field or extra bytes.
- [ ] Run the four named test files plus `npm run typecheck`; commit.

## Task 2: Pure paired-telemetry policy

**Create:** `constants/overflow.ts`, `library/brew/overflowPolicy.ts`,
`library/brew/__tests__/overflowPolicy.test.ts`.

- [ ] Start with boundary tests:

```ts
import {pairedRetained, crossingAt, type Reading} from "@/library/brew/overflowPolicy";

const reading = (grams: number, at: number): Reading => ({grams, at});

it("estimates retained water without subtracting an assumed absorption", () => {
    expect(pairedRetained(reading(200, 1_000), reading(80, 1_000), 1_000))
        .toEqual({grams: 120, at: 1_000});
});

it("floors negative estimates, not missing telemetry", () => {
    expect(pairedRetained(reading(80, 1_000), reading(90, 1_000), 1_000)?.grams).toBe(0);
    expect(pairedRetained(undefined, reading(90, 1_000), 1_000)).toBeNull();
});

it("accepts exact freshness/skew bounds", () => {
    expect(pairedRetained(reading(200, 1_000), reading(80, 1_250), 2_000)).not.toBeNull();
    expect(pairedRetained(reading(200, 1_000), reading(80, 1_251), 2_000)).toBeNull();
    expect(pairedRetained(reading(200, 1_000), reading(80, 1_250), 2_001)).toBeNull();
});

it("cannot turn one pair into a sustained crossing by polling it", () => {
    const first = crossingAt(null, null, {grams: 120, at: 1_000}, 100, "above");
    const repeated = crossingAt(first.since, first.lastAt,
        {grams: 120, at: 1_000}, 100, "above");
    expect(repeated.sustained).toBe(false);
    expect(crossingAt(first.since, first.lastAt,
        {grams: 120, at: 1_500}, 100, "above").sustained).toBe(true);
});
```

- [ ] Run the new test before implementation.
- [ ] Implement the constants exactly as the engineering-policy section and
  implement the complete helper:

```ts
import {
    OVERFLOW_READING_MAX_AGE_MS, OVERFLOW_PAIR_MAX_SKEW_MS, OVERFLOW_CROSSING_MS
} from "@/constants/overflow";

export type Reading = {grams: number; at: number};
export type RetainedPair = {grams: number; at: number};
export type Crossing = {since: number | null; lastAt: number | null; sustained: boolean};

export function pairedRetained(
    water: Reading | undefined, cup: Reading | undefined, now: number
): RetainedPair | null {
    if (!Number.isFinite(now)) return null;
    if (water === undefined || cup === undefined) return null;
    for (const reading of [water, cup]) {
        const age = now - reading.at;
        if (!Number.isFinite(reading.grams) || reading.grams < 0
            || !Number.isFinite(reading.at) || age < 0
            || age > OVERFLOW_READING_MAX_AGE_MS) return null;
    }
    if (Math.abs(water.at - cup.at) > OVERFLOW_PAIR_MAX_SKEW_MS) return null;
    return {grams: Math.max(0, water.grams - cup.grams), at: Math.min(water.at, cup.at)};
}

export function crossingAt(
    since: number | null, lastAt: number | null, pair: RetainedPair | null,
    limit: number, direction: "above" | "below"
): Crossing {
    const hit = pair !== null && (direction === "above"
        ? pair.grams >= limit : pair.grams < limit);
    if (!hit || pair === null) return {since: null, lastAt: null, sustained: false};
    if (lastAt !== null && pair.at <= lastAt) {
        return {
            since, lastAt,
            sustained: since !== null && lastAt - since >= OVERFLOW_CROSSING_MS
        };
    }
    const began = since ?? pair.at;
    return {since: began, lastAt: pair.at, sustained: pair.at - began >= OVERFLOW_CROSSING_MS};
}
```

- [ ] Add negative/nonfinite/future timestamps, both channel arrival orders,
  exact equality, below debounce, reset on stale data, invalid reading and
  interrupted crossing tests. Do not count duplicate paired timestamps.
- [ ] Run targeted tests and typecheck; commit.

## Task 3: Pause ownership and recorder interval model

**Create:** `library/brew/pauseIntervals.ts`,
`library/brew/__tests__/pauseIntervals.test.ts`.
**Modify:** `library/machine/Machine.ts`, `library/brew/BrewRecord.ts`,
`library/brew/BrewRecorder.ts`, `library/brew/stalls.ts`.
**Extend:** `library/machine/__tests__/Machine.pause.test.ts`,
`library/brew/__tests__/BrewRecorder.test.ts`,
`library/brew/__tests__/stalls.test.ts`.

- [ ] Add a machine regression using the existing pause harness: request an
  overflow pause, deliver 40515 and assert:

```ts
expect(machine.phase).toMatchObject({
    name: "paused", pour: 1, pauseKind: "overflow",
    was: {name: "pouring", pour: 1}
});
```

The ordinary `pauseBrew()` test continues to assert its old shape: do not put
an explicit `"manual"` key on every old phase fixture.
- [ ] Add interval types and strict validation:

```ts
export type PauseKind = "manual" | "overflow";
export type PauseInterval = {from: number; to: number; pour: number; reason: PauseKind};

export function isPauseIntervals(value: unknown): value is PauseInterval[] {
    if (!Array.isArray(value)) return false;
    let previousTo = 0;
    for (const item of value) {
        if (item === null || typeof item !== "object" || Array.isArray(item)) return false;
        const row = item as Record<string, unknown>;
        if (typeof row.from !== "number" || !Number.isFinite(row.from)
            || row.from < previousTo
            || typeof row.to !== "number" || !Number.isFinite(row.to) || row.to < row.from
            || typeof row.pour !== "number" || !Number.isSafeInteger(row.pour) || row.pour < 0
            || (row.reason !== "manual" && row.reason !== "overflow")) return false;
        previousTo = row.to;
    }
    return true;
}

export function pausedWithin(intervals: readonly PauseInterval[], from: number, to: number): number {
    return intervals.reduce((sum, interval) =>
        sum + Math.max(0, Math.min(to, interval.to) - Math.max(from, interval.from)), 0);
}
```

Times are milliseconds relative to the recorder's first-water clock, the same
axis as samples. Equal boundaries/zero-length intervals are valid and harmless.
Add `pauseIntervals?: PauseInterval[]` to `BrewRecord`.

- [ ] Extend paused phase with `pauseKind?: "overflow"` and request signature
  `pauseBrew(pauseKind?: "overflow"): Promise<void>`. Keep request-send semantics;
  do not change the Promise into an ACK-awaiting call that deadlocks old tests.
  Store pending kind in a private field. Capture it before `setPhase` clears
  request metadata:

```ts
const pauseKind = this.requestedPauseKind;
this.setPhase({
    name: "paused", pour, pours, was,
    ...(pauseKind === "overflow" ? {pauseKind} : {})
});
```

Clear pending kind with pause timeout, rejected send, resume, terminal/reset
and a superseding manual request. A failed send must clear that request's
timer, but must not clear a newer request. Introduce a request sequence token
local to pause handling for this purpose; do not redesign the brew sequence.
Test a late rejection from an old request against a newer request.

- [ ] Recorder snapshots reason/pour when confirmed pause opens. Add a private
  list of closed intervals and a public `pauseIntervals` getter that returns
  closed intervals plus a bounded copy of the open interval ending at now.
  Do not let live consumers mutate recorder-owned arrays.
  In `closePause`, append:

```ts
const origin = this.pouringAt || this.pourOpenedAt || this.startedAt;
this.closedPauseIntervals.push({
    from: Math.max(0, this.pausedAt - origin),
    to: Math.max(0, this.clock() - origin),
    pour: this.pausePour,
    reason: this.pauseReason
});
```

Private fields `pausePour: number = 0`, `pauseReason: PauseKind = "manual"`,
and `closedPauseIntervals: PauseInterval[] = []` are defined with the existing
pause fields. Preserve the existing `pausedMs` accumulation exactly.
Only spread `pauseIntervals` into the emitted record when nonempty.

- [ ] Supply interval metadata to stall calculations as an optional final
  argument in `stallsInStage`, `stalledNow`, and `stallsFromSamples`. Preserve
  all old call behaviour when absent. Subtract `pausedWithin` from each flat
  span's elapsed duration before applying MIN_STALL_SECONDS; an already-flat
  pre-pause anchor must not charge pause seconds. Do not split chart sample
  timestamps or interpolate fictitious paused readings.
  Thread it through live and emitted-record calculations.
- [ ] Test manual/overflow intervals, repeated pause extension as one span,
  final cancellation during pause, before-first-water fallback, terminal
  ordering, bypass manual pause, and a plateau begun before PAUSE.
- [ ] Run the five targeted files and typecheck; commit.

## Task 4: Run controller with explicit command/error lifecycle

**Create:** `library/brew/OverflowController.ts`,
`library/brew/__tests__/OverflowController.test.ts`.

- [ ] Define the public contract:

```ts
import type {OverflowProtection} from "./overflowConfig";
import type {BrewPhase} from "@/library/machine/Machine";
import type {Notification} from "@/library/machine/protocol";

export type OverflowMode =
    "armed" | "requesting" | "holding" | "resuming" | "disabled" | "error" | "ended";
export type OverflowDisabled = "background" | "manualOverride" | "lostContact";
export type OverflowSnapshot = {
    mode: OverflowMode;
    retainedGrams: number | null;
    nextCheckAt: number | null;
    telemetryAvailable: boolean;
    disabledReason?: OverflowDisabled;
    error?: string;
};
export type OverflowCommands = {
    pause: () => Promise<void>;
    resume: () => Promise<void>;
};
export type OverflowOptions = {
    config: OverflowProtection;
    commands: OverflowCommands;
    now: () => number;
    onChange: (snapshot: OverflowSnapshot) => void;
};
```

The class exports methods `notification(parsed: Notification): void`,
`phase(phase: BrewPhase): void`, `tick(): void`, `background(): void`,
`manualPause(): void`, `manualResume(): void`, `cancel(): void`,
`dispose(): void`, and getter `snapshot: OverflowSnapshot`.

It owns no timer or subscriptions. The hook in Task 6 drives tick and events.
Clone config on construction. Guard every asynchronous continuation with a
generation token plus disposed/terminal check.

- [ ] Write fake-clock tests without a native module:

```ts
let now = 1_000;
const pause = jest.fn(async () => {});
const resume = jest.fn(async () => {});
const changes: OverflowSnapshot[] = [];
const controller = new OverflowController({
    config: {retainedGrams: 100, checkSeconds: 15},
    commands: {pause, resume}, now: () => now,
    onChange: snapshot => changes.push(snapshot)
});
const pouring: BrewPhase = {name: "pouring", pour: 1, pours: 2};
controller.phase(pouring);

function pair(water: number, cup: number, at: number) {
    now = at;
    controller.notification({kind: "waterWeight", grams: water});
    controller.notification({kind: "cupWeight", grams: cup});
}

pair(200, 80, 1_000);
pair(200, 80, 1_500);
expect(pause).toHaveBeenCalledTimes(1);
expect(controller.snapshot.nextCheckAt).toBeNull();
now = 1_700;
controller.phase({name: "paused", pour: 1, pours: 2, was: pouring, pauseKind: "overflow"});
expect(controller.snapshot.nextCheckAt).toBe(16_700);
pair(200, 150, 16_000);
pair(200, 150, 16_500);
now = 16_700;
controller.tick();
await Promise.resolve();
expect(resume).toHaveBeenCalledTimes(1);
```

Put the setup and assertions inside a test body; duplicate independent harness
construction for each test or extract a local `makeController` returning these
exact values. Never mock the telemetry helpers.

- [ ] Implement transitions to this table; each row must have a test:

| State/event | Transition and command |
|-------------|------------------------|
| armed, eligible fresh sustained high | requesting; reset low evidence; send one pause; ACK deadline starts |
| requesting, confirmed paused with overflow reason | holding; `nextCheckAt = now + checkSeconds * 1000`; reset below evidence |
| requesting, ACK deadline elapses | error with "The machine did not confirm the protection pause."; no resume |
| requesting, manual pause / paused without overflow kind | relinquish automatic ownership; no check deadline |
| holding, interval due and fresh sustained below | resuming; clear check deadline before sending resume |
| holding, interval due without below evidence | remain holding; next deadline one interval from current check; no duplicate PAUSE |
| resuming, command resolves while generation still current | armed; clear prior crossing evidence |
| pause/resume rejects | error with actionable operation-specific message; invalidate deadlines |
| manualResume while requesting/holding/resuming | disabled/manualOverride; clear all pending evidence/deadlines |
| manualPause while holding | relinquish automatic ownership before issuing user PAUSE; timer cannot resume it |
| background | disabled/background for this run; invalidate old asynchronous callbacks and raw readings |
| lostContact | disabled/lostContact; invalidate commands/readings, no automatic reconnect action |
| terminal/cancel/dispose | ended; no further publication/commands |
| bypass/settling/grinding | reset initiation evidence; never start a new automatic pause |

For relinquishing a manual pause use armed mode with eligibility controlled
by the remembered/current phase, not automatic holding. Manual resume of that
pause can return to ordinary protection; only overriding an automatically
owned pause disables the remainder of the run.

- [ ] Use `pairedRetained` on every raw read and tick. Count new evidence only
  on raw observations with increasing paired timestamps. Stale periods reset
  crossing evidence. Do not recalculate a saved recipe's config mid-run.
  Use PAUSE_ACK_MS for controller acknowledgement deadline, not a second
  unexplained constant. Waiting for confirmation never schedules resume.
- [ ] Explicitly test both channel orders, exactly-at-limit extension, missing
  channel, 1 ms stale, 15/30/45 intervals, duplicate phases, machine events
  contradicting pause, Promise resolution after background/cancel, rejected
  writes, manual requests racing automatic request, bypass exclusion,
  final-stage completion and disposal with no further onChange calls.
- [ ] Run targeted controller/policy tests and typecheck; commit.

## Task 5: Durable intervals and backup trust boundary

**Modify:** `library/BrewDatabase.ts`, `library/backup.ts`.
**Create:** `library/__tests__/BrewDatabase.pauseIntervals.test.ts`.
**Extend:** `library/__tests__/backup.test.ts`.

- [ ] Use real SQLite:

```ts
import {createTestDatabase} from "@/test-utils/sqlite";
import {ensureBrewTables} from "@/library/BrewDatabase";

it("adds the interval column idempotently", () => {
    const db = createTestDatabase();
    ensureBrewTables(db);
    ensureBrewTables(db);
    const columns = db.getAllSync("PRAGMA table_info(brews);") as {name: string; dflt_value: string}[];
    expect(columns.find(column => column.name === "pauseIntervals")?.dflt_value).toBe("'[]'");
});
```

Add migration tests starting with an actual old brews schema, not a mock that
recognises ALTER strings. Reuse the real-SQLite mock-open pattern for
BrewDatabase insert/restore integration; do not extend its older array mock.

- [ ] Add `pauseIntervals TEXT NOT NULL DEFAULT '[]'` to CREATE TABLE and an
  idempotent PRAGMA-based ALTER beside the existing pauseSeconds migration:

```ts
if (!columns.some(column => column.name === "pauseIntervals")) {
    db.execSync("ALTER TABLE brews ADD COLUMN pauseIntervals TEXT NOT NULL DEFAULT '[]';");
}
```

Use the actual column variable name in ensureBrewTables rather than inventing
a second schema query. Add `pauseIntervals: string` to BrewRow.
- [ ] Add the column, one placeholder and
  `JSON.stringify(record.pauseIntervals ?? [])` to writeBrewRow's insert. Both
  live insert and restore already use that method; do not introduce a second
  restore writer.
- [ ] Hydrate a JSON list through `isPauseIntervals`; emit the field only for
  nonempty validated data. A corrupt present list must throw a descriptive
  storage error, not silently become absence. Empty storage lists are ordinary
  absence, as with other optional record metadata.
- [ ] Add `pauseIntervals: isPauseIntervals` to OPTIONAL_BREW_FIELDS and copy
  it field-by-field in reviveBrew. Require `pour <= record.pours + 1`, sorted
  nonoverlap and interval bounds no later than the brew's elapsed extent.
  Validate against `(endedAt - (pouringAt || startedAt))`, in milliseconds.
  An invalid present list rejects that record through existing backup reporting.
  Keep BACKUP_VERSION unchanged.
- [ ] Test insert/read, restore/read, judgement updates, pinning and stream
  sweeping retain intervals. Old records have no emitted key. Test malicious
  arrays, nonfinite times, overlap, backward endpoints, unknown reason, a
  too-large pour and too-late endpoint. Restored records remain hasStream=false.
- [ ] Run real DB and backup tests plus typecheck; commit.

## Task 6: Wire one controller into run ownership

**Create:** `hooks/useOverflowProtection.ts`,
`hooks/__tests__/useOverflowProtection.test.ts`.
**Modify:** `hooks/useBrewRun.ts`, `hooks/useLiveBrew.tsx`.
**Extend:** `hooks/__tests__/useBrewRun.test.ts`,
`hooks/__tests__/useLiveBrew.test.tsx`.

- [ ] Write hook tests with injected machine notifications, phase listeners,
  direct command spies and an AppState event source. Await `renderHook`,
  `act`, rerender and cleanup. Cover a component unmount while native pause
  Promise is still pending; advancing timers afterward sends no command.
- [ ] The hook takes `{machine, config, runId}` with `machine` exposing
  `onNotification`, `onPhase`, `pauseBrew`, `resumeBrew`, and `phase`. Its
  result is `{overflow, manualPause, manualResume, cancel}`.
  Tag publications with `{from: machine, runId, snapshot}` and discard
  mismatches during render, matching useBrewRun's existing `heard` pattern.
  No state reset in an effect.
- [ ] Construct one controller inside an effect keyed by machine/runId. Keep
  fixed-run config in a ref updated in an earlier effect, matching the existing
  recipe/quick-edit pattern. Do not register a controller when config is absent.
  Store the controller handle in a ref only for event-handler access.
  `useBrew` also retries preflight `noVitals`/`notConnected` failures within the
  same machine/runId. Notify protection after relinking has disconnected and
  before the second attempt starts: dispose the spent controller and create a
  fresh one synchronously, retaining the run's fixed config and subscriptions.
  Ignore stale retry callbacks from other machines/runs and wait for newly heard
  phases, never inheriting `machine.phase`. Actual brew faults and background/
  lost-contact invalidation do not re-arm from later phase telemetry.

Commands must go directly to the machine:

```ts
commands: {
    pause: () => machine.pauseBrew("overflow"),
    resume: () => machine.resumeBrew()
}
```

Do not call `useBrew().pauseBrew()` automatically: it catches errors and
resolves, making a failed automatic command look successful.

- [ ] Register notification/phase subscriptions before the owner starts brew.
  Drive tick at OVERFLOW_PUBLISH_MS; no countdown timer per route. On
  AppState inactive/background call controller.background. If initial
  AppState.currentState is not active, disable before any telemetry can initiate
  pause. Null/unknown AppState is not evidence of foreground coverage.
  Teardown unsubscribes, removes AppState listener, clears interval, disposes
  controller and drops its handle only if still the same instance.
- [ ] Manual wrappers notify the controller before calling the ordinary user
  action, preserving its existing UI error path:

```ts
async function pauseBrew() {
    protection.manualPause();
    await brewer.pauseBrew();
}

async function resumeBrew() {
    protection.manualResume();
    await brewer.resumeBrew();
}

async function cancelBrew() {
    protection.cancel();
    await brewer.cancelBrew();
}
```

Define `protection` from the hook. Return wrappers after spreading brewer so
they are not overwritten. Auto commands use the machine directly.
- [ ] Publish `overflow?: OverflowSnapshot` and
  `pauseIntervals?: PauseInterval[]` through useBrewRun and LiveBrewSnapshot.
  Use `record.pauseIntervals` once recorded; otherwise read the recorder's
  copy through the existing publisher, never mutate its internal list.
  During a pause, elapsed must advance from recorder clock, not last sample,
  so the graph's open interval and next-check status continue without adding
  fake plateau samples.
- [ ] Test internal navigation/remount keeps one controller and one brew,
  retry gets a fresh controller, snapshots retain startedAt and quickEdit,
  no timer for unconfigured recipes, invalidation on background/link loss,
  manual pause cannot auto-resume and controller errors are visible.
- [ ] Run the four hook files with policy/controller tests; typecheck; commit.

## Task 7: Editor configuration and frictionless live status

**Create:** `components/OverflowSection.tsx`,
`components/OverflowStatus.tsx`,
`components/__tests__/OverflowSection.test.tsx`,
`components/__tests__/OverflowStatus.test.tsx`.
**Modify:** `hooks/useRecipeEditor.ts`, `app/editRecipe.tsx`,
`constants/recipeHelp.ts`, `constants/brewCopy.ts`, `app/brew.tsx`.
**Extend:** `app/__tests__/editRecipe.test.tsx`, `app/__tests__/brew.test.tsx`.

- [ ] Test user-visible behaviour, not child props:

```tsx
await renderWithProviders(
    <OverflowSection config={undefined} onChange={onChange} />
);
expect(screen.getByLabelText("Retained-water limit in grams")).toHaveDisplayValue("");
expect(onChange).not.toHaveBeenCalled();
await fireEvent.changeText(screen.getByLabelText("Retained-water limit in grams"), "100");
expect(onChange).toHaveBeenLastCalledWith({retainedGrams: 100, checkSeconds: 15});
expect(screen.getByText(OVERFLOW_FOREGROUND_CAUTION)).toBeVisible();
```

The initial empty field is intentional. Do not feed Stepper a guessed value.
Use Tamagui Input for initial explicit entry. Once a limit is present, the
existing Stepper may adjust it. Include explicit OFF action which clears
configuration rather than inventing an enabled false shape.

- [ ] Define all copy in constants:

```ts
export const OVERFLOW_FOREGROUND_CAUTION =
    "Keep XBRW++ open while brewing. Leaving or closing the app disables custom overflow protection.";
export const OVERFLOW_ESTIMATE_NOTE =
    "Estimated water in the dripper includes water held by the grounds. It is not a measured fill level.";
export const OVERFLOW_MANUAL_OVERRIDE =
    "Custom overflow protection is off for this brew.";
```

Add the help topic for threshold/check interval rather than repurpose another
field's help. Use Text, YStack/XStack, SegmentedControl and existing palette.
Controls are module-scope components; no new library or raw colour.

- [ ] `OverflowSection` props are
  `{config?: OverflowProtection; onChange: (config?: OverflowProtection) => void}`.
  Keep draft text local; parse only safe positive whole grams. Empty clears
  configuration.   Invalid text shows inline error and calls onChange(undefined), disabling
  protection rather than hiding the previous active limit behind invalid text.
  Label interval "CHECK AGAIN" with options
  `"15 S"`, `"30 S"`, `"45 S"`.
  Use the repo's controlled-input idiom to prevent draft drift on recipe
  switching; mount keyed by recipe.uuid, no effect resets.
- [ ] Add named `setOverflowProtection(config?: OverflowProtection)` to the
  editor hook: validate present values, mutate Recipe in place and bump key.
  Show OverflowSection only with OTHER, directly beside/after brewer choice.
  Pass the operation through BrewDeck props; do not grow route-local logic.
  Save/copy/quick-edit preserve config. Changing brewer suppresses control and
  behaviour without erasing the owner's chosen limit.
- [ ] OverflowStatus props:
  `{status: OverflowSnapshot; now: number; compact?: boolean}`.
  Render:
  armed = estimated retained grams or unavailable, plus caution;
  requesting = waiting for machine confirmation;
  holding = paused for dripper drain-down, next check seconds;
  unavailable holding = waiting for fresh readings, not "cup full";
  disabled = background/override/link reason;
  error = explicit operation error;
  ended = no active status.
  Format next check with `Math.max(0, Math.ceil((nextCheckAt - now) / 1000))`.
  Use accessibilityLiveRegion="polite" for meaningful state changes, not
  a new spoken announcement on every 250 ms reading.
- [ ] Show caution as soon as a protected recipe is registered, including
  waking/readyToStart; do not wait for the first threshold crossing. This
  must work both direct editor brew and home quick edit without a new modal.
  Keep RESUME/CANCEL existing controls; label automatic pause distinctly.
  Measure status as part of header/chrome or allocate bounded height before
  ladder bands, never overlay rows or add unbudgeted content.
- [ ] Test absent caution for OMNI/unconfigured, no extra press, explicit
  threshold entry, all interval options, invalid entry, OFF, recipe switch,
  owner recipe precedence, high/missing-data extensions, background/override
  warning and small-screen/large-text allocation. Run targeted tests and
  typecheck/lint changed files; commit.

## Task 8: Graph intervals, ladder state and shared real-time extent

Full and compact traces share the reason-specific, low-opacity pause bands
behind their channels, within the existing plot height and without extra
legend rows. Automatic pauses split both measured channels; each split water
fill closes at its own first sample, including when an earlier singleton was
discarded. Unsplit streams retain their legacy origin closure. These are
Task 8 rendering guarantees; propagation to historical and compared callers
remains Task 9.

**Modify:** `library/brew/pauseIntervals.ts`, `library/brew/brewShape.ts`,
`components/BrewTrace.tsx`, `components/BrewStageLadder.tsx`,
`components/BrewStageRung.tsx`, `app/brew.tsx`.
**Extend:** interval, brewShape, BrewTrace, BrewStageLadder, BrewStageRung tests.

- [ ] Add interval geometry:

```ts
export function intervalRects(
    intervals: readonly PauseInterval[], width: number, maxT: number
): {x: number; width: number; interval: PauseInterval}[] {
    if (width <= 0 || maxT <= 0) return [];
    return intervals.filter(interval => interval.to > interval.from).map(interval => ({
        x: interval.from / 1000 / maxT * width,
        width: (interval.to - interval.from) / 1000 / maxT * width,
        interval
    }));
}

export function intervalExtent(intervals: readonly PauseInterval[]): number {
    return intervals.reduce((max, interval) => Math.max(max, interval.to / 1000), 0);
}
```

Test 10–25 seconds in a 100-second/400-point plot produces x=40,width=60,
and millisecond precision/zero-width intervals cannot accidentally multiply
the scale by 1000.
- [ ] Add optional `intervals: readonly PauseInterval[] = []` as the final
  parameter to traceTimeParts, traceTimeExtent and traceAxisFor. Derive `ranTo`
  from `Math.max(lastSampleAt/1000, intervalExtent(intervals))`. Use that value
  in bypass positioning and common maxT. Existing absent-interval outputs stay
  byte-for-byte equal. Shared axis must include a pause that outlasts the last
  sample, including cancellation during pause.
- [ ] Add `pauseIntervals?: readonly PauseInterval[]` to BrewTrace props.
  Draw interval Rect bands behind channels using existing semantic palette
  colours and low opacity. Do not draw a continuous fabricated flow line
  through an automatic pause. Extend trace accessibility label with reason
  and duration summaries. Render automatic and manual reasons distinctly.
  Use one testID per band, e.g. `trace-pause-overflow-0`.
  Bands do not add height or an unbudgeted legend row.
- [ ] Add `pauseKind?: PauseKind` to live ladder/rung props. Keep RungState
  active and delivered progress unchanged; render an inline PAUSED/ DRAINING
  mark in the current rung's existing detail area and augment spoken label.
  Do not reuse holding/stall hatch colour to represent an automatic pause.
  No automatic marker for bypass because this feature does not pause bypass.
  Existing manual bypass state still works.
- [ ] Pass phase pause kind, intervals and the shared axis from live owner
  into graph/ladder. Mark manual pause even if no protection is configured.
  Test graph axis during an open interval, retained stage progress, small
  chart dimensions, no extra ladder height and no stall fabricated by pause.
- [ ] Run geometry/component/live targeted tests and typecheck; commit.

## Task 9: Historical, captured and compared graph propagation

**Modify:** `components/BrewSummary.tsx`, `app/brewRecord.tsx`,
`library/brew/compare.ts`, `components/CompareTrace.tsx`,
`app/brewCompare.tsx`.
**Extend:** summary/story-scale, brewRecord, compare/CompareTrace and
`library/brew/__tests__/storyCard.test.ts` tests.

- [ ] Add optional pauseIntervals to BrewSummary props and pass them into both
  traceAxisFor and BrewTrace. Its rate chart receives that same maxT, not a
  sample-only extent. Pass record intervals in every BrewSummary caller:
  live done summary, historical screen, ordinary capture, Story Card capture.
  Never reconstruct historical intervals from the current recipe.
- [ ] Keep pause intervals available in record-only UI when streams have
  expired, but do not invent a graph when hasStream=false. Existing pausedNote
  can summarise total pauses; add an automatic-reason summary as record copy
  without double-counting durations.
  Pause bands live inside the existing chart slot, so storyCard height budget
  does not gain a row. If a pause legend is necessary, account for it explicitly
  and extend the independent drawn-height test before shipping it.
- [ ] Compare lane model carries intervals. Its shared axis includes both
  drawn records' interval extents. SEPARATE passes each lane's intervals into
  compact BrewTrace; OVERLAY uses CompareTrace's own channels and in-plot bands,
  with coloured THIS and grey THAT ownership and spoken pause reason/duration.
  No pause appears on the other lane just because the axes are shared, and a
  swept lane contributes neither pause bands nor interval extent.
  Both channels split independently with `splitAtPauses`. Cup differences and
  closed fill polygons use only overlapping observed runs; neither display
  mode reconnects across an unsampled automatic pause. Actual samples inside
  pauses and manual continuity remain intact. Matching water with recorded
  gaps retains separate lane paths rather than claiming one line covers BOTH.
  These marks add no height or legend row to the existing chart budget.
- [ ] Add tests for record after recipe deletion, full Story Card and ordinary
  capture include interval bands, hidden-chart choice omits them, swept stream
  still retains pause metadata, restored record has no invented trace, and two
  compared lanes preserve correct shared seconds.
- [ ] Run the named targeted suites. The independent Story Card height sweep
  is expensive; coordinate its run with the slot session instead of launching
  concurrent heavy suites. Typecheck/lint; commit.

## Task 10: End-to-end policy regressions and release ledger

**Extend:** controller, hook/provider, app/brew, app/brewRecord, real SQLite,
backup, card fixture and story fitting tests from previous tasks.
**Modify:** `docs/release-2.1.0-changes.md`,
`docs/superpowers/specs/2026-10-09-custom-overflow-v1-design.md`.

- [ ] Run a scripted complete brew with these timed events:

| Time | Event | Required result |
|------|-------|-----------------|
| 0 | protected OTHER run registered | caution; one controller, one brew |
| 1.0/1.5 s | valid paired readings high | one PAUSE request |
| 1.7 s | confirmed overflow pause | interval starts now, not at first high |
| 16.7 s | estimate still high | extends to 31.7 s, no second PAUSE |
| 31.7 s | missing cup data | extends to 46.7 s, unavailable status |
| 46.0/46.5 s | fresh paired readings below | eligible for check |
| 46.7 s | due tick | one RESUME, re-arm |
| 50.0/50.5 s | high again | second PAUSE request |
| 50.7 s | confirmation | second interval opens |
| 52 s | user RESUME | automatic protection disabled visibly |
| 53 s | late timer/write continuation | no extra command |
| terminal | recorder emits | two correct intervals, no pause-as-stall |

Use injected clocks and real controller logic, not a mock returning the
expected status.

- [ ] Add alternate endings at each waiting state: manual PAUSE, cancellation,
  transport write rejection, missed 40515, terminal notification, background,
  unmount, retry and link loss. A new run must reject all previous run callbacks.
- [ ] Prove configured/unconfigured byte equivalence on independent real-card
  fixtures and BLE recipe encoding. NFC hardware safety remains unverified.
- [ ] Run the smallest combined selector over all feature-touched suites,
  then `npm run typecheck` and `npm run lint`.
- [ ] Coordinate one full `npm test -- --ci` and `npx expo-doctor` after
  targeted coverage passes. Full suite means both iOS and Android; do not
  report one project as cross-platform validation.
- [ ] Record exact counts/outcomes and unverified device gates in the ledger:
  firmware tare/estimate, paused stream availability, ack/valve latency,
  background/reconnect/manual machine buttons, narrow UI/large text,
  VoiceOver/TalkBack, recorded/export graph and real card checks.
  Update the spec with chosen policy boundaries, not claims of measured safety.
- [ ] Commit completed feature and docs, push only the feature branch if
  authorised by the current execution request. Do not open a PR, request
  another automated review, merge main or deploy without explicit permission.

## Self-review checklist

- Config applies only to OTHER; explicit limit, no guessed threshold.
- The protected vessel is the dripper, not receiving cup.
- Raw telemetry remains usable while chart samples deliberately omit pause.
- Both channels fresh; isolated spike and stale below reading cannot resume.
- Request-send success is not pause confirmation.
- Timer extends, rather than blindly resuming every 15 seconds.
- Manual pause, override, error, background and cancellation have distinct paths.
- Intervals use sample-axis milliseconds; volume/rate/compare axes agree.
- Pre-pause stall anchors exclude actual pause duration.
- Recipe JSON/backup and brew migration/restore/sweep preserve metadata.
- Card bytes and machine recipe blobs unchanged.
- Caution appears before protected brewing without extra interaction.
- Live and historical/captured graph and ladder surfaces are wired.
- No fake hardware verification, extra dependency or competing shared-file owner.

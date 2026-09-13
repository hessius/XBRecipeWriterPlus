# Showing the bypass while the machine brews — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give bypass water its own lane in the live brew, the finished summary and the history record, so it stops being folded into the last stage and mis-scored as a stall.

**Architecture:** Every sample the recorder keeps is stamped with the pour index the machine last announced, and the machine never announces the bypass — so bypass water lands on the last stage. The fix is at the source: `Machine` learns event `40520` (`RD_Bypass`, verified from a live capture) and enters a `bypass` phase; `BrewRecorder` stamps those samples with index `pours + 1`. Everything downstream then buckets correctly for free, including `stalls.ts`, which is not touched at all. On top of that sit a plan span, an optional record field, and three pieces of rendering that all use the editor's dashed-outline mark.

**Tech Stack:** TypeScript, React Native 0.86 / Expo SDK 57, Tamagui, react-native-svg, Jest + `@testing-library/react-native` v14.

**Spec:** `docs/superpowers/specs/2026-09-10-brew-bypass-display-design.md`

---

## Conventions for every task

- Run one test file with `npx jest <path>`; add `-t "name"` for a single case.
- The full gate before the final commit is `npm test`, `npm run typecheck`, `npm run lint`.
- Component tests **must** render through `renderWithProviders` from `test-utils/render.tsx`, and RNTL v14's `render`/`fireEvent` are **async** — always `await` them, or the test passes for the wrong reason.
- Every commit ends with:

```
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

- Commit subjects in this repo are sentences in the imperative, not Conventional Commits. `Scroll the finished brew, so a long ladder can be read` is the house style.
- Never regex-edit a multi-line literal. Use `python3 - <<'PYEOF'` with `assert old in s` then `str.replace`.

## File structure

| File | Responsibility | Change |
| --- | --- | --- |
| `library/machine/protocol.ts` | BLE constants | add `RD_BYPASS: 40520` |
| `library/machine/Machine.ts` | link + phase machine | new `bypass` phase, its handler, and the no-water guard |
| `constants/brewCopy.ts` | phase wording | `bypass` copy, `bypass` in `RUNNING` |
| `components/BrewMiniBar.tsx` | the bar on the library screen | a `bypass` branch |
| `library/brew/bypassState.ts` | **new** — the bypass's own state, as one pure function | created |
| `library/brew/brewShape.ts` | plan geometry in seconds | `bypassSeconds` |
| `library/brew/BrewRecord.ts` | the persisted record | `BypassRecord` type, optional field |
| `library/brew/BrewRecorder.ts` | builds the record from the stream | stamp `pours + 1`, fill `bypass` |
| `hooks/useBrewRun.ts` | live brew state for the screen | publish a `BypassView` |
| `components/BrewBypassRung.tsx` | **new** — the closing rung | created |
| `components/BrewStageLadder.tsx` | the ladder | render the closing rung |
| `components/BrewTrace.tsx` | the graph | dashed box above the target |
| `components/BrewFigures.tsx` | the three numbers | dashed `+n` badge on WATER |
| `app/brew.tsx` | live screen | pass the view down |
| `components/BrewSummary.tsx` | shared summary + export | pass the view down |
| `app/brewRecord.tsx` | history screen | build the view from the record |
| `docs/machine-integration/ble-protocol.md` | protocol notes | promote `40520` to verified |

---

## Task 1: Teach the protocol event 40520

**Files:**
- Modify: `library/machine/protocol.ts:147-172`
- Test: `library/machine/__tests__/protocol.bypass.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `library/machine/__tests__/protocol.bypass.test.ts`:

```ts
describe("RD_BYPASS", () => {
    it("is 40520", () => {
        expect(EVENT.RD_BYPASS).toBe(40520);
    });
});
```

If `EVENT` is not already imported in that file, add it to the existing import from `@/library/machine/protocol`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest library/machine/__tests__/protocol.bypass.test.ts -t "is 40520"`
Expected: FAIL — `expect(received).toBe(expected)` with `received: undefined`.

- [ ] **Step 3: Write minimal implementation**

In `library/machine/protocol.ts`, inside the `EVENT` object, immediately after the `POUR_START: 40510,` line, insert:

```ts
    /**
     * 40520. The bypass firing.
     *
     * Verified from a full frame log of 2026-09-10: a three-stage recipe with
     * a 5 ml bypass emitted 40510(0), 40510(1), 40510(2) and then this, 61 s
     * after the last pour began and 8 s before BREWER_STOP. There is no fourth
     * POUR_START, so this is the only announcement the bypass ever makes.
     *
     * The gap is the drawdown: the machine lets the dripper finish before it
     * dispenses into the cup, and how long that takes is not knowable in
     * advance.
     */
    RD_BYPASS:        40520,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest library/machine/__tests__/protocol.bypass.test.ts -t "is 40520"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add library/machine/protocol.ts library/machine/__tests__/protocol.bypass.test.ts
git commit -m "Name event 40520, now that a capture proves what it is

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: A bypass phase on the machine

**Files:**
- Modify: `library/machine/Machine.ts:85-108` (the `BrewPhase` union), `:1141-1157` (the event switch), `:1096` (the no-water guard)
- Test: `library/machine/__tests__/Machine.bypass.test.ts` — it already exists and already drives notifications; append there.

- [ ] **Step 1: Write the failing test**

Add to that suite. Adapt the harness call to whatever the file already uses to feed a notification; the assertion is the part that matters:

```ts
it("enters the bypass phase on 40520, without clamping into the last pour", () => {
    const machine = makeMachine();       // whatever the file's helper is called
    machine.pourCount = 3;               // if private, arm a 3-pour recipe instead
    machine.handleNotification({kind: "event", code: EVENT.POUR_START, value: 2});
    machine.handleNotification({kind: "event", code: EVENT.RD_BYPASS, value: 0});

    expect(machine.phase).toEqual({name: "bypass"});
});

it("does not end a brew on a no-water state while the bypass is running", () => {
    const machine = makeMachine();
    machine.handleNotification({kind: "event", code: EVENT.RD_BYPASS, value: 0});
    machine.handleNotification({kind: "state", state: MACHINE_STATE.NO_WATER});

    expect(machine.phase).toEqual({name: "bypass"});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest library/machine/__tests__/Machine.bypass.test.ts -t "bypass"`
Expected: FAIL — the phase is still `{name: "pouring", pour: 3, pours: 3}`, because `40520` falls through to `default` and does nothing.

- [ ] **Step 3: Write minimal implementation**

**3a.** In `library/machine/Machine.ts`, add a member to the `BrewPhase` union, immediately after the `pouring` member (`:96`):

```ts
    /**
     * The bypass is dispensing into the cup.
     *
     * A phase of its own rather than a fourth pour, because it is not a pour:
     * it does not go through the dripper, it is not in `recipe.pours`, and the
     * machine gives it its own event. Making it look like a pour is exactly
     * what folded its water onto the last stage.
     */
    | {name: "bypass"}
```

**3b.** In the event switch, immediately after the `case EVENT.POUR_START:` block's `break;` (`:1156`), insert:

```ts
            case EVENT.RD_BYPASS:
                // Deliberately not clamped into the pours, the way POUR_START
                // is. The bypass is after them.
                this.setPhase({name: "bypass"});
                break;
```

**3c.** At `:1096`, widen the no-water guard so the bypass is covered like the pour and the settle:

```ts
                if (this.phase.name === "pouring" || this.phase.name === "bypass"
                    || this.phase.name === "settling") break;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest library/machine/__tests__/Machine.bypass.test.ts`
Expected: PASS, whole file.

- [ ] **Step 5: Commit**

```bash
git add library/machine/Machine.ts library/machine/__tests__/Machine.bypass.test.ts
git commit -m "Give the bypass a phase of its own

It is not a pour: not in recipe.pours, not through the dripper, and the
machine announces it with its own event. Treating it as the last pour is
what folded its water onto the last stage.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Say what the bypass phase is doing

A phase with no copy shows a blank headline, and `BrewMiniBar` falls through to "Grinding".

**Files:**
- Modify: `constants/brewCopy.ts:32` (`PHASE_COPY`), `:101-106` (`RUNNING`)
- Modify: `components/BrewMiniBar.tsx:109`
- Test: `components/__tests__/BrewMiniBar.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `components/__tests__/BrewMiniBar.test.tsx`, following the file's existing render helper:

```ts
it("names the bypass rather than falling back to grinding", async () => {
    await renderWithProviders(
        <BrewMiniBar
            pours={[]}
            samples={[]}
            phase={{name: "bypass"}}
            recipeName="Ethiopia"
            elapsed={190}
            dose={18}
            accent="#8ab4f8"
            onOpen={() => {}}
            onDismiss={() => {}}
        />
    );
    expect(screen.getByText("Bypass")).toBeTruthy();
    expect(screen.queryByText("Grinding")).toBeNull();
});
```

Match the prop list to the component's actual `Props` — copy it from a neighbouring test in the same file rather than from here if they differ.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest components/__tests__/BrewMiniBar.test.tsx -t "names the bypass"`
Expected: FAIL — "Grinding" is found, "Bypass" is not.

- [ ] **Step 3: Write minimal implementation**

**3a.** In `constants/brewCopy.ts`, in `PHASE_COPY`, immediately before the `settling:` entry:

```ts
    // After the last stage. The machine waits for the dripper to finish before
    // it dispenses, and that wait is not a fault — the copy has to say so, or
    // a legitimate minute of silence reads as a hang.
    bypass:      "Adding bypass water…",
```

**3b.** In the same file, add `"bypass"` to `RUNNING`:

```ts
export const RUNNING = new Set([
    "waking", "sending", "readyToStart", "armed", "pressPlay", "grinding", "pouring",
    // The pour is done but the brew is not: the bypass still has to go in, and
    // stopping the machine is still a meaningful thing to offer.
    "bypass",
    // The pour is done but the brew is not: coffee is still draining and the
    // trace is still live, so the run's controls stay on screen.
    "settling"
]);
```

**3c.** In `components/BrewMiniBar.tsx`, immediately before the `if (phase.name === "settling")` block (`:109`):

```ts
    // Between the last pour and the settle. Without its own branch this fell
    // through to the grinding default and flipped the bar back to "Grinding"
    // at the very end of the brew.
    if (phase.name === "bypass") {
        return {
            title: "Bypass",
            detail: `ADDING WATER · ${clock(elapsed)}`,
            line: props.accent
        };
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest components/__tests__/BrewMiniBar.test.tsx`
Expected: PASS, whole file.

- [ ] **Step 5: Commit**

```bash
git add constants/brewCopy.ts components/BrewMiniBar.tsx components/__tests__/BrewMiniBar.test.tsx
git commit -m "Say that the bypass is running, rather than saying nothing

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: The bypass's own state, as a pure function

**Files:**
- Create: `library/brew/bypassState.ts`
- Test: `library/brew/__tests__/bypassState.test.ts`

- [ ] **Step 1: Write the failing test**

Create `library/brew/__tests__/bypassState.test.ts`:

```ts
import {bypassRungState} from "@/library/brew/bypassState";

const base = {
    phaseName: "pouring",
    over: false,
    settling: false,
    activeIndex: 0,
    stages: 3,
    lastPauseDone: false,
    delivered: 0
};

describe("bypassRungState", () => {
    it("is pending before the brew starts", () => {
        expect(bypassRungState({...base, activeIndex: null})).toBe("pending");
    });

    it("is pending in the middle of the brew", () => {
        expect(bypassRungState({...base, activeIndex: 1})).toBe("pending");
    });

    it("waits once the last stage has finished its rest", () => {
        expect(bypassRungState({...base, activeIndex: 2, lastPauseDone: true}))
            .toBe("waiting");
    });

    it("waits through the settle, if the bypass has not fired", () => {
        expect(bypassRungState({...base, activeIndex: 3, settling: true}))
            .toBe("waiting");
    });

    it("fills while the machine is dispensing", () => {
        expect(bypassRungState({...base, phaseName: "bypass", activeIndex: 3}))
            .toBe("filling");
    });

    it("is done once the brew is over and water arrived", () => {
        expect(bypassRungState({...base, over: true, activeIndex: 3, delivered: 5}))
            .toBe("done");
    });

    it("is still waiting on a finished brew that never dispensed", () => {
        // Older firmware, or a machine that skipped it. Better an honest
        // "never arrived" than a rung that claims 0 of 5 ml was delivered.
        expect(bypassRungState({...base, over: true, activeIndex: 3, delivered: 0}))
            .toBe("waiting");
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest library/brew/__tests__/bypassState.test.ts`
Expected: FAIL — "Cannot find module '@/library/brew/bypassState'".

- [ ] **Step 3: Write minimal implementation**

Create `library/brew/bypassState.ts`:

```ts
/**
 * Where the bypass rung stands.
 *
 * `waiting` is the one that had to exist. The machine lets the dripper finish
 * before it dispenses, and that gap ran to 61 s in the capture this was
 * written from. With no state for it the wait had nowhere to sit, so it was
 * scored against the last stage as a stall and painted amber — a fault drawn
 * over a machine behaving exactly as designed.
 */
export type BypassRungState = "pending" | "waiting" | "filling" | "done";

export type BypassStateInput = {
    /** `BrewPhase["name"]`, widened: this module must not import the machine. */
    phaseName: string;
    /** The brew has ended — `OVER.has(phase.name)`. */
    over: boolean;
    settling: boolean;
    /** The live stage, zero-based; `null` before the brew, `stages` once past. */
    activeIndex: number | null;
    /** How many pours the recipe has. */
    stages: number;
    /** The last stage has reached its target and served its planned rest. */
    lastPauseDone: boolean;
    /** Millilitres the bypass has delivered. */
    delivered: number;
};

/**
 * The rung's state, from the run's state.
 *
 * A pure function in its own module so it can be tested without a machine, a
 * renderer or a brew, and so the live screen and the history screen cannot
 * answer the question two different ways.
 */
export function bypassRungState(input: BypassStateInput): BypassRungState {
    const {phaseName, over, settling, activeIndex, stages, lastPauseDone,
           delivered} = input;

    if (phaseName === "bypass") return "filling";
    // A finished brew that never dispensed is not "done": nothing was
    // delivered, and drawing an empty rung as complete would be a lie.
    if (over) return delivered > 0 ? "done" : "waiting";
    if (settling) return "waiting";
    if (activeIndex === null) return "pending";
    if (activeIndex >= stages) return "waiting";
    if (activeIndex === stages - 1 && lastPauseDone) return "waiting";
    return "pending";
}

/**
 * Everything the three views need to draw the bypass, in one object.
 *
 * One shape shared by the live screen, the summary and the history record, so
 * a brew looks the same after it is saved as it did while it ran.
 */
export type BypassView = {
    /** Millilitres asked for. */
    volume: number;
    /** Degrees Celsius asked for. */
    temperature: number;
    /** Millilitres delivered so far. */
    delivered: number;
    /**
     * Seconds into the brew that the bypass began, or `null` while it has not.
     *
     * `null` is what makes the box on the trace slide right while the machine
     * waits: with no real time to draw at, it is drawn at the later of the
     * plan and now.
     */
    startedAt: number | null;
    state: BypassRungState;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest library/brew/__tests__/bypassState.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add library/brew/bypassState.ts library/brew/__tests__/bypassState.test.ts
git commit -m "Give the bypass rung a state, including a wait that is not a fault

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: How long the bypass takes

**Files:**
- Modify: `library/brew/brewShape.ts:15-22`
- Test: `library/brew/__tests__/brewShape.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `library/brew/__tests__/brewShape.test.ts`:

```ts
describe("bypassSeconds", () => {
    it("is the volume at the default flow", () => {
        // 5 ml at 3.2 ml/s.
        expect(bypassSeconds(5)).toBeCloseTo(1.5625);
    });

    it("is zero for no bypass", () => {
        expect(bypassSeconds(0)).toBe(0);
        expect(bypassSeconds(-4)).toBe(0);
    });
});
```

Add `bypassSeconds` to the existing import from `@/library/brew/brewShape`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest library/brew/__tests__/brewShape.test.ts -t "bypassSeconds"`
Expected: FAIL — `bypassSeconds is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `library/brew/brewShape.ts`, immediately after `pauseSeconds` (`:27`), add:

```ts
/**
 * How long the bypass takes to dispense.
 *
 * At the default flow, because a bypass has no flow rate of its own: it is not
 * a `Pour` and the machine is not told one. The figure is only ever used to
 * give the dashed box on the trace and the bar on the rung a width, and at a
 * typical 5 ml that is under two seconds either way.
 *
 * What it deliberately does *not* model is the drawdown wait before it. That
 * wait is however long the dripper takes and cannot be known in advance, so
 * the plan places the bypass immediately after the last stage and the live
 * drawing slides right if the machine takes longer.
 */
export function bypassSeconds(volume: number): number {
    return Math.max(volume, 0) / DEFAULT_FLOW_ML_S;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest library/brew/__tests__/brewShape.test.ts`
Expected: PASS, whole file.

- [ ] **Step 5: Commit**

```bash
git add library/brew/brewShape.ts library/brew/__tests__/brewShape.test.ts
git commit -m "Give the bypass a width on the time axis

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: A place on the record for the bypass

**Files:**
- Modify: `library/brew/BrewRecord.ts:66-121`
- Test: `library/brew/__tests__/BrewRecord.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `library/brew/__tests__/BrewRecord.test.ts`:

```ts
describe("BypassRecord", () => {
    it("survives a round trip through JSON, the way the column stores it", () => {
        const bypass: BypassRecord = {
            volume: 5, temperature: 85, delivered: 5, startedAt: 183_000
        };
        expect(JSON.parse(JSON.stringify(bypass))).toEqual(bypass);
    });

    it("keeps null for a bypass that never fired", () => {
        const bypass: BypassRecord = {
            volume: 5, temperature: 85, delivered: 0, startedAt: null
        };
        expect(JSON.parse(JSON.stringify(bypass)).startedAt).toBeNull();
    });
});
```

Add `type BypassRecord` to the existing import from `@/library/brew/BrewRecord`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest library/brew/__tests__/BrewRecord.test.ts -t "BypassRecord"`
Expected: FAIL at type-check inside Jest — `Module '"@/library/brew/BrewRecord"' has no exported member 'BypassRecord'`.

- [ ] **Step 3: Write minimal implementation**

In `library/brew/BrewRecord.ts`, immediately before the `BrewRecord` type (`:66`), add:

```ts
/**
 * The bypass, as a brew remembers it.
 *
 * The asked-for figures are copied at brew time rather than joined to the
 * recipe, for the same reason `recipeName`, `accent` and `plan` are: a brew is
 * a record of an event, and editing the recipe afterwards must not rewrite it.
 *
 * `startedAt` is milliseconds into the brew, on the same clock as
 * `BrewSample.at`, and `null` when the machine never dispensed — older
 * firmware, or a brew that ended first. `delivered` is then 0, and the rung
 * says so rather than claiming a completed bypass of nothing.
 */
export type BypassRecord = {
    volume: number;
    temperature: number;
    delivered: number;
    startedAt: number | null;
};
```

Then add a field to `BrewRecord`, immediately after `stageWater?: number[];` (`:120`):

```ts
    /**
     * The bypass, if the recipe had one.
     *
     * Absent on rows written before it existed and on every recipe without a
     * bypass, exactly like `pouringAt`, `stalls`, `plan` and `stageWater` — so
     * an old record draws precisely as it always did.
     *
     * Kept out of `stageWater`, which stays index-aligned with `plan`. The
     * bypass is not a stage, and widening that array by one would have made
     * every existing reader of it wrong by one.
     */
    bypass?: BypassRecord;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest library/brew/__tests__/BrewRecord.test.ts`
Expected: PASS, whole file.

- [ ] **Step 5: Commit**

```bash
git add library/brew/BrewRecord.ts library/brew/__tests__/BrewRecord.test.ts
git commit -m "Keep the bypass on the record, optionally

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 7: Stamp the bypass into its own lane

This is the fix. Everything before it was scaffolding.

**Files:**
- Modify: `library/brew/BrewRecorder.ts:56-72` (fields), `:182-195` (`observe`), `:258-298` (`emit`)
- Test: `library/brew/__tests__/BrewRecorder.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `library/brew/__tests__/BrewRecorder.test.ts`. Use the file's existing fake machine and recipe helpers — the names below assume `makeMachine()` returning `{machine, emitPhase, emitWeight}` and `makeRecipe()`; adapt to what is actually there, but keep the assertions:

```ts
describe("the bypass", () => {
    it("goes in its own lane rather than onto the last stage", () => {
        const {machine, emitPhase, emitWeight} = makeMachine();
        const recipe = makeRecipe([{volume: 40}, {volume: 115}, {volume: 85}]);
        recipe.bypassEnabled = true;
        recipe.bypassVolume = 5;
        recipe.bypassTemp = 85;

        let saved: BrewRecord | undefined;
        const recorder = new BrewRecorder({
            machine, recipe, onRecord: (record) => { saved = record; }
        });
        recorder.start();

        emitPhase({name: "pouring", pour: 1, pours: 3});
        emitWeight(40, 0);
        emitPhase({name: "pouring", pour: 2, pours: 3});
        emitWeight(155, 20);
        emitPhase({name: "pouring", pour: 3, pours: 3});
        emitWeight(240, 100);
        // The drawdown: flat, at the last stage's target.
        emitWeight(240, 150);
        // The bypass.
        emitPhase({name: "bypass"});
        emitWeight(245, 155);
        emitPhase({name: "settling"});
        emitPhase({name: "done"});

        expect(saved?.stageWater).toEqual([40, 115, 85]);
        expect(saved?.bypass).toEqual({
            volume: 5, temperature: 85, delivered: 5,
            startedAt: expect.any(Number)
        });
    });

    it("records no stall for the drawdown wait", () => {
        // Same run as above; the 61-second flat stretch at the last stage's
        // target used to be closed by the bypass's rise and recorded as a
        // stall, because the target guard only covers a plateau that is still
        // open when the stage ends.
        const {machine, emitPhase, emitWeight} = makeMachine();
        const recipe = makeRecipe([{volume: 40}, {volume: 115}, {volume: 85}]);
        recipe.bypassEnabled = true;
        recipe.bypassVolume = 5;

        let saved: BrewRecord | undefined;
        const recorder = new BrewRecorder({
            machine, recipe, onRecord: (record) => { saved = record; }
        });
        recorder.start();

        emitPhase({name: "pouring", pour: 1, pours: 3});
        emitWeight(40, 0);
        emitPhase({name: "pouring", pour: 2, pours: 3});
        emitWeight(155, 20);
        emitPhase({name: "pouring", pour: 3, pours: 3});
        emitWeight(240, 100);
        emitWeight(240, 150);
        emitWeight(240, 161);
        emitPhase({name: "bypass"});
        emitWeight(245, 165);
        emitPhase({name: "done"});

        expect(saved?.stalls?.[2]).toEqual([]);
    });

    it("keeps no bypass on a recipe that has none", () => {
        const {machine, emitPhase, emitWeight} = makeMachine();
        const recipe = makeRecipe([{volume: 40}]);
        let saved: BrewRecord | undefined;
        const recorder = new BrewRecorder({
            machine, recipe, onRecord: (record) => { saved = record; }
        });
        recorder.start();
        emitPhase({name: "pouring", pour: 1, pours: 1});
        emitWeight(40, 10);
        emitPhase({name: "done"});

        expect(saved?.bypass).toBeUndefined();
    });
});
```

If the file's weight helper takes wall-clock milliseconds rather than seconds, scale the second argument accordingly — the shape of the run is what matters, not the units.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest library/brew/__tests__/BrewRecorder.test.ts -t "the bypass"`
Expected: FAIL. First test: `stageWater` is `[40, 115, 90]` and `bypass` is `undefined`. Second: `stalls[2]` has one entry.

- [ ] **Step 3: Write minimal implementation**

**3a.** Add two fields to the class, after `private pours = 0;` (`:65`):

```ts
    /**
     * Milliseconds into the brew that the bypass began, or null.
     *
     * On the samples' clock, not the wall clock, so a record replays against
     * its own timeline the way every other figure on it does.
     */
    private bypassAt: number | null = null;
```

**3b.** In `observe`, immediately after the `if (phase.name === "pouring") { … return; }` block (`:195`), add:

```ts
        // The bypass is stage n + 1, and this line is the whole fix.
        //
        // Every sample carries whichever pour index was last announced, and the
        // machine announces no pour for the bypass — so its water was stamped
        // with the last stage and counted as that stage's. Worse, its arrival
        // was a *rise*, which closed the flat drawdown plateau before it and
        // had it recorded as a 61-second stall: the target guard in
        // `stallsInStage` only covers a plateau still open at the end of the
        // stage. Moving the index moves both.
        if (phase.name === "bypass") {
            this.pour = (this.pours > 0 ? this.pours : this.options.recipe.pours.length) + 1;
            // `pouringAt` is 0 if water never moved; `ensurePouringAt` is what
            // the terminal path uses, and the same fallback applies here.
            this.ensurePouringAt();
            this.bypassAt = this.clock() - this.pouringAt;
            return;
        }
```

**3c.** In `emit`, immediately before the `const record: BrewRecord = {` literal (`:280`), add:

```ts
        const stages = this.pours > 0 ? this.pours : recipe.pours.length;
        // Copied from the recipe, like `plan`: what was asked for is part of
        // what happened, and it must not change when the recipe does.
        const bypass = recipe.bypassEnabled && !recipe.isTea()
                       && recipe.bypassVolume > 0
            ? {
                volume: Math.max(recipe.bypassVolume, 0),
                temperature: recipe.bypassTemp,
                delivered: this.bypassAt === null
                    ? 0
                    : stageWaterFrom(this.collected, stages + 1),
                startedAt: this.bypassAt
              }
            : undefined;
```

**3d.** Inside the record literal, immediately after the `stageWater:` line (`:296`), add:

```ts
            // Spread rather than assigned, so a recipe with no bypass leaves
            // the key off the row entirely and reads back as an old record.
            ...(bypass === undefined ? {} : {bypass}),
```

**3e.** Extend the import at `:11` so `stageWaterFrom` is available:

```ts
import {NOISE_FLOOR_ML, stageWaterFrom} from "./stalls";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest library/brew/__tests__/BrewRecorder.test.ts`
Expected: PASS, whole file — including every pre-existing test, which must not move.

- [ ] **Step 5: Commit**

```bash
git add library/brew/BrewRecorder.ts library/brew/__tests__/BrewRecorder.test.ts
git commit -m "Put the bypass in its own lane, so it stops being the last stage

Every sample carries the last pour index the machine announced, and the
machine announces none for the bypass. Its 5 ml therefore landed on stage
3, and its arrival closed the drawdown plateau before it, which recorded
a minute of legitimate waiting as a stall.

Moving the index fixes both, and stalls.ts is untouched.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 8: Publish the bypass to the screen

**Files:**
- Modify: `hooks/useBrewRun.ts:135-215`
- Test: `hooks/__tests__/useBrewRun.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `hooks/__tests__/useBrewRun.test.ts`, following the file's existing `renderHook` helper:

```ts
it("publishes no bypass for a recipe without one", async () => {
    const {result} = renderRun(makeRecipe([{volume: 40}]));
    expect(result.current.bypass).toBeUndefined();
});

it("publishes a pending bypass before the brew reaches it", async () => {
    const recipe = makeRecipe([{volume: 40}, {volume: 60}]);
    recipe.bypassEnabled = true;
    recipe.bypassVolume = 5;
    recipe.bypassTemp = 85;

    const {result} = renderRun(recipe);
    expect(result.current.bypass).toEqual({
        volume: 5, temperature: 85, delivered: 0,
        startedAt: null, state: "pending"
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest hooks/__tests__/useBrewRun.test.ts -t "bypass"`
Expected: FAIL — `result.current.bypass` is `undefined` in both, so the second assertion fails.

- [ ] **Step 3: Write minimal implementation**

**3a.** Extend the imports at the top of `hooks/useBrewRun.ts`:

```ts
import {bypassRungState, type BypassView} from "@/library/brew/bypassState";
```

and add `bypassSeconds` is **not** needed here; leave `brewShape`'s import as it is.

**3b.** Immediately before the `return {` at the end of the hook, add:

```ts
    // The bypass, as one object for the three views that draw it.
    //
    // `pours.length + 1` is the lane the recorder stamps it into, so the live
    // figure and the recorded one come from the same arithmetic and cannot
    // disagree.
    const wantsBypass = recipe !== null && recipe.bypassEnabled
        && !recipe.isTea() && recipe.bypassVolume > 0;
    const bypassDelivered = wantsBypass
        ? stageWaterFrom(samples, pours.length + 1)
        : 0;
    const bypassSample = wantsBypass
        ? samples.find((s) => s.pour === pours.length + 1)
        : undefined;
    const lastPour = pours[pours.length - 1];
    const bypass: BypassView | undefined = !wantsBypass || recipe === null
        ? undefined
        : {
            volume: Math.max(recipe.bypassVolume, 0),
            temperature: recipe.bypassTemp,
            delivered: bypassDelivered,
            startedAt: bypassSample === undefined ? null : bypassSample.at / 1000,
            state: bypassRungState({
                phaseName: phase.name,
                over,
                settling,
                activeIndex,
                stages: pours.length,
                lastPauseDone: lastPour !== undefined
                    && pauseElapsed >= pauseSeconds(lastPour),
                delivered: bypassDelivered
            })
          };
```

**3c.** Add `bypass` to the returned object:

```ts
        ...brewer, phase, samples, elapsed, stageElapsed, activeIndex, holding,
        heldSeconds, stalls, stageWater, pauseElapsed, bypass
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest hooks/__tests__/useBrewRun.test.ts`
Expected: PASS, whole file.

- [ ] **Step 5: Commit**

```bash
git add hooks/useBrewRun.ts hooks/__tests__/useBrewRun.test.ts
git commit -m "Publish the bypass alongside the stages

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 9: The closing rung

**Files:**
- Create: `components/BrewBypassRung.tsx`
- Test: `components/__tests__/BrewBypassRung.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/BrewBypassRung.test.tsx`:

```tsx
import React from "react";
import {screen} from "@testing-library/react-native";

import BrewBypassRung from "@/components/BrewBypassRung";
import {renderWithProviders} from "@/test-utils/render";

const base = {
    volume: 5,
    temperature: 85,
    delivered: 0,
    state: "pending" as const,
    accent: "#8ab4f8",
    laneSeconds: 60,
    barHeight: 12
};

describe("BrewBypassRung", () => {
    it("says how much bypass is planned before it happens", async () => {
        await renderWithProviders(<BrewBypassRung {...base} />);
        expect(screen.getByText("5 ml")).toBeTruthy();
    });

    it("says it is waiting for the drawdown", async () => {
        await renderWithProviders(<BrewBypassRung {...base} state="waiting" />);
        expect(screen.getByText("WAITING")).toBeTruthy();
    });

    it("reads out what has landed once it is filling", async () => {
        await renderWithProviders(
            <BrewBypassRung {...base} state="filling" delivered={3} />
        );
        expect(screen.getByText("3/5 ml")).toBeTruthy();
    });

    it("draws a dashed lane, the way the editor does", async () => {
        await renderWithProviders(<BrewBypassRung {...base} state="done" delivered={5} />);
        const lane = screen.getByTestId("bypass-rung-lane");
        expect(lane.props.style).toEqual(
            expect.objectContaining({borderStyle: "dashed"})
        );
    });

    it("names itself for a screen reader", async () => {
        await renderWithProviders(<BrewBypassRung {...base} state="done" delivered={5} />);
        expect(screen.getByLabelText("Bypass water, 85 degrees, 5 millilitres, delivered"))
            .toBeTruthy();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest components/__tests__/BrewBypassRung.test.tsx`
Expected: FAIL — "Cannot find module '@/components/BrewBypassRung'".

- [ ] **Step 3: Write minimal implementation**

Create `components/BrewBypassRung.tsx`:

```tsx
import React from "react";
import {View} from "react-native";
import {XStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import {bypassSeconds} from "@/library/brew/brewShape";
import type {BypassRungState} from "@/library/brew/bypassState";

type Props = {
    volume: number;
    temperature: number;
    delivered: number;
    state: BypassRungState;
    accent: string;
    /** The longest stage in the recipe. Shared, or the lane means nothing. */
    laneSeconds: number;
    barHeight: number;
    testID?: string;
};

/** The dimmed opacity of a bypass that has not happened. Matches BrewStageRung. */
const PENDING_OPACITY = 0.45;

/**
 * Bypass water, as the closing rung of the brew ladder.
 *
 * The dashed outline is the editor's — `components/BypassRung.tsx` draws the
 * same mark for the same thing — so the reader learns it once and it means
 * bypass in the editor, on the trace and here.
 *
 * The lane is deliberately on the same seconds scale as the stages, and a 5 ml
 * bypass is therefore a very short bar. That is honest: it takes about a second
 * and a half, and a bar padded out to look important would say otherwise.
 *
 * `waiting` is the state that had to exist. The machine lets the dripper finish
 * before it dispenses, and that gap ran to 61 s in the capture this was written
 * from. It is not a stall and is never drawn as one.
 */
export default function BrewBypassRung({
    volume, temperature, delivered, state, accent, laneSeconds, barHeight, testID
}: Props) {
    const target = Math.max(volume, 0);
    const seconds = bypassSeconds(target);
    const span = laneSeconds > 0 ? laneSeconds : 1;
    const slack = Math.max(0, span - seconds);
    const fill = target > 0 ? Math.max(0, Math.min(1, delivered / target)) : 0;
    const lit = state === "filling" || state === "done";
    const radius = barHeight / 2;

    const readout = state === "pending" ? `${target} ml`
        : state === "waiting" ? "WAITING"
        : `${Math.round(delivered)}/${target} ml`;

    const label = `Bypass water, ${Math.max(temperature, 0)} degrees, `
        + `${target} millilitres, `
        + (state === "pending" ? "not yet"
           : state === "waiting" ? "waiting for the drawdown"
           : state === "filling" ? "adding"
           : "delivered");

    return (
        <XStack
            testID={testID}
            accessible
            accessibilityLabel={label}
            alignItems="center"
            gap="$2"
            paddingHorizontal="$2"
            marginHorizontal="$-2"
            style={{opacity: state === "pending" ? PENDING_OPACITY : 1}}
        >
            <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.4}
                           color={lit ? palette.info : palette.dim}>
                BY
            </DotMatrixText>

            <DotMatrixText fontSize={12} weight="bold" color={palette.dim}>
                {`${Math.max(temperature, 0)}°`}
            </DotMatrixText>

            <XStack style={{flex: 1}} height={barHeight} alignItems="center">
                <View
                    testID="bypass-rung-lane"
                    style={{
                        flex: Math.max(seconds, 0.001),
                        height: barHeight,
                        borderRadius: radius,
                        borderWidth: 1,
                        borderStyle: "dashed",
                        borderColor: lit ? accent : palette.line,
                        overflow: "hidden",
                        flexDirection: "row"
                    }}
                >
                    <View
                        testID="bypass-rung-fill"
                        style={{
                            flex: fill,
                            height: barHeight,
                            borderRadius: radius,
                            backgroundColor: accent
                        }}
                    />
                    <View style={{flex: 1 - fill}} />
                </View>
                {slack > 0 && <View testID="bypass-rung-slack" style={{flex: slack}} />}
            </XStack>

            <DotMatrixText fontSize={12} weight="bold" color={palette.dim}>
                {readout}
            </DotMatrixText>
        </XStack>
    );
}
```

Note: the dashed-lane test reads `lane.props.style` as an object. If RN flattens it to an array in this version, change the assertion to
`expect(StyleSheet.flatten(lane.props.style).borderStyle).toBe("dashed")` and import `StyleSheet` from `react-native`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest components/__tests__/BrewBypassRung.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add components/BrewBypassRung.tsx components/__tests__/BrewBypassRung.test.tsx
git commit -m "Draw the bypass as the closing rung, dashed like the editor's

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 10: Hang the closing rung on the ladder

**Files:**
- Modify: `components/BrewStageLadder.tsx:11-45` (props), `:108-137` (rows)
- Test: `components/__tests__/BrewStageLadder.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `components/__tests__/BrewStageLadder.test.tsx`, reusing the file's existing prop helper:

```tsx
it("hangs a bypass rung below the stages when there is one", async () => {
    await renderWithProviders(
        <BrewStageLadder
            {...ladderProps}
            bypass={{
                volume: 5, temperature: 85, delivered: 5,
                startedAt: 183, state: "done"
            }}
        />
    );
    expect(screen.getByTestId("rung-bypass")).toBeTruthy();
});

it("hangs no bypass rung when there is none", async () => {
    await renderWithProviders(<BrewStageLadder {...ladderProps} />);
    expect(screen.queryByTestId("rung-bypass")).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest components/__tests__/BrewStageLadder.test.tsx -t "bypass rung"`
Expected: FAIL on the first — `Unable to find an element with testID: rung-bypass`.

- [ ] **Step 3: Write minimal implementation**

**3a.** Extend the imports:

```tsx
import BrewBypassRung from "@/components/BrewBypassRung";
import type {BypassView} from "@/library/brew/bypassState";
```

**3b.** Add to `Props`, after `onSelectStage`:

```tsx
    /**
     * The bypass, if this brew has one. Absent means no closing rung — which
     * is every recipe without a bypass and every record written before the
     * bypass was drawn at all.
     */
    bypass?: BypassView;
```

**3c.** Destructure it in the signature, defaulting to `undefined`:

```tsx
    pauseElapsed, selectedIndex = null, onSelectStage, bypass
```

**3d.** Immediately after the `const rows = pours.map(...)` block closes (`:137`), add:

```tsx
    // Below the stages, and outside the map, because it is not one of them: it
    // has no pour, no agitation and no pause, and folding it into the loop
    // would mean inventing a `Pour` that does not exist.
    const closing = bypass === undefined ? null : (
        <View key="row-bypass" testID="row-bypass"
              style={{paddingVertical: rungGap / 2}}>
            <BrewBypassRung
                testID="rung-bypass"
                volume={bypass.volume}
                temperature={bypass.temperature}
                delivered={bypass.delivered}
                state={bypass.state}
                accent={accent}
                laneSeconds={laneSeconds}
                barHeight={barHeight}
            />
        </View>
    );
```

**3e.** Render it in both returns. In the `!fill` branch:

```tsx
        return (
            <YStack testID="ladder">
                {rows}
                {closing}
            </YStack>
        );
```

and in the scrolling branch:

```tsx
            <View testID="ladder">{rows}{closing}</View>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest components/__tests__/BrewStageLadder.test.tsx`
Expected: PASS, whole file. The measured-overflow behaviour is unchanged: the extra rung simply makes the content taller, and `onContentSizeChange` already decides scrolling from the measurement rather than from the stage count.

- [ ] **Step 5: Commit**

```bash
git add components/BrewStageLadder.tsx components/__tests__/BrewStageLadder.test.tsx
git commit -m "Hang the bypass rung below the stages

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 11: The dashed box on the trace

**Files:**
- Modify: `components/BrewTrace.tsx:14-47` (props), `:80-112` (box), `:175-200` (chart)
- Test: `components/__tests__/BrewTrace.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `components/__tests__/BrewTrace.test.tsx`:

```tsx
it("draws a dashed box above the target for a bypass", async () => {
    await renderWithProviders(
        <BrewTrace
            {...traceProps}
            bypass={{volume: 5, temperature: 85, delivered: 5,
                     startedAt: 120, state: "done"}}
        />
    );
    const box = screen.getByTestId("trace-bypass");
    expect(box.props.fill).toBe("none");
    expect(box.props.strokeDasharray).toBe("4 4");
});

it("draws no box when there is no bypass", async () => {
    await renderWithProviders(<BrewTrace {...traceProps} />);
    expect(screen.queryByTestId("trace-bypass")).toBeNull();
});

it("slides the box to now while the machine is still waiting", async () => {
    // startedAt null and the run already past its plan: the box has no real
    // time to sit at, so it tracks the right-hand edge rather than pinning
    // itself to a plan time that has gone by.
    await renderWithProviders(
        <BrewTrace
            {...traceProps}
            plannedSeconds={100}
            samples={[{at: 160_000, water: 240, cup: 200, pour: 3}]}
            bypass={{volume: 5, temperature: 85, delivered: 0,
                     startedAt: null, state: "waiting"}}
        />
    );
    const box = screen.getByTestId("trace-bypass");
    const pinned = Number(box.props.x);
    expect(pinned).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest components/__tests__/BrewTrace.test.tsx -t "bypass"`
Expected: FAIL — `Unable to find an element with testID: trace-bypass`.

- [ ] **Step 3: Write minimal implementation**

**3a.** Extend the imports:

```tsx
import {bypassSeconds, livePoints, pathLength, planPoints, stageSpans, toPath,
        type Box} from "@/library/brew/brewShape";
import type {BypassView} from "@/library/brew/bypassState";
```

**3b.** Add to `Props`, after `onSelectStage`:

```tsx
    /**
     * The bypass, drawn as a dashed box sitting **on top of** the target.
     *
     * On top, not inside: the water target stays at the sum of the pours, and
     * the box rises above it. That is the same story the editor tells, so the
     * two screens do not disagree about what a bypass is.
     */
    bypass?: BypassView;
```

**3c.** Destructure it: `compact = false, stages, selectedIndex = null, onSelectStage, bypass`.

**3d.** Immediately after `const ranTo = …` (`:84`), add:

```tsx
    // The plan's final water level: where the target line ends, and the floor
    // the bypass box is stacked on.
    const planTop = plan.length > 0 ? plan[plan.length - 1].v : 0;
    const bypassMl = bypass === undefined ? 0 : Math.max(bypass.volume, 0);
    const bypassWide = bypassSeconds(bypassMl);
    // With no real start time the box tracks the later of the plan and now, so
    // it visibly slides right while the machine waits for the dripper instead
    // of sitting at a plan time that has already gone past.
    const bypassFrom = bypass === undefined ? 0
        : bypass.startedAt !== null ? bypass.startedAt
        : Math.max(plannedSeconds, ranTo);
```

**3e.** Widen the box so it fits — replace the `box` literal's two range lines:

```tsx
        maxT: Math.max(plannedSeconds, ranTo, bypassFrom + bypassWide),
        maxV: Math.max(
            planTop,
            water.length > 0 ? water[water.length - 1].v : 0,
            planTop + bypassMl
        )
```

**3f.** Immediately after the `boundaries` derivation (`:118`), add:

```tsx
    // Sized in the box's own units, so it moves with the axis rather than
    // needing its own scale.
    const bypassBox = bypass === undefined || bypassMl <= 0 || box.maxT <= 0
                      || box.maxV <= 0
        ? undefined
        : {
            x: (bypassFrom / box.maxT) * box.width,
            width: Math.max((bypassWide / box.maxT) * box.width, 2),
            y: svgHeight - ((planTop + bypassMl) / box.maxV) * svgHeight,
            height: Math.max((bypassMl / box.maxV) * svgHeight, 2)
          };
```

**3g.** In the full `chart`, immediately after the `trace-water` `Path` and before the closing `</Svg>`, add:

```tsx
                {bypassBox && (
                    <Rect
                        testID="trace-bypass"
                        x={bypassBox.x} y={bypassBox.y}
                        width={bypassBox.width} height={bypassBox.height}
                        fill="none"
                        stroke={bypass?.state === "pending" ? palette.line : accent}
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                    />
                )}
```

`Rect` is already imported. The compact render is left alone on purpose: at 86×34 in the mini bar a 5 ml box is under a pixel tall and would only be noise.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest components/__tests__/BrewTrace.test.tsx`
Expected: PASS, whole file.

- [ ] **Step 5: Commit**

```bash
git add components/BrewTrace.tsx components/__tests__/BrewTrace.test.tsx
git commit -m "Draw the bypass on the trace, sitting on top of the target

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 12: The `+5` badge on WATER

**Files:**
- Modify: `components/BrewFigures.tsx`
- Test: `components/__tests__/BrewFigures.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `components/__tests__/BrewFigures.test.tsx`:

```tsx
it("breaks the bypass out beside the water, rather than folding it in", async () => {
    await renderWithProviders(
        <BrewFigures water={240} cup={200} seconds={196} accent="#8ab4f8" bypass={5} />
    );
    expect(screen.getByText("240")).toBeTruthy();
    expect(screen.getByText("+5")).toBeTruthy();
});

it("shows no badge without a bypass", async () => {
    await renderWithProviders(
        <BrewFigures water={240} cup={200} seconds={196} accent="#8ab4f8" />
    );
    expect(screen.queryByTestId("figures-bypass")).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest components/__tests__/BrewFigures.test.tsx -t "bypass"`
Expected: FAIL — no element with text "+5".

- [ ] **Step 3: Write minimal implementation**

Replace the body of `components/BrewFigures.tsx` from `type Props` to the end with:

```tsx
type Props = {
    water: number;
    cup: number;
    seconds: number;
    accent: string;
    /**
     * Millilitres of bypass, if this brew had any.
     *
     * Broken out beside WATER rather than given a column of its own: at 28 pt
     * a fourth column is too tight to read on a narrow phone. And broken out
     * rather than added in, because 240 + 5 in one figure says the brew used
     * 245 ml of brew water, which it did not.
     */
    bypass?: number;
};

/** `2:06`. Floored, not rounded: a clock that shows 2:07 at 2:06.6 is wrong. */
function clock(seconds: number): string {
    const whole = Math.floor(Math.max(0, seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function Figure({label, value, color, badge}: {
    label: string; value: string; color: string; badge?: React.ReactNode;
}) {
    return (
        <YStack flex={1} gap="$1">
            <DotMatrixText fontSize={10} weight="bold" letterSpacing={1.6}
                           color={palette.dim}>
                {label}
            </DotMatrixText>
            <XStack alignItems="center" gap="$1.5">
                <DotMatrixText fontSize={28} weight="bold" color={color}>
                    {value}
                </DotMatrixText>
                {badge}
            </XStack>
        </YStack>
    );
}

/**
 * The three numbers, at the app's machine-readout scale.
 *
 * Rounded to whole units because the scale reports tenths and they flicker;
 * a figure this size that changes every 100 ms cannot be read at all.
 */
export default function BrewFigures({water, cup, seconds, accent, bypass}: Props) {
    // The same dashed outline the editor and the ladder use for a bypass, at
    // badge size. One mark, three places.
    const badge = bypass === undefined || bypass <= 0 ? undefined : (
        <XStack testID="figures-bypass"
                paddingHorizontal={4} paddingVertical={1}
                borderRadius="$2" borderWidth={1} borderStyle="dashed"
                borderColor={palette.line}>
            <DotMatrixText fontSize={11} weight="bold" color={palette.dim}>
                {`+${Math.round(bypass)}`}
            </DotMatrixText>
        </XStack>
    );

    return (
        <XStack gap="$3">
            <Figure label="WATER" value={String(Math.round(water))} color={accent}
                    badge={badge} />
            <Figure label="CUP" value={String(Math.round(cup))} color={palette.text} />
            <Figure label="TIME" value={clock(seconds)} color={palette.text} />
        </XStack>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest components/__tests__/BrewFigures.test.tsx`
Expected: PASS, whole file.

- [ ] **Step 5: Commit**

```bash
git add components/BrewFigures.tsx components/__tests__/BrewFigures.test.tsx
git commit -m "Break the bypass out beside the water figure

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 13: Wire the live brew screen

Note: `water` on the figures must now be the **brew** water, not the scale total. The last sample's `water` includes the bypass once it has landed.

**Files:**
- Modify: `app/brew.tsx:108-120` (reading the run), `:246-283` (the live branch)
- Test: `app/__tests__/brew.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `app/__tests__/brew.test.tsx`:

```tsx
it("shows the bypass rung while a bypass brew is running", async () => {
    await renderBrew({
        phase: {name: "pouring", pour: 3, pours: 3},
        bypass: {volume: 5, temperature: 85, delivered: 0,
                 startedAt: null, state: "waiting"}
    });
    expect(screen.getByTestId("rung-bypass")).toBeTruthy();
});

it("does not count bypass water into the WATER figure", async () => {
    await renderBrew({
        phase: {name: "settling"},
        samples: [{at: 190_000, water: 245, cup: 200, pour: 4}],
        bypass: {volume: 5, temperature: 85, delivered: 5,
                 startedAt: 183, state: "done"}
    });
    expect(screen.getByText("240")).toBeTruthy();
    expect(screen.getByText("+5")).toBeTruthy();
});
```

Extend the file's `renderBrew` helper so its fake run object carries `bypass`, matching how it already carries `stageWater` and `stalls`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest app/__tests__/brew.test.tsx -t "bypass"`
Expected: FAIL — no `rung-bypass`, and the WATER figure reads 245.

- [ ] **Step 3: Write minimal implementation**

**3a.** After `const pauseElapsed = run?.pauseElapsed ?? 0;` (`:110`), add:

```tsx
    const bypass = run?.bypass;
    // The scale reports one running total, and the bypass goes onto the same
    // scale — so the last reading is brew water *plus* bypass. The figure has
    // to name the brew water, with the bypass beside it, or a 240 ml recipe
    // reads as having used 245.
    const scaleTotal = last?.water ?? 0;
    const brewWater = Math.max(0, scaleTotal - (bypass?.delivered ?? 0));
```

Move this below the existing `const last = samples[samples.length - 1];` (`:134`) if the ordering requires it — `last` must be declared first.

**3b.** Pass `bypass={bypass}` to the live `BrewTrace` and to the live `BrewStageLadder`.

**3c.** Change the live `BrewFigures` to:

```tsx
                    <BrewFigures
                        water={brewWater}
                        cup={last?.cup ?? 0}
                        seconds={elapsed}
                        accent={accent}
                        bypass={bypass?.delivered}
                    />
```

**3d.** In the `phase.name === "done"` branch, pass the same three through `BrewSummary`:

```tsx
                        water={brewWater}
                        cup={last?.cup ?? 0}
                        seconds={elapsed}
                        bypass={bypass}
```

(`BrewSummary` gains that prop in Task 14; do this task and the next together if the type-check between them is inconvenient.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest app/__tests__/brew.test.tsx`
Expected: PASS, whole file.

- [ ] **Step 5: Commit**

```bash
git add app/brew.tsx app/__tests__/brew.test.tsx
git commit -m "Show the bypass on the live brew, and keep it out of the water figure

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 14: Wire the summary and the history record

**Files:**
- Modify: `components/BrewSummary.tsx:28-60` (props), `:95-160` (the three children)
- Modify: `app/brewRecord.tsx` (the `BrewSummary` call)
- Test: `components/__tests__/BrewSummary.test.tsx`, `app/__tests__/brewRecord.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `components/__tests__/BrewSummary.test.tsx`:

```tsx
it("carries the bypass into the ladder, the trace and the figures", async () => {
    await renderWithProviders(
        <BrewSummary
            {...summaryProps}
            water={240}
            bypass={{volume: 5, temperature: 85, delivered: 5,
                     startedAt: 183, state: "done"}}
        />
    );
    expect(screen.getByTestId("rung-bypass")).toBeTruthy();
    expect(screen.getByTestId("trace-bypass")).toBeTruthy();
    expect(screen.getByText("+5")).toBeTruthy();
});
```

Append to `app/__tests__/brewRecord.test.tsx`:

```tsx
it("draws the bypass a record kept", async () => {
    await renderRecord({
        ...aRecord,
        waterTotal: 245,
        bypass: {volume: 5, temperature: 85, delivered: 5, startedAt: 183_000}
    });
    expect(screen.getByTestId("rung-bypass")).toBeTruthy();
    expect(screen.getByText("+5")).toBeTruthy();
});

it("draws an old record exactly as before", async () => {
    await renderRecord(aRecord);
    expect(screen.queryByTestId("rung-bypass")).toBeNull();
    expect(screen.queryByTestId("figures-bypass")).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest components/__tests__/BrewSummary.test.tsx app/__tests__/brewRecord.test.tsx -t "bypass"`
Expected: FAIL on the two positive cases; the "old record" case should already pass, and must keep passing.

- [ ] **Step 3: Write minimal implementation**

**3a.** In `components/BrewSummary.tsx`, add the import and the prop:

```tsx
import type {BypassView} from "@/library/brew/bypassState";
```

```tsx
    /** The bypass this brew had, if any. Absent on every record without one. */
    bypass?: BypassView;
```

Destructure it in the signature, then pass `bypass={bypass}` to the `BrewTrace` and to the `BrewStageLadder`, and `bypass={bypass?.delivered}` to the `BrewFigures`.

**3b.** In `library/brew/bypassState.ts`, add a reader for a stored record:

```ts
/**
 * A stored record's bypass, as the views want it.
 *
 * Absent on every row written before the field existed and on every recipe
 * without a bypass, which is exactly the fallback `plan` and `stageWater`
 * already use — an old record draws as it always did.
 *
 * The state is always terminal: a record is a brew that has ended. It is
 * `waiting` rather than `done` when nothing was delivered, so a machine that
 * never dispensed is not drawn as though it had.
 */
export function bypassViewFromRecord(
    bypass: {volume: number; temperature: number; delivered: number;
             startedAt: number | null} | undefined
): BypassView | undefined {
    if (bypass === undefined || bypass.volume <= 0) return undefined;
    return {
        volume: bypass.volume,
        temperature: bypass.temperature,
        delivered: bypass.delivered,
        // Milliseconds on the record, seconds on the trace's axis.
        startedAt: bypass.startedAt === null ? null : bypass.startedAt / 1000,
        state: bypass.delivered > 0 ? "done" : "waiting"
    };
}
```

**3c.** In `app/brewRecord.tsx`, add the import:

```tsx
import {bypassViewFromRecord} from "@/library/brew/bypassState";
```

then, beside the other derivations before the `BrewSummary` call, add:

```tsx
    const bypass = bypassViewFromRecord(record.bypass);
    // The scale's running total includes the bypass, so the brew water is the
    // total less what the bypass put in. Same reasoning as the live screen.
    const brewWater = Math.max(0, record.waterTotal - (bypass?.delivered ?? 0));
```

and on the `BrewSummary` call, change `water={record.waterTotal}` to `water={brewWater}` and add `bypass={bypass}`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest components/__tests__/BrewSummary.test.tsx app/__tests__/brewRecord.test.tsx`
Expected: PASS, both files whole.

- [ ] **Step 5: Commit**

```bash
git add components/BrewSummary.tsx app/brewRecord.tsx library/brew/bypassState.ts components/__tests__/BrewSummary.test.tsx app/__tests__/brewRecord.test.tsx
git commit -m "Carry the bypass into the summary and the kept record

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 15: Replay the brew that started this

The regression test. Built from the frame log in the spec, this is the case that would have caught the defect before it reached a device.

**Files:**
- Create: `library/brew/__tests__/bypassReplay.test.ts`

- [ ] **Step 1: Write the failing test**

Create `library/brew/__tests__/bypassReplay.test.ts`:

```ts
import {stageWaterFromSamples, stallsFromSamples, type BrewSample}
    from "@/library/brew/BrewRecord";

/**
 * The brew of 2026-09-10, as its frame log records it.
 *
 * Three stages of 40, 115 and 85 ml, then a 61-second drawdown wait at the
 * last stage's target, then a 5 ml bypass. The machine emitted 40510(0),
 * 40510(1), 40510(2) and no fourth pour start — so before the bypass had a
 * lane, every one of these samples from t=100 onwards was stamped `pour: 3`.
 *
 * `pour: 4` is what the recorder now stamps. This asserts the consequence.
 */
const samples: BrewSample[] = [
    {at:      0, water:   0, cup:   0, pour: 1},
    {at:  13_000, water:  40, cup:   0, pour: 1},
    {at:  60_000, water:  40, cup:  10, pour: 2},
    {at:  96_000, water: 155, cup:  60, pour: 2},
    {at: 123_000, water: 155, cup: 120, pour: 3},
    {at: 150_000, water: 240, cup: 170, pour: 3},
    // The drawdown. Flat, at the target, for just over a minute.
    {at: 180_000, water: 240, cup: 195, pour: 3},
    {at: 211_000, water: 240, cup: 200, pour: 3},
    // The bypass, in its own lane.
    {at: 212_000, water: 245, cup: 205, pour: 4}
];

const targets = [40, 115, 85];

describe("the bypass brew of 2026-09-10", () => {
    it("does not fold the bypass into the last stage", () => {
        expect(stageWaterFromSamples(samples, 3)).toEqual([40, 115, 85]);
    });

    it("puts the bypass in the lane after the stages", () => {
        expect(stageWaterFromSamples(samples, 4)[3]).toBe(5);
    });

    it("finds no stall in the drawdown wait", () => {
        // This is the amber the screenshot showed. The plateau was flat at the
        // stage's target, so the trailing-plateau guard would have spared it —
        // but the bypass's rise closed it first, and `push` has no target
        // guard. Moving the bypass out of the stage is what removes it.
        expect(stallsFromSamples(samples, targets)[2]).toEqual([]);
    });

    it("finds no stall anywhere in a brew that went well", () => {
        expect(stallsFromSamples(samples, targets).flat()).toEqual([]);
    });
});
```

- [ ] **Step 2: Run test to verify it fails, against the old stamping**

Temporarily change the last sample's `pour: 4` to `pour: 3` and run:

Run: `npx jest library/brew/__tests__/bypassReplay.test.ts`
Expected: FAIL — stage 3 reads 90, and `stallsFromSamples(...)[2]` holds one stall of about 61 s. **This is the defect, reproduced.** Change it back to `pour: 4`.

- [ ] **Step 3: No implementation needed**

Task 7 already did it. This test exists to hold that fix down.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest library/brew/__tests__/bypassReplay.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add library/brew/__tests__/bypassReplay.test.ts
git commit -m "Replay the brew that showed the bug, so it cannot come back

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 16: Promote 40520 in the documentation, and run the gate

**Files:**
- Modify: `docs/machine-integration/ble-protocol.md:157`
- Modify: `docs/superpowers/plans/2026-09-07-bypass-water.md:208`
- Modify: `docs/superpowers/plans/2026-09-08-bypass-editing.md:3080`
- Modify: `docs/superpowers/specs/2026-09-08-bypass-editing-design.md:411`

- [ ] **Step 1: Promote the protocol row**

In `docs/machine-integration/ble-protocol.md`, replace the `40520` row:

```
| 40520 | 0x9E48 | RD_Bypass | — | Bypass/dilution pour event | single-source (Alshekhi) |
```

with:

```
| 40520 | 0x9E48 | RD_Bypass | — | The bypass firing, after the drawdown | **verified** (capture 2026-09-10) |
```

- [ ] **Step 2: Correct the three documents that called it unverified**

At each of the three cited lines, replace the wording that calls `40520` unverified or single-source with:

```
Verified by a full frame log of 2026-09-10: a three-stage recipe with a 5 ml
bypass emitted 40510(0), 40510(1), 40510(2), then 40520 — 61 s after the last
pour began and 8 s before BREWER_STOP. The app now enters a `bypass` phase on
it; see `docs/superpowers/specs/2026-09-10-brew-bypass-display-design.md`.
```

Read each line first with `sed -n '<n>,<n+4>p' <file>` and fit the replacement to the sentence around it.

- [ ] **Step 3: Run the full gate**

```bash
npm test && npm run typecheck && npm run lint
```

Expected: all suites pass (2502 + the ~25 added here), `tsc` clean, lint 0 errors and no more than the 6 pre-existing warnings.

- [ ] **Step 4: Commit and push**

```bash
git add docs
git commit -m "Promote event 40520 from assumed to verified

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
git push
```

---

## Device verification

None of this can be settled in a simulator: it needs a machine, a bypass recipe and a real brew.

- [ ] Brew a recipe with a 5 ml bypass. Before the last stage finishes, the bypass rung is on the ladder, dashed and dimmed, reading `5 ml`.
- [ ] Once the last stage has poured and rested, the rung reads `WAITING`. **No amber anywhere** on the last stage, however long the drawdown takes.
- [ ] When the machine dispenses, the rung fills and reads `5/5 ml`, and the dashed box on the trace stops sliding.
- [ ] The last stage reads `85/85 ml`, not `90/85 ml`.
- [ ] The finished summary reads `WATER 240` with a dashed `+5` beside it.
- [ ] Export the summary as an image and confirm the bypass rung is in the PNG.
- [ ] Open the brew from history: it looks the same as it did live.
- [ ] Open an **older** brew from history: unchanged, no bypass rung, no badge.
- [ ] Brew a recipe with no bypass: no rung, no box, no badge, and the water figure is what it always was.

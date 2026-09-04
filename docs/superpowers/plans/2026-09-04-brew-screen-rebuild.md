# Brew Screen Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the brew screen so it fills the device, tells the truth about what the machine is doing, and shows per-stage progress that is driven by water rather than by a frozen stage index.

**Architecture:** Four layers, unchanged. `library/machine/` gains a corrected pour index, a state that goes stale, and two new refusal kinds. `library/brew/` gains two pure modules — `stalls.ts` (finds the moments water stopped moving) and `rungGeometry.ts` (turns a pour plus its stalls into drawable segments) — both plain functions with no React. `hooks/useBrewRun.ts` computes stalls per stage and publishes them on the snapshot. `components/` rebuild the rung, the ladder and the trace against measured height rather than constants. `app/brew.tsx` becomes a modal declared in the navigator, drawing its own nav row.

**Tech Stack:** Expo SDK 57, React Native, TypeScript, Tamagui, `react-native-svg`, Jest + `@testing-library/react-native` v14 (async `render`/`fireEvent`, always via `renderWithProviders`).

**Design spec:** `docs/superpowers/specs/2026-09-04-brew-screen-rebuild-design.md`. Tracking issue: #87. Branch: `m4-watch-it-brew`.

---

## Conventions this plan assumes

- Import through the `@/` alias.
- Every colour comes from `constants/colors.ts` (`palette`). Keys are `base, surface, raised, line, control, muted, dim, text, brand, success, danger, warn, info`. It is `warn`, never `warning`. No hex literals, no named CSS colours.
- No em dashes in user-facing copy.
- The React Compiler is on: do not hand-write `useMemo`/`useCallback`, and destructure props before using them in a hook.
- `react-hooks/set-state-in-effect` and `react-hooks/purity` are lint **errors**. `onLayout` is an event handler, not an effect, so `setState` inside it is allowed and is how the elastic bands measure.
- Component tests render through `renderWithProviders` from `test-utils/render.tsx` and `await` it.
- Test fixtures: the real constants are `CUP_TYPE.XPOD` and `AGITATION.ALL_OFF`. `Pour`'s signature is `Pour(pourNumber, volume, temperature, flowRate, agitation, pourPattern, pauseTime)` and `flowRate` is stored times ten, so `40` is 4 ml/s. Every arithmetic expectation below assumes 4 ml/s. That is fine for the pure functions in `library/brew/` and for components, but `Machine.brewBlock` refuses a flow rate outside the card's 30 to 35 range, so a fixture fed to `machine.brew()` must use `30` and its arithmetic recomputed at 3 ml/s.
- `FakeTransport.emit` takes a `number[]`, not a `Uint8Array`.

**Validation commands** (run before every commit):

```bash
npm run typecheck
npm run lint
npm test
```

`npx expo-doctor` must stay at 21/21; it is a hard CI failure. Run it once at the end.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `library/brew/stalls.ts` | Pure. Given the sample stream and a stage, find every moment water stopped moving while the plan said it should be pouring. Returns `{atMl, seconds}[]`. |
| `library/brew/__tests__/stalls.test.ts` | Its tests. |
| `library/brew/rungGeometry.ts` | Pure. Given a pour, the millilitres delivered, the pause elapsed and the stalls, produce the ordered list of drawable segments for one rung's lane. |
| `library/brew/__tests__/rungGeometry.test.ts` | Its tests. |

**Modified**

| File | Change |
|---|---|
| `library/machine/Machine.ts` | Pour index off-by-one; `state` staleness; `noWater`/`noBeans` block kinds; event `40517` during grinding. |
| `library/machine/__tests__/Machine.test.ts` | Characterisation tests for all four. |
| `constants/machine.ts` | `STATE_FRESH_MS`. |
| `constants/brewCopy.ts` | Em dashes out; `connecting` copy; the hopper sentence; new headlines; `NO_BEANS_WHILE_GRINDING`. |
| `library/brew/BrewRecord.ts` | `stalls` on the record. |
| `hooks/useBrewRun.ts` | Volume-based stage progress, sample-based holding, per-stage stalls on the snapshot. |
| `hooks/useLiveBrew.tsx` | Carry `stalls` and `stageWater` through the snapshot. |
| `components/BrewStageRung.tsx` | Full rewrite: `flex: 1` lane, segment rendering, five states, stall bands. |
| `components/BrewStageLadder.tsx` | Elastic bands, `GLYPH_WORDS` deleted, the now card becomes its own component's job. |
| `components/BrewNowCard.tsx` | Created — the one-sentence card. |
| `components/BrewTrace.tsx` | Gradient fill, stage gridlines, legend row beneath, counter row removed. |
| `constants/dotIcons.ts` | `chevron-down`. |
| `constants/__tests__/dotIcons.test.ts` | Its name list. |
| `app/brew.tsx` | Nav row, elastic layout, chevron-down, DONE removed, error suppression. |
| `app/_layout.tsx` | Declare `brew` as a modal with `headerShown: false`. |
| `components/BrewMiniBar.tsx` | Padding, chevron removed, recipe accent, no em dash. |
| `components/LiveBrewBar.tsx` | Hide on `/brewRecord` and `/brewHistory`; animated dismissal. |

---

## Task 1: The pour index is zero-based

The machine sends `pour_index=0` for the first pour. `Math.max(value ?? 1, 1)` clamps it up, which makes stage 1 right by accident and every later stage wrong by one. This single line is the cause of the frozen counter, the rung that filled and stayed, the rung that never animated, the last stage that never went active, and the holding warning that never cleared.

**Files:**
- Modify: `library/machine/Machine.ts:857`
- Test: `library/machine/__tests__/Machine.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `library/machine/__tests__/Machine.test.ts`. Note the existing helper at the top of that file is named `Uint8ArrayPourEvent` and its comment says "one-based" — correct the comment while you are there.

```ts
describe("the machine's pour index", () => {
    it("is zero-based, so index 0 is stage 1 of six", async () => {
        // From the HCI snoop quoted in docs/machine-integration/ble-protocol.md:
        // a six-pour recipe reports pour_index 0,1,2,3,4,5 — not 1..6.
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        await machine.connect("AA:BB");

        const seen: number[] = [];
        machine.onPhase((phase) => {
            if (phase.name === "pouring") seen.push(phase.pour);
        });

        const recipe = sixPourRecipe();
        transport.emit(machineInfoFrame());
        transport.emit(status(0x01));
        await machine.brew(recipe);

        for (const index of [0, 1, 2, 3, 4, 5]) {
            transport.emit(new Uint8Array(Uint8ArrayPourEvent(index)));
        }

        expect(seen.slice(-6)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it("clamps an index past the end rather than reporting stage seven of six", async () => {
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        await machine.connect("AA:BB");

        const seen: number[] = [];
        machine.onPhase((phase) => {
            if (phase.name === "pouring") seen.push(phase.pour);
        });

        transport.emit(machineInfoFrame());
        transport.emit(status(0x01));
        await machine.brew(sixPourRecipe());

        transport.emit(new Uint8Array(Uint8ArrayPourEvent(9)));

        expect(seen[seen.length - 1]).toBe(6);
    });
});
```

And the helper the two tests share, placed next to the other helpers at the top of the file:

```ts
/** Six identical pours. The HCI snoop in docs/machine-integration was captured on six. */
function sixPourRecipe(): Recipe {
    const recipe = new Recipe();
    recipe.cupType = CUP_TYPE.XPOD;
    recipe.dosage = 18;
    recipe.ratio = 16;
    // Pour(pourNumber, volume, temperature, flowRate, agitation, pattern, pause).
    // flowRate is stored times ten, so 40 is 4 ml/s.
    recipe.pours = [1, 2, 3, 4, 5, 6].map(
        (n) => new Pour(n, 48, 93, 40, AGITATION.ALL_OFF, POUR_PATTERN.CENTERED, 20)
    );
    return recipe;
}
```

- [ ] **Step 2: Run it and see it fail**

```bash
npx jest library/machine/__tests__/Machine.test.ts -t "zero-based"
```

Expected: FAIL. `seen.slice(-6)` is `[1, 1, 2, 3, 4, 5]`.

- [ ] **Step 3: Fix the index**

In `library/machine/Machine.ts`, in `onEvent`, replace the `EVENT.POUR_START` case:

```ts
            case EVENT.POUR_START:
                this.setPhase({
                    name: "pouring",
                    // The machine's index is **zero-based**: the HCI snoop
                    // quoted in docs/machine-integration/ble-protocol.md
                    // records 0 for the first pour of six and 5 for the last.
                    // Clamping it up to one with `Math.max`
                    // made the first stage right by accident and every later
                    // stage wrong by one, which froze the counter, stopped the
                    // second rung ever animating and left the holding warning
                    // permanently on.
                    pour: Math.min((value ?? 0) + 1, this.pourCount),
                    pours: this.pourCount
                });
                break;
```

`EVENT.GRINDER_STOP` above it keeps `pour: 1`: that one is ours, not the machine's, and it means "the first pour is about to begin".

- [ ] **Step 4: Run it and see it pass**

```bash
npx jest library/machine/__tests__/Machine.test.ts
```

Expected: PASS, whole file.

- [ ] **Step 5: Commit**

```bash
npm run typecheck && npm run lint && npm test
git add library/machine/Machine.ts library/machine/__tests__/Machine.test.ts
git commit -m "fix: the machine's pour index is zero-based

The HCI snoop quoted in docs/machine-integration/ble-protocol.md records
pour_index 0 for the first pour. Math.max(value, 1) clamped that up, so the counter froze at
1/4, the second rung never animated, the last stage never went active,
and the holding warning never cleared.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: The machine is not busy

`Machine.state` is written only when a status frame arrives and cleared only on disconnect. After a refusal it holds `NO_WATER` or `NO_BEANS` forever, and `STARTABLE` is only `{IDLE, COMPLETE, READY}`, so every later attempt is refused as busy on an idle machine with a full tank until the app is force quit.

Two changes. A state reading goes stale, and the two fault states stop being classed as busy.

**Files:**
- Modify: `constants/machine.ts`
- Modify: `library/machine/Machine.ts` (the `state` write in `receiveFrame`, `BrewBlock`, `brewBlock`, `brew`)
- Modify: `constants/brewCopy.ts` (`BLOCKED_HEADLINE`)
- Test: `library/machine/__tests__/Machine.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `library/machine/__tests__/Machine.test.ts`:

```ts
describe("a stale state does not refuse a fresh brew", () => {
    it("does not refuse forever on a fault the user has since fixed", async () => {
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        await machine.connect("AA:BB");
        transport.emit(machineInfoFrame());

        // The machine complained about its tank, and the user filled it.
        transport.emit(status(0x0C));
        expect(machine.brewBlock(sixPourRecipe())?.kind).toBe("noWater");

        jest.advanceTimersByTime(STATE_FRESH_MS + 1);

        expect(machine.brewBlock(sixPourRecipe())).toBeNull();
    });

    it("still believes a machine that said it was brewing and then went quiet", async () => {
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        await machine.connect("AA:BB");
        transport.emit(machineInfoFrame());

        transport.emit(status(0x10));
        jest.advanceTimersByTime(STATE_FRESH_MS * 10);

        // Grinding emits no status frame for about twenty seconds and a pour
        // emits none for minutes, so silence is what a busy machine sounds
        // like. Expiring this would send a recipe into a running brew.
        expect(machine.brewBlock(sixPourRecipe())?.kind).toBe("busy");
    });

    it("calls a low tank a low tank, not a busy machine", async () => {
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        await machine.connect("AA:BB");
        transport.emit(machineInfoFrame());
        transport.emit(status(0x0C));

        expect(machine.brewBlock(sixPourRecipe())?.kind).toBe("noWater");
    });

    it("calls an empty hopper an empty hopper, not a busy machine", async () => {
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        await machine.connect("AA:BB");
        transport.emit(machineInfoFrame());
        transport.emit(status(0x0F));

        expect(machine.brewBlock(sixPourRecipe())?.kind).toBe("noBeans");
    });
});
```

At the top of that describe block, the timers must be fake so the staleness can be advanced:

```ts
beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });
```

Import `STATE_FRESH_MS` alongside the other constants already imported from `@/constants/machine`.

- [ ] **Step 2: Run them and see them fail**

```bash
npx jest library/machine/__tests__/Machine.test.ts -t "stale state"
```

Expected: FAIL — `STATE_FRESH_MS` is not exported, and the two fault states report `busy`.

- [ ] **Step 3: Implement**

In `constants/machine.ts`, add:

```ts
/**
 * How long a state reading is worth believing.
 *
 * `state` is written only when the machine volunteers a status frame and was
 * previously cleared only on disconnect, so a refusal left `NO_WATER` sitting
 * there and every later attempt was refused as busy — on an idle machine with
 * a full tank — until the app was force quit.
 *
 * This expires **fault states only**, never activity. A busy machine goes
 * quiet: `docs/machine-integration/ble-protocol.md` records that grinding
 * emits no status frame for about twenty seconds, and status is event-driven,
 * so a three-minute pour produces one frame at the start and nothing until it
 * completes. Expiring an activity state would therefore let the app decide a
 * mid-pour machine was free and send it a recipe and a commit — a worse
 * failure than the one being fixed, and one the protocol notes behaves
 * differently across firmware.
 *
 * A fault is the opposite case. It is fixed by the user, at the machine, while
 * the app is not looking, and the machine does not always announce the repair.
 * Fifteen seconds is long enough that nobody sees a stale refusal and short
 * enough that a tank filled during the refusal is believed on the retry.
 */
export const STATE_FRESH_MS = 15_000;
```

In `library/machine/Machine.ts`:

Widen the block kind:

```ts
/** Why a brew will not start, in a form the UI can branch on. */
export type BrewBlock = {
    kind: "notConnected" | "noVitals" | "notEnoughWater" | "noWater" | "noBeans"
        | "busy" | "recipe";
    /** The sentence to show. Still the only thing most callers need. */
    message: string;
};
```

Record when the state was heard. Add the field beside `state`:

```ts
    /** When `state` was last heard, as a wall clock. 0 means never. */
    private stateAt = 0;
```

and in `receiveFrame`:

```ts
        if (parsed.kind === "status") {
            this.state = parsed.state;
            this.stateAt = Date.now();
            this.onState(parsed.state);
        }
```

Add the reader and the fault map above `brewBlock`:

```ts
    /**
     * The machine's state, with an expired fault treated as unknown.
     *
     * Only a fault expires. The alternative to expiring one is refusing a brew
     * on a reading from before the user filled the tank it complained about,
     * which is the bug this fixes. The alternative to *keeping* an activity
     * state is deciding a silently grinding machine is free, which is worse.
     */
    private freshState(): number | null {
        if (this.state === null) return null;
        if (FAULT_BLOCKS[this.state] === undefined) return this.state;
        if (Date.now() - this.stateAt > STATE_FRESH_MS) return null;
        return this.state;
    }

/** States that are faults rather than activity. They are not "busy". */
const FAULT_BLOCKS: Record<number, BrewBlock> = {
    [MACHINE_STATE.NO_WATER]: {
        kind: "noWater",
        message: "The machine's water tank is empty. Fill it and try again."
    },
    [MACHINE_STATE.NO_BEANS]: {
        kind: "noBeans",
        message: "The machine is waiting for beans. Fill the hopper and try again."
    }
};
```

`FAULT_BLOCKS` goes at module scope next to `STARTABLE`, not inside the class.

Then in `brewBlock`, replace the busy check:

```ts
        const state = this.freshState();
        if (state !== null) {
            const fault = FAULT_BLOCKS[state];
            // A fault is not activity. Telling somebody with an empty hopper
            // to wait for the machine to finish is both wrong and unactionable.
            if (fault !== undefined) return fault;
            if (!STARTABLE.has(state)) {
                return {kind: "busy", message: "The machine is busy. Wait for it to finish."};
            }
        }
```

**Do not clear `state` in `brew()`.** It looks like the tidy thing to do and it is a live hazard. The pre-flight sends `MACHINE_INFO` (40521) and waits for an info reply; it never asks for a status frame, and the protocol has no way to ask for one. So clearing the state before the pre-flight guarantees `freshState()` returns null when `brewBlock` runs, which makes the busy check unreachable on real hardware: a machine that announced `BREWING` a second ago would be sent a full recipe and an 8002 commit. `freshState()` is the entire fix; the reset subtracts from it.

In `forget()`, where `state` is already cleared, clear `stateAt` beside it:

```ts
        this.state = null;
        this.stateAt = 0;
```

Inert today, because `freshState` short-circuits on a null `state` before it reads the age. But "`stateAt` is the age of `state`" is the invariant that makes `freshState` correct, and an invariant that holds at two of its three sites is not one.

Finally, in `constants/brewCopy.ts`, add the two headlines to `BLOCKED_HEADLINE`:

```ts
export const BLOCKED_HEADLINE: Record<string, string> = {
    notEnoughWater: BLOCKED_WATER_HEADLINE,
    notConnected:   "THE MACHINE IS NOT CONNECTED",
    noVitals:       "THE MACHINE HAS NOT ANSWERED YET",
    noWater:        "THE MACHINE'S TANK IS EMPTY",
    noBeans:        "THE HOPPER IS EMPTY",
    busy:           "THE MACHINE IS BUSY",
    recipe:         "THIS RECIPE WILL NOT GO ON A CARD"
};
```

- [ ] **Step 4: Run them and see them pass**

```bash
npx jest library/machine/__tests__/Machine.test.ts
```

Expected: PASS, whole file.

- [ ] **Step 5: Commit**

```bash
npm run typecheck && npm run lint && npm test
git add constants/machine.ts constants/brewCopy.ts library/machine/Machine.ts library/machine/__tests__/Machine.test.ts
git commit -m "fix: a stale machine state no longer refuses every later brew

state was written only on a status frame and cleared only on disconnect,
so a refusal left NO_WATER there and everything afterwards was refused as
busy until the app was force quit. A reading now goes stale, brew()
forgets it before its pre-flight, and the two fault states get their own
refusals instead of being called activity.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Beans, during grinding

Event `40517` (`EVENT.ERROR_IDLING`) maps to `idling` unconditionally. Arriving during grinding it almost certainly means the machine is flashing `+BEANS`, and "the machine went idle before the brew started" sends the user looking in the wrong place.

Note that `MACHINE_STATE.NO_BEANS` (`0x0F`) already produces `failed`/`noBeans` in `onState`, for the case where the machine says so itself. This task adds the inferred case, and both share one copy string.

**Files:**
- Modify: `library/machine/Machine.ts` (`FAILURE_EVENTS`, `onEvent`)
- Modify: `constants/brewCopy.ts` (`FAILURE_COPY`)
- Test: `library/machine/__tests__/Machine.test.ts`

- [ ] **Step 1: Write the failing test**

The suite has helpers — use them rather than hand-rolling a transport. `readyMachine()` (line 124) connects, sends the info frame, puts the machine in `0x01` and clears `transport.written`. `brewable()` (line 100) is a two-pour recipe the machine will accept. `notification` and `status` are already imported from `./protocolFixtures`.

Grinding is reached with a **status frame**, `status(0x22)` = `MACHINE_STATE.STARTING` — not with event `40502`, which `Machine.ts` does not handle at all.

```ts
describe("event 40517", () => {
    it("means beans when it arrives during grinding", async () => {
        const {transport, machine} = await readyMachine();
        await machine.brew(brewable());

        // The grinder is running; then the machine stops and idles.
        transport.emit(status(0x22));
        expect(machine.phase.name).toBe("grinding");
        transport.emit(new Uint8Array(notification(40517 & 0xFF, 40517 >> 8, [0])));

        expect(machine.phase).toMatchObject({name: "failed", reason: "noBeans"});
    });

    it("still means idling when it arrives before grinding", async () => {
        const {transport, machine} = await readyMachine();
        await machine.brew(brewable());

        transport.emit(new Uint8Array(notification(40517 & 0xFF, 40517 >> 8, [0])));

        expect(machine.phase).toMatchObject({name: "failed", reason: "idling"});
    });
});
```

- [ ] **Step 2: Run it and see it fail**

```bash
npx jest library/machine/__tests__/Machine.test.ts -t "40517"
```

Expected: FAIL — the first case reports `idling`, the second passes already.

A second case that passes before the change is intentional: it is there to catch the over-correction where every `40517` becomes `noBeans`. Confirm it fails if you make the mapping unconditional.

- [ ] **Step 3: Implement**

In `library/machine/Machine.ts`, remove `40517` from `FAILURE_EVENTS`:

```ts
const FAILURE_EVENTS: Record<number, BrewFailure> = {
    40522: "noWater",
    8203:  "gearPosition",
    8204:  "doseMismatch"
    // EVENT.ERROR_IDLING is deliberately absent: it means different things
    // depending on the phase it arrives in, and `onEvent` decides.
};
```

and at the top of `onEvent`, before the `FAILURE_EVENTS` lookup:

```ts
        if (code === EVENT.ERROR_IDLING) {
            // During grinding the machine is almost certainly flashing +BEANS:
            // it stops the burr and idles rather than reporting an empty
            // hopper as its own event. Outside grinding it is what it says.
            this.setPhase(this.phase.name === "grinding"
                ? {name: "failed", reason: "noBeans"}
                : {name: "failed", reason: "idling"});
            return;
        }
```

`EVENT` is already imported from `./protocol`, where `ERROR_IDLING: 40517` is defined. Do not introduce a second constant for the same number.

Then in `constants/brewCopy.ts`, in the **`FAILURE_COPY`** table (line 22 — not `BLOCKED_HEADLINE` and not `MINI_FAILURE_WHY`, which have their own `noBeans` entries for the pre-flight refusal and are correct as they are):

```ts
    noBeans:      "The machine stopped during grinding. Check there are beans in the hopper.",
```

This string now serves both the inferred case and `MACHINE_STATE.NO_BEANS`. It has to be true of both, which is why it describes what happened rather than what the machine reported.

- [ ] **Step 4: Run it and see it pass**

```bash
npx jest library/machine/__tests__/Machine.test.ts
```

Expected: PASS, whole file. If another test asserts the old `"The machine is waiting for beans."` it will fail here — update it, and say so in your report.

- [ ] **Step 5: Commit**

```bash
npm run typecheck && npm run lint && npm test
git add library/machine/Machine.ts constants/brewCopy.ts library/machine/__tests__/Machine.test.ts
git commit -m "fix: 40517 during grinding means an empty hopper

The machine stops the burr and idles rather than reporting no beans as
its own event, so the app told a user with an empty hopper that the brew
had gone idle before it started.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: Say true things

Three copy defects: em dashes, the false "nothing has been sent to the machine", and the missing `connecting` line.

**Files:**
- Modify: `constants/brewCopy.ts`
- Modify: `components/BrewMiniBar.tsx` (the `say()` em dash)
- Test: `constants/__tests__/brewCopy.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

Create or extend `constants/__tests__/brewCopy.test.ts`:

`constants/brewCopy.ts` has **five** tables of user-facing strings plus two loose ones. Flatten all of them, or the guard only covers the two the task happens to touch and the next em dash lands somewhere else.

```ts
import {
    BLOCKED_HEADLINE, BLOCKED_WATER_HEADLINE, blockedWaterCopy, FAILURE_COPY,
    FIRST_BREW_REMINDER, MINI_FAILURE_WHY, PHASE_COPY, PRO_MODE_PROMPT
} from "@/constants/brewCopy";

/** Every string the user can read, flattened. */
const ALL: string[] = [
    ...Object.values(PHASE_COPY),
    ...Object.values(FAILURE_COPY),
    ...Object.values(BLOCKED_HEADLINE),
    ...Object.values(MINI_FAILURE_WHY),
    BLOCKED_WATER_HEADLINE,
    FIRST_BREW_REMINDER,
    PRO_MODE_PROMPT,
    blockedWaterCopy(240)
];

describe("brew copy", () => {
    it("uses no em dashes", () => {
        for (const line of ALL) expect(line).not.toContain("\u2014");
    });

    it("does not claim nothing was sent, because opening a session beeps", () => {
        expect(blockedWaterCopy(240)).not.toContain("nothing has been sent");
    });

    it("says the dose is safe in words the user can act on", () => {
        expect(blockedWaterCopy(240)).toContain("240 ml");
        expect(blockedWaterCopy(240)).toContain("still in the hopper");
    });

    it("has a line for the commanded-but-unmoved window", () => {
        expect(PHASE_COPY.connecting).toBe("Connecting to the machine…");
    });
});
```

- [ ] **Step 2: Run it and see it fail**

```bash
npx jest constants/__tests__/brewCopy.test.ts
```

Expected: FAIL on the em dash case (`PHASE_COPY.lostContact` and `blockedWaterCopy`), on the "nothing was sent" case, on the hopper sentence, and on the missing `connecting` key — four failures.

- [ ] **Step 3: Implement**

In `constants/brewCopy.ts`, make **two** edits to `PHASE_COPY`. Do not retype the table: every entry in it already carries a comment explaining why it is worded as it is, and those comments are the most valuable thing in the file. Add one key and change one string, in place.

Add after `idle`:

```ts
    /**
     * Commanded, but the machine has not moved yet.
     *
     * Not a phase — there is no `{name: "connecting"}` in `BrewPhase`. It is
     * the copy the brew screen substitutes for `idle` when a run has been
     * asked for, because "Ready when you are." claimed the run was finished at
     * the exact moment it had not begun. Task 14 does the substituting.
     */
    connecting:  "Connecting to the machine…",
```

and change the last line, leaving the rest of the table untouched:

```ts
    lostContact: "Lost contact. The machine is still brewing."
```

`connecting` is deliberately unreachable until Task 14 wires it up. If you are running the tasks in order, the key is dead code for now and that is expected.

and:

```ts
export function blockedWaterCopy(totalMl: number): string {
    return `The tank will not cover this recipe's ${totalMl} ml. `
        + "Fill it and try again. No recipe was sent. Your dose is still in the hopper.";
}
```

In `components/BrewMiniBar.tsx`, in `say()`:

```ts
        return {
            title: `Stopped: ${why}`,
            detail: "KEPT IN YOUR BREW HISTORY",
            line: palette.danger
        };
```

Then grep the whole of `app/` and `components/` and `constants/` for any remaining em dash in a user-facing string and remove it:

```bash
grep -rn $'\u2014' app components constants --include=*.ts --include=*.tsx
```

Comments may keep them; strings that reach the screen may not.

- [ ] **Step 4: Run it and see it pass**

```bash
npx jest constants/__tests__/brewCopy.test.ts components/__tests__/BrewMiniBar.test.tsx
```

Expected: PASS. If `BrewMiniBar.test.tsx` asserts the old `Stopped — …` string, update the expectation.

- [ ] **Step 5: Commit**

```bash
npm run typecheck && npm run lint && npm test
git add constants/brewCopy.ts constants/__tests__/brewCopy.test.ts components/BrewMiniBar.tsx components/__tests__/BrewMiniBar.test.tsx
git commit -m "fix: the brew screen stops saying things that are not true

Opening a session beeps, so 'nothing has been sent to the machine' is
false to the user's ear. It is replaced by the thing that actually
matters: the dose is still in the hopper. Em dashes out, and a line for
the window between commanding a run and the machine moving.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: Finding the stalls

A hold is **water not moving when the plan says it should be**, measured from the samples. This is a pure function with no React and no machine.

The definition that matters: a stall is water not moving *while the stage still owes millilitres*. That last clause is the whole thing. It is what makes a planned pause — flat water after the target is reached — not a stall, without consulting the recipe's timings at all. Comparing elapsed time against the plan is what made a planned rest raise a warning that then never cleared.

The second thing that matters is subtler. Weight frames are event-driven and irregularly spaced, so **a gap between two rising readings is the machine not reporting, not the water stopping.** A stall is only real if a sample was actually observed with the water flat. Without that rule, ordinary sample spacing reads as a stall in every stage.

**Files:**
- Create: `library/brew/stalls.ts`
- Test: `library/brew/__tests__/stalls.test.ts`

- [ ] **Step 1: Write the failing test**

Create `library/brew/__tests__/stalls.test.ts`:

```ts
import type {BrewSample} from "@/library/brew/BrewRecord";
import {stallsInStage} from "@/library/brew/stalls";

/** `at` in seconds for readability; the type wants milliseconds. */
function sample(seconds: number, water: number, pour: number): BrewSample {
    return {at: seconds * 1000, water, cup: water * 0.9, pour};
}

describe("stallsInStage", () => {
    it("finds nothing in a stage where water never stopped", () => {
        const samples = [
            sample(0, 0, 1), sample(1, 4, 1), sample(2, 8, 1),
            sample(3, 12, 1), sample(4, 16, 1)
        ];

        expect(stallsInStage(samples, 1, 16)).toEqual([]);
    });

    it("does not call a planned pause a stall", () => {
        // The stage's target is 16 ml and it got there. Everything flat after
        // that is the pause the recipe asked for.
        const samples = [
            sample(0, 0, 1), sample(2, 8, 1), sample(4, 16, 1),
            sample(6, 16, 1), sample(8, 16, 1), sample(20, 16, 1)
        ];

        expect(stallsInStage(samples, 1, 16)).toEqual([]);
    });

    it("does not call a quiet radio a stall", () => {
        // Three seconds between two readings that both rose. The water was
        // never seen standing still, so nothing here stopped.
        const samples = [
            sample(0, 0, 1), sample(3, 20, 1), sample(6, 45, 1), sample(9, 70, 1)
        ];

        expect(stallsInStage(samples, 1, 70)).toEqual([]);
    });

    it("records where a stall began and how long it lasted", () => {
        const samples = [
            sample(0, 0, 1), sample(1, 5, 1),
            // Ten seconds with the water at 20 ml of a 70 ml stage.
            sample(2, 20, 1), sample(5, 20, 1), sample(11, 20, 1),
            sample(12, 30, 1), sample(15, 70, 1)
        ];

        expect(stallsInStage(samples, 1, 70)).toEqual([{atMl: 20, seconds: 10}]);
    });

    it("records several stalls in one stage, in the order they happened", () => {
        const samples = [
            sample(0, 0, 2), sample(1, 10, 2),
            sample(2, 20, 2), sample(6, 20, 2),
            sample(7, 40, 2), sample(12, 40, 2),
            sample(13, 60, 2), sample(16, 60, 2),
            sample(17, 70, 2)
        ];

        expect(stallsInStage(samples, 2, 70)).toEqual([
            {atMl: 20, seconds: 5},
            {atMl: 40, seconds: 6},
            {atMl: 60, seconds: 4}
        ]);
    });

    it("reports a stall that is still going, so it can grow while it happens", () => {
        const samples = [
            sample(0, 0, 1), sample(2, 20, 1), sample(9, 20, 1)
        ];

        expect(stallsInStage(samples, 1, 70)).toEqual([{atMl: 20, seconds: 7}]);
    });

    it("ignores a stage that has no samples at all", () => {
        expect(stallsInStage([], 3, 40)).toEqual([]);
    });

    it("reads only its own stage", () => {
        const samples = [
            sample(0, 0, 1), sample(2, 20, 1), sample(9, 20, 1), sample(10, 40, 1),
            sample(11, 0, 2), sample(12, 70, 2)
        ];

        // Stage 1 sat at 20 ml from t=2 and had reached 40 by t=10, so its
        // stall is bounded at eight seconds. Stage 2 never stalled, and must
        // not inherit stage 1's.
        expect(stallsInStage(samples, 2, 70)).toEqual([]);
        expect(stallsInStage(samples, 1, 40)).toEqual([{atMl: 20, seconds: 8}]);
    });

    it("ignores drift below the noise floor", () => {
        // A tenth of a millilitre either way is the scale settling, not a pour,
        // so the stall is measured from where the water actually stopped.
        const samples = [
            sample(0, 0, 1), sample(1, 20, 1),
            sample(2, 20.1, 1), sample(3, 20.2, 1), sample(9, 20.3, 1),
            sample(10, 40, 1)
        ];

        expect(stallsInStage(samples, 1, 40)).toEqual([{atMl: 20, seconds: 9}]);
    });
});
```

- [ ] **Step 2: Run it and see it fail**

```bash
npx jest library/brew/__tests__/stalls.test.ts
```

Expected: FAIL, "Cannot find module '@/library/brew/stalls'".

- [ ] **Step 3: Implement**

Create `library/brew/stalls.ts`:

```ts
import type {BrewSample} from "./BrewRecord";

/**
 * One moment the water stopped moving while the plan said it should be
 * pouring.
 *
 * `atMl` is the millilitre the stage had reached when it stopped, which is
 * where the rung draws it; `seconds` is how long it lasted, which is how wide
 * the rung draws it.
 */
export type Stall = {atMl: number; seconds: number};

/** Below this a change in the reading is the scale settling, not a pour. */
export const NOISE_FLOOR_ML = 0.5;

/** Below this a gap is the sample rate, not a stall worth naming. */
const MIN_STALL_SECONDS = 2;

/**
 * The stalls in one stage.
 *
 * A stall is water not moving while the stage still owes millilitres. That
 * last clause is the whole definition: it is what makes a planned pause -- flat
 * water *after* the target is reached -- not a stall, without needing the
 * plan's timings at all. Comparing elapsed time against the plan is what made a
 * planned rest raise a warning that then never cleared.
 *
 * A plateau also has to have been *seen*. Weight frames are event-driven and
 * irregularly spaced, so a three-second gap between two rising readings is the
 * machine not reporting rather than the water standing still, and counting it
 * would find a stall in every stage of every brew.
 *
 * @param samples every sample of the brew; this filters by `pour` itself
 * @param stage   1-based, matching `BrewSample.pour`
 * @param targetMl the stage's planned volume
 */
export function stallsInStage(
    samples: BrewSample[], stage: number, targetMl: number,
    minSeconds: number = MIN_STALL_SECONDS
): Stall[] {
    const mine = samples.filter((s) => s.pour === stage);
    if (mine.length === 0) return [];

    const startMl = mine[0].water;
    const stalls: Stall[] = [];

    // Where the water last rose, and whether we have since seen it sitting
    // still. `flatSeen` is what separates a stall from a quiet radio.
    let anchorAt = mine[0].at;
    let anchorMl = mine[0].water;
    let flatSeen = 0;

    const close = (endAt: number): void => {
        const seconds = (endAt - anchorAt) / 1000;
        if (flatSeen > 0 && seconds >= minSeconds) {
            stalls.push({atMl: round1(anchorMl - startMl), seconds: round1(seconds)});
        }
    };

    for (let i = 1; i < mine.length; i++) {
        const s = mine[i];
        if (s.water - anchorMl > NOISE_FLOOR_ML) {
            close(s.at);
            anchorAt = s.at;
            anchorMl = s.water;
            flatSeen = 0;
        } else {
            flatSeen++;
        }
    }

    // A stall that has not ended yet, so the rung can draw it growing. Only
    // while the stage still owes water: flat water at the target is the pause.
    const last = mine[mine.length - 1];
    if (last.water - startMl + NOISE_FLOOR_ML < targetMl) close(last.at);

    return stalls;
}

/** One decimal. Millilitres arrive from a scale and carry more than they mean. */
function round1(n: number): number {
    return Math.round(n * 10) / 10;
}
```

Note that the anchor stays at the water level where the plateau *began*, so drift within the noise floor does not drag `atMl` upward: the stall in the last test is reported at 20, not at 20.3.

- [ ] **Step 4: Run it and see it pass**

```bash
npx jest library/brew/__tests__/stalls.test.ts
```

Expected: PASS, nine tests.

- [ ] **Step 5: Commit**

```bash
npm run typecheck && npm run lint && npm test
git add library/brew/stalls.ts library/brew/__tests__/stalls.test.ts
git commit -m "feat: find the moments a stage stopped pouring

A stall is water not moving while the stage still owes millilitres, read
from the samples. That definition makes a planned pause not a stall
without consulting the plan's timings at all, which is what made the old
holding warning appear on a planned rest and never clear.

A plateau also has to have been seen. Weight frames are event-driven, so
a gap between two rising readings is the machine not reporting rather
than the water standing still.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: The shape of one rung

The lane is one continuous track: solid water segments, amber stall bands inserted at the millilitre where each began and as wide as it was long, then a hatched pause segment. This is the arithmetic, separated from the drawing so it can be tested without a renderer.

**Files:**
- Create: `library/brew/rungGeometry.ts`
- Test: `library/brew/__tests__/rungGeometry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `library/brew/__tests__/rungGeometry.test.ts`:

```ts
import {rungSegments} from "@/library/brew/rungGeometry";
import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";

/** 70 ml at 4 ml/s is 17.5 s of pouring, then a 20 s rest. */
function stage(volume: number, pause: number): Pour {
    // Pour(pourNumber, volume, temperature, flowRate, agitation, pattern, pause).
    // flowRate is stored times ten.
    return new Pour(1, volume, 93, 40, AGITATION.ALL_OFF, POUR_PATTERN.CENTERED, pause);
}

describe("rungSegments", () => {
    it("is one water segment and one pause on a clean stage", () => {
        const segments = rungSegments({
            pour: stage(70, 20), delivered: 0, pauseElapsed: 0, stalls: []
        });

        expect(segments).toEqual([
            {kind: "water", seconds: 17.5, fill: 0},
            {kind: "pause", seconds: 20, fill: 0}
        ]);
    });

    it("fills the water segment by millilitres delivered, not by time", () => {
        const segments = rungSegments({
            pour: stage(70, 20), delivered: 35, pauseElapsed: 0, stalls: []
        });

        expect(segments[0]).toEqual({kind: "water", seconds: 17.5, fill: 0.5});
    });

    it("fills the pause segment by time, because millilitres stop meaning anything", () => {
        const segments = rungSegments({
            pour: stage(70, 20), delivered: 70, pauseElapsed: 5, stalls: []
        });

        expect(segments[0].fill).toBe(1);
        expect(segments[1]).toEqual({kind: "pause", seconds: 20, fill: 0.25});
    });

    it("inserts a stall at the millilitre it began, as wide as it was long", () => {
        const segments = rungSegments({
            pour: stage(70, 0), delivered: 70, pauseElapsed: 0,
            stalls: [{atMl: 20, seconds: 9}]
        });

        expect(segments).toEqual([
            {kind: "water", seconds: 5, fill: 1},
            {kind: "stall", seconds: 9, fill: 1},
            {kind: "water", seconds: 12.5, fill: 1}
        ]);
    });

    it("keeps several stalls in millilitre order and leaves water flowing between them", () => {
        const segments = rungSegments({
            pour: stage(40, 0), delivered: 25, pauseElapsed: 0,
            stalls: [{atMl: 30, seconds: 3}, {atMl: 10, seconds: 4}]
        });

        expect(segments.map((s) => s.kind))
            .toEqual(["water", "stall", "water", "stall", "water"]);
        // 0-10 ml is behind us, 10-30 is half delivered, 30-40 has not started.
        expect(segments[0].fill).toBe(1);
        expect(segments[2].fill).toBe(0.75);
        expect(segments[4].fill).toBe(0);
    });

    it("drops the zero-length water segment when a stage stalls at the very start", () => {
        const segments = rungSegments({
            pour: stage(40, 0), delivered: 0, pauseElapsed: 0,
            stalls: [{atMl: 0, seconds: 6}]
        });

        expect(segments).toEqual([
            {kind: "stall", seconds: 6, fill: 1},
            {kind: "water", seconds: 10, fill: 0}
        ]);
    });

    it("drops the zero-length water segment between two stalls at the same millilitre", () => {
        const segments = rungSegments({
            pour: stage(40, 0), delivered: 40, pauseElapsed: 0,
            stalls: [{atMl: 20, seconds: 3}, {atMl: 20, seconds: 5}]
        });

        expect(segments.map((s) => s.kind)).toEqual(["water", "stall", "stall", "water"]);
    });

    it("is just the pause when a stage carries no volume at all", () => {
        const segments = rungSegments({
            pour: stage(0, 15), delivered: 0, pauseElapsed: 0, stalls: []
        });

        expect(segments).toEqual([{kind: "pause", seconds: 15, fill: 0}]);
    });

    it("makes the lane exactly as long as the time the stage lost", () => {
        const clean = rungSegments({
            pour: stage(70, 20), delivered: 0, pauseElapsed: 0, stalls: []
        });
        const stalled = rungSegments({
            pour: stage(70, 20), delivered: 0, pauseElapsed: 0,
            stalls: [{atMl: 20, seconds: 9}]
        });
        const total = (segments: {seconds: number}[]) =>
            segments.reduce((sum, s) => sum + s.seconds, 0);

        expect(total(stalled) - total(clean)).toBe(9);
    });
});
```

- [ ] **Step 2: Run it and see it fail**

```bash
npx jest library/brew/__tests__/rungGeometry.test.ts
```

Expected: FAIL, "Cannot find module '@/library/brew/rungGeometry'".

- [ ] **Step 3: Implement**

Create `library/brew/rungGeometry.ts`:

```ts
import type Pour from "@/library/Pour";

import {pauseSeconds, pourSeconds} from "./brewShape";
import type {Stall} from "./stalls";

/**
 * What a piece of a rung's lane is.
 *
 * `water` is solid and fills by millilitres; `stall` is amber and always full,
 * because a stall that happened happened; `pause` is hatched and fills by time.
 */
export type SegmentKind = "water" | "stall" | "pause";

/**
 * One piece of a lane.
 *
 * `seconds` is its width on the shared time scale, which is why a stalled
 * stage is exactly as much longer than a clean one as the time it lost.
 * `fill` is 0 to 1 through this piece alone.
 */
export type Segment = {kind: SegmentKind; seconds: number; fill: number};

export type RungInput = {
    pour: Pour;
    /** Millilitres delivered in this stage so far. */
    delivered: number;
    /** Seconds into the planned rest. Zero until the pour is complete. */
    pauseElapsed: number;
    stalls: Stall[];
};

/**
 * A stage as the ordered pieces of its lane.
 *
 * Stalls are inserted rather than overlaid so that water either side of one
 * keeps flowing rightwards: the count, the position and the duration are all
 * readable at once, and a stage that stopped once badly looks different from
 * one that stopped three times briefly.
 */
export function rungSegments({pour, delivered, pauseElapsed, stalls}: RungInput): Segment[] {
    const target = Math.max(pour.volume, 0);
    const perMl = target > 0 ? pourSeconds(pour) / target : 0;
    const segments: Segment[] = [];

    let at = 0;
    for (const stall of [...stalls].sort((a, b) => a.atMl - b.atMl)) {
        const begins = clamp(stall.atMl, 0, target);
        const span = begins - at;
        // A stall at 0 ml, or a second stall at the same millilitre, would
        // otherwise emit a zero-width water segment that renders as a seam.
        if (span > 0) {
            segments.push({kind: "water", seconds: round1(span * perMl),
                           fill: fillFor(at, span, delivered)});
        }
        segments.push({kind: "stall", seconds: round1(stall.seconds), fill: 1});
        at = begins;
    }

    const tail = target - at;
    if (tail > 0) {
        segments.push({kind: "water", seconds: round1(tail * perMl),
                       fill: fillFor(at, tail, delivered)});
    }

    const rest = pauseSeconds(pour);
    if (rest > 0) {
        segments.push({kind: "pause", seconds: round1(rest),
                       fill: clamp(pauseElapsed / rest, 0, 1)});
    }

    return segments;
}

/** How far `delivered` has got through the span starting at `startMl`. */
function fillFor(startMl: number, spanMl: number, delivered: number): number {
    if (spanMl <= 0) return 0;
    return round2(clamp((delivered - startMl) / spanMl, 0, 1));
}

function clamp(n: number, low: number, high: number): number {
    return Math.min(Math.max(n, low), high);
}

function round1(n: number): number {
    return Math.round(n * 10) / 10;
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
```

- [ ] **Step 4: Run it and see it pass**

```bash
npx jest library/brew/__tests__/rungGeometry.test.ts
```

Expected: PASS, nine tests.

- [ ] **Step 5: Commit**

```bash
npm run typecheck && npm run lint && npm test
git add library/brew/rungGeometry.ts library/brew/__tests__/rungGeometry.test.ts
git commit -m "feat: a stage as the ordered pieces of its lane

Water segments that fill by millilitre, amber stall bands inserted where
each stall began and as wide as it was long, and a hatched rest that
fills by time. The lane ends up exactly as much longer than its plan as
the time the stage lost.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 7: The rung, rebuilt

The lane becomes `flex: 1` and spans the row, as the mockup always said. Fill runs left to right through the segments. Five states: pending, pouring, waiting, holding, done.

**Files:**
- Modify: `components/BrewStageRung.tsx` (full rewrite)
- Test: `components/__tests__/BrewStageRung.test.tsx`

- [ ] **Step 1: Write the failing test**

Replace the body of `components/__tests__/BrewStageRung.test.tsx`:

```tsx
import React from "react";

import BrewStageRung from "@/components/BrewStageRung";
import {palette} from "@/constants/colors";
import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";
import {renderWithProviders} from "@/test-utils/render";

const ACCENT = palette.brand;

function stage(volume = 70, pause = 20): Pour {
    return new Pour(1, volume, 93, 40, AGITATION.ALL_OFF, POUR_PATTERN.CENTERED, pause);
}

async function draw(overrides: Partial<React.ComponentProps<typeof BrewStageRung>> = {}) {
    return renderWithProviders(
        <BrewStageRung
            pour={stage()}
            index={0}
            state="pending"
            accent={ACCENT}
            laneSeconds={40}
            barHeight={11}
            delivered={0}
            pauseElapsed={0}
            stalls={[]}
            {...overrides}
        />
    );
}

describe("BrewStageRung", () => {
    it("gives the lane the whole row rather than a fixed width", async () => {
        const {getByTestId} = await draw();

        expect(getByTestId("rung-lane").props.style).toEqual(
            expect.objectContaining({flex: 1})
        );
    });

    it("is dimmed before the stage happens", async () => {
        const {getByTestId} = await draw({testID: "rung"});

        expect(getByTestId("rung").props.style).toEqual(
            expect.objectContaining({opacity: 0.45})
        );
    });

    it("fills the water segment by millilitres, not by time", async () => {
        const {getByTestId} = await draw({state: "active", delivered: 35});

        // The lane is 40 s wide; a clean 70 ml stage pours for 17.5 s of it.
        // Half delivered is half of that segment lit.
        expect(getByTestId("segment-fill-0").props.style.flex).toBeCloseTo(0.5);
    });

    it("counts millilitres while pouring", async () => {
        const {getByText} = await draw({state: "active", delivered: 41});

        expect(getByText("41/70 ml")).toBeTruthy();
    });

    it("counts down seconds while resting, because millilitres have stopped moving", async () => {
        const {getByText} = await draw({
            state: "active", delivered: 70, pauseElapsed: 6
        });

        expect(getByText("14 s left")).toBeTruthy();
    });

    it("changes texture, not colour, for a planned rest", async () => {
        const {getByTestId} = await draw({
            state: "active", delivered: 70, pauseElapsed: 6
        });

        expect(getByTestId("segment-1").props.style.borderStyle).toBe("dashed");
        expect(getByTestId("segment-fill-1").props.style.backgroundColor).toBe(ACCENT);
    });

    it("changes colour, not texture, where it held", async () => {
        const {getByTestId} = await draw({
            state: "active", delivered: 40, stalls: [{atMl: 20, seconds: 9}]
        });

        expect(getByTestId("segment-1").props.style.backgroundColor).toBe(palette.warn);
    });

    it("keeps the stall bands after the stage is done", async () => {
        const {getByTestId} = await draw({
            state: "done", delivered: 70, pauseElapsed: 20,
            stalls: [{atMl: 20, seconds: 9}]
        });

        expect(getByTestId("segment-1").props.style.backgroundColor).toBe(palette.warn);
    });

    it("says the whole stage in one sentence for VoiceOver", async () => {
        const {getByLabelText} = await draw();

        expect(getByLabelText(/Stage 01, centred pour, 93 degrees, 70 millilitres/))
            .toBeTruthy();
    });

    it("says where it held, for VoiceOver", async () => {
        const {getByLabelText} = await draw({
            state: "active", delivered: 40, stalls: [{atMl: 20, seconds: 9}]
        });

        expect(getByLabelText(/held once, 9 seconds/)).toBeTruthy();
    });
});
```

- [ ] **Step 2: Run it and see it fail**

```bash
npx jest components/__tests__/BrewStageRung.test.tsx
```

Expected: FAIL — the props `barHeight`, `delivered`, `pauseElapsed` and `stalls` do not exist.

- [ ] **Step 3: Rewrite the component**

Replace `components/BrewStageRung.tsx` entirely:

```tsx
// components/BrewStageRung.tsx
import React from "react";
import {View} from "react-native";
import {XStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import PourGlyph, {glyphForPattern} from "@/components/PourGlyph";
import {palette} from "@/constants/colors";
import {pauseSeconds} from "@/library/brew/brewShape";
import {rungSegments, type Segment} from "@/library/brew/rungGeometry";
import type {Stall} from "@/library/brew/stalls";
import type Pour from "@/library/Pour";

/**
 * Where a stage stands.
 *
 * `active` covers both pouring and resting; which one it is follows from
 * whether the water is still owed, so a caller cannot get the two out of step
 * with the numbers it is passing.
 */
export type RungState = "done" | "active" | "pending";

type Props = {
    pour: Pour;
    /** Zero-based; the rung numbers itself from one. */
    index: number;
    state: RungState;
    accent: string;
    /** The longest stage in the recipe, stalls included. Shared, or the lane means nothing. */
    laneSeconds: number;
    /** The elastic bar height. Between 9 and 15; the ladder decides. */
    barHeight: number;
    /** Millilitres delivered in this stage. */
    delivered: number;
    /** Seconds into the planned rest. */
    pauseElapsed: number;
    stalls: Stall[];
    testID?: string;
};

/** The dimmed opacity of a stage that has not happened. */
const PENDING_OPACITY = 0.45;

/** One spoken sentence for a rung, for VoiceOver / TalkBack. */
function buildLabel(pour: Pour, index: number, stalls: Stall[]): string {
    const stage = `Stage ${String(index + 1).padStart(2, "0")}`;
    const kind = glyphForPattern(pour.pourPattern);
    const pattern = kind === "agitation" ? "agitation"
        : kind === "centered" ? "centred pour"
        : `${kind} pour`;
    const temp = `${Math.max(pour.temperature, 0)} degrees`;
    const vol = `${Math.max(pour.volume, 0)} millilitres`;
    const pauseSec = Math.round(pauseSeconds(pour));
    const pause = pauseSec > 0 ? `, then ${pauseSec} seconds pause` : "";

    const before = pour.getAgitationBefore();
    const after = pour.getAgitationAfter();
    let agitation = "";
    if (before && after) agitation = ", agitates before and after";
    else if (before) agitation = ", agitates before";
    else if (after) agitation = ", agitates after";

    let held = "";
    if (stalls.length === 1) {
        held = `, held once, ${Math.round(stalls[0].seconds)} seconds`;
    } else if (stalls.length > 1) {
        const total = Math.round(stalls.reduce((sum, s) => sum + s.seconds, 0));
        held = `, held ${stalls.length} times, ${total} seconds in all`;
    }

    return `${stage}, ${pattern}, ${temp}, ${vol}${pause}${agitation}${held}`;
}

/** The colour a segment's filled part takes. */
function fillColour(kind: Segment["kind"], accent: string, done: boolean): string {
    if (kind === "stall") return palette.warn;
    return done ? palette.muted : accent;
}

/** `41/70 ml` while pouring, `14 s left` while resting. */
function readout(pour: Pour, delivered: number, pauseElapsed: number): string {
    const target = Math.max(pour.volume, 0);
    const rest = pauseSeconds(pour);
    if (delivered >= target && rest > 0) {
        return `${Math.max(0, Math.round(rest - pauseElapsed))} s left`;
    }
    return `${Math.round(delivered)}/${target} ml`;
}

/**
 * One stage, as a lane.
 *
 * The lane is `flex: 1` and takes the whole row: it was a hard-coded 120 pt,
 * which is what left a four-stage brew mostly black. Its pieces are sized in
 * seconds on a scale shared with every other rung, so a stage that stalled
 * sticks out past its neighbours by exactly the time it lost.
 */
export default function BrewStageRung({
    pour, index, state, accent, laneSeconds, barHeight, delivered, pauseElapsed,
    stalls, testID
}: Props) {
    const segments = rungSegments({pour, delivered, pauseElapsed, stalls});
    const span = laneSeconds > 0 ? laneSeconds : 1;
    const used = segments.reduce((sum, s) => sum + s.seconds, 0);
    // The slack is the difference between this stage and the longest one. It
    // is a real, empty part of the lane: a short stage should look short.
    const slack = Math.max(0, span - used);
    const done = state === "done";
    const radius = barHeight / 2;

    return (
        <XStack
            testID={testID}
            accessibilityLabel={buildLabel(pour, index, stalls)}
            accessible
            alignItems="center"
            gap="$2"
            style={{opacity: state === "pending" ? PENDING_OPACITY : 1}}
        >
            <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.4}
                           color={state === "active" ? accent : palette.dim}>
                {String(index + 1).padStart(2, "0")}
            </DotMatrixText>

            <PourGlyph
                kind={glyphForPattern(pour.pourPattern)}
                accent={state === "active" ? accent : palette.dim}
                size={14}
            />

            <DotMatrixText fontSize={12} weight="bold" color={palette.dim}>
                {`${Math.max(pour.temperature, 0)}°`}
            </DotMatrixText>

            <XStack testID="rung-lane" style={{flex: 1}} height={barHeight}
                    alignItems="center">
                {segments.map((segment, i) => (
                    <View
                        key={`segment-${i}`}
                        testID={`segment-${i}`}
                        style={{
                            flex: Math.max(segment.seconds, 0.001),
                            height: barHeight,
                            borderRadius: radius,
                            // Hatching is a dashed border rather than an SVG
                            // pattern: one view, and it stays legible at 9 pt
                            // where a pattern fill turns to mush.
                            borderWidth: segment.kind === "pause" ? 1 : 0,
                            borderStyle: segment.kind === "pause" ? "dashed" : "solid",
                            borderColor: palette.line,
                            backgroundColor: segment.kind === "stall"
                                ? palette.warn
                                : palette.raised,
                            overflow: "hidden",
                            // A row, so the fill and the spacer below divide it
                            // by flex. Without the spacer a lone `flex: 0.5`
                            // child fills the whole segment, because flex is a
                            // share of the children, not of the parent.
                            flexDirection: "row"
                        }}
                    >
                        <View
                            testID={`segment-fill-${i}`}
                            style={{
                                flex: Math.max(0, Math.min(1, segment.fill)),
                                height: barHeight,
                                borderRadius: radius,
                                backgroundColor: fillColour(segment.kind, accent, done)
                            }}
                        />
                        <View style={{flex: 1 - Math.max(0, Math.min(1, segment.fill))}} />
                    </View>
                ))}
                {slack > 0 && <View testID="rung-slack" style={{flex: slack}} />}
            </XStack>

            <DotMatrixText fontSize={12} weight="bold" color={palette.dim}>
                {state === "pending"
                    ? `${Math.max(pour.volume, 0)} ml`
                    : readout(pour, delivered, pauseElapsed)}
            </DotMatrixText>
        </XStack>
    );
}
```

The fill is a child laid out with `flex` inside a segment that is itself `flex`, so the two cannot drift apart by a pixel of layout rounding — which is what the old absolutely-positioned overlay was guarding against with a fixed width it no longer has.

Note there is no `holding` prop any more. Holding is not a state of the rung; it is one or more stall bands inside it, and they are visible whether or not the stage is still live.

- [ ] **Step 4: Run it and see it pass**

```bash
npx jest components/__tests__/BrewStageRung.test.tsx
```

Expected: PASS, eleven tests.

- [ ] **Step 5: Keep the ladder compiling**

`components/BrewStageLadder.tsx` is the rung's only caller, and it passes `laneWidth`, `progress` and `holding`, none of which exist any more, while passing none of `barHeight`, `delivered`, `pauseElapsed` or `stalls`, all of which are required. Without this step `npm run typecheck` fails and the commit gate cannot pass.

This is a **bridge, not the real wiring.** Task 11 rewrites this file properly with elastic bands and a shared lane scale that accounts for stalls. Here you are doing the least that keeps the tree green and lets the real values flow in later without another signature change.

Add to the ladder's `Props`, after `stageElapsed`:

```ts
    /**
     * Millilitres delivered per stage, 1:1 with `pours`.
     *
     * Optional because Task 11 is what wires the real values through from
     * `useBrewRun`. Until then a finished stage is assumed to have had all of
     * its water, which is true, and a live one none, which is not -- the live
     * fill is deliberately wrong for one task rather than faked from elapsed
     * time, because a plausible-looking wrong fill is the thing that made the
     * old ladder unreadable on hardware.
     */
    stageWater?: number[];
    /** Seconds into the live stage's planned rest. Task 11 wires it. */
    pauseElapsed?: number;
    /** Stalls per stage, 1:1 with `pours`. Task 11 wires them. */
    stalls?: Stall[][];
```

Import the type:

```ts
import type {Stall} from "@/library/brew/stalls";
```

Destructure the three new props in the signature, defaulting `pauseElapsed` to `0`.

Then replace the `<BrewStageRung .../>` element. Delete the `progress` calculation above it as well — nothing uses it now:

```tsx
                <BrewStageRung
                    testID={`rung-${index}`}
                    pour={pour}
                    index={index}
                    state={state}
                    accent={accent}
                    laneSeconds={laneSeconds}
                    barHeight={11}
                    delivered={stageWater?.[index]
                        ?? (state === "done" ? Math.max(pour.volume, 0) : 0)}
                    pauseElapsed={state === "active" ? pauseElapsed
                        : state === "done" ? pauseSeconds(pour) : 0}
                    stalls={stalls?.[index] ?? []}
                />
```

`barHeight={11}` is a placeholder in the middle of the 9-to-15 range that Task 11 replaces with the measured value.

**Leave the ladder's own `holding` prop alone.** It is still read at the bottom of the file to draw "HOLDING: THE CUP IS BEHIND" in the stage card, and `components/__tests__/BrewStageLadder.test.tsx` asserts that. Only the forwarding of `holding` down into the rung goes away, because the rung no longer takes it.

If `components/__tests__/BrewStageLadder.test.tsx` fails on anything other than that, stop and report it rather than editing the test.

- [ ] **Step 6: Commit**

```bash
npm run typecheck && npm run lint && npm test
git add components/BrewStageRung.tsx components/__tests__/BrewStageRung.test.tsx components/BrewStageLadder.tsx
git commit -m "feat: the rung takes the whole row and fills by millilitre

LANE_WIDTH was a hard-coded 120 where the mockup said flex: 1, which is
most of why a four-stage brew was mostly black. The fill now follows the
quantity the machine is controlling and the quantity the right-hand
column names, and a stall is an amber band where it happened rather than
the whole stage turning amber.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 8: What the run publishes

The rung now wants millilitres delivered, pause elapsed and stalls per stage. `useBrewRun` is where they come from.

**Files:**
- Modify: `hooks/useBrewRun.ts`
- Modify: `hooks/useLiveBrew.tsx` (the snapshot type and the object)
- Test: `hooks/__tests__/useBrewRun.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `hooks/__tests__/useBrewRun.test.ts`, reusing the helpers already at the top of that file:

```tsx
describe("what a run publishes per stage", () => {
    it("reports the millilitres this stage has delivered, not the brew total", () => {
        const samples = [
            {at: 0, water: 0, cup: 0, pour: 1},
            {at: 5000, water: 48, cup: 40, pour: 1},
            {at: 12000, water: 60, cup: 52, pour: 2}
        ];

        expect(stageWaterFrom(samples, 2)).toBe(12);
    });

    it("reports nothing delivered for a stage that has not begun", () => {
        expect(stageWaterFrom([{at: 0, water: 0, cup: 0, pour: 1}], 3)).toBe(0);
    });
});
```

`stageWaterFrom` is a named export from `hooks/useBrewRun.ts` so the arithmetic can be tested without a renderer. Import it at the top of the test file.

- [ ] **Step 2: Run it and see it fail**

```bash
npx jest hooks/__tests__/useBrewRun.test.ts -t "per stage"
```

Expected: FAIL — `stageWaterFrom` is not exported.

- [ ] **Step 3: Implement**

In `hooks/useBrewRun.ts`, add the import and the helper:

```ts
import {NOISE_FLOOR_ML, stallsInStage, type Stall} from "@/library/brew/stalls";
```

```ts
/**
 * Millilitres delivered in one stage.
 *
 * The machine reports a running total for the whole brew, so a stage's own
 * share is the last reading minus the first one it was in. Exported so the
 * arithmetic can be tested without a renderer.
 *
 * @param stage 1-based, matching `BrewSample.pour`
 */
export function stageWaterFrom(samples: BrewSample[], stage: number): number {
    const mine = samples.filter((s) => s.pour === stage);
    if (mine.length === 0) return 0;
    return Math.max(0, mine[mine.length - 1].water - mine[0].water);
}
```

Then replace the block from `const stageStart = pours` down to the `return`:

```ts
    // Where this stage was *planned* to begin. Still plan-relative, and still
    // only a time source: nothing that is persisted or exported passes through
    // here, and the rung's fill is millilitres now rather than seconds.
    const stageStart = pours
        .slice(0, Math.max(0, activeIndex ?? 0))
        .reduce((total, pour) => total + pourSeconds(pour) + pauseSeconds(pour), 0);
    const stageElapsed = pouring ? Math.max(0, elapsed - stageStart) : 0;

    // Per stage, 1-based on the machine's numbering. Computed for every stage
    // and not just the live one, because a stall stays visible after the stage
    // that suffered it is finished.
    const stalls: Stall[][] = pours.map((pour, i) =>
        stallsInStage(samples, i + 1, Math.max(pour.volume, 0))
    );
    const stageWater: number[] = pours.map((_, i) => stageWaterFrom(samples, i + 1));

    const live = activeIndex !== null ? pours[activeIndex] : undefined;
    const liveTarget = live === undefined ? 0 : Math.max(live.volume, 0);
    const liveWater = activeIndex !== null ? (stageWater[activeIndex] ?? 0) : 0;
    // The rest has not begun until the water is in. Measured from the moment
    // the stage reached its target rather than from the plan, so an early or
    // late pour does not shift the countdown.
    const pouredAt = activeIndex !== null
        ? reachedAt(samples, activeIndex + 1, liveTarget)
        : null;
    const pauseElapsed = pouredAt === null ? 0 : Math.max(0, elapsed - pouredAt);

    // Holding is now a fact about the water, not a comparison against the
    // plan: the live stage has an unfinished stall. A planned rest cannot
    // produce one, which is what the old `stageElapsed > stageSpan` test got
    // wrong and then never recovered from.
    const liveStalls = activeIndex !== null ? (stalls[activeIndex] ?? []) : [];
    const heldSeconds = liveStalls.reduce((sum, s) => sum + s.seconds, 0);
    // `activeIndex !== null` leads the chain so TypeScript narrows it for the
    // `activeIndex + 1` below; `pouring` alone does not tell it anything.
    const holding = activeIndex !== null && pouring
        && liveWater < liveTarget && liveStalls.length > 0
        && stillStalled(samples, activeIndex + 1);

    return {
        ...brewer, samples, elapsed, stageElapsed, activeIndex, holding, heldSeconds,
        stalls, stageWater, pauseElapsed
    };
```

and the two helpers beside `stageWaterFrom`:

```ts
/** Seconds into the brew at which a stage first reached its target volume. */
function reachedAt(samples: BrewSample[], stage: number, targetMl: number): number | null {
    if (targetMl <= 0) return null;
    const mine = samples.filter((s) => s.pour === stage);
    if (mine.length === 0) return null;
    const startMl = mine[0].water;
    const hit = mine.find((s) => s.water - startMl >= targetMl);
    return hit === undefined ? null : hit.at / 1000;
}

/** Whether the most recent sample of a stage is part of a stall still open. */
function stillStalled(samples: BrewSample[], stage: number): boolean {
    const mine = samples.filter((s) => s.pour === stage);
    if (mine.length < 2) return false;
    const last = mine[mine.length - 1];
    const before = mine[mine.length - 2];
    return last.water - before.water <= NOISE_FLOOR_ML;
}
```

In `hooks/useLiveBrew.tsx`, widen the snapshot:

```ts
import type {Stall} from "@/library/brew/stalls";
```

```ts
/** The brew-state snapshot the bar and the screen both read from. */
export type LiveBrewSnapshot = {
    recipe: Recipe;
    samples: BrewSample[];
    elapsed: number;
    stageElapsed: number;
    activeIndex: number | null;
    phase: BrewPhase;
    holding: boolean;
    heldSeconds: number;
    /** Per stage, index-aligned with `recipe.pours`. Millilitres delivered. */
    stageWater: number[];
    /** Per stage, index-aligned with `recipe.pours`. */
    stalls: Stall[][];
    /** Seconds into the live stage's planned rest. Zero while it is pouring. */
    pauseElapsed: number;
};
```

and in `RunOwner`, destructure and pass the three new values:

```ts
    const {phase, error, samples, elapsed, stageElapsed, activeIndex, holding,
           heldSeconds, stalls, stageWater, pauseElapsed, brew, startBrew,
           cancelBrew, canOfferProMode, switchToProAndRetry} = result;
```

```ts
    const snapshot: LiveBrewSnapshot | null = recipe === null ? null : {
        recipe, samples, elapsed, stageElapsed, activeIndex, phase,
        holding, heldSeconds, stalls, stageWater, pauseElapsed,
    };
```

- [ ] **Step 4: Replace the two tests that encode the old definition of holding**

`hooks/__tests__/useBrewRun.test.ts` has two tests that will now fail, and **they are supposed to**. They assert the old rule — that a stage which outruns its planned duration is holding — which is the defect this task exists to remove. On hardware it raised a HOLDING warning during a *planned rest* and then never cleared once pouring resumed, because a planned rest always outruns the pour it follows.

Delete these two, whole:

- `"is holding once the stage outruns its plan"` (around line 135)
- `"reports heldSeconds from per-stage time, not total elapsed"` (around line 227)

Keep `"is not holding while the stage is within its plan"` unchanged. It still passes, and it still guards something real.

Add these three in their place:

```tsx
    it("is holding when the live stage has an open stall", async () => {
        // Two readings a few seconds apart with the water essentially still,
        // in a stage that still owes millilitres. 10 to 10.2 is inside the
        // noise floor, so this is flat water rather than a slow pour.
        const h = harness();
        const {result} = await renderHook(() => useBrewRun(recipe(), h.store));
        await h.setPhase({name: "pouring", pour: 1, pours: 2});
        await h.water(10);
        await act(async () => { jest.advanceTimersByTime(250); });
        await act(async () => { jest.advanceTimersByTime(5_000); });
        await h.water(10.2);
        await act(async () => { jest.advanceTimersByTime(250); });

        expect(result.current.holding).toBe(true);
        expect(result.current.heldSeconds).toBeGreaterThan(0);
    });

    it("is not holding while the water is still rising", async () => {
        const h = harness();
        const {result} = await renderHook(() => useBrewRun(recipe(), h.store));
        await h.setPhase({name: "pouring", pour: 1, pours: 2});
        await h.water(10);
        await act(async () => { jest.advanceTimersByTime(250); });
        await act(async () => { jest.advanceTimersByTime(3_000); });
        await h.water(30);
        await act(async () => { jest.advanceTimersByTime(250); });

        expect(result.current.holding).toBe(false);
    });

    it("does not call the planned rest a hold", async () => {
        // This is the device defect from #87. Stage 1 wants 40 ml and has had
        // them, so everything flat after that is the 20 s rest the recipe
        // asked for. The old rule reported HOLDING here and never took it
        // back.
        const h = harness();
        const {result} = await renderHook(() => useBrewRun(recipe(), h.store));
        await h.setPhase({name: "pouring", pour: 1, pours: 2});
        await h.water(10);
        await act(async () => { jest.advanceTimersByTime(250); });
        await h.water(50);
        await act(async () => { jest.advanceTimersByTime(250); });
        await act(async () => { jest.advanceTimersByTime(30_000); });
        await h.water(50.2);
        await act(async () => { jest.advanceTimersByTime(250); });

        expect(result.current.holding).toBe(false);
        expect(result.current.heldSeconds).toBe(0);
    });
```

Two things to know about the harness, because they are not obvious:

- `stageWaterFrom` is **last reading minus first reading of the stage**, because the machine reports a running total for the whole brew. So a stage whose first sample reads 10 g and whose last reads 50 g has delivered 40, which is why the numbers above are offset by 10 rather than starting at 0.
- The readings deliberately differ by 0.2 g rather than repeating a value exactly. That is inside `NOISE_FLOOR_ML`, so it still counts as flat, and it avoids depending on whether `BrewRecorder` buffers an identical consecutive reading. If a test does not behave as described, print `result.current.samples` and look at the actual `at` and `water` values before changing anything else — and tell me what you saw.

- [ ] **Step 5: Run the whole suite**

```bash
npx jest hooks/__tests__/useBrewRun.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npm run typecheck && npm run lint && npm test
git add hooks/useBrewRun.ts hooks/useLiveBrew.tsx hooks/__tests__/useBrewRun.test.ts
git commit -m "feat: publish millilitres, rests and stalls per stage

The rung fills by water now, so the run has to say how much water each
stage has had. Holding becomes a fact about the samples rather than a
comparison against the plan, which is what made a planned rest raise a
warning that then never cleared.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 9: Bands with a floor and a cap

Nothing on the screen may keep a fixed height. The flexible region is shared out between the trace, the rung bars and the spacing between rungs, in that order of priority. Pure arithmetic, so it is tested without a renderer.

**Files:**
- Create: `library/brew/bands.ts`
- Test: `library/brew/__tests__/bands.test.ts`

- [ ] **Step 1: Write the failing test**

Create `library/brew/__tests__/bands.test.ts`:

```ts
import {allocateBands, BAR_CAP, BAR_FLOOR, GAP_FLOOR, TRACE_CAP,
        TRACE_FLOOR} from "@/library/brew/bands";

describe("allocateBands", () => {
    it("sits at every floor when there is only just enough room", () => {
        const stages = 9;
        const tight = TRACE_FLOOR + stages * (BAR_FLOOR + GAP_FLOOR);

        expect(allocateBands(tight, stages)).toEqual({
            traceHeight: TRACE_FLOOR, barHeight: BAR_FLOOR, rungGap: GAP_FLOOR,
            scrolls: false
        });
    });

    it("stays at every floor and scrolls when there is not enough room", () => {
        const stages = 9;
        const cramped = TRACE_FLOOR + stages * (BAR_FLOOR + GAP_FLOOR) - 100;

        expect(allocateBands(cramped, stages)).toEqual({
            traceHeight: TRACE_FLOOR, barHeight: BAR_FLOOR, rungGap: GAP_FLOOR,
            scrolls: true
        });
    });

    it("gives the first of the slack to the trace", () => {
        const stages = 4;
        const room = TRACE_FLOOR + stages * (BAR_FLOOR + GAP_FLOOR) + 30;

        expect(allocateBands(room, stages).traceHeight).toBe(TRACE_FLOOR + 30);
    });

    it("never grows the trace past its cap", () => {
        const stages = 4;
        const room = TRACE_FLOOR + stages * (BAR_FLOOR + GAP_FLOOR) + 400;

        expect(allocateBands(room, stages).traceHeight).toBe(TRACE_CAP);
    });

    it("gives the second of the slack to the bars", () => {
        const stages = 4;
        const spare = TRACE_CAP - TRACE_FLOOR;
        const room = TRACE_FLOOR + stages * (BAR_FLOOR + GAP_FLOOR) + spare + 8;

        // Eight points over four stages is two points of bar each.
        expect(allocateBands(room, stages).barHeight).toBe(BAR_FLOOR + 2);
    });

    it("never grows a bar past its cap", () => {
        const stages = 4;
        const room = TRACE_FLOOR + stages * (BAR_FLOOR + GAP_FLOOR) + 400;

        expect(allocateBands(room, stages).barHeight).toBe(BAR_CAP);
    });

    it("gives everything left to the spacing, so nothing is left black", () => {
        const stages = 4;
        const room = TRACE_FLOOR + stages * (BAR_FLOOR + GAP_FLOOR) + 400;
        const bands = allocateBands(room, stages);

        const used = bands.traceHeight
            + stages * (bands.barHeight + bands.rungGap);
        expect(room - used).toBeLessThan(stages);
    });

    it("does not divide by a recipe with no stages", () => {
        expect(allocateBands(600, 0)).toEqual({
            traceHeight: TRACE_CAP, barHeight: BAR_FLOOR, rungGap: GAP_FLOOR,
            scrolls: false
        });
    });
});
```

- [ ] **Step 2: Run it and see it fail**

```bash
npx jest library/brew/__tests__/bands.test.ts
```

Expected: FAIL, "Cannot find module '@/library/brew/bands'".

- [ ] **Step 3: Implement**

Create `library/brew/bands.ts`:

```ts
/**
 * How the brew screen's flexible height is shared out.
 *
 * The screen was a stack of constants inside a flexible space: a 150 pt trace,
 * a 120 pt lane and a ladder given `flex: 1` with nothing to grow with, which
 * on a four-stage recipe left roughly 230 pt of black. Every band now has a
 * floor and a cap, and the leftover height is offered to them in order.
 *
 * All figures are points.
 */

/** The trace takes the first of the slack: it is the thing worth looking at. */
export const TRACE_FLOOR = 120;
export const TRACE_CAP = 200;

/** Then the rung bars thicken. */
export const BAR_FLOOR = 9;
export const BAR_CAP = 15;

/** Then the rungs spread out, without limit, until the ladder fills its box. */
export const GAP_FLOOR = 3;

export type Bands = {
    traceHeight: number;
    barHeight: number;
    rungGap: number;
    /** True when even the floors do not fit, so the ladder must scroll. */
    scrolls: boolean;
};

/**
 * Share `flexHeight` between the trace and the ladder.
 *
 * @param flexHeight the measured height available to the trace and the ladder
 *                   together, with the nav row, figures, now card and action
 *                   already taken out
 * @param stages     how many rungs the ladder will draw
 */
export function allocateBands(flexHeight: number, stages: number): Bands {
    if (stages <= 0) {
        return {
            traceHeight: Math.min(TRACE_CAP, Math.max(TRACE_FLOOR, flexHeight)),
            barHeight: BAR_FLOOR, rungGap: GAP_FLOOR, scrolls: false
        };
    }

    const floors = TRACE_FLOOR + stages * (BAR_FLOOR + GAP_FLOOR);
    let slack = flexHeight - floors;
    if (slack < 0) {
        return {
            traceHeight: TRACE_FLOOR, barHeight: BAR_FLOOR, rungGap: GAP_FLOOR,
            scrolls: true
        };
    }

    const traceHeight = Math.min(TRACE_CAP, TRACE_FLOOR + slack);
    slack -= traceHeight - TRACE_FLOOR;

    const barHeight = Math.min(BAR_CAP, BAR_FLOOR + Math.floor(slack / stages));
    slack -= (barHeight - BAR_FLOOR) * stages;

    const rungGap = GAP_FLOOR + Math.floor(slack / stages);

    return {traceHeight, barHeight, rungGap, scrolls: false};
}
```

- [ ] **Step 4: Run it and see it pass**

```bash
npx jest library/brew/__tests__/bands.test.ts
```

Expected: PASS, eight tests.

- [ ] **Step 5: Commit**

```bash
npm run typecheck && npm run lint && npm test
git add library/brew/bands.ts library/brew/__tests__/bands.test.ts
git commit -m "feat: every band on the brew screen gets a floor and a cap

The screen was fixed heights inside a flexible space, which is why a
four-stage brew left a couple of hundred points of black at the bottom.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 10: The now card

A fixed-height card that says what **this** stage is doing, replacing the four-item legend that listed every possible pour pattern whether or not it was in use.

**Files:**
- Create: `components/BrewNowCard.tsx`
- Modify: `constants/brewCopy.ts` (`PATTERN_SENTENCE`, `AGITATION_SENTENCE`)
- Modify: `constants/__tests__/brewCopy.test.ts` (the em-dash guard has to see the new tables)
- Test: `components/__tests__/BrewNowCard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/BrewNowCard.test.tsx`:

```tsx
import React from "react";

import BrewNowCard from "@/components/BrewNowCard";
import {palette} from "@/constants/colors";
import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";
import {renderWithProviders} from "@/test-utils/render";

function stage(pattern: number, pause: number): Pour {
    return new Pour(1, 70, 92, 40, AGITATION.ALL_OFF, pattern, pause);
}

describe("BrewNowCard", () => {
    it("names what the stage is doing, in the order the mockup had it", async () => {
        const {getByText} = await renderWithProviders(
            <BrewNowCard pour={stage(POUR_PATTERN.SPIRAL, 20)} accent={palette.brand}
                         resting={false} />
        );

        expect(getByText("POURING · SPIRAL · 92°")).toBeTruthy();
    });

    it("says the pattern in a sentence, and what happens after it", async () => {
        const {getByText} = await renderWithProviders(
            <BrewNowCard pour={stage(POUR_PATTERN.SPIRAL, 20)} accent={palette.brand}
                         resting={false} />
        );

        expect(getByText(/Out from the centre and back/)).toBeTruthy();
        expect(getByText(/rests 20 s/)).toBeTruthy();
    });

    it("does not promise a rest that the recipe does not ask for", async () => {
        const {getByText} = await renderWithProviders(
            <BrewNowCard pour={stage(POUR_PATTERN.CIRCULAR, 0)} accent={palette.brand}
                         resting={false} />
        );

        expect(getByText(/Round the bed in a steady ring\.$/)).toBeTruthy();
    });

    it("says RESTING once the water is in", async () => {
        const {getByText} = await renderWithProviders(
            <BrewNowCard pour={stage(POUR_PATTERN.SPIRAL, 20)} accent={palette.brand}
                         resting />
        );

        expect(getByText("RESTING · SPIRAL · 92°")).toBeTruthy();
    });

    it("mentions the stirring, which the pour pattern never says", async () => {
        const stirring = new Pour(1, 70, 92, 40, AGITATION.BEFORE_ON_AFTER_ON,
                                  POUR_PATTERN.CIRCULAR, 0);
        const {getByText} = await renderWithProviders(
            <BrewNowCard pour={stirring} accent={palette.brand} resting={false} />
        );

        expect(getByText(/It stirs the bed before and after\.$/)).toBeTruthy();
    });

    it("shows nothing at all before a stage is live", async () => {
        const {toJSON} = await renderWithProviders(
            <BrewNowCard pour={undefined} accent={palette.brand} resting={false} />
        );

        expect(toJSON()).toBeNull();
    });
});
```

- [ ] **Step 2: Run it and see it fail**

```bash
npx jest components/__tests__/BrewNowCard.test.tsx
```

Expected: FAIL, "Cannot find module '@/components/BrewNowCard'".

- [ ] **Step 3: Implement**

In `constants/brewCopy.ts`, add:

```ts
/**
 * What each pour pattern is doing, in one clause.
 *
 * The brew screen used to list all four of these at once, whether or not the
 * stage in front of the user was any of them. It names the live one instead.
 */
export const PATTERN_SENTENCE: Record<GlyphKind, string> = {
    centered: "Straight down onto the middle of the bed",
    circular: "Round the bed in a steady ring",
    spiral: "Out from the centre and back",
    /**
     * Unreachable through `glyphForPattern`, which only ever returns the three
     * above -- agitation is a separate field on the pour, not a pattern, and
     * only `StageTile` ever asks for this glyph by name. The key stays so the
     * table is total over `GlyphKind` and an index can never come back
     * undefined and print "POURING · undefined · 92°".
     */
    agitation: "It stirs the bed rather than pouring"
};

/**
 * The stirring, which the pour pattern cannot tell you about.
 *
 * `Pour.agitation` is its own field with its own four values, so a stage that
 * both spirals and stirs was described only as a spiral. Keyed by
 * `AGITATION.*`; `ALL_OFF` is deliberately absent, because saying nothing is
 * the right thing to say about a stage that does not stir.
 */
export const AGITATION_SENTENCE: Record<number, string> = {
    [AGITATION.BEFORE_ON_AFTER_OFF]: "It stirs the bed first.",
    [AGITATION.BEFORE_OFF_AFTER_ON]: "It stirs the bed afterwards.",
    [AGITATION.BEFORE_ON_AFTER_ON]: "It stirs the bed before and after."
};
```

`brewCopy.ts` currently imports nothing. Add, at the top of the file:

```ts
import type {GlyphKind} from "@/components/PourGlyph";
import {AGITATION} from "@/library/Pour";
```

`constants/recipeHelp.ts:13` already imports from `@/library`, so this direction is established, and neither `Pour` nor `PourGlyph` imports `brewCopy`, so there is no cycle.

Create `components/BrewNowCard.tsx`:

```tsx
// components/BrewNowCard.tsx
import React from "react";
import {YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {glyphForPattern, type GlyphKind} from "@/components/PourGlyph";
import {AGITATION_SENTENCE, PATTERN_SENTENCE} from "@/constants/brewCopy";
import {palette} from "@/constants/colors";
import {pauseSeconds} from "@/library/brew/brewShape";
import type Pour from "@/library/Pour";

type Props = {
    /** The live stage. Undefined before the first pour and after the last. */
    pour: Pour | undefined;
    accent: string;
    /** The water is in and the planned rest has begun. */
    resting: boolean;
};

/**
 * The pattern word, upper case, for the heading.
 *
 * Total over `GlyphKind` for the same reason `PATTERN_SENTENCE` is.
 */
const PATTERN_WORD: Record<GlyphKind, string> = {
    centered: "CENTRED",
    circular: "CIRCULAR",
    spiral: "SPIRAL",
    agitation: "AGITATION"
};

/**
 * One sentence about the stage in front of you.
 *
 * Never grows: the figures row above already shows water and cup in large
 * type, so a second big number here would be a duplicate. The value of this
 * card is the sentence.
 */
export default function BrewNowCard({pour, accent, resting}: Props) {
    if (pour === undefined) return null;

    const kind = glyphForPattern(pour.pourPattern);
    const rest = Math.round(pauseSeconds(pour));
    const heading = `${resting ? "RESTING" : "POURING"} · ${PATTERN_WORD[kind]} · `
        + `${Math.max(pour.temperature, 0)}°`;
    const pattern = rest > 0
        ? `${PATTERN_SENTENCE[kind]}, then it rests ${rest} s.`
        : `${PATTERN_SENTENCE[kind]}.`;
    const stir = AGITATION_SENTENCE[pour.agitation];
    const sentence = stir === undefined ? pattern : `${pattern} ${stir}`;

    return (
        <YStack
            testID="now-card"
            backgroundColor={palette.raised}
            borderRadius="$4"
            padding="$3"
            gap="$2"
        >
            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6} color={accent}>
                {heading}
            </DotMatrixText>
            <DotMatrixText fontSize={11} color={palette.dim}>
                {sentence}
            </DotMatrixText>
        </YStack>
    );
}
```

- [ ] **Step 4: Let the em-dash guard see the new tables**

`constants/__tests__/brewCopy.test.ts` flattens every user-readable table into `ALL` and asserts none of them contains an em dash. Two new tables of user-readable prose have just been added and the guard cannot see either, so add them to the import list and to `ALL`:

```ts
    ...Object.values(PATTERN_SENTENCE),
    ...Object.values(AGITATION_SENTENCE),
```

Then prove the guard actually reaches them: put an em dash into one `PATTERN_SENTENCE` value, run `npx jest constants/__tests__/brewCopy.test.ts`, watch it fail, and take it out again. Report that you did this.

- [ ] **Step 5: Run it and see it pass**

```bash
npx jest components/__tests__/BrewNowCard.test.tsx
```

Expected: PASS, six tests.

- [ ] **Step 6: Commit**

```bash
npm run typecheck && npm run lint && npm test
git add components/BrewNowCard.tsx constants/brewCopy.ts \
    components/__tests__/BrewNowCard.test.tsx constants/__tests__/brewCopy.test.ts
git commit -m "feat: a card that says what this stage is doing

It replaces a legend that listed all four pour patterns whether or not
any of them was the one in front of the user.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 11: The ladder, elastic

The ladder stops hard-coding the lane width, stops drawing the pattern legend, takes its bar height and spacing from the bands, and hands each rung its own water, rest and stalls.

**Files:**
- Modify: `components/BrewStageLadder.tsx`
- Test: `components/__tests__/BrewStageLadder.test.tsx`

- [ ] **Step 1: Write the failing test**

Replace the body of `components/__tests__/BrewStageLadder.test.tsx`:

```tsx
import React from "react";

import BrewStageLadder from "@/components/BrewStageLadder";
import {palette} from "@/constants/colors";
import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";
import {renderWithProviders} from "@/test-utils/render";

function pours(count: number): Pour[] {
    return Array.from({length: count}, (_, i) =>
        new Pour(i + 1, 40, 93, 40, AGITATION.ALL_OFF, POUR_PATTERN.CENTERED, 10));
}

async function draw(overrides: Partial<React.ComponentProps<typeof BrewStageLadder>> = {}) {
    return renderWithProviders(
        <BrewStageLadder
            pours={pours(4)}
            accent={palette.brand}
            activeIndex={1}
            barHeight={11}
            rungGap={8}
            scrolls={false}
            stageWater={[40, 20, 0, 0]}
            stalls={[[], [], [], []]}
            pauseElapsed={0}
            {...overrides}
        />
    );
}

describe("BrewStageLadder", () => {
    it("draws one rung per stage", async () => {
        const {getByTestId} = await draw();

        for (const i of [0, 1, 2, 3]) expect(getByTestId(`rung-${i}`)).toBeTruthy();
    });

    it("no longer lists every pour pattern that is not in use", async () => {
        const {queryByText} = await draw();

        expect(queryByText("AGITATION")).toBeNull();
        expect(queryByText("CIRCULAR")).toBeNull();
    });

    it("shares one time scale across every rung", async () => {
        // Stage 2 stalled for 30 s, so the scale must grow for all of them.
        const {getByTestId} = await draw({
            stalls: [[], [{atMl: 10, seconds: 30}], [], []]
        });

        // 40 ml at 4 ml/s is 10 s of pour plus a 10 s rest: a clean stage is
        // 20 s. The stalled one is 50, so a clean rung must leave 30 s of slack.
        expect(getByTestId("rung-0")).toBeTruthy();
        expect(getByTestId("rung-1")).toBeTruthy();
    });

    it("gives each rung its own water", async () => {
        const {getByText} = await draw({stageWater: [40, 22, 0, 0]});

        expect(getByText("22/40 ml")).toBeTruthy();
    });

    it("marks everything done once the brew is over", async () => {
        const {getByTestId} = await draw({
            activeIndex: 4, stageWater: [40, 40, 40, 40]
        });

        expect(getByTestId("rung-3").props.style).not.toEqual(
            expect.objectContaining({opacity: 0.45})
        );
    });

    it("marks everything pending before it starts", async () => {
        const {getByTestId} = await draw({
            activeIndex: null, stageWater: [0, 0, 0, 0]
        });

        expect(getByTestId("rung-0").props.style).toEqual(
            expect.objectContaining({opacity: 0.45})
        );
    });
});
```

- [ ] **Step 2: Run it and see it fail**

```bash
npx jest components/__tests__/BrewStageLadder.test.tsx
```

Expected: FAIL — the props `barHeight`, `rungGap`, `scrolls`, `stageWater`, `stalls` and `pauseElapsed` do not exist and `stageElapsed` is required.

- [ ] **Step 3: Rewrite the component**

Replace `components/BrewStageLadder.tsx` entirely:

```tsx
// components/BrewStageLadder.tsx
import React, {useEffect, useRef} from "react";
import {ScrollView, View} from "react-native";
import {YStack} from "tamagui";

import BrewStageRung, {type RungState} from "@/components/BrewStageRung";
import {pauseSeconds, pourSeconds} from "@/library/brew/brewShape";
import {rungSegments} from "@/library/brew/rungGeometry";
import type {Stall} from "@/library/brew/stalls";
import type Pour from "@/library/Pour";

type Props = {
    pours: Pour[];
    accent: string;
    /**
     * The live stage, zero-based. `null` before the brew starts — everything
     * pending — and `pours.length` once it is over, which is how a finished
     * brew in history shows every stage done.
     */
    activeIndex: number | null;
    /** From `allocateBands`. */
    barHeight: number;
    rungGap: number;
    /** True when the bands are at their floors and the list will not fit. */
    scrolls: boolean;
    /** Millilitres delivered, index-aligned with `pours`. */
    stageWater: number[];
    /** Index-aligned with `pours`. */
    stalls: Stall[][];
    /** Seconds into the live stage's planned rest. */
    pauseElapsed: number;
};

/**
 * The stages, as a ladder.
 *
 * The lane inside a rung is `flex: 1` and the whole ladder grows into whatever
 * height it is given, so a four-stage recipe on a large phone fills the screen
 * and a nine-stage one sits at every floor and scrolls.
 */
export default function BrewStageLadder({
    pours, accent, activeIndex, barHeight, rungGap, scrolls, stageWater, stalls,
    pauseElapsed
}: Props) {
    const scroller = useRef<ScrollView>(null);
    // Maps rung index → measured y-offset relative to the ScrollView content.
    const rungY = useRef<Record<number, number>>({});

    // One scale for every rung, or a lane says nothing about its neighbours.
    // Stalls are in it: that is what makes a stage that struggled stick out
    // past the ones that did not, by exactly the time it lost.
    const laneSeconds = pours.reduce((widest, pour, i) => {
        const spent = rungSegments({
            pour,
            delivered: stageWater[i] ?? 0,
            pauseElapsed: i === activeIndex ? pauseElapsed : 0,
            stalls: stalls[i] ?? []
        }).reduce((sum, segment) => sum + segment.seconds, 0);
        return Math.max(widest, pourSeconds(pour) + pauseSeconds(pour), spent);
    }, 0);

    useEffect(() => {
        // Sentinels: null = not yet started, pours.length = brew finished.
        // Only scroll for a genuinely live stage.
        if (activeIndex === null || activeIndex < 0 || activeIndex >= pours.length) return;
        const y = rungY.current[activeIndex];
        if (y === undefined) return;
        // A small lead keeps the active rung from sitting flush at the top edge.
        scroller.current?.scrollTo({y: Math.max(0, y - 8), animated: true});
    }, [activeIndex, pours.length]);

    const rows = pours.map((pour, index) => {
        const state: RungState =
            activeIndex === null ? "pending"
            : index < activeIndex ? "done"
            : index === activeIndex ? "active"
            : "pending";

        return (
            <View
                key={`row-${index}`}
                testID={`row-${index}`}
                style={{paddingVertical: rungGap / 2}}
                onLayout={(e) => { rungY.current[index] = e.nativeEvent.layout.y; }}
            >
                <BrewStageRung
                    testID={`rung-${index}`}
                    pour={pour}
                    index={index}
                    state={state}
                    accent={accent}
                    laneSeconds={laneSeconds}
                    barHeight={barHeight}
                    delivered={stageWater[index] ?? 0}
                    pauseElapsed={index === activeIndex ? pauseElapsed : 0}
                    stalls={stalls[index] ?? []}
                />
            </View>
        );
    });

    // Only a ladder that cannot fit is allowed to scroll. A ScrollView that
    // never scrolls still swallows the drag that dismisses the modal.
    if (!scrolls) return <YStack testID="ladder" flex={1}>{rows}</YStack>;

    return (
        <ScrollView ref={scroller} style={{flex: 1}}>
            <View testID="ladder">{rows}</View>
        </ScrollView>
    );
}
```

`GLYPH_WORDS`, the inline stage card and the holding banner are all gone: the sentence now lives in `BrewNowCard`, and holding is drawn inside the rung where it happened.

- [ ] **Step 4: Run it and see it pass**

```bash
npx jest components/__tests__/BrewStageLadder.test.tsx
```

Expected: PASS, six tests.

- [ ] **Step 5: Commit**

```bash
npm run typecheck && npm run lint && npm test
git add components/BrewStageLadder.tsx components/__tests__/BrewStageLadder.test.tsx
git commit -m "feat: the ladder grows into the height it is given

Bar height and spacing come from the bands, the lane takes the row, the
pattern legend is gone, and one time scale covers every rung with stalls
in it so a stage that struggled sticks out past the ones that did not.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 12: The trace, as it was drawn

A gradient beneath the poured-water line, faint gridlines at stage boundaries, and a legend in its own row beneath the graph. The `3/5` counter leaves the trace: it moves to the nav row in Task 14, where it can never disagree with anything, because there is only one of it.

**Files:**
- Modify: `components/BrewTrace.tsx`
- Modify: `app/brew.tsx` (stop passing `stage` and `stages`)
- Test: `components/__tests__/BrewTrace.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `components/__tests__/BrewTrace.test.tsx`, keeping the existing tests:

```tsx
describe("the trace as it was drawn", () => {
    it("fills beneath the water line", async () => {
        const {getByTestId} = await renderWithProviders(
            <BrewTrace
                pours={pours(4)}
                samples={samples()}
                accent={palette.brand}
                width={320}
                height={180}
                plannedSeconds={80}
            />
        );

        expect(getByTestId("trace-water-fill")).toBeTruthy();
    });

    it("marks where each stage ends", async () => {
        const {getAllByTestId} = await renderWithProviders(
            <BrewTrace
                pours={pours(4)}
                samples={samples()}
                accent={palette.brand}
                width={320}
                height={180}
                plannedSeconds={80}
            />
        );

        // Three internal boundaries on four stages; the last one is the edge.
        expect(getAllByTestId(/^trace-gridline-/)).toHaveLength(3);
    });

    it("names its three lines in a row beneath the graph", async () => {
        const {getByText} = await renderWithProviders(
            <BrewTrace
                pours={pours(4)}
                samples={samples()}
                accent={palette.brand}
                width={320}
                height={180}
                plannedSeconds={80}
            />
        );

        expect(getByText("WATER")).toBeTruthy();
        expect(getByText("CUP")).toBeTruthy();
        expect(getByText("PLAN")).toBeTruthy();
    });

    it("draws neither fill nor legend in the bar", async () => {
        const {queryByTestId, queryByText} = await renderWithProviders(
            <BrewTrace
                pours={pours(4)}
                samples={samples()}
                accent={palette.brand}
                width={86}
                height={34}
                plannedSeconds={80}
                compact
            />
        );

        expect(queryByTestId("trace-water-fill")).toBeNull();
        expect(queryByText("WATER")).toBeNull();
    });
});
```

`pours` and `samples` are whatever helpers the existing file already defines; reuse them rather than adding new ones.

- [ ] **Step 2: Run it and see it fail**

```bash
npx jest components/__tests__/BrewTrace.test.tsx -t "as it was drawn"
```

Expected: FAIL — no `trace-water-fill`, no gridlines, no legend.

- [ ] **Step 3: Implement**

In `components/BrewTrace.tsx`:

Widen the imports:

```tsx
import Svg, {Defs, Line, LinearGradient, Path, Stop} from "react-native-svg";
```

Delete the `stage` and `stages` props from `Props` and from the destructured parameter list, and delete the whole upper `<XStack justifyContent="flex-end" height={CHROME}>` block that drew the counter.

Add, beside the existing constants:

```tsx
/** Height of the legend row beneath the graph. */
const LEGEND = 14;

/** The gradient's opacity at the line and at the floor. */
const FILL_TOP = 0.28;
const FILL_BOTTOM = 0;
```

Change the height arithmetic so the legend is paid for out of the same budget as the overrun row:

```tsx
    // In compact mode the SVG fills the full height; otherwise the legend row
    // and the overrun row take theirs first.
    const svgHeight = compact
        ? height
        : Math.max(height - CHROME - LEGEND, PLOT_FLOOR);
```

Add the closed path for the fill and the gridline positions, next to `waterPath`:

```tsx
    // The water line, carried down to the floor and back, so it can be filled.
    // Built here rather than by setting `fill` on the line itself: an open
    // path fills between its endpoints and cuts the corner off the curve.
    const waterFill = waterPath === ""
        ? ""
        : `${waterPath} L${round(box.width * (ranTo / Math.max(box.maxT, 1)))} `
          + `${svgHeight} L0 ${svgHeight} Z`;

    // Where each stage ends, as a fraction of the axis. The last boundary is
    // the right-hand edge of the chart and is not drawn.
    const boundaries = stageSpans(pours)
        .slice(0, -1)
        .map((span) => (span.end / Math.max(box.maxT, 1)) * box.width);
```

`round` is a one-decimal helper; add it beside them:

```tsx
/** One decimal, as in `toPath`. Long SVG paths are mostly noise. */
function round(n: number): number {
    return Math.round(n * 10) / 10;
}
```

and import `stageSpans` from `@/library/brew/brewShape` alongside the existing imports.

Inside the non-compact `<Svg>`, before the plan path:

```tsx
                <Defs>
                    <LinearGradient id="waterFill" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={accent} stopOpacity={FILL_TOP} />
                        <Stop offset="1" stopColor={accent} stopOpacity={FILL_BOTTOM} />
                    </LinearGradient>
                </Defs>
                {boundaries.map((x, i) => (
                    <Line
                        key={`gridline-${i}`}
                        testID={`trace-gridline-${i}`}
                        x1={x} y1={0} x2={x} y2={svgHeight}
                        stroke={palette.line}
                        strokeWidth={1}
                    />
                ))}
                {waterFill !== "" && (
                    <Path testID="trace-water-fill" d={waterFill} fill="url(#waterFill)"
                          stroke="none" />
                )}
```

The gridlines and the fill go first so every line draws over them.

Then, between the `</Svg>` and the overrun row, the legend:

```tsx
            <XStack height={LEGEND} alignItems="center" gap="$3">
                <LegendItem colour={holding ? palette.warn : accent} label="WATER" />
                <LegendItem colour={palette.muted} label="CUP" dotted />
                <LegendItem colour={planColor} label="PLAN" dashed />
            </XStack>
```

and the item, at module scope:

```tsx
/**
 * One entry in the legend.
 *
 * Beneath the graph rather than over it. Top-left is clear at the end of a
 * brew but sits on the plan dashes at the start, so overlaying it trades one
 * legibility problem for another; a dedicated row costs 14 pt and never
 * collides with anything.
 */
function LegendItem({colour, label, dashed = false, dotted = false}: {
    colour: string; label: string; dashed?: boolean; dotted?: boolean;
}) {
    return (
        <XStack alignItems="center" gap="$1.5">
            <Svg width={14} height={6}>
                <Line
                    x1={0} y1={3} x2={14} y2={3}
                    stroke={colour}
                    strokeWidth={2}
                    strokeDasharray={dashed ? "3 3" : dotted ? "1 3" : undefined}
                />
            </Svg>
            <DotMatrixText fontSize={9} weight="bold" letterSpacing={1.2}
                           color={palette.dim}>
                {label}
            </DotMatrixText>
        </XStack>
    );
}
```

Finally, in `app/brew.tsx`, delete the two lines that pass the counter:

```tsx
                stage={phase.name === "pouring" ? phase.pour : undefined}
                stages={phase.name === "pouring" ? phase.pours : undefined}
```

- [ ] **Step 4: Run it and see it pass**

```bash
npx jest components/__tests__/BrewTrace.test.tsx app/__tests__/brew.test.tsx
```

Expected: PASS. If `brew.test.tsx` asserts the `3/4` counter from the trace, leave that test failing and note it — Task 14 moves the counter to the nav row and will fix it there. If it is easier, move the assertion in this step and mark it skipped with a comment naming Task 14.

- [ ] **Step 5: Commit**

```bash
npm run typecheck && npm run lint && npm test
git add components/BrewTrace.tsx components/__tests__/BrewTrace.test.tsx app/brew.tsx
git commit -m "feat: the trace gets the treatment it was drawn with

A gradient beneath the water, gridlines where the stages change, and a
legend in a row beneath the graph rather than over the plan dashes. The
stage counter leaves the trace; the nav row takes it.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 13: A chevron that points down

The brew screen becomes a modal and dismisses downwards, which needs a glyph the dot-matrix set does not have.

**Files:**
- Modify: `constants/dotIcons.ts`
- Modify: `constants/__tests__/dotIcons.test.ts`

- [ ] **Step 1: Write the failing test**

In `constants/__tests__/dotIcons.test.ts`, add `"chevron-down"` to the hard-coded list, keeping it sorted:

```ts
        expect(names.sort()).toEqual(
            ["back", "chevron-down", "chevron-right", "close", "delete", "duplicate",
             "edit", "error", "help", "import", "info", "minus", "more", "overflow",
             "plus", "refresh", "revert", "scan", "settings", "share", "success"]
        );
```

- [ ] **Step 2: Run it and see it fail**

```bash
npx jest constants/__tests__/dotIcons.test.ts
```

Expected: FAIL — `chevron-down` is missing from `DOT_ICONS`.

- [ ] **Step 3: Add the glyph**

In `constants/dotIcons.ts`, beside `chevron-right`. Every row is exactly `DOT_ICON_GRID` (9) characters:

```ts
    /** Dismisses the brew modal downwards, mirroring `chevron-right`. */
    "chevron-down": [
        ".........",
        ".........",
        ".........",
        "##.....##",
        ".##...##.",
        "..##.##..",
        "...###...",
        ".........",
        "........."
    ],
```

- [ ] **Step 4: Run it and see it pass**

```bash
npx jest constants/__tests__/dotIcons.test.ts components/__tests__/DotIcon.test.tsx
```

Expected: PASS. The grid-shape test in the same file checks every row is nine characters, so a miscount fails here.

- [ ] **Step 5: Commit**

```bash
npm run typecheck && npm run lint && npm test
git add constants/dotIcons.ts constants/__tests__/dotIcons.test.ts
git commit -m "feat: a chevron-down for dismissing the brew modal

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 14: The screen

The nav row, the elastic layout, the honest handshake, the suppressed error, and the removal of DONE.

**Files:**
- Modify: `app/brew.tsx`
- Test: `app/__tests__/brew.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `app/__tests__/brew.test.tsx`, following the existing render helper in that file:

```tsx
describe("the brew screen says true things", () => {
    it("never claims to be ready when it has only just been asked", async () => {
        const {queryByText} = await drawBrew({phase: {name: "idle"}});

        expect(queryByText("Ready when you are.")).toBeNull();
        expect(queryByText("Connecting to the machine…")).toBeTruthy();
    });

    it("still says ready once the recipe is actually loaded", async () => {
        const {getByText} = await drawBrew({phase: {name: "readyToStart"}});

        expect(getByText("Recipe loaded. Ready when you are.")).toBeTruthy();
    });

    it("does not say the same refusal twice", async () => {
        const {queryAllByText} = await drawBrew({
            phase: {name: "failed", reason: "blocked", block: "busy",
                    detail: "The machine is busy. Wait for it to finish."},
            error: "The machine is busy. Wait for it to finish."
        });

        expect(queryAllByText("The machine is busy. Wait for it to finish."))
            .toHaveLength(1);
    });

    it("still reports a transport error that no phase explains", async () => {
        const {getByText} = await drawBrew({
            phase: {name: "pouring", pour: 2, pours: 4},
            error: "The link dropped."
        });

        expect(getByText("The link dropped.")).toBeTruthy();
    });

    it("puts the stage counter in the nav row, where there is only one of it", async () => {
        const {getByTestId} = await drawBrew({phase: {name: "pouring", pour: 3, pours: 4}});

        expect(getByTestId("brew-stage-counter").props.children).toBe("3/4");
    });

    it("offers a chevron down rather than a DONE button", async () => {
        const {getByLabelText, queryByLabelText} = await drawBrew({phase: {name: "done"}});

        expect(getByLabelText("Close")).toBeTruthy();
        expect(queryByLabelText("Done")).toBeNull();
    });
});
```

`drawBrew` is the existing helper. If it does not yet accept an `error` override, extend it: the screen reads `error` from `useLiveBrew`, so the override belongs on the mocked context value the helper already builds.

- [ ] **Step 2: Run them and see them fail**

```bash
npx jest app/__tests__/brew.test.tsx -t "true things"
```

Expected: FAIL on all six.

- [ ] **Step 3: Implement**

In `app/brew.tsx`:

Delete `const TRACE_HEIGHT = 150;`. Add the imports:

```tsx
import DotIcon from "@/components/DotIcon";
import BrewNowCard from "@/components/BrewNowCard";
import MachineDot from "@/components/MachineDot";
import {allocateBands} from "@/library/brew/bands";
import {useMachine} from "@/hooks/useMachine";
import {pauseSeconds} from "@/library/brew/brewShape";
```

Read the new snapshot fields beside the existing ones:

```tsx
    const stalls = run?.stalls ?? [];
    const stageWater = run?.stageWater ?? [];
    const pauseElapsed = run?.pauseElapsed ?? 0;
```

Measure the flexible region. `onLayout` is an event handler, not an effect, so `setState` here is allowed and is the only way to know how much room there is:

```tsx
    const [flexHeight, setFlexHeight] = useState(0);
    const bands = allocateBands(flexHeight, recipe.pours.length);
```

Replace `PHASE_COPY[phase.name]` in the `headline` expression so `idle` never reaches the screen:

```tsx
    // A commanded run that has not moved yet is not finished, which is what
    // "Ready when you are." claimed at the exact moment it had not begun.
    const phaseCopy = phase.name === "idle" && !viewing
        ? PHASE_COPY.connecting
        : PHASE_COPY[phase.name];
```

and use `phaseCopy` in place of `PHASE_COPY[phase.name]`.

Drive the headline's opacity from the beat that already exists, so there is one vocabulary of motion and no spinner:

```tsx
    // The same beat that pulses the plan line. A second progress metaphor
    // would compete with the ladder, and a spinner says "busy" without saying
    // "busy with what".
    const WORKING = new Set(["idle", "waking", "sending"]);
    const headlineOpacity = WORKING.has(phase.name) ? motion.opacity : 1;
```

`WORKING` belongs at module scope, next to the other constants, not inside the component.

Suppress the transport error when the phase already explains it:

```tsx
            {/* `error` is the transport channel. When the phase is already a
                failure it is restating it, which is how one refusal came to be
                printed three times. It speaks only about things the phase
                cannot. */}
            {error !== null && phase.name !== "failed" && (
                <Text color={palette.danger} fontSize={13}>{error}</Text>
            )}
```

Replace the whole return with the banded layout:

```tsx
    const {status, connect} = useMachine();
    const liveIndex = activeIndex !== null && activeIndex < recipe.pours.length
        ? activeIndex : null;
    const livePour = liveIndex === null ? undefined : recipe.pours[liveIndex];
    const resting = livePour !== undefined
        && (stageWater[liveIndex ?? 0] ?? 0) >= Math.max(livePour.volume, 0)
        && pauseSeconds(livePour) > 0;

    return (
        <YStack flex={1} backgroundColor={palette.base} padding="$4" gap="$3">
            {/* The nav row the mockup drew. `brew` is declared in the
                navigator with `headerShown: false`, so this is the only bar. */}
            <XStack alignItems="center" gap="$2">
                <Pressable accessibilityRole="button" accessibilityLabel="Close"
                           onPress={() => router.back()}>
                    <DotIcon name="chevron-down" size={16} color={palette.dim} />
                </Pressable>
                <MachineDot status={status} accent={accent} onPress={() => void connect()} />
                <Text color={palette.dim} fontSize={13} flex={1} numberOfLines={1}>
                    {recipe.displayName()}
                </Text>
                {phase.name === "pouring" && (
                    <DotMatrixText testID="brew-stage-counter" fontSize={12}
                                   weight="bold" letterSpacing={1.4} color={palette.dim}>
                        {`${phase.pour}/${phase.pours}`}
                    </DotMatrixText>
                )}
            </XStack>

            <YStack flex={1} gap="$3"
                    onLayout={(e) => setFlexHeight(e.nativeEvent.layout.height)}>
                <BrewTrace
                    pours={recipe.pours}
                    samples={samples}
                    accent={accent}
                    width={width - SCREEN_PADDING * 2}
                    height={bands.traceHeight}
                    plannedSeconds={plannedSeconds(recipe.pours)}
                    holding={holding}
                    planOpacity={motion.opacity}
                    planColor={planColor}
                    planDashed={motion.dashed}
                    planHeadAt={motion.headAt}
                />

                <BrewStageLadder
                    pours={recipe.pours}
                    accent={accent}
                    activeIndex={activeIndex}
                    barHeight={bands.barHeight}
                    rungGap={bands.rungGap}
                    scrolls={bands.scrolls}
                    stageWater={stageWater}
                    stalls={stalls}
                    pauseElapsed={pauseElapsed}
                />
            </YStack>

            <BrewFigures
                water={last?.water ?? 0}
                cup={last?.cup ?? 0}
                seconds={elapsed}
                accent={accent}
            />

            <BrewNowCard pour={livePour} accent={accent} resting={resting} />

            <DotMatrixText fontSize={14} weight="bold" letterSpacing={1.8}
                           color={headlineColor} opacity={headlineOpacity}>
                {headline}
            </DotMatrixText>

            {blocked && (
                <Text color={palette.warn} fontSize={13}>
                    {blockedForWater
                        ? blockedWaterCopy(total)
                        : (phase.name === "failed" ? phase.detail : undefined)
                          ?? "The machine would not take this brew."}
                </Text>
            )}

            {!firstBrewDone && running && (
                <Text color={palette.warn} fontSize={13}>{FIRST_BREW_REMINDER}</Text>
            )}

            {offerPro && <Text color={palette.dim} fontSize={13}>{PRO_MODE_PROMPT}</Text>}
            {error !== null && phase.name !== "failed" && (
                <Text color={palette.danger} fontSize={13}>{error}</Text>
            )}

            {running ? (
                <YStack gap="$3">
                    {phase.name === "readyToStart" && (
                        <Action label="Start brewing" color={palette.success}
                                onPress={() => void startBrew()} />
                    )}
                    <Action label="Cancel" color={palette.danger}
                            onPress={() => void cancelBrew()} />
                </YStack>
            ) : (
                <YStack gap="$3">
                    {offerRetry && (
                        <Action label="Try again" color={palette.text}
                                onPress={() => start(recipe)} />
                    )}
                    {offerPro && (
                        <Action label="Switch to PRO" color={palette.warn}
                                onPress={() => startInPro(recipe)} />
                    )}
                    {phase.name === "done" && (
                        <Action label="Export this brew" color={palette.dim}
                                onPress={() => router.push("/brewRecord?latest=1")} />
                    )}
                    {/* No DONE. The chevron in the nav row dismisses the modal,
                        and a second control duplicated it — painted in
                        `palette.line`, the hairline colour, which is why it
                        read as disabled. */}
                </YStack>
            )}
        </YStack>
    );
```

Add `XStack` to the `tamagui` import and delete the now-unused `navigation.setOptions({title: ""})` effect and the `useNavigation` import: the navigator declares the screen headerless in Task 15.

- [ ] **Step 4: Run them and see them pass**

```bash
npx jest app/__tests__/brew.test.tsx
```

Expected: PASS, whole file.

- [ ] **Step 5: Commit**

```bash
npm run typecheck && npm run lint && npm test
git add app/brew.tsx app/__tests__/brew.test.tsx
git commit -m "feat: the brew screen fills the device and says true things

Bands with floors and caps replace the fixed heights, the nav row the
mockup drew replaces the default native bar, the commanded-but-unmoved
window says it is connecting rather than that it is ready, a refusal is
printed once instead of three times, and DONE goes: the chevron in the
nav row is the way out.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 15: A screen that rises, and a bar that drops

`brew` is not declared in the navigator at all, which is why it falls through to the default native bar with a `< index` back title. It becomes a modal: the mini bar expanded, the Now Playing model.

**Files:**
- Modify: `app/_layout.tsx`
- Modify: `components/LiveBrewBar.tsx`
- Test: `components/__tests__/LiveBrewBar.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `components/__tests__/LiveBrewBar.test.tsx`:

```tsx
describe("where the bar shows itself", () => {
    it("hides on the brew screen, which is the same brew at full size", async () => {
        mockPathname("/brew");
        const {toJSON} = await drawBar();

        expect(toJSON()).toBeNull();
    });

    it("hides on the export screen, which the modal would otherwise cover", async () => {
        mockPathname("/brewRecord");
        const {toJSON} = await drawBar();

        expect(toJSON()).toBeNull();
    });

    it("hides on the history screen, for the same reason", async () => {
        mockPathname("/brewHistory");
        const {toJSON} = await drawBar();

        expect(toJSON()).toBeNull();
    });

    it("shows itself everywhere else", async () => {
        mockPathname("/settings");
        const {toJSON} = await drawBar();

        expect(toJSON()).not.toBeNull();
    });
});
```

`mockPathname` and `drawBar` are the helpers the existing file already uses for `usePathname`; reuse them rather than adding new ones.

- [ ] **Step 2: Run them and see them fail**

```bash
npx jest components/__tests__/LiveBrewBar.test.tsx -t "where the bar shows"
```

Expected: FAIL — the bar renders on `/brewRecord` and `/brewHistory`.

- [ ] **Step 3: Implement**

In `components/LiveBrewBar.tsx`:

```tsx
/**
 * Where the bar has nothing to add.
 *
 * `brew` is the same brew at full size. The other two are the record it
 * becomes: the modal covers them, and before it was a modal the bar sat on top
 * of the export screen.
 */
const SILENT = new Set(["/brew", "/brewRecord", "/brewHistory"]);
```

```tsx
    if (run === null || SILENT.has(pathname)) return null;
```

In `app/_layout.tsx`, declare the screen inside the `<Stack>`, after `machine`:

```tsx
                                            {/* The brew screen is the mini bar
                                                expanded: it rises from the
                                                bottom and a chevron-down puts
                                                it back. Declared here rather
                                                than nowhere, which is what left
                                                it falling through to the
                                                default native bar with a
                                                `< index` back title. */}
                                            <Stack.Screen name="brew"
                                                          options={{
                                                              headerShown: false,
                                                              presentation: "modal",
                                                              animation: "slide_from_bottom"
                                                          }}/>
```

- [ ] **Step 4: Run them and see them pass**

```bash
npx jest components/__tests__/LiveBrewBar.test.tsx app/__tests__/brew.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run typecheck && npm run lint && npm test
git add app/_layout.tsx components/LiveBrewBar.tsx components/__tests__/LiveBrewBar.test.tsx
git commit -m "feat: the brew screen is the mini bar expanded

Declared in the navigator at last, as a modal from the bottom with its
own nav row. Modal presentation also stops the bar sitting on top of the
export screen.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 16: The bar itself

Padding on the close button, the chevron removed, the recipe's accent, and a dismissal that animates rather than vanishing.

**Files:**
- Modify: `components/BrewMiniBar.tsx`
- Test: `components/__tests__/BrewMiniBar.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `components/__tests__/BrewMiniBar.test.tsx`:

```tsx
describe("the bar's controls", () => {
    it("has no chevron, because the whole bar is the tap target", async () => {
        const {queryByTestId} = await drawBar({phase: {name: "pouring", pour: 1, pours: 4}});

        expect(queryByTestId("mini-chevron")).toBeNull();
    });

    it("gives the close button room to be pressed", async () => {
        const {getByLabelText} = await drawBar({phase: {name: "done"}});

        expect(getByLabelText("Dismiss").props.hitSlop).toEqual(
            {top: 12, bottom: 12, left: 12, right: 12}
        );
    });

    it("uses the recipe's accent while it is pouring", async () => {
        const {getByTestId} = await drawBar({
            phase: {name: "pouring", pour: 1, pours: 4}, accent: "#123456"
        });

        expect(getByTestId("trace-water").props.stroke).toBe("#123456");
    });
});
```

`drawBar` is the existing helper in that file.

- [ ] **Step 2: Run them and see them fail**

```bash
npx jest components/__tests__/BrewMiniBar.test.tsx -t "the bar's controls"
```

Expected: FAIL — the chevron is present and the close button has no `hitSlop`.

- [ ] **Step 3: Implement**

In `components/BrewMiniBar.tsx`:

Delete this line and the now-unused parts of the `DotIcon` usage for it:

```tsx
                <DotIcon name="chevron-right" size={14} color={palette.dim} />
```

The comment for the deletion belongs on the `Pressable` that wraps the whole bar:

```tsx
            {/* The whole bar is the tap target, which is why there is no
                chevron: two affordances nine points apart compete, and the
                chevron did nothing the bar did not already do. */}
```

Give the dismiss control room:

```tsx
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss"
                    hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}
                    onPress={onDismiss}
                >
                    <DotIcon name="close" size={14} color={palette.dim} />
                </Pressable>
```

The trace already takes `line` as its accent, and `line` is `props.accent` in the pouring and grinding branches of `say()`, so the third test passes once `accent` is threaded through the test helper. Confirm the `pouring` branch reads `props.accent` and not a palette constant; if it does not, change it to `props.accent`.

Animate the dismissal. Wrap the returned `XStack` in a Reanimated view with an exiting animation, using the app's own timing rather than a library default:

```tsx
import Animated, {FadeIn, SlideOutDown} from "react-native-reanimated";
import {DURATION} from "@/constants/motion";
```

```tsx
        <Animated.View
            entering={FadeIn.duration(DURATION.base)}
            exiting={SlideOutDown.duration(DURATION.base)}
        >
            {/* the existing XStack, unchanged */}
        </Animated.View>
```

Dismissal only reads as motion if the element is still mounted while it plays, so `LiveBrewBar` must keep rendering it for one animation. Reanimated's `exiting` handles that itself as long as the removal happens through React unmounting the `Animated.View`, which it does: `run` becomes null and `LiveBrewBar` returns null.

- [ ] **Step 4: Run them and see them pass**

```bash
npx jest components/__tests__/BrewMiniBar.test.tsx
```

Expected: PASS, whole file.

- [ ] **Step 5: Commit**

```bash
npm run typecheck && npm run lint && npm test
git add components/BrewMiniBar.tsx components/__tests__/BrewMiniBar.test.tsx
git commit -m "feat: the mini bar's controls stop competing

The chevron did nothing the bar did not already do and sat nine points
from the control that does something else. Close gets room to be pressed,
and dismissal slides out rather than vanishing.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 17: Stalls, kept

Each stage records its stalls on the brew record, so history and export keep the full detail regardless of how any screen chooses to draw it.

**Files:**
- Modify: `library/brew/BrewRecord.ts`
- Modify: `library/brew/BrewRecorder.ts`
- Modify: `library/BrewDatabase.ts`
- Test: `library/brew/__tests__/BrewRecord.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `library/brew/__tests__/BrewRecord.test.ts`:

```ts
import {stallsFromSamples} from "@/library/brew/BrewRecord";

describe("stallsFromSamples", () => {
    it("keeps one list per stage, index-aligned with the pours", () => {
        const samples = [
            {at: 0, water: 0, cup: 0, pour: 1},
            {at: 2000, water: 20, cup: 16, pour: 1},
            {at: 12000, water: 20, cup: 18, pour: 1},
            {at: 13000, water: 40, cup: 34, pour: 1},
            {at: 14000, water: 40, cup: 36, pour: 2},
            {at: 18000, water: 80, cup: 70, pour: 2}
        ];

        expect(stallsFromSamples(samples, [40, 40])).toEqual([
            [{atMl: 20, seconds: 11}],
            []
        ]);
    });

    it("is an empty list per stage when nothing stalled", () => {
        expect(stallsFromSamples([], [40, 40])).toEqual([[], []]);
    });
});
```

- [ ] **Step 2: Run it and see it fail**

```bash
npx jest library/brew/__tests__/BrewRecord.test.ts -t "stallsFromSamples"
```

Expected: FAIL — `stallsFromSamples` is not exported.

- [ ] **Step 3: Implement**

In `library/brew/BrewRecord.ts`:

```ts
import {stallsInStage, type Stall} from "./stalls";
```

Add the field to `BrewRecord`, after `heldSeconds`:

```ts
    /**
     * Where each stage stopped pouring, one list per stage, index-aligned with
     * the recipe's pours.
     *
     * Kept on the record rather than recomputed from the samples on read: the
     * definition of a stall may be tuned, and a brew from last month should go
     * on saying what it said at the time. Absent on rows written before it
     * existed.
     */
    stalls?: Stall[][];
```

and the derivation:

```ts
/**
 * Every stage's stalls, from the stream.
 *
 * @param targets each stage's planned volume, index-aligned with the pours
 */
export function stallsFromSamples(samples: BrewSample[], targets: number[]): Stall[][] {
    return targets.map((target, i) => stallsInStage(samples, i + 1, target));
}
```

In `library/brew/BrewRecorder.ts`, at the point where the record is built and `summarise` is called, add:

```ts
            stalls: stallsFromSamples(
                this.samples,
                this.recipe.pours.map((pour) => Math.max(pour.volume, 0))
            ),
```

importing `stallsFromSamples` from `./BrewRecord`.

`library/BrewDatabase.ts` names its columns, so the record needs one more. Follow the `pouringAt` precedent exactly.

In `createTable`'s `CREATE TABLE IF NOT EXISTS brews`, after `heldSeconds INTEGER NOT NULL,`:

```sql
                stalls TEXT NOT NULL DEFAULT '[]',
```

and beneath the existing `pouringAt` migration, a second one in the same shape:

```ts
        // Rows written before `stalls` existed get an empty list, which reads
        // as "nothing recorded" rather than "nothing happened" -- a brew from
        // before this column simply draws no amber.
        try {
            this.db.execSync("ALTER TABLE brews ADD COLUMN stalls TEXT NOT NULL DEFAULT '[]';");
        } catch {
            // Already there.
        }
```

Add it to `BrewRow`:

```ts
    /** JSON, one list of stalls per stage. `[]` on rows written before it. */
    stalls: string | null;
```

In `insert`, add `stalls` to the column list and to the `VALUES` placeholders, and to the parameter array after `record.heldSeconds`:

```ts
                    JSON.stringify(record.stalls ?? []),
```

Wherever a `BrewRow` is turned back into a `BrewRecord` (the `SELECT` mappers), parse it, tolerating a bad blob rather than throwing history away:

```ts
function stallsOf(row: BrewRow): Stall[][] {
    if (row.stalls === null) return [];
    try {
        return JSON.parse(row.stalls) as Stall[][];
    } catch {
        return [];
    }
}
```

and include `stalls: stallsOf(row)` in each mapped record.

- [ ] **Step 4: Run it and see it pass**

```bash
npx jest library/brew/__tests__/BrewRecord.test.ts library/brew/__tests__/BrewRecorder.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run typecheck && npm run lint && npm test
npx expo-doctor
git add library/brew/BrewRecord.ts library/brew/BrewRecorder.ts library/BrewDatabase.ts library/brew/__tests__/BrewRecord.test.ts
git commit -m "feat: a brew keeps where it stalled

One list per stage on the record, so history and export keep the detail
regardless of how a screen chooses to draw it.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

`npx expo-doctor` must report 21/21. It is a hard CI failure.

---

## Finishing

- [ ] **Tick issue #87's checklist** for every item this plan lands, and leave the ones it does not — the BREW pill on the recipe card, the wordmark hue, the connection dot, the empty machine popover — explicitly untouched with a comment saying which are separate design conversations and which is a bug awaiting its own fix.

- [ ] **Device test.** NFC is not involved, but none of this can be judged in a simulator. Build to the device and brew a real recipe with a real card:

```bash
rm -rf ios && npx expo prebuild --platform ios --clean
xcodebuild -workspace ios/XBRW.xcworkspace -scheme XBRW \
  -configuration Debug -destination "id=<UDID>" -allowProvisioningUpdates
```

`ios/` is generated and gitignored; a stale one is what caused the missing native module and the `ExpoModulesCore` podspec mismatch. `devicectl` ids are not Xcode UDIDs.

What to watch for, in order: the screen fills the device on a four-stage recipe; the counter advances 1/4 → 2/4 → 3/4 → 4/4; the second rung animates; a planned rest hatches rather than turning amber; a real stall inserts a band and the lane grows; a refusal prints once; a second attempt after refilling the tank is not refused as busy; the chevron dismisses and the bar drops.

---

## Out of scope, deliberately

- The BREW shortcut on the recipe card. The strongest complaint of the device test and its own design conversation, including the inset right-hand tab variant.
- The home header wordmark hue on collapse and expand.
- The connection dot: dot-matrix glyph and palette colours.
- The machine popover rendering empty. A bug, not a design question: it is mounted inside `HomeHeader`'s animated fixed-height icon row, so the Tamagui `Sheet` is clipped by its parent. Its fix is a `modal` prop on `XbrwSheet` or a move up the tree, and it belongs in its own small change.
- Issue #86, the brew record not snapshotting its plan.
- The true shared-element morph between the bar and the screen. The rise-and-drop pairing reads almost the same for a fraction of the cost, and the morph remains available later without structural change.

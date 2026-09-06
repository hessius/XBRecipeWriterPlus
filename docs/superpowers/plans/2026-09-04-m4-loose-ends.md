# M4 Loose Ends Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear the four M4 defects that can be fixed without hardware, so the next device session tests the app rather than rediscovering known bugs.

**Architecture:** Four independent changes. Two are small and local — the grinder's flicker takes its pace from the recipe's RPM, and the machine stops telling the user to press ▶ on a machine it has already committed. Two are one change wearing two issue numbers: a brew record keeps its own plan (#86) and its own per-stage delivered water (#89), because both are the same fault — the record screen reads a live recipe to describe an event that is over. Everything durable follows the pattern the `stalls` column already set: computed once at record time, stored, and never recomputed on read.

**Tech Stack:** TypeScript, React Native (Expo SDK 57), expo-sqlite, Jest with jest-expo, `@testing-library/react-native`.

---

## Conventions for every task

Read these once. They are not repeated per task.

- **Repo:** `/Users/jesperhessius/Dev/XBRecipeWriterPlus`, branch `m4-watch-it-brew`. Work directly in it. No worktree, no new branch.
- **Import alias:** `@/` maps to the repo root. `import Pour from "@/library/Pour"`.
- **Gate before every commit:**
  ```bash
  npm run typecheck && npm run lint && npm test
  ```
  Typecheck and lint must be clean. Lint has **6 pre-existing warnings** and 0 errors; that is the baseline, not a regression. Every task in this plan must leave the tree fully green — none of them is expected to end red.
- **TDD, strictly.** Write the failing test, run it, watch it fail *for the reason you expect*, then implement. A test that passes before the implementation is a broken test, not a head start — stop and report.
- **Never delete or skip a test.** If an existing test goes red, that is information: work out what it is telling you before changing anything. Say which existing tests you touched and how, and "none" if none.
- **No compatibility shims.** If removing something strands a caller, fix the caller. Do not add an untyped cast so old code keeps working — that hides the one signal the type checker gives you. This has already had to be reverted once on this branch.
- **Colour comes from `constants/colors.ts`.** No hex literals, no named CSS colours, in `app/` or `components/` — including tests.
- **The React Compiler is on.** Do not hand-write `useMemo`/`useCallback`.
- **Comments explain why, not what.** The codebase's style is to record the reasoning that is not recoverable from the code — a fact learned from hardware, a trap someone already fell into. Do not narrate the code.
- **No em dashes in user-facing copy.** Use `--` in comments.
- **Flaky test:** if `app/__tests__/brewHistory.test.tsx` fails, re-run once. It was a load-sensitive flake, fixed on this branch. It is not yours.
- Commit only the files your task names, with the message the task gives.
- **Do not push.**

---

## Task 1: The grinder flickers at the speed of the burr

Issue #87: "The grinding flicker is too slow on hardware."

Today the flicker is a constant 420 ms half-period, so a full on-off cycle takes 840 ms — about 1.2 Hz, which on hardware reads as a slow pulse rather than as grinding. The recipe already carries `grindRPM` (60–120, step 10, default 120), so the flicker can beat with the burr instead of being a number someone picked.

Three beats per revolution: at 120 rpm the burr turns twice a second, so 6 beats a second; at 60 rpm, 3. Every value is faster than today's, which is the complaint, and a coarse slow grind visibly lopes where a fast one buzzes.

**Files:**
- Modify: `constants/motion.ts`
- Create: `library/brew/grindFlicker.ts`
- Test: `library/brew/__tests__/grindFlicker.test.ts`

- [ ] **Step 1: Write the failing test**

Create `library/brew/__tests__/grindFlicker.test.ts`:

```ts
import {flickerMsFor, FLICKER_BEATS_PER_TURN} from "@/library/brew/grindFlicker";

describe("the grinder's flicker", () => {
    it("beats three times per turn of the burr", () => {
        // 120 rpm is two turns a second, so a turn is 500 ms and a beat is a
        // third of that. The function returns *half* a beat -- the square
        // wave's on time -- so a whole beat is two of them. The exported
        // constant is the one under test, not a number restated here, or this
        // asserts its own arithmetic.
        expect(flickerMsFor(120) * 2).toBeCloseTo(500 / FLICKER_BEATS_PER_TURN, 5);
    });

    it("lopes at the slowest grind and buzzes at the fastest", () => {
        expect(flickerMsFor(60)).toBeGreaterThan(flickerMsFor(120));
    });

    it("is faster than the fixed period it replaces, at every speed", () => {
        // The whole point: 420 was judged too slow on hardware, so no setting
        // of the grinder may land back on or above it.
        for (let rpm = 60; rpm <= 120; rpm += 10) {
            expect(flickerMsFor(rpm)).toBeLessThan(420);
        }
    });

    it("falls back to the fastest burr for a speed that cannot be one", () => {
        // `Pour` and `Recipe` both use -1 as "never set", and a recipe read
        // off a damaged card can carry anything. A zero or negative period
        // would divide by zero in the square wave and freeze the flicker.
        for (const rpm of [0, -1, NaN]) {
            expect(flickerMsFor(rpm)).toBe(flickerMsFor(120));
        }
    });

    it("does not run away on a speed above the grinder's range", () => {
        // Clamped rather than trusted: the card's byte is not validated on
        // every path, and a 4 ms strobe is a photosensitivity problem, not a
        // fast grind.
        expect(flickerMsFor(9000)).toBe(flickerMsFor(120));
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest library/brew/__tests__/grindFlicker.test.ts
```

Expected: FAIL, `Cannot find module '@/library/brew/grindFlicker'`.

- [ ] **Step 3: Write the implementation**

Create `library/brew/grindFlicker.ts`:

```ts
/**
 * The grinder's flicker, paced by the burr.
 *
 * It used to be a constant 420 ms, which on hardware read as a slow pulse
 * rather than as grinding -- a full on-off cycle took 840 ms. The recipe
 * already knows how fast the burr turns, so the flicker beats with it: the
 * animation says something true instead of being a number somebody picked.
 */

/** The grinder's range, as the editor's stepper offers it. */
const SLOWEST_RPM = 60;
const FASTEST_RPM = 120;

/**
 * Beats per turn of the burr.
 *
 * Three rather than one, because one beat per turn is 500 ms at the fastest
 * grind -- slower than the constant this replaces, which was the complaint.
 */
export const FLICKER_BEATS_PER_TURN = 3;

/**
 * Half a beat, in milliseconds: the square wave's on time, and its off time.
 *
 * Out of range falls back to the fastest burr rather than to the middle. An
 * unset speed is -1, a recipe read off a damaged card can carry anything, and
 * of the two ways to be wrong a flicker that is too quick is at least the one
 * that cannot divide by zero.
 */
export function flickerMsFor(rpm: number): number {
    const turns = Number.isFinite(rpm) && rpm >= SLOWEST_RPM && rpm <= FASTEST_RPM
        ? rpm : FASTEST_RPM;
    return 60_000 / turns / FLICKER_BEATS_PER_TURN / 2;
}
```

> Note the final `/ 2`. The caller's square wave is `Math.floor(elapsed / period) % 2`, so the period it wants is **half** a beat, not a whole one. Getting this wrong halves the rate and reintroduces the bug.

- [ ] **Step 4: Run it and watch it pass**

```bash
npx jest library/brew/__tests__/grindFlicker.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Retire the constant**

In `constants/motion.ts`, delete these two lines from the `ATTRACT` object:

```ts
    /** The grinder's flicker period. Fast and uneven-feeling, which is what grinding is. */
    brewFlicker: 420,
```

and change the block comment above `brewBreath` from "These three drive" to "These two drive".

Typecheck will now name `hooks/useTraceAnimation.ts`. That is Task 2, and it is the only file that may be named. If anything else appears, stop and report.

- [ ] **Step 6: Do not commit yet**

This task leaves typecheck red on purpose, and the plan's rule is that no task ends red. So Task 1 and Task 2 share a commit: go straight on to Task 2 and commit at the end of it. Nothing is committed here.

---

## Task 2: The flicker reads the recipe

`traceAnimationFor` is a pure function of `(phase, elapsedMs, animate)`, which is why the whole of this milestone's motion is testable without a frame clock. Keep that: the RPM becomes a fourth argument, not a lookup inside the function.

There is a sampling problem to solve at the same time. The hook ticks every 50 ms, and its comment says "50 ms is eight steps of the grinder's flicker" — true of a 420 ms period. At 120 rpm the period becomes 83 ms, so 50 ms sampling would land fewer than two readings in each half-cycle and the square wave would alias into an irregular stutter. Grinding is meant to look uneven, but from the grinder, not from the sampler. So the grinding phase ticks faster than the other two.

**Files:**
- Modify: `hooks/useTraceAnimation.ts`
- Modify: `app/brew.tsx:93`
- Test: `hooks/__tests__/useTraceAnimation.test.ts`

- [ ] **Step 1: Read what is there**

```bash
sed -n '1,120p' hooks/useTraceAnimation.ts
sed -n '1,40p' hooks/__tests__/useTraceAnimation.test.ts
```

`traceAnimationFor(phase, elapsedMs, animate)` is exported and directly tested; `useTraceAnimation(phase)` wraps it with a `setInterval`. `app/brew.tsx:93` is the only production caller: `const motion = useTraceAnimation(phase.name);`.

- [ ] **Step 2: Write the failing tests**

Append inside the existing top-level `describe` in `hooks/__tests__/useTraceAnimation.test.ts`:

```ts
    it("flickers faster for a faster burr", () => {
        // Same instant, two grinders. At 120 rpm the half-period is 83 ms, so
        // 100 ms is into the dark half; at 60 rpm it is 167 ms, so 100 ms is
        // still lit. One number, read two ways, which is the whole feature.
        const fast = traceAnimationFor("grinding", 100, true, 120);
        const slow = traceAnimationFor("grinding", 100, true, 60);
        expect(fast.warmth).not.toBe(slow.warmth);
    });

    it("still lights the first instant of the grind whatever the speed", () => {
        // A grind that began dark would read as the animation not having
        // started.
        for (const rpm of [60, 90, 120]) {
            expect(traceAnimationFor("grinding", 0, true, rpm).warmth).toBe(1);
        }
    });

    it("holds the grind lit when motion is off, at any speed", () => {
        // Reduced motion keeps each phase's end state rather than dropping it,
        // and the speed must not sneak the flicker back in.
        expect(traceAnimationFor("grinding", 100, false, 60))
            .toEqual(traceAnimationFor("grinding", 100, false, 120));
    });
```

Add `traceAnimationFor` to the file's import from `@/hooks/useTraceAnimation` if it is not already there.

- [ ] **Step 2b: Migrate the existing calls in that file**

The fourth argument is **required**, not defaulted. A default would let `app/brew.tsx` go un-updated and silently animate at 120 rpm for every recipe; a required argument makes the type checker name every caller. The cost is that this test file's existing calls must all be updated — there are **eleven** `traceAnimationFor(` calls and **four** `useTraceAnimation(` calls, at lines 19, 25, 26, 30, 31, 37, 44, 49, 50, 55, 61-63, 68 and 99, 105, 110, 119.

For every phase except `grinding` the speed is not read at all, so pass `120` and change nothing else. For example line 19 becomes:

```ts
        const at = (t: number) => traceAnimationFor("waking", t, true, 120);
```

and line 99 becomes:

```ts
        await renderHook(() => useTraceAnimation("pouring", 120));
```

One existing test needs more than a fourth argument. At lines 46-55:

```ts
    it("flickers rather than breathing while grinding", () => {
        // Intense, not pretty. Opacity is untouched; the colour is what moves.
        const a = traceAnimationFor("grinding", 0, true);
        const b = traceAnimationFor("grinding", 420, true);
        expect(a.opacity).toBe(b.opacity);
        expect(a.warmth).not.toBeCloseTo(b.warmth, 2);
        // Halfway through a beat is still the same beat. Pinned because the
        // rate is the design, and a faster flicker is a different animation.
        expect(traceAnimationFor("grinding", 210, true).warmth).toBeCloseTo(a.warmth, 5);
    });
```

`420` and `210` are the old period and half of it. Adding a fourth argument would leave them meaning nothing — at some speeds the assertions would still pass, by luck, which is worse than failing. Derive the instants from the period instead, so the test keeps measuring the shape of the wave rather than two stale numbers:

```ts
    it("flickers rather than breathing while grinding", () => {
        // Intense, not pretty. Opacity is untouched; the colour is what moves.
        // The instants come from the period rather than being written out, so
        // this measures the shape of the wave -- one half lit, one half not --
        // and not a rate that has already changed once.
        const half = flickerMsFor(120);
        const a = traceAnimationFor("grinding", 0, true, 120);
        const b = traceAnimationFor("grinding", half, true, 120);
        expect(a.opacity).toBe(b.opacity);
        expect(a.warmth).not.toBeCloseTo(b.warmth, 2);
        // Halfway through a beat is still the same beat.
        expect(traceAnimationFor("grinding", half / 2, true, 120).warmth)
            .toBeCloseTo(a.warmth, 5);
    });
```

That needs `import {flickerMsFor} from "@/library/brew/grindFlicker";` at the top of the test file.

> These fifteen edits are mechanical and the type checker will list every one. Do not add a default parameter to avoid them.

- [ ] **Step 3: Run them and watch them fail**

```bash
npx jest hooks/__tests__/useTraceAnimation.test.ts
```

Expected: FAIL. `"flickers faster for a faster burr"` fails on its assertion — a fourth argument that nothing reads cannot change the answer — and typecheck already names this file from Task 1.

The other two new tests pass before the implementation, and that is fine: they are guards on behaviour that must *not* change, not on behaviour being added. `"flickers faster for a faster burr"` is the one that has to go red.

- [ ] **Step 4: Thread the speed through**

In `hooks/useTraceAnimation.ts`:

Replace the `FLICKER_MS` constant and its comment:

```ts
/** The grinder's flicker. Fast and uneven-feeling, which is what grinding is. */
const FLICKER_MS = ATTRACT.brewFlicker;
```

with:

```ts
import {flickerMsFor} from "@/library/brew/grindFlicker";
```

placed with the other imports, and nothing left where the constant was.

Change the signature and the grinding branch:

```ts
export function traceAnimationFor(
    phase: string, elapsedMs: number, animate: boolean, grindRpm: number
): TraceAnimation {
```

```ts
    if (phase === "grinding") {
        // A square wave, not a sine: grinding is loud, and a smooth fade reads
        // as calm. Opacity is deliberately untouched.
        const on = Math.floor(elapsedMs / flickerMsFor(grindRpm)) % 2 === 0;
        return {opacity: 1, warmth: on ? 1 : 0.15, headAt: 1, dashed: true};
    }
```

Then the hook:

```ts
export function useTraceAnimation(phase: string, grindRpm: number): TraceAnimation {
```

and its last line:

```ts
    return traceAnimationFor(phase, elapsed, animate, grindRpm);
```

- [ ] **Step 5: Sample fast enough to draw it**

Still in `hooks/useTraceAnimation.ts`, replace the interval's comment and call:

```ts
        // 50 ms is eight steps of the grinder's flicker and sixty-eight of a
        // breath, which is smooth for an opacity ramp and a fraction of the
        // work of a per-frame driver for a line that is barely moving.
        const tick = setInterval(
            () => setTicked({phase, elapsed: Date.now() - start}), 50);
```

with:

```ts
        // The grind is sampled at frame rate; the other two phases are not.
        // Its half-period is 83 ms at the fastest burr, so the old 50 ms clock
        // would put fewer than two readings in each half of the square wave
        // and the flicker would alias into a stutter -- uneven, but from the
        // sampler rather than from the grinder. A breath and a send are slow
        // ramps and stay on the cheaper clock.
        //
        // The cost is bounded in a way `pouring`'s would not be: a grind is
        // about twenty seconds, which is why it is clocked at all and why
        // `pouring`, which is minutes, is deliberately not.
        const period = phase === "grinding" ? 16 : 50;
        const tick = setInterval(
            () => setTicked({phase, elapsed: Date.now() - start}), period);
```

and add `phase` to nothing — the effect's dependency array already lists it.

- [ ] **Step 6: Give it a recipe to read**

In `app/brew.tsx`, change line 93 from:

```tsx
    const motion = useTraceAnimation(phase.name);
```

to:

```tsx
    const motion = useTraceAnimation(phase.name, recipe.grindRPM);
```

`recipe` is already in scope there.

- [ ] **Step 7: Run everything**

```bash
npx jest hooks/__tests__/useTraceAnimation.test.ts library/brew/__tests__/grindFlicker.test.ts
npm run typecheck && npm run lint && npm test
```

Expected: all green. Report the test total.

- [ ] **Step 8: Commit both tasks**

```bash
git add constants/motion.ts library/brew/grindFlicker.ts \
        library/brew/__tests__/grindFlicker.test.ts \
        hooks/useTraceAnimation.ts hooks/__tests__/useTraceAnimation.test.ts \
        app/brew.tsx
git commit -m "feat: the grinder flickers at the speed of its burr

The flicker was a flat 420 ms half-period, so a full cycle took 840 ms and on
hardware it read as a slow pulse rather than as grinding.

The recipe already knows how fast the burr turns, so the flicker beats with
it: three beats a turn, which is 83 ms at 120 rpm and 167 ms at 60. Every
grinder setting is now faster than the constant it replaces, which was the
complaint, and a coarse slow grind lopes where a fast one buzzes.

The grinding phase also samples four times faster than the other two. At 83 ms
the old 50 ms clock put fewer than two readings in each half of the square
wave, and the flicker would have aliased into a stutter -- uneven, but from
the sampler rather than from the grinder. A breath and a send are slow ramps
and stay on the cheaper clock.

Refs #87"
```

---

## Task 3: The app stops telling you to do what it has already done

Issue #87: `PRESS ▶ ON THE MACHINE` appears after START BREWING was pressed **in the app**.

`Machine.onState` sets the `pressPlay` phase whenever the machine reports `AWAITING_CONFIRM` (`0x1E`), unconditionally. But `docs/machine-integration/ble-protocol.md:234` records, from hardware:

> commit (`8002`) **auto-proceeds**. The machine went from commit straight to grinding, in both EASY and PRO, without ever passing through `0x1E`.

So on this unit `0x1E` is a waypoint the machine passes through on its way to grinding, not a request for a human. The machine's state means "waiting to be started" and says nothing about *who* starts it. Only the app knows that — and it does know, because it either sent the commit frame or is still holding it.

The `ARMED`/`LOADING` branch immediately above already guards on exactly this (`if (this.pendingCommit !== null) break;`). `AWAITING_CONFIRM` never got the same treatment.

`pendingCommit` alone is not enough, because `startBrew()` clears it *before* sending. A brew that has been committed and one that was never uploaded both have `pendingCommit === null`.

**Files:**
- Modify: `library/machine/Machine.ts`
- Test: `library/machine/__tests__/Machine.test.ts`

- [ ] **Step 1: Read the three places involved**

```bash
grep -n "pendingCommit" library/machine/Machine.ts
sed -n '845,875p' library/machine/Machine.ts
sed -n '693,800p' library/machine/Machine.ts
```

You should find `pendingCommit` at exactly six lines: declared at 212; cleared at 712 (top of `brewOnce`); set at 758 (`brewOnce`, when auto-start is off); read at 776 and cleared at 778 (`startBrew`); cleared at 590 when a brew ends; and guarded at 854 in the `ARMED`/`LOADING` branch of `onState`.

The recipe is sent by the private `brewOnce`, which the public `brew` wraps. The two paths that commit are:
1. `brewOnce` with `autoStart` on — the commit frame rides in the paced burst.
2. `startBrew` — sends the commit `brewOnce` held back.

- [ ] **Step 2: Fix the test that enshrines the bug, and write the failing ones**

`Machine.test.ts` has helpers at the top of the file: `readyMachine()` returns `{transport, machine}` already connected and past the info frame; `brewable(volumes?)` builds a two-pour recipe; `brewFrames(transport)` lists the command codes written; `status(state)` from `./protocolFixtures` builds a state frame, delivered with `transport.emit(...)`.

**First**, line 542 holds `"asks for the button rather than sending 40518"`. It calls `machine.brew(brewable())` with auto-start left at its default — **on** — and then asserts `pressPlay`. That test is the #87 bug, written down. Its 40518 assertion is still worth keeping, so move it onto the path the prompt actually exists for rather than deleting it. Replace the whole test with:

```ts
    it("asks for the button rather than sending 40518", async () => {
        // The single most dangerous unknown in the protocol: one source watched
        // 40518 move the state backwards, another verified it aborts a running
        // brew, a third calls it PAUSE. The fallback costs the user one press
        // of a button they are standing in front of.
        //
        // Auto-start off is the path this prompt exists for: the recipe is on
        // the machine and the only thing that can start it is a person.
        const {transport, machine} = await readyMachine();
        machine.setAutoStart(false);
        await machine.brew(brewable());
        transport.written = [];

        transport.emit(status(0x1E)); // awaiting_confirm

        expect(machine.phase.name).toBe("pressPlay");
        expect(brewFrames(transport)).not.toContain(40518);
    });
```

**Then** add two new tests directly beneath it:

```ts
    it("does not ask for the machine's button once the app has committed", async () => {
        // 0x1E is a waypoint on this firmware, not a request for a human:
        // commit auto-proceeds straight to grinding, and hardware notes record
        // it usually being skipped altogether. Telling the user to press a
        // button they have already pressed is how it read on the device.
        const {transport, machine} = await readyMachine();
        await machine.brew(brewable()); // auto-start on by default
        const before = machine.phase.name;

        transport.emit(status(0x1E));

        expect(machine.phase.name).toBe(before);
        expect(machine.phase.name).not.toBe("pressPlay");
    });

    it("goes on to grinding from the waypoint", async () => {
        // Swallowing 0x1E must not swallow what follows it, or a brew started
        // in the app would sit in `sending` for ever.
        const {transport, machine} = await readyMachine();
        await machine.brew(brewable());

        transport.emit(status(0x1E));
        transport.emit(status(0x22)); // the state the file's other tests use
                                      // to reach grinding

        expect(machine.phase.name).toBe("grinding");
    });

    it("asks again for a brew held back after one that was committed", async () => {
        // `committed` is per-brew state. If it survived into the next upload,
        // the prompt would be suppressed for a brew nobody had started.
        //
        // The brew is ended with `cancelBrew`, which is how the rest of this
        // file ends one. A state frame will not do it: `onState` returns early
        // unless a brew is running, and the idle state 0x01 falls through its
        // switch, so emitting it changes nothing at all.
        const {transport, machine} = await readyMachine();
        await machine.brew(brewable());
        await machine.cancelBrew();

        machine.setAutoStart(false);
        await machine.brew(brewable());
        transport.emit(status(0x1E));

        expect(machine.phase.name).toBe("pressPlay");
    });
```

> The fourth test is the one that catches a `committed` flag that is set but never cleared. It passes before you touch `Machine.ts`, because today the prompt is unconditional — it is a guard against the fix over-reaching, not a driver of it. If it *fails* at any point, the flag is leaking between brews.

- [ ] **Step 3: Run them and watch them fail**

```bash
npx jest library/machine/__tests__/Machine.test.ts
```

Expected: `"does not ask for the machine's button once the app has committed"` and `"goes on to grinding from the waypoint"` FAIL, because `pressPlay` overwrites the phase unconditionally. The rewritten 40518 test and the fourth test PASS already, and must go on passing.

If the rewritten 40518 test fails, `setAutoStart(false)` is not doing what you think — read `brewOnce` around line 754 before changing anything.

- [ ] **Step 4: Remember whether we committed**

In `library/machine/Machine.ts`, beside the `pendingCommit` field, add:

```ts
    /**
     * Whether this brew's commit frame has gone out.
     *
     * Not derivable from `pendingCommit`, which `startBrew` clears before it
     * sends: a brew that has just been committed and one that was never
     * uploaded both hold null. The difference is the whole question `0x1E`
     * asks -- the machine says "waiting to be started" and cannot say by whom.
     */
    private committed: boolean = false;
```

Set it in the three places:

In `brewOnce`, beside the existing `this.pendingCommit = null;` at line 712:

```ts
        this.committed = false;
```

In `brewOnce`, immediately after the `await this.sendPaced([...])` burst succeeds — that is, on the line after `this.lastHandshakeAt = Date.now();`, still inside the `try`:

```ts
            // The burst carried the commit when auto-start is on, so from here
            // the machine is starting itself and needs nothing from the user.
            this.committed = this.autoStart;
```

In `startBrew`, immediately after `await this.send(commit);` returns — inside the `try`, after the send:

```ts
            this.committed = true;
```

And where a brew ends, at line 590, replace the one-liner:

```ts
        if (!this.brewing) this.pendingCommit = null;
```

with:

```ts
        if (!this.brewing) {
            this.pendingCommit = null;
            this.committed = false;
        }
```

- [ ] **Step 5: Guard the waypoint**

In `onState`, replace:

```ts
            case MACHINE_STATE.AWAITING_CONFIRM:
                // The machine is waiting for a human. We do not send 40518:
                // one source watched it move the state backwards, another
                // verified it aborts a running brew, a third calls it PAUSE.
                this.setPhase({name: "pressPlay"});
                break;
```

with:

```ts
            case MACHINE_STATE.AWAITING_CONFIRM:
                // "Waiting to be started" -- the machine cannot say by whom,
                // and only we know. Once our commit has gone out this is a
                // waypoint on the way to grinding, and hardware confirms the
                // firmware usually skips it entirely; telling the user to
                // press a button they just pressed in the app is how it read
                // on the device.
                //
                // Uncommitted, it is the state the prompt exists for. We still
                // do not send 40518 to escape it: one source watched it move
                // the state backwards, another verified it aborts a running
                // brew, a third calls it PAUSE.
                if (this.committed) break;
                this.setPhase({name: "pressPlay"});
                break;
```

- [ ] **Step 6: Run everything**

```bash
npx jest library/machine/__tests__/Machine.test.ts
npm run typecheck && npm run lint && npm test
```

Expected: all green. Report the total, and confirm no existing Machine test changed behaviour.

- [ ] **Step 7: Commit**

```bash
git add library/machine/Machine.ts library/machine/__tests__/Machine.test.ts
git commit -m "fix: do not ask for a button the app has already pressed

The machine reports 0x1E as 'waiting to be started'. It cannot say by whom,
and the app took it to mean a human at the device -- so pressing START BREWING
in the app produced PRESS the play button ON THE MACHINE, for the one instant
before grinding began.

Hardware notes record that commit auto-proceeds and that this firmware usually
skips 0x1E altogether, which makes it a waypoint rather than a request. The
prompt is still right for the path it was written for: uploaded with auto-start
off, where the only thing that can start the brew is a person.

pendingCommit could not answer this. startBrew clears it before sending, so a
brew just committed and one never uploaded both hold null, which is exactly
the distinction 0x1E turns on.

We still do not send 40518 to escape the state. Nothing about that has changed.

Refs #87"
```

---

## Task 4: A record can describe its own brew

Closes #86 and #89 together, because they are one fault: the record screen reads a **live recipe** to describe an event that is over. #86 is what happens when that recipe is gone (no ladder, or somebody else's); #89 is what it says while the recipe is still there (every stage brimming, however early the brew died).

This task adds the two facts to the record type and derives them from the sample stream. Task 5 stores them, Task 6 writes them, Task 7 draws them.

The stream already carries what is needed: each sample has a 1-based `pour` and a cumulative `water`. `stageOriginMl(samples, stage)` in `library/brew/stalls.ts` already returns the cumulative reading at which a stage began, and is already exported.

**Files:**
- Modify: `library/brew/BrewRecord.ts`
- Test: `library/brew/__tests__/BrewRecord.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `library/brew/__tests__/BrewRecord.test.ts`:

```ts
describe("a stage's delivered water", () => {
    // `water` is cumulative across the whole brew, so a stage's own delivery
    // is the difference across it -- not the reading at its end.
    const stream: BrewSample[] = [
        {at: 0,     water: 0,   cup: 0,   pour: 1},
        {at: 5_000, water: 40,  cup: 38,  pour: 1},
        {at: 9_000, water: 40,  cup: 39,  pour: 2},
        {at: 15_000, water: 120, cup: 116, pour: 2}
    ];

    it("measures each stage from where it began", () => {
        expect(stageWaterFromSamples(stream, 2)).toEqual([40, 80]);
    });

    it("gives nothing to a stage that never ran", () => {
        // The failure case this exists for: a brew that died in stage 2 of 4
        // must not claim stages 3 and 4 poured.
        expect(stageWaterFromSamples(stream, 4)).toEqual([40, 80, 0, 0]);
    });

    it("is all zeroes for a brew that never poured", () => {
        expect(stageWaterFromSamples([], 3)).toEqual([0, 0, 0]);
    });

    it("never reports a negative delivery", () => {
        // The firmware auto-tares during the bloom (see #90), so water can
        // fall. A negative bar would draw backwards.
        const tared: BrewSample[] = [
            {at: 0,     water: 30, cup: 0, pour: 1},
            {at: 2_000, water: 0,  cup: 0, pour: 1}
        ];
        expect(stageWaterFromSamples(tared, 1)).toEqual([0]);
    });
});

describe("a plan, snapshotted", () => {
    it("survives a round trip through JSON", () => {
        // The point of the snapshot: a record must still draw its ladder when
        // the recipe it came from has been edited or deleted.
        const pours = [new Pour(1, 40, 93, 40, 1, 2, 20), new Pour(2, 160, 92, 40, 0, 0, 0)];

        const back = poursFromPlan(JSON.parse(JSON.stringify(planFromPours(pours))));

        expect(back).toHaveLength(2);
        expect(back[0].volume).toBe(40);
        expect(back[0].temperature).toBe(93);
        expect(back[0].pourPattern).toBe(2);
        expect(back[0].pauseTime).toBe(20);
        // Rehydrated as real Pours, because the ladder calls these.
        expect(back[0].getAgitationBefore()).toBe(true);
        expect(back[0].getAgitationAfter()).toBe(false);
        expect(back[1].getAgitationBefore()).toBe(false);
    });

    it("reads a plan that is not one as no plan at all", () => {
        // A column can hold anything a previous version wrote, and a half-read
        // plan drawn as a ladder would be a lie with a shape.
        expect(poursFromPlan(undefined)).toEqual([]);
        expect(poursFromPlan([{volume: "forty"} as unknown as PlanStage])).toEqual([]);
    });
});
```

Add to that file's imports whatever it does not already have:

```ts
import Pour from "@/library/Pour";
import {planFromPours, poursFromPlan, stageWaterFromSamples,
        type PlanStage} from "@/library/brew/BrewRecord";
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest library/brew/__tests__/BrewRecord.test.ts
```

Expected: FAIL, the three new names are not exported.

- [ ] **Step 3: Implement**

In `library/brew/BrewRecord.ts`, add to the imports:

```ts
import Pour from "@/library/Pour";

import {stageOriginMl, stallsInStage, type Stall} from "./stalls";
```

(the existing import of `stallsInStage` and `Stall` is from `./stalls`; add `stageOriginMl` to it rather than writing a second import.)

Add the plan type and the two functions, and the two new record fields.

```ts
/**
 * One stage of the plan a brew was started from.
 *
 * A structural copy of `Pour`'s fields rather than the object, because this
 * goes through JSON into a database column and comes back without methods.
 */
export type PlanStage = {
    pourNumber: number;
    volume: number;
    temperature: number;
    flowRate: number;
    agitation: number;
    pourPattern: number;
    pauseTime: number;
};

/** The plan as it stood when the brew began. */
export function planFromPours(pours: Pour[]): PlanStage[] {
    return pours.map((pour) => ({
        pourNumber: pour.pourNumber,
        volume: pour.volume,
        temperature: pour.temperature,
        flowRate: pour.flowRate,
        agitation: pour.agitation,
        pourPattern: pour.pourPattern,
        pauseTime: pour.pauseTime
    }));
}

/**
 * Back into `Pour`s, because the ladder calls `getAgitationBefore` and friends.
 *
 * Anything that is not a plan reads as no plan, which falls back to the live
 * recipe. A half-understood plan drawn as a ladder would be a lie with a
 * shape, and this column can hold whatever an older version wrote.
 */
export function poursFromPlan(plan: PlanStage[] | undefined): Pour[] {
    if (!Array.isArray(plan)) return [];
    const numeric = (value: unknown): value is number =>
        typeof value === "number" && Number.isFinite(value);
    if (!plan.every((stage) => stage !== null && typeof stage === "object"
        && numeric(stage.volume) && numeric(stage.temperature)
        && numeric(stage.agitation) && numeric(stage.pourPattern))) {
        return [];
    }
    return plan.map((stage, index) => new Pour(
        numeric(stage.pourNumber) ? stage.pourNumber : index + 1,
        stage.volume, stage.temperature,
        numeric(stage.flowRate) ? stage.flowRate : 0,
        stage.agitation, stage.pourPattern,
        numeric(stage.pauseTime) ? stage.pauseTime : 0
    ));
}

/**
 * What each stage actually delivered, from the stream.
 *
 * `water` is cumulative across the brew, so a stage's own delivery is the
 * difference across it. A stage that never ran contributes 0 rather than the
 * running total, which is the whole point: a brew that died in stage 2 of 4
 * used to draw stages 3 and 4 full to the brim.
 *
 * Clamped at 0 because the firmware auto-tares during the bloom (#90) and a
 * negative bar would draw backwards.
 */
export function stageWaterFromSamples(samples: BrewSample[], stages: number): number[] {
    return Array.from({length: stages}, (_unused, index) => {
        const stage = index + 1;
        const mine = samples.filter((s) => s.pour === stage);
        const last = mine[mine.length - 1];
        if (last === undefined) return 0;
        return Math.max(0, last.water - stageOriginMl(samples, stage));
    });
}
```

And in the `BrewRecord` type, after `stalls?: Stall[][];`:

```ts
    /**
     * The plan this brew was started from.
     *
     * Copied for the same reason `recipeName` and `accent` are: a brew is a
     * record of an event, and editing or deleting the recipe afterwards must
     * not rewrite it. Absent on rows written before it existed, which fall
     * back to the live recipe as they always did.
     */
    plan?: PlanStage[];
    /**
     * What each stage actually delivered, index-aligned with `plan`.
     *
     * Stored rather than recomputed on read, like `stalls`: the stream is
     * subject to retention, and a record whose samples have been swept would
     * silently go back to drawing the plan as though it had all poured.
     */
    stageWater?: number[];
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest library/brew/__tests__/BrewRecord.test.ts
npm run typecheck && npm run lint
```

Expected: PASS, and both clean. The two new record fields are optional, so nothing that builds a `BrewRecord` breaks.

- [ ] **Step 5: Commit**

```bash
git add library/brew/BrewRecord.ts library/brew/__tests__/BrewRecord.test.ts
git commit -m "feat: a record can carry its own plan and what each stage poured

Two facts a brew record could not state about itself. The plan, so that a
record still has a ladder when the recipe it came from has been edited or
deleted. The per-stage delivered water, so that a brew which died in stage 2
of 4 stops claiming stages 3 and 4 poured.

Both derived from the stream, which already carries a 1-based stage on every
sample and a cumulative water reading -- a stage's own delivery is the
difference across it, which stageOriginMl already knew how to find.

Types and derivations only; nothing stores or draws them yet.

Refs #86, refs #89"
```

---

## Task 5: The database keeps them

Two columns, added exactly the way `stalls` and `pouringAt` were: `ALTER TABLE` in a `try`/`catch`, because `IF NOT EXISTS` on `ADD COLUMN` is not portable across the SQLite versions Expo ships.

**Files:**
- Modify: `library/BrewDatabase.ts`
- Test: `library/__tests__/BrewDatabase.test.ts`

- [ ] **Step 1: Read the existing shape**

```bash
sed -n '1,120p' library/BrewDatabase.ts
sed -n '185,220p' library/BrewDatabase.ts
```

Note two things before you touch the test file:

- The `expo-sqlite` mock in `library/__tests__/BrewDatabase.test.ts` parses the column list out of the INSERT with a regex and maps params positionally. **It needs no changes** for extra columns, as long as your column list stays a single flat `(...)` group and your params stay in the same order. Do not "fix" the mock.
- `hydrate` omits `stalls` entirely when empty (`...(stalls.length > 0 ? {stalls} : {})`). Follow that: an absent plan must be absent, not `[]`, because the record screen's fallback tests for `undefined`.

- [ ] **Step 2: Write the failing tests**

Append to `library/__tests__/BrewDatabase.test.ts`:

```ts
describe("the plan and the delivered water", () => {
    it("gives them back as they went in", () => {
        const db = new BrewDatabase();
        const plan = [
            {pourNumber: 1, volume: 40, temperature: 93, flowRate: 40,
             agitation: 1, pourPattern: 0, pauseTime: 20}
        ];

        db.insert(record({plan, stageWater: [38]}), stream);

        const [back] = db.all();
        expect(back.plan).toEqual(plan);
        expect(back.stageWater).toEqual([38]);
    });

    it("leaves both absent on a row that never had them", () => {
        // Rows written before these columns fall back to the live recipe, which
        // is what they did before. Absent, not empty: the screen tests for
        // undefined to decide whether it has a snapshot at all.
        const db = new BrewDatabase();

        db.insert(record(), stream);

        const [back] = db.all();
        expect(back.plan).toBeUndefined();
        expect(back.stageWater).toBeUndefined();
    });
});
```

If `db.all()` is not the reader's real name, use whatever the file's existing tests call — check first.

- [ ] **Step 3: Run them and watch them fail**

```bash
npx jest library/__tests__/BrewDatabase.test.ts
```

Expected: the first fails (`back.plan` is undefined); the second passes and must go on passing.

- [ ] **Step 4: Add the columns**

In `library/BrewDatabase.ts`:

Add to the `BrewRow` type, after `stalls`:

```ts
    /** JSON, the plan as it stood. `[]` on rows written before it. */
    plan: string | null;
    /** JSON, one delivered volume per stage. `[]` on rows written before it. */
    stageWater: string | null;
```

Add to the `CREATE TABLE` body, after the `stalls` line:

```sql
                plan TEXT NOT NULL DEFAULT '[]',
                stageWater TEXT NOT NULL DEFAULT '[]',
```

Add two more migrations after the `stalls` one, in the same shape:

```ts
        // Rows written before these two fall back to the live recipe, exactly
        // as every row did until now.
        try {
            this.db.execSync("ALTER TABLE brews ADD COLUMN plan TEXT NOT NULL DEFAULT '[]';");
        } catch {
            // Already there.
        }
        try {
            this.db.execSync(
                "ALTER TABLE brews ADD COLUMN stageWater TEXT NOT NULL DEFAULT '[]';");
        } catch {
            // Already there.
        }
```

Extend the INSERT's column list and its placeholders and params. The column list becomes:

```sql
                `INSERT INTO brews (id, recipeUuid, recipeName, accent, startedAt, pouringAt,
                                    endedAt, outcome, failure, pours, waterTotal, cupTotal,
                                    heldSeconds, stalls, plan, stageWater, hasStream)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`
```

and the params gain two entries, in that order, between the stalls entry and `hasStream`:

```ts
                    JSON.stringify(record.stalls ?? []),
                    JSON.stringify(record.plan ?? []),
                    JSON.stringify(record.stageWater ?? []),
                    samples.length > 0 ? 1 : 0
```

Count the placeholders. Seventeen columns, seventeen question marks.

- [ ] **Step 5: Read them back**

Replace the `stallsOf` helper with one that serves all three, and use it in `hydrate`:

```ts
function jsonOf<T>(value: string | null): T[] {
    if (value === null) return [];
    try {
        const parsed = JSON.parse(value) as T[];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}
```

In `hydrate`, replace `const stalls = stallsOf(row);` with:

```ts
    const stalls = jsonOf<Stall[]>(row.stalls);
    const plan = jsonOf<PlanStage>(row.plan);
    const stageWater = jsonOf<number>(row.stageWater);
```

and the spread line with:

```ts
        ...(stalls.length > 0 ? {stalls} : {}),
        ...(plan.length > 0 ? {plan} : {}),
        ...(stageWater.length > 0 ? {stageWater} : {}),
```

Import the type: add `PlanStage` to the existing `import type {BrewOutcome, BrewRecord, BrewSample} from "./brew/BrewRecord";`.

- [ ] **Step 6: Run everything**

```bash
npx jest library/__tests__/BrewDatabase.test.ts
npm run typecheck && npm run lint && npm test
```

Expected: all green. If any existing BrewDatabase test broke, your params and placeholders are out of step — count them again rather than editing the test.

- [ ] **Step 7: Commit**

```bash
git add library/BrewDatabase.ts library/__tests__/BrewDatabase.test.ts
git commit -m "feat: brews store their plan and their delivered water

Two columns, added the way pouringAt and stalls were: ALTER TABLE in a catch,
because IF NOT EXISTS on ADD COLUMN is not portable across the SQLite versions
Expo ships.

Absent rather than empty when a row predates them, because the record screen
tests for undefined to decide whether it has a snapshot to draw or should fall
back to the live recipe -- which is what every row did until now.

Refs #86, refs #89"
```

---

## Task 6: The recorder fills them in

The recorder already computes `stalls` from the stream at the moment the brew ends, for the reason its comment gives: the definition may be tuned, and a brew from last month should go on saying what it said at the time. The same argument, and the same place, for these two.

**Files:**
- Modify: `library/brew/BrewRecorder.ts`
- Test: `library/brew/__tests__/BrewRecorder.test.ts`

- [ ] **Step 1: Write the failing tests**

The file's `recipe()` helper builds a two-stage recipe: `new Pour(1, 40, 93, 40, 0, 0, 20)` and `new Pour(2, 160, 92, 40, 0, 0, 0)`. Its `build()` helper returns a recorder, a fake machine and the records it emitted. Use them.

Append inside the existing top-level `describe`:

```ts
    it("keeps the plan it was started from", () => {
        const {fake, records} = build();
        fake.phase({name: "pouring", pour: 1, pours: 2});
        fake.water(40);
        fake.phase({name: "done"});

        const [{record}] = records;
        expect(record.plan).toHaveLength(2);
        expect(record.plan?.[0].volume).toBe(40);
        expect(record.plan?.[1].volume).toBe(160);
        // A structural copy, not the Pour objects: this goes through JSON.
        expect(record.plan?.[0]).not.toBeInstanceOf(Pour);
    });

    it("keeps what each stage actually poured", () => {
        const {fake, records} = build();
        fake.phase({name: "pouring", pour: 1, pours: 2});
        fake.water(40);
        fake.phase({name: "pouring", pour: 2, pours: 2});
        fake.water(150);
        fake.phase({name: "done"});

        // Cumulative in the stream, per stage on the record.
        expect(records[0].record.stageWater).toEqual([40, 110]);
    });

    it("gives a stage that never ran nothing at all", () => {
        // The failure this is for: a brew that stopped in stage 1 of 2 must
        // not say stage 2 poured.
        const {fake, records} = build();
        fake.phase({name: "pouring", pour: 1, pours: 2});
        fake.water(25);
        fake.phase({name: "failed", reason: "noWater"});

        expect(records[0].record.stageWater).toEqual([25, 0]);
        // One entry per planned stage, so the ladder always has a full set.
        expect(records[0].record.stageWater).toHaveLength(2);
    });
```

Match the phase-driving idiom the file's existing tests use — if they call `fake.phase(...)` differently, or destructure `build()` under other names, follow them. Import `Pour` if the file does not already (it does).

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest library/brew/__tests__/BrewRecorder.test.ts
```

Expected: FAIL, `record.plan` and `record.stageWater` are undefined.

- [ ] **Step 3: Implement**

In `library/brew/BrewRecorder.ts`, extend the import:

```ts
import {planFromPours, stageWaterFromSamples, stallsFromSamples, summarise} from "./BrewRecord";
```

and add two fields to the record literal in `emit`, after `stalls`:

```ts
            // Snapshotted here for the same reason `stalls` is computed here:
            // a record is a thing that happened, and it must go on saying what
            // it said even after the recipe is edited or deleted.
            plan: planFromPours(recipe.pours),
            stageWater: stageWaterFromSamples(this.collected, recipe.pours.length),
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx jest library/brew/__tests__/BrewRecorder.test.ts
npm run typecheck && npm run lint && npm test
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add library/brew/BrewRecorder.ts library/brew/__tests__/BrewRecorder.test.ts
git commit -m "feat: the recorder snapshots the plan and each stage's delivery

Written at the moment the brew ends, beside the stalls, and for the same
reason its comment already gives: a record is a thing that happened, and it
must go on saying what it said after the recipe is edited or deleted.

One entry per planned stage, so a stage that never ran records nothing rather
than being missing -- the ladder always gets a full set.

Refs #86, refs #89"
```

---

## Task 7: The record screen draws what happened

The last step, and the visible one. `app/brewRecord.tsx` currently draws the ladder from the live recipe:

```tsx
    activeIndex={recipe.pours.length}
    stageWater={recipe.pours.map(pour => Math.max(pour.volume, 0))}
```

Both say the brew completed. It now draws the record's own snapshot, falling back to the recipe for rows written before Task 5.

There is a decision in `activeIndex` worth stating, because it is not obvious. The ladder marks stages `done` below it, `active` at it, `pending` above. For a brew that finished, every stage is done, so it stays `pours.length`. For a brew that stopped, the stage it stopped in is the frontier — so it becomes the index of the last stage that poured, which leaves that stage `active` and everything after it `pending`.

**Files:**
- Create: `library/brew/ladderState.ts`
- Modify: `app/brewRecord.tsx:249-262`
- Test: `library/brew/__tests__/ladderState.test.ts`
- Test: `app/__tests__/brewRecord.test.tsx`

- [ ] **Step 1: Write the failing test for the frontier**

Create `library/brew/__tests__/ladderState.test.ts`:

```ts
import {ladderFrontier} from "@/library/brew/ladderState";

describe("where a finished brew's ladder stops", () => {
    it("marks every stage done when the brew finished", () => {
        // 4 leaves all of 0..3 below the frontier, which is `done`.
        expect(ladderFrontier("done", [40, 70, 70, 70])).toBe(4);
    });

    it("stops at the stage a failed brew stopped in", () => {
        // Poured 1 and part of 2. Index 1 is the frontier, so stage 2 draws as
        // the one it stopped in and stages 3 and 4 draw as never reached --
        // which used to be four full bars.
        expect(ladderFrontier("failed", [40, 30, 0, 0])).toBe(1);
    });

    it("stops at the first stage when a brew died before pouring", () => {
        expect(ladderFrontier("failed", [0, 0, 0, 0])).toBe(0);
        expect(ladderFrontier("cancelled", [])).toBe(0);
    });

    it("marks every stage done on a cancelled brew that poured them all", () => {
        // Stopped after the last drop rather than during: nothing is pending.
        expect(ladderFrontier("cancelled", [40, 70])).toBe(2);
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest library/brew/__tests__/ladderState.test.ts
```

Expected: FAIL, module not found.

- [ ] **Step 3: Implement the frontier**

Create `library/brew/ladderState.ts`:

```ts
import type {BrewOutcome} from "./BrewRecord";

/**
 * How far a finished brew's ladder got.
 *
 * The ladder draws stages below this index as done, the one at it as the stage
 * in progress, and the rest as never reached. A record has nothing in
 * progress, so the frontier is the stage the brew stopped in -- which for a
 * brew that finished is past the end, leaving every stage done.
 *
 * A brew that was cancelled after its last drop poured everything, so it is
 * not treated as stopping short: the count of stages that delivered water is
 * what decides, not the outcome alone.
 */
export function ladderFrontier(outcome: BrewOutcome, stageWater: number[]): number {
    const poured = stageWater.filter((ml) => ml > 0).length;
    if (outcome === "done" || poured === stageWater.length) return stageWater.length;
    // The last stage that delivered anything. A brew that poured nothing has
    // no last stage and points at the first, which draws as the one it died in.
    return Math.max(0, poured - 1);
}
```

> Read that last line against the tests. With `poured` stages delivered, the frontier is the last of them, `poured - 1`; the clamp is there because a brew that poured nothing has no last stage and must still point at stage 0 rather than -1.

- [ ] **Step 4: Run it and watch it pass**

```bash
npx jest library/brew/__tests__/ladderState.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing screen tests**

`app/__tests__/brewRecord.test.tsx` already has everything needed. It keeps a module-level `record: StoredBrew` and a mutable `mockOpened` that `beforeEach` resets, a `twoPours` recipe, a `noRecipeLookup`, and — most useful here — a `ladderProps` spy that captures the props the screen hands `BrewStageLadder`. That spy is how these tests see the frontier and the water, neither of which any rendered string would reveal.

First widen the spy's type, which is currently narrowed to stalls alone. Near the top of the file, change:

```tsx
let ladderProps: {stalls?: unknown} = {};
```

to:

```tsx
let ladderProps: {stalls?: unknown; stageWater?: unknown; activeIndex?: unknown} = {};
```

Then add three tests inside the existing `describe("brew record", ...)`:

```tsx
    it("still draws a ladder for a recipe that has been deleted", async () => {
        // #86: the ladder used to be built from the live recipe, so deleting
        // the recipe left the record with no stages at all.
        mockOpened = {
            record: {
                ...record,
                plan: [
                    {pourNumber: 1, volume: 40, temperature: 93, flowRate: 40,
                     agitation: 0, pourPattern: 0, pauseTime: 20},
                    {pourNumber: 2, volume: 160, temperature: 92, flowRate: 40,
                     agitation: 0, pourPattern: 0, pauseTime: 0}
                ],
                stageWater: [40, 160]
            },
            samples: []
        };
        await renderWithProviders(<BrewRecord recipeLookup={noRecipeLookup} />);

        expect(screen.getByTestId("ladder")).toBeTruthy();
        expect(screen.queryByText(/recipe deleted/i)).toBeNull();
        expect(ladderProps.stageWater).toEqual([40, 160]);
    });

    it("stops the ladder in the stage a failed brew stopped in", async () => {
        // #89: stage 2 poured nothing, and used to be drawn full to the brim.
        mockOpened = {
            record: {...record, outcome: "failed", stageWater: [40, 0]},
            samples: []
        };
        await renderWithProviders(
            <BrewRecord recipeLookup={{getRecipe: jest.fn(() => twoPours)}} />
        );

        expect(ladderProps.activeIndex).toBe(0);
        expect(ladderProps.stageWater).toEqual([40, 0]);
    });

    it("prefers what the brew poured over what the recipe now says", async () => {
        // The recipe may have been edited since. `twoPours` asks for 40 and 40;
        // the brew that was actually run delivered 40 and 70.
        mockOpened = {
            record: {...record, stageWater: [40, 70]},
            samples: []
        };
        await renderWithProviders(
            <BrewRecord recipeLookup={{getRecipe: jest.fn(() => twoPours)}} />
        );

        expect(ladderProps.stageWater).toEqual([40, 70]);
    });
```

> Do **not** touch the existing `"shows a note and no ladder when the recipe has been deleted"` test. It uses a record with no `plan`, so it still has nothing to draw and must still show the note. If your change breaks it, your change is wrong.

- [ ] **Step 6: Run it and watch it fail**

```bash
npx jest app/__tests__/brewRecord.test.tsx
```

Expected: FAIL — the fallback message is still shown, because the screen only looks at the recipe.

- [ ] **Step 7: Draw from the record**

In `app/brewRecord.tsx`, add the imports:

```tsx
import {poursFromPlan} from "@/library/brew/BrewRecord";
import {ladderFrontier} from "@/library/brew/ladderState";
```

Above the JSX, beside the screen's other derivations, add:

```tsx
    // The record's own plan, or the live recipe for rows written before brews
    // kept one. A snapshot is preferred even when the recipe still exists: it
    // is what was actually brewed, and the recipe may have been edited since.
    const snapshot = poursFromPlan(record.plan);
    const stages = snapshot.length > 0 ? snapshot : recipe?.pours ?? [];
    // Falling back to the plan means claiming every stage poured, which is
    // what it always did and is only ever right for a brew that finished.
    const delivered = record.stageWater
        ?? stages.map((pour) => Math.max(pour.volume, 0));
```

Then replace the ladder block. It currently reads:

```tsx
            {recipe !== null ? (
                <BrewStageLadder
                    pours={recipe.pours}
                    accent={accent}
                    activeIndex={recipe.pours.length}
                    barHeight={11}
                    rungGap={8}
                    scrolls={false}
                    stageWater={recipe.pours.map(pour => Math.max(pour.volume, 0))}
                    stalls={record.stalls ?? recipe.pours.map(() => [])}
                    pauseElapsed={0}
                />
            ) : (
```

Replace it with:

```tsx
            {snapshot.length > 0 || recipe !== null ? (
                <BrewStageLadder
                    pours={stages}
                    accent={accent}
                    activeIndex={ladderFrontier(record.outcome, delivered)}
                    barHeight={11}
                    rungGap={8}
                    scrolls={false}
                    stageWater={delivered}
                    stalls={record.stalls ?? stages.map(() => [])}
                    pauseElapsed={0}
                />
            ) : (
```

> The guard is `snapshot.length > 0 || recipe !== null`, **not** `stages.length > 0`. A recipe that exists but has no pours is an empty ladder, which is what the screen has always drawn and what one of the existing tests asserts; collapsing that into the "recipe deleted" branch would be a regression this task has no business making.

leaving the `Recipe deleted. Stages not available.` branch exactly as it is — it is now reached only when there is neither a snapshot nor a recipe, which is a record from before Task 5 whose recipe has since gone.

- [ ] **Step 8: Run everything**

```bash
npx jest app/__tests__/brewRecord.test.tsx library/brew/__tests__/ladderState.test.ts
npm run typecheck && npm run lint && npm test
npx expo-doctor
```

Expected: all green, expo-doctor 21/21. Report the test total.

- [ ] **Step 9: Commit**

```bash
git add library/brew/ladderState.ts library/brew/__tests__/ladderState.test.ts \
        app/brewRecord.tsx app/__tests__/brewRecord.test.tsx
git commit -m "fix: a record's ladder shows the brew, not the recipe

The ladder was drawn from the live recipe with every stage marked poured, so a
brew that failed in stage 2 of 4 showed stages 3 and 4 filled to the brim --
the opposite of what happened -- and a brew whose recipe had been deleted
showed no stages at all.

It now draws the record's own snapshot: the plan it was started from, the
water each stage actually delivered, and a frontier at the stage it stopped
in. A brew that finished still marks every stage done, and a brew cancelled
after its last drop counts as having poured them all rather than as stopping
short.

Rows written before the snapshot existed fall back to the recipe exactly as
they did before.

Closes #86
Closes #89"
```

---

## Finishing

- [ ] **Update the issues**

Tick on #87: the grinding flicker, and "Press start on the machine" shown when START BREWING was pressed in the app.

Leave the stage counter item unticked. It was deliberately left out of this plan: the view was redesigned since the report and the label may no longer be needed, which is a device call.

#86 and #89 close themselves from Task 7's commit message once the branch merges.

- [ ] **Device test**

Everything in this plan is judged on hardware, and three things especially:

1. **Start a brew from the app.** `PRESS ▶ ON THE MACHINE` must never appear. Then start one **from the machine**, with auto-start off, and check the prompt does appear and that the app follows into the live view by itself.
2. **Watch the grind at both ends of the range.** Brew something at 60 rpm and something at 120. The flicker should read as grinding at both, and visibly differ.
3. **Fail a brew on purpose** -- an empty tank part-way through -- and open its record. The ladder must show the stage it stopped in and empty bars after it. Then **delete the recipe** and open the same record again: the ladder must still be there.

## Out of scope

- **#90**, the auto-tare fooling stall detection. Deliberately unfixed: the fix depends on the tare's size, which is only described qualitatively, and guessing wrong suppresses real stalls at the bloom. It is a measurement to take during the device session, and the issue says how.
- **The stage counter's lag** (#87). Needs a real handshake to diagnose.
- The four-shape BREW trial. That is settled on hardware, not here.

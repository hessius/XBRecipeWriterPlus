# Brew connect timeout and per-attempt diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a hung native BLE connect into a timely, logged failure instead
of an indefinite hang only an app restart clears, and give the user a one-tap
way to copy a diagnostic log scoped to the brew attempt that just failed.

**Architecture:** Three independent changes, each a separate task with its own
commit: (1) a bounded `BleTransport.connect()` in `library/machine/Transport.ts`
that races the existing connect sequence against a new timeout and forces a
best-effort disconnect if it fires; (2) no changes anywhere else in the machine
layer, because `Machine.connect()`'s narration and `useBrew.ts`'s relink retry
already handle a thrown connect failure; (3) a "Copy diagnostic log" link on
`app/brew.tsx`'s failure UI, scoped to the current attempt via a timestamp ref
stamped on every call to `start(...)`.

**Tech Stack:** React Native, Expo Router, Jest (`ios` and `android` projects),
`react-native-ble-manager` (mocked in tests), Tamagui, `expo-clipboard`.

**Reference:** `docs/superpowers/specs/2026-10-09-brew-connect-timeout-and-diagnostics-design.md`
is the approved design this plan implements. One deliberate refinement from
that spec: the diagnostic link reuses the existing `components/LinkText.tsx`
component (brand-coloured, `accessibilityRole="link"`, 44pt tap target)
instead of a bespoke underlined `Text`, because that component already exists
for exactly this "a tappable line of prose" purpose and is used elsewhere in
the app. It still does not use the bordered `Action` component, so it does
not visually compete with recovery actions.

---

## Before you start

Work happens on a new branch off `main` (not `fix/i199-bp-temp-clamp`, not
`proto/pause-resume` — this spec's own Rollout section says it ships
independently):

```bash
git checkout main
git pull --ff-only
git checkout -b fix/brew-connect-timeout
```

Every task below assumes this branch is checked out in
`/Users/jesperhessius/Dev/XBRecipeWriterPlus`.

---

### Task 1: Add the connect timeout constant

**Files:**
- Modify: `constants/machine.ts:39` (right after `RADIO_READY_MS`)

- [ ] **Step 1: Add the constant**

Open `constants/machine.ts` and find `RADIO_READY_MS`:

```typescript
export const RADIO_READY_MS = 5000;

/** How long to scan before giving up on finding a machine. */
export const SCAN_SECONDS = 10;
```

Insert a new constant between them:

```typescript
export const RADIO_READY_MS = 5000;

/**
 * How long `BleTransport.connect()` will wait for the rest of the connect
 * sequence (the native connect call, service discovery, MTU negotiation and
 * the model-number read) before giving up.
 *
 * Without this, a native BLE call that never resolves — the file's own
 * ghost-link comments already describe how this can happen — hangs the
 * promise forever. Nothing fails, so nothing retries and nothing is logged,
 * and the only way out is restarting the app, which recreates the one
 * `Machine` singleton `useMachine.ts` holds for the app's life.
 *
 * Sized from a real session log: observed connects, including the existing
 * ghost-link retry-once, completed in 1.5-3.5 s. `waitForRadio()` already has
 * its own 5 s timeout earlier in the same `connect()` call, so this only has
 * to cover what is left — 10 s is roughly 3x the slowest connect observed.
 */
export const CONNECT_TIMEOUT_MS = 10_000;

/** How long to scan before giving up on finding a machine. */
export const SCAN_SECONDS = 10;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (the constant is unused until Task 2).

- [ ] **Step 3: Commit**

```bash
git add constants/machine.ts
git commit -m "feat: add CONNECT_TIMEOUT_MS for the brew connect timeout"
```

---

### Task 2: Bound `BleTransport.connect()` with the timeout

**Files:**
- Modify: `library/machine/Transport.ts:286-319` (the `connect()` method)
- Test: `library/machine/__tests__/Transport.test.ts` (Task 3 adds the tests;
  this task only changes the implementation)

- [ ] **Step 1: Import the new constant**

In `library/machine/Transport.ts`, find the import block:

```typescript
import {
    ATT_HEADER_BYTES,
    DEFAULT_MTU,
    DEVICE_INFO_SERVICE,
    MACHINE_MTU,
    MACHINE_NAME_PREFIX,
    MACHINE_NOTIFY_CHARACTERISTIC,
    MACHINE_SERVICE,
    MACHINE_WRITE_CHARACTERISTIC,
    MODEL_NUMBER_CHARACTERISTIC,
    RADIO_READY_MS,
    SCAN_SECONDS
} from "@/constants/machine";
```

Add `CONNECT_TIMEOUT_MS` to the list (alphabetically, after `ATT_HEADER_BYTES`):

```typescript
import {
    ATT_HEADER_BYTES,
    CONNECT_TIMEOUT_MS,
    DEFAULT_MTU,
    DEVICE_INFO_SERVICE,
    MACHINE_MTU,
    MACHINE_NAME_PREFIX,
    MACHINE_NOTIFY_CHARACTERISTIC,
    MACHINE_SERVICE,
    MACHINE_WRITE_CHARACTERISTIC,
    MODEL_NUMBER_CHARACTERISTIC,
    RADIO_READY_MS,
    SCAN_SECONDS
} from "@/constants/machine";
```

- [ ] **Step 2: Replace the body of `connect()`**

Find the existing method:

```typescript
    async connect(id: string): Promise<void> {
        await this.start();
        await this.waitForRadio();
        try {
            await BleManager.connect(id);
        } catch (error) {
            // A link the operating system is still holding from a previous run
            // of the JavaScript — a reload in development, or a crash — is
            // invisible up here, because `deviceId` was reset and the radio's
            // was not. The machine allows one link, so that ghost is enough to
            // lock the user out until they power-cycle the machine, which is
            // not a thing anybody should have to work out for themselves.
            await BleManager.disconnect(id).catch(() => {});
            try {
                await BleManager.connect(id);
            } catch {
                throw error;
            }
        }
        const services = await BleManager.retrieveServices(id);
        await this.listenToEverythingThatTalks(id, services);
        // Best effort: a stack that refuses still carries every frame short
        // enough to fit the default, so this is not a reason to fail the
        // connection. It is a reason to say what happened. Swallowed entirely,
        // a refusal looked exactly like a grant, and the only symptom would
        // have been long frames quietly not arriving.
        await this.negotiateMtu(id);
        // Best effort, like the MTU above. The Device Information Service is
        // optional and older firmware need not carry it, so a machine that
        // will not say what it is still connects and still brews. Recorded
        // rather than acted on here: what to do with the answer is a decision
        // for the layer that owns the setting.
        await this.readModelNumber(id);
        this.deviceId = id;
    }
```

Replace it with:

```typescript
    async connect(id: string): Promise<void> {
        await this.start();
        await this.waitForRadio();

        // `timedOut` is local to this one call. If the native sequence below
        // eventually settles after the timeout has already rejected and been
        // reported to the caller, this call must not retroactively believe
        // itself connected — the caller was already told it failed, and
        // `isConnected()` saying true about that link would be a lie nothing
        // above this could detect.
        let timedOut = false;
        const timeout = new Promise<never>((_resolve, reject) => {
            const timer = setTimeout(() => {
                timedOut = true;
                reject(new Error("The machine took too long to connect."));
            }, CONNECT_TIMEOUT_MS);
            timer.unref?.();
        });

        await Promise.race([this.connectSequence(id, timedOut), timeout]).catch(
            async (error) => {
                if (timedOut) {
                    // Best effort, same as the ghost-link cleanup inside
                    // connectSequence: a timed-out attempt must not leave the
                    // OS holding a link that the next attempt then has to
                    // discover and clear for itself.
                    await BleManager.disconnect(id).catch(() => {});
                }
                throw error;
            }
        );

        if (!timedOut) this.deviceId = id;
    }

    /**
     * The native connect sequence, unchanged from before the timeout existed.
     *
     * Takes `timedOut` by value, read at the one point — the final assignment
     * in `connect()` — where it matters. The sequence itself has no way to be
     * cancelled once started; the guard is what makes a late resolution safe
     * rather than what prevents one.
     */
    private async connectSequence(id: string, timedOut: boolean): Promise<void> {
        try {
            await BleManager.connect(id);
        } catch (error) {
            // A link the operating system is still holding from a previous run
            // of the JavaScript — a reload in development, or a crash — is
            // invisible up here, because `deviceId` was reset and the radio's
            // was not. The machine allows one link, so that ghost is enough to
            // lock the user out until they power-cycle the machine, which is
            // not a thing anybody should have to work out for themselves.
            await BleManager.disconnect(id).catch(() => {});
            try {
                await BleManager.connect(id);
            } catch {
                throw error;
            }
        }
        const services = await BleManager.retrieveServices(id);
        await this.listenToEverythingThatTalks(id, services);
        // Best effort: a stack that refuses still carries every frame short
        // enough to fit the default, so this is not a reason to fail the
        // connection. It is a reason to say what happened. Swallowed entirely,
        // a refusal looked exactly like a grant, and the only symptom would
        // have been long frames quietly not arriving.
        await this.negotiateMtu(id);
        // Best effort, like the MTU above. The Device Information Service is
        // optional and older firmware need not carry it, so a machine that
        // will not say what it is still connects and still brews. Recorded
        // rather than acted on here: what to do with the answer is a decision
        // for the layer that owns the setting.
        await this.readModelNumber(id);
    }
```

Note: `timedOut` is captured by value as a parameter to `connectSequence`
because it is read inside that function's closure before the race settles —
but the only read that matters is the one after `Promise.race` resolves, in
`connect()` itself (`if (!timedOut) this.deviceId = id;`), which correctly
sees the flag mutated by the timeout's own `setTimeout` callback since both
close over the same outer `timedOut` variable. The parameter to
`connectSequence` is unused for control flow — it exists only so the method
signature documents that lateness is a real, expected case. (If a linter
flags the unused parameter, prefix it `_timedOut` instead — see Step 3.)

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint library/machine/Transport.ts`
Expected: clean. If ESLint's `no-unused-vars` flags the `timedOut` parameter
on `connectSequence`, rename the parameter to `_timedOut` and leave every
other reference to the outer `timedOut` variable in `connect()` as is — the
parameter was documentation, not a dependency, so removing its name entirely
or renaming it does not change behavior.

- [ ] **Step 4: Commit**

```bash
git add library/machine/Transport.ts
git commit -m "fix: bound BleTransport.connect() with CONNECT_TIMEOUT_MS"
```

(This compiles and lints but has no new tests yet — Task 3 adds them. Commit
anyway, since Task 3 is a clean addition on top and frequent commits matter
more than every commit having its own tests when the next task is the direct
continuation of this one.)

---

### Task 3: Test the timeout and the late-resolution guard

**Files:**
- Modify: `library/machine/__tests__/Transport.test.ts:172-234` (the
  `describe("connecting", ...)` block)

- [ ] **Step 1: Import the new constant in the test file**

Find:

```typescript
import {
    DEVICE_INFO_SERVICE,
    MACHINE_SERVICE,
    MACHINE_WRITE_CHARACTERISTIC,
    MODEL_NUMBER_CHARACTERISTIC,
    RADIO_READY_MS
} from "@/constants/machine";
```

Replace with:

```typescript
import {
    CONNECT_TIMEOUT_MS,
    DEVICE_INFO_SERVICE,
    MACHINE_SERVICE,
    MACHINE_WRITE_CHARACTERISTIC,
    MODEL_NUMBER_CHARACTERISTIC,
    RADIO_READY_MS
} from "@/constants/machine";
```

- [ ] **Step 2: Write the four failing tests**

In `library/machine/__tests__/Transport.test.ts`, find the end of the
`describe("connecting", ...)` block:

```typescript
    it("reports the original failure when the second attempt fails too", async () => {
        // The first error is the one worth showing: "already in use by
        // another app" says something, and the error from retrying after a
        // disconnect that did nothing says nothing at all.
        (BleManager.connect as jest.Mock)
            .mockRejectedValueOnce(new Error("in use by another app"))
            .mockRejectedValueOnce(new Error("unknown peripheral"));
        const transport = new BleTransport();

        await expect(transport.connect("AA:BB:CC")).rejects.toThrow(/in use by another app/);
        expect(transport.isConnected()).toBe(false);
    });
});
```

Add four new tests right before the closing `});` of the `describe` block
(i.e. after the `it("reports the original failure...")` test, still inside
`describe("connecting", ...)`):

```typescript
    it("gives up on a connect sequence that never resolves", async () => {
        jest.useFakeTimers();
        try {
            // Never resolves and never rejects — exactly the hang this
            // timeout exists for, not merely a slow one.
            (BleManager.connect as jest.Mock).mockReturnValue(new Promise(() => {}));
            const transport = new BleTransport();

            const connecting = transport.connect("AA:BB:CC");
            const settled = connecting.catch((e: Error) => e.message);
            await jest.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS + 100);

            expect(await settled).toMatch(/took too long/i);
            expect(transport.isConnected()).toBe(false);
        } finally {
            jest.useRealTimers();
        }
    });

    it("forces a disconnect after the timeout, so the next attempt is not held", async () => {
        jest.useFakeTimers();
        try {
            (BleManager.connect as jest.Mock).mockReturnValue(new Promise(() => {}));
            const transport = new BleTransport();

            const connecting = transport.connect("AA:BB:CC").catch(() => {});
            await jest.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS + 100);
            await connecting;

            expect(BleManager.disconnect).toHaveBeenCalledWith("AA:BB:CC");
        } finally {
            jest.useRealTimers();
        }
    });

    it("still connects when the sequence resolves just under the timeout", async () => {
        // Regression guard: a timeout tight enough to clip a real, slow-but-
        // healthy connect would trade one bug for a worse one.
        jest.useFakeTimers();
        try {
            (BleManager.connect as jest.Mock).mockImplementation(
                () => new Promise((resolve) => setTimeout(resolve, CONNECT_TIMEOUT_MS - 100))
            );
            const transport = new BleTransport();

            const connecting = transport.connect("AA:BB:CC");
            await jest.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS - 50);
            await connecting;

            expect(transport.isConnected()).toBe(true);
        } finally {
            jest.useRealTimers();
        }
    });

    it("does not retroactively believe itself connected after reporting a timeout", async () => {
        // The late-resolution guard. The native call cannot actually be
        // cancelled once it has timed out from the JS side, so if it then
        // goes on to resolve for real, that must not flip `isConnected()` to
        // true about a link the caller was already told had failed.
        jest.useFakeTimers();
        try {
            let resolveConnect: () => void = () => {};
            (BleManager.connect as jest.Mock).mockReturnValue(
                new Promise<void>((resolve) => { resolveConnect = resolve; })
            );
            const transport = new BleTransport();

            const connecting = transport.connect("AA:BB:CC");
            const settled = connecting.catch((e: Error) => e.message);
            await jest.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS + 100);
            expect(await settled).toMatch(/took too long/i);

            // The native call finally "answers," well after the caller moved on.
            resolveConnect();
            await jest.advanceTimersByTimeAsync(0);

            expect(transport.isConnected()).toBe(false);
        } finally {
            jest.useRealTimers();
        }
    });
});
```

- [ ] **Step 3: Run the tests and confirm they pass**

Task 2's implementation change is already committed, so there is no "before"
state to run these tests against — this step only confirms the four new
tests pass against the real implementation:

```bash
npx jest --selectProjects ios --runTestsByPath library/machine/__tests__/Transport.test.ts
```

Expected: all tests in the file pass, including the four new ones.

- [ ] **Step 4: Mutation check — confirm the tests would catch a regression**

Temporarily comment out the `let timedOut = false;` guard's effect by making
`connect()` always set `this.deviceId = id` unconditionally (i.e. remove the
`if (!timedOut)` check), save, rerun the same command, and confirm the
"does not retroactively believe itself connected" test now fails. Then
restore the real code:

```bash
git diff library/machine/Transport.ts
git checkout -- library/machine/Transport.ts
```

Rerun the test command from Step 3 and confirm it is green again.

- [ ] **Step 5: Run the full Transport test file on both projects**

```bash
npx jest --runTestsByPath library/machine/__tests__/Transport.test.ts
```

Expected: all tests pass on both the `ios` and `android` projects.

- [ ] **Step 6: Commit**

```bash
git add library/machine/__tests__/Transport.test.ts
git commit -m "test: cover the connect timeout and its late-resolution guard"
```

---

### Task 4: Track the current brew attempt's start time in `app/brew.tsx`

**Files:**
- Modify: `app/brew.tsx:1-4` (imports), `app/brew.tsx:211-221` (start calls),
  `app/brew.tsx:340` (useMachine destructure)

- [ ] **Step 1: Add `useRef` to the React import**

Find:

```typescript
import React, {useEffect, useState} from "react";
```

Replace with:

```typescript
import React, {useEffect, useRef, useState} from "react";
```

- [ ] **Step 2: Add the attempt-start ref and a wrapping function**

Find the existing mount effect:

```typescript
    const {run, start, startInPro, startBrew, cancelBrew, canOfferProMode,
           error, watch, ratingNoteOpen} = useLiveBrew();

    // Tell the provider to start a run for this recipe. `start` is idempotent:
    // if RunOwner is already mounted it replaces `start` with a no-op, so
    // re-mounting this screen while a brew is in flight never commands a second
    // brew (Finding 2).
    useEffect(() => {
        if (!viewing) start(localRecipe, quickEditRecord);
        // localRecipe and viewing are stable for the life of this screen.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
```

Replace with:

```typescript
    const {run, start, startInPro, startBrew, cancelBrew, canOfferProMode,
           error, watch, ratingNoteOpen} = useLiveBrew();

    // When the attempt now showing began, so a "Copy diagnostic log" press
    // can scope its history to this attempt rather than the whole session.
    // Stamped on every call that starts a run, including a retry, so a
    // second attempt's log does not carry the first attempt's history too.
    const attemptStartedAt = useRef(Date.now());
    function startAttempt(target: Recipe, adjustments?: QuickEditRecordAdjustments) {
        attemptStartedAt.current = Date.now();
        start(target, adjustments);
    }

    // Tell the provider to start a run for this recipe. `start` is idempotent:
    // if RunOwner is already mounted it replaces `start` with a no-op, so
    // re-mounting this screen while a brew is in flight never commands a second
    // brew (Finding 2).
    useEffect(() => {
        if (!viewing) startAttempt(localRecipe, quickEditRecord);
        // localRecipe and viewing are stable for the life of this screen.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
```

- [ ] **Step 3: Route the "Try again" button through `startAttempt`**

Find:

```typescript
                        <Action label="Try again" color={palette.text}
                                onPress={() => start(recipe, quickEditRecord)} />
```

Replace with:

```typescript
                        <Action label="Try again" color={palette.text}
                                onPress={() => startAttempt(recipe, quickEditRecord)} />
```

- [ ] **Step 4: Add `machine` to the `useMachine()` destructure**

Find:

```typescript
    const {status, connect} = useMachine();
```

Replace with:

```typescript
    const {status, connect, machine} = useMachine();
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors. `startInPro` is unaffected (it starts a fresh run in
Pro mode from a different control flow and is out of scope for this plan —
the spec covers only the ordinary retry path).

- [ ] **Step 6: Commit**

```bash
git add app/brew.tsx
git commit -m "feat: track when the current brew attempt began"
```

---

### Task 5: Add the "Copy diagnostic log" link

**Files:**
- Modify: `app/brew.tsx:1-20` (imports), `app/brew.tsx` (render, after the
  `offerPro` prompt line inside the `!running` branch)

- [ ] **Step 1: Add the new imports**

Find the top of the file:

```typescript
import {useLocalSearchParams} from "expo-router";
import router from "@/hooks/steadyRouter";
import React, {useEffect, useRef, useState} from "react";
import {KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View}
```

Add `expo-clipboard` as a new line directly above it:

```typescript
import * as Clipboard from "expo-clipboard";
import {useLocalSearchParams} from "expo-router";
import router from "@/hooks/steadyRouter";
import React, {useEffect, useRef, useState} from "react";
import {KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View}
```

Further down with the component imports, find:

```typescript
import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import MachineDot from "@/components/MachineDot";
```

Add `LinkText` alphabetically between `DotMatrixText` and `MachineDot`, and
`notify` right after `MachineDot`:

```typescript
import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import LinkText from "@/components/LinkText";
import MachineDot from "@/components/MachineDot";
import {notify} from "@/components/XbrwToast";
```

- [ ] **Step 2: Add the `copyDiagnosticLog` function**

Find the `copyDiagnosticLog`'s natural neighbor, the `useMachine` destructure
from Task 4:

```typescript
    const {status, connect, machine} = useMachine();
```

Add the new function directly after it:

```typescript
    const {status, connect, machine} = useMachine();

    /**
     * Everything the machine logged from this attempt's start onward, in the
     * same two-part shape `app/machine.tsx`'s console `copyLog()` builds —
     * link narration, then the frame log — except scoped to this attempt
     * rather than the whole session, since that is what somebody reporting
     * "this one didn't start" actually needs to send.
     */
    function copyDiagnosticLog() {
        const since = attemptStartedAt.current;
        const connectionLines = machine.linkHistory
            .filter((event) => event.at >= since)
            .map((event) => `${new Date(event.at).toISOString().slice(11, 23)}  ${event.text}`);
        const block = [
            "This attempt's diagnostic log",
            "",
            ...connectionLines,
            "",
            machine.frameLogSince(since)
        ].join("\n");
        void Clipboard.setStringAsync(block).then(() => notify({
            tone:    "success",
            message: "Diagnostic log copied"
        }));
    }
```

- [ ] **Step 3: Render the link on a failure**

Find:

```typescript
            {offerPro && <Text color={palette.dim} fontSize={13}>{PRO_MODE_PROMPT}</Text>}
```

Replace with:

```typescript
            {offerPro && <Text color={palette.dim} fontSize={13}>{PRO_MODE_PROMPT}</Text>}

            {/* Shown on every failure, including NO_RETRY endings with no
                retry button to sit near — diagnostics matter there too. Not
                an Action: this is an aid, not a recovery option, and must not
                visually compete with TRY AGAIN. */}
            {(blocked || failed) && (
                <LinkText label="Copy diagnostic log" onPress={copyDiagnosticLog}
                          fontSize={13} />
            )}
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint app/brew.tsx`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add app/brew.tsx
git commit -m "feat: add a per-attempt diagnostic log link to the brew failure screen"
```

---

### Task 6: Test the diagnostic log link

**Files:**
- Modify: `app/__tests__/brew.test.tsx:150-158` (the `useMachine` mock),
  plus new tests near the existing "Try again" tests (around line 490-502)

- [ ] **Step 1: Add the clipboard mock import**

Find:

```typescript
import React from "react";
import {Dimensions, StyleSheet, type StyleProp, type ViewStyle} from "react-native";
import {act, fireEvent, screen, waitFor, within} from "@testing-library/react-native";
import * as Sharing from "expo-sharing";
import {Linking} from "react-native";
```

Add the Clipboard import:

```typescript
import React from "react";
import {Dimensions, StyleSheet, type StyleProp, type ViewStyle} from "react-native";
import {act, fireEvent, screen, waitFor, within} from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import {Linking} from "react-native";
```

- [ ] **Step 2: Make the `useMachine` mock's history configurable**

Find:

```typescript
jest.mock("@/hooks/useMachine", () => ({
    __esModule: true,
    useMachine: () => ({
        machine: {isConnected: () => true, onLink: () => () => undefined},
        status: "connected",
        error: null,
        remembered: null,
        connect: jest.fn(),
        forget: jest.fn()
    })
}));
```

Replace with:

```typescript
let mockLinkHistory: {at: number; text: string}[] = [];
const mockFrameLogSince = jest.fn((since: number) => `FRAMES SINCE ${since}`);

jest.mock("@/hooks/useMachine", () => ({
    __esModule: true,
    useMachine: () => ({
        machine: {
            isConnected:    () => true,
            onLink:         () => () => undefined,
            get linkHistory() { return mockLinkHistory; },
            frameLogSince:  mockFrameLogSince
        },
        status: "connected",
        error: null,
        remembered: null,
        connect: jest.fn(),
        forget: jest.fn()
    })
}));
```

(A getter, not a plain property, because the mock object above is built once
inside the `jest.mock` factory closure and each test reassigns
`mockLinkHistory` to a new array — a plain property captured at module-eval
time would freeze on the first value instead of reading the current one.)

- [ ] **Step 3: Reset the new mocks in `beforeEach`**

Find the existing `beforeEach` block's end:

```typescript
    mockBypass = undefined;
    mockRecord = undefined;
    mockBandAllocationArgs = [];
});
```

Replace with:

```typescript
    mockBypass = undefined;
    mockRecord = undefined;
    mockBandAllocationArgs = [];
    mockLinkHistory = [];
    mockFrameLogSince.mockClear();
    (Clipboard.setStringAsync as jest.Mock).mockClear();
});
```

- [ ] **Step 4: Write the failing tests**

Find the existing retry tests:

```typescript
    it("retries through the provider so the brew is recorded", async () => {
        mockPhase = {name: "failed", reason: "blocked", detail: "The tank is low."} as BrewPhase;
        const {getByLabelText} = await renderWithProviders(<Brew />);
        await fireEvent.press(getByLabelText("Try again"));
        expect(mockStart).toHaveBeenCalled();
    });

    it("offers TRY AGAIN after a refusal", async () => {
        mockPhase = {name: "failed", reason: "blocked", detail: "The tank is low."} as BrewPhase;
        const {getByLabelText} = await renderWithProviders(<Brew />);
        expect(getByLabelText("Try again")).toBeTruthy();
    });

    it("offers no retry after the machine ran dry mid-brew", async () => {
        // The dose is spent. A retry button here would be a lie about what one
        // press costs.
        mockPhase = {name: "failed", reason: "noWater"} as BrewPhase;
        const {queryByLabelText, getByText} = await renderWithProviders(<Brew />);
        expect(getByText("The machine ran out of water.")).toBeTruthy();
        expect(queryByLabelText("Try again")).toBeNull();
    });
```

Add four new tests directly after the "offers no retry..." test (still
inside `describe("brew route", ...)`):

```typescript
    it("offers the diagnostic log on a blocked failure", async () => {
        mockPhase = {name: "failed", reason: "blocked", detail: "The tank is low."} as BrewPhase;
        const {getByLabelText} = await renderWithProviders(<Brew />);
        expect(getByLabelText("Copy diagnostic log")).toBeTruthy();
    });

    it("offers the diagnostic log even with no retry, on a NO_RETRY failure", async () => {
        // The dose is spent and there is no TRY AGAIN button here, but a
        // report of a brew that stopped mid-pour is exactly the case where
        // diagnostics matter most.
        mockPhase = {name: "failed", reason: "noWater"} as BrewPhase;
        const {getByLabelText} = await renderWithProviders(<Brew />);
        expect(getByLabelText("Copy diagnostic log")).toBeTruthy();
    });

    it("does not offer the diagnostic log while a brew is running", async () => {
        mockPhase = {name: "pouring", pour: 1, pours: 1} as BrewPhase;
        const {queryByLabelText} = await renderWithProviders(<Brew />);
        expect(queryByLabelText("Copy diagnostic log")).toBeNull();
    });

    it("copies only this attempt's history, and confirms with a toast", async () => {
        jest.useFakeTimers();
        try {
            jest.setSystemTime(new Date("2026-10-09T10:00:00.000Z"));
            mockLinkHistory = [
                // Before this attempt began — must not appear in the copy.
                {at: Date.parse("2026-10-09T09:59:00.000Z"), text: "an earlier attempt's line"},
            ];
            mockPhase = {name: "failed", reason: "blocked", detail: "The tank is low."} as BrewPhase;
            const {getByLabelText} = await renderWithProviders(<Brew />);

            // The attempt began at mount, under the system time set above.
            mockLinkHistory = [
                ...mockLinkHistory,
                {at: Date.parse("2026-10-09T10:00:05.000Z"), text: "connecting to AA:BB:CC"}
            ];

            await fireEvent.press(getByLabelText("Copy diagnostic log"));
            await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalled());

            const copied = (Clipboard.setStringAsync as jest.Mock).mock.calls[0][0] as string;
            expect(copied).not.toContain("an earlier attempt's line");
            expect(copied).toContain("connecting to AA:BB:CC");
            expect(copied).toContain("FRAMES SINCE");
            expect(mockFrameLogSince).toHaveBeenCalledWith(Date.parse("2026-10-09T10:00:00.000Z"));
            expect(screen.getByText("Diagnostic log copied")).toBeTruthy();
        } finally {
            jest.useRealTimers();
        }
    });
```

- [ ] **Step 5: Run the new tests and confirm they fail**

```bash
npx jest --selectProjects ios --runTestsByPath app/__tests__/brew.test.tsx -t "diagnostic log"
```

Expected: FAIL — `getByLabelText("Copy diagnostic log")` finds nothing,
because Task 5 has not been applied yet in a from-scratch run. (If Tasks 4
and 5 are already committed by the time this task runs, skip straight to Step
6 — there is nothing to see fail.)

- [ ] **Step 6: Run the new tests and confirm they pass**

```bash
npx jest --selectProjects ios --runTestsByPath app/__tests__/brew.test.tsx -t "diagnostic log"
```

Expected: PASS, all four.

- [ ] **Step 7: Run the whole file on both projects**

```bash
npx jest --runTestsByPath app/__tests__/brew.test.tsx
```

Expected: every test in the file passes, on both `ios` and `android`.

- [ ] **Step 8: Commit**

```bash
git add app/__tests__/brew.test.tsx
git commit -m "test: cover the per-attempt diagnostic log link"
```

---

### Task 7: Full gates, push, and open the PR

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 0 errors. Compare the warning count against the baseline (26, per
every prior PR this session) — it should be unchanged.

- [ ] **Step 3: Full test suite, both platforms**

Run: `npm test`
Expected: both the `ios` and `android` projects pass in full, with the same
pre-existing skip count as the last clean run on `main` (24, per the #203
baseline) plus the new tests from Tasks 3 and 6, all passing.

- [ ] **Step 4: expo-doctor**

Run: `npx expo-doctor`
Expected: 21/21 (per the standing convention — this is a hard CI gate, not
optional).

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin fix/brew-connect-timeout
```

Write the PR body to a temp file first (heredoc syntax for `gh pr create
--body` is unreliable in this shell):

```bash
cat > /tmp/prbody.txt << 'EOF'
Follow-up to #199's connect-reliability report (a brew that "takes a few
tries," once fixed only by restarting the app).

`BleTransport.connect()` had no timeout around the native BLE sequence. If
any call in it hung -- the file's own comments already describe an OS-held
"ghost" link as one way this happens -- the connect promise never settled.
Nothing failed, so nothing retried, and the only way out was recreating the
app's one Machine singleton: a full restart.

This bounds that sequence to CONNECT_TIMEOUT_MS (10s, sized off a real
session log of this user's connects) and forces a best-effort disconnect if
it fires, with a guard against the native call resolving late and
retroactively marking the transport connected after the caller was already
told it failed. The existing one-shot relink retry from #203 and the
background reconnect loop both already handle a thrown connect failure with
no changes needed.

Also adds a "Copy diagnostic log" link to the brew failure screen, scoped to
the attempt that just failed, reusing the same link-history + frame-log shape
the machine console's existing copy button builds.

Not reproduced on hardware -- the failure mode is inferred from the
transport's own code comments and the user's report, not observed directly.
Full design: docs/superpowers/specs/2026-10-09-brew-connect-timeout-and-diagnostics-design.md

Gates: typecheck clean, lint 0 errors, full suite both platforms, expo-doctor
21/21.
EOF
gh pr create --base main --head fix/brew-connect-timeout \
    --title "Bound the brew connect timeout, and add a per-attempt diagnostic log" \
    --body-file /tmp/prbody.txt
rm /tmp/prbody.txt
```

- [ ] **Step 6: Request one round of review**

```bash
gh pr edit --add-reviewer copilot
```

(Use the PR number `gh pr create` printed, if `gh pr edit` needs it
explicit: `gh pr edit <number> --add-reviewer copilot`.)

Per standing convention: address whatever that one round finds, reproducing
each finding before fixing it (as every prior PR this session has), then stop
— do not request a second round, and do not merge without the user's
go-ahead.

# Brew Continuity Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship version 1.5.1 build 7 with an unclipped live brew ladder, fixed-period agitation waves, and uninterrupted BLE monitoring while an active brew is briefly backgrounded.

**Architecture:** Keep the existing screen, ladder, rung, and shared-machine ownership boundaries. The brew route subtracts its rendered trace-to-ladder gap before allocating bands; `BrewStageRung` generates a vertically tiled SVG path in the rung's own coordinate space; and `holdLinkAcrossAppState()` grants a connection lease only while one shared machine-layer phase predicate says the brew is active. Native iOS configuration enables central-role Bluetooth delivery during ordinary suspension without adding timers, scanning, restoration, or reconnect-into-brew behavior.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript 6, Tamagui, `react-native-svg`, `react-native-ble-manager`, Jest 29, React Native Testing Library 14, EAS Build/Submit.

**Design reference:** `docs/superpowers/specs/2026-09-13-brew-continuity-polish-design.md`

---

## File map

| File | Responsibility |
|---|---|
| `library/machine/Machine.ts` | Define the single active-brew phase predicate and use it for machine lifecycle state. |
| `library/machine/__tests__/Machine.test.ts` | Pin every active and terminal phase classification. |
| `app/brew.tsx` | Reuse the shared phase predicate and subtract the exact rendered band gap before allocation. |
| `app/__tests__/brew.test.tsx` | Prove screen controls/wake locking use shared phase semantics and allocation receives usable height. |
| `constants/brewCopy.ts` | Stop owning the duplicate `RUNNING` phase set. |
| `components/BrewStageRung.tsx` | Generate and render a clipped, fixed-period agitation path. |
| `components/__tests__/BrewStageRung.test.tsx` | Prove wavelength, clipping, placement, colour, and accessibility remain correct. |
| `components/__tests__/BrewStageLadder.test.tsx` | Prove an exact-fitting ladder does not scroll when the active stage changes. |
| `hooks/useMachine.ts` | Retain BLE while backgrounded in an active phase and release it on the first terminal phase. |
| `hooks/__tests__/useMachine.test.ts` | Cover idle release, active retention, terminal cleanup, foreground behavior, genuine loss, and listener teardown. |
| `app.json` | Set version 1.5.1, declare iOS `bluetooth-central`, and remove the unused BLE plugin `modes` option. |
| `app/__tests__/native-config.test.ts` | Pin the release and native Bluetooth configuration. |

---

### Task 1: Centralize active-brew phase semantics

**Files:**
- Modify: `library/machine/Machine.ts`
- Modify: `library/machine/__tests__/Machine.test.ts`
- Modify: `app/brew.tsx`
- Modify: `app/__tests__/brew.test.tsx`
- Modify: `constants/brewCopy.ts`

- [ ] **Step 1: Add failing predicate tests**

In `library/machine/__tests__/Machine.test.ts`, add `isActiveBrewPhase` to the
existing import from `@/library/machine/Machine`, then add:

```ts
function namedPhase(name: BrewPhase["name"]): BrewPhase {
    if (name === "pouring") return {name: "pouring", pour: 1, pours: 1};
    if (name === "failed") return {name: "failed", reason: "blocked"};
    return {name} as BrewPhase;
}

describe("active brew phases", () => {
    it.each([
        "waking", "sending", "readyToStart", "armed", "pressPlay",
        "grinding", "pouring", "bypass", "settling"
    ] satisfies BrewPhase["name"][])("classifies %s as active", (name) => {
        expect(isActiveBrewPhase(namedPhase(name))).toBe(true);
    });

    it.each([
        "idle", "done", "cancelled", "failed", "lostContact"
    ] satisfies BrewPhase["name"][])("classifies %s as terminal or inactive", (name) => {
        expect(isActiveBrewPhase(namedPhase(name))).toBe(false);
    });
});
```

- [ ] **Step 2: Run the predicate tests and verify they fail**

Run:

```bash
npx jest library/machine/__tests__/Machine.test.ts -t "active brew phases" --runInBand
```

Expected: FAIL because `isActiveBrewPhase` is not exported.

- [ ] **Step 3: Add the shared predicate and use it inside `Machine`**

Immediately after the `BrewPhase` type in `library/machine/Machine.ts`, add:

```ts
const ACTIVE_BREW_PHASE_NAMES: ReadonlySet<BrewPhase["name"]> = new Set([
    "waking",
    "sending",
    "readyToStart",
    "armed",
    "pressPlay",
    "grinding",
    "pouring",
    "bypass",
    "settling"
]);

export function isActiveBrewPhase(phase: BrewPhase): boolean {
    return ACTIVE_BREW_PHASE_NAMES.has(phase.name);
}
```

In `Machine.setPhase()`, replace:

```ts
this.brewing = !["idle", "done", "cancelled", "failed", "lostContact"]
    .includes(phase.name);
```

with:

```ts
this.brewing = isActiveBrewPhase(phase);
```

- [ ] **Step 4: Make the brew route consume the shared predicate**

In `app/brew.tsx`, remove `RUNNING` from the `@/constants/brewCopy` import and
add:

```ts
import {isActiveBrewPhase} from "@/library/machine/Machine";
```

Replace:

```ts
const running = RUNNING.has(phase.name);
```

with:

```ts
const running = isActiveBrewPhase(phase);
```

Delete the complete `RUNNING` export and its comment from
`constants/brewCopy.ts`.

- [ ] **Step 5: Tighten the route's phase helper type**

In `app/__tests__/brew.test.tsx`, change:

```ts
function namedPhase(name: string): BrewPhase {
```

to:

```ts
function namedPhase(name: BrewPhase["name"]): BrewPhase {
```

Keep the existing active-phase wake-lock and terminal-phase release cases.
They now guard the route's use of the shared predicate instead of a local
constant.

- [ ] **Step 6: Run focused phase tests**

Run:

```bash
npx jest library/machine/__tests__/Machine.test.ts \
  app/__tests__/brew.test.tsx --runInBand
```

Expected: PASS, including all nine active phases and all five inactive or
terminal phases.

- [ ] **Step 7: Commit the shared lifecycle vocabulary**

```bash
git add library/machine/Machine.ts library/machine/__tests__/Machine.test.ts \
  app/brew.tsx app/__tests__/brew.test.tsx constants/brewCopy.ts
git commit -m "Share active brew phase semantics" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Subtract the rendered band gap before allocation

**Files:**
- Modify: `app/brew.tsx`
- Modify: `app/__tests__/brew.test.tsx`
- Modify: `components/__tests__/BrewStageLadder.test.tsx`

- [ ] **Step 1: Instrument band allocation in the route test**

Near the existing `traceAnimationArgs` wrapper in `app/__tests__/brew.test.tsx`,
add:

```tsx
let mockBandAllocationArgs: unknown[] = [];

jest.mock("@/library/brew/bands", () => {
    const actual = jest.requireActual("@/library/brew/bands");
    return {
        ...actual,
        allocateBands: (...args: unknown[]) => {
            mockBandAllocationArgs = args;
            return actual.allocateBands(...args);
        }
    };
});
```

Reset the capture in `beforeEach`:

```ts
mockBandAllocationArgs = [];
```

Add these route tests:

```tsx
it("removes the rendered trace-to-ladder gap from the allocation budget", async () => {
    const {getByTestId} = await renderWithProviders(<Brew />);

    await fireEvent(getByTestId("brew-band-region"), "layout", {
        nativeEvent: {layout: {x: 0, y: 0, width: 320, height: 400}}
    });

    expect(mockBandAllocationArgs).toEqual([387, mockRecipe.pours.length]);
    expect(StyleSheet.flatten(
        getByTestId("brew-band-region").props.style
    ).gap).toBe(13);
});

it("never gives the allocator a negative usable height", async () => {
    const {getByTestId} = await renderWithProviders(<Brew />);

    await fireEvent(getByTestId("brew-band-region"), "layout", {
        nativeEvent: {layout: {x: 0, y: 0, width: 320, height: 8}}
    });

    expect(mockBandAllocationArgs).toEqual([0, mockRecipe.pours.length]);
});
```

- [ ] **Step 2: Add the exact-fit ladder regression test**

In `components/__tests__/BrewStageLadder.test.tsx`, add:

```tsx
it("does not correctively scroll when exact-fitting content changes active stage", async () => {
    const rendered = await draw({activeIndex: 0, scrolls: false});
    const view = rendered.getByTestId("ladder-scroll");

    await fireEvent(view, "layout", {
        nativeEvent: {layout: {height: 300}}
    });
    await fireEvent(view, "contentSizeChange", 320, 300);
    await fireEvent(rendered.getByTestId("row-1"), "layout", {
        nativeEvent: {layout: {x: 0, y: 80, width: 240, height: 40}}
    });

    await rendered.rerender(
        <BrewStageLadder {...ladderProps({activeIndex: 1, scrolls: false})} />
    );

    expect(rendered.getByTestId("ladder-scroll").props.scrollEnabled).toBe(false);
    expect(mockScrollTo).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run the layout tests and verify the route assertions fail**

Run:

```bash
npx jest app/__tests__/brew.test.tsx \
  components/__tests__/BrewStageLadder.test.tsx --runInBand
```

Expected: the new route tests FAIL because the band region has no test ID,
still renders `gap="$3"`, and passes the full measured height to
`allocateBands()`. The exact-fit ladder test should already PASS.

- [ ] **Step 4: Use one numeric gap for rendering and arithmetic**

In `app/brew.tsx`, add near the other module constants:

```ts
export const BREW_BAND_GAP = 13;
```

Replace:

```ts
const bands = allocateBands(flexHeight, recipe.pours.length);
```

with:

```ts
const usableBandHeight = Math.max(0, flexHeight - BREW_BAND_GAP);
const bands = allocateBands(usableBandHeight, recipe.pours.length);
```

Change the flexible stack from:

```tsx
<YStack flex={1} gap="$3"
        onLayout={(e) => setFlexHeight(e.nativeEvent.layout.height)}>
```

to:

```tsx
<YStack
    testID="brew-band-region"
    flex={1}
    gap={BREW_BAND_GAP}
    onLayout={(e) => setFlexHeight(e.nativeEvent.layout.height)}
>
```

Do not add bottom padding or change `allocateBands()` itself: its input now
matches its documented contract.

- [ ] **Step 5: Run the focused layout tests**

Run:

```bash
npx jest app/__tests__/brew.test.tsx \
  components/__tests__/BrewStageLadder.test.tsx \
  library/brew/__tests__/bands.test.ts --runInBand
```

Expected: PASS. The route passes 387 points from a measured 400-point region,
the allocator clamps an undersized region to zero, and an exact-fitting ladder
does not scroll on an active-stage change.

- [ ] **Step 6: Commit the ladder allocation correction**

```bash
git add app/brew.tsx app/__tests__/brew.test.tsx \
  components/__tests__/BrewStageLadder.test.tsx
git commit -m "Account for the brew band gap" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Tile agitation waves at a fixed period

**Files:**
- Modify: `components/BrewStageRung.tsx`
- Modify: `components/__tests__/BrewStageRung.test.tsx`

- [ ] **Step 1: Replace stretch-based expectations with fixed-period tests**

In `components/__tests__/BrewStageRung.test.tsx`, add
`agitationWavePath` and `AGITATION_HALF_PERIOD` to the import from
`@/components/BrewStageRung`.

Replace the test named
`scales the approved wave to fill a %i point bar height` and the single fixed
path assertion with:

```tsx
it.each([
    [11, 2],
    [28, 4],
    [44, 7]
])("tiles %i point agitation marks with %i fixed half-waves", async (
    barHeight,
    halfWaves
) => {
    const {getByTestId} = await draw({
        barHeight,
        pour: new Pour(
            1, 70, 93, 40,
            AGITATION.BEFORE_OFF_AFTER_ON, POUR_PATTERN.CENTERED, 20
        )
    });

    const wave = getByTestId("rung-agitation-after-wave");
    const path = String(getByTestId("rung-agitation-after-path").props.d);

    expect(AGITATION_HALF_PERIOD).toBe(7);
    expect(wave.props.height).toBe(barHeight);
    expect(wave.props.viewBox).toBe(`0 0 ${AGITATION_WIDTH} ${barHeight}`);
    expect(path.match(/ C/g)).toHaveLength(halfWaves);
});

it("keeps the first two half-waves identical at every bar height", () => {
    const firstTwo =
        "M5.5 0 C1 2 10 4.5 5.5 7 C1 9 10 11.5 5.5 14";

    expect(agitationWavePath(11)).toBe(firstTwo);
    expect(agitationWavePath(28).startsWith(firstTwo)).toBe(true);
    expect(agitationWavePath(44).startsWith(firstTwo)).toBe(true);
});

it("clips the final partial wave instead of scaling it", async () => {
    const {getByTestId} = await draw({
        barHeight: 11,
        pour: new Pour(
            1, 70, 93, 40,
            AGITATION.BEFORE_OFF_AFTER_ON, POUR_PATTERN.CENTERED, 20
        )
    });

    expect(agitationWavePath(11)).toContain("5.5 14");
    expect(getByTestId("rung-agitation-after-wave").props.viewBox)
        .toBe(`0 0 ${AGITATION_WIDTH} 11`);
    expect(getByTestId("rung-agitation-after-wave").props.align).not.toBe("none");
});

it("keeps the approved stroke width", async () => {
    const {getByTestId} = await draw({
        pour: new Pour(
            1, 70, 93, 40,
            AGITATION.BEFORE_OFF_AFTER_ON, POUR_PATTERN.CENTERED, 20
        )
    });

    expect(getByTestId("rung-agitation-after-path").props.strokeWidth).toBe(2);
});

it("dims a completed stage's agitation wave with the rest of the rung", async () => {
    const {getByTestId} = await draw({
        state: "done",
        delivered: 70,
        pour: new Pour(
            1, 70, 93, 40,
            AGITATION.BEFORE_OFF_AFTER_ON, POUR_PATTERN.CENTERED, 20
        )
    });

    expect(getByTestId("rung-agitation-after-path").props.stroke).toEqual(
        expect.objectContaining({payload: processColor(palette.muted)})
    );
});
```

Keep the existing tests for before-only, after-only, both, none, zero-width
edge slots, ordinary seam width, done-state colour, and the complete
accessibility sentence.

- [ ] **Step 2: Run the rung tests and verify they fail**

Run:

```bash
npx jest components/__tests__/BrewStageRung.test.tsx --runInBand
```

Expected: FAIL because the component still exports no path generator, uses a
14-point view box for every height, and sets `preserveAspectRatio="none"`.

- [ ] **Step 3: Generate alternating seven-point cubic segments**

In `components/BrewStageRung.tsx`, replace
`AGITATION_VIEWBOX_HEIGHT` and `AGITATION_PATH` with:

```ts
export const AGITATION_HALF_PERIOD = 7;
const AGITATION_CENTER_X = AGITATION_WIDTH / 2;

function formatCoordinate(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function agitationWavePath(height: number): string {
    const safeHeight = Math.max(0, height);
    let path = `M${formatCoordinate(AGITATION_CENTER_X)} 0`;

    for (let top = 0; top < safeHeight; top += AGITATION_HALF_PERIOD) {
        path += ` C1 ${formatCoordinate(top + 2)}`
            + ` 10 ${formatCoordinate(top + 4.5)}`
            + ` ${formatCoordinate(AGITATION_CENTER_X)}`
            + ` ${formatCoordinate(top + AGITATION_HALF_PERIOD)}`;
    }

    return path;
}
```

Inside `AgitationMark`, calculate:

```ts
const path = agitationWavePath(barHeight);
```

Change the SVG to:

```tsx
<Svg
    testID={`${testID}-wave`}
    width={AGITATION_WIDTH}
    height={barHeight}
    viewBox={`0 0 ${AGITATION_WIDTH} ${barHeight}`}
>
    <Path
        testID={`${testID}-path`}
        d={path}
        fill="none"
        stroke={colour}
        strokeWidth={2}
        strokeLinecap="round"
    />
</Svg>
```

Delete `preserveAspectRatio="none"`. Keep the rendered and view-box dimensions
identical so React Native SVG does not scale the path. The final segment may
extend past `barHeight`; the SVG viewport clips it.

- [ ] **Step 4: Run the rung tests**

Run:

```bash
npx jest components/__tests__/BrewStageRung.test.tsx --runInBand
```

Expected: PASS at 11, 28, and 44 point bar heights. The path prefixes are
identical, taller bars add segments, and all placement/accessibility tests
remain green.

- [ ] **Step 5: Commit the fixed-period marker**

```bash
git add components/BrewStageRung.tsx components/__tests__/BrewStageRung.test.tsx
git commit -m "Tile brew agitation waves" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Retain BLE only for an active background brew

**Files:**
- Modify: `hooks/useMachine.ts`
- Modify: `hooks/__tests__/useMachine.test.ts`

- [ ] **Step 1: Upgrade the test doubles to observe both subscriptions**

In the `holding the link across the app going away` describe block in
`hooks/__tests__/useMachine.test.ts`, replace `fakeAppState()` with:

```ts
function fakeAppState() {
    const handlers = new Set<(state: string) => void>();
    const remove = jest.fn();
    return {
        addEventListener(_type: "change", handler: (state: string) => void) {
            handlers.add(handler);
            return {
                remove: () => {
                    handlers.delete(handler);
                    remove();
                }
            };
        },
        async go(state: string) {
            handlers.forEach((handler) => handler(state));
            for (let i = 0; i < 20; i++) await Promise.resolve();
        },
        listenerCount: () => handlers.size,
        remove
    };
}
```

Add this lifecycle-specific machine double in the same describe block:

```ts
function lifecycleMachine(initialPhase: BrewPhase = {name: "idle"}) {
    const listeners = new Set<(phase: BrewPhase) => void>();
    let connected = true;
    const machine = {
        phase: initialPhase,
        isConnected: () => connected,
        disconnect: jest.fn(async () => { connected = false; }),
        note: jest.fn(),
        onPhase(listener: (phase: BrewPhase) => void) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        emitPhase(phase: BrewPhase) {
            machine.phase = phase;
            listeners.forEach((listener) => listener(phase));
        },
        reconnect() {
            connected = true;
        },
        drop() {
            connected = false;
        },
        phaseListenerCount: () => listeners.size
    };
    return machine;
}
```

Import `BrewPhase` as a type and `isActiveBrewPhase` from
`@/library/machine/Machine`.

- [ ] **Step 2: Add failing background-lease tests**

Add:

```ts
it.each([
    "waking", "sending", "readyToStart", "armed", "pressPlay",
    "grinding", "pouring", "bypass", "settling"
] satisfies BrewPhase["name"][])("retains the link during background %s", async (name) => {
    const phase: BrewPhase = name === "pouring"
        ? {name: "pouring", pour: 1, pours: 2}
        : {name} as BrewPhase;
    const machine = lifecycleMachine(phase);
    const appState = fakeAppState();
    const reconnect = jest.fn(async () => machine.reconnect());

    holdLinkAcrossAppState(machine, reconnect, {appState});
    await appState.go("background");

    expect(isActiveBrewPhase(machine.phase)).toBe(true);
    expect(machine.disconnect).not.toHaveBeenCalled();
    expect(machine.isConnected()).toBe(true);
});

it("disconnects once when a retained brew becomes terminal in background", async () => {
    const machine = lifecycleMachine({name: "pouring", pour: 1, pours: 2});
    const appState = fakeAppState();
    const reconnect = jest.fn(async () => machine.reconnect());

    holdLinkAcrossAppState(machine, reconnect, {appState});
    await appState.go("background");
    machine.emitPhase({name: "done"});
    machine.emitPhase({name: "cancelled"});
    await Promise.resolve();

    expect(machine.disconnect).toHaveBeenCalledTimes(1);
    expect(machine.isConnected()).toBe(false);
});

it("does not reconnect or replace a retained link on foreground", async () => {
    const machine = lifecycleMachine({name: "grinding"});
    const appState = fakeAppState();
    const reconnect = jest.fn(async () => machine.reconnect());

    holdLinkAcrossAppState(machine, reconnect, {appState});
    await appState.go("background");
    await appState.go("active");

    expect(reconnect).not.toHaveBeenCalled();
    expect(machine.isConnected()).toBe(true);
});

it("does not reconnect after genuine transport loss during a background brew", async () => {
    const machine = lifecycleMachine({name: "pouring", pour: 1, pours: 2});
    const appState = fakeAppState();
    const reconnect = jest.fn(async () => machine.reconnect());

    holdLinkAcrossAppState(machine, reconnect, {appState});
    await appState.go("background");
    machine.drop();
    machine.emitPhase({name: "lostContact"});
    await appState.go("active");

    expect(reconnect).not.toHaveBeenCalled();
});

it("waits for its background disconnect before reconnecting on a fast return", async () => {
    const machine = lifecycleMachine({name: "idle"});
    const appState = fakeAppState();
    let finishDisconnect: (() => void) | undefined;
    machine.disconnect.mockImplementation(() => new Promise<void>((resolve) => {
        finishDisconnect = () => {
            machine.drop();
            resolve();
        };
    }));
    const reconnect = jest.fn(async () => machine.reconnect());

    holdLinkAcrossAppState(machine, reconnect, {appState});
    await appState.go("background");
    await appState.go("active");

    expect(reconnect).not.toHaveBeenCalled();
    finishDisconnect?.();
    for (let i = 0; i < 20; i++) await Promise.resolve();

    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(machine.isConnected()).toBe(true);
});

it("releases an idle reconnect that finishes after the app backgrounds again", async () => {
    const machine = lifecycleMachine({name: "idle"});
    const appState = fakeAppState();
    let finishReconnect: (() => void) | undefined;
    const reconnect = jest.fn()
        .mockImplementationOnce(() => new Promise<void>((resolve) => {
            finishReconnect = () => {
                machine.reconnect();
                resolve();
            };
        }))
        .mockImplementation(async () => machine.reconnect());

    holdLinkAcrossAppState(machine, reconnect, {appState});
    await appState.go("background");
    await appState.go("active");
    await appState.go("background");
    finishReconnect?.();
    for (let i = 0; i < 20; i++) await Promise.resolve();

    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(machine.disconnect).toHaveBeenCalledTimes(2);
    expect(machine.isConnected()).toBe(false);

    await appState.go("active");

    expect(reconnect).toHaveBeenCalledTimes(2);
    expect(machine.isConnected()).toBe(true);
});

it("records a failed lifecycle disconnect without an unhandled rejection", async () => {
    const machine = lifecycleMachine({name: "idle"});
    machine.disconnect.mockRejectedValueOnce(new Error("radio refused"));
    const appState = fakeAppState();

    holdLinkAcrossAppState(machine, async () => machine.reconnect(), {appState});
    await appState.go("background");

    expect(machine.note).toHaveBeenCalledWith(
        "could not give the link back — radio refused"
    );
});

it("removes both app-state and phase listeners during cleanup", () => {
    const machine = lifecycleMachine();
    const appState = fakeAppState();
    const cleanup = holdLinkAcrossAppState(
        machine, async () => machine.reconnect(), {appState}
    );

    expect(appState.listenerCount()).toBe(1);
    expect(machine.phaseListenerCount()).toBe(1);

    cleanup();

    expect(appState.listenerCount()).toBe(0);
    expect(machine.phaseListenerCount()).toBe(0);
    expect(appState.remove).toHaveBeenCalledTimes(1);
});
```

Keep the existing tests for `inactive`, idle background release, foreground
reconnect, no unsolicited link, retry after a failed reconnect, and duplicate
foreground events.

- [ ] **Step 3: Run lifecycle tests and verify they fail**

Run:

```bash
npx jest hooks/__tests__/useMachine.test.ts \
  -t "holding the link across the app going away" --runInBand
```

Expected: FAIL because active brews still disconnect immediately,
`holdLinkAcrossAppState()` has no phase subscription, and its cleanup removes
only the AppState listener.

- [ ] **Step 4: Narrow the lifecycle dependency to the methods it uses**

In `hooks/useMachine.ts`, import:

```ts
import Machine, {
    isActiveBrewPhase,
    type BrewPhase
} from "@/library/machine/Machine";
```

Add above `holdLinkAcrossAppState()`:

```ts
type LinkLifecycleMachine = {
    phase: BrewPhase;
    isConnected: () => boolean;
    disconnect: () => Promise<void>;
    note: (text: string) => void;
    onPhase: (listener: (phase: BrewPhase) => void) => () => void;
};
```

Change the function's first parameter from `Machine` to
`LinkLifecycleMachine`. The production `Machine` remains structurally
compatible, while the lifecycle policy can be tested without driving BLE
protocol frames.

- [ ] **Step 5: Implement the active-brew lease**

Replace the body of `holdLinkAcrossAppState()` with:

```ts
const appState = options.appState ?? (AppState as unknown as AppStateLike);

let released = false;
let reconnecting = false;
let backgrounded = false;
let retainedForBrew = false;
let releasePromise: Promise<void> | null = null;

function release(note: string): void {
    if (!machine.isConnected() || released) return;
    released = true;
    retainedForBrew = false;
    machine.note(note);
    releasePromise = machine.disconnect()
        .catch((error) => {
            machine.note(`could not give the link back — ${(error as Error).message}`);
        })
        .finally(() => {
            releasePromise = null;
        });
}

const phaseSubscription = machine.onPhase((phase) => {
    if (!backgrounded || !retainedForBrew || isActiveBrewPhase(phase)) return;

    // A real transport loss reaches `lostContact` after the radio is already
    // gone. Do not mark that as our release: foregrounding must not reconnect
    // into a brew whose live state is unknown.
    if (!machine.isConnected()) {
        retainedForBrew = false;
        return;
    }

    release("brew ended in the background — giving the link back");
});

const appStateSubscription = appState.addEventListener("change", (next) => {
    if (next === "background") {
        backgrounded = true;
        if (!machine.isConnected()) return;

        if (isActiveBrewPhase(machine.phase)) {
            retainedForBrew = true;
            released = false;
            machine.note("active brew went to the back — keeping the link");
            return;
        }

        release("app went to the back — giving the link back");
        return;
    }

    if (next !== "active") return;
    backgrounded = false;
    retainedForBrew = false;
    if (!released || reconnecting) return;

    reconnecting = true;
    machine.note("app came to the front — taking the link back");
    void (async () => {
        try {
            await releasePromise;
            if (machine.isConnected()) {
                released = false;
                return;
            }
            await reconnect();
            if (backgrounded) {
                released = false;
                if (isActiveBrewPhase(machine.phase)) {
                    retainedForBrew = true;
                    machine.note("active brew is in the back — keeping the restored link");
                    return;
                }
                release("reconnect finished in the back — giving the link back");
                return;
            }
            released = false;
        } catch (error) {
            machine.note(`could not take it back — ${(error as Error).message}`);
        } finally {
            reconnecting = false;
        }
    })();
});

return () => {
    appStateSubscription.remove();
    phaseSubscription();
};
```

Do not add a timer. Do not reconnect after `lostContact`. Do not create a new
`Machine` when foregrounding.

- [ ] **Step 6: Run lifecycle and machine tests**

Run:

```bash
npx jest hooks/__tests__/useMachine.test.ts \
  library/machine/__tests__/Machine.test.ts --runInBand
```

Expected: PASS. Idle backgrounding still releases and reconnects as before;
every active phase retains; a background terminal phase disconnects once;
retained foregrounding does nothing; real loss does not reconnect; cleanup
removes both listeners; and a fast foreground return waits for the asynchronous
disconnect before reconnecting. A reconnect that finishes after the app has
backgrounded again is immediately released unless the machine has entered an
active brew, and disconnect failures are recorded without an unhandled
rejection.

- [ ] **Step 7: Commit the background BLE lease**

```bash
git add hooks/useMachine.ts hooks/__tests__/useMachine.test.ts
git commit -m "Keep BLE through active background brews" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Declare the native background mode and release version

**Files:**
- Create: `app/__tests__/native-config.test.ts`
- Modify: `app.json`

- [ ] **Step 1: Add failing native-configuration tests**

Create `app/__tests__/native-config.test.ts`:

```ts
import appConfig from "@/app.json";

type PluginEntry = string | [string, Record<string, unknown>];

describe("native release configuration", () => {
    it("uses app version 1.5.1 for the native background change", () => {
        expect(appConfig.expo.version).toBe("1.5.1");
        expect(appConfig.expo.runtimeVersion.policy).toBe("appVersion");
    });

    it("allows iOS central-role Bluetooth events in the background", () => {
        expect(appConfig.expo.ios.infoPlist).toEqual({
            UIBackgroundModes: ["bluetooth-central"]
        });
    });

    it("does not advertise an unused BLE plugin modes option", () => {
        const plugins = appConfig.expo.plugins as PluginEntry[];
        const entry = plugins.find(
            (plugin): plugin is [string, Record<string, unknown>] =>
                Array.isArray(plugin) && plugin[0] === "react-native-ble-manager"
        );

        expect(entry).toBeDefined();
        expect(entry?.[1]).not.toHaveProperty("modes");
    });
});
```

- [ ] **Step 2: Run the configuration test and verify it fails**

Run:

```bash
npx jest app/__tests__/native-config.test.ts --runInBand
```

Expected: FAIL because the version is 1.5.0, `ios.infoPlist` is absent, and the
BLE plugin still contains `"modes": []`.

- [ ] **Step 3: Update `app.json`**

Change:

```json
"version": "1.5.0"
```

to:

```json
"version": "1.5.1"
```

Under `expo.ios`, add:

```json
"infoPlist": {
  "UIBackgroundModes": [
    "bluetooth-central"
  ]
}
```

In the `react-native-ble-manager` plugin options, delete only:

```json
"modes": [],
```

Keep `neverForLocation` and `bluetoothAlwaysPermission` unchanged. Do not add
`bluetooth-peripheral`, background fetch, a timer, or restoration identifiers.

- [ ] **Step 4: Run the configuration and deep-link tests**

Run:

```bash
npx jest app/__tests__/native-config.test.ts \
  app/__tests__/native-intent.test.ts --runInBand
```

Expected: PASS. The existing scheme-order invariant remains intact.

- [ ] **Step 5: Inspect Expo's resolved native configuration**

Run:

```bash
npx expo config --type prebuild > .build7-expo-config.json
node -e '
const c = require("./.build7-expo-config.json");
console.log(JSON.stringify({
  version: c.version,
  backgroundModes: c.ios?.infoPlist?.UIBackgroundModes
}, null, 2));
'
rm .build7-expo-config.json
```

Expected:

```json
{
  "version": "1.5.1",
  "backgroundModes": [
    "bluetooth-central"
  ]
}
```

- [ ] **Step 6: Commit the native release configuration**

```bash
git add app.json app/__tests__/native-config.test.ts
git commit -m "Enable background brew monitoring on iOS" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Run repository validation

**Files:**
- No source changes expected.

- [ ] **Step 1: Run the focused regression set together**

Run:

```bash
npx jest library/machine/__tests__/Machine.test.ts \
  hooks/__tests__/useMachine.test.ts \
  app/__tests__/brew.test.tsx \
  app/__tests__/native-config.test.ts \
  app/__tests__/native-intent.test.ts \
  components/__tests__/BrewStageRung.test.tsx \
  components/__tests__/BrewStageLadder.test.tsx \
  library/brew/__tests__/bands.test.ts --runInBand
```

Expected: PASS with no snapshots updated.

- [ ] **Step 2: Run the complete CI-equivalent checks**

Run:

```bash
npm run typecheck && npm run lint && npm test -- --runInBand && npx expo-doctor
```

Expected:

- TypeScript exits 0.
- ESLint exits 0; the repository's deliberate exhaustive-deps warnings may
  remain, but no new warning should come from the changed files.
- The complete Jest suite passes.
- Expo Doctor reports all checks passed.

- [ ] **Step 3: Inspect the complete implementation diff**

Run:

```bash
git diff --check
git status --short
git --no-pager diff HEAD~5..HEAD -- \
  library/machine/Machine.ts \
  library/machine/__tests__/Machine.test.ts \
  hooks/useMachine.ts \
  hooks/__tests__/useMachine.test.ts \
  app/brew.tsx \
  app/__tests__/brew.test.tsx \
  components/BrewStageRung.tsx \
  components/__tests__/BrewStageRung.test.tsx \
  components/__tests__/BrewStageLadder.test.tsx \
  constants/brewCopy.ts \
  app.json \
  app/__tests__/native-config.test.ts
```

Expected: no whitespace errors; only the planned lifecycle, layout, wave, test,
and native configuration changes are present.

---

### Task 7: Validate the behavior on a physical iPhone and xBloom machine

**Files:**
- No committed source changes expected.

- [ ] **Step 1: Generate and install the 1.5.1 native app**

Run:

```bash
npx expo prebuild --clean
npx expo run:ios --device
```

Select the user's connected iPhone when Expo prompts. Expected: that physical
iPhone installs and launches XBRW++ 1.5.1.
Do not use a simulator: it cannot validate BLE background delivery.

- [ ] **Step 2: Confirm the generated Info.plist**

Locate the generated application plist:

```bash
find ios -name Info.plist -path "*XBRW*" -print
```

Run `/usr/libexec/PlistBuddy -c "Print :UIBackgroundModes"` against the
application target plist printed by that command, not a Pods plist or the share
extension plist.

Expected: the application target plist lists `bluetooth-central` and no
`bluetooth-peripheral`.

- [ ] **Step 3: Validate the ladder and agitation rendering**

On the physical iPhone:

1. Open a recipe whose ladder fits without scrolling.
2. Confirm the bottom rung is fully visible with no roughly five-point crop.
3. Start the brew and watch at least one active-stage transition.
4. Confirm the ladder makes no corrective scroll or top-edge shift.
5. Inspect recipes producing short, medium, and tall rung bars.
6. Confirm every agitation marker has the same short wavelength and remains
   within its rung height.

Expected: the ladder remains stationary when it fits, and taller marks show
more cycles rather than stretched cycles.

- [ ] **Step 4: Validate active-brew background continuity**

With a real xBloom machine:

1. Start a multi-stage brew and wait until grinding or pouring.
2. Switch to another app for long enough to cross at least one machine phase or
   pour-stage notification.
3. Return to XBRW++.
4. Confirm the same live brew remains open with continuous phase, active stage,
   trace, water, cup weight, and elapsed time.
5. Repeat while leaving XBRW++ backgrounded through the first ENJOY signal.
6. Return and confirm the completed summary is present.
7. Open another BLE client and confirm XBRW++ released the machine after the
   terminal phase.

Expected: ordinary app switching does not interrupt an active brew; terminal
completion releases the BLE slot.

- [ ] **Step 5: Validate idle release and real-loss boundaries**

1. Connect while no brew is active, background XBRW++, and confirm another app
   can take the BLE connection immediately.
2. Return to XBRW++ and confirm its existing bounded reconnect restores the
   remembered machine.
3. During another active brew, move the phone out of range or disable Bluetooth
   long enough to cause a genuine transport loss.
4. Confirm XBRW++ reports `Lost contact. The machine is still brewing.` and
   does not pretend it restored the in-flight brew on foreground.

Expected: idle behavior is unchanged, while genuine transport loss remains the
existing `lostContact` path.

- [ ] **Step 6: Record the device result**

If every check passes, add a short commit message body or release note to the
eventual release commit/PR stating:

```text
Device-tested on a physical iPhone with a real xBloom machine:
- active brew survived app switching and stage notifications
- background completion released BLE
- idle backgrounding still released and reconnected
- ladder and agitation geometry remained stable
```

If any check fails, do not build for TestFlight. Return to the relevant task,
add a regression test for the observed failure, fix it, and rerun Tasks 6-7.

---

### Task 8: Build version 1.5.1 build 7 and submit to TestFlight

**Files:**
- No source changes expected unless EAS reports a release-blocking
  configuration problem.

- [ ] **Step 1: Confirm the release commit set and clean worktree**

Run:

```bash
git status --short
git log -8 --oneline --decorate
```

Expected: no uncommitted source changes. The recent history contains the five
implementation commits plus the design and plan commits.

- [ ] **Step 2: Start the production build with automatic submission**

Run:

```bash
npx eas-cli@latest build --platform ios --profile production --auto-submit
```

Expected:

- Expo app version: `1.5.1`.
- The remotely managed iOS build number advances from 6 to 7.
- A production iOS build is queued.
- The linked `production` submit profile targets App Store Connect app
  `6806339475`.

Do not add `ios.buildNumber` to `app.json`; `eas.json` deliberately uses remote
version management and `production.autoIncrement`.

- [ ] **Step 3: Wait for both build and submission to finish**

Use the build and submission URLs printed by EAS. The newest iOS build can also
be checked non-interactively:

```bash
npx eas-cli@latest build:list --platform ios --limit 1 --non-interactive
```

Expected: the build reaches `finished` and the submission reaches `finished`.
Capture both IDs for the handoff.

- [ ] **Step 4: Confirm TestFlight processing**

Check App Store Connect/TestFlight for version 1.5.1 build 7.

Expected: Apple shows the uploaded build as processing or ready for internal
testing. App Store processing is allowed to continue after EAS submission
finishes; an EAS submission failure is not.

- [ ] **Step 5: Report the release identifiers**

The completion handoff must state version 1.5.1, build 7, the actual EAS build
ID, the actual EAS submission ID, and whether TestFlight is processing or ready
for testing.

Do not claim release completion until both EAS build and EAS submission have
finished successfully.

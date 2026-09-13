# M4 device round two — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the six design decisions in `docs/superpowers/specs/2026-09-05-m4-device-round-two-design.md`, closing the design-dependent half of #92 and all of #88.

**Architecture:** Every change is pushed down into a pure function or a pure state machine wherever one exists, and the React layer is left as thin wiring. New logic lands in `constants/colors.ts` (`cupLineFor`), `hooks/useRefreshRequest.ts`, `library/brew/bands.ts` and a new `components/HatchFill.tsx`. Presentation changes touch `BrewTrace`, `BrewStageRung`, `BrewStageLadder`, `HomeHeader`, `app/index.tsx`, `app/brew.tsx` and `hooks/useBrewRun.ts`.

**Tech Stack:** Expo SDK 57, React Native, TypeScript, Tamagui, react-native-svg, Reanimated 4, Jest + @testing-library/react-native.

---

## Conventions that apply to every task

- **Colour comes from `constants/colors.ts`.** No hex literals and no CSS colour names anywhere in `app/` or `components/`.
- **The React Compiler is on.** Do not hand-write `useMemo`/`useCallback`. Do not read whole `props` inside a hook — destructure first.
- **`@testing-library/react-native` v14 `render` and `fireEvent` are async.** Always `await` them. Always render component tests through `renderWithProviders` from `test-utils/render.tsx`.
- **Do not call `unmount()` between renders inside a single test.** It breaks subsequent queries. Multiple live mounts in one test are fine as long as each is queried through its own returned queries (`r.getByTestId(...)`), not `screen`.
- **`react-hooks/set-state-in-effect` is an error here.** State may be set from inside a timer callback registered by an effect, but never from the effect body.
- **Comment voice:** explain *why*, not *what*. Say what the code now does and what fault shaped it.
- **Commit voice:** short declarative present-tense subject describing the world as it now is; body explaining the root cause and why the fix is shaped that way; then the trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.

**The gate, run before every commit:**

```bash
npm run typecheck && npm run lint && npm test
```

Expected: typecheck clean (npm notice lines only), lint `0 errors`, 6 baseline `require()` warnings, and all suites passing. Baseline at the start of this plan is **2032 tests / 127 suites**.

**Mutation testing is required.** After each task's tests pass, break the thing the new test claims to guard, re-run the test, confirm it fails, then restore. Report which mutation each new assertion caught.

---

## File structure

| File | Responsibility | Status |
|---|---|---|
| `constants/colors.ts` | All colour, plus `mix` and the new `cupLineFor` | Modify |
| `components/BrewTrace.tsx` | Draws the trace and its legend | Modify |
| `components/HatchFill.tsx` | Diagonal stripes at a given fill fraction | **Create** |
| `components/BrewStageRung.tsx` | One stage's lane | Modify |
| `components/BrewStageLadder.tsx` | Stacks the rungs | Modify |
| `library/brew/bands.ts` | Shares the brew screen's flexible height | Modify |
| `hooks/useRefreshRequest.ts` | The refresh control's state machine | **Create** |
| `components/MachinePanel.tsx` | The machine readings panel | **Create** (renamed from `MachinePopover.tsx`) |
| `components/HomeHeader.tsx` | The home header row, and now the panel below it | Modify |
| `app/index.tsx` | Wires the panel, vitals and refresh together | Modify |
| `app/brew.tsx` | Places the trace and ladder | Modify |
| `hooks/useBrewRun.ts` | Publishes a run's phase and samples | Modify |

---

## Task 1: `cupLineFor` — the cup line's colour, derived and guarded

**Files:**
- Modify: `constants/colors.ts` (append after `mix`, which ends around line 200)
- Test: `constants/__tests__/colors.test.ts` (create if absent; if it exists, append a `describe`)

- [ ] **Step 1: Write the failing test**

Create or append to `constants/__tests__/colors.test.ts`:

```ts
import {accents, cupLineFor, palette, AMBER_GUARD, CUP_LIGHTNESS_FLOOR}
    from "@/constants/colors";

/** Hue in degrees, 0-360. Local to the test so it cannot share a bug with the source. */
function hueOf(hex: string): number {
    const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
    const max = Math.max(r, g, b);
    const delta = max - Math.min(r, g, b);
    if (delta === 0) return 0;
    const h = max === r ? 60 * (((g - b) / delta) % 6)
            : max === g ? 60 * ((b - r) / delta + 2)
            :             60 * ((r - g) / delta + 4);
    return (h + 360) % 360;
}

/** Lightness, 0-1. */
function lightnessOf(hex: string): number {
    const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
    return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
}

/** Shortest distance between two hues, in degrees. */
function apart(a: number, b: number): number {
    return Math.abs(((a - b + 540) % 360) - 180);
}

const every = [...accents.coffee, ...accents.tea];

describe("cupLineFor", () => {
    it("returns a six-digit hex for every accent", () => {
        for (const accent of every) {
            expect(cupLineFor(accent)).toMatch(/^#[0-9a-f]{6}$/);
        }
    });

    it("is never the accent it came from", () => {
        for (const accent of every) {
            expect(cupLineFor(accent)).not.toBe(accent.toLowerCase());
        }
    });

    it("puts the cup line opposite the accent", () => {
        // Peach is far from amber, so nothing pushes it off its complement.
        expect(apart(hueOf(cupLineFor("#F0B98E")), hueOf("#F0B98E")))
            .toBeGreaterThan(175);
    });

    it("keeps every cup line clear of amber", () => {
        const warn = hueOf(palette.warn);
        for (const accent of every) {
            expect(apart(hueOf(cupLineFor(accent)), warn))
                .toBeGreaterThanOrEqual(AMBER_GUARD - 1);
        }
    });

    it("pushes Sky's complement out of the amber band", () => {
        // Sky's complement lands at 33 degrees, ten from amber. Guarded, it
        // comes out coral at about 18.
        const warn = hueOf(palette.warn);
        expect(apart(hueOf(cupLineFor("#9FC3F0")), warn)).toBeGreaterThanOrEqual(24);
        expect(hueOf(cupLineFor("#9FC3F0"))).toBeLessThan(warn);
    });

    it("leaves the two next-nearest accents where they fall", () => {
        // Ice at 16 degrees and Lilac at 72 are 27 and 29 clear of amber, so
        // the guard must not fire for them. If it did, they would land exactly
        // on the band edge instead.
        const warn = hueOf(palette.warn);
        expect(apart(hueOf(cupLineFor("#A6D6E8")), warn)).toBeGreaterThan(25.5);
        expect(apart(hueOf(cupLineFor("#BDB2E8")), warn)).toBeGreaterThan(25.5);
    });

    it("never returns a colour too dark to read on black", () => {
        for (const accent of every) {
            expect(lightnessOf(cupLineFor(accent)))
                .toBeGreaterThanOrEqual(CUP_LIGHTNESS_FLOOR - 0.001);
        }
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest constants/__tests__/colors.test.ts
```

Expected: FAIL — `cupLineFor is not a function` (or a module export error for `AMBER_GUARD`).

- [ ] **Step 3: Implement it**

Append to `constants/colors.ts`, after `mix`:

```ts
/**
 * `warn`'s hue, in degrees.
 *
 * Stated rather than derived so the guard below cannot silently follow `warn`
 * somewhere else: if the amber is ever retuned, this is the second place that
 * has to agree, and the colour tests say so.
 */
const WARN_HUE = 43;

/**
 * How near amber a derived hue may come before it is pushed out.
 *
 * Deliberately tight. The trace spends hue on meaning -- the accent is this
 * recipe, amber is the machine stopped -- and a wider band would start moving
 * colours that are already clear. At 25 degrees the guard fires for exactly one
 * of the twelve accents (Sky, whose complement lands ten degrees from amber);
 * the next nearest are Ice at 27 and Lilac at 29, and both are left alone.
 */
export const AMBER_GUARD = 25;

/** Below this a derived colour is too dark to read as a line on `base`. */
export const CUP_LIGHTNESS_FLOOR = 0.6;

function toHsl(hex: string): {h: number; s: number; l: number} {
    const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const delta = max - min;
    if (delta === 0) return {h: 0, s: 0, l};
    const s = delta / (1 - Math.abs(2 * l - 1));
    const h = max === r ? 60 * (((g - b) / delta) % 6)
            : max === g ? 60 * ((b - r) / delta + 2)
            :             60 * ((r - g) / delta + 4);
    return {h: (h + 360) % 360, s, l};
}

function toHex(h: number, s: number, l: number): string {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    const [r, g, b] =
          h < 60  ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
        : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return `#${[r, g, b]
        .map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0"))
        .join("")}`;
}

/**
 * The colour of the cup line, for a recipe drawn in `accent`.
 *
 * Derived rather than chosen, because it cannot be chosen: the accent is one of
 * twelve the user picks between, two of which are themselves orange, so any
 * fixed contrasting colour collides with somebody's recipe. The complement of
 * the accent never collides with it, whichever one it is.
 *
 * Saturation is held and lightness is held with a floor, so the cup line is as
 * vivid as the recipe it belongs to and still legible on black. Only the hue
 * moves -- and only far enough to clear amber, which already means the machine
 * stopped and is not available to mean anything else.
 */
export function cupLineFor(accent: string): string {
    const {h, s, l} = toHsl(accent);
    let hue = (h + 180) % 360;
    // Signed, so the push is to the nearer edge of the band rather than always
    // to the same one -- a complement just below amber must not jump over it.
    const drift = ((hue - WARN_HUE + 540) % 360) - 180;
    if (Math.abs(drift) < AMBER_GUARD) {
        hue = ((drift >= 0 ? WARN_HUE + AMBER_GUARD : WARN_HUE - AMBER_GUARD) + 360) % 360;
    }
    return toHex(hue, s, Math.max(CUP_LIGHTNESS_FLOOR, l));
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx jest constants/__tests__/colors.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Mutation-test the guard**

Set `AMBER_GUARD = 0` and re-run. Expected: *"pushes Sky's complement out of the amber band"* and *"keeps every cup line clear of amber"* both fail. Restore.

Change `drift >= 0 ? ... : ...` to always `WARN_HUE + AMBER_GUARD` and re-run. Expected: *"pushes Sky's complement out of the amber band"* fails on its second assertion (Sky would land above amber, not below). Restore.

Set `CUP_LIGHTNESS_FLOOR = 0` and change `Math.max(CUP_LIGHTNESS_FLOOR, l)` to `l * 0.4`; re-run. Expected: the lightness test fails. Restore.

- [ ] **Step 6: Run the gate and commit**

```bash
npm run typecheck && npm run lint && npm test
git add constants/colors.ts constants/__tests__/colors.test.ts
git commit
```

Subject: `The cup line's colour is derived from the accent, and kept off amber`

---

## Task 2: The trace draws the cup line in that colour

**Files:**
- Modify: `components/BrewTrace.tsx` (two `trace-cup` `Path`s at ~125 and ~196; the legend at ~218)
- Test: `components/__tests__/BrewTrace.test.tsx`

- [ ] **Step 1: Write the failing test**

Append inside the existing top-level `describe` in `components/__tests__/BrewTrace.test.tsx`. The file already has a `draw()` helper and a `TEST_ACCENT` of `accents.coffee[1]` (Peach), and a `samples(...)` builder — use them.

```ts
it("draws the cup line in the accent's derived colour, not in muted", async () => {
    const {getByTestId} = await draw({
        samples: samples([0, 0, 0], [30, 60, 20], [70, 160, 120])
    });

    const cup = getByTestId("trace-cup");
    expect(cup.props.stroke).toBe(cupLineFor(TEST_ACCENT));
    expect(cup.props.stroke).not.toBe(palette.muted);
});

it("moves the cup line with the accent", async () => {
    // Sky is the one accent whose complement the amber guard pushes.
    const {getByTestId} = await draw({
        accent: "#9FC3F0",
        samples: samples([0, 0, 0], [30, 60, 20], [70, 160, 120])
    });

    expect(getByTestId("trace-cup").props.stroke).toBe(cupLineFor("#9FC3F0"));
});

it("draws the cup line in that colour in compact mode too", async () => {
    const {getByTestId} = await draw({
        compact: true,
        height: 80,
        samples: samples([0, 0, 0], [30, 60, 20], [70, 160, 120])
    });

    expect(getByTestId("trace-cup").props.stroke).toBe(cupLineFor(TEST_ACCENT));
});
```

Add `cupLineFor` to the file's existing `@/constants/colors` import.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest components/__tests__/BrewTrace.test.tsx -t "cup line"
```

Expected: FAIL — received `#6E6E6E`.

- [ ] **Step 3: Implement it**

In `components/BrewTrace.tsx`, add to the import from `@/constants/colors`:

```ts
import {cupLineFor, palette} from "@/constants/colors";
```

Inside the component body, beside where `cupPath` is computed (~line 90), add:

```ts
// Derived here rather than at each use so the compact render, the full render
// and the legend cannot drift apart.
const cupColour = cupLineFor(accent);
```

In **both** `trace-cup` `Path` elements (~125 and ~196), replace:

```tsx
stroke={palette.muted}
strokeWidth={1.5}
```

with:

```tsx
stroke={cupColour}
strokeWidth={2}
```

In the legend row (~219), replace:

```tsx
<LegendItem colour={palette.muted} label="CUP" dotted />
```

with:

```tsx
<LegendItem colour={cupColour} label="CUP" dotted />
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest components/__tests__/BrewTrace.test.tsx
```

Expected: PASS, whole file.

- [ ] **Step 5: Mutation-test**

Change the full-render `Path` back to `palette.muted` and re-run. Expected: the non-compact test fails, the compact one still passes — which is why there are two. Restore. Repeat for the compact `Path`. Restore.

- [ ] **Step 6: Run the gate and commit**

Subject: `The cup line can be seen`

---

## Task 3: `HatchFill` — diagonal stripes that fill part-way

**Files:**
- Create: `components/HatchFill.tsx`
- Test: `components/__tests__/HatchFill.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/HatchFill.test.tsx`:

```tsx
import React from "react";

import HatchFill from "@/components/HatchFill";
import {renderWithProviders} from "@/test-utils/render";

describe("HatchFill", () => {
    it("draws faint stripes across the whole width", async () => {
        const r = await renderWithProviders(
            <HatchFill testID="hatch" dim="#223344" bright="#9FC3F0"
                       fill={0.4} height={20} />
        );

        expect(r.getByTestId("hatch-dim").props.width).toBe("100%");
    });

    it("clips the bright stripes to the fill fraction", async () => {
        const r = await renderWithProviders(
            <HatchFill testID="hatch" dim="#223344" bright="#9FC3F0"
                       fill={0.4} height={20} />
        );

        expect(r.getByTestId("hatch-bright").props.width).toBe("40%");
    });

    it("draws no bright stripes at all before the wait has begun", async () => {
        const r = await renderWithProviders(
            <HatchFill testID="hatch" dim="#223344" bright="#9FC3F0"
                       fill={0} height={20} />
        );

        expect(r.queryByTestId("hatch-bright")).toBeNull();
    });

    it("clamps a fill past the end", async () => {
        const r = await renderWithProviders(
            <HatchFill testID="hatch" dim="#223344" bright="#9FC3F0"
                       fill={1.8} height={20} />
        );

        expect(r.getByTestId("hatch-bright").props.width).toBe("100%");
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest components/__tests__/HatchFill.test.tsx
```

Expected: FAIL — cannot resolve `@/components/HatchFill`.

- [ ] **Step 3: Implement it**

Create `components/HatchFill.tsx`:

```tsx
import React, {useId} from "react";
import Svg, {Defs, Path, Pattern, Rect} from "react-native-svg";

/** The distance between one stripe and the next, in points. */
const PITCH = 6;

/** How thick a stripe is. A third of the pitch reads as texture, not as fill. */
const STRIPE = 2;

type Props = {
    /** The stripe colour across the whole width. */
    dim: string;
    /** The stripe colour over the elapsed part. */
    bright: string;
    /** 0 to 1: how much of the width has elapsed. */
    fill: number;
    height: number;
    testID?: string;
};

/**
 * Diagonal stripes, brightening from the left as something elapses.
 *
 * Drawn with an SVG pattern rather than a row of skewed views because the lane
 * a hatch sits in is `flex`-sized from its segment's seconds: nothing in the
 * tree knows how wide it will be, so nothing can work out how many stripes to
 * emit. A pattern fills whatever size it is handed without being told.
 *
 * The tile draws three strokes, not one. A single diagonal leaves a seam at
 * each tile corner where the line has left one tile and not yet entered the
 * next; the two short strokes fill exactly those corners.
 */
export default function HatchFill({dim, bright, fill, height, testID}: Props) {
    // Two patterns, not one recoloured: both layers are on screen at once.
    const id = useId().replace(/[^a-zA-Z0-9]/g, "");
    const dimId = `hatch-dim-${id}`;
    const brightId = `hatch-bright-${id}`;
    const stripes = `M-1 1 l2 -2 M0 ${PITCH} l${PITCH} -${PITCH} `
        + `M${PITCH - 1} ${PITCH + 1} l2 -2`;
    const shown = Math.max(0, Math.min(1, fill));

    return (
        <Svg width="100%" height={height}>
            <Defs>
                <Pattern id={dimId} patternUnits="userSpaceOnUse"
                         width={PITCH} height={PITCH}>
                    <Path d={stripes} stroke={dim} strokeWidth={STRIPE} />
                </Pattern>
                <Pattern id={brightId} patternUnits="userSpaceOnUse"
                         width={PITCH} height={PITCH}>
                    <Path d={stripes} stroke={bright} strokeWidth={STRIPE} />
                </Pattern>
            </Defs>
            <Rect testID={testID === undefined ? undefined : `${testID}-dim`}
                  x={0} y={0} width="100%" height={height}
                  fill={`url(#${dimId})`} />
            {shown > 0 && (
                <Rect testID={testID === undefined ? undefined : `${testID}-bright`}
                      x={0} y={0} width={`${shown * 100}%`} height={height}
                      fill={`url(#${brightId})`} />
            )}
        </Svg>
    );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx jest components/__tests__/HatchFill.test.tsx
```

Expected: PASS, 4 tests. If `width` arrives as a number rather than the string `"40%"`, adjust the assertions to match what react-native-svg actually passes through — read the received value from the failure and pin *that*, but keep the three cases distinct.

- [ ] **Step 5: Mutation-test**

Remove the `Math.min(1, ...)` clamp; expected: *"clamps a fill past the end"* fails. Restore.
Change `shown > 0 &&` to always render; expected: *"draws no bright stripes at all"* fails. Restore.
Give the bright `Rect` `width="100%"`; expected: *"clips the bright stripes"* fails. Restore.

- [ ] **Step 6: Run the gate and commit**

Subject: `Stripes that can fill part-way, at any width`

---

## Task 4: A wait is striped, and cannot merge with the water beside it

**Files:**
- Modify: `components/BrewStageRung.tsx` (`fillColour` at ~74; the segment map at ~175-203)
- Test: `components/__tests__/BrewStageRung.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `components/__tests__/BrewStageRung.test.tsx`. The file already has a `draw()` helper whose default `pour` is `stage()` — a 70 ml pour with a 20 s pause — so `rungSegments` emits exactly two segments, water then pause. Note that `pauseElapsed` only counts once the pour is complete, so the wait can only be part-elapsed when `delivered` has reached 70.

```tsx
it("never paints a wait the same as the water beside it", async () => {
    // The original fault: `rungGeometry` distinguished the two and the paint
    // threw the distinction away, so an active stage read as one long bar.
    const {getByTestId, queryByTestId} =
        await draw({state: "active", delivered: 40, pauseElapsed: 0});

    expect(getByTestId("segment-fill-0")).toBeTruthy();
    expect(queryByTestId("segment-fill-1")).toBeNull();
    expect(getByTestId("segment-hatch-1-dim")).toBeTruthy();
});

it("shows a wait faintly before it has begun", async () => {
    const {getByTestId, queryByTestId} =
        await draw({state: "pending", delivered: 0, pauseElapsed: 0});

    expect(getByTestId("segment-hatch-1-dim")).toBeTruthy();
    expect(queryByTestId("segment-hatch-1-bright")).toBeNull();
});

it("brightens the stripes as the wait elapses", async () => {
    const {getByTestId} =
        await draw({state: "active", delivered: 70, pauseElapsed: 10});

    expect(getByTestId("segment-hatch-1-bright")).toBeTruthy();
});

it("paints the faint stripes differently from the bright ones", async () => {
    const {getByTestId} =
        await draw({state: "active", delivered: 70, pauseElapsed: 10});

    expect(getByTestId("segment-hatch-1-dim").props.fill)
        .not.toBe(getByTestId("segment-hatch-1-bright").props.fill);
});

it("leaves a gap between one segment and the next", async () => {
    const {getByTestId} =
        await draw({state: "active", delivered: 40, pauseElapsed: 0});

    const flat = (id: string) =>
        StyleSheet.flatten(getByTestId(id).props.style) as {marginRight?: number};
    expect(flat("segment-0").marginRight).toBe(SEGMENT_GAP);
    expect(flat("segment-1").marginRight).toBe(0);
});
```

Add to the test file's imports:

```ts
import {StyleSheet} from "react-native";
import BrewStageRung, {SEGMENT_GAP} from "@/components/BrewStageRung";
```

(the `BrewStageRung` default import already exists — add the named one to it).

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest components/__tests__/BrewStageRung.test.tsx -t "wait"
```

Expected: FAIL — `SEGMENT_GAP` is not exported, and `segment-hatch-1-dim` does not exist.

- [ ] **Step 3: Implement it**

In `components/BrewStageRung.tsx`:

Add to the imports:

```ts
import HatchFill from "@/components/HatchFill";
import {mix, palette} from "@/constants/colors";
```

(keep whatever else the file already imports from `@/constants/colors`).

Add near the other module constants:

```ts
/**
 * The space between one segment and the next.
 *
 * Water and wait were previously flush, and with the wait filled in the same
 * solid accent they read as one undifferentiated bar. The gap is taken out of
 * the lane rather than out of the shared time scale: every segment loses the
 * same 3 pt, so their widths stay proportional to their seconds.
 */
export const SEGMENT_GAP = 3;

/** How far a faint stripe is mixed back toward the background. */
const HATCH_DIM = 0.62;
```

Replace `fillColour` (~74) with:

```ts
function fillColour(kind: Segment["kind"], accent: string, done: boolean): string {
    if (kind === "stall") return palette.warn;
    return done ? palette.muted : accent;
}

/**
 * The two stripe colours for a wait.
 *
 * Faint across the whole wait from the moment the ladder is drawn, so the rests
 * in a recipe are visible before it runs and the ladder reads as a plan and not
 * only as a progress bar; accent over the part that has elapsed.
 */
function hatchColours(accent: string, done: boolean): {dim: string; bright: string} {
    const bright = done ? palette.muted : accent;
    return {dim: mix(bright, palette.base, HATCH_DIM), bright};
}
```

In the segment map (~175), add the gap to the track's style, and branch the contents on the kind. Replace the whole `segments.map(...)` block with:

```tsx
{segments.map((segment, i) => {
    const fraction = Math.max(0, Math.min(1, segment.fill));
    const hatch = hatchColours(accent, done);
    return (
        <View
            key={`segment-${i}`}
            testID={`segment-${i}`}
            style={{
                flex: Math.max(segment.seconds, 0.001),
                height: barHeight,
                marginRight: i < segments.length - 1 ? SEGMENT_GAP : 0,
                borderRadius: radius,
                borderWidth: segment.kind === "pause" ? 1 : 0,
                borderStyle: segment.kind === "pause" ? "dashed" : "solid",
                borderColor: palette.line,
                backgroundColor: segment.kind === "stall"
                    ? palette.warn
                    : palette.raised,
                overflow: "hidden",
                flexDirection: "row"
            }}
        >
            {segment.kind === "pause" ? (
                <HatchFill
                    testID={`segment-hatch-${i}`}
                    dim={hatch.dim}
                    bright={hatch.bright}
                    fill={fraction}
                    height={barHeight}
                />
            ) : (
                <>
                    <View
                        testID={`segment-fill-${i}`}
                        style={{
                            flex: fraction,
                            height: barHeight,
                            borderRadius: radius,
                            backgroundColor: fillColour(segment.kind, accent, done)
                        }}
                    />
                    <View style={{flex: 1 - fraction}} />
                </>
            )}
        </View>
    );
})}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest components/__tests__/BrewStageRung.test.tsx
```

Expected: PASS, whole file. **Older tests in this file may assert `segment-fill-N` on a pause segment** — those assertions described the bug and must be rewritten to assert the hatch instead. Rewriting them is correct here; deleting them is not.

- [ ] **Step 5: Mutation-test**

Render a pause segment through the solid branch again (change the ternary condition to `false`); expected: *"never paints a wait the same as the water"* and both stripe tests fail. Restore.
Set `SEGMENT_GAP = 0`; expected: the gap test fails. Restore.
Make `hatchColours` return `{dim: bright, bright}`; expected: *"paints the faint stripes differently from the bright ones"* fails. Restore.
Set `HATCH_DIM = 0`; expected: the same test fails. Restore.

- [ ] **Step 6: Run the gate and commit**

Subject: `A wait looks like waiting, not like pouring`

---

## Task 5: `allocateBands` offers the slack twice

**Files:**
- Modify: `library/brew/bands.ts`
- Test: `library/brew/__tests__/bands.test.ts`

- [ ] **Step 1: Update the existing tests and add the new ones**

Three existing tests pin the old single-pass behaviour and must change. (Note: #88 predicted that *"gives everything left to the spacing"* would need rewriting. It does not — it still holds. These three do.)

In `library/brew/__tests__/bands.test.ts`, change the import line to:

```ts
import {allocateBands, BAR_CAP, BAR_FLOOR, BAR_MAX, GAP_CAP, GAP_FLOOR,
        GAP_MAX, TRACE_CAP, TRACE_FLOOR, TRACE_MAX} from "@/library/brew/bands";
```

Replace *"never grows the trace past its cap"* with:

```ts
it("never grows the trace past its ceiling", () => {
    const stages = 4;
    const room = TRACE_FLOOR + stages * (BAR_FLOOR + GAP_FLOOR) + 400;

    expect(allocateBands(room, stages).traceHeight).toBe(TRACE_MAX);
});
```

Replace *"never grows a bar past its cap"* with:

```ts
it("never grows a bar past its ceiling", () => {
    const stages = 4;
    const room = TRACE_FLOOR + stages * (BAR_FLOOR + GAP_FLOOR) + 400;

    expect(allocateBands(room, stages).barHeight).toBe(BAR_MAX);
});
```

Replace *"does not divide by a recipe with no stages"* with:

```ts
it("does not divide by a recipe with no stages", () => {
    expect(allocateBands(600, 0)).toEqual({
        traceHeight: TRACE_MAX, barHeight: BAR_FLOOR, rungGap: GAP_FLOOR,
        scrolls: false
    });
});
```

Then append:

```ts
it("holds each band at its soft cap before any band gets a second helping", () => {
    // Just enough to fill trace, bar and gap to their soft caps and no more.
    const stages = 4;
    const soft = (TRACE_CAP - TRACE_FLOOR)
        + stages * ((BAR_CAP - BAR_FLOOR) + (GAP_CAP - GAP_FLOOR));
    const room = TRACE_FLOOR + stages * (BAR_FLOOR + GAP_FLOOR) + soft;

    expect(allocateBands(room, stages)).toEqual({
        traceHeight: TRACE_CAP, barHeight: BAR_CAP, rungGap: GAP_CAP,
        scrolls: false
    });
});

it("gives the second helping to the trace first", () => {
    const stages = 4;
    const soft = (TRACE_CAP - TRACE_FLOOR)
        + stages * ((BAR_CAP - BAR_FLOOR) + (GAP_CAP - GAP_FLOOR));
    const room = TRACE_FLOOR + stages * (BAR_FLOOR + GAP_FLOOR) + soft + 20;
    const bands = allocateBands(room, stages);

    expect(bands.traceHeight).toBe(TRACE_CAP + 20);
    expect(bands.barHeight).toBe(BAR_CAP);
});

it("leaves nothing black at four stages on a real phone", () => {
    const bands = allocateBands(600, 4);
    const used = bands.traceHeight + 4 * (bands.barHeight + bands.rungGap);

    expect(600 - used).toBe(0);
    expect(bands).toEqual({
        traceHeight: 300, barHeight: 44, rungGap: 31, scrolls: false
    });
});

it("makes the bar the greater part of its own row at every stage count", () => {
    // The fault #88 reported: the bar was 15 pt in an 85 pt row.
    for (const stages of [4, 6, 9, 12]) {
        const bands = allocateBands(600, stages);
        expect(bands.barHeight).toBeGreaterThan(bands.rungGap);
    }
});

it("still cannot fill the screen at two stages, and says so by leaving room", () => {
    // Nothing is wrong here: a two-stage ladder thick enough to fill 600 pt
    // would look like a bug. The screen centres what is left.
    const bands = allocateBands(600, 2);
    const used = bands.traceHeight + 2 * (bands.barHeight + bands.rungGap);

    expect(bands).toEqual({
        traceHeight: TRACE_MAX, barHeight: BAR_MAX, rungGap: GAP_MAX,
        scrolls: false
    });
    expect(600 - used).toBe(144);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest library/brew/__tests__/bands.test.ts
```

Expected: FAIL — `BAR_MAX`, `GAP_CAP`, `GAP_MAX`, `TRACE_MAX` are not exported.

- [ ] **Step 3: Implement it**

Replace the constants block and `allocateBands` in `library/brew/bands.ts`:

```ts
/** The trace takes the first of the slack: it is the thing worth looking at. */
export const TRACE_FLOOR = 120;
export const TRACE_CAP = 200;
export const TRACE_MAX = 300;

/** Then the rung bars thicken. */
export const BAR_FLOOR = 9;
export const BAR_CAP = 28;
export const BAR_MAX = 44;

/** Then the rungs spread out. */
export const GAP_FLOOR = 3;
export const GAP_CAP = 20;
export const GAP_MAX = 34;
```

Replace the body of `allocateBands` with:

```ts
export function allocateBands(flexHeight: number, stages: number): Bands {
    if (stages <= 0) {
        return {
            traceHeight: Math.min(TRACE_MAX, Math.max(TRACE_FLOOR, flexHeight)),
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

    // Pass one, in priority order, up to each band's soft cap. The caps are
    // what stop the first band in the queue from taking everything.
    let traceHeight = Math.min(TRACE_CAP, TRACE_FLOOR + slack);
    slack -= traceHeight - TRACE_FLOOR;

    let barHeight = Math.min(BAR_CAP, BAR_FLOOR + Math.floor(slack / stages));
    slack -= (barHeight - BAR_FLOOR) * stages;

    let rungGap = Math.min(GAP_CAP, GAP_FLOOR + Math.floor(slack / stages));
    slack -= (rungGap - GAP_FLOOR) * stages;

    // Pass two, same order, against hard ceilings. Without it every point the
    // soft caps refused fell out of the bottom of the screen as black -- which
    // is #88 in one sentence: BAR_CAP saturated at 15 and the rest went to a
    // gap that had no cap at all, so a 15 pt bar sat in an 85 pt row.
    const traceMore = Math.min(TRACE_MAX - traceHeight, slack);
    traceHeight += traceMore;
    slack -= traceMore;

    const barMore = Math.min(BAR_MAX - barHeight, Math.floor(slack / stages));
    barHeight += barMore;
    slack -= barMore * stages;

    const gapMore = Math.min(GAP_MAX - rungGap, Math.floor(slack / stages));
    rungGap += gapMore;

    // Anything still left is breathing room. The ladder is centred in it by
    // `BrewStageLadder`: space around well-proportioned content reads as
    // deliberate, where stretched content reads as a fault.
    return {traceHeight, barHeight, rungGap, scrolls: false};
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest library/brew/__tests__/bands.test.ts
```

Expected: PASS, 13 tests.

- [ ] **Step 5: Mutation-test**

Delete the whole second pass; expected: *"leaves nothing black at four stages"*, *"gives the second helping to the trace first"*, *"never grows the trace past its ceiling"* and *"never grows a bar past its ceiling"* all fail. Restore.
Set `BAR_CAP = BAR_MAX`; expected: *"holds each band at its soft cap"* fails. Restore.
Reorder pass two to bar-then-trace; expected: *"gives the second helping to the trace first"* fails. Restore.

- [ ] **Step 6: Run the gate and commit**

Subject: `The spare height reaches the bars, not just the gaps`

---

## Task 6: The ladder is centred in whatever room is left

**Files:**
- Modify: `components/BrewStageLadder.tsx` (~line 104)
- Test: `components/__tests__/BrewStageLadder.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it("centres the rungs in the room it is given", async () => {
    // At two or three stages the ceilings bite and there is height left over.
    // Top-aligned, that pools as black at the foot of the screen.
    const r = await renderWithProviders(
        <BrewStageLadder {...base} pours={twoPours} scrolls={false} />
    );

    const style = StyleSheet.flatten(
        r.getByTestId("ladder").props.style
    ) as {justifyContent?: string};
    expect(style.justifyContent).toBe("center");
});
```

Reuse the file's existing `base` props and two-pour fixture; add `import {StyleSheet} from "react-native";` if absent.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest components/__tests__/BrewStageLadder.test.tsx -t "centres"
```

Expected: FAIL — `justifyContent` is `undefined`.

- [ ] **Step 3: Implement it**

In `components/BrewStageLadder.tsx`, replace line ~104:

```tsx
    if (!scrolls) return <YStack testID="ladder" flex={1}>{rows}</YStack>;
```

with:

```tsx
    // Centred, not top-aligned. `allocateBands` fills the screen exactly from
    // four stages up, but at two or three the ceilings bite and there is height
    // left over; pooled at the foot it reads as a layout that ran out, and
    // split around the ladder it reads as margin.
    if (!scrolls) {
        return (
            <YStack testID="ladder" flex={1} justifyContent="center">
                {rows}
            </YStack>
        );
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest components/__tests__/BrewStageLadder.test.tsx
```

Expected: PASS, whole file.

- [ ] **Step 5: Mutation-test**

Remove `justifyContent="center"`; expected: the new test fails. Restore.

- [ ] **Step 6: Run the gate and commit**

Subject: `A short ladder sits in the middle of its room`

---

## Task 7: `useRefreshRequest` — the refresh control's state machine

**Files:**
- Create: `hooks/useRefreshRequest.ts`
- Test: `hooks/__tests__/useRefreshRequest.test.ts`

- [ ] **Step 1: Write the failing test**

Create `hooks/__tests__/useRefreshRequest.test.ts`:

```ts
import {act, renderHook} from "@testing-library/react-native";

import {ASK_TIMEOUT_MS, NO_ANSWER_MS, useRefreshRequest}
    from "@/hooks/useRefreshRequest";

describe("useRefreshRequest", () => {
    beforeEach(() => { jest.useFakeTimers(); });
    afterEach(() => { jest.useRealTimers(); });

    it("starts idle", () => {
        const {result} = renderHook(() => useRefreshRequest(1000, () => undefined));

        expect(result.current.state).toBe("idle");
    });

    it("asks the machine when pressed", () => {
        const ask = jest.fn();
        const {result} = renderHook(() => useRefreshRequest(1000, ask));

        act(() => { result.current.press(); });

        expect(ask).toHaveBeenCalledTimes(1);
        expect(result.current.state).toBe("asking");
    });

    it("goes back to idle when the machine actually answers", () => {
        const {result, rerender} = renderHook(
            ({at}) => useRefreshRequest(at, () => undefined),
            {initialProps: {at: 1000}}
        );

        act(() => { result.current.press(); });
        expect(result.current.state).toBe("asking");

        rerender({at: 2000});

        expect(result.current.state).toBe("idle");
    });

    it("stays asking while the reading is unchanged", () => {
        const {result, rerender} = renderHook(
            ({at}) => useRefreshRequest(at, () => undefined),
            {initialProps: {at: 1000}}
        );

        act(() => { result.current.press(); });
        rerender({at: 1000});

        expect(result.current.state).toBe("asking");
    });

    it("gives up after the timeout", () => {
        const {result} = renderHook(() => useRefreshRequest(1000, () => undefined));

        act(() => { result.current.press(); });
        act(() => { jest.advanceTimersByTime(ASK_TIMEOUT_MS); });

        expect(result.current.state).toBe("noAnswer");
    });

    it("does not sit on no answer forever", () => {
        const {result} = renderHook(() => useRefreshRequest(1000, () => undefined));

        act(() => { result.current.press(); });
        act(() => { jest.advanceTimersByTime(ASK_TIMEOUT_MS); });
        act(() => { jest.advanceTimersByTime(NO_ANSWER_MS); });

        expect(result.current.state).toBe("idle");
    });

    it("does not give up on a reading that arrived just in time", () => {
        const {result, rerender} = renderHook(
            ({at}) => useRefreshRequest(at, () => undefined),
            {initialProps: {at: 1000}}
        );

        act(() => { result.current.press(); });
        rerender({at: 2000});
        act(() => { jest.advanceTimersByTime(ASK_TIMEOUT_MS * 2); });

        expect(result.current.state).toBe("idle");
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest hooks/__tests__/useRefreshRequest.test.ts
```

Expected: FAIL — cannot resolve `@/hooks/useRefreshRequest`.

- [ ] **Step 3: Implement it**

Create `hooks/useRefreshRequest.ts`:

```ts
import {useEffect, useState} from "react";

export type RefreshState = "idle" | "asking" | "noAnswer";

/** How long the machine is given to answer before we say it has not. */
export const ASK_TIMEOUT_MS = 6000;

/** How long `NO ANSWER` is shown before the control offers itself again. */
export const NO_ANSWER_MS = 4000;

/**
 * The refresh control's state, over the age of the reading it refreshes.
 *
 * `askedAt` is the whole input. Pressing does not make the reading fresh --
 * that was the original bug, a `setPopoverNow(Date.now())` on press which reset
 * the displayed age to `JUST NOW` before the machine had said anything. Once
 * only a real answer moves `askedAt`, a *change* in it is exactly the event
 * that ends the wait, and the wait becomes something the control can show.
 *
 * Pure over a number and a clock, so it is tested without a machine.
 */
export function useRefreshRequest(askedAt: number, ask: () => void): {
    state: RefreshState;
    press: () => void;
} {
    // The reading's age at the moment of asking, so a later change to it can be
    // recognised as this request's answer.
    const [request, setRequest] =
        useState<{state: Exclude<RefreshState, "idle">; at: number} | null>(null);

    const answered = request !== null && request.state === "asking"
        && askedAt !== request.at;
    const state: RefreshState = request === null || answered ? "idle" : request.state;

    useEffect(() => {
        if (request === null || answered) return;
        const ms = request.state === "asking" ? ASK_TIMEOUT_MS : NO_ANSWER_MS;
        const timer = setTimeout(() => {
            setRequest(request.state === "asking"
                ? {state: "noAnswer", at: request.at}
                : null);
        }, ms);
        return () => clearTimeout(timer);
    }, [request, answered]);

    return {
        state,
        press: () => {
            setRequest({state: "asking", at: askedAt});
            ask();
        }
    };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx jest hooks/__tests__/useRefreshRequest.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Mutation-test**

Change `askedAt !== request.at` to `false`; expected: *"goes back to idle when the machine actually answers"* and *"does not give up on a reading that arrived just in time"* fail. Restore.
Change `askedAt !== request.at` to `true`; expected: *"asks the machine when pressed"*, *"stays asking"* and *"gives up after the timeout"* fail. Restore.
Make the `noAnswer` timer set `{state: "noAnswer", ...}` again instead of `null`; expected: *"does not sit on no answer forever"* fails. Restore.

- [ ] **Step 6: Run the gate and commit**

Subject: `The refresh control knows whether it is waiting`

---

## Task 8: `MachinePanel` — the readings grow up, and REFRESH becomes a button

Still presented as a sheet at the end of this task. Task 9 moves it.

**Files:**
- Rename: `components/MachinePopover.tsx` → `components/MachinePanel.tsx`
- Rename: `components/__tests__/MachinePopover.test.tsx` → `components/__tests__/MachinePanel.test.tsx`
- Modify: `app/index.tsx` (imports at 17 and 21; usage at ~540)
- Modify: `app/__tests__/index.test.tsx` (two comments referring to `MachinePopover`, at ~1105 and ~1179)

- [ ] **Step 1: Rename the files and fix every reference**

```bash
git mv components/MachinePopover.tsx components/MachinePanel.tsx
git mv components/__tests__/MachinePopover.test.tsx components/__tests__/MachinePanel.test.tsx
```

Rename the default export and the `describe` to `MachinePanel`. Update `app/index.tsx`:

```ts
import MachinePanel from "@/components/MachinePanel";
import type {MachineVitals} from "@/components/MachinePanel";
```

and the JSX tag at ~540. Update the two comments in `app/__tests__/index.test.tsx`. Then:

```bash
grep -rn "MachinePopover" . --include=*.ts --include=*.tsx
```

Expected: no matches.

Run `npm run typecheck && npx jest components/__tests__/MachinePanel.test.tsx app/__tests__/index.test.tsx` — expected PASS — and commit this rename **on its own**, so the substantive diff that follows is readable.

Subject: `MachinePanel, because it is about to stop being a popover`

- [ ] **Step 2: Write the failing tests**

Append to `components/__tests__/MachinePanel.test.tsx`:

```tsx
it("offers a refresh button, not a twelve-point icon", async () => {
    const r = await draw({status: "connected", vitals: someVitals});

    const button = r.getByTestId("machine-refresh");
    expect(button.props.accessibilityRole).toBe("button");
    const style = StyleSheet.flatten(button.props.style) as {minHeight?: number};
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
});

it("says REFRESH when it is not doing anything", async () => {
    const r = await draw({status: "connected", vitals: someVitals});

    expect(r.getByTestId("machine-refresh-label").props.children).toBe("REFRESH");
});

it("says so while it is asking", async () => {
    const r = await draw({status: "connected", vitals: someVitals});

    await fireEvent.press(r.getByTestId("machine-refresh"));

    expect(r.getByTestId("machine-refresh-label").props.children)
        .toBe("CHECKING…");
});

it("asks the machine when pressed", async () => {
    const onRefreshWater = jest.fn();
    const r = await draw({status: "connected", vitals: someVitals, onRefreshWater});

    await fireEvent.press(r.getByTestId("machine-refresh"));

    expect(onRefreshWater).toHaveBeenCalledTimes(1);
});

it("will not ask twice while it is already asking", async () => {
    const onRefreshWater = jest.fn();
    const r = await draw({status: "connected", vitals: someVitals, onRefreshWater});

    await fireEvent.press(r.getByTestId("machine-refresh"));
    await fireEvent.press(r.getByTestId("machine-refresh"));

    expect(onRefreshWater).toHaveBeenCalledTimes(1);
});

it("reads the water level large enough to glance at", async () => {
    const r = await draw({status: "connected", vitals: someVitals});

    expect(r.getByTestId("machine-water-value").props.fontSize).toBe(18);
});
```

`someVitals` is `{waterEnough: true, mode: "PRO" as const, grindSize: 62, askedAt: 1000}`. Add `import {StyleSheet} from "react-native";` and `fireEvent` from `@testing-library/react-native` if the file does not already import them. The existing `draw()` helper takes a partial props object — extend its defaults with `now: 1000` if it does not already pass one.

- [ ] **Step 3: Run the tests to verify they fail**

```bash
npx jest components/__tests__/MachinePanel.test.tsx -t "refresh"
```

Expected: FAIL — no `machine-refresh` testID.

- [ ] **Step 4: Implement it**

In `components/MachinePanel.tsx`:

Add imports:

```ts
import {useRefreshRequest} from "@/hooks/useRefreshRequest";
```

Add a module-scope component below `Row` — **module scope, never inside another component's body**, because a component declared in a render is a new type every render and React throws its state away:

```tsx
/** How the button reads in each of its states. */
const REFRESH_LABEL = {
    idle:     "REFRESH",
    asking:   "CHECKING…",
    noAnswer: "NO ANSWER"
} as const;

/**
 * The refresh button.
 *
 * Under the readings rather than on the water row: the round trip re-reads all
 * three, and a control sitting on one row claims a narrower effect than it has.
 * It was previously a bare twelve-point icon with no pressed state and no busy
 * state, so the only evidence it had worked was that the machine beeped.
 */
function RefreshButton({accent, askedAt, onRefresh}: {
    accent: string; askedAt: number; onRefresh: () => void;
}) {
    const {state, press} = useRefreshRequest(askedAt, onRefresh);
    const colour = state === "noAnswer" ? palette.warn : accent;

    return (
        <YStack
            testID="machine-refresh"
            accessible
            accessibilityRole="button"
            accessibilityLabel="Refresh the machine readings"
            accessibilityState={{disabled: state !== "idle"}}
            onPress={state === "idle" ? press : undefined}
            marginTop="$2"
            minHeight={44}
            alignItems="center"
            justifyContent="center"
            borderRadius="$4"
            borderWidth={1}
            borderColor={colour}
            opacity={state === "asking" ? 0.55 : 1}
            pressStyle={state === "idle"
                ? {opacity: 0.6, backgroundColor: palette.raised}
                : undefined}>
            <DotMatrixText testID="machine-refresh-label" fontSize={11}
                           weight="bold" letterSpacing={2} color={colour}>
                {REFRESH_LABEL[state]}
            </DotMatrixText>
        </YStack>
    );
}
```

In the `connected` branch, **delete** the `Pressable` wrapping the `DotIcon` on the WATER row, bump the type, add a `testID` to the water value, and add the button after the three rows:

```tsx
body = (
    <YStack gap="$1">
        <Row label="WATER">
            <DotMatrixText testID="machine-water-value" fontSize={18} weight="bold"
                           color={vitals.waterEnough ? palette.text : palette.warn}>
                {vitals.waterEnough ? "OK" : "LOW"}
            </DotMatrixText>
            <DotMatrixText fontSize={11} color={palette.muted}>
                {age(vitals.askedAt, now)}
            </DotMatrixText>
        </Row>
        {!vitals.waterEnough && (
            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6}
                           color={palette.warn}>
                FILL THE TANK, THEN REFRESH
            </DotMatrixText>
        )}
        <Row label="MODE">
            <DotMatrixText fontSize={18} weight="bold"
                           color={vitals.mode === "EASY" ? palette.warn : palette.text}>
                {vitals.mode}
            </DotMatrixText>
        </Row>
        <Row label="GRIND">
            <DotMatrixText fontSize={18} weight="bold" color={palette.text}>
                {String(vitals.grindSize)}
            </DotMatrixText>
        </Row>
        <RefreshButton accent={accent} askedAt={vitals.askedAt}
                       onRefresh={onRefreshWater} />
    </YStack>
);
```

In `Row`, bump the label: `fontSize={10}` → `fontSize={11}`.

Remove the now-unused `Pressable` import only if nothing else in the file uses it — `TRY NOW` still does, so it stays. Remove the `DotIcon` import if `TRY NOW` does not use it.

Update the component's doc comment: the paragraph explaining that the refresh affordance "lives on the water row" is now false and must be replaced with the reason it does not.

- [ ] **Step 5: Fix the caller's bug**

In `app/index.tsx`, at ~546, replace:

```tsx
onRefreshWater={() => {
    setPopoverNow(Date.now());
    refreshWater();
}}
```

with:

```tsx
onRefreshWater={refreshWater}
```

`setPopoverNow(Date.now())` reset the displayed age to `JUST NOW` the instant the control was pressed — before the machine had answered — which is why the control could not show progress even in principle. The age now comes from `vitals.askedAt`, which only a real answer moves. The `setPopoverNow` call when the panel is *opened* (~462) is correct and stays: that is the clock the age is measured against, not the reading.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npx jest components/__tests__/MachinePanel.test.tsx app/__tests__/index.test.tsx
```

Expected: PASS. Existing tests asserting the old `Refresh the water reading` accessibility label must be updated to the new label and testID.

- [ ] **Step 7: Mutation-test**

Restore `setPopoverNow(Date.now())` in the press handler and add a test in `app/__tests__/index.test.tsx` asserting the age still reads `4 MIN AGO` immediately after a press that the machine has not answered; confirm it fails with the line restored and passes without it. Keep that test.
Set `minHeight={20}`; expected: the touch-target test fails. Restore.
Make `onPress` always `press`; expected: *"will not ask twice"* fails. Restore.

- [ ] **Step 8: Run the gate and commit**

Subject: `REFRESH looks like a button and says what it is doing`

---

## Task 9: The panel opens the header

**Files:**
- Modify: `components/HomeHeader.tsx`
- Modify: `components/MachinePanel.tsx` (drop `XbrwSheet`)
- Modify: `app/index.tsx` (~454-469, ~540)
- Test: `components/__tests__/HomeHeader.test.tsx`, `components/__tests__/MachinePanel.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `components/__tests__/HomeHeader.test.tsx`:

```tsx
it("shows the machine panel below the header row, not over the screen", async () => {
    const r = await renderWithProviders(
        <HomeHeader {...base}
                    machinePanel={<View testID="the-panel" />} />
    );

    expect(r.getByTestId("the-panel")).toBeTruthy();
});

it("has no panel when it is not given one", async () => {
    const r = await renderWithProviders(<HomeHeader {...base} />);

    expect(r.queryByTestId("the-panel")).toBeNull();
});
```

Add `import {View} from "react-native";` if absent. `base` is the file's existing required-props fixture.

And in `components/__tests__/MachinePanel.test.tsx`:

```tsx
it("is not a sheet", async () => {
    const r = await draw({open: true, status: "connected", vitals: someVitals});

    expect(r.queryByTestId("xbrw-sheet")).toBeNull();
});

it("shows nothing at all when closed", async () => {
    const r = await draw({open: false, status: "connected", vitals: someVitals});

    expect(r.queryByTestId("machine-refresh")).toBeNull();
});
```

If `XbrwSheet` does not currently carry the testID `xbrw-sheet`, read the testID it does carry from `components/XbrwSheet.tsx` and assert on that instead.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest components/__tests__/HomeHeader.test.tsx components/__tests__/MachinePanel.test.tsx
```

Expected: FAIL on all four.

- [ ] **Step 3: Change `MachinePanel` to a panel**

In `components/MachinePanel.tsx`, replace the `XbrwSheet` import with:

```ts
import Collapsible from "@/components/Collapsible";
```

and replace the return with:

```tsx
    // A panel the header owns, not an overlay. Nothing is covered, so there is
    // nothing to have to get back to, and the only way to close it is the
    // control that opened it -- still visible, still in place, two rows up. It
    // used to rise from the bottom of the screen, opened by a control in the
    // top-right corner; it arrived from the wrong end.
    //
    // `Collapsible` measures its content and animates height and opacity,
    // honouring Reduced Motion, which is the same treatment the header's own
    // collapse already gets.
    return (
        <Collapsible open={open}>
            <YStack testID="machine-panel" paddingHorizontal="$3"
                    paddingBottom="$2">
                {body}
            </YStack>
        </Collapsible>
    );
```

`onClose` is no longer called by the panel — the machine dot closes it. Remove `onClose` from `Props` and from the destructured parameter list, and remove it at the call site in `app/index.tsx`.

- [ ] **Step 4: Change `HomeHeader` to hold it**

In `components/HomeHeader.tsx`, add to `Props`:

```ts
    /**
     * Rendered directly beneath the header row.
     *
     * A node rather than the machine's readings themselves: the header should
     * not have to know what a water level is to be able to make room for one.
     */
    machinePanel?: React.ReactNode;
```

Add `machinePanel` to the destructured parameters. Add `YStack` to the `tamagui` import. Replace the outer element: the top inset moves to a new wrapper, and the row keeps its testID so existing tests still find it.

```tsx
    return (
        // The screen has no navigation bar to clear the status bar for it, so
        // the header carries the top inset itself -- on the wrapper now, so
        // that the panel below the row is inside the header's box and pushes
        // the list down rather than covering it.
        <YStack paddingTop={insets.top + 8}>
            <XStack testID="home-header"
                    alignItems="center" justifyContent="space-between" gap="$2"
                    paddingHorizontal="$3" paddingVertical="$2">
                {/* …unchanged contents… */}
            </XStack>
            {machinePanel}
        </YStack>
    );
```

- [ ] **Step 5: Wire it in `app/index.tsx`**

Move the `<MachinePanel>` element out of wherever it renders at ~540 and pass it to `HomeHeader`:

```tsx
<HomeHeader
    count={library.recipes.length}
    collapsed={collapsed}
    editing={editing}
    showEdit={!isEmpty}
    canImport
    machineStatus={remembered ? machineStatus : undefined}
    machinePanel={remembered ? (
        <MachinePanel
            open={popoverOpen}
            status={machineStatus}
            accent={palette.success}
            vitals={machineVitals}
            now={popoverNow}
            onRefreshWater={refreshWater}
            onConnect={connectMachine}
        />
    ) : undefined}
    onMachinePress={() => {
        setPopoverNow(Date.now());
        setPopoverOpen((open) => !open);
    }}
    onMachineConnect={connectMachine}
    onToggleEdit={() => setEditing((current) => !current)}
    onScan={readCard}
    onImport={() => setImportOpen(true)}
    onSettings={() => router.push("/settings")}/>
```

`onMachinePress` now toggles rather than only opening: the dot is the close control as well as the open one. Delete the old `{popoverOpen && (<MachinePopover …/>)}` block entirely.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npm test
```

Expected: PASS. `app/__tests__/index.test.tsx` has tests that open the panel and read from it; they should still pass, because the panel is still rendered and still carries the same text. Any that assert a *sheet* is presented must be rewritten to assert the panel is present.

- [ ] **Step 7: Mutation-test**

Remove `{machinePanel}` from `HomeHeader`; expected: *"shows the machine panel below the header row"* fails. Restore.
Change `Collapsible open={open}` to `open`; expected: *"shows nothing at all when closed"* fails. Restore.
Change `setPopoverOpen((open) => !open)` back to `setPopoverOpen(true)`; expected: add a test in `app/__tests__/index.test.tsx` that pressing the machine dot twice leaves the panel closed, and confirm it catches this. Keep that test.

- [ ] **Step 8: Run the gate and commit**

Subject: `The machine readings open the header they were asked for from`

---

## Task 10: A new brew does not wear the last one's status

**Files:**
- Modify: `hooks/useBrewRun.ts` (~lines 61-78)
- Test: `hooks/__tests__/useBrewRun.test.tsx` (or wherever `useBrewRun`'s tests live — find it with `grep -rln useBrewRun hooks/__tests__ app/__tests__`)

- [ ] **Step 1: Establish which path each case takes, by test**

Before changing anything, write two tests that describe the two cases and run them. They tell you whether the current code already distinguishes them.

```tsx
it("shows a run as waking until it hears a phase of its own", () => {
    // The machine is sitting in the phase the *last* brew left it in.
    const machine = fakeMachine({phase: {name: "grinding"}});
    const {result} = renderHook(
        ({id}) => useBrewRun(aRecipe, store, id),
        {initialProps: {id: 1}}
    );

    expect(result.current.phase).toEqual({name: "waking"});
});

it("adopts the machine's phase for a brew it did not start", () => {
    // Play pressed on the machine: there is no app-side send, and the
    // machine's phase is the only truth there is.
    const machine = fakeMachine({phase: {name: "grinding"}});
    const {result} = renderHook(() => useBrewRun(null, store, 0));

    expect(result.current.phase).toEqual({name: "grinding"});
});
```

Build `fakeMachine`, `aRecipe` and `store` exactly as the existing tests in that file do — do not invent new fixtures. Run:

```bash
npx jest hooks/__tests__/useBrewRun.test.tsx -t "waking"
```

Expected: the first FAILS (it reports `{name: "grinding"}`), the second PASSES.

**If the second also fails,** the two cases are not distinguished by `recipe` being null and the rule below is wrong. Stop, report what the code actually does, and do not guess a mechanism.

- [ ] **Step 2: Implement the rule**

In `hooks/useBrewRun.ts`, replace the stand-in at ~69-76:

```ts
    // Nothing heard for this run yet.
    //
    // If the app started this brew, nothing the machine said before the run
    // began belongs to it: the machine is still sitting in whatever phase the
    // last brew left it in, and showing that is how a new brew came to wear the
    // previous one's status. An earlier fix mapped only *terminal* stand-ins to
    // `waking`, which removed the stale STOPPED and left every other leftover
    // phase showing through.
    //
    // A brew started by pressing play on the machine has no app-side send, and
    // the machine's own phase is then the only truth there is -- the app has to
    // join it in progress. So this is a distinction between a run the app
    // started and a run it joined, not a refusal to read the machine.
    const ours = recipeRef.current !== null;
    const fresh = heard !== null && heard.from === machine && heard.runId === runId;
    const phase: BrewPhase = fresh
        ? heard.phase
        : ours || OVER.has(machine.phase.name) ? {name: "waking"} : machine.phase;
```

`recipeRef` is declared below this point in the current file. Move its `useRef` declaration above the `phase` computation — it has no dependency on anything between.

- [ ] **Step 3: Run the tests to verify they pass**

```bash
npx jest hooks/__tests__/useBrewRun.test.tsx
```

Expected: PASS, both new tests and the whole file. Any existing test asserting that an app-started run adopts the machine's non-terminal phase described the bug and must be rewritten.

- [ ] **Step 4: Run the wider brew suites**

```bash
npx jest hooks/__tests__/useLiveBrew.test.tsx app/__tests__/brew.test.tsx app/__tests__/brewRecord.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Mutation-test**

Set `const ours = false`; expected: *"shows a run as waking until it hears a phase of its own"* fails. Restore.
Set `const ours = true`; expected: *"adopts the machine's phase for a brew it did not start"* fails. Restore.

- [ ] **Step 6: Run the gate and commit**

Subject: `A new brew starts blank, not wearing the last one's status`

---

## Task 11: Close out

- [ ] **Step 1: Run the full gate one final time**

```bash
npm run typecheck && npm run lint && npm test && npx expo-doctor
```

Expected: typecheck clean, lint 0 errors / 6 baseline warnings, all suites passing, expo-doctor green.

- [ ] **Step 2: Push**

```bash
git push
```

- [ ] **Step 3: Comment on the issues**

On **#92**: a table of the six design items with what was decided and the commit that carries it, and the note that the no-beans copy was investigated and is not a bug in the source.

On **#88**: the new allocation table (stages 2, 3, 4, 6, 9, 12 at 600 pt), that the bar is now 56-85 % of its row against 7-38 % before, and that the issue's prediction about which test would need rewriting was wrong — *"gives everything left to the spacing"* survived; the two cap tests and the no-stages test did not.

Do **not** close either issue: both need the next device round to confirm.

- [ ] **Step 4: Report what could not be verified**

State plainly in the final summary that none of this has been seen on hardware, and list what the device round must check:

1. That the header panel does not push the list awkwardly when the header is collapsed.
2. That `CHECKING…` is actually visible — if the machine answers in under a frame, it will never be seen, and that is fine.
3. That the hatch pattern renders at 9 pt bar height, the floor, without moiré.
4. That the cup line reads clearly on a Sky recipe, the one accent the guard moved.
5. That a two-stage recipe's centred ladder looks deliberate rather than lost.
6. That starting a brew from the machine still carries the app into the live view (#87).

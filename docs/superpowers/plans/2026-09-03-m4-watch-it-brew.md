# M4 — Watch it brew: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the xBloom's discarded telemetry into a brew you can watch, a machine that is present throughout the app, and a permanent record of every brew.

**Architecture:** Three layers, strictly separated, as the codebase already requires. `library/brew/` holds pure TypeScript — the geometry, the record types, and a recorder that subscribes to `Machine.onNotification`; `library/BrewDatabase.ts` persists records beside `RecipeDatabase.ts`. `hooks/` turns that into React state. `components/` and `app/` draw it. The central idea is that the recipe's existing cumulative-volume staircase (`buildProfilePath`) already *is* the water curve, so the brew reuses the drawing the user knows rather than inventing a chart.

**Tech Stack:** Expo SDK 57, React Native, TypeScript, Tamagui, react-native-svg, Reanimated 4, expo-sqlite, Jest + @testing-library/react-native. Two new dependencies: `expo-sharing`, `react-native-view-shot`.

**Spec:** `docs/superpowers/specs/2026-09-03-machine-ux-design.md`

**Out of scope for this plan:** the iOS Live Activity (#71). It needs a native widget extension target and is gated on the background-BLE question in spec §11. It gets its own plan once that is settled. Everything else in the spec is here.

---

## Read this before Task 1

Facts about this codebase that the tasks below assume. Getting one of these wrong will waste an hour.

- **Import alias:** `@/` maps to the repo root. `import Recipe from "@/library/Recipe"`.
- **Colour:** every colour comes from `constants/colors.ts`. **No hex literals and no named CSS colours anywhere in `app/` or `components/`.** Tamagui `$` tokens are fine for spacing, size and radius — never for colour. Add a semantically named palette entry (`danger`, `muted`) rather than a literal one (`red`).
- **The React Compiler is on.** Do not hand-write `useMemo`/`useCallback`. Do not read whole `props` inside a hook — destructure first. Do not call an impure function (`Date.now()`, `Math.random()`) during render, including inside a `useSharedValue` initialiser: it is a lint **error**, not a warning.
- **Component tests:** `render` and `fireEvent` from `@testing-library/react-native` v14 are **async**. Forget the `await` and the screen stays empty and your test passes for the wrong reason. Always render via `renderWithProviders` from `@/test-utils/render`.
- **Any component that reads `useSetting` without an injected store opens SQLite,** which in Jest throws `_ExpoSQLite.default.NativeDatabase is not a constructor`. Test files define a local `memoryStorage()` helper and inject a `Settings` — copy the pattern from `app/__tests__/settings.test.tsx`.
- **`useSetting` must be imported named** (`import {useSetting} from "@/hooks/useSetting"`), or `import/no-named-as-default` warns.
- **Units, confirmed by reading the source:** `Pour.flowRate` is stored ×10, so ml/s is `flowRate / 10`. `Pour.pauseTime` is whole seconds. `Pour.volume` is ml. The protocol already converts `waterWeight` to **grams** (`protocol.ts` divides by 1000) — the spec's "mg" refers to the wire, not to what you receive.
- **Commands:** `npm test`, `npx jest <path>`, `npx jest <path> -t "name"`, `npm run typecheck`, `npm run lint`, `npx expo-doctor`. All four must be green before any task is considered done; `expo-doctor` is a hard CI failure.
- **Commit after every task.** Use the trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.
- **Branch:** work on `home-wordmark`, which already carries the wordmark and the spec. Rename it to `m4-watch-it-brew` at Task 1.

---

## File structure

| File | Responsibility |
|---|---|
| `library/brew/brewShape.ts` | *New.* Pure geometry. The plan on a real-seconds axis, the live trace from samples, and a points-to-SVG-path helper. Knows nothing of React or of the machine. |
| `library/brew/BrewRecord.ts` | *New.* The record and sample types, plus `summarise`. Pure. |
| `library/brew/BrewRecorder.ts` | *New.* Subscribes to `Machine.onNotification` and `onPhase`, accumulates samples, emits one record on any terminal phase. Injectable clock. |
| `library/BrewDatabase.ts` | *New.* expo-sqlite, two tables, retention sweep. Same synchronous style as `RecipeDatabase.ts`. |
| `library/brew/brewExport.ts` | *New.* A brew as a versioned JSON file, and the filename for it. Pure. |
| `library/machine/Machine.ts` | *Modify.* One change only: `brewBlockReason` becomes `brewBlock`, returning a typed reason so the app can tell "refused, nothing sent" from "stopped mid-brew". |
| `library/Settings.ts` | *Modify.* Three new keys. |
| `hooks/useBrewRun.ts` | *New.* The live brew as React state. Wraps `useBrew`. |
| `hooks/useBrewHistory.ts` | *New.* List, open, delete, sweep. |
| `hooks/useTraceAnimation.ts` | *New.* The phase animations, as a pure function of phase and time plus a clock. |
| `hooks/useLiveBrew.ts` | *New.* The run, above every screen, so the brew outlives the sheet. |
| `hooks/useMachine.ts` | *Modify.* Connect on launch when a machine is remembered. |
| `components/PourGlyph.tsx` | *New.* The four marks. Shared by the brew rung and the editor's `StageTile` — this shared component is what makes the two screens one family rather than a resemblance. |
| `components/BrewTrace.tsx` | *New.* Plan, live water, trailing cup. One component, two sizes — the sheet and the mini-bar. |
| `components/BrewFigures.tsx` | *New.* WATER, CUP, TIME at the app's machine-readout scale. |
| `components/BrewStageRung.tsx` | *New.* One pour as one line, with its timing lane, and its in-place expansion. |
| `components/BrewStageLadder.tsx` | *New.* The rungs, scrolling, auto-scrolled to the live stage. |
| `components/BrewMiniBar.tsx` | *New.* The trace at 86×34 with a status line. |
| `components/MachineDot.tsx` | *New.* The nine-pixel header dot, in three states. |
| `components/MachinePopover.tsx` | *New.* What changes — water with its own age and refresh, mode, grind. At most one button. |
| `components/BrewHistoryRow.tsx` | *New.* One past brew as a row. |
| `constants/brewCopy.ts` | *New.* Every phase and failure sentence, shared by the brew screen and history. |
| `components/BrewCapsule.tsx` | *New.* The upright BREW capsule on a recipe row. |
| `app/brew.tsx` | *Rewrite.* Layout only: trace, figures, ladder, actions. |
| `app/brewHistory.tsx` | *New.* The list. |
| `app/brewRecord.tsx` | *New.* One past brew, and its exports. |
| `components/StageTile.tsx` | *Modify.* Gains the timing lane and glyphs from the brew rung. |
| `components/HomeHeader.tsx` | *Modify.* Hosts the dot. |
| `components/RecipeCard.tsx` | *Modify.* Hosts the capsule. |
| `app/index.tsx` | *Modify.* Hosts the mini-bar, and decides whether the capsule is shown. |
| `app/_layout.tsx` | *Modify.* Hosts the live-brew provider and runs the retention sweep at launch. |
| `components/RecipeOverflowSheet.tsx` | *Modify.* A `Brew history` row for one recipe. |
| `app/settings.tsx` | *Modify.* Three rows: the capsule switch, the animation switch, the retention picker. |

---

# Phase 1 — The record

Pure logic first: everything in this phase is testable without a radio, a
simulator or a screen, and everything later depends on it.

### Task 1: The record and sample types

**Files:**
- Create: `library/brew/BrewRecord.ts`
- Test: `library/brew/__tests__/BrewRecord.test.ts`

`summarise` takes the plan's duration as a **number**, not as pours, so this
file never imports `brewShape` — that keeps the dependency one-way and lets
`brewShape` import these types.

- [ ] **Step 1: Write the failing test**

```ts
// library/brew/__tests__/BrewRecord.test.ts
import {summarise, type BrewSample} from "@/library/brew/BrewRecord";

function samples(rows: [number, number, number][]): BrewSample[] {
    return rows.map(([at, water, cup]) => ({at, water, cup, pour: 1}));
}

describe("summarise", () => {
    it("reports the last water and cup figures, not the largest", () => {
        // The cup can lose weight: a drip settles, or the machine is nudged.
        // The record is what the brew ended at.
        const result = summarise(samples([[0, 0, 0], [1000, 120, 90], [2000, 250, 244]]), 120);
        expect(result.waterTotal).toBe(250);
        expect(result.cupTotal).toBe(244);
    });

    it("has no held time when the brew ran to plan", () => {
        expect(summarise(samples([[0, 0, 0], [120_000, 250, 244]]), 120).heldSeconds).toBe(0);
    });

    it("counts the overrun as held time", () => {
        // Overflow protection stops the water without announcing itself. The
        // only evidence is that the brew took longer than the recipe asked for.
        expect(summarise(samples([[0, 0, 0], [134_000, 250, 244]]), 120).heldSeconds).toBe(14);
    });

    it("never reports negative held time", () => {
        // A machine that beats the plan is running its own flow rate, not
        // holding. Reporting "-6 s held" would be nonsense on the screen.
        expect(summarise(samples([[0, 0, 0], [114_000, 250, 244]]), 120).heldSeconds).toBe(0);
    });

    it("summarises an empty stream as zeroes rather than throwing", () => {
        // A brew that fails during `sending` has a record and no samples.
        expect(summarise([], 120)).toEqual({waterTotal: 0, cupTotal: 0, heldSeconds: 0});
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest library/brew/__tests__/BrewRecord.test.ts`
Expected: FAIL — `Cannot find module '@/library/brew/BrewRecord'`.

- [ ] **Step 3: Write the implementation**

```ts
// library/brew/BrewRecord.ts
import type {BrewFailure} from "@/library/machine/Machine";

/**
 * One instant of a brew, as the machine reported it.
 *
 * `at` is milliseconds since the brew started rather than a wall clock: a
 * record is replayed against its own timeline, and a stream of absolute
 * timestamps would have to be re-based on every read.
 */
export type BrewSample = {
    at: number;
    /** Water dispensed, ml. The machine reports grams; for water they are one. */
    water: number;
    /** Weight in the cup, g. */
    cup: number;
    /** Which pour was running, 1-based. 0 before the first drop. */
    pour: number;
};

/** How a brew ended. `failed` carries the reason separately. */
export type BrewOutcome = "done" | "cancelled" | "lostContact" | "failed";

/**
 * One brew that happened.
 *
 * `recipeName` and `accent` are **copied, not joined**. A brew is a record of
 * an event; renaming a recipe must not rewrite history, and deleting one must
 * not erase it.
 */
export type BrewRecord = {
    id: string;
    recipeUuid: string;
    recipeName: string;
    accent: string;
    startedAt: number;
    endedAt: number;
    outcome: BrewOutcome;
    failure: BrewFailure | null;
    pours: number;
    waterTotal: number;
    cupTotal: number;
    /** Seconds the brew ran beyond its plan — overflow protection, mostly. */
    heldSeconds: number;
};

export type BrewSummary = Pick<BrewRecord, "waterTotal" | "cupTotal" | "heldSeconds">;

/**
 * Derive the figures a record keeps from the stream it keeps them for.
 *
 * Held time is the overrun against the plan rather than a search for flat runs
 * in the water curve, because a planned pause and an unplanned hold look
 * identical in the stream — the plan is the only thing that can tell them
 * apart, and the difference in totals is exactly the unplanned part.
 */
export function summarise(samples: BrewSample[], plannedSeconds: number): BrewSummary {
    const last = samples[samples.length - 1];
    if (last === undefined) return {waterTotal: 0, cupTotal: 0, heldSeconds: 0};
    const elapsed = last.at / 1000;
    return {
        waterTotal: last.water,
        cupTotal: last.cup,
        heldSeconds: Math.max(0, Math.round(elapsed - plannedSeconds))
    };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest library/brew/__tests__/BrewRecord.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git branch -m m4-watch-it-brew
git add library/brew/BrewRecord.ts library/brew/__tests__/BrewRecord.test.ts
git commit -m "feat(brew): the record and sample types

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: The geometry, on a real-seconds axis

**Files:**
- Create: `library/brew/brewShape.ts`
- Test: `library/brew/__tests__/brewShape.test.ts`

`buildProfilePath` in `components/PourProfile.tsx` divides time **evenly per
pour**, which is right there — the card's mark is an identifying shape, not a
chart. The brew cannot: the stage ladder draws pause bars to real duration, and
the trace and the ladder must agree about where "now" is. So this is a second
geometry, deliberately, and the divergence is documented in both files.

- [ ] **Step 1: Write the failing test**

```ts
// library/brew/__tests__/brewShape.test.ts
import Pour from "@/library/Pour";
import {
    livePoints, planPoints, plannedSeconds, pourSeconds, stageSpans, toPath
} from "@/library/brew/brewShape";
import type {BrewSample} from "@/library/brew/BrewRecord";

/** 40 ml at 4 ml/s (flowRate is stored x10) then a 20 s pause. */
const bloom = () => new Pour(1, 40, 93, 40, 0, 0, 20);
/** 160 ml at 4 ml/s, no pause. */
const main = () => new Pour(2, 160, 92, 40, 0, 0, 0);

describe("pourSeconds", () => {
    it("divides volume by the flow rate, which is stored times ten", () => {
        expect(pourSeconds(bloom())).toBe(10);
    });

    it("falls back to a nominal flow when the recipe has none", () => {
        // flowRate defaults to -1 on Pour. Dividing by it would run the curve
        // backwards in time, which draws as a line through the whole chart.
        expect(pourSeconds(new Pour(1, 32, 93, -1, 0, 0, 0))).toBeCloseTo(10);
    });
});

describe("plannedSeconds", () => {
    it("adds every pour and every pause", () => {
        expect(plannedSeconds([bloom(), main()])).toBe(10 + 20 + 40);
    });

    it("is zero for a recipe with no pours", () => {
        expect(plannedSeconds([])).toBe(0);
    });
});

describe("stageSpans", () => {
    it("places each stage after the one before it, pause included", () => {
        expect(stageSpans([bloom(), main()])).toEqual([
            {start: 0, pourEnd: 10, end: 30},
            {start: 30, pourEnd: 70, end: 70}
        ]);
    });
});

describe("planPoints", () => {
    it("steps up over each pour and runs level through each pause", () => {
        expect(planPoints([bloom(), main()])).toEqual([
            {t: 0, v: 0}, {t: 10, v: 40}, {t: 30, v: 40}, {t: 70, v: 200}
        ]);
    });

    it("emits no flat segment for a pour with no pause", () => {
        // A zero-length segment per pour is a third more path data for
        // identical geometry, on a component that renders in a list.
        expect(planPoints([main()])).toEqual([{t: 0, v: 0}, {t: 40, v: 160}]);
    });

    it("draws a recipe with no pours as nothing at all", () => {
        expect(planPoints([])).toEqual([]);
    });
});

describe("livePoints", () => {
    const samples: BrewSample[] = [
        {at: 0, water: 0, cup: 0, pour: 1},
        {at: 5000, water: 20, cup: 4, pour: 1}
    ];

    it("reads the water channel in seconds", () => {
        expect(livePoints(samples, "water")).toEqual([{t: 0, v: 0}, {t: 5, v: 20}]);
    });

    it("reads the cup channel from the same stream", () => {
        expect(livePoints(samples, "cup")).toEqual([{t: 0, v: 0}, {t: 5, v: 4}]);
    });
});

describe("toPath", () => {
    it("maps seconds across and volume up, with y flipped for SVG", () => {
        const path = toPath([{t: 0, v: 0}, {t: 10, v: 50}],
                            {width: 100, height: 40, maxT: 20, maxV: 100});
        expect(path).toBe("M0 40 L50 20");
    });

    it("is empty for fewer than two points, so no stray dot is drawn", () => {
        expect(toPath([{t: 0, v: 0}], {width: 100, height: 40, maxT: 20, maxV: 100})).toBe("");
    });

    it("does not divide by zero before the first sample has any spread", () => {
        // maxT is elapsed time, which is 0 on the first frame of every brew.
        expect(toPath([{t: 0, v: 0}, {t: 0, v: 0}],
                      {width: 100, height: 40, maxT: 0, maxV: 0})).toBe("M0 40 L0 40");
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest library/brew/__tests__/brewShape.test.ts`
Expected: FAIL — `Cannot find module '@/library/brew/brewShape'`.

- [ ] **Step 3: Write the implementation**

```ts
// library/brew/brewShape.ts
import type Pour from "@/library/Pour";

import type {BrewSample} from "./BrewRecord";

/** A point on the brew's plane: seconds since the start, and millilitres. */
export type Point = {t: number; v: number};

/**
 * The flow assumed for a pour that does not state one.
 *
 * `Pour.flowRate` defaults to -1, meaning unset. Dividing by it would put the
 * pour's end before its start and draw a line across the whole chart. 3.2 ml/s
 * is the middle of the machine's range.
 */
const DEFAULT_FLOW_ML_S = 3.2;

/** How long a pour takes. `flowRate` is stored times ten. */
export function pourSeconds(pour: Pour): number {
    const volume = Math.max(pour.volume, 0);
    const flow = pour.flowRate > 0 ? pour.flowRate / 10 : DEFAULT_FLOW_ML_S;
    return volume / flow;
}

/** The pause after a pour, in seconds. Negative means unset, so it is clamped. */
export function pauseSeconds(pour: Pour): number {
    return Math.max(pour.pauseTime, 0);
}

/** How long the recipe says the whole brew should take. */
export function plannedSeconds(pours: Pour[]): number {
    return pours.reduce((total, pour) => total + pourSeconds(pour) + pauseSeconds(pour), 0);
}

/** Where one stage begins, stops pouring, and finally ends. Seconds. */
export type StageSpan = {start: number; pourEnd: number; end: number};

/** Index-aligned with `pours`. The ladder's timing lane is drawn from this. */
export function stageSpans(pours: Pour[]): StageSpan[] {
    const spans: StageSpan[] = [];
    let at = 0;
    for (const pour of pours) {
        const pourEnd = at + pourSeconds(pour);
        const end = pourEnd + pauseSeconds(pour);
        spans.push({start: at, pourEnd, end});
        at = end;
    }
    return spans;
}

/**
 * The recipe as a cumulative-water staircase on a real-seconds axis.
 *
 * The same shape as `buildProfilePath` in `components/PourProfile.tsx`, on a
 * different x-axis, and the difference is deliberate. That one divides time
 * evenly between pours because a card's mark is an identifying shape and even
 * division keeps a short pour visible. This one cannot: the stage ladder below
 * the trace draws pauses to real duration, and if the two axes disagreed the
 * live line would say a stage was over while the ladder said it had not begun.
 */
export function planPoints(pours: Pour[]): Point[] {
    if (pours.length === 0) return [];
    const spans = stageSpans(pours);
    const points: Point[] = [{t: 0, v: 0}];
    let poured = 0;
    pours.forEach((pour, i) => {
        poured += Math.max(pour.volume, 0);
        points.push({t: spans[i].pourEnd, v: poured});
        // Only when there is actually a pause. Emitting the plateau regardless
        // adds a zero-length segment per pour for identical geometry.
        if (spans[i].end > spans[i].pourEnd) points.push({t: spans[i].end, v: poured});
    });
    return points;
}

/** One channel of a sample stream as points. */
export function livePoints(samples: BrewSample[], of: "water" | "cup"): Point[] {
    return samples.map((sample) => ({t: sample.at / 1000, v: sample[of]}));
}

/** The rectangle a set of points is drawn into, and the range it spans. */
export type Box = {width: number; height: number; maxT: number; maxV: number};

/**
 * Points to an SVG path, y flipped.
 *
 * Returns "" below two points: a single point renders as an invisible path in
 * some engines and a stray dot in others, and neither is what an empty brew
 * should look like.
 */
export function toPath(points: Point[], box: Box): string {
    if (points.length < 2) return "";
    // Both ranges are zero on the first frame of every brew, before any time
    // has passed or any water has moved.
    const spanT = box.maxT > 0 ? box.maxT : 1;
    const spanV = box.maxV > 0 ? box.maxV : 1;
    const round = (n: number) => Math.round(n * 10) / 10;
    return "M" + points
        .map(({t, v}) => {
            const x = round((t / spanT) * box.width);
            const y = round(box.height - (v / spanV) * box.height);
            return `${x} ${y}`;
        })
        .join(" L");
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest library/brew/__tests__/brewShape.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Cross-reference the divergence from the card's geometry**

The two geometries must each point at the other, or the next person will
"fix" one of them. Modify `components/PourProfile.tsx`, in the doc comment
above `buildProfilePath`, appending to the existing final paragraph:

```ts
/**
 * The silhouette of a brew: cumulative water over time, stepped.
 *
 * Each pour contributes a rise followed by a flat, so pauses read as plateaus.
 * Time is divided evenly between pours rather than scaled by pause duration —
 * the shape is an identifying mark, not a chart, and even division keeps short
 * pours visible.
 *
 * `library/brew/brewShape.ts` draws the same staircase on a real-seconds axis
 * for the live brew, where it has to agree with a stage ladder about where
 * "now" is. That divergence is deliberate; do not reconcile them.
 */
```

- [ ] **Step 6: Run the profile's existing tests, unchanged**

Run: `npx jest components/__tests__/PourProfile.test.tsx library/brew`
Expected: PASS. A comment must not move a pixel.

- [ ] **Step 7: Commit**

```bash
git add library/brew components/PourProfile.tsx
git commit -m "feat(brew): plan and trace geometry on a real-seconds axis

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: The recorder

**Files:**
- Create: `library/brew/BrewRecorder.ts`
- Test: `library/brew/__tests__/BrewRecorder.test.ts`

`Machine.ts` is 892 lines and gains nothing here. It already decodes
`waterWeight` and `cupWeight` and hands them to `onNotification`; the recorder
subscribes like any other listener. Injecting the clock is what makes the whole
brew path testable without a radio.

**Two anchors, deliberately.** `startedAt` on the record is the wall clock when
the user pressed BREW — that is what history should say. A sample's `at` is
milliseconds since the **first pour**, because the plan's axis begins at the
first drop and grinding is not on it. Timing samples from the press would slide
the live line right of the plan by the length of the grind on every brew.

- [ ] **Step 1: Write the failing test**

```ts
// library/brew/__tests__/BrewRecorder.test.ts
import BrewRecorder, {type RecorderMachine} from "@/library/brew/BrewRecorder";
import type {BrewRecord, BrewSample} from "@/library/brew/BrewRecord";
import type {BrewPhase} from "@/library/machine/Machine";
import type {Notification} from "@/library/machine/protocol";
import Pour from "@/library/Pour";
import Recipe from "@/library/Recipe";

/** A machine that says only what a test tells it to. */
function fakeMachine() {
    let notify: (n: Notification) => void = () => {};
    let phase: (p: BrewPhase) => void = () => {};
    const machine: RecorderMachine = {
        onNotification: (l) => { notify = l; return () => { notify = () => {}; }; },
        onPhase: (l) => { phase = l; return () => { phase = () => {}; }; }
    };
    return {
        machine,
        water: (grams: number) => notify({kind: "waterWeight", grams}),
        cup: (grams: number) => notify({kind: "cupWeight", grams}),
        phase: (p: BrewPhase) => phase(p)
    };
}

function recipe(): Recipe {
    const r = new Recipe();
    r.name = "Ethiopia Guji";
    r.pours = [new Pour(1, 40, 93, 40, 0, 0, 20), new Pour(2, 160, 92, 40, 0, 0, 0)];
    return r;
}

/** A clock the test advances by hand. */
function clock(start = 1_000_000) {
    let at = start;
    return {now: () => at, advance: (ms: number) => { at += ms; }};
}

function build(overrides: Partial<{onRecord: (r: BrewRecord, s: BrewSample[]) => void}> = {}) {
    const fake = fakeMachine();
    const time = clock();
    const records: {record: BrewRecord; samples: BrewSample[]}[] = [];
    const recorder = new BrewRecorder({
        machine: fake.machine,
        recipe: recipe(),
        now: time.now,
        newId: () => "brew-1",
        onRecord: overrides.onRecord ?? ((record, samples) => records.push({record, samples}))
    });
    recorder.start();
    return {fake, time, records, recorder};
}

describe("BrewRecorder", () => {
    it("ignores weights that arrive before the first pour", () => {
        // The machine chatters while it grinds. None of it belongs on a plan
        // whose axis starts at the first drop.
        const {fake, recorder} = build();
        fake.phase({name: "grinding"});
        fake.water(0);
        expect(recorder.samples).toHaveLength(0);
    });

    it("times samples from the first pour, not from the press", () => {
        const {fake, time, recorder} = build();
        time.advance(30_000);              // a long grind
        fake.phase({name: "pouring", pour: 1, pours: 2});
        time.advance(5_000);
        fake.cup(4);
        fake.water(20);
        expect(recorder.samples).toEqual([{at: 5000, water: 20, cup: 4, pour: 1}]);
    });

    it("samples on water and carries the last cup weight through", () => {
        // Both channels arrive at about 10 Hz. Sampling on both would double
        // the stream for a second copy of the same instant.
        const {fake, recorder} = build();
        fake.phase({name: "pouring", pour: 1, pours: 2});
        fake.cup(4);
        fake.water(20);
        fake.water(24);
        expect(recorder.samples.map((s) => [s.water, s.cup])).toEqual([[20, 4], [24, 4]]);
    });

    it("records the pour that was running", () => {
        const {fake, recorder} = build();
        fake.phase({name: "pouring", pour: 1, pours: 2});
        fake.water(40);
        fake.phase({name: "pouring", pour: 2, pours: 2});
        fake.water(90);
        expect(recorder.samples.map((s) => s.pour)).toEqual([1, 2]);
    });

    it("emits a record when the brew finishes", () => {
        const {fake, time, records} = build();
        fake.phase({name: "pouring", pour: 1, pours: 2});
        time.advance(200_000);
        fake.cup(244);
        fake.water(250);
        fake.phase({name: "done"});

        expect(records).toHaveLength(1);
        expect(records[0].record).toMatchObject({
            id: "brew-1",
            recipeName: "Ethiopia Guji",
            outcome: "done",
            failure: null,
            pours: 2,
            waterTotal: 250,
            cupTotal: 244
        });
        expect(records[0].samples).toHaveLength(1);
    });

    it("keeps the reason on a failed brew", () => {
        const {fake, records} = build();
        fake.phase({name: "pouring", pour: 1, pours: 2});
        fake.water(40);
        fake.phase({name: "failed", reason: "noWater"});
        expect(records[0].record).toMatchObject({outcome: "failed", failure: "noWater"});
    });

    it("writes no record when the brew was refused before it began", () => {
        // Nothing was sent and no dose was spent. A row saying a brew happened
        // would be a lie, and it would sit at the top of the history.
        const {fake, records} = build();
        fake.phase({name: "failed", reason: "blocked", detail: "The tank is low."});
        expect(records).toHaveLength(0);
    });

    it("records a brew that lost contact, at the limit of what was seen", () => {
        const {fake, records} = build();
        fake.phase({name: "pouring", pour: 1, pours: 2});
        fake.water(40);
        fake.phase({name: "lostContact"});
        expect(records[0].record).toMatchObject({outcome: "lostContact", waterTotal: 40});
    });

    it("emits once, however many terminal phases arrive", () => {
        // `cancelled` is routinely followed by `idle`, and a machine that drops
        // mid-cancel can produce both. Two rows for one brew is a bug a user
        // would see.
        const {fake, records} = build();
        fake.phase({name: "pouring", pour: 1, pours: 2});
        fake.water(40);
        fake.phase({name: "cancelled"});
        fake.phase({name: "done"});
        expect(records).toHaveLength(1);
    });

    it("stops listening once stopped, and emits nothing", () => {
        const {fake, records, recorder} = build();
        recorder.stop();
        fake.phase({name: "pouring", pour: 1, pours: 2});
        fake.water(40);
        fake.phase({name: "done"});
        expect(recorder.samples).toHaveLength(0);
        expect(records).toHaveLength(0);
    });

    it("counts the overrun as held time", () => {
        // The plan is 70 s: 40 ml at 4 ml/s, a 20 s pause, then 160 ml at 4.
        const {fake, time, records} = build();
        fake.phase({name: "pouring", pour: 1, pours: 2});
        time.advance(84_000);
        fake.water(200);
        fake.phase({name: "done"});
        expect(records[0].record.heldSeconds).toBe(14);
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest library/brew/__tests__/BrewRecorder.test.ts`
Expected: FAIL — `Cannot find module '@/library/brew/BrewRecorder'`.

- [ ] **Step 3: Write the implementation**

```ts
// library/brew/BrewRecorder.ts
import {resolveAccent} from "@/library/accent";
import type {BrewFailure, BrewPhase} from "@/library/machine/Machine";
import type {Notification} from "@/library/machine/protocol";
import type Recipe from "@/library/Recipe";

import type {BrewOutcome, BrewRecord, BrewSample} from "./BrewRecord";
import {summarise} from "./BrewRecord";
import {plannedSeconds} from "./brewShape";

/** The part of `Machine` a recorder needs. Narrow, so a test can be a literal. */
export type RecorderMachine = {
    onNotification: (listener: (parsed: Notification) => void) => () => void;
    onPhase: (listener: (phase: BrewPhase) => void) => () => void;
};

export type RecorderOptions = {
    machine: RecorderMachine;
    recipe: Recipe;
    onRecord: (record: BrewRecord, samples: BrewSample[]) => void;
    /** Injected so a test can advance time by hand rather than by waiting. */
    now?: () => number;
    newId?: () => string;
};

const TERMINAL: ReadonlySet<BrewPhase["name"]> =
    new Set(["done", "cancelled", "lostContact", "failed"]);

function defaultId(): string {
    return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/**
 * Watches one brew and writes down what happened.
 *
 * Subscribes rather than being called: the weights arrive ten times a second
 * from a machine that knows nothing about screens, and a recorder that had to
 * be pumped by a component would stop the moment the user dismissed the sheet.
 */
export default class BrewRecorder {
    private readonly options: RecorderOptions;
    private readonly collected: BrewSample[] = [];
    private unsubscribers: (() => void)[] = [];

    private startedAt = 0;
    /** Wall clock of the first drop, or 0 before it. The samples' zero. */
    private pouringAt = 0;
    private pour = 0;
    private pours = 0;
    private cup = 0;
    private emitted = false;

    constructor(options: RecorderOptions) {
        this.options = options;
    }

    get samples(): readonly BrewSample[] {
        return this.collected;
    }

    start(): void {
        const {machine} = this.options;
        this.startedAt = this.clock();
        this.unsubscribers = [
            machine.onNotification((parsed) => this.receive(parsed)),
            machine.onPhase((phase) => this.observe(phase))
        ];
    }

    /** Unsubscribe without emitting. For a screen going away, not a brew ending. */
    stop(): void {
        this.unsubscribers.forEach((off) => off());
        this.unsubscribers = [];
    }

    private clock(): number {
        return (this.options.now ?? Date.now)();
    }

    private receive(parsed: Notification): void {
        if (parsed.kind === "cupWeight") {
            this.cup = parsed.grams;
            return;
        }
        // Sampled on water alone. Both channels arrive at about 10 Hz, so
        // sampling on each would double the stream to hold a second copy of
        // the same instant, and the cup's value is carried through anyway.
        if (parsed.kind !== "waterWeight") return;
        // Before the first drop the machine is grinding and the plan has not
        // started. Nothing it says then belongs on the plan's axis.
        if (this.pouringAt === 0) return;
        this.collected.push({
            at: this.clock() - this.pouringAt,
            water: parsed.grams,
            cup: this.cup,
            pour: this.pour
        });
    }

    private observe(phase: BrewPhase): void {
        if (phase.name === "pouring") {
            if (this.pouringAt === 0) this.pouringAt = this.clock();
            this.pour = phase.pour;
            this.pours = phase.pours;
            return;
        }
        if (!TERMINAL.has(phase.name)) return;
        // A refusal before anything was sent is not a brew. No frame went out
        // and no dose was spent, so there is nothing to keep.
        if (phase.name === "failed" && phase.reason === "blocked") {
            this.stop();
            return;
        }
        this.emit(phase);
    }

    private emit(phase: BrewPhase): void {
        // `cancelled` is routinely followed by another phase, and a machine
        // that drops mid-cancel produces two terminals for one brew.
        if (this.emitted) return;
        this.emitted = true;
        this.stop();

        const {recipe} = this.options;
        const failure: BrewFailure | null =
            phase.name === "failed" ? phase.reason : null;
        const record: BrewRecord = {
            id: (this.options.newId ?? defaultId)(),
            recipeUuid: recipe.uuid,
            recipeName: recipe.displayName(),
            accent: resolveAccent(recipe),
            startedAt: this.startedAt,
            endedAt: this.clock(),
            outcome: phase.name as BrewOutcome,
            failure,
            pours: this.pours > 0 ? this.pours : recipe.pours.length,
            ...summarise(this.collected, plannedSeconds(recipe.pours))
        };
        this.options.onRecord(record, [...this.collected]);
    }
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest library/brew/__tests__/BrewRecorder.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add library/brew
git commit -m "feat(brew): record a brew from the machine's own stream

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: The store

**Files:**
- Create: `library/BrewDatabase.ts`
- Test: `library/__tests__/BrewDatabase.test.ts`

Two tables, because they have two lifetimes. A record is a line of history and
is small; a stream is about 2 400 samples for a four-minute brew and is only
worth keeping for the brews you are still dialling in. The retention setting
sweeps streams and never touches records, so history stays complete while the
disk does not grow without bound.

The stream is **one JSON row per brew**, not a row per sample. Nothing ever
queries inside a stream: it is read whole to draw a line and deleted whole by
the sweep, and a row per sample would be 2 400 inserts for that.

`hasStream` is stored on the record rather than derived with a `COUNT(*)` per
row: the history list needs it for every row it draws, and a per-row count is a
query per row.

**Follow the house style in `library/RecipeDatabase.ts`** — the synchronous
expo-sqlite API (`openDatabaseSync`, `execSync`, `runSync`, `getAllSync`,
`withTransactionSync`), a `createTable()` from the constructor, and `PRAGMA
journal_mode = WAL`. Do not introduce the async API for one class.

The sweep is written in TypeScript — read the ids, delete beyond the keep count
— rather than as one clever `DELETE ... WHERE id IN (SELECT ... LIMIT -1 OFFSET
?)`. The row counts are dozens, the saving is nothing, and the plain version is
the one a reader can check.

- [ ] **Step 1: Write the failing test**

```ts
// library/__tests__/BrewDatabase.test.ts
import BrewDatabase from "@/library/BrewDatabase";
import type {BrewRecord, BrewSample} from "@/library/brew/BrewRecord";

/**
 * An in-memory stand-in for expo-sqlite, in the same spirit as the one in
 * RecipeDatabase.test.ts: expo-sqlite is a native module with no working
 * implementation under Jest, so the mock understands exactly the literal query
 * shapes BrewDatabase sends and nothing else. If you add a query, teach the
 * mock about it — do not loosen the matching.
 */
type BrewRow = Record<string, string | number | null>;
type SampleRow = {brewId: string; stream: string};

jest.mock("expo-sqlite", () => ({
    openDatabaseSync: () => {
        const brews: BrewRow[] = [];
        const samples: SampleRow[] = [];
        return {
            execSync: () => {
                // CREATE TABLE / PRAGMA only; in memory there is nothing to do.
            },
            withTransactionSync: (task: () => void) => {
                const brewSnapshot = brews.map((row) => ({...row}));
                const sampleSnapshot = samples.map((row) => ({...row}));
                try {
                    task();
                } catch (error) {
                    brews.length = 0;
                    brews.push(...brewSnapshot);
                    samples.length = 0;
                    samples.push(...sampleSnapshot);
                    throw error;
                }
            },
            runSync: (source: string, params: (string | number | null)[] = []) => {
                if (/^\s*INSERT INTO brews/i.test(source)) {
                    const keys = source.match(/\(([^)]+)\)\s*VALUES/i)![1]
                        .split(",").map((k) => k.trim());
                    const row: BrewRow = {};
                    keys.forEach((key, index) => { row[key] = params[index]; });
                    brews.push(row);
                } else if (/^\s*INSERT INTO brew_samples/i.test(source)) {
                    samples.push({brewId: params[0] as string, stream: params[1] as string});
                } else if (/^\s*UPDATE brews SET hasStream/i.test(source)) {
                    const row = brews.find((b) => b.id === params[0]);
                    if (row) row.hasStream = 0;
                } else if (/^\s*DELETE FROM brew_samples/i.test(source)) {
                    for (let i = samples.length - 1; i >= 0; i -= 1) {
                        if (samples[i].brewId === params[0]) samples.splice(i, 1);
                    }
                } else if (/^\s*DELETE FROM brews/i.test(source)) {
                    const index = brews.findIndex((b) => b.id === params[0]);
                    if (index >= 0) brews.splice(index, 1);
                }
            },
            getAllSync: (source: string, params: (string | number)[] = []) => {
                if (/FROM brew_samples/i.test(source)) {
                    return samples.filter((s) => s.brewId === params[0]);
                }
                const ordered = [...brews]
                    .sort((a, b) => (b.startedAt as number) - (a.startedAt as number));
                if (/WHERE id = \?/i.test(source)) {
                    return ordered.filter((b) => b.id === params[0]);
                }
                return ordered;
            }
        };
    }
}));

function record(overrides: Partial<BrewRecord> = {}): BrewRecord {
    return {
        id: "brew-1",
        recipeUuid: "uuid-1",
        recipeName: "Ethiopia Guji",
        accent: "#C86A3B",
        startedAt: 1_000_000,
        endedAt: 1_240_000,
        outcome: "done",
        failure: null,
        pours: 2,
        waterTotal: 250,
        cupTotal: 244,
        heldSeconds: 14,
        ...overrides
    };
}

const stream: BrewSample[] = [
    {at: 0, water: 0, cup: 0, pour: 1},
    {at: 1000, water: 4, cup: 2, pour: 1}
];

describe("BrewDatabase", () => {
    it("round-trips a record", () => {
        const db = new BrewDatabase();
        db.insert(record(), []);
        expect(db.get("brew-1")).toEqual({...record(), hasStream: false});
    });

    it("restores null rather than the string 'null' for a clean brew", () => {
        // SQLite has no boolean and no undefined. A failure column that came
        // back as the four characters "null" would render as a failure banner
        // on a brew that went perfectly.
        const db = new BrewDatabase();
        db.insert(record(), []);
        expect(db.get("brew-1")?.failure).toBeNull();
    });

    it("keeps the failure reason", () => {
        const db = new BrewDatabase();
        db.insert(record({outcome: "failed", failure: "noWater"}), []);
        expect(db.get("brew-1")).toMatchObject({outcome: "failed", failure: "noWater"});
    });

    it("round-trips a stream", () => {
        const db = new BrewDatabase();
        db.insert(record(), stream);
        expect(db.samples("brew-1")).toEqual(stream);
        expect(db.get("brew-1")?.hasStream).toBe(true);
    });

    it("lists the most recent brew first", () => {
        const db = new BrewDatabase();
        db.insert(record({id: "old", startedAt: 1}), []);
        db.insert(record({id: "new", startedAt: 2}), []);
        expect(db.all().map((b) => b.id)).toEqual(["new", "old"]);
    });

    it("deletes a brew and its stream together", () => {
        const db = new BrewDatabase();
        db.insert(record(), stream);
        db.remove("brew-1");
        expect(db.get("brew-1")).toBeNull();
        expect(db.samples("brew-1")).toEqual([]);
    });

    it("sweeps streams beyond the keep count and leaves the records", () => {
        const db = new BrewDatabase();
        db.insert(record({id: "a", startedAt: 1}), stream);
        db.insert(record({id: "b", startedAt: 2}), stream);
        db.insert(record({id: "c", startedAt: 3}), stream);

        db.sweep(2);

        expect(db.all().map((b) => b.id)).toEqual(["c", "b", "a"]);
        expect(db.samples("a")).toEqual([]);
        expect(db.get("a")?.hasStream).toBe(false);
        expect(db.samples("b")).toEqual(stream);
    });

    it("sweeps nothing when the keep count covers everything", () => {
        const db = new BrewDatabase();
        db.insert(record({id: "a", startedAt: 1}), stream);
        db.sweep(10);
        expect(db.samples("a")).toEqual(stream);
    });

    it("drops every stream when told to keep none", () => {
        // The retention picker's "Don't keep traces" position. Zero must mean
        // zero, not fall through to a default.
        const db = new BrewDatabase();
        db.insert(record({id: "a", startedAt: 1}), stream);
        db.sweep(0);
        expect(db.samples("a")).toEqual([]);
        expect(db.all()).toHaveLength(1);
    });

    it("clears every brew", () => {
        const db = new BrewDatabase();
        db.insert(record({id: "a", startedAt: 1}), stream);
        db.insert(record({id: "b", startedAt: 2}), stream);
        db.clear();
        expect(db.all()).toEqual([]);
        expect(db.samples("a")).toEqual([]);
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest library/__tests__/BrewDatabase.test.ts`
Expected: FAIL — `Cannot find module '@/library/BrewDatabase'`.

- [ ] **Step 3: Write the implementation**

```ts
// library/BrewDatabase.ts
import * as SQLite from "expo-sqlite";

import type {BrewFailure} from "./machine/Machine";
import type {BrewOutcome, BrewRecord, BrewSample} from "./brew/BrewRecord";

/** A record as it comes back out, with whether its stream survived retention. */
export type StoredBrew = BrewRecord & {hasStream: boolean};

type BrewRow = {
    id: string;
    recipeUuid: string;
    recipeName: string;
    accent: string;
    startedAt: number;
    endedAt: number;
    outcome: string;
    failure: string | null;
    pours: number;
    waterTotal: number;
    cupTotal: number;
    heldSeconds: number;
    hasStream: number;
};

/**
 * Brew history, in two tables because they have two lifetimes.
 *
 * `brews` is one short row per brew and is kept until the user deletes it.
 * `brew_samples` is roughly 2 400 rows per brew and is swept by the retention
 * setting, which is why `hasStream` exists: a record whose stream has gone
 * still shows its figures, it just has no trace to draw.
 *
 * The values are copied, not joined to the recipe. A brew is a thing that
 * happened; editing the recipe afterwards, or deleting it, must not rewrite
 * history.
 */
class BrewDatabase {
    private db: SQLite.SQLiteDatabase;

    constructor() {
        this.db = SQLite.openDatabaseSync("xbrecipewriter.db");
        this.createTable();
    }

    private createTable(): void {
        this.db.execSync(`
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS brews (
                id TEXT PRIMARY KEY NOT NULL,
                recipeUuid TEXT NOT NULL,
                recipeName TEXT NOT NULL,
                accent TEXT NOT NULL,
                startedAt INTEGER NOT NULL,
                endedAt INTEGER NOT NULL,
                outcome TEXT NOT NULL,
                failure TEXT,
                pours INTEGER NOT NULL,
                waterTotal REAL NOT NULL,
                cupTotal REAL NOT NULL,
                heldSeconds INTEGER NOT NULL,
                hasStream INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS brew_samples (
                brewId TEXT PRIMARY KEY NOT NULL,
                stream TEXT NOT NULL
            );`);
    }

    public insert(record: BrewRecord, samples: BrewSample[]): void {
        // One transaction, so a brew never half-exists: a record with a
        // truncated stream would draw a trace that stops in mid-air.
        this.db.withTransactionSync(() => {
            this.db.runSync(
                `INSERT INTO brews (id, recipeUuid, recipeName, accent, startedAt, endedAt,
                                    outcome, failure, pours, waterTotal, cupTotal,
                                    heldSeconds, hasStream)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
                [
                    record.id, record.recipeUuid, record.recipeName, record.accent,
                    record.startedAt, record.endedAt, record.outcome, record.failure,
                    record.pours, record.waterTotal, record.cupTotal, record.heldSeconds,
                    samples.length > 0 ? 1 : 0
                ]
            );
            if (samples.length > 0) {
                // One JSON row rather than 2 400 rows per brew. Nothing ever
                // queries inside a stream — it is read whole to draw a line, and
                // deleted whole by the retention sweep.
                this.db.runSync(
                    "INSERT INTO brew_samples (brewId, stream) VALUES (?, ?);",
                    [record.id, JSON.stringify(samples)]
                );
            }
        });
    }

    public all(): StoredBrew[] {
        return this.db
            .getAllSync<BrewRow>("SELECT * FROM brews ORDER BY startedAt DESC;")
            .map(hydrate);
    }

    public get(id: string): StoredBrew | null {
        const rows = this.db.getAllSync<BrewRow>(
            "SELECT * FROM brews WHERE id = ?;", [id]
        );
        return rows.length > 0 ? hydrate(rows[0]) : null;
    }

    public samples(id: string): BrewSample[] {
        const rows = this.db.getAllSync<{stream: string}>(
            "SELECT stream FROM brew_samples WHERE brewId = ?;", [id]
        );
        if (rows.length === 0) return [];
        // A stream that will not parse is a stream that is gone. Losing a trace
        // is a shrug; throwing here would take the history screen down with it.
        try {
            return JSON.parse(rows[0].stream) as BrewSample[];
        } catch {
            return [];
        }
    }

    public remove(id: string): void {
        this.db.withTransactionSync(() => {
            this.db.runSync("DELETE FROM brew_samples WHERE brewId = ?;", [id]);
            this.db.runSync("DELETE FROM brews WHERE id = ?;", [id]);
        });
    }

    public clear(): void {
        this.all().forEach((brew) => this.remove(brew.id));
    }

    /**
     * Drop the streams of every brew older than the `keep` most recent, and
     * mark those records as having no trace. The records themselves stay:
     * history is complete, only the detail behind it expires.
     *
     * Written as a read then a loop rather than one nested DELETE because the
     * row counts are dozens and this version can be checked by reading it.
     */
    public sweep(keep: number): void {
        const expiring = this.all().slice(Math.max(0, keep)).filter((b) => b.hasStream);
        if (expiring.length === 0) return;
        this.db.withTransactionSync(() => {
            expiring.forEach((brew) => {
                this.db.runSync("DELETE FROM brew_samples WHERE brewId = ?;", [brew.id]);
                this.db.runSync("UPDATE brews SET hasStream = 0 WHERE id = ?;", [brew.id]);
            });
        });
    }
}

function hydrate(row: BrewRow): StoredBrew {
    return {
        id: row.id,
        recipeUuid: row.recipeUuid,
        recipeName: row.recipeName,
        accent: row.accent,
        startedAt: row.startedAt,
        endedAt: row.endedAt,
        outcome: row.outcome as BrewOutcome,
        // SQLite has no undefined and no boolean; a missing reason must come
        // back as null, not as the string "null".
        failure: (row.failure ?? null) as BrewFailure | null,
        pours: row.pours,
        waterTotal: row.waterTotal,
        cupTotal: row.cupTotal,
        heldSeconds: row.heldSeconds,
        hasStream: row.hasStream === 1
    };
}

export default BrewDatabase;
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest library/__tests__/BrewDatabase.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Run the whole library suite, then commit**

Run: `npx jest library`
Expected: PASS. The new `openDatabaseSync` mock is file-local, so
`RecipeDatabase.test.ts` must be unaffected — if it is not, the mock has leaked.

```bash
git add library/BrewDatabase.ts library/__tests__/BrewDatabase.test.ts
git commit -m "feat(brew): store brews and their streams, with retention

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Phase 2 — the drawing

### Task 5: The pour glyphs

**Files:**
- Create: `components/PourGlyph.tsx`
- Test: `components/__tests__/PourGlyph.test.tsx`

Four small marks that carry the pattern and the agitation without words:

| Glyph | Mark |
|---|---|
| `centered` | A target: outer ring `r 3.4`, inner ring `r 1.9`, filled bullseye `r 0.85`. |
| `circular` | A plain ring, `r 2.9`, stroke 1. |
| `spiral` | An Archimedean spiral, `r = 0.285θ` over `0 → 4π`, 120 points. |
| `agitation` | Five vertical tremor strokes of unequal height — a shake meter. |

Everything is drawn in a **9-unit viewBox**, which is where those radii come
from and why `0.285` is the spiral's constant: two turns reach `r ≈ 3.58`, just
outside the target's outer ring and just inside the box. Rescaling the box
without rescaling `a` will push the spiral through the edge.

The spiral is sampled rather than approximated with arcs. Two turns drawn as
four half-circle arcs has visible corners at the joins at this size, and the
first attempt at it read as a snail. 120 points is smooth at 44 px and still a
short `d` string.

The agitation mark is five strokes rather than the wave that was tried first:
at 12 px a sine wave is three grey pixels and reads as a smudge. Unequal
heights say tremor; equal heights said barcode.

These are **smooth SVG, not dot matrix**. A spiral in a 9×9 grid strains, and
smooth stays crisp at 12 px, which is the size that matters. Dot bitmaps remain
the vocabulary for action icons — do not "unify" these into `DotIcon`.

- [ ] **Step 1: Write the failing test**

```tsx
// components/__tests__/PourGlyph.test.tsx
import React from "react";

import PourGlyph from "@/components/PourGlyph";
import {palette} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";

describe("PourGlyph", () => {
    it("labels each pattern for a screen reader", async () => {
        const {getByLabelText} = await renderWithProviders(
            <PourGlyph kind="spiral" accent={palette.accent1} />
        );
        expect(getByLabelText("Spiral pour")).toBeTruthy();
    });

    it("labels the agitation mark", async () => {
        const {getByLabelText} = await renderWithProviders(
            <PourGlyph kind="agitation" accent={palette.accent1} />
        );
        // "Agitation", not "shake". The app's word for this is agitation
        // everywhere else, including the editor and the card format.
        expect(getByLabelText("Agitation")).toBeTruthy();
    });

    it("draws the spiral as one open path", async () => {
        const {getByTestId} = await renderWithProviders(
            <PourGlyph kind="spiral" accent={palette.accent1} testID="glyph" />
        );
        const path = getByTestId("glyph-spiral").props.d as string;
        expect(path.startsWith("M")).toBe(true);
        expect(path).not.toContain("Z");
        expect(path.split("L")).toHaveLength(120);
    });

    it("keeps the spiral inside its box", async () => {
        // A spiral that overflows the viewBox is clipped on one side only,
        // which reads as a drawing mistake rather than as a spiral.
        const {getByTestId} = await renderWithProviders(
            <PourGlyph kind="spiral" accent={palette.accent1} testID="glyph" />
        );
        const path = getByTestId("glyph-spiral").props.d as string;
        const numbers = path.match(/-?\d+(\.\d+)?/g)!.map(Number);
        expect(Math.min(...numbers)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...numbers)).toBeLessThanOrEqual(9);
    });

    it("draws five tremor strokes of unequal height", async () => {
        const {getByTestId} = await renderWithProviders(
            <PourGlyph kind="agitation" accent={palette.accent1} testID="glyph" />
        );
        const heights = [0, 1, 2, 3, 4].map(
            (i) => getByTestId(`glyph-tremor-${i}`).props.height as number
        );
        expect(heights).toHaveLength(5);
        // Three distinct heights, symmetric about the middle: a shake meter,
        // not a barcode and not a staircase.
        expect(new Set(heights).size).toBe(3);
        expect(heights).toEqual([...heights].reverse());
    });

    it("draws the centred target as two rings and a bullseye", async () => {
        const {getByTestId} = await renderWithProviders(
            <PourGlyph kind="centered" accent={palette.accent1} testID="glyph" />
        );
        expect(getByTestId("glyph-ring")).toBeTruthy();
        expect(getByTestId("glyph-inner")).toBeTruthy();
        expect(getByTestId("glyph-dot")).toBeTruthy();
    });

    it("draws the circular pattern as one ring, with no target inside it", async () => {
        const {getByTestId, queryByTestId} = await renderWithProviders(
            <PourGlyph kind="circular" accent={palette.accent1} testID="glyph" />
        );
        expect(getByTestId("glyph-ring")).toBeTruthy();
        expect(queryByTestId("glyph-inner")).toBeNull();
        expect(queryByTestId("glyph-dot")).toBeNull();
    });

    it("takes its colour from the accent it is given", async () => {
        const {getByTestId} = await renderWithProviders(
            <PourGlyph kind="circular" accent="#C86A3B" testID="glyph" />
        );
        expect(getByTestId("glyph-ring").props.stroke).toBe("#C86A3B");
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest components/__tests__/PourGlyph.test.tsx`
Expected: FAIL — `Cannot find module '@/components/PourGlyph'`.

- [ ] **Step 3: Write the implementation**

```tsx
// components/PourGlyph.tsx
import React from "react";
import Svg, {Circle, Path, Rect} from "react-native-svg";

import {POUR_PATTERN} from "@/library/Pour";

export type GlyphKind = "centered" | "circular" | "spiral" | "agitation";

type Props = {
    kind: GlyphKind;
    accent: string;
    size?: number;
    /** Dimmed for a stage that has not run yet. */
    faded?: boolean;
    testID?: string;
};

const BOX = 9;
const MID = BOX / 2;
/** The target's three radii and the plain ring's one, from the spec's table. */
const OUTER = 3.4;
const INNER = 1.9;
const BULLSEYE = 0.85;
const RING = 2.9;

const LABELS: Record<GlyphKind, string> = {
    centered: "Centred pour",
    circular: "Circular pour",
    spiral: "Spiral pour",
    // Agitation, not shake. The card format, the editor and the help text all
    // call it agitation; two words for one thing is one word too many.
    agitation: "Agitation"
};

/** The pattern glyph a pour's stored pattern byte asks for. */
export function glyphForPattern(pattern: number): GlyphKind {
    if (pattern === POUR_PATTERN.SPIRAL) return "spiral";
    if (pattern === POUR_PATTERN.CIRCULAR) return "circular";
    return "centered";
}

/**
 * An Archimedean spiral, `r = a·θ`, sampled as a polyline.
 *
 * Sampled rather than approximated with arcs: two turns as four half-circles
 * has visible corners at the joins at this size. `a = 0.285` over two turns
 * reaches `r ≈ 3.58` in the 9-unit box — just outside the target's outer ring,
 * just inside the edge. Change the box and you must change `a`.
 */
function spiralPath(points = 120, turns = 2, a = 0.285): string {
    const commands: string[] = [];
    for (let i = 0; i < points; i += 1) {
        const theta = (i / (points - 1)) * turns * 2 * Math.PI;
        const r = a * theta;
        const x = round(MID + r * Math.cos(theta));
        const y = round(MID + r * Math.sin(theta));
        commands.push(`${i === 0 ? "M" : "L"}${x} ${y}`);
    }
    return commands.join(" ");
}

function round(value: number): number {
    return Math.round(value * 100) / 100;
}

/** Unequal and symmetric, because equal heights read as a barcode. */
const TREMORS = [1.6, 2.8, 3.8, 2.8, 1.6];

export default function PourGlyph({kind, accent, size = 24, faded = false, testID}: Props) {
    const stroke = accent;
    const id = (suffix: string) => (testID === undefined ? undefined : `${testID}-${suffix}`);

    return (
        <Svg
            width={size}
            height={size}
            viewBox={`0 0 ${BOX} ${BOX}`}
            opacity={faded ? 0.35 : 1}
            accessibilityRole="image"
            accessibilityLabel={LABELS[kind]}
            testID={testID}
        >
            {kind === "spiral" && (
                <Path
                    testID={id("spiral")}
                    d={spiralPath()}
                    stroke={stroke}
                    strokeWidth={0.6}
                    strokeLinecap="round"
                    fill="none"
                />
            )}
            {(kind === "centered" || kind === "circular") && (
                <Circle
                    testID={id("ring")}
                    cx={MID}
                    cy={MID}
                    r={kind === "centered" ? OUTER : RING}
                    stroke={stroke}
                    strokeWidth={0.6}
                    fill="none"
                />
            )}
            {kind === "centered" && (
                <Circle
                    testID={id("inner")}
                    cx={MID}
                    cy={MID}
                    r={INNER}
                    stroke={stroke}
                    strokeWidth={0.6}
                    fill="none"
                />
            )}
            {kind === "centered" && (
                <Circle testID={id("dot")} cx={MID} cy={MID} r={BULLSEYE} fill={stroke} />
            )}
            {kind === "agitation" && TREMORS.map((height, index) => (
                <Rect
                    key={index}
                    testID={id(`tremor-${index}`)}
                    x={1.6 + index * 1.45}
                    y={MID - height / 2}
                    width={0.6}
                    height={height}
                    rx={0.3}
                    fill={stroke}
                />
            ))}
        </Svg>
    );
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest components/__tests__/PourGlyph.test.tsx`
Expected: PASS, 8 tests.

If the "keeps the spiral inside its box" test fails, do **not** raise the
viewBox — lower `a` until it passes. The box is shared with the other glyphs.

- [ ] **Step 5: Commit**

```bash
git add components/PourGlyph.tsx components/__tests__/PourGlyph.test.tsx
git commit -m "feat(brew): pattern and agitation glyphs

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: The trace

**Files:**
- Create: `components/BrewTrace.tsx`
- Test: `components/__tests__/BrewTrace.test.tsx`

Three lines on one plane: the plan as a dashed staircase, the machine's water
solid in the recipe's accent, the cup's weight dotted and trailing beneath.

**The box grows to fit what happened, not what was planned.** A brew held by
overflow protection finishes right of its plan, and the whole point of §5.5 is
that the finished chart is a truthful account rather than a tidied one — so the
time axis extends and the plan stays where it was, ending short. The gap is
then labelled, in seconds, at the point the two lines part company.

This component draws; it does not animate. The phase animations are Task 13 and
arrive as a `lineOpacity` / `lineColor` pair from above, so the drawing stays
testable with plain numbers.

- [ ] **Step 1: Write the failing test**

```tsx
// components/__tests__/BrewTrace.test.tsx
import React from "react";

import BrewTrace from "@/components/BrewTrace";
import type {BrewSample} from "@/library/brew/BrewRecord";
import Pour from "@/library/Pour";
import {renderWithProviders} from "@/test-utils/render";

const pours = [new Pour(1, 40, 93, 40, 0, 0, 20), new Pour(2, 160, 92, 40, 0, 0, 0)];

function samples(...rows: [number, number, number][]): BrewSample[] {
    return rows.map(([at, water, cup]) => ({at, water, cup, pour: 1}));
}

async function draw(props: Partial<React.ComponentProps<typeof BrewTrace>> = {}) {
    return renderWithProviders(
        <BrewTrace
            pours={pours}
            samples={[]}
            accent="#C86A3B"
            width={300}
            height={140}
            plannedSeconds={70}
            {...props}
        />
    );
}

describe("BrewTrace", () => {
    it("draws the plan dashed", async () => {
        const {getByTestId} = await draw();
        expect(getByTestId("trace-plan").props.strokeDasharray).toBeTruthy();
    });

    it("draws no live line before any water has moved", async () => {
        // An empty path attribute and a path of one point both render as
        // artefacts. Before the first sample there is simply no line.
        const {queryByTestId} = await draw();
        expect(queryByTestId("trace-water")).toBeNull();
        expect(queryByTestId("trace-cup")).toBeNull();
    });

    it("draws the water line in the accent", async () => {
        const {getByTestId} = await draw({samples: samples([0, 0, 0], [5000, 20, 12])});
        expect(getByTestId("trace-water").props.stroke).toBe("#C86A3B");
    });

    it("draws the cup line dotted and beneath", async () => {
        const {getByTestId} = await draw({samples: samples([0, 0, 0], [5000, 20, 12])});
        const cup = getByTestId("trace-cup");
        expect(cup.props.strokeDasharray).toBeTruthy();
        // Same x, lower value, so a larger y. Screen coordinates run downward.
        const lastY = (path: string) => Number(path.split(" ").pop());
        expect(lastY(cup.props.d)).toBeGreaterThan(lastY(getByTestId("trace-water").props.d));
    });

    it("keeps the axis at the plan while the brew is on time", async () => {
        const {getByTestId} = await draw({samples: samples([0, 0, 0], [70_000, 200, 190])});
        // The plan fills the full width: nothing overran it.
        expect(getByTestId("trace-plan").props.d).toContain("300");
    });

    it("stretches the axis when the brew overran, and labels the gap", async () => {
        const {getByText} = await draw({samples: samples([0, 0, 0], [84_000, 200, 190])});
        expect(getByText("+14 S")).toBeTruthy();
    });

    it("says nothing about a gap the user cannot see", async () => {
        // A second of overrun is a rounding artefact, not a hold.
        const {queryByText} = await draw({samples: samples([0, 0, 0], [71_000, 200, 190])});
        expect(queryByText("+1 S")).toBeNull();
    });

    it("shows the stage counter", async () => {
        const {getByText} = await draw({stage: 3, stages: 5});
        expect(getByText("3/5")).toBeTruthy();
    });

    it("turns the water line amber while the machine is holding", async () => {
        const {getByTestId} = await draw({
            samples: samples([0, 0, 0], [5000, 20, 12]),
            holding: true
        });
        expect(getByTestId("trace-water").props.stroke).toBe(palette.warn);
    });

    it("survives a recipe with no pours", async () => {
        const {queryByTestId} = await draw({pours: [], plannedSeconds: 0});
        expect(queryByTestId("trace-plan")).toBeNull();
    });
});
```

Add `import {palette} from "@/constants/colors";` at the top of the test — the
amber assertion needs it, and a hex literal in a test is the same mistake as a
hex literal in a component.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest components/__tests__/BrewTrace.test.tsx`
Expected: FAIL — `Cannot find module '@/components/BrewTrace'`.

- [ ] **Step 3: Write the implementation**

```tsx
// components/BrewTrace.tsx
import React from "react";
import Svg, {Path} from "react-native-svg";
import {XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import type {BrewSample} from "@/library/brew/BrewRecord";
import {livePoints, planPoints, toPath, type Box} from "@/library/brew/brewShape";
import type Pour from "@/library/Pour";

type Props = {
    pours: Pour[];
    samples: BrewSample[];
    accent: string;
    width: number;
    height: number;
    plannedSeconds: number;
    /** 1-based, for the `3/5` counter. Omitted before the first pour. */
    stage?: number;
    stages?: number;
    /** Overflow protection has stopped the water. Turns the live line amber. */
    holding?: boolean;
    /** Driven by Task 13's phase animations; plain numbers keep this testable. */
    planOpacity?: number;
    planColor?: string;
};

/** Below this an overrun is rounding, not a hold worth naming. */
const GAP_FLOOR_SECONDS = 2;

/**
 * The brew on one plane: what was asked for, what the machine did, what landed
 * in the cup.
 *
 * The axis is sized to the longer of the plan and the run, so a brew held by
 * overflow protection ends right of its plan by exactly the time it lost and
 * the chart records the hold for free. Squeezing the run back onto the plan's
 * axis would erase the one thing worth seeing.
 */
export default function BrewTrace({
    pours, samples, accent, width, height, plannedSeconds,
    stage, stages, holding = false, planOpacity = 1, planColor = palette.muted
}: Props) {
    const plan = planPoints(pours);
    const water = livePoints(samples, "water");
    const cup = livePoints(samples, "cup");

    const ranTo = water.length > 0 ? water[water.length - 1].t : 0;
    const box: Box = {
        width,
        height,
        maxT: Math.max(plannedSeconds, ranTo),
        maxV: Math.max(
            plan.length > 0 ? plan[plan.length - 1].v : 0,
            water.length > 0 ? water[water.length - 1].v : 0
        )
    };

    const planPath = toPath(plan, box);
    const waterPath = toPath(water, box);
    const cupPath = toPath(cup, box);
    const overrun = Math.round(ranTo - plannedSeconds);

    return (
        <YStack width={width}>
            <XStack justifyContent="flex-end" height={16}>
                {stage !== undefined && stages !== undefined && (
                    <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.4}
                                   color={palette.dim}>
                        {`${stage}/${stages}`}
                    </DotMatrixText>
                )}
            </XStack>
            <Svg width={width} height={height} accessibilityRole="image"
                 accessibilityLabel="Brew trace">
                {planPath !== "" && (
                    <Path
                        testID="trace-plan"
                        d={planPath}
                        stroke={planColor}
                        strokeOpacity={planOpacity}
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                        fill="none"
                    />
                )}
                {cupPath !== "" && (
                    <Path
                        testID="trace-cup"
                        d={cupPath}
                        stroke={palette.muted}
                        strokeWidth={1.5}
                        strokeDasharray="1 3"
                        strokeLinecap="round"
                        fill="none"
                    />
                )}
                {waterPath !== "" && (
                    <Path
                        testID="trace-water"
                        d={waterPath}
                        stroke={holding ? palette.warn : accent}
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                    />
                )}
            </Svg>
            <XStack justifyContent="flex-end" height={16}>
                {overrun >= GAP_FLOOR_SECONDS && (
                    <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.4}
                                   color={palette.warn}>
                        {`+${overrun} S`}
                    </DotMatrixText>
                )}
            </XStack>
        </YStack>
    );
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest components/__tests__/BrewTrace.test.tsx`
Expected: PASS, 10 tests.

`palette.warn` is the app's amber and already exists. Every readout in this
milestone is `DotMatrixText`, never a bare Tamagui `Text` with a font family —
the Doto weights are chosen inside that component and nowhere else.

- [ ] **Step 5: Commit**

```bash
git add components/BrewTrace.tsx components/__tests__/BrewTrace.test.tsx
git commit -m "feat(brew): the trace — plan, water and cup on one plane

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 7: One rung of the ladder

**Files:**
- Create: `components/BrewStageRung.tsx`
- Test: `components/__tests__/BrewStageRung.test.tsx`

Six facts on one line, in a fixed left-to-right order so the eye can run down
the column rather than read each row:

```
06   ◎   94°   ▓▓▓▓▓▓▓▒▒▒▒        45 ml
     │    │     │                  └ volume
     │    │     └ timing lane: solid pour, hatched pause, real seconds
     │    └ temperature
     └ pour pattern
```

The **lane scale is passed in**, not computed here: every rung must share one
scale or the lane means nothing, and the widest stage in the recipe sets it.
The `laneSeconds` prop is that shared maximum.

The **agitation mark sits on the bar's edge** — leading for agitation before,
trailing for after — placed where the event happens in time, so it needs no
label. `Pour.agitation` is a two-bit field: bit 0 before, bit 1 after.

The **fill grows with the live stage** and turns amber when the machine is
holding, which is half of §5.5's answer to overflow protection; the other half
is the lane re-scaling, which the ladder does by raising `laneSeconds`.

- [ ] **Step 1: Write the failing test**

```tsx
// components/__tests__/BrewStageRung.test.tsx
import React from "react";

import BrewStageRung, {type RungState} from "@/components/BrewStageRung";
import {palette} from "@/constants/colors";
import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";
import {renderWithProviders} from "@/test-utils/render";

function pour(overrides: Partial<Pour> = {}): Pour {
    const p = new Pour(1, 45, 94, 40, AGITATION.ALL_OFF, POUR_PATTERN.CENTERED, 20);
    Object.assign(p, overrides);
    return p;
}

async function draw(props: Partial<React.ComponentProps<typeof BrewStageRung>> = {}) {
    return renderWithProviders(
        <BrewStageRung
            pour={pour()}
            index={5}
            state="pending"
            accent="#C86A3B"
            laneSeconds={60}
            laneWidth={120}
            progress={0}
            {...props}
        />
    );
}

describe("BrewStageRung", () => {
    it("numbers the stage from one, padded", async () => {
        // Padded so a nine-stage recipe's numbers form a column rather than a
        // ragged edge.
        const {getByText} = await draw();
        expect(getByText("06")).toBeTruthy();
    });

    it("shows temperature and volume", async () => {
        const {getByText} = await draw();
        expect(getByText("94°")).toBeTruthy();
        expect(getByText("45 ml")).toBeTruthy();
    });

    it("shows the pattern glyph", async () => {
        const {getByLabelText} = await draw({pour: pour({pourPattern: POUR_PATTERN.SPIRAL})});
        expect(getByLabelText("Spiral pour")).toBeTruthy();
    });

    it("draws the pour and its pause to real seconds on a shared scale", async () => {
        // 45 ml at 4 ml/s is 11.25 s of pour, then a 20 s pause: 31.25 s of a
        // 60 s lane 120 px wide.
        const {getByTestId} = await draw();
        expect(getByTestId("rung-pour").props.style.width).toBeCloseTo(22.5, 1);
        expect(getByTestId("rung-pause").props.style.width).toBeCloseTo(40, 1);
    });

    it("draws no pause bar for a stage that has none", async () => {
        const {queryByTestId} = await draw({pour: pour({pauseTime: 0})});
        expect(queryByTestId("rung-pause")).toBeNull();
    });

    it("puts the agitation mark on the leading edge for agitation before", async () => {
        const {getByTestId, queryByTestId} = await draw({
            pour: pour({agitation: AGITATION.BEFORE_ON_AFTER_OFF})
        });
        expect(getByTestId("rung-agitation-before")).toBeTruthy();
        expect(queryByTestId("rung-agitation-after")).toBeNull();
    });

    it("puts it on the trailing edge for agitation after", async () => {
        const {getByTestId, queryByTestId} = await draw({
            pour: pour({agitation: AGITATION.BEFORE_OFF_AFTER_ON})
        });
        expect(getByTestId("rung-agitation-after")).toBeTruthy();
        expect(queryByTestId("rung-agitation-before")).toBeNull();
    });

    it("draws both marks when both are on", async () => {
        const {getByTestId} = await draw({
            pour: pour({agitation: AGITATION.BEFORE_ON_AFTER_ON})
        });
        expect(getByTestId("rung-agitation-before")).toBeTruthy();
        expect(getByTestId("rung-agitation-after")).toBeTruthy();
    });

    it("fills the lane in proportion to the live stage's progress", async () => {
        const {getByTestId} = await draw({state: "active", progress: 0.5});
        expect(getByTestId("rung-fill").props.style.width).toBeCloseTo(60, 1);
    });

    it("shows a full lane on a stage that is done", async () => {
        const {getByTestId} = await draw({state: "done", progress: 1});
        expect(getByTestId("rung-fill").props.style.width).toBeCloseTo(120, 1);
    });

    it("turns the fill amber while the machine is holding", async () => {
        const {getByTestId} = await draw({state: "active", progress: 0.5, holding: true});
        expect(getByTestId("rung-fill").props.style.backgroundColor).toBe(palette.warn);
    });

    it("fades a stage that has not run yet", async () => {
        const {getByTestId} = await draw({state: "pending", testID: "rung"});
        expect(getByTestId("rung").props.style.opacity).toBeLessThan(1);
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest components/__tests__/BrewStageRung.test.tsx`
Expected: FAIL — `Cannot find module '@/components/BrewStageRung'`.

- [ ] **Step 3: Write the implementation**

```tsx
// components/BrewStageRung.tsx
import React from "react";
import {View} from "react-native";
import {XStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import PourGlyph, {glyphForPattern} from "@/components/PourGlyph";
import {palette} from "@/constants/colors";
import {pauseSeconds, pourSeconds} from "@/library/brew/brewShape";
import type Pour from "@/library/Pour";

/** Where a stage stands relative to the live one. */
export type RungState = "done" | "active" | "pending";

type Props = {
    pour: Pour;
    /** Zero-based; the rung numbers itself from one. */
    index: number;
    state: RungState;
    accent: string;
    /** The widest stage in the recipe. Shared, or the lane means nothing. */
    laneSeconds: number;
    laneWidth: number;
    /** 0 to 1 through this stage. 1 for a stage that is done. */
    progress: number;
    holding?: boolean;
    testID?: string;
};

const LANE_HEIGHT = 8;

export default function BrewStageRung({
    pour, index, state, accent, laneSeconds, laneWidth, progress,
    holding = false, testID
}: Props) {
    const span = laneSeconds > 0 ? laneSeconds : 1;
    const pourWidth = (pourSeconds(pour) / span) * laneWidth;
    const pauseWidth = (pauseSeconds(pour) / span) * laneWidth;
    // Bit 0 is agitation before, bit 1 after. Two booleans in one byte on the
    // card, and they stay two booleans here.
    const before = (pour.agitation & 1) !== 0;
    const after = (pour.agitation & 2) !== 0;

    return (
        <XStack
            testID={testID}
            alignItems="center"
            gap="$2"
            paddingVertical="$1.5"
            style={{opacity: state === "pending" ? 0.45 : 1}}
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

            <View style={{width: laneWidth, height: LANE_HEIGHT, justifyContent: "center"}}>
                <XStack height={LANE_HEIGHT} alignItems="center">
                    <View
                        testID="rung-pour"
                        style={{
                            width: pourWidth,
                            height: LANE_HEIGHT,
                            borderRadius: LANE_HEIGHT / 2,
                            backgroundColor: palette.raised
                        }}
                    />
                    {pauseWidth > 0 && (
                        <View
                            testID="rung-pause"
                            style={{
                                width: pauseWidth,
                                height: LANE_HEIGHT,
                                borderRadius: LANE_HEIGHT / 2,
                                // Hatching is a dashed border rather than an SVG
                                // pattern: one view, and it reads correctly at
                                // 8 px where a pattern fill turns to mush.
                                borderWidth: 1,
                                borderStyle: "dashed",
                                borderColor: palette.line,
                                backgroundColor: "transparent"
                            }}
                        />
                    )}
                </XStack>
                {/* The live fill, over the lane rather than beside it, so the
                    two cannot drift apart by a pixel of layout rounding. */}
                <View
                    testID="rung-fill"
                    style={{
                        position: "absolute",
                        left: 0,
                        width: Math.max(0, Math.min(1, progress)) * laneWidth,
                        height: LANE_HEIGHT,
                        borderRadius: LANE_HEIGHT / 2,
                        backgroundColor: holding ? palette.warn : accent
                    }}
                />
                {before && (
                    <View testID="rung-agitation-before"
                          style={{position: "absolute", left: -3}}>
                        <PourGlyph kind="agitation" accent={palette.dim} size={10} />
                    </View>
                )}
                {after && (
                    <View testID="rung-agitation-after"
                          style={{position: "absolute", left: pourWidth + pauseWidth - 7}}>
                        <PourGlyph kind="agitation" accent={palette.dim} size={10} />
                    </View>
                )}
            </View>

            <DotMatrixText fontSize={12} weight="bold" color={palette.dim}>
                {`${Math.max(pour.volume, 0)} ml`}
            </DotMatrixText>
        </XStack>
    );
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest components/__tests__/BrewStageRung.test.tsx`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add components/BrewStageRung.tsx components/__tests__/BrewStageRung.test.tsx
git commit -m "feat(brew): one stage rung, six facts on a line

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 8: The ladder

**Files:**
- Create: `components/BrewStageLadder.tsx`
- Test: `components/__tests__/BrewStageLadder.test.tsx`

The rungs, in a scroll view, with the active one expanded **in place** — the
card opens directly beneath its own rung, never at the bottom of the list. That
was the one thing the nine-stage mock got wrong and the five-stage mock got
right.

Nine stages is the xBloom's maximum and the ladder is **deliberately not
compacted** at that length. Scrolling costs less than legibility, and the
auto-scroll keeps the live stage in view so the cost is usually zero.

The expanded card is a **legend built into the thing it explains**: each glyph
beside its word, so the vocabulary is learned in passing rather than looked up.
It also carries the holding copy from §5.5 when the machine has stopped.

The lane **re-scales as the brew stretches**: `laneSeconds` is the widest stage
the recipe planned, raised to the live stage's elapsed time once that exceeds
it. That is what makes an overflow-protection hold visible as a growing amber
wedge rather than a bar silently pinned at full.

- [ ] **Step 1: Write the failing test**

```tsx
// components/__tests__/BrewStageLadder.test.tsx
import React from "react";

import BrewStageLadder from "@/components/BrewStageLadder";
import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";
import {renderWithProviders} from "@/test-utils/render";

function pours(count: number): Pour[] {
    return Array.from({length: count}, (_, i) =>
        new Pour(i + 1, 40, 93, 40, AGITATION.ALL_OFF, POUR_PATTERN.CENTERED, 10));
}

async function draw(props: Partial<React.ComponentProps<typeof BrewStageLadder>> = {}) {
    return renderWithProviders(
        <BrewStageLadder
            pours={pours(5)}
            accent="#C86A3B"
            activeIndex={1}
            stageElapsed={0}
            {...props}
        />
    );
}

describe("BrewStageLadder", () => {
    it("draws one rung per pour", async () => {
        const {getAllByTestId} = await draw({pours: pours(9)});
        expect(getAllByTestId(/^rung-\d+$/)).toHaveLength(9);
    });

    it("opens the card beneath its own rung, not at the end of the list", async () => {
        // The nine-stage mock put it at the bottom and it read as a footer.
        const {getByTestId} = await draw({activeIndex: 1});
        const ladder = getByTestId("ladder");
        const order = ladder.props.children.flat().map(
            (child: {props: {testID?: string}}) => child?.props?.testID
        );
        expect(order.indexOf("stage-card")).toBe(order.indexOf("rung-1") + 1);
    });

    it("shows the glyph legend in the open card", async () => {
        const {getByText} = await draw();
        expect(getByText("AGITATION")).toBeTruthy();
    });

    it("says agitation, never shake", async () => {
        // The word is agitation everywhere: the editor, the help text and the
        // card format all use it, and two words for one thing is one too many.
        const {queryByText} = await draw();
        expect(queryByText(/shake/i)).toBeNull();
    });

    it("explains a hold in the open card", async () => {
        const {getByText} = await draw({holding: true});
        expect(getByText("HOLDING — THE CUP IS BEHIND")).toBeTruthy();
    });

    it("opens no card when no stage is live", async () => {
        const {queryByTestId} = await draw({activeIndex: null});
        expect(queryByTestId("stage-card")).toBeNull();
    });

    it("scales every lane to the widest stage the recipe plans", async () => {
        const wide = pours(2);
        wide[1].pauseTime = 60;
        const {getByTestId} = await draw({pours: wide, activeIndex: null});
        // Stage 2 is 10 s of pour plus 60 s of pause, and fills the lane.
        expect(getByTestId("ladder").props.laneSeconds).toBeCloseTo(70, 1);
    });

    it("re-scales when the live stage outruns its plan", async () => {
        // Overflow protection: the stage is still running well past its span,
        // so the lane grows rather than pinning at full and saying nothing.
        const {getByTestId} = await draw({activeIndex: 0, stageElapsed: 90});
        expect(getByTestId("ladder").props.laneSeconds).toBeCloseTo(90, 1);
    });

    it("marks stages before the live one as done and after it as pending", async () => {
        const {getByTestId} = await draw({activeIndex: 2});
        expect(getByTestId("rung-0").props.style.opacity).toBe(1);
        expect(getByTestId("rung-4").props.style.opacity).toBeLessThan(1);
    });

    it("survives a recipe with no pours", async () => {
        const {queryAllByTestId} = await draw({pours: [], activeIndex: null});
        expect(queryAllByTestId(/^rung-\d+$/)).toHaveLength(0);
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest components/__tests__/BrewStageLadder.test.tsx`
Expected: FAIL — `Cannot find module '@/components/BrewStageLadder'`.

- [ ] **Step 3: Write the implementation**

```tsx
// components/BrewStageLadder.tsx
import React, {useEffect, useRef} from "react";
import {ScrollView, View} from "react-native";
import {XStack, YStack} from "tamagui";

import BrewStageRung, {type RungState} from "@/components/BrewStageRung";
import DotMatrixText from "@/components/DotMatrixText";
import PourGlyph, {glyphForPattern, type GlyphKind} from "@/components/PourGlyph";
import {palette} from "@/constants/colors";
import {pauseSeconds, pourSeconds} from "@/library/brew/brewShape";
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
    /** Seconds spent in the live stage. Drives the fill and the re-scale. */
    stageElapsed: number;
    holding?: boolean;
};

const LANE_WIDTH = 120;
/** Roughly a rung plus its padding; only used to aim the auto-scroll. */
const RUNG_HEIGHT = 34;

const GLYPH_WORDS: [GlyphKind, string][] = [
    ["centered", "CENTRED"],
    ["circular", "CIRCULAR"],
    ["spiral", "SPIRAL"],
    ["agitation", "AGITATION"]
];

function stageSeconds(pour: Pour): number {
    return pourSeconds(pour) + pauseSeconds(pour);
}

/**
 * The stages, as a ladder that scrolls.
 *
 * Not compacted at nine stages — the machine's maximum — because scrolling
 * costs less than legibility, and the auto-scroll usually makes it cost
 * nothing. The open card sits directly beneath its own rung: at the bottom of
 * the list it reads as a footer belonging to no stage in particular.
 */
export default function BrewStageLadder({
    pours, accent, activeIndex, stageElapsed, holding = false
}: Props) {
    const scroller = useRef<ScrollView>(null);

    const planned = pours.reduce((widest, pour) => Math.max(widest, stageSeconds(pour)), 0);
    // Raised by the live stage once it outruns its plan, which is how a hold
    // becomes a growing wedge instead of a bar pinned silently at full.
    const laneSeconds = Math.max(planned, stageElapsed);

    useEffect(() => {
        if (activeIndex === null) return;
        scroller.current?.scrollTo({y: Math.max(0, (activeIndex - 1) * RUNG_HEIGHT), animated: true});
    }, [activeIndex]);

    const rows: React.ReactNode[] = [];
    pours.forEach((pour, index) => {
        const state: RungState =
            activeIndex === null ? "pending"
            : index < activeIndex ? "done"
            : index === activeIndex ? "active"
            : "pending";
        const span = stageSeconds(pour);
        const progress = state === "done"
            ? 1
            : state === "active" && span > 0 ? stageElapsed / span : 0;

        rows.push(
            <BrewStageRung
                key={`rung-${index}`}
                testID={`rung-${index}`}
                pour={pour}
                index={index}
                state={state}
                accent={accent}
                laneSeconds={laneSeconds}
                laneWidth={LANE_WIDTH}
                progress={progress}
                holding={holding && state === "active"}
            />
        );

        if (index === activeIndex) {
            rows.push(
                <YStack
                    key="stage-card"
                    testID="stage-card"
                    backgroundColor={palette.raised}
                    borderRadius="$4"
                    padding="$3"
                    gap="$2"
                    marginBottom="$2"
                >
                    {holding && (
                        <YStack gap="$1">
                            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6}
                                           color={palette.warn}>
                                HOLDING — THE CUP IS BEHIND
                            </DotMatrixText>
                            <DotMatrixText fontSize={11} color={palette.dim}>
                                The machine has stopped the water until the bed drains.
                                It will carry on by itself.
                            </DotMatrixText>
                        </YStack>
                    )}
                    {/* The legend, built into the thing it explains, so the
                        vocabulary is learned in passing. */}
                    {GLYPH_WORDS.map(([kind, word]) => (
                        <XStack key={kind} alignItems="center" gap="$2">
                            <PourGlyph
                                kind={kind}
                                accent={kind === glyphForPattern(pour.pourPattern)
                                    ? accent : palette.dim}
                                size={14}
                            />
                            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.4}
                                           color={palette.dim}>
                                {word}
                            </DotMatrixText>
                        </XStack>
                    ))}
                </YStack>
            );
        }
    });

    return (
        <ScrollView ref={scroller} testID="ladder" laneSeconds={laneSeconds}>
            <View>{rows}</View>
        </ScrollView>
    );
}
```

`laneSeconds` is passed to the `ScrollView` purely so the test can read the
scale it settled on without reaching into a rung's arithmetic. React Native
forwards unknown props to the host node and ignores them; if that ever changes,
move the assertion onto `rung-0`'s bar widths rather than deleting it.

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest components/__tests__/BrewStageLadder.test.tsx`
Expected: PASS, 10 tests.

Note the two ends of `activeIndex`: **null** means the brew has not started, so
every stage is pending; **`pours.length`** means it is over, so every stage is
done. History reuses the second, which is why there is no separate `finished`
prop.

- [ ] **Step 5: Commit**

```bash
git add components/BrewStageLadder.tsx components/__tests__/BrewStageLadder.test.tsx
git commit -m "feat(brew): the stage ladder, with the card open in place

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Phase 3 — the brew screen

### Task 9: The run

**Files:**
- Create: `hooks/useBrewRun.ts`
- Test: `hooks/__tests__/useBrewRun.test.ts`

`useBrew` stays as it is — the phase, the errors, the four commands. `useBrewRun`
wraps it and adds everything the new screen needs: the live samples, the elapsed
clock, which stage is live, whether the machine is holding, and the write to
history when it is over.

**Re-render at 4 Hz, not 10.** The recorder keeps every sample, because the
record should be as good as the radio; the screen copies the buffer four times a
second, which is smooth for a line that takes four minutes to draw and a
fraction of the layout work.

**Holding is the same rule as held time**: the live stage has run past its own
planned span. A planned pause and an overflow-protection hold look identical in
the stream, and the plan is the only thing that can tell them apart. Watching
for a flat run in the water curve was tried on paper and cannot distinguish the
two at all.

- [ ] **Step 1: Write the failing test**

```ts
// hooks/__tests__/useBrewRun.test.ts
import {act, renderHook} from "@testing-library/react-native";

import {useBrewRun} from "@/hooks/useBrewRun";
import type {BrewRecord, BrewSample} from "@/library/brew/BrewRecord";
import type {BrewPhase} from "@/library/machine/Machine";
import type {Notification} from "@/library/machine/protocol";
import Pour from "@/library/Pour";
import Recipe from "@/library/Recipe";

jest.mock("@/hooks/useBrew", () => ({
    useBrew: () => global.__brewer
}));

function recipe(): Recipe {
    const r = new Recipe();
    r.name = "Ethiopia Guji";
    // 40 ml at 4 ml/s = 10 s, then a 20 s pause; then 160 ml at 4 ml/s = 40 s.
    r.pours = [new Pour(1, 40, 93, 40, 0, 0, 20), new Pour(2, 160, 92, 40, 0, 0, 0)];
    return r;
}

/** A brewer and a machine the test drives by hand. */
function harness() {
    let notify: (n: Notification) => void = () => {};
    let phase: (p: BrewPhase) => void = () => {};
    const written: {record: BrewRecord; samples: BrewSample[]}[] = [];
    global.__brewer = {
        phase: {name: "idle"} as BrewPhase,
        error: null,
        brew: jest.fn(async () => {}),
        startBrew: jest.fn(async () => {}),
        cancelBrew: jest.fn(async () => {}),
        canOfferProMode: () => false,
        switchToProAndRetry: jest.fn(async () => {}),
        machine: {
            onNotification: (l: typeof notify) => { notify = l; return () => {}; },
            onPhase: (l: typeof phase) => { phase = l; return () => {}; }
        }
    };
    return {
        written,
        water: (grams: number) => act(() => notify({kind: "waterWeight", grams})),
        cup: (grams: number) => act(() => notify({kind: "cupWeight", grams})),
        setPhase: (p: BrewPhase) => act(() => {
            global.__brewer.phase = p;
            phase(p);
        }),
        store: {insert: (record: BrewRecord, samples: BrewSample[]) =>
            written.push({record, samples})}
    };
}

describe("useBrewRun", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("has no samples before the machine pours", async () => {
        const h = harness();
        const {result} = renderHook(() => useBrewRun(recipe(), h.store));
        expect(result.current.samples).toEqual([]);
    });

    it("publishes samples at 4 Hz", async () => {
        const h = harness();
        const {result} = renderHook(() => useBrewRun(recipe(), h.store));
        h.setPhase({name: "pouring", pour: 1, pours: 2});
        h.water(10);
        h.water(20);
        // Nothing is published until the tick: the buffer is the recorder's.
        expect(result.current.samples).toEqual([]);
        act(() => { jest.advanceTimersByTime(250); });
        expect(result.current.samples).toHaveLength(2);
    });

    it("reports the live stage, zero-based", async () => {
        const h = harness();
        const {result} = renderHook(() => useBrewRun(recipe(), h.store));
        h.setPhase({name: "pouring", pour: 2, pours: 2});
        expect(result.current.activeIndex).toBe(1);
    });

    it("reports no live stage before the first pour", async () => {
        const h = harness();
        const {result} = renderHook(() => useBrewRun(recipe(), h.store));
        h.setPhase({name: "grinding"});
        expect(result.current.activeIndex).toBeNull();
    });

    it("marks every stage done once the brew is over", async () => {
        // `pours.length` is the ladder's "all done", so history and the end of
        // a live brew show the same thing.
        const h = harness();
        const {result} = renderHook(() => useBrewRun(recipe(), h.store));
        h.setPhase({name: "pouring", pour: 2, pours: 2});
        h.setPhase({name: "done"});
        expect(result.current.activeIndex).toBe(2);
    });

    it("is not holding while the stage is within its plan", async () => {
        // The clock runs off the samples, not off the wall: the trace and the
        // ladder must agree on one clock, and the stream is it. A held machine
        // still reports its weight ten times a second, so the samples keep
        // coming even when the water does not.
        const h = harness();
        const {result} = renderHook(() => useBrewRun(recipe(), h.store));
        h.setPhase({name: "pouring", pour: 1, pours: 2});
        act(() => { jest.advanceTimersByTime(20_000); });
        h.water(40);
        act(() => { jest.advanceTimersByTime(250); });
        expect(result.current.holding).toBe(false);
    });

    it("is holding once the stage outruns its plan", async () => {
        // Stage 1 is 10 s of pour plus a 20 s pause. Past 30 s, the machine is
        // waiting for the bed to drain.
        const h = harness();
        const {result} = renderHook(() => useBrewRun(recipe(), h.store));
        h.setPhase({name: "pouring", pour: 1, pours: 2});
        act(() => { jest.advanceTimersByTime(34_000); });
        h.water(40);
        act(() => { jest.advanceTimersByTime(250); });
        expect(result.current.holding).toBe(true);
    });

    it("writes the brew to history when it ends", async () => {
        const h = harness();
        renderHook(() => useBrewRun(recipe(), h.store));
        h.setPhase({name: "pouring", pour: 1, pours: 2});
        h.water(40);
        h.setPhase({name: "done"});
        expect(h.written).toHaveLength(1);
        expect(h.written[0].record.recipeName).toBe("Ethiopia Guji");
    });

    it("writes nothing for a brew that was refused before it began", async () => {
        const h = harness();
        renderHook(() => useBrewRun(recipe(), h.store));
        h.setPhase({name: "failed", reason: "blocked", detail: "The tank is low."});
        expect(h.written).toEqual([]);
    });

    it("stops the clock when the brew ends", async () => {
        const h = harness();
        const {result} = renderHook(() => useBrewRun(recipe(), h.store));
        h.setPhase({name: "pouring", pour: 1, pours: 2});
        act(() => { jest.advanceTimersByTime(10_000); });
        h.water(40);
        act(() => { jest.advanceTimersByTime(250); });
        h.setPhase({name: "done"});
        const stopped = result.current.elapsed;
        act(() => { jest.advanceTimersByTime(10_000); });
        expect(result.current.elapsed).toBe(stopped);
    });
});
```

`global.__brewer` needs a type. Add this above the `describe`:

```ts
declare global {
    // eslint-disable-next-line no-var
    var __brewer: ReturnType<typeof import("@/hooks/useBrew").useBrew>
        & {machine: import("@/library/brew/BrewRecorder").RecorderMachine};
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest hooks/__tests__/useBrewRun.test.ts`
Expected: FAIL — `Cannot find module '@/hooks/useBrewRun'`.

- [ ] **Step 3: Extend `useBrew` to expose its machine**

`useBrewRun` needs something to subscribe to, and reaching for a second
`useMachine()` would be a second hook holding the same singleton — harmless
today, and exactly the kind of thing that stops being harmless.

In `hooks/useBrew.ts`, add `machine` to the `Brewer` type and to the returned
object:

```ts
export type Brewer = {
    phase: BrewPhase;
    error: string | null;
    /** The link itself, for a recorder that needs the raw notification stream. */
    machine: Machine;
    brew: (recipe: Recipe) => Promise<void>;
    startBrew: () => Promise<void>;
    cancelBrew: () => Promise<void>;
    canOfferProMode: () => boolean;
    switchToProAndRetry: (recipe: Recipe) => Promise<void>;
};
```

```ts
    return {phase, error, machine, brew, startBrew, cancelBrew,
            canOfferProMode, switchToProAndRetry};
```

- [ ] **Step 4: Write the hook**

```ts
// hooks/useBrewRun.ts
import {useEffect, useRef, useState} from "react";

import {useBrew} from "@/hooks/useBrew";
import BrewRecorder from "@/library/brew/BrewRecorder";
import type {BrewRecord, BrewSample} from "@/library/brew/BrewRecord";
import {pauseSeconds, pourSeconds} from "@/library/brew/brewShape";
import BrewDatabase from "@/library/BrewDatabase";
import type Recipe from "@/library/Recipe";

/** The part of `BrewDatabase` a run writes to. Injected, so tests need no SQLite. */
export type BrewStore = {insert: (record: BrewRecord, samples: BrewSample[]) => void};

/** Four times a second: smooth for a four-minute line, cheap for layout. */
const PUBLISH_MS = 250;

export function useBrewRun(recipe: Recipe, store?: BrewStore) {
    const brewer = useBrew();
    const {machine, phase} = brewer;
    const [samples, setSamples] = useState<BrewSample[]>([]);
    const [elapsed, setElapsed] = useState(0);
    const recorder = useRef<BrewRecorder | null>(null);
    const database = useRef<BrewStore | null>(null);

    // Opened once and lazily: constructing a BrewDatabase at module scope would
    // open SQLite in every test that imports this file, whether or not it
    // brews.
    if (database.current === null) database.current = store ?? new BrewDatabase();

    useEffect(() => {
        const active = new BrewRecorder({
            machine,
            recipe,
            onRecord: (record, taken) => database.current?.insert(record, taken)
        });
        recorder.current = active;
        active.start();
        return () => active.stop();
    }, [machine, recipe]);

    const pouring = phase.name === "pouring";
    const over = ["done", "cancelled", "failed", "lostContact"].includes(phase.name);

    useEffect(() => {
        if (!pouring) return;
        const tick = setInterval(() => {
            const taken = recorder.current?.samples ?? [];
            setSamples([...taken]);
            setElapsed(taken.length > 0 ? taken[taken.length - 1].at / 1000 : 0);
        }, PUBLISH_MS);
        return () => clearInterval(tick);
    }, [pouring]);

    // One last copy on the way out, so the finished chart is the whole brew and
    // not whatever the last tick happened to catch.
    useEffect(() => {
        if (!over) return;
        setSamples([...(recorder.current?.samples ?? [])]);
    }, [over]);

    const activeIndex = pouring
        ? phase.pour - 1
        : over ? recipe.pours.length : null;

    const stageStart = recipe.pours
        .slice(0, Math.max(0, activeIndex ?? 0))
        .reduce((total, pour) => total + pourSeconds(pour) + pauseSeconds(pour), 0);
    const stageElapsed = pouring ? Math.max(0, elapsed - stageStart) : 0;
    const live = activeIndex !== null ? recipe.pours[activeIndex] : undefined;
    const stageSpan = live === undefined ? 0 : pourSeconds(live) + pauseSeconds(live);
    // The stage has run past its own plan, which is what an overflow-protection
    // hold looks like and what a planned pause never does.
    const holding = pouring && stageSpan > 0 && stageElapsed > stageSpan;

    return {...brewer, samples, elapsed, stageElapsed, activeIndex, holding};
}

export default useBrewRun;
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx jest hooks/__tests__/useBrewRun.test.ts`
Expected: PASS, 10 tests.

`jest.useFakeTimers()` mocks `Date.now` as well as the timers, which is what
makes a sample-driven clock testable: advancing the timers moves the clock the
recorder stamps its samples with. Do not switch the hook to its own wall clock
to avoid the `h.water()` calls — the trace and the ladder must agree on one
clock, and the stream is it.

- [ ] **Step 6: Commit**

```bash
git add hooks/useBrewRun.ts hooks/__tests__/useBrewRun.test.ts hooks/useBrew.ts
git commit -m "feat(brew): one brew run, with samples and history

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 10: Three settings

**Files:**
- Modify: `library/Settings.ts`
- Modify: `components/SettingsRows.tsx` (or wherever the Machine and Recipe-list
  sections are assembled — check `app/settings.tsx` first and follow what is
  already there)
- Test: `library/__tests__/Settings.test.ts`, `app/__tests__/settings.test.tsx`

`DEFAULTS` is the single source of both the key list and the value types, so
adding a key produces compile errors at every place that must be updated —
the backup snapshot and `applySettings` among them. That is the design; follow
the errors rather than working around them.

| Key | Default | What it does |
|---|---|---|
| `showBrewOnRecipeRows` | `true` | The BREW capsule on every recipe row (Task 16). |
| `animateBrewChart` | `true` | The phase animations (Task 13), on top of the system Reduced Motion preference. |
| `brewTraceRetention` | `50` | How many brews keep their raw stream. A picker, not a switch. |

- [ ] **Step 1: Write the failing tests**

Append to `library/__tests__/Settings.test.ts`:

```ts
    it("shows BREW on recipe rows unless told otherwise", () => {
        expect(new Settings(fakeStorage()).get("showBrewOnRecipeRows")).toBe(true);
    });

    it("animates the brew chart by default", () => {
        expect(new Settings(fakeStorage()).get("animateBrewChart")).toBe(true);
    });

    it("keeps the last fifty streams by default", () => {
        expect(new Settings(fakeStorage()).get("brewTraceRetention")).toBe(50);
    });

    it("round-trips a retention of zero rather than falling back to the default", () => {
        // "Don't keep traces" is a real choice, and `stored || default` would
        // silently ignore it. The same trap as `false` for a boolean.
        const storage = fakeStorage();
        new Settings(storage).set("brewTraceRetention", 0);
        expect(new Settings(storage).get("brewTraceRetention")).toBe(0);
    });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest library/__tests__/Settings.test.ts`
Expected: FAIL — TypeScript rejects the three unknown keys.

- [ ] **Step 3: Add the keys**

In `library/Settings.ts`, inside `DEFAULTS`, after `machineAutoStart`:

```ts
    /**
     * Whether every recipe row carries a BREW capsule.
     *
     * On by default: reaching the machine from the library is the whole point
     * of the milestone, and a shortcut nobody can see is not a shortcut. It is
     * also a permanent mark on every card, and somebody who brews rarely will
     * want it gone.
     */
    showBrewOnRecipeRows: true,
    /**
     * Whether the brew chart animates between phases.
     *
     * On by default, and layered on top of the system Reduced Motion
     * preference rather than replacing it: the system switch is about
     * vestibular safety and this one is about taste, and answering the first
     * should not require answering the second. When either is off, each
     * animation holds its end state rather than disappearing.
     */
    animateBrewChart: true,
    /**
     * How many brews keep their raw sample stream.
     *
     * A stream is about 2 400 samples — some tens of kilobytes — and only the
     * brews you are still dialling in are worth that. The records themselves
     * are never swept: history stays complete, and only the detail behind it
     * expires. Zero is a real choice and means zero.
     */
    brewTraceRetention: 50
```

- [ ] **Step 4: Follow the compile errors**

Run: `npm run typecheck`

Every error is a place that enumerates settings — the backup snapshot, the
`applySettings` restore path, and possibly a settings-screen list. Add the three
keys to each. Do **not** add them to `NOT_IN_BACKUP`: all three are preferences
about this library and belong in a backup.

Run: `npx jest library/__tests__/Settings.test.ts library/__tests__/backup.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the controls to the settings screen**

`Animate the brew chart` and the retention picker go in the **Machine** section,
next to each other; `Show BREW on recipe rows` goes in the **Recipe list**
section, because that is where the capsule appears. No new section. Copy the row
components already used in that screen — do not invent a new row type.

Retention options: `10`, `50`, `200`, `0` labelled "Don't keep traces".

Add a test to `app/__tests__/settings.test.tsx` in the style of the ones already
there — the file defines its own `memoryStorage()` helper, because a component
that reads `useSetting` without an injected store opens SQLite and throws
`_ExpoSQLite.default.NativeDatabase is not a constructor` under Jest:

```tsx
    it("offers a retention choice, including keeping none", async () => {
        const {getByText} = await renderWithProviders(
            <Settings />, {settings: memoryStorage()}
        );
        expect(getByText("Don't keep traces")).toBeTruthy();
    });
```

Match the existing tests' exact render call — if they pass the store another
way, do that instead.

- [ ] **Step 6: Run the suites and commit**

Run: `npx jest library app`
Expected: PASS.

```bash
git add library/Settings.ts library/__tests__/Settings.test.ts app components
git commit -m "feat(settings): brew capsule, chart animation and trace retention

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 11: A block reason the app can act on

**Files:**
- Modify: `library/machine/Machine.ts` — `brewBlockReason`, line ~572
- Test: `library/machine/__tests__/Machine.test.ts` — the existing coverage is
  at line ~950

`brewBlockReason(recipe)` returns a prose sentence or `null`. The brew screen
now needs to tell a **refusal before anything was sent** from a **mid-brew
failure**, and it must not do that by matching on the text of a sentence.

This is the only change M4 makes to `Machine.ts`. Do not move the recorder into
it — the recorder subscribes from outside, which is what keeps an 892-line file
from becoming a nine-hundred-line one.

- [ ] **Step 1: Write the failing test**

Replace the existing assertion at `library/machine/__tests__/Machine.test.ts:950`
— it currently reads `expect(machine.brewBlockReason(brewable())).toMatch(/water/i)`
— with the typed pair. Keep whatever `machine` and `brewable()` are in scope
there; only the assertion changes.

```ts
        // The brew screen draws a refusal amber with the plan untouched and a
        // mid-brew failure red with the trace frozen. Telling those apart by
        // matching on the text of a sentence would break the first time the
        // sentence was improved.
        expect(machine.brewBlock(brewable())).toEqual({
            kind: "notEnoughWater",
            message: "The machine's water tank is low."
        });
```

And add, immediately after it:

```ts
    it("names each kind of block", () => {
        // One case per branch, so a reordering of the checks cannot silently
        // change which reason a user is given.
        const disconnected = new Machine(fakeTransport());
        expect(disconnected.brewBlock(brewable())?.kind).toBe("notConnected");
    });
```

Use whatever the file already calls its transport double in place of
`fakeTransport()`; a fresh `Machine` that has never connected is enough.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest library/machine`
Expected: FAIL — `machine.brewBlock is not a function`.

- [ ] **Step 3: Add the typed reason**

Above the class in `library/machine/Machine.ts`, beside the other exported
types:

```ts
/** Why a brew will not start, in a form the UI can branch on. */
export type BrewBlock = {
    kind: "notConnected" | "noVitals" | "notEnoughWater" | "busy" | "recipe";
    /** The sentence to show. Still the only thing most callers need. */
    message: string;
};
```

Then replace `brewBlockReason` entirely with this. The sentences are unchanged
— they have been written and reviewed once already, and this task is about the
label beside them, not the words.

```ts
    /**
     * Why this recipe cannot be sent right now, or null.
     *
     * Strict, deliberately: a false refusal costs one more press, a false send
     * costs water on the counter or a brew interrupted halfway. What it cannot
     * check — whether a cup is under the spout, whether the pod is in, whether
     * the beans match the dose — is stated on the brew route instead.
     *
     * Typed rather than prose because the two water failures are not the same
     * event: refused before anything was sent is amber, recoverable and offers
     * TRY AGAIN, while the machine stopping mid-brew is red and deliberately
     * offers nothing, because the dose is already spent.
     */
    brewBlock(recipe: Recipe): BrewBlock | null {
        if (!this.isConnected()) {
            return {kind: "notConnected", message: "The machine is not connected."};
        }
        if (this.info === null) {
            // Not a pedantic check. The water level is reported nowhere else,
            // and "we never heard" is not the same as "the tank is fine" —
            // treating it as such is how a recipe gets committed to a machine
            // with an empty tank.
            return {
                kind: "noVitals",
                message:
                    "The machine has not said how it is doing yet. Reconnect and try again."
            };
        }
        if (!this.info.waterEnough) {
            return {kind: "notEnoughWater", message: "The machine's water tank is low."};
        }
        if (this.state !== null && !STARTABLE.has(this.state)) {
            return {kind: "busy", message: "The machine is busy. Wait for it to finish."};
        }
        const problems = cardWriteProblems(recipe);
        if (problems.length > 0) return {kind: "recipe", message: problems[0]};
        return null;
    }
```

- [ ] **Step 4: Move the one caller over**

Run: `grep -rn "brewBlockReason" app components hooks library`

There is exactly one, in the test file, and Step 1 has already replaced it. If
the grep finds others, change each to `brewBlock(...)?.message ?? null` — the
old method is gone rather than deprecated, because a second way to ask one
question is how the two drift apart.

- [ ] **Step 5: Run the suite and commit**

Run: `npm run typecheck && npx jest library/machine`
Expected: PASS.

```bash
git add library/machine
git commit -m "feat(machine): a block reason the UI can branch on

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 12: The brew screen

**Files:**
- Modify: `app/brew.tsx` (replace the body; 197 lines today)
- Create: `components/BrewFigures.tsx`
- Create: `constants/brewCopy.ts`
- Test: `app/__tests__/brew.test.tsx`, `components/__tests__/BrewFigures.test.tsx`

Three regions: the trace and the figures pinned, the ladder scrolling beneath.
The route is layout only — every value it draws comes from `useBrewRun`.

The copy moves to `constants/brewCopy.ts` because Task 19's history screen shows
the same failures, and two copies of a sentence become two different sentences.

- [ ] **Step 1: Move the copy out, and split water in two**

```ts
// constants/brewCopy.ts

/** What each phase says. The wording is the feature. */
export const PHASE_COPY: Record<string, string> = {
    idle:        "Ready when you are.",
    // The machine loses the question rather than refusing it, and each retry
    // opens a fresh session, which beeps. Saying so explains the beeping.
    waking:      "Waiting for the machine to answer…",
    // Deliberately slow: the frames are spaced two seconds apart, because the
    // machine drops a burst. Saying so stops this reading as a hang.
    sending:     "Sending the recipe… this takes a few seconds.",
    readyToStart: "Recipe loaded. Ready when you are.",
    armed:       "Recipe loaded.",
    // The app never sends 40518, so this is where a parked machine ends up.
    // A notice, not a button: the normal path is START in the app, and this
    // one used to look pressable while doing nothing.
    pressPlay:   "PRESS ▶ ON THE MACHINE",
    grinding:    "Grinding…",
    done:        "Enjoy.",
    cancelled:   "Stopped.",
    lostContact: "Lost contact — the machine is still brewing."
};

export const FAILURE_COPY: Record<string, string> = {
    // The machine stopped mid-brew. Rare, and not the same event as a refusal:
    // this one costs a dose.
    noWater:      "The machine ran out of water.",
    noBeans:      "The machine is waiting for beans.",
    gearPosition: "The grinder could not find its gear position.",
    doseMismatch: "The machine would not accept that dose and water volume.",
    idling:       "The machine went idle before the brew started.",
    rejected:     "The machine would not take the recipe."
};

/**
 * The refusal, which is the common one.
 *
 * Almost daily, where the machine stopping mid-brew has happened twice. The
 * volume is the recipe's own total, not a constant, and the last clause is the
 * point of the whole message: it tells the user their dose is safe.
 */
export function blockedWaterCopy(totalMl: number): string {
    return `The tank will not cover this recipe's ${totalMl} ml. `
        + "Fill it and try again — nothing has been sent to the machine.";
}

export const BLOCKED_WATER_HEADLINE = "NOT ENOUGH WATER FOR THIS BREW";

/**
 * Said once, on a user's first brew, and never again.
 *
 * None of it is detectable — the machine cannot tell us whether a cup is under
 * the spout, whether the pod is loaded, or whether the beans in the hopper are
 * the ones the recipe was written for. So it is stated rather than checked, and
 * stating it every time would train people to stop reading it.
 */
export const FIRST_BREW_REMINDER =
    "Check there is a cup under the spout and a pod in the holder.";

/** The offer to escape EASY mode, when a send has gone nowhere because of it. */
export const PRO_MODE_PROMPT =
    "Your machine is in Easy mode. Switch it to Pro and try again?";

/** The phases during which stopping the machine is still a meaningful thing. */
export const RUNNING = new Set([
    "waking", "sending", "readyToStart", "armed", "pressPlay", "grinding", "pouring"
]);

/**
 * Failures after which TRY AGAIN would be a lie about what one press costs.
 *
 * The dose is ground and the water is spent. Offering a retry here would read
 * as "this one is free".
 */
export const NO_RETRY: ReadonlySet<string> = new Set(["noWater"]);
```

- [ ] **Step 2: Write the figures, with a failing test**

```tsx
// components/__tests__/BrewFigures.test.tsx
import React from "react";

import BrewFigures from "@/components/BrewFigures";
import {renderWithProviders} from "@/test-utils/render";

describe("BrewFigures", () => {
    it("shows water, cup and time", async () => {
        const {getByText} = await renderWithProviders(
            <BrewFigures water={182} cup={174} seconds={126} accent="#C86A3B" />
        );
        expect(getByText("182")).toBeTruthy();
        expect(getByText("174")).toBeTruthy();
        expect(getByText("2:06")).toBeTruthy();
    });

    it("labels each figure", async () => {
        const {getByText} = await renderWithProviders(
            <BrewFigures water={0} cup={0} seconds={0} accent="#C86A3B" />
        );
        ["WATER", "CUP", "TIME"].forEach((label) => expect(getByText(label)).toBeTruthy());
    });

    it("rounds to whole units", async () => {
        // The scale reports tenths and they flicker. A readout that changes
        // every 100 ms is unreadable at this size.
        const {getByText} = await renderWithProviders(
            <BrewFigures water={182.4} cup={173.6} seconds={5.9} accent="#C86A3B" />
        );
        expect(getByText("182")).toBeTruthy();
        expect(getByText("174")).toBeTruthy();
        expect(getByText("0:05")).toBeTruthy();
    });

    it("pads the seconds", async () => {
        const {getByText} = await renderWithProviders(
            <BrewFigures water={0} cup={0} seconds={65} accent="#C86A3B" />
        );
        expect(getByText("1:05")).toBeTruthy();
    });
});
```

Run: `npx jest components/__tests__/BrewFigures.test.tsx` → FAIL, module not found.

```tsx
// components/BrewFigures.tsx
import React from "react";
import {XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";

type Props = {
    water: number;
    cup: number;
    seconds: number;
    accent: string;
};

/** `2:06`. Floored, not rounded: a clock that shows 2:07 at 2:06.6 is wrong. */
function clock(seconds: number): string {
    const whole = Math.floor(Math.max(0, seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function Figure({label, value, color}: {label: string; value: string; color: string}) {
    return (
        <YStack flex={1} gap="$1">
            <DotMatrixText fontSize={10} weight="bold" letterSpacing={1.6}
                           color={palette.dim}>
                {label}
            </DotMatrixText>
            <DotMatrixText fontSize={28} weight="bold" color={color}>
                {value}
            </DotMatrixText>
        </YStack>
    );
}

/**
 * The three numbers, at the app's machine-readout scale.
 *
 * Rounded to whole units because the scale reports tenths and they flicker;
 * a figure this size that changes every 100 ms cannot be read at all.
 */
export default function BrewFigures({water, cup, seconds, accent}: Props) {
    return (
        <XStack gap="$3">
            <Figure label="WATER" value={String(Math.round(water))} color={accent} />
            <Figure label="CUP" value={String(Math.round(cup))} color={palette.text} />
            <Figure label="TIME" value={clock(seconds)} color={palette.text} />
        </XStack>
    );
}
```

Run: `npx jest components/__tests__/BrewFigures.test.tsx` → PASS, 4 tests.

- [ ] **Step 3: Write the route's failing test**

```tsx
// app/__tests__/brew.test.tsx
import React from "react";

import Brew from "@/app/brew";
import {renderWithProviders} from "@/test-utils/render";

// The route reads its recipe from the URL and its state from useBrewRun. Both
// are mocked: this test is about what the screen draws, and a real hook here
// would drag in SQLite and a radio.
jest.mock("expo-router", () => ({
    router: {back: jest.fn()},
    useLocalSearchParams: () => ({recipeJSON: global.__recipeJSON}),
    useNavigation: () => ({setOptions: jest.fn()})
}));

jest.mock("@/hooks/useBrewRun", () => ({
    useBrewRun: () => global.__run
}));

jest.mock("@/hooks/useSetting", () => ({
    useSetting: (key: string) => [global.__settings[key], jest.fn()]
}));

function run(overrides: Record<string, unknown> = {}) {
    global.__run = {
        phase: {name: "pouring", pour: 1, pours: 2},
        error: null,
        samples: [],
        elapsed: 12,
        stageElapsed: 12,
        activeIndex: 0,
        holding: false,
        machine: {brewBlock: () => null},
        brew: jest.fn(),
        startBrew: jest.fn(),
        cancelBrew: jest.fn(),
        canOfferProMode: () => false,
        switchToProAndRetry: jest.fn(),
        ...overrides
    };
}

beforeEach(() => {
    global.__recipeJSON = JSON.stringify({
        name: "Ethiopia Guji",
        pours: [{pourNumber: 1, volume: 40, temperature: 93, flowRate: 40,
                 agitation: 0, pourPattern: 0, pauseTime: 20}]
    });
    global.__settings = {firstBrewDone: true, animateBrewChart: true};
    run();
});

describe("brew route", () => {
    it("draws the trace, the figures and the ladder", async () => {
        const {getByLabelText, getByText, getByTestId} = await renderWithProviders(<Brew />);
        expect(getByLabelText("Brew trace")).toBeTruthy();
        expect(getByText("WATER")).toBeTruthy();
        expect(getByTestId("ladder")).toBeTruthy();
    });

    it("offers CANCEL while the machine is running", async () => {
        const {getByLabelText} = await renderWithProviders(<Brew />);
        expect(getByLabelText("Cancel")).toBeTruthy();
    });

    it("shows the refusal in amber, with the recipe's own volume", async () => {
        run({
            phase: {name: "failed", reason: "blocked", detail: "The tank is low."},
            machine: {brewBlock: () => ({kind: "notEnoughWater", message: "low"})}
        });
        const {getByText} = await renderWithProviders(<Brew />);
        expect(getByText("NOT ENOUGH WATER FOR THIS BREW")).toBeTruthy();
        expect(getByText(/this recipe's 40 ml/)).toBeTruthy();
        expect(getByText(/nothing has been sent/)).toBeTruthy();
    });

    it("offers TRY AGAIN after a refusal", async () => {
        run({phase: {name: "failed", reason: "blocked", detail: "The tank is low."}});
        const {getByLabelText} = await renderWithProviders(<Brew />);
        expect(getByLabelText("Try again")).toBeTruthy();
    });

    it("offers no retry after the machine ran dry mid-brew", async () => {
        // The dose is spent. A retry button here would be a lie about what one
        // press costs.
        run({phase: {name: "failed", reason: "noWater"}});
        const {queryByLabelText, getByText} = await renderWithProviders(<Brew />);
        expect(getByText("The machine ran out of water.")).toBeTruthy();
        expect(queryByLabelText("Try again")).toBeNull();
    });

    it("shows the press-play notice without making it look pressable", async () => {
        run({phase: {name: "pressPlay"}});
        const {getByText, queryByLabelText} = await renderWithProviders(<Brew />);
        expect(getByText("PRESS ▶ ON THE MACHINE")).toBeTruthy();
        expect(queryByLabelText("Press play")).toBeNull();
    });

    it("says the reminder on a first brew and not after", async () => {
        global.__settings.firstBrewDone = false;
        const first = await renderWithProviders(<Brew />);
        expect(first.getByText(/cup under the spout/)).toBeTruthy();

        global.__settings.firstBrewDone = true;
        const later = await renderWithProviders(<Brew />);
        expect(later.queryByText(/cup under the spout/)).toBeNull();
    });

    it("offers EXPORT and DONE when the brew is over", async () => {
        run({phase: {name: "done"}, activeIndex: 1});
        const {getByLabelText} = await renderWithProviders(<Brew />);
        expect(getByLabelText("Export this brew")).toBeTruthy();
        expect(getByLabelText("Done")).toBeTruthy();
    });
});
```

Run: `npx jest app/__tests__/brew.test.tsx`
Expected: FAIL — the assertions about the trace, the ladder and the amber
refusal all fail against the current screen.

- [ ] **Step 4: Rewrite the route**

```tsx
// app/brew.tsx
import {router, useLocalSearchParams, useNavigation} from "expo-router";
import React, {useEffect, useState} from "react";
import {Pressable, useWindowDimensions} from "react-native";
import {Text, YStack} from "tamagui";

import BrewFigures from "@/components/BrewFigures";
import BrewStageLadder from "@/components/BrewStageLadder";
import BrewTrace from "@/components/BrewTrace";
import DotMatrixText from "@/components/DotMatrixText";
import {BLOCKED_WATER_HEADLINE, blockedWaterCopy, FAILURE_COPY,
        FIRST_BREW_REMINDER, NO_RETRY, PHASE_COPY, PRO_MODE_PROMPT,
        RUNNING} from "@/constants/brewCopy";
import {palette} from "@/constants/colors";
import {useBrewRun} from "@/hooks/useBrewRun";
import {useSetting} from "@/hooks/useSetting";
import {resolveAccent} from "@/library/accent";
import {plannedSeconds} from "@/library/brew/brewShape";
import Recipe from "@/library/Recipe";

const TRACE_HEIGHT = 150;
const SCREEN_PADDING = 16;

/** A bordered press. The screen has four of them and they differ only in colour. */
function Action({label, color, onPress}: {label: string; color: string; onPress: () => void}) {
    return (
        <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>
            <YStack alignItems="center" paddingVertical="$3.5" borderRadius="$4"
                    borderWidth={1} borderColor={color}>
                <DotMatrixText fontSize={12} weight="bold" letterSpacing={2} color={color}>
                    {label.toUpperCase()}
                </DotMatrixText>
            </YStack>
        </Pressable>
    );
}

export default function Brew() {
    const {recipeJSON} = useLocalSearchParams<{recipeJSON: string}>();
    const navigation = useNavigation();
    const {width} = useWindowDimensions();
    const [recipe] = useState(() => new Recipe(undefined, recipeJSON));
    const runState = useBrewRun(recipe);
    const {phase, error, samples, elapsed, stageElapsed, activeIndex, holding,
           brew, startBrew, cancelBrew, canOfferProMode, switchToProAndRetry} = runState;
    const [firstBrewDone, setFirstBrewDone] = useSetting("firstBrewDone");

    useEffect(() => {
        navigation.setOptions({title: ""});
    }, [navigation]);

    // Once, on mount. Re-sending on every render would commit the recipe again
    // to a machine that is already grinding it.
    useEffect(() => {
        void brew(recipe);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (phase.name === "pouring" && !firstBrewDone) setFirstBrewDone(true);
    }, [phase.name, firstBrewDone, setFirstBrewDone]);

    const accent = resolveAccent(recipe);
    const running = RUNNING.has(phase.name);
    // The two water events are not the same thing. `blocked` means nothing was
    // sent and the dose is safe; a failure by name means the machine stopped
    // with the dose already spent.
    const blocked = phase.name === "failed" && phase.reason === "blocked";
    const failed = phase.name === "failed" && !blocked;
    const total = recipe.pours.reduce((sum, pour) => sum + Math.max(pour.volume, 0), 0);
    const last = samples[samples.length - 1];

    const headline = blocked
        ? BLOCKED_WATER_HEADLINE
        : failed
            ? (FAILURE_COPY[phase.reason] ?? phase.detail ?? "The brew did not start.")
            : PHASE_COPY[phase.name];
    const headlineColor = blocked ? palette.warn : failed ? palette.danger : palette.text;
    const offerPro = failed && phase.reason === "rejected" && canOfferProMode();
    const offerRetry = blocked || (failed && !NO_RETRY.has(phase.reason));

    return (
        <YStack flex={1} backgroundColor={palette.base} padding="$4" gap="$3">
            <Text color={palette.dim} fontSize={13}>{recipe.displayName()}</Text>

            <BrewTrace
                pours={recipe.pours}
                samples={samples}
                accent={accent}
                width={width - SCREEN_PADDING * 2}
                height={TRACE_HEIGHT}
                plannedSeconds={plannedSeconds(recipe.pours)}
                stage={phase.name === "pouring" ? phase.pour : undefined}
                stages={phase.name === "pouring" ? phase.pours : undefined}
                holding={holding}
            />

            <BrewFigures
                water={last?.water ?? 0}
                cup={last?.cup ?? 0}
                seconds={elapsed}
                accent={accent}
            />

            <DotMatrixText fontSize={14} weight="bold" letterSpacing={1.8}
                           color={headlineColor}>
                {headline}
            </DotMatrixText>

            {blocked && (
                <Text color={palette.warn} fontSize={13}>{blockedWaterCopy(total)}</Text>
            )}

            {!firstBrewDone && running && (
                <Text color={palette.warn} fontSize={13}>{FIRST_BREW_REMINDER}</Text>
            )}

            {offerPro && <Text color={palette.dim} fontSize={13}>{PRO_MODE_PROMPT}</Text>}
            {error !== null && <Text color={palette.danger} fontSize={13}>{error}</Text>}

            <YStack flex={1}>
                <BrewStageLadder
                    pours={recipe.pours}
                    accent={accent}
                    activeIndex={activeIndex}
                    stageElapsed={stageElapsed}
                    holding={holding}
                />
            </YStack>

            {running ? (
                <YStack gap="$3">
                    {phase.name === "readyToStart" && (
                        // The frame this sends is the one that sets a burr
                        // spinning, so it is a press of its own rather than
                        // something BREW did on the user's behalf.
                        <Action label="Start brewing" color={palette.success}
                                onPress={() => void startBrew()} />
                    )}
                    <Action label="Cancel" color={palette.danger}
                            onPress={() => void cancelBrew()} />
                </YStack>
            ) : (
                <YStack gap="$3">
                    {offerRetry && (
                        // The machine will not answer a question outside a
                        // fresh session, and opening one makes it beep — so
                        // noticing a refilled tank cannot be done quietly on a
                        // timer. A press asks again, and only when somebody is
                        // there to have done something about the reason.
                        <Action label="Try again" color={palette.text}
                                onPress={() => void brew(recipe)} />
                    )}
                    {offerPro && (
                        <Action label="Switch to PRO" color={palette.warn}
                                onPress={() => void switchToProAndRetry(recipe)} />
                    )}
                    {phase.name === "done" && (
                        <Action label="Export this brew" color={palette.dim}
                                onPress={() => router.push("/brewRecord?latest=1")} />
                    )}
                    <Action label="Done" color={palette.line} onPress={() => router.back()} />
                </YStack>
            )}
        </YStack>
    );
}
```

`Action` upper-cases its own label so the accessibility label stays sentence
case — `getByLabelText("Try again")` reads better in a test and to a screen
reader than `TRY AGAIN`.

The EXPORT press points at `/brewRecord?latest=1`, which Task 19 builds. Until
then it navigates to a route that does not exist; that is fine within a branch
and the test only checks the button is there.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx jest app/__tests__/brew.test.tsx components/__tests__/BrewFigures.test.tsx`
Expected: PASS, 12 tests.

- [ ] **Step 6: Commit**

```bash
git add app/brew.tsx app/__tests__/brew.test.tsx components/BrewFigures.tsx \
        components/__tests__/BrewFigures.test.tsx constants/brewCopy.ts
git commit -m "feat(brew): the brew screen, drawn on the plan

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 13: The phase animations

**Files:**
- Create: `hooks/useTraceAnimation.ts`
- Modify: `components/BrewTrace.tsx`
- Modify: `app/brew.tsx` (pass the animation through)
- Test: `hooks/__tests__/useTraceAnimation.test.ts`

Everything before the first drop is drawn **on the plan**, not in a corner. The
plan is the one thing on screen throughout, and a spinner beside it would be a
second, worse status display.

| Phase | The line does |
|---|---|
| `waking` | A 3.4 s opacity breath of the whole dashed plan, warming toward the accent at each peak |
| `sending` | A short lit segment travelling the length of the curve |
| `readyToStart` | The dashes fuse into a solid dim line — it is in the machine now |
| `grinding` | Opacity untouched; the stroke flicks between dark and accent at ~0.42 s. Intense rather than pretty, which is what grinding is |
| `pouring` | Nothing; the trace takes over |

**Two switches, both respected.** The system Reduced Motion preference is
already read by `constants/motion.ts`; the app's own `animateBrewChart` (Task
10) sits on top of it. When either is off, each animation **holds its end
state** rather than vanishing — a screen with no status at all is worse than a
still one.

`constants/motion.ts:130` already exports `useReducedMotion()`. Use it.

- [ ] **Step 1: Write the failing test**

```ts
// hooks/__tests__/useTraceAnimation.test.ts
import {act, renderHook} from "@testing-library/react-native";

import {traceAnimationFor} from "@/hooks/useTraceAnimation";

describe("traceAnimationFor", () => {
    it("breathes while the machine is waking", () => {
        const at = (t: number) => traceAnimationFor("waking", t, true);
        // A 3.4 s cycle: opacity is not the same a second and a half in.
        expect(at(0).opacity).not.toBeCloseTo(at(1700).opacity, 2);
    });

    it("warms toward the accent at the peak of the breath", () => {
        const peak = traceAnimationFor("waking", 1700, true);
        expect(peak.warmth).toBeGreaterThan(traceAnimationFor("waking", 0, true).warmth);
    });

    it("travels a lit segment along the curve while sending", () => {
        const early = traceAnimationFor("sending", 200, true);
        const later = traceAnimationFor("sending", 900, true);
        expect(later.headAt).toBeGreaterThan(early.headAt);
    });

    it("keeps the travelling head inside the curve", () => {
        [0, 400, 1200, 5000].forEach((t) => {
            const {headAt} = traceAnimationFor("sending", t, true);
            expect(headAt).toBeGreaterThanOrEqual(0);
            expect(headAt).toBeLessThanOrEqual(1);
        });
    });

    it("fuses the dashes once the recipe is in the machine", () => {
        expect(traceAnimationFor("readyToStart", 0, true).dashed).toBe(false);
    });

    it("flickers rather than breathing while grinding", () => {
        // Intense, not pretty. Opacity is untouched; the colour is what moves.
        const a = traceAnimationFor("grinding", 0, true);
        const b = traceAnimationFor("grinding", 210, true);
        expect(a.opacity).toBe(b.opacity);
        expect(a.warmth).not.toBeCloseTo(b.warmth, 2);
    });

    it("holds an end state when motion is off", () => {
        // Not "no animation" — no status at all is worse than a still one.
        [0, 900, 1700, 3300].forEach((t) => {
            expect(traceAnimationFor("waking", t, false).opacity).toBe(1);
            expect(traceAnimationFor("sending", t, false).headAt).toBe(1);
            expect(traceAnimationFor("grinding", t, false).warmth).toBe(1);
        });
    });

    it("leaves the plan alone once the water is running", () => {
        const still = traceAnimationFor("pouring", 1200, true);
        expect(still).toEqual({opacity: 1, warmth: 0, headAt: 1, dashed: true});
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest hooks/__tests__/useTraceAnimation.test.ts`
Expected: FAIL — `Cannot find module '@/hooks/useTraceAnimation'`.

- [ ] **Step 3: Write the pure function and the hook that drives it**

The maths is a plain function of the phase and a millisecond count, so it is
tested without a frame clock, a mock of Reanimated, or a fake timer.

```ts
// hooks/useTraceAnimation.ts
import {useEffect, useState} from "react";

import {useSetting} from "@/hooks/useSetting";
import {useReducedMotion} from "@/constants/motion";

export type TraceAnimation = {
    /** Multiplier on the plan's stroke opacity. */
    opacity: number;
    /** 0 = the plan's grey, 1 = the recipe's accent. */
    warmth: number;
    /** How far along the curve the lit head has travelled, 0 to 1. */
    headAt: number;
    /** False once the recipe is in the machine and the dashes have fused. */
    dashed: boolean;
};

/** A full breath. Slow enough to read as breathing rather than as blinking. */
const BREATH_MS = 3400;
/** One pass of the travelling head. */
const TRAVEL_MS = 1400;
/** The grinder's flicker. Fast and uneven-feeling, which is what grinding is. */
const FLICKER_MS = 420;

const STILL: TraceAnimation = {opacity: 1, warmth: 0, headAt: 1, dashed: true};

/**
 * What the plan should look like, given a phase and a clock.
 *
 * A pure function of two numbers, so the whole of the milestone's motion design
 * is testable without a frame clock or a mock of Reanimated. The hook below
 * only supplies the clock.
 *
 * With motion off, each phase holds its **end** state rather than disappearing:
 * a screen showing no status at all is worse than one showing a still one.
 */
export function traceAnimationFor(
    phase: string, elapsedMs: number, animate: boolean
): TraceAnimation {
    if (phase === "readyToStart") return {...STILL, dashed: false};
    if (!animate) {
        if (phase === "waking") return STILL;
        if (phase === "sending") return {...STILL, headAt: 1};
        if (phase === "grinding") return {...STILL, warmth: 1};
        return STILL;
    }
    if (phase === "waking") {
        // A raised cosine: 0 at the trough, 1 at the peak, and no corner at
        // either end the way a triangle wave has.
        const breath = (1 - Math.cos((elapsedMs / BREATH_MS) * 2 * Math.PI)) / 2;
        return {opacity: 0.45 + 0.55 * breath, warmth: breath * 0.6, headAt: 1, dashed: true};
    }
    if (phase === "sending") {
        return {opacity: 1, warmth: 0.4, headAt: (elapsedMs % TRAVEL_MS) / TRAVEL_MS,
                dashed: true};
    }
    if (phase === "grinding") {
        // A square wave, not a sine: grinding is loud, and a smooth fade reads
        // as calm. Opacity is deliberately untouched.
        const on = Math.floor(elapsedMs / FLICKER_MS) % 2 === 0;
        return {opacity: 1, warmth: on ? 1 : 0.15, headAt: 1, dashed: true};
    }
    return STILL;
}

/** The same, with a clock attached. */
export function useTraceAnimation(phase: string): TraceAnimation {
    const [animateSetting] = useSetting("animateBrewChart");
    const reduced = useReducedMotion();
    const animate = animateSetting && !reduced;
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        setElapsed(0);
        if (!animate) return;
        // 50 ms is twelve steps of the grinder's flicker and eighty of a
        // breath, which is smooth for an opacity ramp and a fraction of the
        // work of a per-frame driver for a line that is barely moving.
        const tick = setInterval(() => setElapsed((was) => was + 50), 50);
        return () => clearInterval(tick);
    }, [phase, animate]);

    return traceAnimationFor(phase, elapsed, animate);
}

export default useTraceAnimation;
```

`useReducedMotion` is `constants/motion.ts:130` and already exists; do not read
`AccessibilityInfo` again. Both switches are hooks, so both are called
unconditionally at the top — the React Compiler is on and will not tolerate a
conditional hook.

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest hooks/__tests__/useTraceAnimation.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Wire it into the trace**

`BrewTrace` already takes `planOpacity` and `planColor`. Add `planHeadAt` and
`planDashed`, and in `app/brew.tsx`:

```tsx
    const motion = useTraceAnimation(phase.name);
```

```tsx
                planOpacity={motion.opacity}
                planColor={motion.warmth > 0 ? accent : palette.muted}
                planDashed={motion.dashed}
                planHeadAt={motion.headAt}
```

In `components/BrewTrace.tsx`, add the two props and one more `Path`:

```tsx
    planDashed?: boolean;
    /** 0 to 1: how far the lit head has travelled. 1 means no head. */
    planHeadAt?: number;
```

```tsx
/** The lit head's length, as a fraction of the curve. */
const LIT = 0.12;
```

```tsx
                {planPath !== "" && planHeadAt < 1 && (
                    // A second copy of the same path, with everything but a
                    // short window dashed away. Dash-offset animation is the
                    // only way to light part of a path without splitting it,
                    // and splitting the plan into two paths would put a seam
                    // at the join that moves with the head.
                    //
                    // The length is taken as the box width rather than the
                    // path's true arc length: `getTotalLength` needs a ref and
                    // a measured layout pass, the plan is monotonic in x, so
                    // the two differ by a roughly constant factor, and the head
                    // still travels at a constant apparent speed.
                    <Path
                        testID="trace-head"
                        d={planPath}
                        stroke={accent}
                        strokeWidth={2}
                        strokeDasharray={`${width * LIT} ${width}`}
                        strokeDashoffset={-planHeadAt * width * (1 + LIT)}
                        fill="none"
                    />
                )}
```

and make the plan's own dashes conditional:

```tsx
                        strokeDasharray={planDashed ? "4 4" : undefined}
```

Add one test for each to `components/__tests__/BrewTrace.test.tsx`:

```tsx
    it("fuses the dashes when told to", async () => {
        const {getByTestId} = await draw({planDashed: false});
        expect(getByTestId("trace-plan").props.strokeDasharray).toBeUndefined();
    });

    it("draws a travelling head part-way through, and none at the end", async () => {
        const travelling = await draw({planHeadAt: 0.4});
        expect(travelling.getByTestId("trace-head")).toBeTruthy();
        const arrived = await draw({planHeadAt: 1});
        expect(arrived.queryByTestId("trace-head")).toBeNull();
    });
```

with `planDashed = true` and `planHeadAt = 1` as the defaults in the signature,
so the ten tests written in Task 6 still pass unchanged.

- [ ] **Step 6: Run every touched suite and commit**

Run: `npx jest components/__tests__/BrewTrace.test.tsx app/__tests__/brew.test.tsx hooks`
Expected: PASS.

```bash
git add hooks/useTraceAnimation.ts hooks/__tests__/useTraceAnimation.test.ts \
        components/BrewTrace.tsx app/brew.tsx
git commit -m "feat(brew): breathe, travel, fuse and flicker on the plan

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Phase 4 — presence

### Task 14: Connect on launch

**Files:**
- Modify: `hooks/useMachine.ts` — `sharedMachine()`, line ~20
- Test: `hooks/__tests__/useMachine.test.ts`

`holdLinkAcrossAppState` already reconnects on foreground, but only if it was
the function that released the link. So the machine reconnects after a trip to
another app and never at launch, and the status dot spends the first press of
every session grey.

**Only when a machine is remembered.** A launch scan on a phone that has never
seen a J15 is a radio spinning for nobody. The remembered id is also what tells
the app somebody here owns one.

- [ ] **Step 1: Write the failing test**

```ts
    it("reaches for a remembered machine at launch", async () => {
        const connect = jest.fn(async () => {});
        warmConnect({rememberedId: () => "device-1", rememberId: jest.fn()}, connect);
        await Promise.resolve();
        expect(connect).toHaveBeenCalled();
    });

    it("does not scan when no machine has ever been seen", async () => {
        // A radio spinning for nobody, and a beep at launch for somebody who
        // opened the app to edit a recipe.
        const connect = jest.fn(async () => {});
        warmConnect({rememberedId: () => "", rememberId: jest.fn()}, connect);
        await Promise.resolve();
        expect(connect).not.toHaveBeenCalled();
    });

    it("swallows a failure to connect at launch", async () => {
        // The machine being off is the ordinary case, not an error worth
        // surfacing before the user has asked for anything.
        const connect = jest.fn(async () => { throw new Error("out of range"); });
        expect(() => warmConnect(
            {rememberedId: () => "device-1", rememberId: jest.fn()}, connect
        )).not.toThrow();
    });
```

Import `warmConnect` alongside whatever the file already imports from
`@/hooks/useMachine`.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest hooks/__tests__/useMachine.test.ts`
Expected: FAIL — `warmConnect is not exported`.

- [ ] **Step 3: Add it**

```ts
/**
 * Reach for a remembered machine as the app starts.
 *
 * Presence is most of what the status dot is for, and without this the dot is
 * grey for the first press of every session even with the machine sitting on
 * the counter. Only when a machine is remembered: a launch scan on a phone that
 * has never seen a J15 is a radio spinning for nobody.
 *
 * Failures are swallowed on purpose. The machine being off, or in another room,
 * is the ordinary case — not an error worth showing before the user has asked
 * for anything.
 */
export function warmConnect(store: LinkStore, connect: () => Promise<void>): void {
    if (store.rememberedId() === "") return;
    void connect().catch(() => {});
}
```

and call it from `sharedMachine()`, immediately after `holdLinkAcrossAppState`:

```ts
        holdLinkAcrossAppState(machine, () => openLink(machine, settingsStore()));
        warmConnect(settingsStore(), () => openLink(machine, settingsStore()));
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest hooks/__tests__/useMachine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add hooks/useMachine.ts hooks/__tests__/useMachine.test.ts
git commit -m "feat(machine): reach for a remembered machine at launch

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 15: The status dot and its popover

**Files:**
- Create: `components/MachineDot.tsx`
- Create: `components/MachinePopover.tsx`
- Modify: `components/HomeHeader.tsx` (a 9 px dot left of the settings gear)
- Test: `components/__tests__/MachineDot.test.tsx`,
  `components/__tests__/MachinePopover.test.tsx`

Three dot states: connected (accent, soft ring), connecting (half-lit,
breathing), not in range (grey).

The popover shows **only what changes** — water, mode, grind size — and has
**no MACHINE SETTINGS button**: the gear is twenty pixels away in the same
header and leads to the same place. Auto-start, forget and the full vitals list
stay one tap further, in Settings → Machine, which is right for things that are
set once.

Two controls, weighted differently on purpose:

- **TRY NOW**, a real button, shown only when the machine is out of range. It is
  a genuine shortcut to an action the user wants.
- **A refresh glyph on the water row itself**, beside the timestamp. It acts on
  one row, so it lives on that row rather than becoming a third button of equal
  weight.

**Why water needs asking for.** `waterEnough` arrives only inside an info blob,
and asking for one opens a session, which beeps. Presence is free; water level
is not. This is also why Task 16's capsule is **not** marked when the tank is
low — a stale flag would discourage a brew that would work.

- [ ] **Step 1: Write the dot's failing test**

```tsx
// components/__tests__/MachineDot.test.tsx
import React from "react";

import MachineDot from "@/components/MachineDot";
import {palette} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";

describe("MachineDot", () => {
    it("is accent with a ring when connected", async () => {
        const {getByTestId} = await renderWithProviders(
            <MachineDot status="connected" accent="#C86A3B" onPress={jest.fn()} />
        );
        expect(getByTestId("machine-dot").props.style.backgroundColor).toBe("#C86A3B");
        expect(getByTestId("machine-dot-ring")).toBeTruthy();
    });

    it("is grey and ringless when out of range", async () => {
        const {getByTestId, queryByTestId} = await renderWithProviders(
            <MachineDot status="disconnected" accent="#C86A3B" onPress={jest.fn()} />
        );
        expect(getByTestId("machine-dot").props.style.backgroundColor).toBe(palette.muted);
        expect(queryByTestId("machine-dot-ring")).toBeNull();
    });

    it("is half-lit while connecting", async () => {
        const {getByTestId} = await renderWithProviders(
            <MachineDot status="connecting" accent="#C86A3B" onPress={jest.fn()} />
        );
        expect(getByTestId("machine-dot").props.style.opacity).toBeCloseTo(0.5, 1);
    });

    it("says which state it is in, for a screen reader", async () => {
        // The state is carried entirely by a nine-pixel colour, so it has to be
        // said out loud somewhere.
        const {getByLabelText} = await renderWithProviders(
            <MachineDot status="connected" accent="#C86A3B" onPress={jest.fn()} />
        );
        expect(getByLabelText("Machine connected")).toBeTruthy();
    });

    it("opens on a press", async () => {
        const onPress = jest.fn();
        const {getByLabelText, fireEvent} = await renderWithProviders(
            <MachineDot status="connected" accent="#C86A3B" onPress={onPress} />
        );
        await fireEvent.press(getByLabelText("Machine connected"));
        expect(onPress).toHaveBeenCalled();
    });
});
```

`renderWithProviders` may not re-export `fireEvent`. If it does not, import it
from `@testing-library/react-native` — and remember that in v14 both `render`
and `fireEvent` are asynchronous, so every call is awaited. Forget the `await`
and the tree stays empty and the test passes for the wrong reason.

- [ ] **Step 2: Write the dot**

```tsx
// components/MachineDot.tsx
import React from "react";
import {Pressable, View} from "react-native";

import {palette} from "@/constants/colors";
import type {LinkStatus} from "@/hooks/useMachine";

type Props = {
    status: LinkStatus;
    accent: string;
    onPress: () => void;
};

const SIZE = 9;
/** The HIG's smallest comfortable target, as in HomeHeader. */
const TOUCH_TARGET = 44;

const LABELS: Record<LinkStatus, string> = {
    connected: "Machine connected",
    connecting: "Machine connecting",
    disconnected: "Machine not in range",
    failed: "Machine not in range"
};

/**
 * Nine pixels of presence, left of the settings gear.
 *
 * Padded out to a full touch target rather than given `hitSlop`, for the reason
 * `HomeHeader` states: hit slop on adjacent controls overlaps into the gap
 * between them and the later sibling wins, which here would put the gear under
 * a tap aimed at the dot.
 */
export default function MachineDot({status, accent, onPress}: Props) {
    const connected = status === "connected";
    const colour = connected ? accent
        : status === "connecting" ? accent
        : palette.muted;

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={LABELS[status]}
            onPress={onPress}
            style={{
                width: TOUCH_TARGET,
                height: TOUCH_TARGET,
                alignItems: "center",
                justifyContent: "center"
            }}
        >
            {connected && (
                <View
                    testID="machine-dot-ring"
                    style={{
                        position: "absolute",
                        width: SIZE * 2.2,
                        height: SIZE * 2.2,
                        borderRadius: SIZE * 1.1,
                        borderWidth: 1,
                        borderColor: accent,
                        opacity: 0.25
                    }}
                />
            )}
            <View
                testID="machine-dot"
                style={{
                    width: SIZE,
                    height: SIZE,
                    borderRadius: SIZE / 2,
                    backgroundColor: colour,
                    opacity: status === "connecting" ? 0.5 : 1
                }}
            />
        </Pressable>
    );
}
```

Run: `npx jest components/__tests__/MachineDot.test.tsx` → PASS, 5 tests.

- [ ] **Step 3: Write the popover's failing test**

```tsx
// components/__tests__/MachinePopover.test.tsx
import React from "react";

import MachinePopover from "@/components/MachinePopover";
import {palette} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";

const vitals = {waterEnough: true, mode: "PRO" as const, grindSize: 62, askedAt: 0};

async function draw(props: Partial<React.ComponentProps<typeof MachinePopover>> = {}) {
    return renderWithProviders(
        <MachinePopover
            open
            status="connected"
            accent="#C86A3B"
            vitals={vitals}
            now={4 * 60 * 1000}
            onRefreshWater={jest.fn()}
            onConnect={jest.fn()}
            onClose={jest.fn()}
            {...props}
        />
    );
}

describe("MachinePopover", () => {
    it("shows water, mode and grind size", async () => {
        const {getByText} = await draw();
        expect(getByText("WATER")).toBeTruthy();
        expect(getByText("PRO")).toBeTruthy();
        expect(getByText("62")).toBeTruthy();
    });

    it("draws EASY in warn, because it will refuse a brew", async () => {
        // This is where a user finds that out, rather than after pressing BREW.
        const {getByText} = await draw({vitals: {...vitals, mode: "EASY"}});
        expect(getByText("EASY").props.color).toBe(palette.warn);
    });

    it("ages the water reading", async () => {
        const {getByText} = await draw();
        expect(getByText("4 MIN AGO")).toBeTruthy();
    });

    it("puts the refresh on the water row, not among the buttons", async () => {
        // It acts on one row, so it lives on that row. Given equal weight to
        // TRY NOW it would read as an equally important thing to do, and it is
        // not.
        const {getByLabelText} = await draw();
        expect(getByLabelText("Refresh the water reading")).toBeTruthy();
    });

    it("warns when the tank is low, and says what to do", async () => {
        const {getByText} = await draw({vitals: {...vitals, waterEnough: false}});
        expect(getByText("FILL THE TANK, THEN REFRESH")).toBeTruthy();
    });

    it("offers TRY NOW only when the machine is out of range", async () => {
        const connected = await draw();
        expect(connected.queryByLabelText("Try now")).toBeNull();
        const away = await draw({status: "disconnected", vitals: null});
        expect(away.getByLabelText("Try now")).toBeTruthy();
    });

    it("says it will reconnect by itself", async () => {
        const {getByText} = await draw({status: "disconnected", vitals: null});
        expect(getByText(/reconnect by itself/i)).toBeTruthy();
    });

    it("has no machine settings button", async () => {
        // The gear is twenty pixels away in the same header and goes to the
        // same place.
        const {queryByLabelText} = await draw();
        expect(queryByLabelText(/machine settings/i)).toBeNull();
    });

    it("shows nothing but the state while connecting", async () => {
        const {queryByText} = await draw({status: "connecting", vitals: null});
        expect(queryByText("WATER")).toBeNull();
    });
});
```

- [ ] **Step 4: Write the popover**

Follow the `Dialog` + `Adapt platform="touch"` + `Sheet` pattern in
`components/ImportRecipeComponent.tsx` — do not invent a new overlay. The
content:

```tsx
// components/MachinePopover.tsx
import React from "react";
import {Pressable} from "react-native";
import {XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import type {LinkStatus} from "@/hooks/useMachine";

/** What the popover shows, copied out of the machine's info blob. */
export type MachineVitals = {
    waterEnough: boolean;
    mode: "PRO" | "EASY";
    grindSize: number;
    /** When the blob was asked for, in wall-clock milliseconds. */
    askedAt: number;
};

type Props = {
    open: boolean;
    status: LinkStatus;
    accent: string;
    /** Null whenever the machine has not answered — connecting, or away. */
    vitals: MachineVitals | null;
    /** Injected so the age is testable without a fake clock. */
    now: number;
    onRefreshWater: () => void;
    onConnect: () => void;
    onClose: () => void;
};

/** `4 MIN AGO`. Minutes only: seconds would change while it was being read. */
function age(askedAt: number, now: number): string {
    const minutes = Math.floor(Math.max(0, now - askedAt) / 60_000);
    if (minutes < 1) return "JUST NOW";
    return `${minutes} MIN AGO`;
}

function Row({label, children}: {label: string; children: React.ReactNode}) {
    return (
        <XStack alignItems="center" justifyContent="space-between" paddingVertical="$1.5">
            <DotMatrixText fontSize={10} weight="bold" letterSpacing={1.6}
                           color={palette.dim}>
                {label}
            </DotMatrixText>
            <XStack alignItems="center" gap="$2">{children}</XStack>
        </XStack>
    );
}

export default function MachinePopover({
    status, accent, vitals, now, onRefreshWater, onConnect
}: Props) {
    if (status === "connected" && vitals !== null) {
        return (
            <YStack padding="$3" gap="$1">
                <Row label="WATER">
                    <DotMatrixText fontSize={13} weight="bold"
                                   color={vitals.waterEnough ? palette.text : palette.warn}>
                        {vitals.waterEnough ? "OK" : "LOW"}
                    </DotMatrixText>
                    <DotMatrixText fontSize={10} color={palette.muted}>
                        {age(vitals.askedAt, now)}
                    </DotMatrixText>
                    {/* On the row, because it acts on the row. Beside TRY NOW
                        it would read as an equally important thing to do. */}
                    <Pressable accessibilityRole="button"
                               accessibilityLabel="Refresh the water reading"
                               onPress={onRefreshWater}>
                        <DotIcon name="refresh" size={12}
                                 color={vitals.waterEnough ? accent : palette.warn} />
                    </Pressable>
                </Row>
                {!vitals.waterEnough && (
                    <DotMatrixText fontSize={10} weight="bold" letterSpacing={1.6}
                                   color={palette.warn}>
                        FILL THE TANK, THEN REFRESH
                    </DotMatrixText>
                )}
                <Row label="MODE">
                    <DotMatrixText fontSize={13} weight="bold"
                                   color={vitals.mode === "EASY" ? palette.warn : palette.text}>
                        {vitals.mode}
                    </DotMatrixText>
                </Row>
                <Row label="GRIND">
                    <DotMatrixText fontSize={13} weight="bold" color={palette.text}>
                        {String(vitals.grindSize)}
                    </DotMatrixText>
                </Row>
            </YStack>
        );
    }

    if (status === "connecting") {
        return (
            <YStack padding="$3">
                <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6}
                               color={palette.dim}>
                    CONNECTING…
                </DotMatrixText>
            </YStack>
        );
    }

    return (
        <YStack padding="$3" gap="$2">
            <DotMatrixText fontSize={11} color={palette.dim}>
                {vitals === null
                    ? "Not in range. It will reconnect by itself when it is."
                    : `Last seen ${age(vitals.askedAt, now)}. `
                      + "It will reconnect by itself when it is in range."}
            </DotMatrixText>
            <Pressable accessibilityRole="button" accessibilityLabel="Try now"
                       onPress={onConnect}>
                <YStack alignItems="center" paddingVertical="$2.5" borderRadius="$4"
                        borderWidth={1} borderColor={accent}>
                    <DotMatrixText fontSize={11} weight="bold" letterSpacing={2}
                                   color={accent}>
                        TRY NOW
                    </DotMatrixText>
                </YStack>
            </Pressable>
        </YStack>
    );
}
```

Wrap that content in the project's dialog/sheet pattern, driven by `open` and
`onClose`. If `DotIcon` has no `refresh` glyph, add one to
`constants/dotIcons.ts` in the style of its neighbours rather than importing an
icon from elsewhere.

Run: `npx jest components/__tests__/MachinePopover.test.tsx` → PASS, 9 tests.

- [ ] **Step 5: Put the dot in the header**

In `components/HomeHeader.tsx`, place `MachineDot` immediately left of the
settings action, and hold the popover's open state there. The header already
receives its callbacks as props; add `machineStatus`, `machineVitals` and the
two handlers in the same style, and have `app/index.tsx` supply them from
`useMachine`.

Add one test to `components/__tests__/HomeHeader.test.tsx`:

```tsx
    it("shows the machine dot left of the settings gear", async () => {
        const {getByLabelText} = await renderWithProviders(
            <HomeHeader {...props({machineStatus: "connected"})} />
        );
        expect(getByLabelText("Machine connected")).toBeTruthy();
    });
```

matching however that file already builds its props.

- [ ] **Step 6: Run the suites and commit**

Run: `npx jest components app`
Expected: PASS.

```bash
git add components app
git commit -m "feat(machine): a status dot and a popover of what changes

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 16: The BREW capsule

**Files:**
- Create: `components/BrewCapsule.tsx`
- Modify: `components/RecipeCard.tsx`
- Test: `components/__tests__/BrewCapsule.test.tsx`,
  `components/__tests__/RecipeCard.test.tsx`

A thin ink capsule on each card's right edge: ~21 px wide, inset ~5 px from the
card's edges so it reads as part of the card rather than stuck to it, filled
with the card's ink colour, with `BREW` set **upright — one letter per line** —
in the card's accent.

`hitSlop` gives it a full touch target without making it wider. It **collides
with the swipe-to-delete tiles** on the same edge; that was judged acceptable
and is on the hardware checklist to confirm in the hand.

Shown only when a machine is remembered — a dead button on every card would be
worse than no button — and behind the `showBrewOnRecipeRows` switch from Task 10.

Deliberately **not** marked when the tank is low: `waterEnough` only arrives
inside an info blob, so any flag here would be stale, and a stale flag would
discourage a brew that would work.

- [ ] **Step 1: Write the failing test**

```tsx
// components/__tests__/BrewCapsule.test.tsx
import React from "react";
import {fireEvent} from "@testing-library/react-native";

import BrewCapsule from "@/components/BrewCapsule";
import {renderWithProviders} from "@/test-utils/render";

describe("BrewCapsule", () => {
    it("sets BREW upright, one letter per line", async () => {
        // Rotated text was tried and is unreadable at this width; four stacked
        // letters are legible and say the same thing.
        const {getByText} = await renderWithProviders(
            <BrewCapsule accent="#C86A3B" ink="#101010" onPress={jest.fn()} />
        );
        ["B", "R", "E", "W"].forEach((letter) => expect(getByText(letter)).toBeTruthy());
    });

    it("reads as one control, not four letters", async () => {
        const {getByLabelText} = await renderWithProviders(
            <BrewCapsule accent="#C86A3B" ink="#101010" onPress={jest.fn()} />
        );
        expect(getByLabelText("Brew this recipe")).toBeTruthy();
    });

    it("has a full touch target without being wider", async () => {
        const {getByLabelText} = await renderWithProviders(
            <BrewCapsule accent="#C86A3B" ink="#101010" onPress={jest.fn()} />
        );
        const capsule = getByLabelText("Brew this recipe");
        expect(capsule.props.style.width).toBeLessThanOrEqual(24);
        expect(capsule.props.hitSlop).toBeTruthy();
    });

    it("brews on a press", async () => {
        const onPress = jest.fn();
        const {getByLabelText} = await renderWithProviders(
            <BrewCapsule accent="#C86A3B" ink="#101010" onPress={onPress} />
        );
        await fireEvent.press(getByLabelText("Brew this recipe"));
        expect(onPress).toHaveBeenCalled();
    });
});
```

And in `components/__tests__/RecipeCard.test.tsx`, matching however that file
already builds its props:

```tsx
    it("carries the BREW capsule when a machine is remembered", async () => {
        const {getByLabelText} = await renderWithProviders(
            <RecipeCard {...props({showBrew: true})} />
        );
        expect(getByLabelText("Brew this recipe")).toBeTruthy();
    });

    it("carries none when there is no machine to brew on", async () => {
        // A dead button on every card is worse than no button.
        const {queryByLabelText} = await renderWithProviders(
            <RecipeCard {...props({showBrew: false})} />
        );
        expect(queryByLabelText("Brew this recipe")).toBeNull();
    });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest components/__tests__/BrewCapsule.test.tsx components/__tests__/RecipeCard.test.tsx`
Expected: FAIL — module not found, then the two `RecipeCard` assertions.

- [ ] **Step 3: Write the capsule**

```tsx
// components/BrewCapsule.tsx
import React from "react";
import {Pressable} from "react-native";

import DotMatrixText from "@/components/DotMatrixText";

type Props = {
    accent: string;
    /** The card's own ink, so the capsule reads as part of the card. */
    ink: string;
    onPress: () => void;
};

const WIDTH = 21;
const INSET = 5;
/** Enough to reach the HIG's 44 px without widening the capsule itself. */
const SLOP = {top: 8, bottom: 8, left: 12, right: 8};

/**
 * BREW, on the right edge of a recipe card.
 *
 * Upright — one letter per line — rather than rotated: rotated text at 21 px is
 * unreadable, and four stacked letters say the same thing while staying a
 * shape you can recognise without reading.
 *
 * It shares this edge with the swipe-to-delete tiles. Judged acceptable, and on
 * the hardware checklist to confirm in the hand.
 */
export default function BrewCapsule({accent, ink, onPress}: Props) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel="Brew this recipe"
            onPress={onPress}
            hitSlop={SLOP}
            style={{
                position: "absolute",
                right: INSET,
                top: INSET,
                bottom: INSET,
                width: WIDTH,
                borderRadius: WIDTH / 2,
                backgroundColor: ink,
                alignItems: "center",
                justifyContent: "center"
            }}
        >
            {["B", "R", "E", "W"].map((letter) => (
                <DotMatrixText key={letter} fontSize={9} weight="bold" color={accent}>
                    {letter}
                </DotMatrixText>
            ))}
        </Pressable>
    );
}
```

- [ ] **Step 4: Hang it on the card**

`RecipeCard` gains `showBrew?: boolean` and `onBrew?: () => void`, and renders
the capsule when both are given. `app/index.tsx` decides `showBrew` from the two
facts that must both hold:

```tsx
    const [showBrewRows] = useSetting("showBrewOnRecipeRows");
    const [machineDeviceId] = useSetting("machineDeviceId");
    const showBrew = showBrewRows && machineDeviceId !== "";
```

The press pushes the brew route with the recipe, exactly as the editor's BREW
action already does — find that call and copy it rather than composing a second
URL by hand.

- [ ] **Step 5: Run the suites and commit**

Run: `npx jest components app`
Expected: PASS.

```bash
git add components app
git commit -m "feat(brew): a BREW capsule on every recipe row

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 17: The mini-bar

**Files:**
- Create: `components/BrewMiniBar.tsx`
- Create: `hooks/useLiveBrew.ts`
- Modify: `app/index.tsx` (host the bar), `app/brew.tsx` (dismissible)
- Test: `components/__tests__/BrewMiniBar.test.tsx`

Dismissing the brew sheet does not stop the brew, so the library grows a bar
along its bottom: **the trace in miniature** at 86×34 — the same plan, live line
and trailing cup — then the recipe's name with one line of Doto status beneath,
then a chevron. Tapping it reopens the sheet.

It is the sheet's own drawing, so there is nothing new to learn, and it is the
only arrangement in which an unplanned hold is *visible* rather than inferred
from a number.

| State | Line | Words |
|---|---|---|
| Grinding | plan only, buzzing | `Grinding` / `ETHIOPIA GUJI · 18 G` |
| Pouring | traced to now | `Ethiopia Guji` / `POUR 3 OF 5 · 1:42` |
| Holding | flat amber run | `Waiting for the cup` / `+11 S · CARRIES ON BY ITSELF` |
| Done | full trace in success | `Ready` / `254 G · 3:48 · TAP TO SEE IT` |
| Stopped | frozen in danger | `Stopped — no water` / `KEPT IN YOUR BREW HISTORY` |

Done and stopped **persist until dismissed**: the finished trace is the record,
and the bar is the way into it.

This is also the shape the Live Activity will take, which is why it had to be
the drawing rather than three figures — at 46 px of height a familiar graph says
more than any arrangement of numbers. The Live Activity itself is out of scope
here (see the header).

- [ ] **Step 1: Write the failing test**

```tsx
// components/__tests__/BrewMiniBar.test.tsx
import React from "react";
import {fireEvent} from "@testing-library/react-native";

import BrewMiniBar from "@/components/BrewMiniBar";
import {palette} from "@/constants/colors";
import Pour from "@/library/Pour";
import {renderWithProviders} from "@/test-utils/render";

const pours = [new Pour(1, 40, 93, 40, 0, 0, 20), new Pour(2, 160, 92, 40, 0, 0, 0)];

async function draw(props: Partial<React.ComponentProps<typeof BrewMiniBar>> = {}) {
    return renderWithProviders(
        <BrewMiniBar
            recipeName="Ethiopia Guji"
            dose={18}
            pours={pours}
            samples={[]}
            accent="#C86A3B"
            phase={{name: "grinding"}}
            elapsed={0}
            holding={false}
            heldSeconds={0}
            onOpen={jest.fn()}
            onDismiss={jest.fn()}
            {...props}
        />
    );
}

describe("BrewMiniBar", () => {
    it("says what it is doing while grinding, with the dose", async () => {
        const {getByText} = await draw();
        expect(getByText("Grinding")).toBeTruthy();
        expect(getByText("ETHIOPIA GUJI · 18 G")).toBeTruthy();
    });

    it("names the recipe and the pour while pouring", async () => {
        const {getByText} = await draw({
            phase: {name: "pouring", pour: 3, pours: 5},
            elapsed: 102
        });
        expect(getByText("Ethiopia Guji")).toBeTruthy();
        expect(getByText("POUR 3 OF 5 · 1:42")).toBeTruthy();
    });

    it("explains a hold, and says it needs nothing from the user", async () => {
        const {getByText} = await draw({
            phase: {name: "pouring", pour: 3, pours: 5},
            holding: true,
            heldSeconds: 11
        });
        expect(getByText("Waiting for the cup")).toBeTruthy();
        expect(getByText("+11 S · CARRIES ON BY ITSELF")).toBeTruthy();
    });

    it("invites a tap when the brew is done", async () => {
        const {getByText} = await draw({
            phase: {name: "done"}, elapsed: 228,
            samples: [{at: 228_000, water: 254, cup: 254, pour: 2}]
        });
        expect(getByText("Ready")).toBeTruthy();
        expect(getByText("254 G · 3:48 · TAP TO SEE IT")).toBeTruthy();
    });

    it("says where a stopped brew went", async () => {
        // The record is the consolation, so it is offered rather than implied.
        const {getByText} = await draw({phase: {name: "failed", reason: "noWater"}});
        expect(getByText("Stopped — no water")).toBeTruthy();
        expect(getByText("KEPT IN YOUR BREW HISTORY")).toBeTruthy();
    });

    it("draws a stopped brew in danger", async () => {
        const {getByTestId} = await draw({
            phase: {name: "failed", reason: "noWater"},
            samples: [{at: 40_000, water: 90, cup: 80, pour: 1}]
        });
        expect(getByTestId("trace-water").props.stroke).toBe(palette.danger);
    });

    it("reopens the sheet on a press", async () => {
        const onOpen = jest.fn();
        const {getByLabelText} = await draw({onOpen});
        await fireEvent.press(getByLabelText("Open the brew"));
        expect(onOpen).toHaveBeenCalled();
    });

    it("can be dismissed once the brew is over, and not before", async () => {
        const running = await draw({phase: {name: "pouring", pour: 1, pours: 2}});
        expect(running.queryByLabelText("Dismiss")).toBeNull();
        const finished = await draw({phase: {name: "done"}});
        expect(finished.getByLabelText("Dismiss")).toBeTruthy();
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest components/__tests__/BrewMiniBar.test.tsx`
Expected: FAIL — `Cannot find module '@/components/BrewMiniBar'`.

- [ ] **Step 3: Write the bar**

```tsx
// components/BrewMiniBar.tsx
import React from "react";
import {Pressable} from "react-native";
import {XStack, YStack} from "tamagui";

import BrewTrace from "@/components/BrewTrace";
import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import type {BrewSample} from "@/library/brew/BrewRecord";
import {plannedSeconds} from "@/library/brew/brewShape";
import type {BrewPhase} from "@/library/machine/Machine";
import type Pour from "@/library/Pour";

type Props = {
    recipeName: string;
    dose: number;
    pours: Pour[];
    samples: BrewSample[];
    accent: string;
    phase: BrewPhase;
    elapsed: number;
    holding: boolean;
    heldSeconds: number;
    onOpen: () => void;
    onDismiss: () => void;
};

const TRACE_WIDTH = 86;
const TRACE_HEIGHT = 34;

/** `1:42`, as on the brew screen. Floored, for the same reason. */
function clock(seconds: number): string {
    const whole = Math.floor(Math.max(0, seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** The two lines of words, and the colour the live line takes. */
function say(props: Props): {title: string; detail: string; line: string} {
    const {phase, recipeName, dose, elapsed, holding, heldSeconds, samples} = props;
    const upper = recipeName.toUpperCase();
    if (phase.name === "failed" || phase.name === "cancelled"
        || phase.name === "lostContact") {
        const why = phase.name === "failed" && phase.reason === "noWater"
            ? "no water" : phase.name === "cancelled" ? "you stopped it" : "lost contact";
        return {
            title: `Stopped — ${why}`,
            detail: "KEPT IN YOUR BREW HISTORY",
            line: palette.danger
        };
    }
    if (phase.name === "done") {
        const cup = Math.round(samples[samples.length - 1]?.cup ?? 0);
        return {
            title: "Ready",
            detail: `${cup} G · ${clock(elapsed)} · TAP TO SEE IT`,
            line: palette.success
        };
    }
    if (holding) {
        return {
            title: "Waiting for the cup",
            detail: `+${Math.round(heldSeconds)} S · CARRIES ON BY ITSELF`,
            line: palette.warn
        };
    }
    if (phase.name === "pouring") {
        return {
            title: recipeName,
            detail: `POUR ${phase.pour} OF ${phase.pours} · ${clock(elapsed)}`,
            line: props.accent
        };
    }
    // Grinding, and every phase before it. The dose is what the user would
    // check at this moment, so it is what the second line carries.
    return {title: "Grinding", detail: `${upper} · ${dose} G`, line: props.accent};
}

/**
 * The brew, still running, along the bottom of the library.
 *
 * The sheet's own drawing at 86×34 rather than a row of figures: there is
 * nothing new to learn, and it is the only arrangement in which an unplanned
 * hold is visible rather than inferred from a number.
 */
export default function BrewMiniBar(props: Props) {
    const {pours, samples, accent, phase, holding, onOpen, onDismiss} = props;
    const {title, detail, line} = say(props);
    const over = ["done", "cancelled", "failed", "lostContact"].includes(phase.name);

    return (
        <XStack
            alignItems="center"
            gap="$3"
            padding="$2.5"
            backgroundColor={palette.surface}
            borderTopWidth={1}
            borderTopColor={palette.line}
        >
            <Pressable accessibilityRole="button" accessibilityLabel="Open the brew"
                       onPress={onOpen}
                       style={{flexDirection: "row", alignItems: "center", flex: 1, gap: 12}}>
                <BrewTrace
                    pours={pours}
                    samples={samples}
                    accent={line}
                    width={TRACE_WIDTH}
                    height={TRACE_HEIGHT}
                    plannedSeconds={plannedSeconds(pours)}
                    holding={holding}
                />
                <YStack flex={1} gap="$1">
                    <DotMatrixText fontSize={12} weight="bold" color={palette.text}>
                        {title}
                    </DotMatrixText>
                    <DotMatrixText fontSize={10} weight="bold" letterSpacing={1.4}
                                   color={palette.dim}>
                        {detail}
                    </DotMatrixText>
                </YStack>
                <DotIcon name="chevron-right" size={14} color={palette.dim} />
            </Pressable>
            {/* Only once it is over: dismissing a running brew would suggest
                the dismissal stopped it. */}
            {over && (
                <Pressable accessibilityRole="button" accessibilityLabel="Dismiss"
                           onPress={onDismiss}>
                    <DotIcon name="close" size={14} color={palette.dim} />
                </Pressable>
            )}
        </XStack>
    );
}
```

`BrewTrace` takes `holding` to colour the live line amber; here the colour is
already decided by `say()`, so the bar passes its chosen colour as `accent` and
lets `holding` handle the amber case. Use whatever `DotIcon` names exist for a
chevron and a close — check `constants/dotIcons.ts` and add them in the
neighbours' style if they are missing.

- [ ] **Step 4: Give the bar something to read**

The bar outlives the brew route, so the run cannot live in the route. It moves
into a provider mounted in `app/_layout.tsx`, and both the route and the library
read from it.

```ts
// hooks/useLiveBrew.ts
import React, {createContext, useContext, useState} from "react";

import {useBrewRun} from "@/hooks/useBrewRun";
import {plannedSeconds} from "@/library/brew/brewShape";
import type Recipe from "@/library/Recipe";

type LiveBrew = {
    /** The run in progress, or null when nothing is brewing and nothing is left over. */
    run: (ReturnType<typeof useBrewRun> & {recipe: Recipe; heldSeconds: number}) | null;
    start: (recipe: Recipe) => void;
    dismiss: () => void;
};

const Context = createContext<LiveBrew>({run: null, start: () => {}, dismiss: () => {}});

/**
 * The brew, above every screen that shows it.
 *
 * The sheet can be dismissed without stopping the brew, so the run has to
 * outlive the route that started it. A finished run is kept, not cleared: the
 * done and stopped bars persist until dismissed, because the finished trace is
 * the record and the bar is the way into it.
 */
export function LiveBrewProvider({children}: {children: React.ReactNode}) {
    const [recipe, setRecipe] = useState<Recipe | null>(null);
    return recipe === null
        ? <Context.Provider value={{run: null, start: setRecipe, dismiss: () => {}}}>
              {children}
          </Context.Provider>
        : <Running recipe={recipe} onStart={setRecipe} onDismiss={() => setRecipe(null)}>
              {children}
          </Running>;
}

/**
 * The half that actually runs a brew, split out so `useBrewRun` is only ever
 * called with a recipe. A hook cannot be called conditionally, and the
 * alternative — a run hook that tolerates a null recipe — puts a null check on
 * every line of it.
 */
function Running({recipe, onStart, onDismiss, children}: {
    recipe: Recipe;
    onStart: (recipe: Recipe) => void;
    onDismiss: () => void;
    children: React.ReactNode;
}) {
    const run = useBrewRun(recipe);
    const heldSeconds = Math.max(0, run.elapsed - plannedSeconds(recipe.pours));
    return (
        <Context.Provider
            value={{run: {...run, recipe, heldSeconds}, start: onStart, dismiss: onDismiss}}
        >
            {children}
        </Context.Provider>
    );
}

export function useLiveBrew(): LiveBrew {
    return useContext(Context);
}

export default useLiveBrew;
```

Wrap the app in `app/_layout.tsx`, inside the existing providers:

```tsx
            <LiveBrewProvider>
                {/* the existing Stack */}
            </LiveBrewProvider>
```

`app/brew.tsx` then calls `useLiveBrew()` instead of `useBrewRun(recipe)`, and
calls `start(recipe)` in the mount effect where it currently calls
`brew(recipe)` — the provider owns the brew now, and pressing the system back
button must not end it.

And in `app/index.tsx`, below the list:

```tsx
    const {run, dismiss} = useLiveBrew();
```

```tsx
            {run !== null && (
                <BrewMiniBar
                    recipeName={run.recipe.displayName()}
                    dose={run.recipe.dosage}
                    pours={run.recipe.pours}
                    samples={run.samples}
                    accent={resolveAccent(run.recipe)}
                    phase={run.phase}
                    elapsed={run.elapsed}
                    holding={run.holding}
                    heldSeconds={run.heldSeconds}
                    onOpen={() => router.push(`/brew?recipeJSON=${
                        encodeURIComponent(JSON.stringify(run.recipe))}`)}
                    onDismiss={dismiss}
                />
            )}
```

Check `Recipe`'s dose field name before writing `run.recipe.dosage` — grep for
`dosage` in `library/Recipe.ts` and use whatever is there.

- [ ] **Step 5: Run the suites and commit**

Run: `npx jest components app hooks`
Expected: PASS.

```bash
git add components hooks app
git commit -m "feat(brew): a mini-bar that keeps the brew in view

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Phase 5 — history

### Task 18: The history hook and the sweep

**Files:**
- Create: `hooks/useBrewHistory.ts`
- Modify: `app/_layout.tsx` (run the sweep once at launch)
- Test: `hooks/__tests__/useBrewHistory.test.ts`

List, open, delete, and the retention sweep. The sweep runs **once at launch**,
not after each brew: it is a tidy-up, and doing it on the way out of a brew adds
a delete to the moment the user most wants the app to be showing them a chart.

- [ ] **Step 1: Write the failing test**

```ts
// hooks/__tests__/useBrewHistory.test.ts
import {act, renderHook} from "@testing-library/react-native";

import {sweepOnLaunch, useBrewHistory} from "@/hooks/useBrewHistory";
import type {BrewRecord, BrewSample} from "@/library/brew/BrewRecord";
import type {StoredBrew} from "@/library/BrewDatabase";

function record(id: string): StoredBrew {
    return {
        id, recipeUuid: "uuid-1", recipeName: "Ethiopia Guji", accent: "#C86A3B",
        startedAt: 1, endedAt: 2, outcome: "done", failure: null, pours: 2,
        waterTotal: 250, cupTotal: 244, heldSeconds: 0, hasStream: true
    };
}

function fakeStore(seed: StoredBrew[] = []) {
    let rows = [...seed];
    const swept: number[] = [];
    return {
        swept,
        all: () => rows,
        get: (id: string) => rows.find((r) => r.id === id) ?? null,
        samples: (_id: string): BrewSample[] => [{at: 0, water: 0, cup: 0, pour: 1}],
        remove: (id: string) => { rows = rows.filter((r) => r.id !== id); },
        clear: () => { rows = []; },
        insert: (_r: BrewRecord, _s: BrewSample[]) => {},
        sweep: (keep: number) => { swept.push(keep); }
    };
}

describe("useBrewHistory", () => {
    it("lists what the store has", () => {
        const store = fakeStore([record("a"), record("b")]);
        const {result} = renderHook(() => useBrewHistory(store));
        expect(result.current.brews.map((b) => b.id)).toEqual(["a", "b"]);
    });

    it("opens a record with its stream", () => {
        const store = fakeStore([record("a")]);
        const {result} = renderHook(() => useBrewHistory(store));
        expect(result.current.open("a")?.samples).toHaveLength(1);
    });

    it("returns null for a record that is not there", () => {
        // The mini-bar can outlive a record the user has just deleted.
        const store = fakeStore([]);
        const {result} = renderHook(() => useBrewHistory(store));
        expect(result.current.open("gone")).toBeNull();
    });

    it("drops a brew from the list as well as the store", () => {
        const store = fakeStore([record("a"), record("b")]);
        const {result} = renderHook(() => useBrewHistory(store));
        act(() => result.current.remove("a"));
        expect(result.current.brews.map((b) => b.id)).toEqual(["b"]);
    });

    it("sweeps to the retention the user chose", () => {
        const store = fakeStore([]);
        sweepOnLaunch(store, 10);
        expect(store.swept).toEqual([10]);
    });

    it("sweeps everything when retention is zero", () => {
        // Zero is a real choice and must not fall through to a default.
        const store = fakeStore([]);
        sweepOnLaunch(store, 0);
        expect(store.swept).toEqual([0]);
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest hooks/__tests__/useBrewHistory.test.ts`
Expected: FAIL — `Cannot find module '@/hooks/useBrewHistory'`.

- [ ] **Step 3: Write the hook**

```ts
// hooks/useBrewHistory.ts
import {useState} from "react";

import type {BrewSample} from "@/library/brew/BrewRecord";
import BrewDatabase, {type StoredBrew} from "@/library/BrewDatabase";

/** The part of `BrewDatabase` history reads. Injected, so tests need no SQLite. */
export type HistoryStore = Pick<BrewDatabase,
    "all" | "get" | "samples" | "remove" | "clear" | "sweep">;

let shared: BrewDatabase | undefined;

/** One database for the app, opened on first use rather than on import. */
export function sharedBrewDatabase(): BrewDatabase {
    if (shared === undefined) shared = new BrewDatabase();
    return shared;
}

export function useBrewHistory(store?: HistoryStore) {
    const database = store ?? sharedBrewDatabase();
    const [brews, setBrews] = useState<StoredBrew[]>(() => database.all());

    function open(id: string): {record: StoredBrew; samples: BrewSample[]} | null {
        const found = database.get(id);
        // The mini-bar and a deep link can both outlive the record they name.
        if (found === null) return null;
        return {record: found, samples: database.samples(id)};
    }

    function remove(id: string): void {
        database.remove(id);
        setBrews(database.all());
    }

    function clear(): void {
        database.clear();
        setBrews([]);
    }

    return {brews, open, remove, clear, refresh: () => setBrews(database.all())};
}

/**
 * Expire old streams, once, at launch.
 *
 * Not after each brew: it is a tidy-up, and running it on the way out of a brew
 * puts a delete in the moment the user most wants the app to be drawing them a
 * chart.
 */
export function sweepOnLaunch(store: HistoryStore, keep: number): void {
    store.sweep(keep);
}

export default useBrewHistory;
```

- [ ] **Step 4: Run the sweep at launch**

In `app/_layout.tsx`, inside the existing mount effect (or a new one beside it):

```tsx
    useEffect(() => {
        sweepOnLaunch(sharedBrewDatabase(), retention);
    }, [retention]);
```

with `const [retention] = useSetting("brewTraceRetention");` above it.

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx jest hooks/__tests__/useBrewHistory.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add hooks/useBrewHistory.ts hooks/__tests__/useBrewHistory.test.ts app/_layout.tsx
git commit -m "feat(brew): brew history, and a retention sweep at launch

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 19: The history screens

**Files:**
- Create: `app/brewHistory.tsx`, `app/brewRecord.tsx`
- Create: `components/BrewHistoryRow.tsx`
- Modify: `components/RecipeOverflowSheet.tsx`, the Settings → Library section
- Test: `app/__tests__/brewHistory.test.tsx`, `app/__tests__/brewRecord.test.tsx`,
  `components/__tests__/BrewHistoryRow.test.tsx`

**Three entry points, each for a different moment:**

- The **recipe's overflow sheet** — "how have I brewed this?"
- **From a brew.** The record screen's header offers `All brews`, because
  history is worth reaching when a person is already thinking about brews.
- **Settings → Library**, a `Brew history` row: the backstop for wanting last
  Tuesday's brew with nothing on screen to get there from.

The record screen is the brew screen's own drawing, frozen: the same trace, the
same figures, the same ladder with every stage done. Nothing new to learn, and
it is why `BrewStageLadder` takes `activeIndex === pours.length` to mean "all
done".

- [ ] **Step 1: Write the row's failing test**

```tsx
// components/__tests__/BrewHistoryRow.test.tsx
import React from "react";

import BrewHistoryRow from "@/components/BrewHistoryRow";
import {palette} from "@/constants/colors";
import type {StoredBrew} from "@/library/BrewDatabase";
import {renderWithProviders} from "@/test-utils/render";

function brew(overrides: Partial<StoredBrew> = {}): StoredBrew {
    return {
        id: "brew-1", recipeUuid: "uuid-1", recipeName: "Ethiopia Guji",
        accent: "#C86A3B", startedAt: Date.UTC(2026, 8, 3, 7, 42),
        endedAt: Date.UTC(2026, 8, 3, 7, 46), outcome: "done", failure: null,
        pours: 5, waterTotal: 250, cupTotal: 244, heldSeconds: 14,
        hasStream: true, ...overrides
    };
}

describe("BrewHistoryRow", () => {
    it("names the brew and what came out of it", async () => {
        const {getByText} = await renderWithProviders(
            <BrewHistoryRow brew={brew()} onPress={jest.fn()} />
        );
        expect(getByText("Ethiopia Guji")).toBeTruthy();
        expect(getByText(/244 G/)).toBeTruthy();
    });

    it("marks a brew that did not finish", async () => {
        const {getByText} = await renderWithProviders(
            <BrewHistoryRow brew={brew({outcome: "failed", failure: "noWater"})}
                            onPress={jest.fn()} />
        );
        expect(getByText("STOPPED").props.color).toBe(palette.danger);
    });

    it("draws in the accent the recipe had at the time", async () => {
        // Copied onto the record, so a recipe recoloured — or deleted — since
        // does not rewrite its own history.
        const {getByTestId} = await renderWithProviders(
            <BrewHistoryRow brew={brew({accent: "#4A7BC8"})} onPress={jest.fn()} />
        );
        expect(getByTestId("history-row-mark").props.style.backgroundColor)
            .toBe("#4A7BC8");
    });

    it("says a stream has expired rather than hiding it", async () => {
        // The record survives the sweep; saying so is what stops it looking
        // like a bug.
        const {getByText} = await renderWithProviders(
            <BrewHistoryRow brew={brew({hasStream: false})} onPress={jest.fn()} />
        );
        expect(getByText("NO TRACE KEPT")).toBeTruthy();
    });
});
```

Write `BrewHistoryRow` to satisfy it: a coloured mark in `brew.accent`, the
recipe name, and one Doto line carrying the date, `${cupTotal} G`, the duration
from `endedAt - startedAt`, and either `STOPPED` in `palette.danger` or
`NO TRACE KEPT` in `palette.muted` where they apply.

Run: `npx jest components/__tests__/BrewHistoryRow.test.tsx` → PASS, 4 tests.

- [ ] **Step 2: Write the list screen's failing test**

```tsx
// app/__tests__/brewHistory.test.tsx
import React from "react";

import BrewHistory from "@/app/brewHistory";
import {renderWithProviders} from "@/test-utils/render";

jest.mock("expo-router", () => ({
    router: {push: jest.fn(), back: jest.fn()},
    useLocalSearchParams: () => ({recipeUuid: global.__filter}),
    useNavigation: () => ({setOptions: jest.fn()})
}));

jest.mock("@/hooks/useBrewHistory", () => ({
    useBrewHistory: () => ({brews: global.__brews, remove: jest.fn(), open: jest.fn()}),
    sharedBrewDatabase: () => ({})
}));

describe("brew history", () => {
    beforeEach(() => {
        global.__filter = undefined;
        global.__brews = [
            {id: "a", recipeUuid: "uuid-1", recipeName: "Ethiopia Guji",
             accent: "#C86A3B", startedAt: 2, endedAt: 3, outcome: "done",
             failure: null, pours: 5, waterTotal: 250, cupTotal: 244,
             heldSeconds: 0, hasStream: true},
            {id: "b", recipeUuid: "uuid-2", recipeName: "Kenya Nyeri",
             accent: "#4A7BC8", startedAt: 1, endedAt: 2, outcome: "done",
             failure: null, pours: 3, waterTotal: 200, cupTotal: 195,
             heldSeconds: 0, hasStream: false}
        ];
    });

    it("lists every brew when nothing is filtered", async () => {
        const {getByText} = await renderWithProviders(<BrewHistory />);
        expect(getByText("Ethiopia Guji")).toBeTruthy();
        expect(getByText("Kenya Nyeri")).toBeTruthy();
    });

    it("shows one recipe's brews when reached from that recipe", async () => {
        global.__filter = "uuid-2";
        const {getByText, queryByText} = await renderWithProviders(<BrewHistory />);
        expect(getByText("Kenya Nyeri")).toBeTruthy();
        expect(queryByText("Ethiopia Guji")).toBeNull();
    });

    it("says so when there is nothing yet", async () => {
        global.__brews = [];
        const {getByText} = await renderWithProviders(<BrewHistory />);
        expect(getByText(/no brews yet/i)).toBeTruthy();
    });
});
```

Write `app/brewHistory.tsx`: a `FlatList` of `BrewHistoryRow`, filtered by the
optional `recipeUuid` search param, an empty state, and a press that pushes
`/brewRecord?id=<id>`. Configure the header with `navigation.setOptions` inside
a `useEffect`, as every other screen here does — not with static route options.

- [ ] **Step 3: Write the record screen's failing test**

```tsx
// app/__tests__/brewRecord.test.tsx
import React from "react";

import BrewRecord from "@/app/brewRecord";
import {renderWithProviders} from "@/test-utils/render";

jest.mock("expo-router", () => ({
    router: {push: jest.fn(), back: jest.fn()},
    useLocalSearchParams: () => ({id: "brew-1"}),
    useNavigation: () => ({setOptions: jest.fn()})
}));

jest.mock("@/hooks/useBrewHistory", () => ({
    useBrewHistory: () => ({brews: [], remove: jest.fn(), open: () => global.__opened}),
    sharedBrewDatabase: () => ({})
}));

const record = {
    id: "brew-1", recipeUuid: "uuid-1", recipeName: "Ethiopia Guji",
    accent: "#C86A3B", startedAt: 0, endedAt: 228_000, outcome: "done",
    failure: null, pours: 2, waterTotal: 250, cupTotal: 244, heldSeconds: 14,
    hasStream: true
};

describe("brew record", () => {
    beforeEach(() => {
        global.__opened = {
            record,
            samples: [{at: 0, water: 0, cup: 0, pour: 1},
                      {at: 228_000, water: 250, cup: 244, pour: 2}]
        };
    });

    it("draws the trace and the figures", async () => {
        const {getByLabelText, getByText} = await renderWithProviders(<BrewRecord />);
        expect(getByLabelText("Brew trace")).toBeTruthy();
        expect(getByText("244")).toBeTruthy();
    });

    it("names the time it held", async () => {
        // The truthful record: the chart already shows the overrun, and the
        // figure names it.
        const {getByText} = await renderWithProviders(<BrewRecord />);
        expect(getByText(/\\+14 S/)).toBeTruthy();
    });

    it("offers All brews from a brew", async () => {
        const {getByLabelText} = await renderWithProviders(<BrewRecord />);
        expect(getByLabelText("All brews")).toBeTruthy();
    });

    it("says the trace has expired rather than drawing an empty chart", async () => {
        global.__opened = {record: {...record, hasStream: false}, samples: []};
        const {getByText, queryByLabelText} = await renderWithProviders(<BrewRecord />);
        expect(getByText(/no trace was kept/i)).toBeTruthy();
        expect(queryByLabelText("Brew trace")).toBeNull();
    });

    it("says so when the record is gone", async () => {
        global.__opened = null;
        const {getByText} = await renderWithProviders(<BrewRecord />);
        expect(getByText(/that brew is no longer here/i)).toBeTruthy();
    });
});
```

Write `app/brewRecord.tsx` as the brew screen's layout frozen: `BrewTrace` with
the stored samples, `BrewFigures` with the record's totals and its duration,
and `BrewStageLadder` with `activeIndex` set to the pour count so every stage
reads as done. The pours come from the recipe if it still exists and from the
record's summary if it does not — a record whose recipe has been deleted still
shows its trace and its figures, with the ladder omitted.

- [ ] **Step 4: Add the three entry points**

- `components/RecipeOverflowSheet.tsx`: a `Brew history` row pushing
  `/brewHistory?recipeUuid=<uuid>`. Copy the neighbouring rows exactly.
- `app/brewRecord.tsx`: an `All brews` header button pushing `/brewHistory`.
- Settings → Library: a `Brew history` row pushing `/brewHistory`.

- [ ] **Step 5: Run the suites and commit**

Run: `npx jest app components`
Expected: PASS.

```bash
git add app components
git commit -m "feat(brew): brew history, three ways in

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 20: Export

**Files:**
- Create: `library/brew/brewExport.ts`
- Modify: `app/brewRecord.tsx`, `package.json`
- Test: `library/brew/__tests__/brewExport.test.ts`

Both forms, because they answer different questions:

- **An image** — the finished trace as a PNG, handed to the share sheet, for
  showing someone.
- **The data** — the summary and the stream as JSON, for dialling in.

The JSON half needs no new dependency and is written first, so a failure to
install the native one does not block the useful half.

- [ ] **Step 1: Install the two dependencies**

```bash
npx expo install react-native-view-shot expo-sharing
```

Use `npx expo install`, not `npm install`, so the versions stay pinned to SDK
57. If npm rejects it with `EALLOWSCRIPTS`, run `npx expo-doctor` to read off
the expected versions and write them into `package.json` by hand.

`react-native-view-shot` is native, so the dev client must be rebuilt:
`npm run ios`. It also means `expo.version` in `app.json` needs a bump —
`runtimeVersion.policy` is `appVersion`, so a native-affecting change without
one hands an incompatible update to an existing build.

Run: `npx expo-doctor`
Expected: 21/21.

- [ ] **Step 2: Write the failing test for the data half**

```ts
// library/brew/__tests__/brewExport.test.ts
import {brewFilename, toExportJson} from "@/library/brew/brewExport";
import type {BrewSample} from "@/library/brew/BrewRecord";
import type {StoredBrew} from "@/library/BrewDatabase";

const record: StoredBrew = {
    id: "brew-1", recipeUuid: "uuid-1", recipeName: "Ethiopia Guji",
    accent: "#C86A3B", startedAt: Date.UTC(2026, 8, 3, 7, 42),
    endedAt: Date.UTC(2026, 8, 3, 7, 46), outcome: "done", failure: null,
    pours: 5, waterTotal: 250, cupTotal: 244, heldSeconds: 14, hasStream: true
};

const samples: BrewSample[] = [{at: 0, water: 0, cup: 0, pour: 1}];

describe("brewExport", () => {
    it("carries the summary and the stream", () => {
        const exported = JSON.parse(toExportJson(record, samples));
        expect(exported.brew.recipeName).toBe("Ethiopia Guji");
        expect(exported.samples).toHaveLength(1);
    });

    it("stamps the export with a version", () => {
        // Something else will read these one day, and a file that cannot say
        // what shape it is in is a file nobody can safely parse.
        expect(JSON.parse(toExportJson(record, samples)).version).toBe(1);
    });

    it("writes times as ISO as well as milliseconds", () => {
        // Milliseconds are for a program, the ISO string is for a person
        // opening the file in a text editor.
        const exported = JSON.parse(toExportJson(record, samples));
        expect(exported.brew.startedAtISO).toBe("2026-09-03T07:42:00.000Z");
    });

    it("names the file after the brew and its date", () => {
        expect(brewFilename(record, "json")).toBe("ethiopia-guji-2026-09-03.json");
    });

    it("makes a filename out of a name that is all punctuation", () => {
        // A name of "···" would otherwise produce a file called ".json",
        // which is hidden on every platform that matters.
        expect(brewFilename({...record, recipeName: "···"}, "png"))
            .toBe("brew-2026-09-03.png");
    });
});
```

- [ ] **Step 3: Run it and watch it fail, then write it**

Run: `npx jest library/brew/__tests__/brewExport.test.ts` → FAIL, module not found.

```ts
// library/brew/brewExport.ts
import type {BrewSample} from "./BrewRecord";
import type {StoredBrew} from "../BrewDatabase";

/** Bumped whenever the exported shape changes in a way a reader must notice. */
const EXPORT_VERSION = 1;

/**
 * A brew as a file.
 *
 * Times are carried twice — milliseconds for a program, ISO for a person who
 * opens the file in a text editor — and the whole thing is versioned, because
 * something else will read these one day and a file that cannot say what shape
 * it is in is a file nobody can safely parse.
 */
export function toExportJson(record: StoredBrew, samples: BrewSample[]): string {
    return JSON.stringify({
        version: EXPORT_VERSION,
        brew: {
            ...record,
            startedAtISO: new Date(record.startedAt).toISOString(),
            endedAtISO: new Date(record.endedAt).toISOString()
        },
        samples
    }, null, 2);
}

/** `ethiopia-guji-2026-09-03.json`. */
export function brewFilename(record: StoredBrew, extension: "json" | "png"): string {
    const slug = record.recipeName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    const date = new Date(record.startedAt).toISOString().slice(0, 10);
    // A name of "···" slugs to nothing, and a file called ".json" is hidden on
    // every platform that matters.
    return `${slug === "" ? "brew" : slug}-${date}.${extension}`;
}
```

Run: `npx jest library/brew/__tests__/brewExport.test.ts` → PASS, 5 tests.

- [ ] **Step 4: Wire both exports into the record screen**

`app/brewRecord.tsx` gains two actions, `Save as image` and `Export the data`.

For the image, wrap the trace and the figures in `react-native-view-shot`'s
`ViewShot` with a ref, then:

```tsx
    async function shareImage() {
        const uri = await shot.current?.capture?.();
        if (uri === undefined) return;
        // `isAvailableAsync` is false on a simulator with no share sheet, and
        // calling through anyway throws rather than doing nothing.
        if (!(await Sharing.isAvailableAsync())) return;
        await Sharing.shareAsync(uri, {mimeType: "image/png",
                                       dialogTitle: brewFilename(record, "png")});
    }
```

For the data, write the JSON to `FileSystem.cacheDirectory` under
`brewFilename(record, "json")` and share that — the share sheet takes a URI, not
a string, and the cache directory is the right place for a file the system may
reclaim.

Both are wrapped in `try`/`catch` that swallows the user cancelling, which
arrives as a rejection on iOS and is not an error.

No component test for the share itself: it is two native modules and a system
sheet, and a test of it would only assert that two mocks were called. Add one
that the buttons exist:

```tsx
    it("offers both exports", async () => {
        const {getByLabelText} = await renderWithProviders(<BrewRecord />);
        expect(getByLabelText("Save as image")).toBeTruthy();
        expect(getByLabelText("Export the data")).toBeTruthy();
    });
```

- [ ] **Step 5: Bump the version and commit**

In `app.json`, raise `expo.version` — a new native module means a new runtime
version, and `runtimeVersion.policy` is `appVersion`.

Run: `npm run typecheck && npx jest && npx expo-doctor`
Expected: PASS, 21/21.

```bash
git add package.json package-lock.json app.json app library
git commit -m "feat(brew): export a brew as an image or as data

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Phase 6 — convergence and close

### Task 21: The editor gains the timing bar and the glyphs

**Files:**
- Modify: `components/StageTile.tsx`
- Test: `components/__tests__/StageTile.test.tsx`

The editor already has the architecture the brew adopted — an accent
zero-padded index, dot-matrix facts, expansion in place. In exchange it gains
the brew's **timing lane and glyphs**: a collapsed editor stage today shows
three numbers and cannot convey rhythm at all.

**The only difference between the two** is that where the brew rung shows
progress, the editor tile shows a caret. That is the whole of §2.3, and it is
what makes the two screens one family rather than two things that merely
resemble each other.

Do **not** merge `BrewStageRung` and `StageTile` into one component. They share
`PourGlyph` and the lane arithmetic in `brewShape.ts`, which is where the
sharing belongs; one component with a `mode` prop would carry both screens'
requirements forever.

- [ ] **Step 1: Write the failing test**

Append to `components/__tests__/StageTile.test.tsx`, matching however that file
already builds its props:

```tsx
    it("shows the pattern glyph on the collapsed header", async () => {
        // Three numbers cannot convey rhythm. The glyph and the lane can.
        const {getByLabelText} = await renderWithProviders(
            <StageTile {...props({pour: pourWith({pourPattern: POUR_PATTERN.SPIRAL})})} />
        );
        expect(getByLabelText("Spiral pour")).toBeTruthy();
    });

    it("draws the timing lane to real seconds", async () => {
        const {getByTestId} = await renderWithProviders(<StageTile {...props()} />);
        expect(getByTestId("stage-lane")).toBeTruthy();
    });

    it("shows a caret where the brew rung shows progress", async () => {
        // The one difference between the two, and it is what says this tile
        // opens.
        const {getByTestId, queryByTestId} = await renderWithProviders(
            <StageTile {...props()} />
        );
        expect(getByTestId("stage-caret")).toBeTruthy();
        expect(queryByTestId("rung-fill")).toBeNull();
    });

    it("marks agitation on the edge where it happens", async () => {
        const {getByTestId} = await renderWithProviders(
            <StageTile {...props({pour: pourWith({agitation: AGITATION.BEFORE_ON_AFTER_ON})})} />
        );
        expect(getByTestId("stage-agitation-before")).toBeTruthy();
        expect(getByTestId("stage-agitation-after")).toBeTruthy();
    });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest components/__tests__/StageTile.test.tsx`
Expected: FAIL on all four.

- [ ] **Step 3: Add the lane and the glyphs to the header**

In `components/StageTile.tsx`, in the collapsed header row, between the index
and the numbers:

```tsx
import PourGlyph, {glyphForPattern} from "@/components/PourGlyph";
import {pauseSeconds, pourSeconds} from "@/library/brew/brewShape";
```

```tsx
    const span = pourSeconds(pour) + pauseSeconds(pour);
    const laneSeconds = Math.max(span, 1);
```

and draw a `PourGlyph` for `glyphForPattern(pour.pourPattern)`, then a lane of
the same two bars as `BrewStageRung` — solid for the pour, dashed for the pause
— with `testID="stage-lane"`, and the agitation marks on its edges with
`testID="stage-agitation-before"` / `-after`.

`laneSeconds` here is the **tile's own** span, not the deck's widest: the editor
shows one stage at a time in a card of its own, so there is no column of lanes
for a shared scale to line up. Reuse the arithmetic, not the scale.

Keep the existing caret exactly where it is and give it `testID="stage-caret"`
if it has none.

- [ ] **Step 4: Run every touched suite**

Run: `npx jest components`
Expected: PASS. `StageTile` is on the editor's hot path, so also run
`npx jest app/__tests__/editRecipe.test.tsx` if one exists.

- [ ] **Step 5: Commit**

```bash
git add components/StageTile.tsx components/__tests__/StageTile.test.tsx
git commit -m "feat(editor): the stage tile gains the brew's lane and glyphs

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 22: Verify, document, and close

**Files:**
- Modify: `docs/superpowers/specs/2026-08-22-programme-roadmap.md`
- Modify: `README.md` if it describes the brew screen
- Modify: `.github/copilot-instructions.md`

- [ ] **Step 1: Run everything CI runs**

```bash
npm run typecheck && npm run lint && npx jest && npx expo-doctor
```

Expected: typecheck clean; lint **0 errors** (the `react-hooks/exhaustive-deps`
warnings are deliberate — the React Compiler owns memoisation — but a new one
should be looked at before being accepted); every test green; expo-doctor 21/21,
which is a hard CI failure if it is not.

- [ ] **Step 2: Update the instructions file**

`.github/copilot-instructions.md` is what the next engineer reads first. Add,
in the existing voice and in the right sections:

- `library/brew/` — the record, the recorder, the shape. Pure, no React.
- `BrewDatabase.ts` — two tables, two lifetimes; the stream is one JSON row and
  the retention sweep drops streams while leaving records.
- The two water events are different things: `blocked` is amber, costs nothing
  and offers a retry; `noWater` is red, costs a dose and deliberately does not.
- `PourGlyph` is shared by the brew rung and the editor tile, and that sharing
  is the point — see §2.3 of the spec.
- The brew's time axis is **real seconds**; `PourProfile`'s is evenly divided.
  Both are correct and they must not be reconciled.

- [ ] **Step 3: Mark M4 done on the roadmap**

In `docs/superpowers/specs/2026-08-22-programme-roadmap.md`, move M4's row to
complete, note the Live Activity (#71) as the one deferred piece with its
reason, and list the hardware verification as outstanding until it is done.

- [ ] **Step 4: Verify on hardware**

**None of the brew path can be exercised in a simulator.** Before any EAS
release build, brew on a real J15 and check:

- [ ] A clean brew: the trace tracks the plan, the figures move, the ladder
      auto-scrolls, the record lands in history.
- [ ] An overflow-protection hold: the lane re-scales, the fill and the live
      line turn amber, the card explains it, and the finished chart shows the
      gap with `+N S`.
- [ ] A refusal for water: **amber**, the plan untouched, the recipe's own
      volume in the sentence, TRY AGAIN offered, and **no history row written**.
- [ ] Dismissing the sheet mid-brew: the mini-bar appears, keeps drawing, and
      reopens the sheet.
- [ ] The BREW capsule against the swipe-to-delete tiles on the same edge —
      the one thing in this milestone judged acceptable on screen and unproven
      in the hand.
- [ ] The status dot's states, and the popover's water refresh.
- [ ] Export: a PNG that is legible when shared, and a JSON file that opens.

- [ ] **Step 5: Commit and open the PR**

```bash
git add docs .github README.md
git commit -m "docs: close out M4

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
git push -u origin m4-watch-it-brew
gh pr create --fill
```

The `XBRW++` wordmark commit from `home-wordmark` rides in this branch and this
PR, as §4.1 of the spec records.

Request review with the `superpowers:requesting-code-review` skill once CI is
green.















# Gravimetric Flow Rate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show how fast liquid is leaving the bed, as a glanceable figure on the live brew screen and as a chart and a stored number on the record, without ever letting the bypass corrupt the reading.

**Architecture:** One new pure module, `library/brew/flowRate.ts`, fits a least-squares slope over a two second window of the sample stream and excludes bypass samples by the same `pour > stages` test `drawdownFrom` already uses. One new optional field, `BrewRecord.cupAtDrawdown`, is a raw observation that lets the average drawdown rate be derived after the sample stream has been swept. Everything drawn is a thin view over those two.

**Tech Stack:** TypeScript, React Native, Expo SDK 57, Tamagui, react-native-svg, expo-sqlite, Jest with jest-expo, @testing-library/react-native v14.

**Spec:** `docs/superpowers/specs/2026-09-29-gravimetric-flow-rate-design.md`

---

## Deviations from the spec, decided while planning

Two, both recorded here so a reviewer can see them rather than discover them.

1. **`flowNow` returns `FlowPoint | null`, not `FlowPoint`.** The spec (§4) has it
   returning zeroes on an empty stream and puts the "absent until pouring" rule
   on the screen (§5). Returning null puts the rule in the one place that can
   answer it, so a second caller cannot forget it. It also answers the bypass
   case for free: while the bypass is the only thing in the window there are no
   brew samples to fit, so the row steps aside instead of reporting the bypass's
   rate as the bed's.

2. **Two functions are added to the §4 API list:** `flowTail`, which the live
   sparkline needs, and `maxRateOf`, which the compare screen's negotiated axis
   needs. Both are one-liners over `flowSeries`; they live in the module so the
   arithmetic stays out of the components.

Nothing else in the spec is departed from.

---

## File Structure

**Created:**

| File | Responsibility |
| --- | --- |
| `library/brew/flowRate.ts` | All the rate arithmetic. Plain TypeScript, no React, no database, no drawing. |
| `library/brew/__tests__/flowRate.test.ts` | The arithmetic's characterisation tests, including the one that stops the fit being simplified to a secant. |
| `components/FlowSparkline.tsx` | The 30 second cup-rate sparkline. A dumb `Svg` over a `number[]`. |
| `components/BrewRateChart.tsx` | The two-channel rate chart for the record, the share and the compare lanes. |
| `components/__tests__/FlowSparkline.test.tsx` | |
| `components/__tests__/BrewRateChart.test.tsx` | |

**Modified:**

| File | Change |
| --- | --- |
| `library/brew/BrewRecord.ts` | One new optional field, `cupAtDrawdown`. |
| `library/brew/BrewRecorder.ts` | Writes it at the same boundary `drawdownAt` is taken from. |
| `library/BrewDatabase.ts` | One column, one migration, the insert, the hydrate. |
| `library/backup.ts` | One optional-field validator, one line in the rebuild. |
| `components/BrewFigures.tsx` | The `FLOW` row, and a second term on the `DRAWDOWN` line. |
| `components/BrewSummary.tsx` | Renders `BrewRateChart` under the trace, inside the `ViewShot`. |
| `components/BrewHistoryRow.tsx` | One figure and one clause in the accessibility label. |
| `app/brew.tsx` | Feeds the `FLOW` row and the live drawdown clock. |
| `app/brewRecord.tsx` | Passes `drawdownRate(record)` to the summary. |
| `library/brew/compare.ts` | `CompareAxis` gains `maxRate`. |
| `app/brewCompare.tsx` | Two rate lanes under the two volume lanes. |

---

### Task 1: The rate arithmetic

**Files:**
- Create: `library/brew/flowRate.ts`
- Test: `library/brew/__tests__/flowRate.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `library/brew/__tests__/flowRate.test.ts`:

```ts
import type {BrewSample} from "@/library/brew/BrewRecord";
import {FLOW_WINDOW_MS, flowAt, flowNow, flowSeries, flowTail, maxRateOf}
    from "@/library/brew/flowRate";

/** A stream at 10 Hz. `slope` is g/s and ml/s; both channels get it. */
function ramp(seconds: number, slope: number, from = 0, at0 = 0): BrewSample[] {
    const out: BrewSample[] = [];
    for (let i = 0; i <= seconds * 10; i++) {
        out.push({
            at: at0 + i * 100,
            water: from + slope * (i / 10),
            cup: from + slope * (i / 10),
            pour: 1
        });
    }
    return out;
}

describe("flowAt", () => {
    it("fits a constant slope exactly when the stream is clean", () => {
        const samples = ramp(10, 2);
        expect(flowAt(samples, 1, 5000)?.cup).toBeCloseTo(2, 6);
    });

    it("survives the scale's noise floor where a two point secant does not", () => {
        // The window holds 21 samples at 10 Hz. The noise is the scale's own
        // half millilitre, placed at its worst for a secant: the window's first
        // reading sits low and its last sits high, so the endpoints alone
        // manufacture a whole extra gram across two seconds.
        const samples = ramp(2, 2).map((s, i) => {
            const noise = i === 0 ? -0.5 : i === 20 ? 0.5 : i % 2 === 1 ? 0.5 : -0.5;
            return {...s, cup: s.cup + noise};
        });

        const fitted = flowAt(samples, 1, 2000)!.cup;
        const first = samples[0];
        const last = samples[samples.length - 1];
        const secant = (last.cup - first.cup) / ((last.at - first.at) / 1000);

        expect(Math.abs(fitted - 2)).toBeLessThan(0.2);
        // The assertion that stops somebody simplifying the fit away. A secant
        // over the same readings is off by a quarter of the signal.
        expect(Math.abs(secant - 2)).toBeGreaterThan(0.4);
    });

    it("lags a change of slope by the window and no more", () => {
        // Slope 1 for ten seconds, then slope 3.
        const first = ramp(10, 1);
        const second = ramp(10, 3, 10, 10_000).slice(1);
        const samples = [...first, ...second];

        // Wholly before the change: the old slope, exactly.
        expect(flowAt(samples, 1, 9_900)!.cup).toBeCloseTo(1, 6);
        // Halfway through the window after it: somewhere between the two.
        const midway = flowAt(samples, 1, 11_000)!.cup;
        expect(midway).toBeGreaterThan(1.2);
        expect(midway).toBeLessThan(2.9);
        // A full window past it: the new slope, exactly.
        expect(flowAt(samples, 1, 12_500)!.cup).toBeCloseTo(3, 6);
    });

    it("is null before there is enough of a window to fit", () => {
        expect(flowAt([], 1, 0)).toBeNull();
        expect(flowAt(ramp(0, 2), 1, 0)).toBeNull();
    });

    it("never lets the bypass into the cup channel", () => {
        // Two stages, then a bypass tagged stage 3, dumping 30 g in 2 seconds.
        const brew = ramp(10, 2);
        const bypass: BrewSample[] = [];
        for (let i = 1; i <= 20; i++) {
            bypass.push({
                at: 10_000 + i * 100,
                water: 20 + i * 1.5,
                cup: 20 + i * 1.5,
                pour: 3
            });
        }
        const samples = [...brew, ...bypass];

        // Read at the height of the bypass. The bed's rate is what it was.
        expect(flowAt(samples, 2, 10_000)!.cup).toBeCloseTo(2, 6);
        // And once the window holds nothing but bypass, there is nothing to say.
        expect(flowAt(samples, 2, 12_000)).toBeNull();
    });
});

describe("flowNow", () => {
    it("reads the end of the stream", () => {
        expect(flowNow(ramp(10, 2), 1)!.cup).toBeCloseTo(2, 6);
    });

    it("is null on a stream that has not started", () => {
        expect(flowNow([], 1)).toBeNull();
    });
});

describe("flowSeries", () => {
    it("carries both channels on the sample clock", () => {
        const series = flowSeries(ramp(10, 2), 1);
        expect(series.length).toBeGreaterThan(0);
        const last = series[series.length - 1];
        expect(last.at).toBe(10_000);
        expect(last.cup).toBeCloseTo(2, 6);
        expect(last.water).toBeCloseTo(2, 6);
    });

    it("has no point where only the bypass was running", () => {
        const brew = ramp(5, 2);
        const bypass = Array.from({length: 40}, (_, i) => ({
            at: 5_000 + (i + 1) * 100,
            water: 10 + (i + 1) * 1.5,
            cup: 10 + (i + 1) * 1.5,
            pour: 2
        }));
        const series = flowSeries([...brew, ...bypass], 1);
        expect(series.every((point) => point.cup < 3)).toBe(true);
    });
});

describe("flowTail", () => {
    it("gives a fixed number of buckets over the requested tail", () => {
        const tail = flowTail(ramp(60, 2), 1, 30, 24);
        expect(tail).toHaveLength(24);
        expect(tail[tail.length - 1]).toBeCloseTo(2, 1);
    });

    it("is empty when there is nothing to fit", () => {
        expect(flowTail([], 1, 30, 24)).toEqual([]);
    });
});

describe("maxRateOf", () => {
    it("is the largest rate in either channel", () => {
        expect(maxRateOf(flowSeries(ramp(10, 2), 1))).toBeCloseTo(2, 6);
    });

    it("is zero on an empty series", () => {
        expect(maxRateOf([])).toBe(0);
    });
});

describe("FLOW_WINDOW_MS", () => {
    it("is two seconds, which half of the arithmetic above assumes", () => {
        expect(FLOW_WINDOW_MS).toBe(2000);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest library/brew/__tests__/flowRate.test.ts`
Expected: FAIL, `Cannot find module '@/library/brew/flowRate'`.

- [ ] **Step 3: Write the module**

Create `library/brew/flowRate.ts`:

```ts
import type {BrewSample} from "./BrewRecord";

/**
 * How much of the stream one reading of the rate is fitted over.
 *
 * A rate is a derivative, and differentiating a scale stream amplifies its
 * noise. The scale reports about ten samples a second and `stalls.ts` fixes
 * the noise floor at 0.5 ml, so a difference across one sample gap carries
 * 0.5 / 0.1 = 5 g/s of noise on a signal of about 2 g/s -- more noise than
 * reading, and it would look like a machine misbehaving when nothing was.
 *
 * Two seconds and not three, because the window is also a lag: the figure
 * trails reality by about half of it, and a second is the most a live readout
 * can carry before it stops describing what is in front of you.
 */
export const FLOW_WINDOW_MS = 2000;

/** Below this many readings a window cannot be fitted at all. */
const MIN_WINDOW_SAMPLES = 2;

/**
 * A windowed rate pair at one instant.
 *
 * `at` is on the sample clock, milliseconds since the first drop. `cup` is
 * g/s leaving the bed, `water` is ml/s the machine is dispensing.
 */
export type FlowPoint = {at: number; cup: number; water: number};

/**
 * The samples a rate may be read from: brew water only.
 *
 * `BrewSample.water` and `.cup` are raw scale totals and the bypass goes onto
 * the same scale, firing (per the verified frame log of 2026-09-10) squarely
 * inside the drawdown. Untreated it would put a cliff in the cup channel that
 * looks exactly like a channelling event.
 *
 * The discriminator is `pour > stages`, which is the same test `drawdownFrom`
 * already uses and the reason the drawdown boundary is already safe. One
 * discriminator, proven on hardware, rather than a second derived from
 * `bypass.startedAt` that could drift out of step with it. `pour < 1` is the
 * stretch before the first drop, which has no rate either.
 */
function brewOnly(samples: BrewSample[], stages: number): BrewSample[] {
    return samples.filter((s) => s.pour >= 1 && s.pour <= stages);
}

/**
 * The least-squares slope of one field over a set of readings, per second.
 *
 * A fit across every reading in the window, not a secant between its
 * endpoints. A secant divides the noise of two readings; a fit spreads it
 * across the twenty or so the window holds, and that is the only reason two
 * seconds is usable. Null when the readings do not span any time, which is
 * what a single reading and a burst at one timestamp both look like.
 */
function slope(window: BrewSample[], of: "cup" | "water"): number | null {
    if (window.length < MIN_WINDOW_SAMPLES) return null;

    let sumT = 0;
    let sumV = 0;
    for (const s of window) {
        sumT += s.at / 1000;
        sumV += s[of];
    }
    const meanT = sumT / window.length;
    const meanV = sumV / window.length;

    let covariance = 0;
    let variance = 0;
    for (const s of window) {
        const dt = s.at / 1000 - meanT;
        covariance += dt * (s[of] - meanV);
        variance += dt * dt;
    }
    if (variance === 0) return null;
    return covariance / variance;
}

/**
 * The rate at one instant, or null when nobody can say.
 *
 * Null rather than zero throughout. Zero is a claim that nothing is flowing,
 * and "the window holds no brew readings" is a different statement: it is what
 * a brew that has not poured yet, and a brew whose last two seconds were all
 * bypass, both look like.
 *
 * @param at milliseconds on the sample clock. The window ends here and is
 *   inclusive at both ends.
 */
export function flowAt(
    samples: BrewSample[], stages: number, at: number
): FlowPoint | null {
    const from = at - FLOW_WINDOW_MS;
    const window = brewOnly(samples, stages)
        .filter((s) => s.at >= from && s.at <= at);
    const cup = slope(window, "cup");
    const water = slope(window, "water");
    if (cup === null || water === null) return null;
    return {at, cup, water};
}

/**
 * The latest rate, for the live row. Null until there is one.
 *
 * Anchored to the last sample of the whole stream rather than the last brew
 * sample, so that a bypass running longer than the window empties it. That is
 * deliberate: during the bypass the cup is filling with water that never
 * touched the bed, and reporting the last pre-bypass reading would present a
 * stale figure as a current one.
 */
export function flowNow(
    samples: BrewSample[], stages: number
): FlowPoint | null {
    const last = samples[samples.length - 1];
    if (last === undefined) return null;
    return flowAt(samples, stages, last.at);
}

/**
 * Both channels across the whole stream, for the chart.
 *
 * One point per brew sample, each fitted over the window ending there. Points
 * the window cannot answer are omitted rather than zeroed, which is what puts
 * a gap in the cup channel across the bypass instead of an invented reading.
 */
export function flowSeries(samples: BrewSample[], stages: number): FlowPoint[] {
    const out: FlowPoint[] = [];
    for (const sample of brewOnly(samples, stages)) {
        const point = flowAt(samples, stages, sample.at);
        if (point !== null) out.push(point);
    }
    return out;
}

/**
 * The last `seconds` of cup rate, resampled to a fixed number of buckets.
 *
 * Fixed rather than one point per sample, because the sparkline is a few dozen
 * points wide and the stream is thousands: a path with more vertices than
 * pixels costs work on every frame of a live brew and draws the same picture.
 * Empty when there is no rate to draw, which is what the row is hidden on.
 */
export function flowTail(
    samples: BrewSample[], stages: number, seconds: number, buckets: number
): number[] {
    const series = flowSeries(samples, stages);
    const last = series[series.length - 1];
    if (last === undefined || buckets < 1) return [];

    const from = last.at - seconds * 1000;
    const recent = series.filter((point) => point.at >= from);
    if (recent.length === 0) return [];

    const span = Math.max(1, last.at - from);
    const sums = new Array<number>(buckets).fill(0);
    const counts = new Array<number>(buckets).fill(0);
    for (const point of recent) {
        const slot = Math.min(
            buckets - 1,
            Math.floor(((point.at - from) / span) * buckets)
        );
        sums[slot] += point.cup;
        counts[slot] += 1;
    }

    // An empty bucket is a gap in the readings, not a rate of nothing. It
    // borrows from its left neighbour so the line stays continuous.
    const out: number[] = [];
    let carried = recent[0].cup;
    for (let i = 0; i < buckets; i++) {
        if (counts[i] > 0) carried = sums[i] / counts[i];
        out.push(carried);
    }
    return out;
}

/** The largest rate in either channel. 0 on an empty series. */
export function maxRateOf(series: FlowPoint[]): number {
    let max = 0;
    for (const point of series) {
        max = Math.max(max, point.cup, point.water);
    }
    return max;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest library/brew/__tests__/flowRate.test.ts`
Expected: PASS, all suites green.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors. Lint reports pre-existing warnings only.

- [ ] **Step 6: Commit**

```bash
git add library/brew/flowRate.ts library/brew/__tests__/flowRate.test.ts
git commit -m "Fit a flow rate the scale's noise cannot shout over"
```

---

### Task 2: The number that survives the sweep

The chart needs the stream and the stream expires under a retention the user
chose. So the record keeps one raw observation, and the average rate is derived
from it.

**Files:**
- Modify: `library/brew/BrewRecord.ts` (the `BrewRecord` type, beside `drawdownAt`)
- Modify: `library/brew/flowRate.ts`
- Test: `library/brew/__tests__/flowRate.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `library/brew/__tests__/flowRate.test.ts`. Add
`cupAtDrawdownFrom, drawdownRate` to the existing import from
`@/library/brew/flowRate`, and add `import type {BrewRecord} from
"@/library/brew/BrewRecord";` beside the existing `BrewSample` import.

```ts
/** A finished record with only the fields the rate arithmetic reads. */
function record(over: Partial<BrewRecord> = {}): BrewRecord {
    return {
        id: "b1",
        recipeUuid: "r1",
        recipeName: "Test",
        accent: "#FF007F",
        startedAt: 1_000_000,
        pouringAt: 1_000_000,
        drawdownAt: 100_000,
        endedAt: 1_140_000,
        outcome: "done",
        failure: null,
        pours: 2,
        waterTotal: 240,
        cupTotal: 200,
        heldSeconds: 0,
        cupAtDrawdown: 120,
        ...over
    };
}

describe("cupAtDrawdownFrom", () => {
    it("reads the cup at the boundary, not at the end", () => {
        const samples = ramp(20, 2);
        expect(cupAtDrawdownFrom(samples, 1, 10_000)).toBeCloseTo(20, 6);
    });

    it("is null when nobody can say what the boundary cup reading was", () => {
        expect(cupAtDrawdownFrom(ramp(20, 2), 1, 0)).toBeNull();
        expect(cupAtDrawdownFrom([], 1, 10_000)).toBeNull();
    });
});

describe("drawdownRate", () => {
    it("averages the cup over the drawdown", () => {
        // 200 in the cup at the end, 120 at the boundary, 40 seconds between.
        expect(drawdownRate(record())).toBeCloseTo(2, 6);
    });

    it("takes the bypass out of the total first", () => {
        // The same brew with 40 ml of bypass on the same scale.
        const withBypass = record({
            cupTotal: 240,
            bypass: {volume: 40, temperature: 90, delivered: 40, startedAt: 110_000}
        });
        expect(drawdownRate(withBypass)).toBeCloseTo(2, 6);
    });

    it("is null, never 0, whenever a term is missing", () => {
        expect(drawdownRate(record({cupAtDrawdown: undefined}))).toBeNull();
        expect(drawdownRate(record({drawdownAt: 0}))).toBeNull();
        expect(drawdownRate(record({cupAtDrawdown: 0}))).toBeNull();
        // A cup that did not rise across the drawdown is not a rate of nothing.
        expect(drawdownRate(record({cupAtDrawdown: 200}))).toBeNull();
        // And neither is a boundary at the very last millisecond.
        expect(drawdownRate(record({drawdownAt: 140_000}))).toBeNull();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest library/brew/__tests__/flowRate.test.ts -t drawdownRate`
Expected: FAIL, `drawdownRate is not a function`.

- [ ] **Step 3: Add the field**

In `library/brew/BrewRecord.ts`, inside the `BrewRecord` type, immediately
after the `drawdownAt` field and its comment, add:

```ts
    /**
     * Grams in the cup when the drawdown began, on the same clock as
     * `drawdownAt`. Absent on every row written before it existed, and on any
     * brew that never drew down.
     *
     * A raw observation and deliberately not a computed statistic. A stored
     * `peakCupRate` was rejected for exactly this: a peak is only defined
     * relative to a smoothing window, so the window would be frozen into the
     * data and the day `FLOW_WINDOW_MS` is retuned every old row would
     * silently stop being comparable with every new one. `stalls` are stored
     * for the opposite reason, and the distinction is worth keeping straight:
     * a stall is an observation whose definition the record is deliberately
     * pinning, because that definition is a judgement about hardware. A rate
     * is arithmetic.
     */
    cupAtDrawdown?: number;
```

- [ ] **Step 4: Add the two functions**

Append to `library/brew/flowRate.ts`. Add
`import {drawdownSeconds, type BrewRecord, type BrewSample} from "./BrewRecord";`
in place of the existing type-only import.

```ts
/**
 * The cup reading at the drawdown boundary, for the recorder to store.
 *
 * The last brew reading at or before the boundary. Brew readings only: this
 * stops a bypass-labelled reading from being chosen as the boundary. Because
 * `BrewSample.cup` is a running total, it cannot unwind bypass grams already
 * folded into a later brew-labelled reading. If a firmware ever fires bypass
 * before drawdown, `drawdownRate` will also subtract the bypass from the final
 * cup total and understate the rate; no observed firmware does that.
 *
 * Null when the brew never drew down or no brew-lane reading exists at the
 * boundary. Zero would be an invented cup reading.
 */
export function cupAtDrawdownFrom(
    samples: BrewSample[], stages: number, drawdownAt: number
): number | null {
    if (drawdownAt <= 0) return null;
    let cup: number | null = null;
    for (const sample of samples) {
        if (sample.at > drawdownAt) break;
        if (sample.pour >= 1 && sample.pour <= stages) cup = sample.cup;
    }
    return cup;
}

/**
 * How fast the bed drew down, averaged over the drawdown, in g/s.
 *
 * Null whenever any term is missing, and never 0. Null means nobody can say.
 * A bed that drew down nothing, a cup reading that fell, and arithmetic that
 * went negative are all refused rather than distinguished, which is the same
 * rule `drawdownSeconds` follows: a drawdown rate of nothing is a claim this
 * app is not in a position to make.
 *
 * `cupTotal` is a raw scale reading, so the bypass comes out of it first --
 * the idiom `app/brew.tsx` already uses when it names the brew water.
 *
 * Distinct from the live figure, and the two must not be conflated: this is an
 * average across a finished drawdown, and `flowNow` is an instant.
 */
export function drawdownRate(record: BrewRecord): number | null {
    const opened = record.cupAtDrawdown;
    if (opened === undefined || opened <= 0) return null;
    const seconds = drawdownSeconds(record);
    if (seconds === null || seconds <= 0) return null;
    const delivered = record.cupTotal - (record.bypass?.delivered ?? 0) - opened;
    const rate = delivered / seconds;
    return Number.isFinite(rate) && rate > 0 ? rate : null;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest library/brew/__tests__/flowRate.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add library/brew/flowRate.ts library/brew/BrewRecord.ts \
        library/brew/__tests__/flowRate.test.ts
git commit -m "Keep one raw reading so the rate outlives its trace"
```

---

### Task 3: The recorder writes it

**Files:**
- Modify: `library/brew/BrewRecorder.ts:410-423` (the `drawdownAt` assignment in the record literal)
- Test: `library/brew/__tests__/BrewRecorder.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `library/brew/__tests__/BrewRecorder.test.ts`, inside the existing
top-level `describe`. Follow the file's existing helpers for driving a recorder
through a brew; read the test that begins *"records the drawdown from the cup
channel when the water stream has stopped"* (around line 162) and build these
two on the same scaffolding.

```ts
    it("takes the cup reading at the same boundary the drawdown is measured from", () => {
        const {record, samples} = runBrewToCompletion();
        expect(record.drawdownAt).toBeGreaterThan(0);
        const atBoundary = samples
            .filter((s) => s.pour >= 1 && s.at <= record.drawdownAt)
            .pop();
        expect(record.cupAtDrawdown).toBeCloseTo(atBoundary!.cup, 6);
    });

    it("writes no cup reading for a brew that never drew down", () => {
        const {record} = runCancelledBrew();
        expect(record.drawdownAt).toBe(0);
        expect(record).not.toHaveProperty("cupAtDrawdown");
    });
```

`runBrewToCompletion` and `runCancelledBrew` stand for whatever the file
already uses to drive a finished and a cancelled brew; reuse those helpers
rather than adding new ones, and have them return both the record and the
samples that were fed in.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest library/brew/__tests__/BrewRecorder.test.ts -t "boundary"`
Expected: FAIL, `received undefined`.

- [ ] **Step 3: Write it**

In `library/brew/BrewRecorder.ts`, add the import:

```ts
import {cupAtDrawdownFrom} from "./flowRate";
```

Then in the record literal, the `drawdownAt` line currently reads:

```ts
            drawdownAt: outcome === "cancelled" || outcome === "lostContact"
                        || outcome === "failed"
                ? 0
                : drawdownFrom(this.collected, stages),
```

Replace it with a named constant computed just above the literal, so the
boundary is derived once and both fields read the same number. Immediately
before `const record: BrewRecord = {`, insert:

```ts
        // One boundary, read once. The drawdown clock and the cup reading the
        // drawdown rate is measured from must be the same instant, and the
        // cheapest way to guarantee that is not to derive it twice.
        const drawdownAt = outcome === "cancelled" || outcome === "lostContact"
                           || outcome === "failed"
            ? 0
            : drawdownFrom(this.collected, stages);
        const cupAtDrawdown = cupAtDrawdownFrom(this.collected, stages, drawdownAt);
```

and change the field to `drawdownAt,`. Then, beside the other conditional
spreads and next to `...(bypass === undefined ? {} : {bypass}),`, add:

```ts
            // Spread rather than assigned, so a brew that never drew down
            // leaves the key off the row entirely and reads back exactly like
            // a record written before this field existed.
            ...(cupAtDrawdown === null
                ? {}
                : {cupAtDrawdown}),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest library/brew/__tests__/BrewRecorder.test.ts`
Expected: PASS, including every pre-existing test in the file.

- [ ] **Step 5: Commit**

```bash
git add library/brew/BrewRecorder.ts library/brew/__tests__/BrewRecorder.test.ts
git commit -m "Record the cup at the drawdown boundary"
```

---

### Task 4: Persistence

**Files:**
- Modify: `library/BrewDatabase.ts` (schema ~159-200, migrations ~352-370, `writeBrewRow` ~452, `hydrate` ~1082)
- Test: `library/__tests__/BrewDatabase.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `library/__tests__/BrewDatabase.test.ts`, following the file's
existing pattern for opening a database and saving a record.

```ts
    it("round trips the cup reading at the drawdown boundary", () => {
        const db = openTestBrewDatabase();
        db.save(brewRecord({drawdownAt: 90_000, cupAtDrawdown: 118.5}), []);
        const [back] = db.recent(1);
        expect(back.cupAtDrawdown).toBeCloseTo(118.5, 6);
    });

    it("leaves the key off a record that never had one", () => {
        const db = openTestBrewDatabase();
        db.save(brewRecord({drawdownAt: 0}), []);
        const [back] = db.recent(1);
        expect(back).not.toHaveProperty("cupAtDrawdown");
    });

    it("reads a row written before the column existed", () => {
        // The migration's default is 0, which hydrate reads as "not set".
        const db = openTestBrewDatabase();
        db.save(brewRecord({drawdownAt: 90_000, cupAtDrawdown: 0}), []);
        const [back] = db.recent(1);
        expect(back).not.toHaveProperty("cupAtDrawdown");
    });
```

Use `test-utils/sqlite.ts`'s `createTestDatabase` (real `node:sqlite`) as the
rest of this file does; a hand-rolled `jest.mock("expo-sqlite")` pattern-matches
query strings and cannot fail on wrong SQL, which is the whole point of these
three tests.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest library/__tests__/BrewDatabase.test.ts -t "drawdown boundary"`
Expected: FAIL, `received undefined`.

- [ ] **Step 3: Add the column to the schema**

In the `CREATE TABLE IF NOT EXISTS brews` statement, after the `drawdownAt`
column, add:

```sql
        cupAtDrawdown REAL NOT NULL DEFAULT 0,
```

`REAL`, because grams are not whole. `NOT NULL DEFAULT 0` because every
existing row must get a value and 0 is the sentinel `hydrate` already reads as
"was not set", the same convention `drawdownAt` uses.

- [ ] **Step 4: Add the migration**

Beside the other `ALTER TABLE brews` migrations, add:

```ts
        try {
            db.execSync(
                "ALTER TABLE brews ADD COLUMN cupAtDrawdown REAL NOT NULL DEFAULT 0;"
            );
        } catch {
            /* Already there. */
        }
```

- [ ] **Step 5: Write it in `writeBrewRow`**

Add `cupAtDrawdown` to the column list and `$cupAtDrawdown` to the values, and
to the bound parameters:

```ts
            $cupAtDrawdown: record.cupAtDrawdown ?? 0,
```

`writeBrewRow` is the **one shared statement** for a live brew and for a
restore. Do not add a second path: naming a shorter column list on the restore
side is a bug this file has already had once.

- [ ] **Step 6: Read it in `hydrate`**

Beside the other optional spreads:

```ts
        ...(row.cupAtDrawdown > 0 ? {cupAtDrawdown: row.cupAtDrawdown} : {}),
```

and add `cupAtDrawdown: number` to the row type `hydrate` takes.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx jest library/__tests__/BrewDatabase.test.ts`
Expected: PASS, whole file.

- [ ] **Step 8: Commit**

```bash
git add library/BrewDatabase.ts library/__tests__/BrewDatabase.test.ts
git commit -m "Store the drawdown cup reading beside its boundary"
```

---

### Task 5: Backup

**Files:**
- Modify: `library/backup.ts` (`OPTIONAL_BREW_FIELDS` ~584, `reviveBrew` ~690)
- Test: `library/__tests__/backup.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `library/__tests__/backup.test.ts`, in the brews section.

```ts
    it("carries the drawdown cup reading through a round trip", () => {
        const record = brewRecord({drawdownAt: 90_000, cupAtDrawdown: 118.5});
        const parsed = parseBackup(JSON.stringify(buildBackup({
            ...emptyBackupInput(),
            brews: [record]
        })));
        expect(parsed.brews?.[0].cupAtDrawdown).toBeCloseTo(118.5, 6);
    });

    it("refuses a backup whose drawdown cup reading is not a number", () => {
        const backup = buildBackup({
            ...emptyBackupInput(),
            brews: [brewRecord({drawdownAt: 90_000, cupAtDrawdown: 118.5})]
        }) as Record<string, unknown>;
        (backup.brews as Record<string, unknown>[])[0].cupAtDrawdown = "fast";
        expect(() => parseBackup(JSON.stringify(backup))).toThrow();
    });

    it("accepts a backup written before the field existed", () => {
        const backup = buildBackup({
            ...emptyBackupInput(),
            brews: [brewRecord({drawdownAt: 90_000})]
        }) as Record<string, unknown>;
        const parsed = parseBackup(JSON.stringify(backup));
        expect(parsed.brews?.[0]).not.toHaveProperty("cupAtDrawdown");
    });
```

Use the file's own helpers for `emptyBackupInput` and `brewRecord` if they are
named differently; match what is already there.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest library/__tests__/backup.test.ts -t "drawdown cup reading"`
Expected: FAIL. The round trip fails on a dropped field and the refusal test
fails because a string passes.

- [ ] **Step 3: Validate it**

In `OPTIONAL_BREW_FIELDS`, add:

```ts
    cupAtDrawdown: isNumber,
```

- [ ] **Step 4: Rebuild it**

In `reviveBrew`'s field-by-field rebuild, beside the other optional numbers,
add the same conditional-spread form the neighbours use, for example:

```ts
        ...(typeof raw.cupAtDrawdown === "number"
            ? {cupAtDrawdown: raw.cupAtDrawdown}
            : {}),
```

A field validated but missing from the rebuild is silently dropped, which is
the specific failure this file's comments warn about. `BACKUP_VERSION` does not
move: an older file simply has no key here, which the third test pins.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest library/__tests__/backup.test.ts`
Expected: PASS, whole file.

- [ ] **Step 6: Commit**

```bash
git add library/backup.ts library/__tests__/backup.test.ts
git commit -m "Carry the drawdown cup reading through backup"
```

---

### Task 6: The sparkline

A 30 second, 24 bucket cup-rate trace. Dumb: it takes numbers and draws them.

**Files:**
- Create: `components/FlowSparkline.tsx`
- Test: `components/__tests__/FlowSparkline.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `components/__tests__/FlowSparkline.test.tsx`:

```tsx
import {screen} from "@testing-library/react-native";
import FlowSparkline from "@/components/FlowSparkline";
import {renderWithProviders} from "@/test-utils/render";
import {PALETTE} from "@/constants/colors";

describe("FlowSparkline", () => {
    it("draws a path once there are two points", async () => {
        await renderWithProviders(
            <FlowSparkline values={[1, 2, 1.5, 2.5]} accent={PALETTE.brand} />
        );
        expect(screen.getByTestId("flow-sparkline-path")).toBeTruthy();
    });

    it("draws nothing at all below two points", async () => {
        await renderWithProviders(
            <FlowSparkline values={[2]} accent={PALETTE.brand} />
        );
        expect(screen.queryByTestId("flow-sparkline-path")).toBeNull();
    });

    it("draws nothing when there is no series", async () => {
        await renderWithProviders(
            <FlowSparkline values={[]} accent={PALETTE.brand} />
        );
        expect(screen.queryByTestId("flow-sparkline-path")).toBeNull();
    });
});
```

`renderWithProviders` is async in RNTL v14; without the `await`, `screen` stays
empty and the test passes for the wrong reason.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest components/__tests__/FlowSparkline.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Write it**

Create `components/FlowSparkline.tsx`:

```tsx
import {View} from "react-native";
import Svg, {Path} from "react-native-svg";
import {channelStyle} from "@/library/brew/traceStyle";

/**
 * A half minute of cup rate, drawn the width of a figure row.
 *
 * The shape is the reading, not the number beside it. A rate is a derivative
 * and a single derived number on a live screen cannot tell you whether it is
 * falling, which is the only question a drawdown ever raises. Thirty seconds
 * because that is about how long a drawdown runs.
 *
 * Deliberately scaled to its own maximum rather than to a fixed axis: the
 * question is the shape of the change, and a fixed axis would flatten a
 * respectable 2 g/s into the floor of a chart built to hold 8.
 */
const WIDTH = 96;
const HEIGHT = 20;

export default function FlowSparkline({
    values, accent
}: {values: number[]; accent: string}) {
    if (values.length < 2) return null;

    const max = Math.max(...values);
    const min = Math.min(...values);
    // A flat line sits in the middle rather than on the floor: pinned to the
    // bottom it would read as "nothing is flowing", which is the opposite of
    // what a steady rate means.
    const span = max - min;
    const y = (v: number) =>
        span === 0 ? HEIGHT / 2 : HEIGHT - ((v - min) / span) * HEIGHT;
    const x = (i: number) => (i / (values.length - 1)) * WIDTH;

    const d = values
        .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)} ${y(v).toFixed(2)}`)
        .join(" ");

    return (
        <View accessible={false} pointerEvents="none">
            <Svg width={WIDTH} height={HEIGHT}>
                <Path
                    testID="flow-sparkline-path"
                    d={d}
                    fill="none"
                    {...channelStyle("cup", {accent})}
                />
            </Svg>
        </View>
    );
}
```

Check `library/brew/traceStyle.ts` for `channelStyle`'s exact signature before
writing this and match it; the rule the file enforces is that the style object
is spread **last** onto the `Path`, with `fill="none"` at the use site. If the
cup channel's stroke width is too heavy at 20 px tall, override the width after
the spread rather than inventing a stroke here.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest components/__tests__/FlowSparkline.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/FlowSparkline.tsx components/__tests__/FlowSparkline.test.tsx
git commit -m "Draw the last half minute of cup rate"
```

---

### Task 7: The FLOW row and the drawdown rate

`BrewFigures` today draws three columns (WATER, CUP, TIME) and up to three
extra rows (bypass, drawdown, dial). The rate does **not** become a fourth
column: the file's own doc comments say the three columns are the brew's
three totals, and a rate is not a total. It becomes a row, like the drawdown
it belongs beside.

**Files:**
- Modify: `components/BrewFigures.tsx`
- Test: `components/__tests__/BrewFigures.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `components/__tests__/BrewFigures.test.tsx`:

```tsx
    it("shows the live rate with its sparkline", async () => {
        await renderWithProviders(
            <BrewFigures
                water={120} cup={90} seconds={60} accent={PALETTE.brand}
                flow={2.4} flowTail={[1, 2, 2.4, 2.2]}
            />
        );
        expect(screen.getByTestId("figures-flow")).toBeTruthy();
        expect(screen.getByText(/2\.4/)).toBeTruthy();
        expect(screen.getByTestId("flow-sparkline-path")).toBeTruthy();
    });

    it("draws no flow row at all when there is no rate to report", async () => {
        await renderWithProviders(
            <BrewFigures
                water={0} cup={0} seconds={0} accent={PALETTE.brand}
            />
        );
        expect(screen.queryByTestId("figures-flow")).toBeNull();
    });

    it("draws the row without a sparkline when the tail is too short", async () => {
        await renderWithProviders(
            <BrewFigures
                water={120} cup={90} seconds={60} accent={PALETTE.brand}
                flow={2.4} flowTail={[]}
            />
        );
        expect(screen.getByTestId("figures-flow")).toBeTruthy();
        expect(screen.queryByTestId("flow-sparkline-path")).toBeNull();
    });

    it("puts the average rate on the drawdown line", async () => {
        await renderWithProviders(
            <BrewFigures
                water={240} cup={200} seconds={140} accent={PALETTE.brand}
                drawdown={40} drawdownRate={2}
            />
        );
        const line = screen.getByTestId("figures-drawdown");
        expect(line).toHaveTextContent(/2\.0\s*g\/s/);
    });

    it("leaves the drawdown line as it was when there is no rate", async () => {
        await renderWithProviders(
            <BrewFigures
                water={240} cup={200} seconds={140} accent={PALETTE.brand}
                drawdown={40}
            />
        );
        const line = screen.getByTestId("figures-drawdown");
        expect(line).not.toHaveTextContent("g/s");
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest components/__tests__/BrewFigures.test.tsx -t flow`
Expected: FAIL, `figures-flow` not found.

- [ ] **Step 3: Write it**

In `components/BrewFigures.tsx`, add to the props:

```tsx
    /**
     * The instantaneous cup rate in g/s, or undefined when nobody can say.
     *
     * Undefined and not 0. The row is absent before a brew has poured and
     * while the bypass is the only thing on the scale, because a rate of 0
     * would be a claim that the bed has stopped, which is a different and much
     * more alarming statement than "not yet".
     */
    flow?: number;
    /** The last 30 seconds of it, for the sparkline. Empty draws no line. */
    flowTail?: number[];
    /**
     * The instantaneous pour rate in ml/s, the second figure on the same row.
     * Same absence rule as `flow`, and it rides along rather than leading:
     * the cup rate is the subject (spec §2), the pour rate is what the machine
     * is doing about it. Smaller and dimmer than the cup figure, so a glance
     * lands on the cup rate first.
     */
    pourRate?: number;
    /**
     * Reserve the row's height even when there is nothing to draw.
     *
     * Live only. A fit needs a full second of spanned duration, so the row
     * genuinely arrives and leaves mid-brew, and a screen that reflows under a
     * watching user is worse than a held gap. A finished record and the shared
     * image cannot gain a rate later, so reserving there is dead space in a
     * still picture. Default false.
     */
    reserveFlow?: boolean;
    /**
     * The average rate across the drawdown, in g/s. Sits on the drawdown line
     * as a second term rather than on its own row: it is a property of the
     * drawdown, and a reader who does not care about rates should be able to
     * skip one line instead of two.
     */
    drawdownRate?: number;
```

Render the row above the drawdown row, in the same `YStack` the other extra
rows live in, following their exact layout (label, value, unit):

```tsx
            {flow === undefined ? null : (
                <XStack testID="figures-flow" ai="center" jc="space-between" gap="$2">
                    <SizableText size="$1" color={PALETTE.muted}>FLOW</SizableText>
                    <XStack ai="center" gap="$3">
                        {flowTail === undefined || flowTail.length < 2 ? null : (
                            <FlowSparkline values={flowTail} accent={accent} />
                        )}
                        <SizableText size="$2" color={PALETTE.text}>
                            {flow.toFixed(1)} g/s
                        </SizableText>
                        {pourRate === undefined ? null : (
                            <SizableText size="$1" color={PALETTE.muted}>
                                POUR {pourRate.toFixed(1)}
                            </SizableText>
                        )}
                    </XStack>
                </XStack>
            )}
```

Match the surrounding rows' actual tokens and colours rather than copying the
above literally; the point is the structure and the two absence rules.

On the drawdown row, append the second term inside the existing value text:

```tsx
                        {drawdownRate === undefined
                            ? ""
                            : ` · ${drawdownRate.toFixed(1)} g/s`}
```

The separator is the middle dot this app already uses to join glanceable parts
(`BeanProfileRow`, `BrewMiniBar`), not a comma and never a dash.

No em dashes, and no dashes as separators, in any of this copy.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest components/__tests__/BrewFigures.test.tsx`
Expected: PASS, whole file, including every pre-existing test.

- [ ] **Step 5: Commit**

```bash
git add components/BrewFigures.tsx components/__tests__/BrewFigures.test.tsx
git commit -m "Give the figures a flow row and the drawdown a rate"
```

---

### Task 8: The live screen

Two things at once, because they share the same derived locals: the FLOW row,
and the live drawdown clock the spec's §5.1 added.

**Files:**
- Modify: `app/brew.tsx` (derivations near lines 114-160, `BrewFigures` at 377-383)
- Test: `app/__tests__/brew.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `app/__tests__/brew.test.tsx`, using the file's existing machinery
for driving a fake machine through a brew.

```tsx
    it("shows the flow row once the bed is giving something up", async () => {
        const machine = await startBrewInTest();
        await pourInto(machine, {seconds: 6, cupRate: 2});
        expect(await screen.findByTestId("figures-flow")).toBeTruthy();
    });

    it("hides the flow row while the bypass is the only thing on the scale", async () => {
        const machine = await startBrewInTest();
        await pourInto(machine, {seconds: 6, cupRate: 2});
        await runBypass(machine, {seconds: 4, rate: 15});
        expect(screen.queryByTestId("figures-flow")).toBeNull();
    });

    it("runs a drawdown clock on the last stage and converges on the record's", async () => {
        const machine = await startBrewInTest();
        await pourAllStages(machine);
        await drawDownFor(machine, 12);
        const live = screen.getByTestId("figures-drawdown");
        expect(live).toHaveTextContent(/12/);

        const record = await finishBrewInTest(machine);
        expect(drawdownSeconds(record)).toBeCloseTo(12, 0);
    });

    it("shows no drawdown clock during a planned pause between stages", async () => {
        const machine = await startBrewInTest();
        await pourInto(machine, {seconds: 6, cupRate: 2});   // stage 1 of 2
        await pauseFor(machine, 10);
        expect(screen.queryByTestId("figures-drawdown")).toBeNull();
    });

    it("does not show drawdown while the final pour is still rising", async () => {
        const machine = await startBrewInTest();
        await pourInto(machine, {seconds: 6, cupRate: 2, waterRate: 10});
        expect(screen.queryByTestId("figures-drawdown")).toBeNull();
    });

    it("does not reset the live drawdown on a noisy plateau", async () => {
        const machine = await startBrewInTest();
        await pourAllStages(machine);
        await drawDownFor(machine, 12, {waterWobbleMl: 0.4});
        expect(screen.getByTestId("figures-drawdown")).toHaveTextContent(/12/);
    });
```

Adapt the helper names to whatever the file already has. The assertions are
the contract: present when pouring, absent under bypass, a clock that
converges on the stored figure, silence during a planned pause, no 0:00 line
during the final pour, and no reset on sub-noise plateau wobble.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest app/__tests__/brew.test.tsx -t flow`
Expected: FAIL.

- [ ] **Step 3: Derive the two values**

In `app/brew.tsx`, near the existing derivations (`samples`, `elapsed`,
`activeIndex`, `stageWater`, `stalls`, `accent`, `running`, `brewWater`,
`resting`, `bypass`, `last`), add:

```tsx
    // The instantaneous cup rate. Null throughout the stretches where nobody
    // can say: before the first pour, and while the window holds nothing but
    // bypass water, which flowRate answers for us rather than being re-derived
    // from bypass.startedAt here.
    const stages = recipe.pours.length;
    const flow = flowNow(samples, stages);
    const flowTailValues = flow === null
        ? []
        : flowTail(samples, stages, FLOW_TAIL_SECONDS, FLOW_TAIL_BUCKETS);

    const finalStageTargetMl = Math.max(recipe.pours[stages - 1]?.volume ?? 0, 0);
    const liveDrawdownFigure = liveDrawdown({
        samples,
        stages,
        elapsedSeconds: elapsed,
        phaseName: phase.name,
        running,
        finalStageTargetMl,
    });
```

Amendment, 2026-09-30: do not gate this on `activeIndex`. `activeIndex` is
`null` during bypass, and the verified frame log puts bypass inside the
drawdown. The live helper now takes an options object, as shown above.

The gate combines water and phase evidence. When the final stage has delivered
its planned volume, the clock opens immediately, including while
`phase.name === "pouring"`, because the machine emits no event when the water
actually stops. "Delivered" uses `stalls.ts`'s exported `TARGET_TOLERANCE_ML`,
the same predicate `stalledNow` uses, so a stage landing a millilitre under
plan counts as having met it and the two live indicators cannot contradict
each other. `bypass` and `settling` are a backstop for a final stage that
stopped short of plan. That backstop waits for `DRAWDOWN_OPEN_MARGIN_MS`, now
2100 ms, which is `MIN_STALL_SECONDS` plus one nominal scale frame. That
margin is deliberately not used to open during `pouring`: `MIN_STALL_SECONDS`
is the minimum duration for a real stall to count, not a maximum duration a
stall can last, so a below-target quiet channel during `pouring` is still a
possible in-pour stall.

Planned pauses before the final stage never produce a boundary, and plateau
wobble cannot retake it because the retake threshold is measured from the
highest final-stage water level actually seen rather than the ratcheted
boundary level. The phase table in `liveDrawdown.ts` is exhaustive over
`BrewPhase["name"]`; adding a phase now fails typecheck until it is classified.

Add the imports:

```tsx
import {flowNow, flowTail} from "@/library/brew/flowRate";
import {liveDrawdown} from "@/library/brew/liveDrawdown";
```

and, beside the file's other layout constants:

```tsx
/** Half a minute of rate in two dozen buckets. See FlowSparkline. */
const FLOW_TAIL_SECONDS = 30;
const FLOW_TAIL_BUCKETS = 24;
```

- [ ] **Step 4: Pass them**

At the `BrewFigures` call site, add:

```tsx
                    reserveFlow
                    {...(flow === null
                        ? {}
                        : {flow: flow.cup, pourRate: flow.water, flowTail: flowTailValues})}
                    reserveDrawdown={liveDrawdownFigure.reserveDrawdown}
                    {...(liveDrawdownFigure.drawdown === null
                        ? {}
                        : {drawdown: liveDrawdownFigure.drawdown})}
```

Keep the existing props as they are. Spread rather than passing `undefined`
so the absence is expressed once, at the point the decision was made.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest app/__tests__/brew.test.tsx`
Expected: PASS, whole file.

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors. Do not add `useMemo` around the derivations; the React
Compiler is on and will handle them.

- [ ] **Step 7: Commit**

```bash
git add app/brew.tsx app/__tests__/brew.test.tsx
git commit -m "Report the rate and the drawdown while they are happening"
```

---

### Task 9: The rate chart

A second chart under the volume trace on the record. Same grammar as
`BrewTrace`: an `Svg` over a `Box`, paths built by `toPath`, strokes from
`traceStyle`. Read `components/BrewTrace.tsx` and `library/brew/brewShape.ts`
in full before writing this and follow them.

**Review amendment, 2026-09-30:** `BrewRateChart` takes `maxT` as a required
prop. Callers must pass the same time extent `BrewTrace` uses, computed by
`traceTimeExtent(plannedSeconds, samples, bypass)`: the maximum of planned
time, last raw sample time, and bypass extent. The component must not silently
fall back to the last rate point, because that puts the same second at a
different x whenever the plan, run, or bypass extends further than the fitted
rate series.

The rate chart's x axis spans the full `width`, with no horizontal inset. It
may inset vertically by half the widest rate stroke and may allow visible
overflow, but it must not move x coordinates inward unless `BrewTrace` does the
same. Horizontal alignment is more important than hiding a stroke cap.

Path continuity is based on sample adjacency, not on `FLOW_MIN_WINDOW_MS`.
`flowSeries` emits at the sample cadence when it can fit a window and emits
nothing when it cannot; consecutive array entries are therefore connected only
when their timestamps are adjacent at the recorder's real cadence. The measured
cadence is about 10 Hz, with 100 ms frames in the live-stream fixtures, so the
implemented allowance is 150 ms: jitter stays connected, one omitted ordinary
frame at 200 ms splits the path.

The 4 g/s y-axis floor remains unlabelled. It is only a guard against stretching
quiet brews into a mountain range, while the visible readouts carry the actual
numbers. A label would make that protective floor look like a calibrated target
or threshold.

**Files:**
- Create: `components/BrewRateChart.tsx`
- Test: `components/__tests__/BrewRateChart.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `components/__tests__/BrewRateChart.test.tsx`:

```tsx
import {screen} from "@testing-library/react-native";
import BrewRateChart from "@/components/BrewRateChart";
import {renderWithProviders} from "@/test-utils/render";
import {PALETTE} from "@/constants/colors";
import type {FlowPoint} from "@/library/brew/flowRate";

const series: FlowPoint[] = Array.from({length: 40}, (_, i) => ({
    at: i * 500,
    cup: 1 + (i % 5) * 0.2,
    water: 3
}));

describe("BrewRateChart", () => {
    it("draws both channels", async () => {
        await renderWithProviders(
            <BrewRateChart series={series} accent={PALETTE.brand} />
        );
        expect(screen.getByTestId("rate-chart-cup")).toBeTruthy();
        expect(screen.getByTestId("rate-chart-water")).toBeTruthy();
    });

    it("draws nothing at all when the stream did not survive", async () => {
        await renderWithProviders(
            <BrewRateChart series={[]} accent={PALETTE.brand} />
        );
        expect(screen.queryByTestId("rate-chart")).toBeNull();
    });

    it("honours a negotiated maximum so two charts can be compared", async () => {
        await renderWithProviders(
            <BrewRateChart series={series} accent={PALETTE.brand} maxRate={12} />
        );
        // The cup channel peaks at 1.8 of a 12 g/s axis, so every point of it
        // sits in the bottom fifth of the box.
        const d = screen.getByTestId("rate-chart-cup").props.d as string;
        const ys = [...d.matchAll(/[ML]\s*[\d.]+\s+([\d.]+)/g)]
            .map((m) => Number(m[1]));
        expect(Math.min(...ys)).toBeGreaterThan(RATE_HEIGHT * 0.8);
    });
});
```

Import `RATE_HEIGHT` from the component; export it for exactly this reason.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest components/__tests__/BrewRateChart.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Write it**

Create `components/BrewRateChart.tsx`:

```tsx
import {View} from "react-native";
import Svg, {Path} from "react-native-svg";
import {toPath, type Box, type Point} from "@/library/brew/brewShape";
import {channelStyle} from "@/library/brew/traceStyle";
import {maxRateOf, type FlowPoint} from "@/library/brew/flowRate";

/**
 * Both channels' rate against real seconds, drawn under the volume trace.
 *
 * Its own chart and not a third line on the trace. The trace's axis is
 * millilitres and this one's is millilitres a second: sharing an axis would
 * mean one of the two was drawn against a scale that means nothing for it, and
 * a second axis on one chart is worse than a second chart.
 *
 * Shorter than the trace on purpose. This is a companion to the trace, read
 * second, and the same height would make the page ask which of the two is the
 * brew.
 */
export const RATE_HEIGHT = 84;

/** Never scale a nearly flat brew up into a mountain range. */
const MIN_AXIS = 4;

export default function BrewRateChart({
    series, accent, width, maxRate
}: {
    series: FlowPoint[];
    accent: string;
    width?: number;
    maxRate?: number;
}) {
    // Absent, not empty. A record whose samples the retention sweep took has
    // no rate to draw, and an empty chart frame would read as a brew where
    // nothing flowed.
    if (series.length < 2) return null;

    const maxT = series[series.length - 1].at / 1000;
    const maxV = Math.max(MIN_AXIS, maxRate ?? maxRateOf(series));
    const box: Box = {width: width ?? 0, height: RATE_HEIGHT, maxT, maxV};

    const points = (of: "cup" | "water"): Point[] =>
        series.map((p) => ({t: p.at / 1000, v: p[of]}));

    return (
        <View testID="rate-chart" accessible={false} pointerEvents="none">
            <Svg width={box.width} height={RATE_HEIGHT}>
                <Path
                    testID="rate-chart-water"
                    d={toPath(points("water"), box)}
                    fill="none"
                    {...channelStyle("water", {accent})}
                />
                <Path
                    testID="rate-chart-cup"
                    d={toPath(points("cup"), box)}
                    fill="none"
                    {...channelStyle("cup", {accent})}
                />
            </Svg>
        </View>
    );
}
```

`width` has no sensible default here; take the measured width from the parent
the way `BrewTrace` does and mirror whatever mechanism it uses (an
`onLayout` measure or a passed width), rather than inventing a second one.
`toPath` returns `""` below two points, which is why the guard above is a
length check and not a reliance on the path.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest components/__tests__/BrewRateChart.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/BrewRateChart.tsx components/__tests__/BrewRateChart.test.tsx
git commit -m "Chart the rate beside the volumes"
```

---

### Task 10: The record and the share

**Files:**
- Modify: `components/BrewSummary.tsx`
- Modify: `components/BrewStoryCard.tsx`
- Modify: `app/brewRecord.tsx` (~line 300, where `drawdown` is passed)
- Modify: `app/brew.tsx`
- Modify: `library/brew/storyCard.ts`
- Test: `app/__tests__/brewRecord.test.tsx`
- Test: `app/__tests__/brew.test.tsx`
- Test: `library/brew/__tests__/storyCard.test.ts`

Amendment, 2026-09-30: the finished brew modal is part of this task. It passes
`rateSeries`, `drawdown` and `drawdownRate` to `BrewSummary`, using the same
sample stream and stage count that the record later reads. The story card also
gets a real height budget from `storySummaryBudget`, a pure function of the
story frame, surrounding rows, stage count, bypass row, figure rows and bounded
Doto font scale, so the compact card summary uses the available height instead
of silently clipping under `overflow: hidden`. The budget is prescriptive:
story-only rows go first in the order tags, rating, coffee, then the rate chart
is dropped, then the trace shrinks to its story floor, and the stage ladder is
omitted only as the last compact-width fallback. The ladder floor comes from
`stageLadderRungMinHeight`, the same helper `BrewStageLadder` uses for its row
minimum, and includes text height, rung gap and the optional bypass closing row.
Name wrapping is not modelled because the summary name is a single-line
`MarqueeText`; tag wrapping is modelled by estimating the chips and counting
rows before the tag row is allowed.

- [ ] **Step 1: Write the failing tests**

Append to `app/__tests__/brewRecord.test.tsx`:

```tsx
    it("charts the rate and names it on the drawdown line", async () => {
        await renderRecordInTest(recordWithSamples());
        expect(await screen.findByTestId("rate-chart")).toBeTruthy();
        expect(screen.getByTestId("figures-drawdown")).toHaveTextContent("g/s");
    });

    it("still names the rate when the stream has been swept", async () => {
        // No samples, so no chart. cupAtDrawdown outlived them, so the average
        // rate is still there.
        await renderRecordInTest(recordWithoutSamples());
        expect(screen.queryByTestId("rate-chart")).toBeNull();
        expect(screen.getByTestId("figures-drawdown")).toHaveTextContent("g/s");
    });

    it("keeps the chart inside the shared capture", async () => {
        await renderRecordInTest(recordWithSamples());
        const capture = screen.getByTestId("brew-capture");
        expect(within(capture).getByTestId("rate-chart")).toBeTruthy();
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest app/__tests__/brewRecord.test.tsx -t rate`
Expected: FAIL.

- [ ] **Step 3: Render the chart inside the capture**

In `components/BrewSummary.tsx`, add props:

```tsx
    /** The rate series. Empty draws no chart, which a swept record wants. */
    rateSeries?: FlowPoint[];
```

and render it inside `styles.capture`, directly below `BrewTrace` and above
`BrewFigures`:

```tsx
                {rateSeries === undefined || rateSeries.length < 2 ? null : (
                    <BrewRateChart
                        series={rateSeries} accent={accent} width={traceWidth}
                    />
                )}
```

Inside the capture deliberately. The share has not shipped, so there is no
established look to uphold, and a shared brew that shows the volumes but not
the rate would be a worse picture than the one we are about to have.

Pass `drawdownRate` straight through to `BrewFigures`.

- [ ] **Step 4: Wire the record screen**

In `app/brewRecord.tsx`, beside the existing `drawdown: drawdownSeconds(record)`:

```tsx
                    ...(rate === null ? {} : {drawdownRate: rate}),
                    rateSeries: samples.length > 0
                        ? flowSeries(samples, record.pours)
                        : [],
```

with, above the render:

```tsx
    const rate = drawdownRate(record);
```

`samples` is whatever the screen already loads for the trace; reuse it and do
not load a second copy.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest app/__tests__/brewRecord.test.tsx components/__tests__/BrewSummary.test.tsx`
Expected: PASS, both files.

- [ ] **Step 6: Commit**

```bash
git add components/BrewSummary.tsx app/brewRecord.tsx app/__tests__/brewRecord.test.tsx
git commit -m "Put the rate on the record and in the share"
```

---

### Task 11: The history row

One figure, so a list can be scanned for the brew that ran fast.

**Files:**
- Modify: `components/BrewHistoryRow.tsx`
- Test: `components/__tests__/BrewHistoryRow.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
    it("names the drawdown rate", async () => {
        await renderWithProviders(
            <BrewHistoryRow record={brewRecord({
                drawdownAt: 100_000, endedAt: 1_140_000, startedAt: 1_000_000,
                cupTotal: 200, cupAtDrawdown: 120
            })} onPress={() => {}} />
        );
        expect(screen.getByText(/2\.0\s*g\/s/)).toBeTruthy();
    });

    it("says nothing where there is no rate", async () => {
        await renderWithProviders(
            <BrewHistoryRow record={brewRecord({drawdownAt: 0})} onPress={() => {}} />
        );
        expect(screen.queryByText(/g\/s/)).toBeNull();
    });

    it("puts the rate in the row's spoken label", async () => {
        await renderWithProviders(
            <BrewHistoryRow record={brewRecord({
                drawdownAt: 100_000, endedAt: 1_140_000, startedAt: 1_000_000,
                cupTotal: 200, cupAtDrawdown: 120
            })} onPress={() => {}} />
        );
        const row = screen.getByRole("button");
        expect(row.props.accessibilityLabel).toMatch(/2\.0 grams per second/);
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest components/__tests__/BrewHistoryRow.test.tsx -t rate`
Expected: FAIL.

- [ ] **Step 3: Write it**

Derive it once at the top of the component:

```tsx
    const rate = drawdownRate(record);
```

Add it to the figure line beside the existing figures, guarded on null, and
add a clause to the hand-built `label` array:

```tsx
    if (rate !== null) label.push(`${rate.toFixed(1)} grams per second`);
```

The label is built by hand because `Pressable` with an explicit label replaces
its whole subtree, so a figure added to the row and not to the array is a
figure a screen reader cannot reach. Spell the unit out in the label and
abbreviate it on screen.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest components/__tests__/BrewHistoryRow.test.tsx`
Expected: PASS, whole file.

- [ ] **Step 5: Commit**

```bash
git add components/BrewHistoryRow.tsx components/__tests__/BrewHistoryRow.test.tsx
git commit -m "Name the drawdown rate in the history list"
```

---

### Task 12: The compare screen

Two rate lanes under the two volume lanes, on one negotiated axis, because
two charts drawn to their own maxima cannot be compared by eye, which is the
one thing this screen exists to allow.

**Files:**
- Modify: `library/brew/compare.ts:252` (`compareAxis`, and the `CompareAxis` type)
- Modify: `hooks/useBrewComparison.ts:93`
- Modify: `app/brewCompare.tsx:343`
- Test: `library/brew/__tests__/compare.test.ts`, `app/__tests__/brewCompare.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `library/brew/__tests__/compare.test.ts`:

```ts
    it("negotiates one rate axis across both brews", () => {
        const axis = compareAxis(subjectWithPeak(2), referenceWithPeak(5));
        expect(axis.maxRate).toBeCloseTo(5, 6);
    });

    it("has a rate axis of 0 when neither brew kept its stream", () => {
        expect(compareAxis(sweptSubject(), sweptReference()).maxRate).toBe(0);
    });
```

In `app/__tests__/brewCompare.test.tsx`:

```tsx
    it("draws a rate lane for each brew", async () => {
        await renderCompareInTest(twoBrewsWithSamples());
        expect(await screen.findByTestId("compare-rate-subject")).toBeTruthy();
        expect(screen.getByTestId("compare-rate-reference")).toBeTruthy();
    });

    it("draws no rate lanes when neither brew kept its stream", async () => {
        await renderCompareInTest(twoSweptBrews());
        expect(screen.queryByTestId("compare-rate-subject")).toBeNull();
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest library/brew/__tests__/compare.test.ts app/__tests__/brewCompare.test.tsx -t rate`
Expected: FAIL.

- [ ] **Step 3: Negotiate the axis**

In `library/brew/compare.ts`, add `maxRate: number` to `CompareAxis` with a
comment saying it is the larger of the two brews' peak rates and 0 when
neither has a stream, then compute it in `compareAxis` from
`maxRateOf(flowSeries(...))` for each side. Everything else in the function is
unchanged.

- [ ] **Step 4: Draw the lanes**

In `app/brewCompare.tsx`, below the two `CompareTrace` lanes, render a
`BrewRateChart` for each side with `maxRate={axis.maxRate}` and the test IDs
above. Reuse whatever the screen already has for each side's samples and
accent; if a side has no samples its chart returns null on its own, which is
what the second test asserts.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest library/brew/__tests__/compare.test.ts app/__tests__/brewCompare.test.tsx`
Expected: PASS, both files.

- [ ] **Step 6: Commit**

```bash
git add library/brew/compare.ts hooks/useBrewComparison.ts app/brewCompare.tsx \
        library/brew/__tests__/compare.test.ts app/__tests__/brewCompare.test.tsx
git commit -m "Compare two brews' rates on one axis"
```

---

### Task 13: Whole suite and the docs

- [ ] **Step 1: Run everything**

Run: `npm run typecheck && npm run lint && npm test && npx expo-doctor`
Expected: all four green. `expo-doctor` is a hard CI failure, so it runs here
too even though nothing in this plan touches a dependency.

- [ ] **Step 2: Update the repository instructions**

In `.github/copilot-instructions.md`, under the `library/brew/` bullet, add a
sentence naming `flowRate.ts` and the two rules a future contributor would
otherwise have to rediscover: the fit is not a secant, and the bypass is
excluded by `pour > stages` rather than by `bypass.startedAt`. Add
`cupAtDrawdown` to the sentence about what `BrewDatabase` snapshots, noting it
is a raw observation kept so the rate outlives the sample sweep.

- [ ] **Step 3: Commit**

```bash
git add .github/copilot-instructions.md
git commit -m "Write down what the flow rate module promises"
```

- [ ] **Step 4: Verify on hardware**

The 2 second window is an estimate, not a measurement, and the spec flags it
(§12) as an open hardware question. Brew once on a real machine and check:

- the FLOW row settles rather than flickering during a steady pour
- it disappears during the bypass and does not report the bypass's rate
- the live drawdown clock lands on the same figure the saved record shows
- the record's rate chart shows the cup channel falling away as the bed empties

If the row flickers, raise `FLOW_WINDOW_MS`; the arithmetic tests are written
against the constant and one of them pins its value, so changing it is a
deliberate two file edit, which is the intent.

---

## Notes

- **No `useMemo` or `useCallback`** anywhere in this plan. The React Compiler
  is enabled and hand-written memoisation makes it bail out.
- **RNTL v14:** `render`, `fireEvent` and `renderHook` are all async. A missing
  `await` leaves `screen` empty and the test passes for the wrong reason.
  `UNSAFE_getAllByType` and `root.findAllByType` no longer exist, so assertions
  go on rendered output: text, test IDs, accessible labels, and `props.d` on a
  `Path`.
- **Colour:** every value from `constants/colors.ts`. No hex literals and no
  named CSS colours in `app/` or `components/`.
- **Copy:** no em dashes and no dashes as separators in any user-facing string.
- **`BACKUP_VERSION` does not move.** An older backup simply has no
  `cupAtDrawdown` key, and Task 5's third test pins that.

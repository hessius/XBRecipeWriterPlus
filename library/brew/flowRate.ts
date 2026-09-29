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
 * Below this much time, a window is still mostly scale noise.
 *
 * The scale's noise floor is 0.5 ml. Across one second, even the worst
 * endpoint-only reading can only donate 0.5 g/s of noise, a quarter of a
 * typical 2 g/s bed flow, and the least-squares fit usually does better than
 * that. Shorter spans make the first settling tick look like a real surge.
 */
export const FLOW_MIN_WINDOW_MS = 1000;

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

type SlopeSums = {
    count: number;
    sumT: number;
    sumTT: number;
    sumCup: number;
    sumWater: number;
    sumTCup: number;
    sumTWater: number;
};

function emptySums(): SlopeSums {
    return {
        count: 0,
        sumT: 0,
        sumTT: 0,
        sumCup: 0,
        sumWater: 0,
        sumTCup: 0,
        sumTWater: 0
    };
}

function addSample(sums: SlopeSums, sample: BrewSample, sign: 1 | -1): void {
    const t = sample.at / 1000;
    sums.count += sign;
    sums.sumT += sign * t;
    sums.sumTT += sign * t * t;
    sums.sumCup += sign * sample.cup;
    sums.sumWater += sign * sample.water;
    sums.sumTCup += sign * t * sample.cup;
    sums.sumTWater += sign * t * sample.water;
}

function slopeFromSums(
    sums: SlopeSums, spanMs: number, of: "cup" | "water"
): number | null {
    if (sums.count < MIN_WINDOW_SAMPLES || spanMs < FLOW_MIN_WINDOW_MS) return null;

    const sumV = of === "cup" ? sums.sumCup : sums.sumWater;
    const sumTV = of === "cup" ? sums.sumTCup : sums.sumTWater;
    const covariance = sumTV - (sums.sumT * sumV) / sums.count;
    const variance = sums.sumTT - (sums.sumT * sums.sumT) / sums.count;
    if (variance === 0) return null;

    const fitted = covariance / variance;
    return Number.isFinite(fitted) ? fitted : null;
}

function fitFromSums(sums: SlopeSums, spanMs: number, at: number): FlowPoint | null {
    const cup = slopeFromSums(sums, spanMs, "cup");
    const water = slopeFromSums(sums, spanMs, "water");
    if (cup === null || water === null) return null;
    return {at, cup, water};
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
    if (window[window.length - 1].at - window[0].at < FLOW_MIN_WINDOW_MS) return null;

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
    const fitted = covariance / variance;
    return Number.isFinite(fitted) ? fitted : null;
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
    const brew = brewOnly(samples, stages);
    const sums = emptySums();
    let left = 0;

    for (const sample of brew) {
        addSample(sums, sample, 1);
        const from = sample.at - FLOW_WINDOW_MS;
        while (left < brew.length && brew[left].at < from) {
            addSample(sums, brew[left], -1);
            left++;
        }

        const point = fitFromSums(sums, sample.at - brew[left].at, sample.at);
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
 * Empty when there is no rate to draw, which is what the row is hidden on. It
 * holds a rate across empty buckets because the sparkline is just numbers and
 * cannot draw a gap; the full chart gets the gap instead.
 */
export function flowTail(
    samples: BrewSample[], stages: number, seconds: number, buckets: number
): number[] {
    const lastSample = samples[samples.length - 1];
    if (lastSample === undefined || seconds <= 0 || buckets < 1) return [];

    const series = flowSeries(samples, stages);
    if (series.length === 0) return [];

    const from = lastSample.at - seconds * 1000;
    const recent = series.filter((point) => point.at >= from);
    if (recent.length === 0) return [];

    const span = Math.max(1, lastSample.at - from);
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

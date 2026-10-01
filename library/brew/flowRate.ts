import {drawdownSeconds, type BrewRecord, type BrewSample} from "./BrewRecord";
import {medianRateGap, rateAdjacentAllowance} from "./rateChartGeometry";

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

/**
 * The smallest live cup-rate span a sparkline is allowed to stretch.
 *
 * The fitted rate deliberately suppresses scale noise, but a steady 2 g/s bed
 * can still wobble by roughly 0.1 to 0.2 g/s between adjacent fitted readings.
 * Stretching a range that small to the full sparkline would turn the fit's own
 * residual noise into a stall-shaped zigzag. Half a gram per second keeps that
 * residual visible as a small tremor while still leaving real flow changes room
 * to move the line.
 */
export const FLOW_SPARKLINE_MIN_SPAN = 0.5;

/**
 * The retrospective chart smooths with a wider, centred window.
 *
 * Six seconds is long enough to flatten the high frequency derivative noise
 * that still shows after the live two second fit, but short enough that a pour
 * start or stop occupies a small part of a normal record chart. Sparse streams
 * may widen this from their own cadence so the degree-two fit is still made
 * from real neighbouring points rather than padded guesses.
 */
export const RETROSPECTIVE_FLOW_WINDOW_MS = 6000;
const RETROSPECTIVE_FLOW_MIN_SAMPLES = 3;
const RETROSPECTIVE_FLOW_MIN_GAPS = 4;
export const MAX_DRAWDOWN_RATE = 99.9;

/**
 * One decimal place for a displayed rate, or null when there is no number.
 *
 * A negative fit is scale noise around zero: the fit is a least squares slope
 * over two seconds of a stream whose own noise floor is half a millilitre, so
 * during a pause it crosses zero in both directions many times a second. It
 * clamps to 0.0, because a bed draining into a cup cannot run backwards and
 * the honest reading of a bed giving nothing is nothing.
 *
 * It does not decide whether a row exists. Presence is the caller's, from
 * `flowNow` returning null, and it has to stay there: a formatter that could
 * delete a row would blink it at the sample rate as the fit crossed a
 * rounding boundary, which is the reflow `reserveFlow` was added to prevent.
 * Null here means only that there was no number to format.
 */
export function formatFlowRate(rate: number): string | null {
    if (!Number.isFinite(rate)) return null;
    const rounded = Number(rate.toFixed(1));
    return rounded < 0 ? "0.0" : rounded.toFixed(1);
}

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
type RawFlowPoint = FlowPoint & {fromAt: number};

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
    return samples.filter((s) =>
        s.pour >= 1 &&
        s.pour <= stages &&
        Number.isFinite(s.at)
    );
}

function hasFiniteReadings(sample: BrewSample): boolean {
    return Number.isFinite(sample.cup) && Number.isFinite(sample.water);
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
 * A non-finite cup or water reading poisons the window it lands in. The answer
 * is null until that reading ages out, rather than fitting around it, because
 * both channels must describe the same physical readings and a bad scale frame
 * should not silently narrow one side of the comparison.
 *
 * @param at milliseconds on the sample clock. The window ends here and is
 *   inclusive at both ends.
 */
export function flowAt(
    samples: BrewSample[], stages: number, at: number
): FlowPoint | null {
    let latest: BrewSample | undefined;
    for (const sample of samples) {
        if (
            sample.at <= at &&
            (latest === undefined || sample.at >= latest.at)
        ) {
            latest = sample;
        }
    }
    if (latest === undefined || latest.pour < 1 || latest.pour > stages) return null;

    const from = at - FLOW_WINDOW_MS;
    const window = brewOnly(samples, stages)
        .filter((s) => s.at >= from && s.at <= at);
    if (window.some((sample) => !hasFiniteReadings(sample))) return null;
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
 * Non-finite cup or water readings make their whole window unfit, matching
 * `flowAt`; they are not folded into the running sums, so the series resumes
 * when the bad frame ages out.
 */
export function flowSeries(samples: BrewSample[], stages: number): FlowPoint[] {
    const out: FlowPoint[] = [];
    const brew = brewOnly(samples, stages);
    const sums = emptySums();
    let left = 0;
    let badReadings = 0;

    for (const sample of brew) {
        if (hasFiniteReadings(sample)) {
            addSample(sums, sample, 1);
        } else {
            badReadings++;
        }

        const from = sample.at - FLOW_WINDOW_MS;
        while (left < brew.length && brew[left].at < from) {
            if (hasFiniteReadings(brew[left])) {
                addSample(sums, brew[left], -1);
            } else {
                badReadings--;
            }
            left++;
        }

        const point = badReadings === 0
            ? fitFromSums(sums, sample.at - brew[left].at, sample.at)
            : null;
        if (point !== null) out.push(point);
    }
    return out;
}

function rawRateSeries(samples: BrewSample[], stages: number): RawFlowPoint[] {
    const brew = brewOnly(samples, stages);
    const out: RawFlowPoint[] = [];
    let previous: BrewSample | undefined;

    for (const sample of brew) {
        if (!hasFiniteReadings(sample)) {
            previous = undefined;
            continue;
        }
        if (previous !== undefined) {
            const seconds = (sample.at - previous.at) / 1000;
            if (seconds > 0) {
                out.push({
                    at:    sample.at,
                    fromAt: previous.at,
                    cup:   (sample.cup - previous.cup) / seconds,
                    water: (sample.water - previous.water) / seconds
                });
            }
        }
        previous = sample;
    }

    return out;
}

function retrospectiveWindowMs(run: FlowPoint[]): number {
    return Math.max(
        RETROSPECTIVE_FLOW_WINDOW_MS,
        medianRateGap(run) * RETROSPECTIVE_FLOW_MIN_GAPS
    );
}

function solve3(
    matrix: [[number, number, number], [number, number, number], [number, number, number]],
    values: [number, number, number]
): [number, number, number] | null {
    const rows = matrix.map((row, i) => [...row, values[i]]);

    for (let column = 0; column < 3; column += 1) {
        let pivot = column;
        for (let row = column + 1; row < 3; row += 1) {
            if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) {
                pivot = row;
            }
        }
        if (Math.abs(rows[pivot][column]) < 1e-12) return null;
        if (pivot !== column) {
            const swap = rows[column];
            rows[column] = rows[pivot];
            rows[pivot] = swap;
        }

        const divisor = rows[column][column];
        for (let col = column; col < 4; col += 1) rows[column][col] /= divisor;
        for (let row = 0; row < 3; row += 1) {
            if (row === column) continue;
            const factor = rows[row][column];
            for (let col = column; col < 4; col += 1) {
                rows[row][col] -= factor * rows[column][col];
            }
        }
    }

    return [rows[0][3], rows[1][3], rows[2][3]];
}

function clampToWindow(value: number, window: FlowPoint[], of: "cup" | "water"): number {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const point of window) {
        min = Math.min(min, point[of]);
        max = Math.max(max, point[of]);
    }
    return Math.min(max, Math.max(min, value));
}

function savitzkyGolayAt(
    window: FlowPoint[], centreAt: number, of: "cup" | "water"
): number | null {
    if (window.length < RETROSPECTIVE_FLOW_MIN_SAMPLES) return null;

    let s0 = 0;
    let s1 = 0;
    let s2 = 0;
    let s3 = 0;
    let s4 = 0;
    let y0 = 0;
    let y1 = 0;
    let y2 = 0;

    for (const point of window) {
        const x = (point.at - centreAt) / 1000;
        const x2 = x * x;
        const value = point[of];
        s0 += 1;
        s1 += x;
        s2 += x2;
        s3 += x2 * x;
        s4 += x2 * x2;
        y0 += value;
        y1 += x * value;
        y2 += x2 * value;
    }

    const coefficients = solve3(
        [[s0, s1, s2], [s1, s2, s3], [s2, s3, s4]],
        [y0, y1, y2]
    );
    if (coefficients === null || !Number.isFinite(coefficients[0])) return null;
    return clampToWindow(coefficients[0], window, of);
}

function retrospectiveWindowFor(
    run: RawFlowPoint[], pointAt: number, windowMs: number
): RawFlowPoint[] {
    const first = run[0];
    const last = run[run.length - 1];
    if (first === undefined || last === undefined) return [];
    if (last.at - first.at <= windowMs) return run;

    const halfWindow = windowMs / 2;
    let from = pointAt - halfWindow;
    let to = pointAt + halfWindow;

    if (from < first.at) {
        from = first.at;
        to = first.at + windowMs;
    } else if (to > last.at) {
        to = last.at;
        from = last.at - windowMs;
    }

    return run.filter((candidate) => candidate.at >= from && candidate.at <= to);
}

/**
 * Cumulative readings are exactly re-derived from contiguous derivative points
 * so endpoint fits use the same run segmentation as the rate series.
 */
function cumulativeSlopeAt(
    window: RawFlowPoint[], centreAt: number, of: "cup" | "water"
): number | null {
    const first = window[0];
    if (first === undefined) return null;

    let count = 1;
    let sumT = (first.fromAt - centreAt) / 1000;
    let sumTT = sumT * sumT;
    let sumV = 0;
    let sumTV = 0;
    let value = 0;

    for (const point of window) {
        value += point[of] * ((point.at - point.fromAt) / 1000);
        const t = (point.at - centreAt) / 1000;
        count += 1;
        sumT += t;
        sumTT += t * t;
        sumV += value;
        sumTV += t * value;
    }

    const covariance = sumTV - (sumT * sumV) / count;
    const variance = sumTT - (sumT * sumT) / count;
    if (variance === 0) return null;
    const fitted = covariance / variance;
    return Number.isFinite(fitted) ? fitted : null;
}

function cumulativeQuadraticDerivativeAt(
    window: RawFlowPoint[], centreAt: number, windowMs: number, of: "cup" | "water"
): number | null {
    const first = window[0];
    const last = window[window.length - 1];
    if (first === undefined) return null;
    if (last === undefined) return null;

    let s0 = 1;
    let s1 = (first.fromAt - centreAt) / 1000;
    let s2 = s1 * s1;
    let s3 = s2 * s1;
    let s4 = s2 * s2;
    let y0 = 0;
    let y1 = 0;
    let y2 = 0;
    let value = 0;

    for (const point of window) {
        value += point[of] * ((point.at - point.fromAt) / 1000);
        const x = (point.at - centreAt) / 1000;
        const x2 = x * x;
        s0 += 1;
        s1 += x;
        s2 += x2;
        s3 += x2 * x;
        s4 += x2 * x2;
        y0 += value;
        y1 += x * value;
        y2 += x2 * value;
    }

    const coefficients = solve3(
        [[s0, s1, s2], [s1, s2, s3], [s2, s3, s4]],
        [y0, y1, y2]
    );
    if (coefficients === null) return null;

    const quadratic = coefficients[1];
    const linear = cumulativeSlopeAt(window, centreAt, of);
    if (linear === null) return null;
    const support = Math.min(1, Math.max(0, (last.at - first.fromAt) / windowMs));
    const fitted = linear + (quadratic - linear) * support * support;
    return Number.isFinite(fitted) ? fitted : null;
}

function retrospectiveFitAt(
    window: RawFlowPoint[], pointAt: number, windowMs: number, of: "cup" | "water"
): number | null {
    const first = window[0];
    const last = window[window.length - 1];
    if (first === undefined || last === undefined) return null;

    const leftSupportMs = pointAt - first.fromAt;
    const rightSupportMs = last.at - pointAt;
    const halfWindowMs = windowMs / 2;
    if (
        last.at - first.fromAt < windowMs ||
        leftSupportMs < halfWindowMs ||
        rightSupportMs < halfWindowMs
    ) {
        // Endpoint windows have less support, so they get stricter fits. With
        // fewer than the minimum samples, the cumulative path falls back to a
        // linear slope because a quadratic fit would be invented. Otherwise it
        // uses the quadratic cumulative derivative, blended back toward the
        // linear slope by support squared so short endpoints cannot flatten
        // into a shelf. The result is capped by the verified endpoint rate fit
        // so cumulative curvature cannot claim flow before the first drop or
        // after the run has ended. Finally, negative endpoint noise clamps to
        // zero here, where the rate becomes a claim.
        const cumulative = window.length < RETROSPECTIVE_FLOW_MIN_SAMPLES
            ? cumulativeSlopeAt(window, pointAt, of)
            : cumulativeQuadraticDerivativeAt(window, pointAt, windowMs, of);
        if (cumulative === null) return null;
        const rateFit = savitzkyGolayAt(window, pointAt, of);
        const fitted = rateFit === null ? cumulative : Math.min(cumulative, rateFit);
        return Math.max(0, fitted);
    }

    return savitzkyGolayAt(window, pointAt, of);
}

function smoothRetrospectiveRun(run: RawFlowPoint[]): FlowPoint[] {
    const first = run[0];
    const last = run[run.length - 1];
    if (first === undefined || last === undefined) return [];

    const windowMs = retrospectiveWindowMs(run);
    return run.flatMap((point) => {
        const window = retrospectiveWindowFor(run, point.at, windowMs);
        const cup = retrospectiveFitAt(window, point.at, windowMs, "cup");
        const water = retrospectiveFitAt(window, point.at, windowMs, "water");
        if (cup === null || water === null) return [];
        return {
            at:    point.at,
            cup,
            water
        };
    });
}

function splitRateRuns<T extends FlowPoint>(series: T[], adjacentMs: number): T[][] {
    const runs: T[][] = [];
    let current: T[] = [];

    for (const point of series) {
        const previous = current[current.length - 1];
        if (previous !== undefined && point.at - previous.at > adjacentMs) {
            runs.push(current);
            current = [];
        }
        current.push(point);
    }
    if (current.length > 0) runs.push(current);
    return runs;
}

function hasRetrospectiveSupport(run: RawFlowPoint[]): boolean {
    const first = run[0];
    const last = run[run.length - 1];
    return first !== undefined && last !== undefined &&
        last.at - first.at >= FLOW_MIN_WINDOW_MS;
}

/**
 * Both channels across the retained stream, for retrospective charts.
 *
 * This is deliberately separate from `flowNow`, `flowAt`, `flowSeries` and
 * `flowTail`, which are live and causal. A finished record already has every
 * sample, so its chart smooths the noisy derivative with a degree-two
 * Savitzky-Golay fit over a centred window. The fit is confined to the same
 * contiguous runs the path builder will draw: no sample on one side of a gap
 * can affect a point on the other side.
 */
export function retrospectiveFlowSeries(
    samples: BrewSample[], stages: number
): FlowPoint[] {
    const raw = rawRateSeries(samples, stages);
    const adjacentMs = rateAdjacentAllowance(raw);
    return splitRateRuns(raw, adjacentMs)
        .map((run) => run.filter((point) => point.at - point.fromAt <= adjacentMs))
        .flatMap((run) => splitRateRuns(run, adjacentMs))
        .filter(hasRetrospectiveSupport)
        .flatMap(smoothRetrospectiveRun);
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
    return Number.isFinite(rate) && rate > 0 && rate <= MAX_DRAWDOWN_RATE ? rate : null;
}

export function drawdownFigures(record: BrewRecord): {seconds: number; rate: number | null} | null {
    const seconds = drawdownSeconds(record);
    if (seconds === null) return null;
    return {seconds, rate: drawdownRate(record)};
}

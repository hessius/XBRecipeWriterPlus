import {dotoRowHeight} from "@/library/dotoMetrics";
import type {FlowPoint} from "@/library/brew/flowRate";

export const RATE_HEIGHT = 84;
export const RATE_TOP_GAP = 18;
export const RATE_BOTTOM_GAP = 12;
export const RATE_LABEL_SIZE = 9;

/**
 * Adjacent rate points are judged against the stream's own cadence, not a
 * timer the recorder does not own. The recorder pushes once per machine weight
 * notification, so the real spacing is whatever the BLE link delivered.
 *
 * The floor is the original 150 ms rule, so a dense 100 ms stream still
 * splits on a single missing point exactly as before. Slower streams get four
 * median gaps of allowance: measured scale gap jitter reaches just over three
 * times its median, so a three-gap allowance can split a continuous pour and
 * turn the new run's endpoint fit into a false flow-rate spike. Four gaps is
 * still short compared with a stage pause. The five second ceiling is the
 * honesty guard. A gap nobody measured across must stay a gap rather than
 * becoming a line that claims a rate through silence.
 */
export const RATE_ADJACENT_MS = 150;
const RATE_ADJACENT_MULTIPLE = 4;
const RATE_MAX_ADJACENT_MS = 5_000;
const RATE_RUNS = new WeakMap<readonly FlowPoint[], readonly FlowPoint[][]>();

export function medianRateGap<T extends FlowPoint>(series: T[]): number {
    const gaps: number[] = [];
    for (let i = 1; i < series.length; i += 1) {
        const gap = series[i].at - series[i - 1].at;
        if (Number.isFinite(gap) && gap > 0) gaps.push(gap);
    }
    if (gaps.length === 0) return RATE_ADJACENT_MS;

    gaps.sort((a, b) => a - b);
    const middle = Math.floor(gaps.length / 2);
    return gaps.length % 2 === 1
        ? gaps[middle]
        : (gaps[middle - 1] + gaps[middle]) / 2;
}

export function rateAdjacentAllowance<T extends FlowPoint>(series: T[]): number {
    const cadence = medianRateGap(series);
    if (cadence <= RATE_ADJACENT_MS) return RATE_ADJACENT_MS;
    return Math.min(cadence * RATE_ADJACENT_MULTIPLE, RATE_MAX_ADJACENT_MS);
}

export function contiguousRateRuns<T extends FlowPoint>(series: T[]): T[][] {
    const runs: T[][] = [];
    let current: T[] = [];
    const adjacentMs = rateAdjacentAllowance(series);

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

export function rememberRateRuns<T extends FlowPoint>(series: T[], runs: T[][]): T[] {
    RATE_RUNS.set(series, runs);
    return series;
}

export function rateRunsOf<T extends FlowPoint>(series: T[]): T[][] {
    return (RATE_RUNS.get(series) as T[][] | undefined) ?? contiguousRateRuns(series);
}

export function hasDrawableRateRun(series: FlowPoint[]): boolean {
    return rateRunsOf(series).some((run) => run.length >= 2);
}

export function rateChartLabelRowHeight(fontScale: number): number {
    return dotoRowHeight(RATE_LABEL_SIZE, fontScale);
}

export function rateChartPlotTop(fontScale = 1, verticalInset = 0): number {
    return rateChartLabelRowHeight(fontScale) + verticalInset;
}

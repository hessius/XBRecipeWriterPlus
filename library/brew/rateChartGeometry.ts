import {dotoRowHeight} from "@/library/dotoMetrics";
import type {FlowPoint} from "@/library/brew/flowRate";

export const RATE_HEIGHT = 84;
export const RATE_LABEL_SIZE = 9;

/**
 * The recorder samples at about 10 Hz, and every stream fixture that models
 * live data uses 100 ms frames. A 150 ms allowance admits normal timer jitter,
 * while a single omitted rate point at the ordinary cadence produces a
 * 200 ms hole and splits the path.
 *
 * `BrewSample.at` is a JS-side arrival time rather than a firmware timestamp,
 * so it measures bridge delivery as much as the scale. A one-off jitter split
 * is invisible: a 200 ms hole in a 100 s brew is under a pixel. A sustained
 * sparse stretch, from a poor link, isolates every point, and a run of one
 * point has no line to draw, so that stretch draws nothing. Drawing nothing is
 * the honest reading of a stream that arrived too thin to say a rate, but it
 * is a cliff rather than a fade, and it is worth knowing about before tuning
 * this number.
 */
export const RATE_ADJACENT_MS = 150;

export function contiguousRateRuns(series: FlowPoint[]): FlowPoint[][] {
    const runs: FlowPoint[][] = [];
    let current: FlowPoint[] = [];

    for (const point of series) {
        const previous = current[current.length - 1];
        if (previous !== undefined && point.at - previous.at > RATE_ADJACENT_MS) {
            runs.push(current);
            current = [];
        }
        current.push(point);
    }
    if (current.length > 0) runs.push(current);
    return runs;
}

export function hasDrawableRateRun(series: FlowPoint[]): boolean {
    return contiguousRateRuns(series).some((run) => run.length >= 2);
}

export function rateChartLabelRowHeight(fontScale: number): number {
    return dotoRowHeight(RATE_LABEL_SIZE, fontScale);
}

export function rateChartPlotTop(fontScale = 1, verticalInset = 0): number {
    return rateChartLabelRowHeight(fontScale) + verticalInset;
}

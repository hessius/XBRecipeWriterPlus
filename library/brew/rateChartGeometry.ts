import {dotoRowHeight} from "@/library/dotoMetrics";

export const RATE_HEIGHT = 84;
export const RATE_LABEL_SIZE = 9;
export const RATE_LABEL_LINE_HEIGHT = 1.35;

export function rateChartLabelRowHeight(fontScale: number): number {
    return dotoRowHeight(RATE_LABEL_SIZE, fontScale);
}

export function rateChartPlotTop(fontScale = 1, verticalInset = 0): number {
    return rateChartLabelRowHeight(fontScale) + verticalInset;
}

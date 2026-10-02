import {
    contiguousRateRuns,
    hasDrawableRateRun,
    rateAdjacentAllowance
} from "../rateChartGeometry";
import type {FlowPoint} from "../flowRate";

function seriesFromGaps(gaps: number[]): FlowPoint[] {
    let at = 0;
    const out: FlowPoint[] = [{at, cup: 1, water: 2}];
    for (const gap of gaps) {
        at += gap;
        out.push({at, cup: 1, water: 2});
    }
    return out;
}

function runLengths(series: FlowPoint[]): number[] {
    return contiguousRateRuns(series).map((run) => run.length);
}

describe("rate chart geometry", () => {
    it("allows four median gaps before splitting a sparse rate run", () => {
        expect(rateAdjacentAllowance(seriesFromGaps([210, 210, 210, 210]))).toBe(840);
    });

    it("keeps dense 100 ms streams on the existing 150 ms adjacency floor", () => {
        expect(runLengths(seriesFromGaps([100, 200, 100]))).toEqual([2, 2]);
    });

    it.each([500, 1_000])(
        "draws a steady %d ms hardware cadence as one run",
        (gap) => {
            const sparse = seriesFromGaps([gap, gap, gap, gap]);

            expect(runLengths(sparse)).toEqual([5]);
            expect(hasDrawableRateRun(sparse)).toBe(true);
        }
    );

    it("keeps an irregular sparse stream with occasional 900 ms gaps together", () => {
        expect(runLengths(seriesFromGaps([400, 380, 900, 410]))).toEqual([5]);
    });

    it("does not split a real 210 ms cadence on one 639 ms scale gap", () => {
        const runs = contiguousRateRuns(seriesFromGaps([
            210, 210, 639, 210, 210, 210, 210
        ]));

        expect(runs).toHaveLength(1);
        expect(runs.map((run) => run.length)).toEqual([8]);
    });

    it("breaks across a real pause between stages", () => {
        expect(runLengths(seriesFromGaps([500, 500, 20_000, 500]))).toEqual([3, 2]);
    });

    it("does not join two points an entire minute apart", () => {
        const farApart = seriesFromGaps([60_000]);

        expect(runLengths(farApart)).toEqual([1, 1]);
        expect(hasDrawableRateRun(farApart)).toBe(false);
    });
});

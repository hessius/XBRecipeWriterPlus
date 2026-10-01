import React from "react";
import {PixelRatio, processColor} from "react-native";

import BrewRateChart from "@/components/BrewRateChart";
import BrewTrace from "@/components/BrewTrace";
import {palette} from "@/constants/colors";
import {
    RATE_HEIGHT,
    rememberRateRuns,
    rateChartLabelRowHeight,
    rateChartPlotTop
} from "@/library/brew/rateChartGeometry";
import {traceTimeExtent} from "@/library/brew/brewShape";
import {timeFlowGradient} from "@/library/brew/timeFlowTail";
import type {BrewSample} from "@/library/brew/BrewRecord";
import {retrospectiveFlowSeries, type FlowPoint} from "@/library/brew/flowRate";
import Pour from "@/library/Pour";
import {renderWithProviders} from "@/test-utils/render";

const WIDTH = 240;
const ACCENT = palette.brand;

const series: FlowPoint[] = Array.from({length: 40}, (_, i) => ({
    at: 1_000 + i * 100,
    cup: 1 + (i % 5) * 0.2,
    water: 3
}));

function isolatedSeries(): FlowPoint[] {
    return [
        {at: 1_000, cup: 1, water: 2},
        {at: 1_500, cup: 1.2, water: 2.2},
        {at: 2_000, cup: 1.4, water: 2.4}
    ];
}

function yValues(path: string): number[] {
    return [...path.matchAll(/[ML]\s*[\d.]+\s+([\d.]+)/g)]
        .map((match) => Number(match[1]));
}

function pathPoints(path: string): {x: number; y: number}[] {
    return [...path.matchAll(/[ML]\s*([-\d.]+)\s+([-\d.]+)/g)]
        .map((match) => ({x: Number(match[1]), y: Number(match[2])}));
}

function dotXs(path: string): number[] {
    return [...path.matchAll(/M\s*([-\d.]+)\s+[-\d.]+\s*l\s*1\s+0/g)]
        .map((match) => Number(match[1]) + 0.5);
}

function largestGap(values: number[]): number {
    let largest = 0;
    for (let i = 1; i < values.length; i += 1) {
        largest = Math.max(largest, Math.round((values[i] - values[i - 1]) * 10) / 10);
    }
    return largest;
}

function svgText(node: {props: {children?: unknown}}): string | undefined {
    const child = node.props.children;
    if (typeof child === "string") return child;
    if (React.isValidElement<{children?: unknown}>(child)
        && typeof child.props.children === "string") {
        return child.props.children;
    }
    return undefined;
}

function matrixTranslateY(value: number[]): number {
    return value[5];
}

function brushRef(value: unknown): string | undefined {
    return typeof value === "object" && value !== null && "brushRef" in value
        ? String((value as {brushRef: unknown}).brushRef)
        : undefined;
}

function sample(at: number, water: number, cup: number, pour: number): BrewSample {
    return {at, water, cup, pour};
}

function ramp(
    from: number,
    to: number,
    pour: number,
    waterStart: number,
    cupStart: number
): BrewSample[] {
    const out: BrewSample[] = [];
    for (let at = from; at <= to; at += 100) {
        const seconds = (at - from) / 1000;
        out.push(sample(at, waterStart + seconds * 2, cupStart + seconds * 1.4, pour));
    }
    return out;
}

describe("BrewRateChart", () => {
    it("draws both rate channels", async () => {
        const {getByTestId} = await renderWithProviders(
            <BrewRateChart series={series} accent={ACCENT} width={WIDTH} maxT={5} />
        );

        expect(getByTestId("rate-chart")).toBeTruthy();
        expect(svgText(getByTestId("rate-chart-label"))).toBe("FLOW RATE");
        expect(getByTestId("rate-chart-cup")).toBeTruthy();
        expect(getByTestId("rate-chart-water")).toBeTruthy();
    });

    it("leaves the time-flow tail off by default", async () => {
        const {getByTestId} = await renderWithProviders(
            <BrewRateChart series={series} accent={ACCENT} width={WIDTH} maxT={5} />
        );

        expect(getByTestId("rate-chart-water").props.stroke).toEqual(
            expect.objectContaining({payload: processColor(ACCENT)})
        );
        expect(getByTestId("rate-chart-cup").props.stroke).not.toHaveProperty("brushRef");
    });

    it("draws the time-flow tail faint at the start and full at the end", async () => {
        const {getByTestId} = await renderWithProviders(
            <BrewRateChart
                series={series}
                accent={ACCENT}
                width={WIDTH}
                maxT={5}
                emphasizeTimeFlow
            />
        );

        const gradient = timeFlowGradient(WIDTH);
        expect(brushRef(getByTestId("rate-chart-water").props.stroke))
            .toContain("rate-water-comet");
        expect(gradient.gradientUnits).toBe("userSpaceOnUse");
        expect(gradient.x1).toBe(0);
        expect(gradient.x2).toBe(WIDTH);
        expect(gradient.start.offset).toBe("0");
        expect(gradient.end.offset).toBe("1");
        expect(gradient.start.opacity).toBeGreaterThan(0);
        expect(gradient.start.opacity).toBeLessThan(gradient.end.opacity);
        expect(gradient.end.opacity).toBe(1);
    });

    it("gives two mounted rate charts different gradient ids", async () => {
        const r = await renderWithProviders(
            <>
                <BrewRateChart
                    series={series}
                    accent={ACCENT}
                    width={WIDTH}
                    maxT={5}
                    emphasizeTimeFlow
                />
                <BrewRateChart
                    series={series}
                    accent={palette.warn}
                    width={WIDTH - 40}
                    maxT={5}
                    emphasizeTimeFlow
                />
            </>
        );

        const waterComets = r.getAllByTestId("rate-chart-water");
        const cupComets = r.getAllByTestId("rate-chart-cup");

        expect(brushRef(waterComets[0].props.stroke))
            .not.toBe(brushRef(waterComets[1].props.stroke));
        expect(brushRef(cupComets[0].props.stroke))
            .not.toBe(brushRef(cupComets[1].props.stroke));
    });

    it("draws nothing at all when the stream did not survive", async () => {
        const {queryByTestId} = await renderWithProviders(
            <BrewRateChart series={[]} accent={ACCENT} width={WIDTH} maxT={5} />
        );

        expect(queryByTestId("rate-chart")).toBeNull();
    });

    it("draws nothing for one point", async () => {
        const {queryByTestId} = await renderWithProviders(
            <BrewRateChart series={[series[0]]} accent={ACCENT} width={WIDTH} maxT={5} />
        );

        expect(queryByTestId("rate-chart")).toBeNull();
    });

    it("draws a steady sparse hardware cadence as a continuous line", async () => {
        const {getByTestId} = await renderWithProviders(
            <BrewRateChart series={isolatedSeries()} accent={ACCENT} width={WIDTH} maxT={2} />
        );

        const d = getByTestId("rate-chart-water").props.d as string;
        expect(d.match(/M/g)).toHaveLength(1);
        expect(d.match(/C/g)).toHaveLength(2);
    });

    it("keeps the old 150 ms split for a dense stream with one missing rate point", async () => {
        const gapped: FlowPoint[] = [
            {at: 1_000, cup: 1, water: 2},
            {at: 1_100, cup: 1.2, water: 2.2},
            {at: 1_300, cup: 1.4, water: 2.4},
            {at: 1_400, cup: 1.6, water: 2.6}
        ];

        const {getByTestId} = await renderWithProviders(
            <BrewRateChart series={gapped} accent={ACCENT} width={WIDTH} maxT={2} />
        );

        const d = getByTestId("rate-chart-water").props.d as string;
        expect(d.match(/M/g)).toHaveLength(2);
    });

    it("draws nothing for two points an entire minute apart", async () => {
        const {queryByTestId} = await renderWithProviders(
            <BrewRateChart
                series={[
                    {at: 1_000, cup: 1, water: 2},
                    {at: 61_000, cup: 1.2, water: 2.2}
                ]}
                accent={ACCENT}
                width={WIDTH}
                maxT={62}
            />
        );

        expect(queryByTestId("rate-chart")).toBeNull();
    });

    it("breaks a real retrospective line across a bypass-shaped omission", async () => {
        const samples = [
            ...ramp(0, 3_000, 1, 0, 0),
            ...ramp(3_100, 5_000, 2, 6.2, 4.34),
            ...ramp(5_100, 8_000, 1, 10, 6)
        ];
        const rate = retrospectiveFlowSeries(samples, 1);

        const {getByTestId} = await renderWithProviders(
            <BrewRateChart series={rate} accent={ACCENT} width={WIDTH} maxT={8} />
        );

        const d = getByTestId("rate-chart-water").props.d as string;
        expect(d.match(/M/g)).toHaveLength(2);
    });

    it.each([
        [300, 180, 1_000, 1.7, 2],
        [300, 180, 2_000, 3.3, 2],
        [240, 180, 3_000, 4, 2]
    ])(
        "draws cup endpoints for a %d px chart with a %d second axis and %d ms run",
        async (width, maxT, span, runWidth, dots) => {
            const short: FlowPoint[] = [
                {at: 0, cup: 1, water: 2},
                {at: span, cup: 1.2, water: 2.2}
            ];

            const {getByTestId} = await renderWithProviders(
                <BrewRateChart series={short} accent={ACCENT} width={width} maxT={maxT} />
            );

            expect(dotXs(getByTestId("rate-chart-cup").props.d as string)).toHaveLength(dots);
            expect(getByTestId("rate-chart-water")).toBeTruthy();
            expect(runWidth).toBeCloseTo((span / 1000 / maxT) * width, 1);
        }
    );

    it("uses the rate runs carried by the library instead of measuring again", async () => {
        const carried: FlowPoint[] = [
            {at: 0, cup: 1, water: 2},
            {at: 600, cup: 1.1, water: 2.1},
            {at: 1_200, cup: 1.2, water: 2.2},
            {at: 1_800, cup: 1.3, water: 2.3}
        ];
        rememberRateRuns(carried, [carried.slice(0, 2), carried.slice(2)]);

        const {getByTestId} = await renderWithProviders(
            <BrewRateChart series={carried} accent={ACCENT} width={WIDTH} maxT={2} />
        );

        const d = getByTestId("rate-chart-water").props.d as string;
        expect(d.match(/M/g)).toHaveLength(2);
    });

    it("places cup dots at a fixed time-axis rhythm without filling real gaps", async () => {
        const gapped: FlowPoint[] = [
            ...Array.from({length: 11}, (_, i) => ({
                at: i * 100,
                cup: 0.2 + i * 0.36,
                water: 2
            })),
            ...Array.from({length: 11}, (_, i) => ({
                at: 3_000 + i * 100,
                cup: 0.4 + i * 0.04,
                water: 2
            }))
        ];

        const {getByTestId} = await renderWithProviders(
            <BrewRateChart series={gapped} accent={ACCENT} width={400} maxT={4} maxRate={4} />
        );

        const cup = getByTestId("rate-chart-cup");
        const xs = dotXs(cup.props.d as string);
        const measuredGaps = xs
            .filter((x) => x <= 100)
            .slice(1)
            .map((x, i) => Math.round((x - xs[i]) * 10) / 10);

        expect(cup.props.strokeDasharray).toBeUndefined();
        expect(xs).toHaveLength(52);
        expect(new Set(measuredGaps)).toEqual(new Set([4]));
        expect(xs.some((x) => x > 100 && x < 300)).toBe(false);
    });

    it.each([
        [200, 1],
        [400, 2]
    ])("interrupts the dot rhythm across a %d ms carried run gap", async (gap, dotGap) => {
        const gapped: FlowPoint[] = [
            {at: 0, cup: 1, water: 2},
            {at: 10_000, cup: 1.2, water: 2.2},
            {at: 10_000 + gap, cup: 1.3, water: 2.3},
            {at: 20_000 + gap, cup: 1.4, water: 2.4}
        ];
        rememberRateRuns(gapped, [gapped.slice(0, 2), gapped.slice(2)]);

        const {getByTestId} = await renderWithProviders(
            <BrewRateChart series={gapped} accent={ACCENT} width={300} maxT={60} maxRate={4} />
        );

        const xs = dotXs(getByTestId("rate-chart-cup").props.d as string);
        const gaps = xs.slice(1).map((x, i) => Math.round((x - xs[i]) * 10) / 10);
        expect(gaps).toContain(dotGap);
        expect(largestGap(xs)).toBe(4);
    });

    it("uses the same x for a known second as BrewTrace", async () => {
        const samples = [sample(0, 0, 0, 1), sample(50_000, 120, 80, 1)];
        const bypass = {volume: 32, temperature: 85, delivered: 32,
                        startedAt: 90, state: "done" as const};
        const maxT = traceTimeExtent(70, samples, bypass);
        const rate: FlowPoint[] = [
            {at: 49_900, cup: 1, water: 2},
            {at: 50_000, cup: 1.2, water: 2.4}
        ];
        const trace = await renderWithProviders(
            <BrewTrace
                pours={[new Pour(1, 120, 93, 40, 0, 0, 0)]}
                samples={samples}
                accent={ACCENT}
                width={300}
                height={100}
                plannedSeconds={70}
                compact
                bypass={bypass}
            />
        );
        const chart = await renderWithProviders(
            <BrewRateChart series={rate} accent={ACCENT} width={300} maxT={maxT} />
        );

        const traceX = pathPoints(trace.getByTestId("trace-water").props.d as string)[1].x;
        const rateX = pathPoints(chart.getByTestId("rate-chart-water").props.d as string)[1].x;
        expect(traceX).toBeCloseTo(150, 1);
        expect(rateX).toBeCloseTo(traceX, 1);
    });

    it("honours a negotiated maximum so two charts can be compared", async () => {
        const shortAxis = await renderWithProviders(
            <BrewRateChart series={series} accent={ACCENT} width={WIDTH} maxT={5} maxRate={4} />
        );
        const tallAxis = await renderWithProviders(
            <BrewRateChart series={series} accent={ACCENT} width={WIDTH} maxT={5} maxRate={12} />
        );

        const shortPath = shortAxis.getByTestId("rate-chart-cup").props.d as string;
        const tallPath = tallAxis.getByTestId("rate-chart-cup").props.d as string;
        expect(Math.min(...yValues(tallPath))).toBeGreaterThan(Math.min(...yValues(shortPath)));
    });

    it("keeps a nearly flat brew in the lower quarter of the plot", async () => {
        const scaleSpy = jest.spyOn(PixelRatio, "getFontScale").mockReturnValue(1);
        const flat: FlowPoint[] = [
            {at: 1_000, cup: 1, water: 1},
            {at: 1_100, cup: 1, water: 1}
        ];

        const {getByTestId} = await renderWithProviders(
            <BrewRateChart series={flat} accent={ACCENT} width={WIDTH} maxT={2} />
        );

        const plotHeight = RATE_HEIGHT - rateChartLabelRowHeight(1);
        const waterY = yValues(getByTestId("rate-chart-water").props.d as string)[0];
        expect(waterY).toBeGreaterThanOrEqual(plotHeight * 0.7);

        scaleSpy.mockRestore();
    });

    it("reserves the label row from the current font scale", async () => {
        const scaleSpy = jest.spyOn(PixelRatio, "getFontScale").mockReturnValue(1.4);
        const {getByTestId} = await renderWithProviders(
            <BrewRateChart series={series} accent={ACCENT} width={WIDTH} maxT={5} />
        );

        const verticalInset = Math.max(
            getByTestId("rate-chart-water").props.strokeWidth as number,
            getByTestId("rate-chart-cup").props.strokeWidth as number
        ) / 2;
        const plotY = matrixTranslateY(getByTestId("rate-chart-plot").props.matrix as number[]);
        expect(plotY).toBeCloseTo(rateChartPlotTop(1.4, verticalInset), 1);

        scaleSpy.mockRestore();
    });
});

import React from "react";
import {PixelRatio} from "react-native";

import BrewRateChart from "@/components/BrewRateChart";
import BrewTrace from "@/components/BrewTrace";
import {palette} from "@/constants/colors";
import {
    RATE_HEIGHT,
    rateChartLabelRowHeight,
    rateChartPlotTop
} from "@/library/brew/rateChartGeometry";
import {traceTimeExtent} from "@/library/brew/brewShape";
import type {BrewSample} from "@/library/brew/BrewRecord";
import {flowSeries, type FlowPoint} from "@/library/brew/flowRate";
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
        {at: 1_200, cup: 1.2, water: 2.2},
        {at: 1_400, cup: 1.4, water: 2.4}
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

    it("draws no line when every point is isolated by a missing sample", async () => {
        const {queryByTestId} = await renderWithProviders(
            <BrewRateChart series={isolatedSeries()} accent={ACCENT} width={WIDTH} maxT={2} />
        );

        expect(queryByTestId("rate-chart-cup")).toBeNull();
        expect(queryByTestId("rate-chart-water")).toBeNull();
    });

    it("breaks the line for one missing rate point", async () => {
        const gapped: FlowPoint[] = [
            {at: 1_000, cup: 1, water: 2},
            {at: 1_100, cup: 1.2, water: 2.2},
            {at: 1_300, cup: 1.4, water: 2.4},
            {at: 1_400, cup: 1.6, water: 2.6}
        ];

        const {getByTestId} = await renderWithProviders(
            <BrewRateChart series={gapped} accent={ACCENT} width={WIDTH} maxT={2} />
        );

        const d = getByTestId("rate-chart-cup").props.d as string;
        expect(d.match(/M/g)).toHaveLength(2);
    });

    it("breaks a real flowSeries line across a bypass-shaped omission", async () => {
        const samples = [
            ...ramp(0, 3_000, 1, 0, 0),
            ...ramp(3_100, 5_000, 2, 6.2, 4.34),
            ...ramp(5_100, 8_000, 1, 10, 6)
        ];
        const rate = flowSeries(samples, 1);

        const {getByTestId} = await renderWithProviders(
            <BrewRateChart series={rate} accent={ACCENT} width={WIDTH} maxT={8} />
        );

        const d = getByTestId("rate-chart-cup").props.d as string;
        expect(d.match(/M/g)).toHaveLength(2);
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

import React from "react";

import BrewRateChart, {RATE_HEIGHT} from "@/components/BrewRateChart";
import {palette} from "@/constants/colors";
import type {FlowPoint} from "@/library/brew/flowRate";
import {renderWithProviders} from "@/test-utils/render";

const WIDTH = 240;
const ACCENT = palette.brand;

const series: FlowPoint[] = Array.from({length: 40}, (_, i) => ({
    at: 1_000 + i * 500,
    cup: 1 + (i % 5) * 0.2,
    water: 3
}));

function isolatedSeries(): FlowPoint[] {
    return [
        {at: 1_000, cup: 1, water: 2},
        {at: 3_000, cup: 1.2, water: 2.2},
        {at: 5_000, cup: 1.4, water: 2.4}
    ];
}

function yValues(path: string): number[] {
    return [...path.matchAll(/[ML]\s*[\d.]+\s+([\d.]+)/g)]
        .map((match) => Number(match[1]));
}

describe("BrewRateChart", () => {
    it("draws both rate channels", async () => {
        const {getByTestId} = await renderWithProviders(
            <BrewRateChart series={series} accent={ACCENT} width={WIDTH} />
        );

        expect(getByTestId("rate-chart-cup")).toBeTruthy();
        expect(getByTestId("rate-chart-water")).toBeTruthy();
    });

    it("draws nothing at all when the stream did not survive", async () => {
        const {queryByTestId} = await renderWithProviders(
            <BrewRateChart series={[]} accent={ACCENT} width={WIDTH} />
        );

        expect(queryByTestId("rate-chart")).toBeNull();
    });

    it("draws nothing for one point", async () => {
        const {queryByTestId} = await renderWithProviders(
            <BrewRateChart series={[series[0]]} accent={ACCENT} width={WIDTH} />
        );

        expect(queryByTestId("rate-chart")).toBeNull();
    });

    it("draws no line when every point is isolated by a gap", async () => {
        const {queryByTestId} = await renderWithProviders(
            <BrewRateChart series={isolatedSeries()} accent={ACCENT} width={WIDTH} />
        );

        expect(queryByTestId("rate-chart-cup")).toBeNull();
        expect(queryByTestId("rate-chart-water")).toBeNull();
    });

    it("breaks the line across a gap in the middle", async () => {
        const gapped: FlowPoint[] = [
            {at: 1_000, cup: 1, water: 2},
            {at: 1_500, cup: 1.2, water: 2.2},
            {at: 2_000, cup: 1.1, water: 2.1},
            {at: 4_500, cup: 1.4, water: 2.4},
            {at: 5_000, cup: 1.6, water: 2.6},
            {at: 5_500, cup: 1.5, water: 2.5}
        ];

        const {getByTestId} = await renderWithProviders(
            <BrewRateChart series={gapped} accent={ACCENT} width={WIDTH} />
        );

        const d = getByTestId("rate-chart-cup").props.d as string;
        expect(d.match(/M/g)).toHaveLength(2);
    });

    it("honours a negotiated maximum so two charts can be compared", async () => {
        const {getByTestId} = await renderWithProviders(
            <BrewRateChart series={series} accent={ACCENT} width={WIDTH} maxRate={12} />
        );

        const d = getByTestId("rate-chart-cup").props.d as string;
        expect(Math.min(...yValues(d))).toBeGreaterThan(RATE_HEIGHT * 0.8);
    });
});

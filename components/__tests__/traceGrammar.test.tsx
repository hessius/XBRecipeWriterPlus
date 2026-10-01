import React from "react";

import BrewRateChart from "@/components/BrewRateChart";
import BrewTrace from "@/components/BrewTrace";
import CompareTrace from "@/components/CompareTrace";
import FlowSparkline from "@/components/FlowSparkline";
import type {FlowPoint} from "@/library/brew/flowRate";
import type {BrewSample} from "@/library/brew/BrewRecord";
import Pour from "@/library/Pour";
import {renderWithProviders} from "@/test-utils/render";

/**
 * The charts and sparkline must agree about what a channel looks like.
 *
 * `BrewTrace` and `CompareTrace` are separate components on purpose: one draws
 * a brew and the other draws a difference, and folding the second into the
 * first would have put a second brew's worth of branching through every path
 * in a long file. The cost of that decision is drift, and this is the thing
 * that stops it. The drawers read `library/brew/traceStyle.ts`; this asserts
 * that they really do at the rendered SVG host path.
 *
 * If this fails, do not fix it by copying a value from one file to the other.
 * Find the hard-coded stroke that was added and move it into `traceStyle`.
 */

const ACCENT = "#C86A3B";
const SAMPLES: BrewSample[] = [
    {at: 0, water: 0, cup: 0, pour: 1},
    {at: 15_000, water: 120, cup: 90, pour: 1},
    {at: 30_000, water: 250, cup: 235, pour: 1}
];
const POURS = [
    new Pour(1, 120, 93, 40, 0, 0, 15),
    new Pour(2, 130, 92, 40, 0, 0, 0)
];
const PLAN_PATH = "M0 160 L150 40 L300 0";
const FLOW_SERIES: FlowPoint[] = [
    {at: 1_000, cup: 1, water: 2},
    {at: 1_100, cup: 1.2, water: 2.2},
    {at: 1_200, cup: 1.1, water: 2.1}
];

/** The attributes that make a channel recognisable. */
const GRAMMAR = [
    "stroke",
    "strokeWidth",
    "strokeDasharray",
    "strokeLinecap",
    "strokeLinejoin"
] as const;

function styleOf(node: {props: Record<string, unknown>}) {
    return Object.fromEntries(GRAMMAR.map((key) => [key, node.props[key]]));
}

describe("the two charts draw the same channels the same way", () => {
    it.each([
        ["water", "trace-water", "trace-water-subject"],
        ["cup", "trace-cup", "trace-cup-subject"]
    ])("agrees about %s", async (_channel, single, paired) => {
        const one = await renderWithProviders(
            <BrewTrace pours={POURS} samples={SAMPLES} accent={ACCENT}
                       width={300} height={160} plannedSeconds={30} compact />
        );
        const two = await renderWithProviders(
            <CompareTrace subject={SAMPLES} reference={SAMPLES} accent={ACCENT}
                          verdict="differed" width={300} height={160}
                          maxT={30} maxV={260} />
        );

        expect(styleOf(two.getByTestId(paired)))
            .toEqual(styleOf(one.getByTestId(single)));
    });

    it("agrees about the shared plan line", async () => {
        const one = await renderWithProviders(
            <BrewTrace pours={POURS} samples={SAMPLES} accent={ACCENT}
                       width={300} height={160} plannedSeconds={30} compact />
        );
        const two = await renderWithProviders(
            <CompareTrace subject={SAMPLES} reference={SAMPLES} accent={ACCENT}
                          verdict="differed" width={300} height={160}
                          maxT={30} maxV={260} subjectPlan={PLAN_PATH} />
        );

        expect(styleOf(two.getByTestId("trace-plan-subject")))
            .toEqual(styleOf(one.getByTestId("trace-plan")));
    });

    it.each([
        ["water", "trace-water", "trace-water-reference"],
        ["cup", "trace-cup", "trace-cup-reference"]
    ])("uses the same reference grammar for %s in separate and overlay", async (
        _channel,
        single,
        paired
    ) => {
        const separate = await renderWithProviders(
            <BrewTrace pours={POURS} samples={SAMPLES} accent={ACCENT}
                       role="reference" width={300} height={160}
                       plannedSeconds={30} compact />
        );
        const overlay = await renderWithProviders(
            <CompareTrace subject={SAMPLES} reference={SAMPLES} accent={ACCENT}
                          verdict="differed" width={300} height={160}
                          maxT={30} maxV={260} />
        );

        expect(styleOf(separate.getByTestId(single)))
            .toEqual(styleOf(overlay.getByTestId(paired)));
    });
});

describe("the flow sparkline draws the cup grammar", () => {
    it("matches the rendered cup channel", async () => {
        const trace = await renderWithProviders(
            <BrewTrace pours={POURS} samples={SAMPLES} accent={ACCENT}
                       width={300} height={160} plannedSeconds={30} compact />
        );
        const sparkline = await renderWithProviders(
            <FlowSparkline values={[1, 2, 1.5]} accent={ACCENT} />
        );

        expect(styleOf(sparkline.getByTestId(
            "flow-sparkline-path",
            {includeHiddenElements: true}
        )))
            .toEqual(styleOf(trace.getByTestId("trace-cup")));
    });
});

describe("the rate chart draws the shared grammar", () => {
    it("matches the rendered water channel", async () => {
        const trace = await renderWithProviders(
            <BrewTrace pours={POURS} samples={SAMPLES} accent={ACCENT}
                       width={300} height={160} plannedSeconds={30} compact />
        );
        const rate = await renderWithProviders(
            <BrewRateChart series={FLOW_SERIES} accent={ACCENT} width={300} maxT={3} />
        );

        expect(styleOf(rate.getByTestId("rate-chart-water")))
            .toEqual(styleOf(trace.getByTestId("trace-water")));
    });

    it("keeps the cup colour and dot size while spacing rate dots by time", async () => {
        const trace = await renderWithProviders(
            <BrewTrace pours={POURS} samples={SAMPLES} accent={ACCENT}
                       width={300} height={160} plannedSeconds={30} compact />
        );
        const rate = await renderWithProviders(
            <BrewRateChart series={FLOW_SERIES} accent={ACCENT} width={300} maxT={3} />
        );
        const traceCup = styleOf(trace.getByTestId("trace-cup"));
        const rateCup = styleOf(rate.getByTestId("rate-chart-cup"));

        expect(rateCup).toEqual({
            ...traceCup,
            strokeDasharray: undefined,
            strokeLinejoin:  undefined
        });
    });
});

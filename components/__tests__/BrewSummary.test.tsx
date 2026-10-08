import React from "react";
import {Dimensions, StyleSheet, type StyleProp, type ViewStyle} from "react-native";
import {act, fireEvent, screen, within} from "@testing-library/react-native";

import BrewSummary from "@/components/BrewSummary";
import {LEGEND_SIZE, rowHeight} from "@/components/TraceLegendItem";
import {palette} from "@/constants/colors";
import type {BrewSample} from "@/library/brew/BrewRecord";
import {storyChartWidth, storyTextContentWidth} from "@/library/brew/storyCard";
import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";
import {renderWithProviders} from "@/test-utils/render";

const mockWindow = {fontScale: 1, height: 852, scale: 3, width: 393};

// Captured so a test can see what the summary asks of the marquee. Spread from
// the real module so the name still renders.
let marqueeProps: Record<string, unknown> = {};
jest.mock("@/components/MarqueeText", () => {
    const actual = jest.requireActual("@/components/MarqueeText");
    return {
        __esModule: true,
        ...actual,
        default: (props: Record<string, unknown>) => {
            marqueeProps = props;
            return actual.default(props);
        }
    };
});

// The real ladder, wrapped so a test can see the band widths the summary hands
// it. RNTL performs no layout, so the thickness is only ever a prop here, but
// it is the prop that regressed: the summary drew #88's thin pre-caps.
let ladderProps: {
    barHeight?: unknown; rungGap?: unknown; accentDone?: unknown;
} = {};
jest.mock("@/components/BrewStageLadder", () => {
    const actual = jest.requireActual("@/components/BrewStageLadder");
    const Ladder = actual.default;
    return {
        __esModule: true,
        ...actual,
        default: (props: Record<string, unknown>) => {
            ladderProps = props;
            return Ladder(props);
        }
    };
});

function pours(count: number): Pour[] {
    return Array.from({length: count}, (_, i) =>
        new Pour(i + 1, 40, 93, 40, AGITATION.ALL_OFF, POUR_PATTERN.CENTERED, 10));
}

const samples: BrewSample[] = [
    {at: 0, water: 0, cup: 0, pour: 1},
    {at: 60_000, water: 80, cup: 76, pour: 1}
];

async function draw(overrides: Partial<React.ComponentProps<typeof BrewSummary>> = {}) {
    Dimensions.set({screen: mockWindow, window: mockWindow});
    return renderWithProviders(
        <BrewSummary
            recipeName="Ethiopia Guji"
            hasStream={true}
            samples={samples}
            stages={pours(3)}
            accent={palette.brand}
            width={390}
            plannedSeconds={120}
            water={250}
            cup={244}
            seconds={126}
            activeIndex={2}
            stageWater={[40, 40, 40]}
            stalls={[[], [], []]}
            stagesUnavailable={false}
            {...overrides}
        />
    );
}

function pathPoints(path: string): {x: number; y: number}[] {
    return [...path.matchAll(/[ML]\s*([-\d.]+)\s+([-\d.]+)/g)]
        .map((match) => ({x: Number(match[1]), y: Number(match[2])}));
}

describe("BrewSummary", () => {
    it("draws the trace when the brew kept a stream", async () => {
        const {getByLabelText} = await draw({hasStream: true});
        expect(getByLabelText("Brew trace, 93 then 93 then 93 degrees")).toBeTruthy();
    });

    it("shows NO TRACE KEPT when there is no stream", async () => {
        const {getByText, queryByLabelText} = await draw({hasStream: false});
        expect(getByText("NO TRACE KEPT")).toBeTruthy();
        expect(queryByLabelText(/^Brew trace/)).toBeNull();
    });

    it("draws the ladder when stages are available", async () => {
        const {getByTestId} = await draw({stagesUnavailable: false});
        expect(getByTestId("ladder")).toBeTruthy();
    });

    it("shows the deleted-recipe note and no ladder when stages are unavailable", async () => {
        const {getByText, queryByTestId} = await draw({stagesUnavailable: true});
        expect(getByText(/recipe deleted/i)).toBeTruthy();
        expect(queryByTestId("ladder")).toBeNull();
    });

    it("renders the recipe name inside the captured subtree", async () => {
        await draw({recipeName: "Ethiopia Guji"});
        const capture = within(screen.getByTestId("brew-capture"));
        expect(capture.getByText("Ethiopia Guji")).toBeTruthy();
    });

    it("pads the captured area so the exported PNG has a margin", async () => {
        const {getByTestId} = await draw();
        const style = StyleSheet.flatten(
            getByTestId("brew-capture").props.style as StyleProp<ViewStyle>
        );
        expect(style?.backgroundColor).toBe(palette.base);
        // Screen padding (18) plus the export margin (12), pinned as a literal
        // so shrinking CAPTURE_MARGIN to 0 fails this test.
        expect(style?.padding).toBe(30);
    });

    it("draws the ladder with the thick, content-sized bands, not the old thin literals", async () => {
        // The bug: the summary drew barHeight 11 / rungGap 8, the pre-#88
        // values, so a brew watched live with thick bars reopened from history
        // thin. Pinned as integer literals: asserting against SUMMARY_BANDS
        // would still pass if the caps it derives from went to zero.
        await draw({stagesUnavailable: false});
        expect(ladderProps.barHeight).toBe(28);
        expect(ladderProps.rungGap).toBe(20);
    });

    it("keeps today's bands until anything has been measured", async () => {
        await draw({stagesUnavailable: false});

        expect(ladderProps.barHeight).toBe(28);
        expect(ladderProps.rungGap).toBe(20);
    });

    it("grows the rungs into the height the screen measured", async () => {
        const {getByTestId} = await draw({
            stagesUnavailable: false,
            availableHeight: 900
        });

        // The chrome above the ladder reports 300, leaving 600 - 2*30 of capture
        // padding for three stages: room for both bands to reach their ceilings.
        await act(async () => {
            fireEvent(getByTestId("summary-chrome"), "layout", {
                nativeEvent: {layout: {height: 300, width: 330, x: 0, y: 0}}
            });
        });

        expect(ladderProps.barHeight).toBe(44);
        expect(ladderProps.rungGap).toBe(34);
    });

    it("reserves a peek before sizing a measured viewport ladder", async () => {
        const {getByTestId} = await draw({
            stagesUnavailable: false,
            availableHeight: 600
        });

        await act(async () => {
            fireEvent(getByTestId("summary-chrome"), "layout", {
                nativeEvent: {layout: {height: 300, width: 330, x: 0, y: 0}}
            });
        });

        expect(ladderProps.barHeight).toBe(41);
        expect(ladderProps.rungGap).toBe(20);
    });

    it("leaves the measured ladder slot at auto height so tall ladders can scroll", async () => {
        const {getByTestId} = await draw({
            stages: pours(4),
            stageWater: [40, 40, 40, 40],
            stalls: [[], [], [], []],
            stagesUnavailable: false,
            availableHeight: 700
        });

        await act(async () => {
            fireEvent(getByTestId("summary-chrome"), "layout", {
                nativeEvent: {layout: {height: 420, width: 330, x: 0, y: 0}}
            });
        });

        const style = StyleSheet.flatten(
            getByTestId("summary-ladder-slot").props.style as StyleProp<ViewStyle>
        );
        expect(style?.height).toBeUndefined();
        expect(ladderProps.barHeight).toBe(28);
        expect(ladderProps.rungGap).toBe(20);
    });

    it("accents the ladder of a brew that reached its last stage", async () => {
        await draw({stagesUnavailable: false, activeIndex: 3});

        expect(ladderProps.accentDone).toBe(true);
    });

    it("leaves an aborted brew's ladder grey, so the stop still shows", async () => {
        await draw({stagesUnavailable: false, activeIndex: 1});

        expect(ladderProps.accentDone).toBe(false);
    });

    it("says when the machine ended the brew early", async () => {
        const r = await draw({note: "ENDED ON THE MACHINE"});

        expect(r.getByText("ENDED ON THE MACHINE")).toBeTruthy();
    });

    it("says nothing at all when the brew went to plan", async () => {
        const r = await draw({});

        expect(r.queryByTestId("brew-summary-note")).toBeNull();
    });

    it("draws the rate chart on the same time axis as the trace", async () => {
        await draw({
            plannedSeconds: 50,
            samples: [
                {at: 0, water: 0, cup: 0, pour: 1},
                {at: 90_000, water: 120, cup: 90, pour: 1}
            ],
            bypass: {volume: 30, temperature: 85, delivered: 30,
                     startedAt: null, state: "done"},
            rateSeries: [
                {at: 89_900, cup: 1.6, water: 3.2},
                {at: 90_000, cup: 1.7, water: 3.2}
            ]
        });

        expect(screen.getByTestId("rate-chart")).toBeTruthy();
        const traceX = pathPoints(screen.getByTestId("trace-water").props.d as string)[1].x;
        const rateX = pathPoints(screen.getByTestId("rate-chart-water").props.d as string)[1].x;
        expect(rateX).toBeCloseTo(traceX, 1);
    });

    it("gives a drawable rate chart the shared bottom gap", async () => {
        await draw({
            rateSeries: [
                {at: 59_900, cup: 1.6, water: 3.2},
                {at: 60_000, cup: 1.7, water: 3.2}
            ]
        });

        const style = StyleSheet.flatten(
            screen.getByTestId("rate-chart-slot").props.style as StyleProp<ViewStyle>
        );
        // The chart should breathe like the trace above it, not collapse onto
        // the figure rows below. Pinned as a literal so a zero gap fails here.
        expect(style?.marginBottom).toBe(12);
    });

    it("gives a drawable rate chart the larger top gap", async () => {
        await draw({
            rateSeries: [
                {at: 59_900, cup: 1.6, water: 3.2},
                {at: 60_000, cup: 1.7, water: 3.2}
            ]
        });

        const style = StyleSheet.flatten(
            screen.getByTestId("rate-chart-slot").props.style as StyleProp<ViewStyle>
        );
        // The trace's legend row is text, so it needs more air above the
        // rate chart than the figures need below it.
        expect(style?.marginTop).toBe(18);
    });

    it("draws the story trace and rate chart at the heights it was handed", async () => {
        const traceHeight = 118;
        const rateHeight = 101;
        await draw({
            traceHeight,
            rateHeight,
            rateSeries: [
                {at: 59_900, cup: 1.6, water: 3.2},
                {at: 60_000, cup: 1.7, water: 3.2}
            ]
        });

        expect(screen.getByLabelText("Brew trace, 93 then 93 then 93 degrees")
            .props.height).toBe(traceHeight - rowHeight(LEGEND_SIZE));
        expect(screen.getByLabelText("Brew rate chart").props.height).toBe(rateHeight);
    });

    it("lets story charts bleed wider than the padded text content", async () => {
        const width = 390;
        const capturePadding = 7;
        const textWidth = storyTextContentWidth(width, capturePadding);
        await draw({
            width,
            capturePadding,
            chartWidth: storyChartWidth(width),
            rateSeries: [
                {at: 59_900, cup: 1.6, water: 3.2},
                {at: 60_000, cup: 1.7, water: 3.2}
            ]
        });

        expect(screen.getByLabelText("Brew trace, 93 then 93 then 93 degrees").props.width)
            .toBeGreaterThan(textWidth);
        expect(screen.getByLabelText("Brew rate chart").props.width).toBeGreaterThan(textWidth);
    });

    it("passes delay and grind figures into the captured summary", async () => {
        await draw({
            drawdown: 32,
            drawdownRate: 2.1,
            delay: 5,
            grind: {kind: "dial", dial: 53, recipe: 60}
        });

        expect(screen.getByText("0:32")).toBeTruthy();
        expect(screen.getByText("2.1")).toBeTruthy();
        expect(screen.getByText("G/S")).toBeTruthy();
        expect(screen.getByText("+5")).toBeTruthy();
        expect(screen.getByText("53")).toBeTruthy();
        expect(screen.getByText("RECIPE 60")).toBeTruthy();
    });

    it("keeps the rate chart hidden for a swept record even if a caller hands over rates", async () => {
        await draw({
            hasStream: false,
            rateSeries: [
                {at: 59_900, cup: 1.6, water: 3.2},
                {at: 60_000, cup: 1.7, water: 3.2}
            ]
        });

        expect(screen.queryByTestId("rate-chart")).toBeNull();
    });

    it("leaves no rate chart wrapper when the chart cannot draw", async () => {
        await draw({rateSeries: [{at: 60_000, cup: 1.7, water: 3.2}]});

        expect(screen.queryByTestId("rate-chart")).toBeNull();
        expect(screen.queryByTestId("rate-chart-slot")).toBeNull();
    });
});

describe("BrewSummary's recipe name", () => {
    it("can show its own end rather than ellipsising it", async () => {
        // A long name in a fixed-width capture had no second line to fall to,
        // so the only way to read the end of it was to let it travel.
        const {getByTestId} = await draw({recipeName: "Yirgacheffe Konga Natural"});
        expect(getByTestId("brew-summary-name")).toBeTruthy();
    });

    it("holds the name still while the screen is being photographed", async () => {
        // A capture taken mid-travel freezes the name half-scrolled in a PNG
        // that can never scroll back.
        await draw({nameStill: true});
        expect(marqueeProps.paused).toBe(true);
    });

    it("lets the name travel the rest of the time", async () => {
        await draw();
        expect(marqueeProps.paused).toBe(false);
    });
});

it("carries the bypass into the ladder, the trace and the figures", async () => {
    await renderWithProviders(
        <BrewSummary
            recipeName="Ethiopia Guji"
            hasStream={true}
            samples={samples}
            stages={pours(2)}
            accent={palette.brand}
            width={390}
            plannedSeconds={120}
            water={240}
            cup={244}
            seconds={126}
            activeIndex={2}
            stageWater={[40, 40]}
            stalls={[[], []]}
            stagesUnavailable={false}
            bypass={{volume: 5, temperature: 85, delivered: 5,
                     startedAt: 183, state: "done"}}
        />
    );
    expect(screen.getByTestId("rung-bypass")).toBeTruthy();
    expect(screen.getByTestId("trace-bypass")).toBeTruthy();
    expect(screen.getByText("+5")).toBeTruthy();
});

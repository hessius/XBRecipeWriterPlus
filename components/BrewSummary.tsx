import React, {useState} from "react";
import {StyleSheet, View} from "react-native";
import {Text, YStack} from "tamagui";

import BrewFigures from "@/components/BrewFigures";
import BrewRateChart from "@/components/BrewRateChart";
import BrewStageLadder from "@/components/BrewStageLadder";
import BrewTrace from "@/components/BrewTrace";
import MarqueeText from "@/components/MarqueeText";
import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import {SCREEN_PADDING} from "@/constants/layout";
import {summaryBands} from "@/library/brew/bands";
import {traceAxisFor} from "@/library/brew/brewShape";
import type {BrewSample} from "@/library/brew/BrewRecord";
import type {BypassView} from "@/library/brew/bypassState";
import type {GrindFigure} from "@/library/brew/dialAfterBrew";
import type {FlowPoint} from "@/library/brew/flowRate";
import {
    hasDrawableRateRun,
    RATE_BOTTOM_GAP,
    RATE_HEIGHT,
    TRACE_HEIGHT,
    RATE_TOP_GAP
} from "@/library/brew/rateChartGeometry";
import type {Stall} from "@/library/brew/stalls";
import type Pour from "@/library/Pour";

export {TRACE_HEIGHT};
/** Enough of the next scroll section to show that more than the summary exists. */
export const SUMMARY_SCROLL_PEEK = 44;

/**
 * The margin around the captured content, in points.
 *
 * A ViewShot renders only what is inside it, so the exported PNG had no
 * breathing room at all. The figures sat hard against the edge. This is added
 * to the screen padding so the image has a border of its own.
 */
export const CAPTURE_MARGIN = 12;

export function summaryLadderHeight(
    availableHeight: number,
    chromeHeight: number,
    capturePadding: number,
    ladderTopGap: number
): number {
    if (availableHeight === 0 || chromeHeight === 0) return 0;
    return Math.max(
        0,
        availableHeight - chromeHeight - capturePadding * 2 - ladderTopGap - SUMMARY_SCROLL_PEEK
    );
}

type Props = {
    recipeName: string;
    hasStream: boolean;
    samples: BrewSample[];
    stages: Pour[];
    accent: string;
    width: number;
    plannedSeconds: number;
    water: number;
    cup: number;
    seconds: number;
    activeIndex: number | null;
    stageWater: number[];
    stalls: Stall[][];
    /** True when the recipe is gone and no stage snapshot was kept. */
    stagesUnavailable: boolean;
    /** A short Doto line about how the brew ended, when there is one to make. */
    note?: string;
    /**
     * Holds the recipe name still at its resting position.
     *
     * Set while the screen is being photographed: a capture taken mid-travel
     * freezes the name half-scrolled in a PNG that can never scroll back.
     */
    nameStill?: boolean;
    /** The stage whose detail is open. */
    selectedIndex?: number | null;
    /**
     * Absent leaves the figure inert, which is what the export wants, since a
     * captured PNG cannot be tapped and a shaded band in it would only puzzle.
     */
    onSelectStage?: (index: number) => void;
    /** The bypass this brew had, if any. Absent on every record without one. */
    bypass?: BypassView;
    /**
     * Seconds of drawdown, or null when there are none to report.
     *
     * Null on the live screen, where the brew has not finished drawing down
     * yet and any figure would be a running clock the user would read as final.
     */
    drawdown?: number | null;
    /**
     * The retained stream's fitted flow rates.
     *
     * Undefined or empty draws no chart, which is what a swept record wants.
     */
    rateSeries?: FlowPoint[];
    /** Average drawdown flow rate, or null when the record cannot say. */
    drawdownRate?: number | null;
    /** Seconds late to the pour end, or null when nobody can say. */
    delay?: number | null;
    /** The confirmed machine grind dial, and recipe grind when it differed. */
    grind?: GrindFigure | null;
    /**
     * The capture target's id.
     *
     * Defaults to the one the in-place export photographs. The story card
     * renders a second summary while the record screen's own is still
     * mounted, and two nodes answering to `brew-capture` is how a capture
     * ends up photographing whichever the renderer found first.
     */
    testID?: string;
    /**
     * The height the summary may draw in, from the screen's scroll viewport.
     *
     * Absent or zero keeps the frozen bands, which is what a caller that
     * has measured nothing gets. A measured summary uses the same floors and
     * ceilings the live screen obeys.
     */
    availableHeight?: number;
    traceHeight?: number;
    rateHeight?: number;
    rateTopGap?: number;
    rateBottomGap?: number;
    capturePadding?: number;
    ladderTopGap?: number;
    storyBands?: {barHeight: number; rungGap: number};
    showBypassBadge?: boolean;
    showRateChart?: boolean;
    showStages?: boolean;
    textScale?: number;
    chartWidth?: number;
};

/*
 * The summary draws no target line, so its trace has no plan to size itself
 * against. One value feeds both the `BrewTrace` and the axis handed to it, so
 * the trace cannot be given a plan the axis has not accounted for.
 */
const NO_PLAN: Pour[] = [];

/**
 * The shared brew summary: recipe name, trace, figures and stage ladder.
 *
 * This is the single source of truth for how a finished brew looks, both on
 * the record screen and, captured to a PNG, in the export. Everything worth
 * sharing lives inside here, including its own background and padding, because
 * a capture inherits neither margin nor background from its ancestors: outside
 * it, the PNG came out edge-to-edge on white, which made the dot-matrix
 * figures near-invisible.
 */
export default function BrewSummary({
    recipeName, hasStream, samples, stages, accent, width, plannedSeconds,
    water, cup, seconds, activeIndex, stageWater, stalls, stagesUnavailable,
    note, nameStill = false, selectedIndex = null, onSelectStage, bypass,
    drawdown = null, rateSeries, drawdownRate = null, delay = null, grind = null,
    availableHeight = 0,
    traceHeight = TRACE_HEIGHT, rateHeight = RATE_HEIGHT, rateTopGap = RATE_TOP_GAP,
    rateBottomGap = RATE_BOTTOM_GAP,
    capturePadding = SCREEN_PADDING + CAPTURE_MARGIN, ladderTopGap = 12,
    storyBands, showBypassBadge = true, showRateChart = true, showStages = true,
    textScale = 1,
    chartWidth,
    testID = "brew-capture"
}: Props) {
    // The drawable width inside the capture's own padding.
    const traceWidth = width - capturePadding * 2;
    const bleedChartWidth = chartWidth ?? traceWidth;
    const chartBleed = Math.max(0, (bleedChartWidth - traceWidth) / 2);
    const chartSlotStyle = chartBleed > 0
        ? {marginHorizontal: -chartBleed}
        : undefined;
    const traceAxis = traceAxisFor(NO_PLAN, samples, plannedSeconds, bypass);
    const rates = rateSeries ?? [];
    const drawsRateChart = hasStream && showRateChart && hasDrawableRateRun(rates);

    // Measured from an onLayout event, never an effect. Everything above the
    // ladder is one subtree, so its height is one reading; the ladder's own
    // height is excluded, which is what stops this feeding back on itself.
    const [chromeHeight, setChromeHeight] = useState(0);
    const ladderHeight = summaryLadderHeight(
        availableHeight,
        chromeHeight,
        capturePadding,
        ladderTopGap
    );
    const bands = storyBands ?? summaryBands(ladderHeight, stages.length);

    return (
        <View testID={testID} style={[styles.capture, {padding: capturePadding}]}>
            <View
                testID="summary-chrome"
                onLayout={(e) => setChromeHeight(e.nativeEvent.layout.height)}
            >
            {/* A truncated name is a name the user cannot read, and there is
                nowhere here to put a second line. The line rests, travels to
                its end, rests again and comes back, and does nothing at all
                when it already fits. */}
            <MarqueeText testID="brew-summary-name" paused={nameStill}>
                <DotMatrixText fontSize={13 * textScale} weight="bold"
                               letterSpacing={1.4 * textScale}
                               color={palette.dim}
                               style={{marginBottom: 12 * textScale}}>
                    {recipeName}
                </DotMatrixText>
            </MarqueeText>

            {hasStream ? (
                <View testID="trace-chart-slot" style={chartSlotStyle}>
                <BrewTrace
                    pours={NO_PLAN}
                    samples={samples}
                    accent={accent}
                    width={bleedChartWidth}
                    height={traceHeight}
                    plannedSeconds={plannedSeconds}
                    planOpacity={0}
                    planColor={palette.muted}
                    planDashed={false}
                    stages={stages}
                    selectedIndex={selectedIndex}
                    onSelectStage={onSelectStage}
                    bypass={bypass}
                    legendInset={chartBleed}
                    axis={traceAxis}
                />
                </View>
            ) : (
                <YStack height={traceHeight} alignItems="center"
                        justifyContent="center">
                    <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.6}
                                   color={palette.muted}>
                        NO TRACE KEPT
                    </DotMatrixText>
                    <Text color={palette.muted} fontSize={12} marginTop="$2"
                          textAlign="center">
                        No trace was kept for this brew.
                    </Text>
                </YStack>
            )}

            {drawsRateChart && (
                <View testID="rate-chart-slot"
                      style={[
                          {marginTop: rateTopGap, marginBottom: rateBottomGap},
                          chartSlotStyle
                      ]}>
                <BrewRateChart
                    series={rates}
                    accent={accent}
                    width={bleedChartWidth}
                    maxT={traceAxis.maxT}
                    height={rateHeight}
                    labelInset={chartBleed}
                />
                </View>
            )}

            {note !== undefined && (
                <DotMatrixText testID="brew-summary-note" fontSize={11}
                               weight="bold" letterSpacing={1.6}
                               color={palette.warn} style={{marginBottom: 8}}>
                    {note}
                </DotMatrixText>
            )}

            <BrewFigures
                water={water}
                cup={cup}
                seconds={seconds}
                accent={accent}
                bypass={showBypassBadge ? bypass?.delivered : undefined}
                drawdown={drawdown}
                drawdownRate={drawdownRate}
                delay={delay}
                grind={grind}
                contentWidth={traceWidth}
                textScale={textScale}
            />
            </View>
            {/* Spaced by hand: the capture has no gap, so the trace and the
                figures stay flush the way they were on screen. */}
            {showStages && (
            <View testID="summary-ladder-slot"
                  style={{marginTop: ladderTopGap}}>
            {stagesUnavailable ? (
                <DotMatrixText fontSize={11} letterSpacing={1.2} color={palette.muted}>
                    Recipe deleted. Stages not available.
                </DotMatrixText>
            ) : (
                <BrewStageLadder
                    pours={stages}
                    accent={accent}
                    activeIndex={activeIndex}
                    // From bands.ts, not literals: the live screen sizes its
                    // ladder from a measured flex height, but a summary renders
                    // inside a ViewShot with fill={false} and has none. The
                    // soft-cap band set is now the floor rather than the whole
                    // answer: a summary with a measured height grows its rungs
                    // up to the same ceilings the live ladder obeys.
                    barHeight={bands.barHeight}
                    rungGap={bands.rungGap}
                    // A brew that reached its last stage has nothing left for
                    // grey to distinguish, so it wears the recipe's colour. An
                    // aborted one keeps grey: that is what makes the stage it
                    // stopped on readable.
                    accentDone={activeIndex === stages.length}
                    scrolls={false}
                    fill={false}
                    stageWater={stageWater}
                    stalls={stalls}
                    pauseElapsed={0}
                    selectedIndex={selectedIndex}
                    onSelectStage={onSelectStage}
                    bypass={bypass}
                />
            )}
            </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    /**
     * The captured subtree needs its own background and padding: a ViewShot
     * renders what is inside it, so anything the screen supplies from further
     * out is simply not in the PNG. The extra margin gives the image a border.
     */
    capture: {
        backgroundColor: palette.base
    }
});

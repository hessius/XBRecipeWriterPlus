import React from "react";
import {PixelRatio, View} from "react-native";
import Svg, {G, Path, Text as SvgText} from "react-native-svg";

import {dotMatrixSvgProps, drawnFontSize} from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import {type Box, type Point, toMonotonePath} from "@/library/brew/brewShape";
import {maxRateOf, type FlowPoint} from "@/library/brew/flowRate";
import {
    contiguousRateRuns,
    hasDrawableRateRun,
    RATE_HEIGHT,
    RATE_LABEL_SIZE,
    rateChartLabelRowHeight,
    rateChartPlotTop
} from "@/library/brew/rateChartGeometry";
import {channelStyle, type Role} from "@/library/brew/traceStyle";

/**
 * Both channels' rate against real seconds, drawn under the volume trace.
 *
 * This is its own chart rather than a third line on the trace. The trace axis
 * is millilitres and this one is grams or millilitres per second, so sharing an
 * axis would force one picture onto units it does not own.
 */
/** Never scale a nearly flat brew up into a mountain range. */
const MIN_AXIS = 4;
export {RATE_HEIGHT};

type Props = {
    series: FlowPoint[];
    accent: string;
    width: number;
    /** The same real-seconds horizontal extent used by the BrewTrace above it. */
    maxT: number;
    maxRate?: number;
    height?: number;
    role?: Role;
};

function channelPoints(run: FlowPoint[], of: "cup" | "water"): Point[] {
    return run.map((point) => ({
        t: point.at / 1000,
        v: Math.max(0, point[of])
    }));
}

function channelPath(runs: FlowPoint[][], of: "cup" | "water", box: Box): string {
    return runs
        .map((run) => toMonotonePath(channelPoints(run, of), box))
        .filter((path) => path !== "")
        .join(" ");
}

/**
 * The rate chart for a retained brew stream.
 *
 * Empty, single point and all-gap series return nothing. An isolated rate
 * point cannot draw a line, and a frame with no line would look like a brew
 * where the bed never flowed rather than a chart the stream cannot support.
 */
export default function BrewRateChart({
    series, accent, width, maxT, maxRate, height = RATE_HEIGHT, role = "subject"
}: Props) {
    if (!hasDrawableRateRun(series)) return null;

    const waterStyle = channelStyle("water", {accent, role});
    const cupStyle = channelStyle("cup", {accent, role});
    const verticalInset = Math.max(waterStyle.strokeWidth, cupStyle.strokeWidth) / 2;
    const fontScale = PixelRatio.getFontScale();
    const labelSize = drawnFontSize(RATE_LABEL_SIZE);
    const labelRow = rateChartLabelRowHeight(fontScale);
    const plotTop = rateChartPlotTop(fontScale, verticalInset);
    const box: Box = {
        width,
        height: Math.max(height - labelRow - verticalInset * 2, 0),
        maxT,
        maxV: Math.max(MIN_AXIS, maxRate ?? maxRateOf(series))
    };
    if (box.width <= 0 || box.height <= 0 || box.maxT <= 0) return null;

    const runs = contiguousRateRuns(series);
    const waterPath = channelPath(runs, "water", box);
    const cupPath = channelPath(runs, "cup", box);

    return (
        <View testID="rate-chart" pointerEvents="none">
            <Svg
                width={width}
                height={height}
                style={{overflow: "visible"}}
                accessibilityRole="image"
                accessibilityLabel="Brew rate chart"
            >
                <SvgText
                    testID="rate-chart-label"
                    x={0}
                    y={labelSize}
                    fill={palette.dim}
                    {...dotMatrixSvgProps({fontSize: RATE_LABEL_SIZE, letterSpacing: 1.2})}
                >
                    FLOW RATE
                </SvgText>
                <G testID="rate-chart-plot" y={plotTop}>
                    {waterPath !== "" && (
                        <Path
                            testID="rate-chart-water"
                            d={waterPath}
                            fill="none"
                            {...waterStyle}
                        />
                    )}
                    {cupPath !== "" && (
                        <Path
                            testID="rate-chart-cup"
                            d={cupPath}
                            fill="none"
                            {...cupStyle}
                        />
                    )}
                </G>
            </Svg>
        </View>
    );
}

import React, {useId} from "react";
import {PixelRatio, View} from "react-native";
import Svg, {Defs, G, LinearGradient, Path, Stop, Text as SvgText} from "react-native-svg";

import {dotMatrixSvgProps, drawnFontSize} from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import {type Box, type Point, toMonotonePath} from "@/library/brew/brewShape";
import {maxRateOf, type FlowPoint} from "@/library/brew/flowRate";
import {
    hasDrawableRateRun,
    RATE_HEIGHT,
    RATE_LABEL_SIZE,
    rateChartLabelRowHeight,
    rateChartPlotTop,
    rateRunsOf
} from "@/library/brew/rateChartGeometry";
import {channelStyle, type Role} from "@/library/brew/traceStyle";
import {timeFlowGradient} from "@/library/brew/timeFlowTail";

/**
 * Both channels' rate against real seconds, drawn under the volume trace.
 *
 * This is its own chart rather than a third line on the trace. The trace axis
 * is millilitres and this one is grams or millilitres per second, so sharing an
 * axis would force one picture onto units it does not own.
 */
/** Never scale a nearly flat brew up into a mountain range. */
const MIN_AXIS = 4;
const CUP_DOT_PERIOD = 4;
const CUP_DOT_MARK = 1;
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
    /**
     * Paint rate strokes with a left-to-right opacity tail.
     *
     * Off by default so analytical screens keep their flat chart grammar; the
     * story card opts in for a still image that should suggest elapsed time.
     */
    emphasizeTimeFlow?: boolean;
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

function chartPoint(point: Point, box: Box): {x: number; y: number} {
    const x = (point.t / box.maxT) * box.width;
    const y = box.height - (point.v / box.maxV) * box.height;
    return {
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10
    };
}

function cupDotPath(runs: FlowPoint[][], box: Box): string {
    const dots: string[] = [];
    const addDot = ({x, y}: {x: number; y: number}) => {
        dots.push(`M${Math.round((x - CUP_DOT_MARK / 2) * 10) / 10} ${y} l${CUP_DOT_MARK} 0`);
    };

    for (const run of runs) {
        const points = channelPoints(run, "cup");
        const first = points[0];
        const last = points[points.length - 1];
        if (first === undefined || last === undefined || points.length < 2) continue;

        const firstX = chartPoint(first, box).x;
        const lastX = chartPoint(last, box).x;
        addDot(chartPoint(first, box));
        let segment = 1;
        for (
            let x = firstX + CUP_DOT_PERIOD;
            x < lastX;
            x += CUP_DOT_PERIOD
        ) {
            const t = (x / box.width) * box.maxT;
            while (segment < points.length && points[segment].t < t) segment += 1;
            const before = points[segment - 1];
            const after = points[segment];
            if (before === undefined || after === undefined) continue;
            const span = after.t - before.t;
            const progress = span <= 0 ? 0 : (t - before.t) / span;
            const point = {
                t,
                v: before.v + (after.v - before.v) * progress
            };
            const drawn = chartPoint(point, box);
            addDot(drawn);
        }
        if (lastX !== firstX) addDot(chartPoint(last, box));
    }
    return dots.join(" ");
}

/**
 * The rate chart for a retained brew stream.
 *
 * Empty, single point and all-gap series return nothing. An isolated rate
 * point cannot draw a line, and a frame with no line would look like a brew
 * where the bed never flowed rather than a chart the stream cannot support.
 */
export default function BrewRateChart({
    series, accent, width, maxT, maxRate, height = RATE_HEIGHT, role = "subject",
    emphasizeTimeFlow = false
}: Props) {
    const id = useId().replace(/[^a-zA-Z0-9]/g, "");
    const waterCometId = `rate-water-comet-${id}`;
    const cupCometId = `rate-cup-comet-${id}`;
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

    const runs = rateRunsOf(series);
    const waterPath = channelPath(runs, "water", box);
    const cupPath = cupDotPath(runs, box);
    const cupDotStyle = {
        ...cupStyle,
        strokeDasharray: undefined,
        strokeLinejoin:  undefined
    };
    const waterStrokeStyle = {
        ...waterStyle,
        stroke: emphasizeTimeFlow ? `url(#${waterCometId})` : waterStyle.stroke
    };
    const cupStrokeStyle = {
        ...cupDotStyle,
        stroke: emphasizeTimeFlow ? `url(#${cupCometId})` : cupDotStyle.stroke
    };
    const comet = timeFlowGradient(box.width);

    return (
        <View testID="rate-chart" pointerEvents="none">
            <Svg
                width={width}
                height={height}
                style={{overflow: "visible"}}
                accessibilityRole="image"
                accessibilityLabel="Brew rate chart"
            >
                {emphasizeTimeFlow && (
                    <Defs>
                        <LinearGradient
                            id={waterCometId}
                            gradientUnits={comet.gradientUnits}
                            x1={comet.x1}
                            y1={comet.y1}
                            x2={comet.x2}
                            y2={comet.y2}
                        >
                            <Stop offset={comet.start.offset}
                                  stopColor={waterStyle.stroke}
                                  stopOpacity={comet.start.opacity} />
                            <Stop offset={comet.end.offset}
                                  stopColor={waterStyle.stroke}
                                  stopOpacity={comet.end.opacity} />
                        </LinearGradient>
                        <LinearGradient
                            id={cupCometId}
                            gradientUnits={comet.gradientUnits}
                            x1={comet.x1}
                            y1={comet.y1}
                            x2={comet.x2}
                            y2={comet.y2}
                        >
                            <Stop offset={comet.start.offset}
                                  stopColor={cupDotStyle.stroke}
                                  stopOpacity={comet.start.opacity} />
                            <Stop offset={comet.end.offset}
                                  stopColor={cupDotStyle.stroke}
                                  stopOpacity={comet.end.opacity} />
                        </LinearGradient>
                    </Defs>
                )}
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
                            {...waterStrokeStyle}
                        />
                    )}
                    {cupPath !== "" && (
                        <Path
                            testID="rate-chart-cup"
                            d={cupPath}
                            fill="none"
                            {...cupStrokeStyle}
                        />
                    )}
                </G>
            </Svg>
        </View>
    );
}

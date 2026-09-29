import React from "react";
import {View} from "react-native";
import Svg, {G, Path} from "react-native-svg";

import {type Box, type Point, toPath} from "@/library/brew/brewShape";
import {maxRateOf, type FlowPoint} from "@/library/brew/flowRate";
import {channelStyle} from "@/library/brew/traceStyle";

/**
 * Both channels' rate against real seconds, drawn under the volume trace.
 *
 * This is its own chart rather than a third line on the trace. The trace axis
 * is millilitres and this one is grams or millilitres per second, so sharing an
 * axis would force one picture onto units it does not own.
 */
export const RATE_HEIGHT = 84;

/** Never scale a nearly flat brew up into a mountain range. */
const MIN_AXIS = 4;

/**
 * The recorder samples at about 10 Hz, and every stream fixture that models
 * live data uses 100 ms frames. A 150 ms allowance admits normal timer jitter,
 * while a single omitted rate point at the ordinary cadence produces a
 * 200 ms hole and splits the path.
 */
export const RATE_ADJACENT_MS = 150;

type Props = {
    series: FlowPoint[];
    accent: string;
    width: number;
    /** The same real-seconds horizontal extent used by the BrewTrace above it. */
    maxT: number;
    maxRate?: number;
};

function contiguousRuns(series: FlowPoint[]): FlowPoint[][] {
    const runs: FlowPoint[][] = [];
    let current: FlowPoint[] = [];

    for (const point of series) {
        const previous = current[current.length - 1];
        if (previous !== undefined && point.at - previous.at > RATE_ADJACENT_MS) {
            runs.push(current);
            current = [];
        }
        current.push(point);
    }
    if (current.length > 0) runs.push(current);
    return runs;
}

function channelPoints(run: FlowPoint[], of: "cup" | "water"): Point[] {
    return run.map((point) => ({
        t: point.at / 1000,
        v: Math.max(0, point[of])
    }));
}

function channelPath(runs: FlowPoint[][], of: "cup" | "water", box: Box): string {
    return runs
        .map((run) => toPath(channelPoints(run, of), box))
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
export default function BrewRateChart({series, accent, width, maxT, maxRate}: Props) {
    if (series.length < 2) return null;

    const waterStyle = channelStyle("water", {accent});
    const cupStyle = channelStyle("cup", {accent});
    const verticalInset = Math.max(waterStyle.strokeWidth, cupStyle.strokeWidth) / 2;
    const box: Box = {
        width,
        height: Math.max(RATE_HEIGHT - verticalInset * 2, 0),
        maxT,
        maxV: Math.max(MIN_AXIS, maxRate ?? maxRateOf(series))
    };
    if (box.width <= 0 || box.height <= 0 || box.maxT <= 0) return null;

    const runs = contiguousRuns(series);
    const waterPath = channelPath(runs, "water", box);
    const cupPath = channelPath(runs, "cup", box);
    if (waterPath === "" && cupPath === "") return null;

    return (
        <View testID="rate-chart" pointerEvents="none">
            <Svg
                width={width}
                height={RATE_HEIGHT}
                style={{overflow: "visible"}}
                accessibilityRole="image"
                accessibilityLabel="Brew rate chart"
            >
                <G y={verticalInset}>
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

import React from "react";
import Svg, {Path} from "react-native-svg";

import type Pour from "@/library/Pour";
import {onAccent} from "@/constants/colors";

function round(value: number): number {
    return Math.round(value * 10) / 10;
}

/**
 * The silhouette of a brew: cumulative water over time, stepped.
 *
 * Each pour contributes a rise followed by a flat, so pauses read as plateaus.
 * Time is divided evenly between pours rather than scaled by pause duration —
 * the shape is an identifying mark, not a chart, and even division keeps short
 * pours visible.
 */
export function buildProfilePath(pours: Pour[], width: number, height: number): string {
    if (pours.length === 0) {
        return "";
    }

    const total = pours.reduce((sum, pour) => sum + Math.max(pour.volume, 0), 0);
    const points: [number, number][] = [[0, height]];
    let poured = 0;

    for (let i = 0; i < pours.length; i++) {
        // A recipe whose pours are all zero has no shape. Drawing it flat along
        // the bottom is honest, and more importantly it is not NaN.
        const before = total > 0 ? poured / total : 0;
        poured += Math.max(pours[i].volume, 0);
        const after = total > 0 ? poured / total : 0;

        const riseStart = (i / pours.length) * width;
        const riseEnd = ((i + 0.62) / pours.length) * width;
        const flatEnd = ((i + 1) / pours.length) * width;

        points.push([riseStart, height - before * height]);
        points.push([riseEnd, height - after * height]);
        points.push([flatEnd, height - after * height]);
    }

    return "M" + points.map(([x, y]) => `${round(x)} ${round(y)}`).join(" L");
}

type Props = {
    pours: Pour[];
    width: number;
    height: number;
    stroke?: string;
    fill?: string;
    strokeWidth?: number;
    testID?: string;
};

/**
 * Draws a pour schedule. Knows nothing about cards — the caller supplies the
 * colours, so the same component serves an accent-filled card and a dark row.
 */
export default function PourProfile({
    pours,
    width,
    height,
    stroke = onAccent.profileStroke,
    fill = onAccent.profileFill,
    strokeWidth = 1.6,
    testID
}: Props) {
    const path = buildProfilePath(pours, width, height);
    if (path === "") {
        return null;
    }

    return (
        <Svg testID={testID} width={width} height={height}
             viewBox={`0 0 ${width} ${height}`}>
            <Path d={`${path} L${round(width)} ${round(height)} Z`} fill={fill}/>
            <Path d={path} fill="none" stroke={stroke} strokeWidth={strokeWidth}
                  strokeLinejoin="round"/>
        </Svg>
    );
}

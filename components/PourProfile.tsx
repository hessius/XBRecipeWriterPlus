import React, {useId} from "react";
import Svg, {Circle, ClipPath, Defs, Path, Pattern, Rect} from "react-native-svg";

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

    // Volume defaults to -1 on Pour, meaning unset, and a negative contribution
    // would push the curve below its own baseline and outside the viewBox.
    const volumeOf = (pour: Pour) => Math.max(pour.volume, 0);

    const total = pours.reduce((sum, pour) => sum + volumeOf(pour), 0);
    const points: [number, number][] = [[0, height]];
    let poured = 0;

    for (let i = 0; i < pours.length; i++) {
        poured += volumeOf(pours[i]);
        // A recipe whose pours are all zero has no shape. Drawing it flat along
        // the bottom is honest, and more importantly it is not NaN.
        const after = total > 0 ? poured / total : 0;

        const riseEnd = ((i + 0.62) / pours.length) * width;
        const flatEnd = ((i + 1) / pours.length) * width;

        // The rise starts where the previous pour's plateau ended, which is
        // already the last point — at i = 0 that is the seed. Emitting it again
        // would add a zero-length segment per pour and about a third more path
        // data for identical geometry.
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
    /** The flat fill under the curve, used when `dotted` is false. */
    fill?: string;
    /** The colour of the dots, used when `dotted` is true. */
    dot?: string;
    /** Fill the area with a screen of dots rather than a flat tint. */
    dotted?: boolean;
    strokeWidth?: number;
    testID?: string;
};

const PROFILE_STROKE_WIDTH = 1.6;

/**
 * The cell the fill's dots sit on, and their diameter as a fraction of it.
 *
 * The same relationship the icons are drawn with, a little heavier: an icon is
 * read as a shape, whereas this is read as a surface, and at 0.36 the fill
 * dissolved into a haze at arm's length.
 */
const DOT_CELL = 6;
const DOT_RATIO = 0.4;

/**
 * How far the profile's stroke bleeds past its geometry on every side.
 *
 * The card offsets the drawing by this so the baseline and the closing plateau
 * sit on the card's own edges: the profile is a background mark, and a gap
 * along two edges reads as misalignment rather than as margin. The card clips,
 * so the outer half of those strokes is simply not drawn.
 */
export const PROFILE_BLEED = PROFILE_STROKE_WIDTH / 2;

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
    dot = onAccent.profileDot,
    dotted = false,
    strokeWidth = PROFILE_STROKE_WIDTH,
    testID
}: Props) {
    // SVG ids are resolved document-wide, so a fixed one would leave every card
    // in a list pointing at whichever profile mounted last. The punctuation React
    // puts in its ids is not valid in an id used from a url() reference.
    const id = useId().replace(/[^a-zA-Z0-9]/g, "");
    const path = buildProfilePath(pours, width, height);
    if (path === "") {
        return null;
    }

    // The path touches y = 0 and y = height exactly, so a viewBox flush to the
    // geometry clips half the stroke off the opening baseline and the closing
    // plateau — the two most prominent runs of the mark, which would then render
    // at half the weight of the diagonals. Padding the viewBox by half a stroke
    // fixes that while keeping buildProfilePath and its tests in geometry units.
    //
    // The element is grown to match. An SVG whose aspect ratio differs from its
    // viewBox's is fitted inside it and centred, so padding the viewBox alone
    // inset the drawing horizontally while it still filled the height.
    const bleed = strokeWidth / 2;
    const viewBox = [-bleed, -bleed, width + strokeWidth, height + strokeWidth].join(" ");

    const area = `${path} L${round(width)} ${round(height)} Z`;
    const radius = (DOT_CELL * DOT_RATIO) / 2;

    if (!dotted) {
        return (
            <Svg testID={testID} width={width + strokeWidth} height={height + strokeWidth}
                 viewBox={viewBox}>
                <Path testID="profile-wash" d={area} fill={fill}/>
                <Path d={path} fill="none" stroke={stroke} strokeWidth={strokeWidth}
                      strokeLinejoin="round"/>
            </Svg>
        );
    }

    return (
        <Svg testID={testID} width={width + strokeWidth} height={height + strokeWidth}
             viewBox={viewBox}>
            <Defs>
                <ClipPath id={`${id}clip`}>
                    <Path d={area}/>
                </ClipPath>
                {/* Alternate rows are offset by half a cell. A square grid reads
                    as a page of holes; the stagger is what makes it a screen. */}
                <Pattern id={`${id}dots`} width={DOT_CELL} height={DOT_CELL}
                         patternUnits="userSpaceOnUse">
                    <Circle testID="profile-dot" cx={DOT_CELL / 4} cy={DOT_CELL / 4}
                            r={radius} fill={dot}/>
                    <Circle testID="profile-dot" cx={(DOT_CELL * 3) / 4}
                            cy={(DOT_CELL * 3) / 4} r={radius} fill={dot}/>
                </Pattern>
            </Defs>
            {/* The pattern is painted over the whole plane and cut to the area,
                rather than tiled from its corner, so the dots line up between
                one card and the next instead of shifting with the shape. */}
            <Rect testID="profile-fill" x={-bleed} y={-bleed}
                  width={width + strokeWidth} height={height + strokeWidth}
                  fill={`url(#${id}dots)`} clipPath={`url(#${id}clip)`}/>
            <Path d={path} fill="none" stroke={stroke} strokeWidth={strokeWidth}
                  strokeLinejoin="round"/>
        </Svg>
    );
}

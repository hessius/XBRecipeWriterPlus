import React, {useId} from "react";
import Svg, {Defs, Path, Pattern, Rect} from "react-native-svg";

/** The distance between one stripe and the next, in points. */
const PITCH = 6;

/** How thick a stripe is. A third of the pitch reads as texture, not as fill. */
const STRIPE = 2;

type Props = {
    /** The stripe colour across the whole width. */
    dim: string;
    /** The stripe colour over the elapsed part. */
    bright: string;
    /** 0 to 1: how much of the width has elapsed. */
    fill: number;
    height: number;
    testID?: string;
};

/**
 * Diagonal stripes, brightening from the left as something elapses.
 *
 * Drawn with an SVG pattern rather than a row of skewed views because the lane
 * a hatch sits in is `flex`-sized from its segment's seconds: nothing in the
 * tree knows how wide it will be, so nothing can work out how many stripes to
 * emit. A pattern fills whatever size it is handed without being told.
 *
 * The tile draws three strokes, not one. A single diagonal leaves a seam at
 * each tile corner where the line has left one tile and not yet entered the
 * next; the two short strokes fill exactly those corners.
 */
export default function HatchFill({dim, bright, fill, height, testID}: Props) {
    // Two patterns, not one recoloured: both layers are on screen at once.
    const id = useId().replace(/[^a-zA-Z0-9]/g, "");
    const dimId = `hatch-dim-${id}`;
    const brightId = `hatch-bright-${id}`;
    const stripes = `M-1 1 l2 -2 M0 ${PITCH} l${PITCH} -${PITCH} `
        + `M${PITCH - 1} ${PITCH + 1} l2 -2`;
    const shown = Math.max(0, Math.min(1, fill));

    return (
        <Svg width="100%" height={height}>
            <Defs>
                <Pattern id={dimId} patternUnits="userSpaceOnUse"
                         width={PITCH} height={PITCH}>
                    {/* The stroke carries the testID, not just the rect that
                        uses it: a rect's `fill` is parsed into a brush that
                        only names the pattern, so the colour itself can only
                        be read here. */}
                    <Path testID={testID === undefined ? undefined : `${testID}-dim-stroke`}
                          d={stripes} stroke={dim} strokeWidth={STRIPE} />
                </Pattern>
                <Pattern id={brightId} patternUnits="userSpaceOnUse"
                         width={PITCH} height={PITCH}>
                    <Path testID={testID === undefined ? undefined : `${testID}-bright-stroke`}
                          d={stripes} stroke={bright} strokeWidth={STRIPE} />
                </Pattern>
            </Defs>
            <Rect testID={testID === undefined ? undefined : `${testID}-dim`}
                  x={0} y={0} width="100%" height={height}
                  fill={`url(#${dimId})`} />
            {shown > 0 && (
                <Rect testID={testID === undefined ? undefined : `${testID}-bright`}
                      x={0} y={0} width={`${shown * 100}%`} height={height}
                      fill={`url(#${brightId})`} />
            )}
        </Svg>
    );
}

import React from "react";
import Svg, {Line} from "react-native-svg";
import {XStack} from "tamagui";

import DotMatrixText, {drawnFontSize} from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";

/** Point size of a legend label. */
export const LEGEND_SIZE = 9;

/**
 * The height a row of dot-matrix text needs.
 *
 * Doto's line box is close to 1.35em, applied to the size the glyphs are
 * actually drawn at rather than the size asked for. `DotMatrixText` will not
 * draw Doto below eleven points, and accessibility text sizing can raise it
 * further, so chart rows size themselves from this shared measurement instead
 * of a literal.
 */
export function rowHeight(fontSize: number): number {
    return Math.ceil(drawnFontSize(fontSize) * 1.35);
}

/**
 * One entry in the legend.
 *
 * Beneath the graph rather than over it. Top-left is clear at the end of a
 * brew but sits on the plan dashes at the start, so overlaying it trades one
 * legibility problem for another; a dedicated row costs 14 pt and never
 * collides with anything.
 *
 * Shared by `BrewTrace` and `CompareTrace` so that the two charts cannot name
 * the same channel differently. One entry, not the whole row: the row's
 * spacing and which entries appear belong to each chart, which draws a
 * different set of channels.
 */
export default function TraceLegendItem({colour, label, dashed = false, dotted = false}: {
    colour: string; label: string; dashed?: boolean; dotted?: boolean;
}) {
    return (
        <XStack alignItems="center" gap="$1.5">
            <Svg width={14} height={6}>
                <Line
                    x1={0} y1={3} x2={14} y2={3}
                    stroke={colour}
                    strokeWidth={2}
                    // Not `channelStyle`: a 14 pt swatch needs its own dash
                    // tuning. The plan's "4 4" would fit about 1.75 dashes
                    // across the swatch and read as a solid stub, so the
                    // patterns here are deliberately independent of the line
                    // patterns even where, as with dotted, they coincide.
                    strokeDasharray={dashed ? "3 3" : dotted ? "1 3" : undefined}
                />
            </Svg>
            <DotMatrixText fontSize={LEGEND_SIZE} weight="bold" letterSpacing={1.2}
                           color={palette.dim}>
                {label}
            </DotMatrixText>
        </XStack>
    );
}

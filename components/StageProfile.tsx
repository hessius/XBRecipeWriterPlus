import React, {useId} from "react";
import Svg, {Defs, Line, Path, Pattern, Rect} from "react-native-svg";

import {buildProfilePath, PROFILE_STROKE_WIDTH} from "@/components/PourProfile";
import {palette} from "@/constants/colors";
import type Pour from "@/library/Pour";

/**
 * The volume one full box height represents.
 *
 * Whichever of the two totals is larger, so both the curve and the target fit
 * and share one axis. `buildProfilePath` normalises a curve to its own total,
 * which would put the plateau at full height whatever the target was and make
 * the target line decorative.
 */
export function profileScale(pourTotal: number, target: number): number {
    return Math.max(pourTotal, target, 1);
}

/** How tall the curve is drawn, inside the box. */
export function curveHeight(pourTotal: number, target: number, height: number): number {
    return (pourTotal / profileScale(pourTotal, target)) * height;
}

/** Where the target line sits, measured from the top of the box. */
export function targetY(pourTotal: number, target: number, height: number): number {
    return height - (target / profileScale(pourTotal, target)) * height;
}

/** The horizontal span belonging to one stage. */
export function bandFor(index: number, count: number, width: number) {
    const span = width / count;
    return {x: index * span, width: span};
}

/** Diagonal spacing of the shortfall hatch. */
const HATCH_CELL = 6;

type Props = {
    pours: Pour[];
    /** dose × ratio. */
    target: number;
    accent: string;
    width: number;
    height: number;
    /** Index of the open stage, if one is open. */
    selected?: number;
    testID?: string;
};

/**
 * The recipe as a shape, with the target it has to reach.
 *
 * A readout, not a control. Dragging it to shape a recipe is #42, deferred
 * until the app can author one at all — direct manipulation is an authoring
 * gesture, and every recipe here arrives already formed.
 */
export default function StageProfile({
    pours, target, accent, width, height, selected, testID
}: Props) {
    "use no memo";

    // These components draw a model that is mutated in place: `pour.getVolume()`
    // is a method call, not a property read, so the React Compiler cannot see
    // that the value moved and would serve a cached render. The screen used to
    // force the redraw with a React `key`, but that remounts, and a remounted
    // `Stepper` loses the chained timer behind hold-to-repeat after one step —
    // on a stage volume that ranges to 240 ml, that is the whole feature.

    // SVG ids resolve document-wide, so two profiles on one screen would share
    // a pattern. useId returns punctuation that url() will not take.
    const hatchId = `hatch${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

    const pourTotal = pours.reduce((sum, pour) => sum + Math.max(pour.volume, 0), 0);
    const drawn = curveHeight(pourTotal, target, height);
    const line = targetY(pourTotal, target, height);
    const short = pourTotal < target;

    const stroke = PROFILE_STROKE_WIDTH;
    const bleed = stroke / 2;
    const path = buildProfilePath(pours, width, drawn);
    const band = selected !== undefined && pours.length > 0
        ? bandFor(selected, pours.length, width)
        : null;

    return (
        <Svg testID={testID} width={width + stroke} height={height + stroke}
             viewBox={`${-bleed} ${-bleed} ${width + stroke} ${height + stroke}`}>
            <Defs>
                <Pattern id={hatchId} width={HATCH_CELL} height={HATCH_CELL}
                         patternUnits="userSpaceOnUse">
                    <Path d={`M0 ${HATCH_CELL} L${HATCH_CELL} 0`}
                          stroke={palette.danger} strokeWidth={1} opacity={0.5}/>
                </Pattern>
            </Defs>

            {band && (
                <Rect testID="stage-profile-band" x={band.x} y={0}
                      width={band.width} height={height}
                      fill={palette.text} opacity={0.07}/>
            )}

            {short && (
                <Rect testID="stage-profile-shortfall" x={0} y={line}
                      width={width} height={height - drawn - line}
                      fill={`url(#${hatchId})`}/>
            )}

            {/* Translated to the bottom of the box: buildProfilePath draws from
                y=0 to y=drawn, and the baseline belongs on the floor. */}
            <Path d={`${path} L${width} ${drawn} Z`} fill={accent} opacity={0.16}
                  transform={`translate(0 ${height - drawn})`}/>
            <Path d={path} fill="none" stroke={accent} strokeWidth={stroke}
                  strokeLinejoin="round" strokeLinecap="round"
                  transform={`translate(0 ${height - drawn})`}/>

            <Line testID="stage-profile-target" x1={0} y1={line} x2={width} y2={line}
                  stroke={short ? palette.danger : palette.dim}
                  strokeWidth={1} strokeDasharray="4 3"/>
        </Svg>
    );
}

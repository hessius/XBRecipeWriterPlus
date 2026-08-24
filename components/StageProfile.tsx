import React, {useId} from "react";
import {Pressable, View} from "react-native";
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
    /**
     * Called with the stage whose part of the curve was tapped.
     *
     * Omit it and the profile is a readout, which is what it is on any screen
     * that has no stage list to move.
     */
    onSelect?: (index: number) => void;
    testID?: string;
};

/**
 * The recipe as a shape, with the target it has to reach.
 *
 * Given `onSelect` it is also a way in: a tap on a stage's part of the curve
 * moves the highlight to it and opens it below. Reaching for the shape rather
 * than for the row is the obvious thing to do once the shape is the thing you
 * are reading, and it was inert for one round of testing before this.
 *
 * Dragging it to *shape* a recipe is still #42, and still deferred: direct
 * manipulation is an authoring gesture, and every recipe here arrives formed.
 */
export default function StageProfile({
    pours, target, accent, width, height, selected, onSelect, testID
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

    // The tap targets are laid out rather than computed from the tap's x. One
    // flexed child per stage divides the width exactly as `bandFor` does, and
    // unlike a coordinate test each one is a control a screen reader can find
    // and name -- which an SVG path is not.
    const bands = onSelect && pours.length > 0 && (
        <View style={{position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                      flexDirection: "row"}}>
            {pours.map((pour, index) => (
                <Pressable key={index} style={{flex: 1}}
                           accessibilityRole="button"
                           // Not the same wording as the tile below, which is
                           // "Stage n of m": two controls with one name is a
                           // screen reader reading the same thing twice and no
                           // way to tell which one it has landed on.
                           accessibilityLabel={`Show stage ${index + 1} of ${pours.length}`}
                           accessibilityState={{selected: selected === index}}
                           onPress={() => onSelect(index)}/>
            ))}
        </View>
    );

    const svg = (
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

    if (!bands) {
        return svg;
    }

    return <View>{svg}{bands}</View>;
}

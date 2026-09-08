import React from "react";
import {Pressable, View} from "react-native";
import Svg, {Line, Path, Rect} from "react-native-svg";

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
export function profileScale(pourTotal: number, target: number, bypass = 0): number {
    return Math.max(pourTotal, target, bypass, 1);
}

/** How tall the curve is drawn, inside the box. */
export function curveHeight(pourTotal: number, target: number, height: number,
                            bypass = 0): number {
    return (pourTotal / profileScale(pourTotal, target, bypass)) * height;
}

/** Where the target line sits, measured from the top of the box. */
export function targetY(pourTotal: number, target: number, height: number,
                        bypass = 0): number {
    return height - (target / profileScale(pourTotal, target, bypass)) * height;
}

/** The horizontal span belonging to one stage. */
export function bandFor(index: number, count: number, width: number) {
    const span = width / count;
    return {x: index * span, width: span};
}

type Props = {
    pours: Pour[];
    /** dose × ratio. */
    target: number;
    accent: string;
    width: number;
    height: number;
    /** Index of the open stage, or the sentinel for the bypass rung. */
    selected?: number | "bypass";
    /**
     * Called with the stage whose part of the curve was tapped, or with the
     * bypass sentinel.
     *
     * Omit it and the profile is a readout, which is what it is on any screen
     * that has no stage list to move.
     */
    onSelect?: (index: number | "bypass") => void;
    /**
     * Bypass water, in millilitres, or nothing.
     *
     * Zero and undefined mean the same thing here on purpose: the caller passes
     * `recipe.bypassEnabled ? recipe.bypassVolume : 0` and does not have to
     * think about which of the two absences it is holding.
     */
    bypassVolume?: number;
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
    pours, target, accent, width, height, selected, onSelect, bypassVolume, testID
}: Props) {
    "use no memo";

    // These components draw a model that is mutated in place: `pour.getVolume()`
    // is a method call, not a property read, so the React Compiler cannot see
    // that the value moved and would serve a cached render. The screen used to
    // force the redraw with a React `key`, but that remounts, and a remounted
    // `Stepper` loses the chained timer behind hold-to-repeat after one step —
    // on a stage volume that ranges to 240 ml, that is the whole feature.

    const pourTotal = pours.reduce((sum, pour) => sum + Math.max(pour.volume, 0), 0);
    const bypass = Math.max(bypassVolume ?? 0, 0);
    const hasBypass = bypass > 0;

    // The bypass gets a band of its own at the end, so the stage curve is drawn
    // into a narrower box. Same band width for every band, stage or bypass:
    // `bandFor` divides by the same count, so the highlight always lines up
    // with what is drawn under it.
    const bandCount = pours.length + (hasBypass ? 1 : 0);
    // `bandCount` is at least 1 whenever there is a bypass, so the division is
    // always defined; a recipe with no stages simply gives the bypass the whole
    // width.
    const stageWidth = hasBypass ? (width * pours.length) / bandCount : width;

    const drawn = curveHeight(pourTotal, target, height, bypass);
    const line = targetY(pourTotal, target, height, bypass);
    const short = pourTotal < target;
    const bypassHeight = (bypass / profileScale(pourTotal, target, bypass)) * height;

    const stroke = PROFILE_STROKE_WIDTH;
    const bleed = stroke / 2;
    const path = buildProfilePath(pours, stageWidth, drawn);
    const band = selected !== undefined && bandCount > 0
        ? bandFor(selected === "bypass" ? pours.length : selected, bandCount, width)
        : null;

    // The tap targets are laid out rather than computed from the tap's x. One
    // flexed child per stage divides the width exactly as `bandFor` does, and
    // unlike a coordinate test each one is a control a screen reader can find
    // and name -- which an SVG path is not.
    const bands = onSelect && bandCount > 0 && (
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
            {hasBypass && (
                <Pressable style={{flex: 1}} accessibilityRole="button"
                           accessibilityLabel="Show bypass water"
                           accessibilityState={{selected: selected === "bypass"}}
                           onPress={() => onSelect("bypass")}/>
            )}
        </View>
    );

    const svg = (
        <Svg testID={testID} width={width + stroke} height={height + stroke}
             viewBox={`${-bleed} ${-bleed} ${width + stroke} ${height + stroke}`}>
            {band && (
                <Rect testID="stage-profile-band" x={band.x} y={0}
                      width={band.width} height={height}
                      fill={palette.text} opacity={0.07}/>
            )}

            {/* Translated to the bottom of the box: buildProfilePath draws from
                y=0 to y=drawn, and the baseline belongs on the floor. */}
            <Path d={`${path} L${stageWidth} ${drawn} Z`} fill={accent} opacity={0.16}
                  transform={`translate(0 ${height - drawn})`}/>
            <Path d={path} fill="none" stroke={accent} strokeWidth={stroke}
                  strokeLinejoin="round" strokeLinecap="round"
                  transform={`translate(0 ${height - drawn})`}/>

            {/* Bypass, in its own band and in its own colour. Outlined rather
                than filled solid, and dashed rather than continuous, because it
                is not brewed water and should not read as another stage. The
                dash is 9 5 and the target rule below is 4 3: two dashed marks
                on one small chart need to be told apart at arm's length, and
                length is the only free variable once the colour is spoken for.
                A continuous staircase was tried and rejected -- it climbs above
                the target rule, which everywhere else in this app means too
                much water. */}
            {hasBypass && (
                <Rect testID="stage-profile-bypass"
                      x={stageWidth} y={height - bypassHeight}
                      width={width - stageWidth} height={bypassHeight}
                      fill={palette.info} fillOpacity={0.16}
                      stroke={palette.info} strokeWidth={1} strokeDasharray="9 5"/>
            )}

            {/* Red is the whole of the shortfall signal here. There used to be
                a diagonal hatch over the gap as well, which read as the dashes
                of the line itself having somehow rotated -- two marks changing
                at once, and the eye blames the one it was already looking at.
                Nothing is lost by dropping it: the line's position above the
                curve is itself a signal that owes nothing to colour, and the
                banner directly beneath states the mismatch in prose and gives
                both numbers.

                The rule stops at the last stage rather than running the full
                width. It means "the volume the stages have to reach", and
                bypass is not stage water -- carrying it under the bypass band
                would say the opposite of what it means. */}
            <Line testID="stage-profile-target" x1={0} y1={line} x2={stageWidth} y2={line}
                  stroke={short ? palette.danger : palette.dim}
                  strokeWidth={1} strokeDasharray="4 3"/>
        </Svg>
    );

    if (!bands) {
        return svg;
    }

    return <View>{svg}{bands}</View>;
}

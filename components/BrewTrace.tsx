import React from "react";
import Svg, {Defs, Line, LinearGradient, Path, Stop} from "react-native-svg";
import {XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import type {BrewSample} from "@/library/brew/BrewRecord";
import {livePoints, pathLength, planPoints, stageSpans, toPath, type Box}
    from "@/library/brew/brewShape";
import type Pour from "@/library/Pour";

type Props = {
    pours: Pour[];
    samples: BrewSample[];
    accent: string;
    width: number;
    /** Total rendered height of the component. In non-compact mode this includes the legend and overrun rows. */
    height: number;
    plannedSeconds: number;
    /** Overflow protection has stopped the water. Turns the live line amber. */
    holding?: boolean;
    /** Driven by the screen's phase animations; plain numbers keep this testable. */
    planOpacity?: number;
    planColor?: string;
    /** False once the recipe is in the machine and the dashes should fuse. */
    planDashed?: boolean;
    /** 0 to 1: how far the lit head has travelled. 1 means no head. */
    planHeadAt?: number;
    /** When true, render only the SVG at exactly width × height — no stage counter, no overrun label. */
    compact?: boolean;
};

/** Height of the overrun row. */
const CHROME = 16;

/** Height of the legend row beneath the graph. */
const LEGEND = 14;

/** The gradient's opacity at the line and at the floor. */
const FILL_TOP = 0.28;
const FILL_BOTTOM = 0;

/** Minimum SVG plot height in pixels. Prevents zero or negative dimensions when height is very small. */
const PLOT_FLOOR = 10;

/** Below this an overrun is rounding, not a hold worth naming. */
const GAP_FLOOR_SECONDS = 2;

/** The lit head's length, as a fraction of the curve. */
const LIT = 0.12;

/** what was asked for, what the machine did, what landed
 * in the cup.
 *
 * The axis is sized to the longer of the plan and the run, so a brew held by
 * overflow protection ends right of its plan by exactly the time it lost and
 * the chart records the hold for free. Squeezing the run back onto the plan's
 * axis would erase the one thing worth seeing.
 */
export default function BrewTrace({
    pours, samples, accent, width, height, plannedSeconds,
    holding = false, planOpacity = 1, planColor = palette.muted,
    planDashed = true, planHeadAt = 1,
    compact = false
}: Props) {
    const plan = planPoints(pours);
    const water = livePoints(samples, "water");
    const cup = livePoints(samples, "cup");

    const ranTo = water.length > 0 ? water[water.length - 1].t : 0;
    // In compact mode the SVG fills the full height; otherwise the legend row
    // and the overrun row take theirs first.
    const svgHeight = compact
        ? height
        : Math.max(height - CHROME - LEGEND, PLOT_FLOOR);
    const box: Box = {
        width,
        height: svgHeight,
        maxT: Math.max(plannedSeconds, ranTo),
        maxV: Math.max(
            plan.length > 0 ? plan[plan.length - 1].v : 0,
            water.length > 0 ? water[water.length - 1].v : 0
        )
    };

    const planPath = toPath(plan, box);
    // The dash pattern below is measured along the line, not across the box.
    const planLength = pathLength(plan, box);
    const waterPath = toPath(water, box);
    const cupPath = toPath(cup, box);
    // The water line, carried down to the floor and back, so it can be filled.
    // Built here rather than by setting `fill` on the line itself: an open
    // path fills between its endpoints and cuts the corner off the curve.
    const waterFill = waterPath === ""
        ? ""
        : `${waterPath} L${round(box.width * (ranTo / Math.max(box.maxT, 1)))} `
          + `${svgHeight} L0 ${svgHeight} Z`;

    // Where each stage ends, as a fraction of the axis. The last boundary is
    // the right-hand edge of the chart and is not drawn.
    const boundaries = stageSpans(pours)
        .slice(0, -1)
        .map((span) => (span.end / Math.max(box.maxT, 1)) * box.width);

    // Only meaningful when there is an actual plan; a plan of nothing cannot be overrun.
    const overrun = plannedSeconds > 0 ? Math.round(ranTo - plannedSeconds) : 0;

    if (compact) {
        return (
            <Svg width={width} height={height} accessibilityRole="image"
                 accessibilityLabel="Brew trace">
                {planPath !== "" && (
                    <Path
                        testID="trace-plan"
                        d={planPath}
                        stroke={planColor}
                        strokeOpacity={planOpacity}
                        strokeWidth={1.5}
                        strokeDasharray={planDashed ? "4 4" : undefined}
                        fill="none"
                    />
                )}
                {cupPath !== "" && (
                    <Path
                        testID="trace-cup"
                        d={cupPath}
                        stroke={palette.muted}
                        strokeWidth={1.5}
                        strokeDasharray="1 3"
                        strokeLinecap="round"
                        fill="none"
                    />
                )}
                {waterPath !== "" && (
                    <Path
                        testID="trace-water"
                        d={waterPath}
                        stroke={holding ? palette.warn : accent}
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                    />
                )}
            </Svg>
        );
    }

    return (
        <YStack width={width}>
            <Svg width={width} height={svgHeight} accessibilityRole="image"
                 accessibilityLabel="Brew trace">
                <Defs>
                    <LinearGradient id="waterFill" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={accent} stopOpacity={FILL_TOP} />
                        <Stop offset="1" stopColor={accent} stopOpacity={FILL_BOTTOM} />
                    </LinearGradient>
                </Defs>
                {boundaries.map((x, i) => (
                    <Line
                        key={`gridline-${i}`}
                        testID={`trace-gridline-${i}`}
                        x1={x} y1={0} x2={x} y2={svgHeight}
                        stroke={palette.line}
                        strokeWidth={1}
                    />
                ))}
                {waterFill !== "" && (
                    <Path testID="trace-water-fill" d={waterFill} fill="url(#waterFill)"
                          stroke="none" />
                )}
                {planPath !== "" && (
                    <Path
                        testID="trace-plan"
                        d={planPath}
                        stroke={planColor}
                        strokeOpacity={planOpacity}
                        strokeWidth={1.5}
                        strokeDasharray={planDashed ? "4 4" : undefined}
                        fill="none"
                    />
                )}
                {planPath !== "" && planHeadAt < 1 && (
                    <Path
                        testID="trace-head"
                        d={planPath}
                        stroke={accent}
                        strokeWidth={2}
                        strokeDasharray={`${planLength * LIT} ${planLength}`}
                        strokeDashoffset={-planHeadAt * planLength * (1 + LIT)}
                        fill="none"
                    />
                )}
                {cupPath !== "" && (
                    <Path
                        testID="trace-cup"
                        d={cupPath}
                        stroke={palette.muted}
                        strokeWidth={1.5}
                        strokeDasharray="1 3"
                        strokeLinecap="round"
                        fill="none"
                    />
                )}
                {waterPath !== "" && (
                    <Path
                        testID="trace-water"
                        d={waterPath}
                        stroke={holding ? palette.warn : accent}
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                    />
                )}
            </Svg>
            <XStack height={LEGEND} alignItems="center" gap="$3">
                <LegendItem colour={holding ? palette.warn : accent} label="WATER" />
                <LegendItem colour={palette.muted} label="CUP" dotted />
                {plan.length > 0 && planOpacity > 0 && (
                    <LegendItem colour={planColor} label="PLAN" dashed />
                )}
            </XStack>
            <XStack justifyContent="flex-end" height={CHROME}>
                {overrun >= GAP_FLOOR_SECONDS && (
                    <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.4}
                                   color={palette.warn}>
                        {`+${overrun} S`}
                    </DotMatrixText>
                )}
            </XStack>
        </YStack>
    );
}

/** One decimal, as in `toPath`. Long SVG paths are mostly noise. */
function round(n: number): number {
    return Math.round(n * 10) / 10;
}

/**
 * One entry in the legend.
 *
 * Beneath the graph rather than over it. Top-left is clear at the end of a
 * brew but sits on the plan dashes at the start, so overlaying it trades one
 * legibility problem for another; a dedicated row costs 14 pt and never
 * collides with anything.
 */
function LegendItem({colour, label, dashed = false, dotted = false}: {
    colour: string; label: string; dashed?: boolean; dotted?: boolean;
}) {
    return (
        <XStack alignItems="center" gap="$1.5">
            <Svg width={14} height={6}>
                <Line
                    x1={0} y1={3} x2={14} y2={3}
                    stroke={colour}
                    strokeWidth={2}
                    strokeDasharray={dashed ? "3 3" : dotted ? "1 3" : undefined}
                />
            </Svg>
            <DotMatrixText fontSize={9} weight="bold" letterSpacing={1.2}
                           color={palette.dim}>
                {label}
            </DotMatrixText>
        </XStack>
    );
}

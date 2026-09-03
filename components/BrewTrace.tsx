import React from "react";
import Svg, {Path} from "react-native-svg";
import {XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import type {BrewSample} from "@/library/brew/BrewRecord";
import {livePoints, planPoints, toPath, type Box} from "@/library/brew/brewShape";
import type Pour from "@/library/Pour";

type Props = {
    pours: Pour[];
    samples: BrewSample[];
    accent: string;
    width: number;
    height: number;
    plannedSeconds: number;
    /** 1-based, for the `3/5` counter. Omitted before the first pour. */
    stage?: number;
    stages?: number;
    /** Overflow protection has stopped the water. Turns the live line amber. */
    holding?: boolean;
    /** Driven by Task 13's phase animations; plain numbers keep this testable. */
    planOpacity?: number;
    planColor?: string;
};

/** Below this an overrun is rounding, not a hold worth naming. */
const GAP_FLOOR_SECONDS = 2;

/**
 * The brew on one plane: what was asked for, what the machine did, what landed
 * in the cup.
 *
 * The axis is sized to the longer of the plan and the run, so a brew held by
 * overflow protection ends right of its plan by exactly the time it lost and
 * the chart records the hold for free. Squeezing the run back onto the plan's
 * axis would erase the one thing worth seeing.
 */
export default function BrewTrace({
    pours, samples, accent, width, height, plannedSeconds,
    stage, stages, holding = false, planOpacity = 1, planColor = palette.muted
}: Props) {
    const plan = planPoints(pours);
    const water = livePoints(samples, "water");
    const cup = livePoints(samples, "cup");

    const ranTo = water.length > 0 ? water[water.length - 1].t : 0;
    const box: Box = {
        width,
        height,
        maxT: Math.max(plannedSeconds, ranTo),
        maxV: Math.max(
            plan.length > 0 ? plan[plan.length - 1].v : 0,
            water.length > 0 ? water[water.length - 1].v : 0
        )
    };

    const planPath = toPath(plan, box);
    const waterPath = toPath(water, box);
    const cupPath = toPath(cup, box);
    const overrun = Math.round(ranTo - plannedSeconds);

    return (
        <YStack width={width}>
            <XStack justifyContent="flex-end" height={16}>
                {stage !== undefined && stages !== undefined && (
                    <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.4}
                                   color={palette.dim}>
                        {`${stage}/${stages}`}
                    </DotMatrixText>
                )}
            </XStack>
            <Svg width={width} height={height} accessibilityRole="image"
                 accessibilityLabel="Brew trace">
                {planPath !== "" && (
                    <Path
                        testID="trace-plan"
                        d={planPath}
                        stroke={planColor}
                        strokeOpacity={planOpacity}
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
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
            <XStack justifyContent="flex-end" height={16}>
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

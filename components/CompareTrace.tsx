import React from "react";
import Svg, {Path} from "react-native-svg";
import {XStack, YStack} from "tamagui";

import TraceLegendItem, {LEGEND_SIZE, rowHeight} from "@/components/TraceLegendItem";
import type {BrewSample} from "@/library/brew/BrewRecord";
import {type Box, livePoints, type Point, toPath} from "@/library/brew/brewShape";
import {gapBand, type PourVerdict} from "@/library/brew/compare";
import {channelStyle} from "@/library/brew/traceStyle";

/**
 * Two brews on one axis.
 *
 * KEEP IN STEP WITH: `components/BrewTrace.tsx` and
 * `components/__tests__/traceGrammar.test.tsx`. The two charts share their
 * appearance through `library/brew/traceStyle.ts` and their geometry through
 * `library/brew/brewShape.ts`; nothing in this file should set a stroke width
 * or a dash pattern of its own.
 *
 * Deliberately the smaller of the two. No bypass box, no temperature band, no
 * stage tapping, no travelling head: each of those says something about one
 * brew, and doubling them would double the ink on a picture that already has
 * twice the lines. A user who wants them has the single record a tap away.
 *
 * The grammar is spent before this component starts. Hue already means recipe,
 * dotted already means cup, grey dashes already mean plan, amber already means
 * the machine stopped. So "which brew" is the one thing left: the subject
 * keeps its colour and the reference goes grey, with the brighter grey given
 * to the cup because the cup is what a user came here to compare.
 */

/** How much of the band's fill shows. Enough to read as a region, not a line. */
const GAP_OPACITY = 0.14;

/**
 * The plan is context here, not the subject. Fainter than `BrewTrace`'s
 * default `planOpacity` of 1: two brews plus a plan is three lines, and the
 * plan must recede.
 */
const PLAN_OPACITY = 0.25;

/** Minimum SVG plot height in pixels, matching `BrewTrace`'s collapsed floor. */
const PLOT_FLOOR = 10;

export function compareTracePlotHeight(height: number): number {
    // One row is what the legend usually needs, and `height` is a budget for
    // the ordinary case rather than a frame. A comparison can show six entries
    // (water, cup and plan, each twice), and on a narrow screen those wrap.
    // The legend row is deliberately left unsized so that it may: the chart
    // sits in the compare screen's ScrollView, in flow, so a wrapped legend
    // makes the block taller and nothing collides. Reserving the worst case
    // here instead would spend a third of the plot on a row that is usually
    // not drawn, and the plot is where the whole comparison happens.
    return Math.max(height - rowHeight(LEGEND_SIZE), PLOT_FLOOR);
}

type Props = {
    subject: BrewSample[];
    reference: BrewSample[];
    accent: string;
    verdict: PourVerdict;
    width: number;
    height: number;
    /** The axis both brews are drawn on. Computed by the screen, not here. */
    maxT: number;
    maxV: number;
    /** Pre-built plan paths. Absent draws no plan. */
    subjectPlan?: string;
    /** Only when the plans differ in shape; otherwise one plan stands for both. */
    referencePlan?: string;
};

function closedPath(points: Point[], box: Box): string {
    const path = toPath(points, box);
    return path === "" ? "" : `${path} Z`;
}

function lastCup(points: Point[]): number | null {
    return points.length === 0 ? null : points[points.length - 1].v;
}

function accessibilityText(
    oneWater: boolean,
    subjectWaterPresent: boolean,
    referenceWaterPresent: boolean,
    cupDifference: number | null
): string {
    const cup = cupDifference === null
        ? "Cup difference is not drawn because a trace is missing."
        : `Cups finished ${cupDifference} g apart.`;
    let water = "Water is not drawn because both traces are missing.";
    if (subjectWaterPresent && referenceWaterPresent) {
        water = oneWater
            ? "Water matched, so one coloured water line stands for both brews."
            : "Water differed, so coloured and grey water lines are both drawn.";
    } else if (subjectWaterPresent) {
        water = "Only this brew's water could be drawn because that trace is missing.";
    } else if (referenceWaterPresent) {
        water = "Only that brew's water could be drawn because this trace is missing.";
    }
    return `Brew comparison. This brew is coloured and that brew is grey. ${cup} ${water}`;
}

export default function CompareTrace({
    subject, reference, accent, verdict, width, height, maxT, maxV,
    subjectPlan, referencePlan
}: Props) {
    const svgHeight = compareTracePlotHeight(height);
    const box: Box = {width, height: svgHeight, maxT, maxV};

    const subjectCup = livePoints(subject, "cup");
    const referenceCup = livePoints(reference, "cup");
    const subjectWater = livePoints(subject, "water");
    const referenceWater = livePoints(reference, "water");

    // The success state. Saying the pours matched and then drawing two water
    // lines a millilitre apart would contradict the sentence above the chart,
    // and the millimetre between them is scale noise rather than a finding.
    const oneWater = verdict === "same";

    const cupSubject = channelStyle("cup", {accent});
    const cupReference = channelStyle("cup", {accent, role: "reference"});
    const waterSubject = channelStyle("water", {accent});
    const waterReference = channelStyle("water", {accent, role: "reference"});
    const sharedPlan = channelStyle("plan", {accent});
    // When two stored plans differ in shape, colour keeps the subject/reference
    // grammar: this brew stays coloured and that brew stays grey.
    const subjectPlanStyle = channelStyle("plan", {
        accent,
        planColour: (referencePlan ?? "") === "" ? undefined : accent
    });
    const referencePlanStyle = channelStyle("plan", {accent});

    const band = closedPath(gapBand(subjectCup, referenceCup), box);
    const paths = {
        cupSubject:     toPath(subjectCup, box),
        cupReference:   toPath(referenceCup, box),
        waterSubject:   toPath(subjectWater, box),
        waterReference: toPath(referenceWater, box)
    };
    const cupA = lastCup(subjectCup);
    const cupB = lastCup(referenceCup);
    const cupDifference = cupA === null || cupB === null ? null : Math.round(Math.abs(cupA - cupB));
    const accessibilityLabel = accessibilityText(
        oneWater,
        paths.waterSubject !== "",
        paths.waterReference !== "",
        cupDifference
    );
    const hasSubjectPlan = (subjectPlan ?? "") !== "";
    const hasReferencePlan = (referencePlan ?? "") !== "";
    const hasTwoPlans = hasSubjectPlan && hasReferencePlan;

    return (
        <YStack width={width}>
            <Svg testID="compare-trace-plot" width={width} height={svgHeight} accessibilityRole="image"
                 accessibilityLabel={accessibilityLabel}>
                {hasSubjectPlan && (
                    <Path
                        testID="trace-plan-subject"
                        d={subjectPlan}
                        strokeOpacity={PLAN_OPACITY}
                        fill="none"
                        {...(hasTwoPlans ? subjectPlanStyle : sharedPlan)}
                    />
                )}
                {hasReferencePlan && (
                    <Path
                        testID="trace-plan-reference"
                        d={referencePlan}
                        strokeOpacity={PLAN_OPACITY}
                        fill="none"
                        {...referencePlanStyle}
                    />
                )}
                {band !== "" && (
                    <Path
                        testID="trace-cup-gap"
                        d={band}
                        stroke="none"
                        // The region is bounded by cup curves, so it uses the
                        // cup hue rather than the water accent.
                        fill={cupSubject.stroke}
                        fillOpacity={GAP_OPACITY}
                    />
                )}
                {paths.waterReference !== "" && (!oneWater || paths.waterSubject === "") && (
                    <Path
                        testID="trace-water-reference"
                        d={paths.waterReference}
                        fill="none"
                        {...waterReference}
                    />
                )}
                {paths.waterSubject !== "" && (
                    <Path
                        testID="trace-water-subject"
                        d={paths.waterSubject}
                        fill="none"
                        {...waterSubject}
                    />
                )}
                {/* Cup is drawn above water here because cup is the comparison subject. */}
                {paths.cupReference !== "" && (
                    <Path
                        testID="trace-cup-reference"
                        d={paths.cupReference}
                        fill="none"
                        {...cupReference}
                    />
                )}
                {paths.cupSubject !== "" && (
                    <Path
                        testID="trace-cup-subject"
                        d={paths.cupSubject}
                        fill="none"
                        {...cupSubject}
                    />
                )}
            </Svg>
            <XStack testID="compare-legend-row"
                    alignItems="center" gap="$3" paddingTop="$1" flexWrap="wrap">
                {oneWater ? (paths.waterSubject !== "" || paths.waterReference !== "") && (
                    <TraceLegendItem
                        colour={
                            paths.waterSubject !== ""
                                ? waterSubject.stroke
                                : waterReference.stroke
                        }
                        label="WATER, BOTH"
                    />
                ) : (
                    <React.Fragment>
                        {paths.waterSubject !== "" && (
                            <TraceLegendItem colour={waterSubject.stroke} label="WATER, THIS" />
                        )}
                        {paths.waterReference !== "" && (
                            <TraceLegendItem
                                colour={waterReference.stroke}
                                label="WATER, THAT"
                            />
                        )}
                    </React.Fragment>
                )}
                {paths.cupSubject !== "" && (
                    <TraceLegendItem colour={cupSubject.stroke} label="CUP, THIS" dotted />
                )}
                {paths.cupReference !== "" && (
                    <TraceLegendItem colour={cupReference.stroke} label="CUP, THAT" dotted />
                )}
                {hasTwoPlans ? (
                    <React.Fragment>
                        <TraceLegendItem colour={subjectPlanStyle.stroke} label="PLAN, THIS" dashed />
                        <TraceLegendItem colour={referencePlanStyle.stroke} label="PLAN, THAT" dashed />
                    </React.Fragment>
                ) : (hasSubjectPlan || hasReferencePlan) && (
                    <TraceLegendItem colour={sharedPlan.stroke} label="PLAN" dashed />
                )}
            </XStack>
        </YStack>
    );
}

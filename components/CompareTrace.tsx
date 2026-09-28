import React from "react";
import Svg, {Path} from "react-native-svg";
import {XStack, YStack} from "tamagui";

import TraceLegendItem from "@/components/TraceLegendItem";
import {palette} from "@/constants/colors";
import type {BrewSample} from "@/library/brew/BrewRecord";
import {type Box, livePoints, type Point, toPath} from "@/library/brew/brewShape";
import type {PourVerdict} from "@/library/brew/compare";
import {channelStyle, referenceCupColour, referenceWaterColour}
    from "@/library/brew/traceStyle";

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
 * The plan is context here, not the subject. Fainter than `BrewTrace` draws it:
 * two brews plus a plan is three lines, and the plan must recede.
 */
const PLAN_OPACITY = 0.25;

const LEGEND_HEIGHT = 16;

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

/**
 * The region between the two cup curves.
 *
 * Out along the subject and back along the reference, which closes into a
 * polygon that is above the axis where the subject led and below where it
 * lagged. `toPath` already emits `M` then a run of `L`, so the return leg is
 * the same call with its opening `M` turned into an `L`.
 */
function gapBand(subject: Point[], reference: Point[], box: Box): string {
    if (subject.length < 2 || reference.length < 2) return "";
    const out = toPath(subject, box);
    const back = toPath([...reference].reverse(), box);
    if (out === "" || back === "") return "";
    return `${out} ${back.replace(/^M/, "L")} Z`;
}

export default function CompareTrace({
    subject, reference, accent, verdict, width, height, maxT, maxV,
    subjectPlan, referencePlan
}: Props) {
    const svgHeight = Math.max(0, height - LEGEND_HEIGHT);
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
    const planStyle = channelStyle("plan", {accent});

    const band = gapBand(subjectCup, referenceCup, box);
    const accessibilityLabel = oneWater
        ? "Brew comparison, both water lines matched and the cup lines show the difference"
        : "Brew comparison, water and cup lines compare the two brews";
    const paths = {
        cupSubject:     toPath(subjectCup, box),
        cupReference:   toPath(referenceCup, box),
        waterSubject:   toPath(subjectWater, box),
        waterReference: toPath(referenceWater, box)
    };

    return (
        <YStack width={width}>
            <Svg width={width} height={svgHeight} accessibilityRole="image"
                 accessibilityLabel={accessibilityLabel}>
                {subjectPlan !== undefined && subjectPlan !== "" && (
                    <Path
                        testID="trace-plan-subject"
                        d={subjectPlan}
                        strokeOpacity={PLAN_OPACITY}
                        fill="none"
                        {...planStyle}
                    />
                )}
                {referencePlan !== undefined && referencePlan !== "" && (
                    <Path
                        testID="trace-plan-reference"
                        d={referencePlan}
                        strokeOpacity={PLAN_OPACITY}
                        fill="none"
                        {...planStyle}
                    />
                )}
                {band !== "" && (
                    <Path
                        testID="trace-cup-gap"
                        d={band}
                        stroke="none"
                        fill={accent}
                        fillOpacity={GAP_OPACITY}
                    />
                )}
                {paths.waterReference !== "" && !oneWater && (
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
            <XStack testID="compare-legend-row" gap="$3" paddingTop="$1" flexWrap="wrap">
                {oneWater ? (
                    <TraceLegendItem colour={accent} label="WATER, BOTH" />
                ) : (
                    <React.Fragment>
                        <TraceLegendItem colour={accent} label="WATER, THIS" />
                        <TraceLegendItem colour={referenceWaterColour} label="WATER, THAT" />
                    </React.Fragment>
                )}
                <TraceLegendItem colour={cupSubject.stroke} label="CUP, THIS" dotted />
                <TraceLegendItem colour={referenceCupColour} label="CUP, THAT" dotted />
                {(subjectPlan ?? "") !== "" && (
                    <TraceLegendItem colour={palette.muted} label="PLAN" dashed />
                )}
            </XStack>
        </YStack>
    );
}

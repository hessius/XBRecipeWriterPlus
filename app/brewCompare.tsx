import {useLocalSearchParams} from "expo-router";
import router from "@/hooks/steadyRouter";
import React from "react";
import {ScrollView, useWindowDimensions} from "react-native";
import Svg, {Line, Path} from "react-native-svg";
import {Button, Text, XStack, YStack} from "tamagui";

import BrewStars from "@/components/BrewStars";
import BrewRateChart from "@/components/BrewRateChart";
import BrewTrace from "@/components/BrewTrace";
import CompareTable from "@/components/CompareTable";
import CompareTrace, {compareTracePlotHeight} from "@/components/CompareTrace";
import DotMatrixText from "@/components/DotMatrixText";
import ScreenHeader from "@/components/ScreenHeader";
import {
    COMPARE_COPY,
    COMPARE_DEGRADED,
    COMPARE_GUARD,
    compareDriftSentence
} from "@/constants/brewCopy";
import {palette} from "@/constants/colors";
import {SCREEN_PADDING} from "@/constants/layout";
import {useBrewComparison} from "@/hooks/useBrewComparison";
import type {StoredBrew} from "@/library/BrewDatabase";
import {plannedSeconds, toPath} from "@/library/brew/brewShape";
import type {Point} from "@/library/brew/brewShape";
import {formatBrewDate, formatBrewTime} from "@/library/brew/brewFormat";
import type {FlowPoint} from "@/library/brew/flowRate";
import {referenceCupColour, type Role} from "@/library/brew/traceStyle";

const CHART_HEIGHT = 220;
const LANE_HEIGHT = 92;
const GAP_HEIGHT = 34;

function ModeButton({
    active,
    label,
    accessibilityLabel,
    onPress
}: {
    active: boolean;
    label: string;
    accessibilityLabel: string;
    onPress: () => void;
}) {
    return (
        <Button
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityState={{selected: active}}
            chromeless
            size="$2"
            backgroundColor={active ? palette.control : palette.none}
            borderColor={active ? palette.dim : palette.line}
            borderWidth={1}
            onPress={onPress}>
            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.2}
                           color={active ? palette.text : palette.dim}>
                {label}
            </DotMatrixText>
        </Button>
    );
}

function BrewKey({
    label,
    record,
    colour
}: {
    label: string;
    record: StoredBrew;
    colour: string;
}) {
    return (
        <XStack alignItems="center" gap="$2">
            <YStack width={10} height={10} borderRadius="$10" backgroundColor={colour} />
            <YStack>
                <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.2}
                               color={colour}>
                    {label}
                </DotMatrixText>
                <Text color={palette.dim} fontSize={12} numberOfLines={1}>
                    {formatBrewDate(record.startedAt)} · {formatBrewTime(record.startedAt)}
                </Text>
            </YStack>
        </XStack>
    );
}

function JudgementReadout({label, record, colour}: {
    label: string;
    record: StoredBrew;
    colour: string;
}) {
    const note = record.note?.trim() ?? "";
    return (
        <YStack gap="$2" padding="$3" borderWidth={1} borderColor={palette.line}
                borderRadius="$5" backgroundColor={palette.surface}>
            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.2} color={colour}>
                {label}
            </DotMatrixText>
            <BrewStars rating={record.rating ?? 0} testID={`compare-stars-${record.id}`} />
            <Text color={note.length > 0 ? palette.text : palette.dim} fontSize={13}>
                {note.length > 0 ? note : "No note recorded."}
            </Text>
        </YStack>
    );
}

function GuardedComparison({
    title,
    body,
    testID
}: {
    title: string;
    body: string;
    testID: string;
}) {
    return (
        <YStack flex={1} backgroundColor={palette.base}>
            <ScreenHeader title="Compare" onBack={() => router.back()} />
            <YStack testID={testID} flex={1} padding="$4"
                    alignItems="center" justifyContent="center" gap="$2">
                <DotMatrixText fontSize={14} weight="bold" letterSpacing={1.6}
                               color={palette.dim}>
                    {title}
                </DotMatrixText>
                <Text color={palette.muted} fontSize={13} textAlign="center">
                    {body}
                </Text>
                <Button accessibilityRole="button" accessibilityLabel="Back"
                        chromeless onPress={() => router.back()}>
                    Back
                </Button>
            </YStack>
        </YStack>
    );
}

function SeparateCupGap({
    points,
    width,
    maxT,
    colour
}: {
    points: Point[];
    width: number;
    maxT: number;
    colour: string;
}) {
    if (points.length < 2) return null;
    const maxGap = Math.max(
        1,
        points.reduce((max, point) => Math.max(max, Math.abs(point.v)), 0)
    );
    const baseline = maxGap;
    const box = {width, height: GAP_HEIGHT, maxT, maxV: maxGap * 2};
    const top = points.map((point) => ({t: point.t, v: point.v + baseline}));
    const bottom = [...points].reverse().map((point) => ({t: point.t, v: baseline}));
    const d = `${toPath([...top, ...bottom], box)} Z`;
    const zeroY = GAP_HEIGHT / 2;
    return (
        <Svg width={width} height={GAP_HEIGHT} accessibilityRole="image"
             accessibilityLabel="Cup gap between this brew and that brew">
            <Line x1={0} y1={zeroY} x2={width} y2={zeroY}
                  stroke={palette.line} strokeWidth={1} />
            <Path testID="compare-cup-gap-separate" d={d} fill={colour}
                  fillOpacity={0.14} stroke="none" />
        </Svg>
    );
}

function CompareRateLane({
    testID,
    series,
    accent,
    width,
    maxT,
    maxRate,
    role = "subject"
}: {
    testID: string;
    series: FlowPoint[];
    accent: string;
    width: number;
    maxT: number;
    maxRate: number;
    role?: Role;
}) {
    return (
        <YStack testID={testID}>
            <BrewRateChart
                series={series}
                accent={accent}
                width={width}
                maxT={maxT}
                maxRate={maxRate}
                role={role}
            />
        </YStack>
    );
}

function traceLaneLabel(kind: "This" | "That", drewRate: boolean, startedAt: number): string {
    const suffix = `${formatBrewDate(startedAt)} ${formatBrewTime(startedAt)}`;
    return drewRate
        ? `${kind} brew trace with flow rate, ${suffix}`
        : `${kind} brew trace, ${suffix}`;
}

/**
 * Compare two brews of one recipe.
 *
 * Cup leads because the machine usually repeats the water plan; the learning
 * is how the bed gave that water back. OVERLAY is the default answer, while
 * SEPARATE is local state for this viewing moment rather than a persisted app
 * setting. SWAP is the only subject control: the keys identify the colours and
 * dates, and one honest button changes which brew leads.
 */
export default function BrewCompareScreen() {
    const {a, b} = useLocalSearchParams<{a?: string; b?: string}>();
    const {width} = useWindowDimensions();
    const chartWidth = Math.max(1, width - SCREEN_PADDING * 2);
    const comparisonState = useBrewComparison({
        a,
        b,
        chartWidth,
        chartHeight: compareTracePlotHeight(CHART_HEIGHT)
    });

    if (comparisonState.state === "missing") {
        return (
            <GuardedComparison
                testID="compare-missing"
                title={COMPARE_GUARD.missing.title}
                body={COMPARE_GUARD.missing.body}
            />
        );
    }
    if (comparisonState.state === "same") {
        return (
            <GuardedComparison
                testID="compare-same-brew"
                title={COMPARE_GUARD.same.title}
                body={COMPARE_GUARD.same.body}
            />
        );
    }
    if (comparisonState.state === "recipe") {
        return (
            <GuardedComparison
                testID="compare-different-recipes"
                title={COMPARE_GUARD.recipe.title}
                body={COMPARE_GUARD.recipe.body}
            />
        );
    }

    const {
        mode,
        setMode,
        swap,
        subject,
        reference,
        comparison,
        axis,
        subjectPlan,
        referencePlan,
        subjectHasTrace,
        referenceHasTrace,
        showRateLanes,
        traceCount,
        survivingTrace,
        hasChart,
        canKeepTrace,
        keepSurvivingTrace
    } = comparisonState;
    const copy = COMPARE_COPY[comparison.pour.verdict];

    return (
        <YStack flex={1} backgroundColor={palette.base}>
            <ScreenHeader title="Compare" onBack={() => router.back()} />
            <ScrollView testID="compare-scroll"
                        contentContainerStyle={{paddingBottom: 24, gap: 12}}>
                <YStack paddingHorizontal={SCREEN_PADDING} gap="$3">
                    <Text color={palette.dim} fontSize={13} numberOfLines={1}>
                        {subject.record.recipeName}
                    </Text>

                    <XStack alignItems="flex-start" justifyContent="space-between" gap="$3">
                        <YStack flex={1} gap="$1">
                            <YStack alignSelf="flex-start" borderRadius="$10"
                                    paddingHorizontal="$3" paddingVertical="$2"
                                    backgroundColor={palette.raised}
                                    borderWidth={1}
                                    borderColor={palette[copy.tone]}>
                                <DotMatrixText fontSize={11} weight="bold"
                                               letterSpacing={1.2}
                                               color={palette[copy.tone]}>
                                    {copy.chip}
                                </DotMatrixText>
                            </YStack>
                            <Text color={palette.dim} fontSize={13}>
                                {comparison.pour.why}
                            </Text>
                        </YStack>
                        <XStack gap="$2" flexShrink={0}>
                            <ModeButton
                                active={mode === "overlay"}
                                label="OVERLAY"
                                accessibilityLabel="Show the brews overlaid"
                                onPress={() => setMode("overlay")}
                            />
                            <ModeButton
                                active={mode === "separate"}
                                label="SEPARATE"
                                accessibilityLabel="Show the brews separately"
                                onPress={() => setMode("separate")}
                            />
                        </XStack>
                    </XStack>

                    <XStack justifyContent="space-between" gap="$3">
                        <BrewKey label="THIS BREW" record={subject.record}
                                 colour={subject.record.accent} />
                        <BrewKey label="THAT BREW" record={reference.record}
                                 colour={referenceCupColour} />
                    </XStack>
                    <Button accessibilityRole="button"
                            accessibilityLabel="Swap which brew leads"
                            chromeless
                            onPress={swap}>
                        <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.2}
                                       color={palette.dim}>
                            SWAP
                        </DotMatrixText>
                    </Button>

                    {comparison.drift.grade !== "none" && (
                        <YStack testID="compare-drift" gap="$1" padding="$3"
                                borderRadius="$5" backgroundColor={palette.surface}
                                borderWidth={1} borderColor={palette.warn}>
                            <DotMatrixText fontSize={11} weight="bold"
                                           letterSpacing={1.2} color={palette.warn}>
                                PLAN CHANGED
                            </DotMatrixText>
                            <Text color={palette.dim} fontSize={13}>
                                {compareDriftSentence(
                                    comparison.drift.grade,
                                    comparison.drift.fields
                                )}
                            </Text>
                        </YStack>
                    )}

                    {survivingTrace !== null && (
                        <YStack gap="$2">
                            <Text color={palette.warn} fontSize={13}>
                                {COMPARE_DEGRADED.one}
                            </Text>
                            {canKeepTrace && (
                                <Button accessibilityRole="button"
                                        accessibilityLabel="Keep this trace"
                                        alignSelf="flex-start"
                                        chromeless
                                        onPress={keepSurvivingTrace}>
                                    <DotMatrixText fontSize={11} weight="bold"
                                                   letterSpacing={1.2} color={palette.warn}>
                                        KEEP TRACE
                                    </DotMatrixText>
                                </Button>
                            )}
                        </YStack>
                    )}
                    {traceCount === 0 && (
                        <Text color={palette.warn} fontSize={13}>
                            {COMPARE_DEGRADED.both}
                        </Text>
                    )}

                    {hasChart && (
                        <YStack testID="compare-chart" gap="$2">
                            {mode === "overlay" ? (
                                <CompareTrace
                                    subject={subject.samples}
                                    reference={reference.samples}
                                    accent={subject.record.accent}
                                    verdict={comparison.pour.verdict}
                                    width={chartWidth}
                                    height={CHART_HEIGHT}
                                    maxT={axis.maxT}
                                    maxV={axis.maxV}
                                    subjectPlan={subjectPlan}
                                    referencePlan={referencePlan}
                                />
                            ) : (
                                <YStack gap="$2">
                                    {subjectHasTrace && (
                                        <YStack testID="compare-lane-a"
                                                accessible accessibilityRole="image"
                                                accessibilityLabel={
                                                    traceLaneLabel(
                                                        "This",
                                                        showRateLanes,
                                                        subject.record.startedAt
                                                    )
                                                }>
                                            <BrewTrace
                                                compact
                                                pours={axis.subjectPours}
                                                samples={subject.samples}
                                                accent={subject.record.accent}
                                                width={chartWidth}
                                                height={LANE_HEIGHT}
                                                plannedSeconds={plannedSeconds(axis.subjectPours)}
                                                axis={{maxT: axis.maxT, maxV: axis.maxV}}
                                            />
                                            {showRateLanes && (
                                                <CompareRateLane
                                                    testID="compare-rate-subject"
                                                    series={axis.subjectRate}
                                                    accent={subject.record.accent}
                                                    width={chartWidth}
                                                    maxT={axis.maxT}
                                                    maxRate={axis.maxRate}
                                                />
                                            )}
                                        </YStack>
                                    )}
                                    <SeparateCupGap
                                        points={comparison.cupGap}
                                        width={chartWidth}
                                        maxT={axis.maxT}
                                        colour={subject.record.accent}
                                    />
                                    {referenceHasTrace && (
                                        <YStack testID="compare-lane-b"
                                                accessible accessibilityRole="image"
                                                accessibilityLabel={
                                                    traceLaneLabel(
                                                        "That",
                                                        showRateLanes,
                                                        reference.record.startedAt
                                                    )
                                                }>
                                            <BrewTrace
                                                compact
                                                pours={axis.referencePours}
                                                samples={reference.samples}
                                                accent={subject.record.accent}
                                                role="reference"
                                                width={chartWidth}
                                                height={LANE_HEIGHT}
                                                plannedSeconds={plannedSeconds(axis.referencePours)}
                                                axis={{maxT: axis.maxT, maxV: axis.maxV}}
                                            />
                                            {showRateLanes && (
                                                <CompareRateLane
                                                    testID="compare-rate-reference"
                                                    series={axis.referenceRate}
                                                    accent={subject.record.accent}
                                                    width={chartWidth}
                                                    maxT={axis.maxT}
                                                    maxRate={axis.maxRate}
                                                    role="reference"
                                                />
                                            )}
                                        </YStack>
                                    )}
                                </YStack>
                            )}
                        </YStack>
                    )}

                    <CompareTable rows={comparison.rows} accent={subject.record.accent} />

                    <XStack gap="$3">
                        <YStack flex={1}>
                            <JudgementReadout label="THIS BREW" record={subject.record}
                                              colour={subject.record.accent} />
                        </YStack>
                        <YStack flex={1}>
                            <JudgementReadout label="THAT BREW" record={reference.record}
                                              colour={referenceCupColour} />
                        </YStack>
                    </XStack>
                </YStack>
            </ScrollView>
        </YStack>
    );
}

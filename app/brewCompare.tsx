import {useLocalSearchParams} from "expo-router";
import router from "@/hooks/steadyRouter";
import React, {useState} from "react";
import {Pressable, ScrollView, useWindowDimensions} from "react-native";
import {Button, Text, XStack, YStack} from "tamagui";

import BrewStars from "@/components/BrewStars";
import BrewTrace from "@/components/BrewTrace";
import CompareTable from "@/components/CompareTable";
import CompareTrace from "@/components/CompareTrace";
import DotMatrixText from "@/components/DotMatrixText";
import ScreenHeader from "@/components/ScreenHeader";
import {COMPARE_COPY, COMPARE_DEGRADED} from "@/constants/brewCopy";
import {palette} from "@/constants/colors";
import {SCREEN_PADDING} from "@/constants/layout";
import {sharedBrewDatabase, useBrewHistory} from "@/hooks/useBrewHistory";
import type {StoredBrew} from "@/library/BrewDatabase";
import {poursFromPlan} from "@/library/brew/BrewRecord";
import type {BrewSample} from "@/library/brew/BrewRecord";
import {
    compareBrews,
    type BrewUnderComparison
} from "@/library/brew/compare";
import {
    plannedSeconds,
    planPoints,
    toPath,
    type Box
} from "@/library/brew/brewShape";
import {referenceCupColour} from "@/library/brew/traceStyle";

type Mode = "overlay" | "separate";

const CHART_HEIGHT = 220;
const LANE_HEIGHT = 92;

function hasTrace({record, samples}: BrewUnderComparison): boolean {
    return record.hasStream && samples.length > 0;
}

function lastSecond(samples: BrewSample[]): number {
    return samples.length === 0 ? 0 : Math.max(...samples.map((sample) => sample.at / 1000));
}

function planTop(record: StoredBrew): number {
    const points = planPoints(poursFromPlan(record.plan));
    return points.length === 0 ? 0 : points[points.length - 1].v;
}

function axisFor(subject: BrewUnderComparison, reference: BrewUnderComparison) {
    const subjectPours = poursFromPlan(subject.record.plan);
    const referencePours = poursFromPlan(reference.record.plan);
    return {
        maxT: Math.max(
            1,
            lastSecond(subject.samples),
            lastSecond(reference.samples),
            plannedSeconds(subjectPours),
            plannedSeconds(referencePours)
        ),
        maxV: Math.max(
            1,
            subject.record.waterTotal,
            reference.record.waterTotal,
            planTop(subject.record),
            planTop(reference.record)
        ),
        subjectPours,
        referencePours
    };
}

function planPath(record: StoredBrew, box: Box): string {
    return toPath(planPoints(poursFromPlan(record.plan)), box);
}

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
    colour,
    onPress
}: {
    label: string;
    record: StoredBrew;
    colour: string;
    onPress: () => void;
}) {
    return (
        <Pressable accessibilityRole="button"
                   accessibilityLabel={`Make ${label.toLowerCase()} the other brew`}
                   onPress={onPress}>
            <XStack alignItems="center" gap="$2">
                <YStack width={10} height={10} borderRadius="$10" backgroundColor={colour} />
                <YStack>
                    <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.2}
                                   color={colour}>
                        {label}
                    </DotMatrixText>
                    <Text color={palette.dim} fontSize={12} numberOfLines={1}>
                        {new Date(record.startedAt).toLocaleString()}
                    </Text>
                </YStack>
            </XStack>
        </Pressable>
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

function MissingComparison() {
    return (
        <YStack flex={1} backgroundColor={palette.base}>
            <ScreenHeader title="Compare" onBack={() => router.back()} />
            <YStack testID="compare-missing" flex={1} padding="$4"
                    alignItems="center" justifyContent="center" gap="$2">
                <DotMatrixText fontSize={14} weight="bold" letterSpacing={1.6}
                               color={palette.dim}>
                    BREW NOT FOUND
                </DotMatrixText>
                <Text color={palette.muted} fontSize={13} textAlign="center">
                    One of these brews is no longer here.
                </Text>
                <Button accessibilityRole="button" accessibilityLabel="Back"
                        chromeless onPress={() => router.back()}>
                    Back
                </Button>
            </YStack>
        </YStack>
    );
}

export default function BrewCompareScreen() {
    const {a, b} = useLocalSearchParams<{a?: string; b?: string}>();
    const {open} = useBrewHistory();
    const {width} = useWindowDimensions();
    const [mode, setMode] = useState<Mode>("overlay");
    const [swapped, setSwapped] = useState(false);

    const openedA = a === undefined ? null : open(a);
    const openedB = b === undefined ? null : open(b);
    if (openedA === null || openedB === null) return <MissingComparison />;

    const originalA: BrewUnderComparison = {
        record: openedA.record,
        samples: openedA.record.hasStream ? openedA.samples : []
    };
    const originalB: BrewUnderComparison = {
        record: openedB.record,
        samples: openedB.record.hasStream ? openedB.samples : []
    };
    const subject = swapped ? originalB : originalA;
    const reference = swapped ? originalA : originalB;
    const comparison = compareBrews(subject, reference);
    const copy = COMPARE_COPY[comparison.pour.verdict];
    const axis = axisFor(subject, reference);
    const chartWidth = Math.max(1, width - SCREEN_PADDING * 2);
    const planBox: Box = {
        width: chartWidth,
        height: CHART_HEIGHT,
        maxT: axis.maxT,
        maxV: axis.maxV
    };
    const subjectPlan = planPath(subject.record, planBox);
    const referencePlan = comparison.drift.grade === "shape"
        ? planPath(reference.record, planBox)
        : undefined;
    const subjectHasTrace = hasTrace(subject);
    const referenceHasTrace = hasTrace(reference);
    const traceCount = (subjectHasTrace ? 1 : 0) + (referenceHasTrace ? 1 : 0);
    const survivingTrace = traceCount === 1
        ? subjectHasTrace ? subject : reference
        : null;
    const hasChart = traceCount > 0;
    const driftFields = comparison.drift.fields.join(", ");

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
                                 colour={subject.record.accent}
                                 onPress={() => setSwapped((was) => !was)} />
                        <BrewKey label="THAT BREW" record={reference.record}
                                 colour={referenceCupColour}
                                 onPress={() => setSwapped((was) => !was)} />
                    </XStack>
                    <Button accessibilityRole="button"
                            accessibilityLabel="Swap the two brews"
                            chromeless
                            onPress={() => setSwapped((was) => !was)}>
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
                                {comparison.drift.grade === "shape"
                                    ? `The plan shapes differ in ${driftFields}. Read the chart with care.`
                                    : `The plans differ in ${driftFields}, but the chart shape is the same.`}
                            </Text>
                        </YStack>
                    )}

                    {survivingTrace !== null && (
                        <YStack gap="$2">
                            <Text color={palette.warn} fontSize={13}>
                                {COMPARE_DEGRADED.one}
                            </Text>
                            <Button accessibilityRole="button"
                                    accessibilityLabel="Keep this trace"
                                    alignSelf="flex-start"
                                    chromeless
                                    onPress={() => sharedBrewDatabase()
                                        .setPinned(survivingTrace.record.id, true)}>
                                <DotMatrixText fontSize={11} weight="bold"
                                               letterSpacing={1.2} color={palette.warn}>
                                    KEEP TRACE
                                </DotMatrixText>
                            </Button>
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
                                        <YStack testID="compare-lane-a">
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
                                        </YStack>
                                    )}
                                    {referenceHasTrace && (
                                        <YStack testID="compare-lane-b">
                                            <BrewTrace
                                                compact
                                                pours={axis.referencePours}
                                                samples={reference.samples}
                                                accent={referenceCupColour}
                                                width={chartWidth}
                                                height={LANE_HEIGHT}
                                                plannedSeconds={plannedSeconds(axis.referencePours)}
                                                axis={{maxT: axis.maxT, maxV: axis.maxV}}
                                            />
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

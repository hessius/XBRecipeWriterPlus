import React from "react";
import {XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import FlowSparkline from "@/components/FlowSparkline";
import {palette} from "@/constants/colors";
import {formatBrewClock} from "@/library/brew/brewFormat";

// The row's tallest child is the 20 pt sparkline; the extra 4 pt matches the
// breathing room the sibling figure rows get from their text line boxes.
const FLOW_ROW_MIN_HEIGHT = 24;

type Props = {
    water: number;
    cup: number;
    seconds: number;
    accent: string;
    /**
     * Millilitres of bypass, if this brew had any.
     *
     * Broken out beside WATER rather than given a column of its own: at 28 pt
     * a fourth column is too tight to read on a narrow phone. And broken out
     * rather than added in, because 240 + 5 in one figure says the brew used
     * 245 ml of brew water, which it did not.
     */
    bypass?: number;
    /**
     * Seconds the bed took to finish after the last water, or null when the
     * brew has no drawdown to report.
     *
     * Its own line under the three rather than a fourth column, for the same
     * reason the bypass is a badge: at 28 pt a fourth column is too tight to
     * read on a narrow phone. A line also lets it carry the word, which it
     * needs -- a second clock beside TIME with no label says nothing about
     * which of the two it is.
     */
    drawdown?: number | null;
    /**
     * The instantaneous cup rate in g/s, or null when nobody can say.
     *
     * Null and not 0. The row is absent before a brew has poured and while
     * the bypass is the only thing on the scale, because a rate of 0 would be
     * a claim that the bed has stopped.
     */
    flow?: number | null;
    /** The last 30 seconds of cup rate. Empty draws no sparkline. */
    flowTail?: number[];
    /**
     * The instantaneous pour rate in ml/s, or null when nobody can say.
     *
     * Same absence rule as `flow`, and it rides along rather than leading:
     * the cup rate is the subject, the pour rate is what the machine is doing
     * about it.
     */
    pourRate?: number | null;
    /**
     * Reserve the flow row's height even when there is nothing to draw.
     *
     * Live only. A finished record and the shared image cannot gain a rate
     * later, so reserving there is dead space in a still picture.
     */
    reserveFlow?: boolean;
    /**
     * The average rate across the drawdown, in g/s.
     *
     * It sits on the drawdown line because it is a property of that same
     * interval, not a fourth total beside water, cup and time.
     */
    drawdownRate?: number | null;
    /**
     * What the machine's grind dial read, as a ready line, or null when there
     * is nothing the record may say.
     *
     * A line rather than a number because the wording is the honesty rule:
     * `dialNote` owns both, so one screen cannot start claiming the coffee
     * was ground at a setting while another reports where a dial was. Null on
     * the live screen, where the reading is taken after the brew has ended.
     */
    dial?: string | null;
};

function Figure({label, value, color, badge}: {
    label: string; value: string; color: string; badge?: React.ReactNode;
}) {
    return (
        <YStack flex={1} gap="$1">
            <DotMatrixText fontSize={10} weight="bold" letterSpacing={1.6}
                           color={palette.dim}>
                {label}
            </DotMatrixText>
            <XStack alignItems="center" gap="$1.5">
                <DotMatrixText fontSize={28} weight="bold" color={color}>
                    {value}
                </DotMatrixText>
                {badge}
            </XStack>
        </YStack>
    );
}

/**
 * The three numbers, at the app's machine-readout scale.
 *
 * Rounded to whole units because the scale reports tenths and they flicker;
 * a figure this size that changes every 100 ms cannot be read at all.
 */
export default function BrewFigures(
    {
        water, cup, seconds, accent, bypass, drawdown = null, flow = null,
        flowTail, pourRate = null, reserveFlow = false, drawdownRate = null,
        dial = null
    }: Props
) {
    const badge = bypass === undefined || bypass <= 0 ? undefined : (
        <XStack testID="figures-bypass"
                paddingHorizontal={4} paddingVertical={1}
                borderRadius="$2" borderWidth={1} borderStyle="dashed"
                borderColor={palette.line}>
            <DotMatrixText fontSize={11} weight="bold" color={palette.dim}>
                {`+${Math.round(bypass)}`}
            </DotMatrixText>
        </XStack>
    );
    const hasFlow = flow !== null;
    const hasFlowTail = flowTail !== undefined && flowTail.length >= 2;
    const drawdownText = drawdown === null
        ? null
        : `DRAWDOWN ${formatBrewClock(drawdown)}${
            drawdownRate === null ? "" : ` · ${drawdownRate.toFixed(1)} g/s`
        }`;

    return (
        <YStack gap="$1.5">
            <XStack gap="$3">
                <Figure label="WATER" value={String(Math.round(water))} color={accent}
                        badge={badge} />
                <Figure label="CUP" value={String(Math.round(cup))} color={palette.text} />
                <Figure label="TIME" value={formatBrewClock(seconds)} color={palette.text} />
            </XStack>
            {(hasFlow || reserveFlow) && (
                <YStack testID="figures-flow-slot"
                        minHeight={reserveFlow ? FLOW_ROW_MIN_HEIGHT : undefined}
                        justifyContent="center">
                    {hasFlow && (
                        <XStack testID="figures-flow" alignItems="center"
                                justifyContent="space-between" gap="$2">
                            <DotMatrixText fontSize={10} weight="bold" letterSpacing={1.6}
                                           color={palette.dim}>
                                FLOW
                            </DotMatrixText>
                            <XStack alignItems="center" gap="$3">
                                {hasFlowTail && (
                                    <FlowSparkline values={flowTail} accent={accent} />
                                )}
                                <DotMatrixText fontSize={14} weight="bold" color={palette.text}>
                                    {`${flow.toFixed(1)} g/s`}
                                </DotMatrixText>
                                {pourRate !== null && (
                                    <DotMatrixText fontSize={10} weight="bold"
                                                   letterSpacing={1.6} color={palette.dim}>
                                        {`POUR ${pourRate.toFixed(1)}`}
                                    </DotMatrixText>
                                )}
                            </XStack>
                        </XStack>
                    )}
                </YStack>
            )}
            {/* Absent, not zero, when it was not measured. A brew that was
                interrupted never drew down and a record written before the
                boundary was kept cannot say, and printing 0:00 for either
                would invent a figure somebody might dial a grind against. */}
            {drawdownText !== null && (
                <DotMatrixText testID="figures-drawdown" fontSize={10} weight="bold"
                               letterSpacing={1.6} color={palette.dim}>
                    {drawdownText}
                </DotMatrixText>
            )}
            {dial !== null && (
                <DotMatrixText testID="figures-dial" fontSize={10} weight="bold"
                               letterSpacing={1.6} color={palette.dim}>
                    {dial}
                </DotMatrixText>
            )}
        </YStack>
    );
}

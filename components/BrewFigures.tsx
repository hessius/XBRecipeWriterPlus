import React from "react";
import {XStack, YStack} from "tamagui";

import DotMatrixText, {drawnFontSize} from "@/components/DotMatrixText";
import FlowSparkline, {
    FLOW_SPARKLINE_HEIGHT,
    FLOW_SPARKLINE_MIN_POINTS
} from "@/components/FlowSparkline";
import {palette} from "@/constants/colors";
import {formatBrewClock} from "@/library/brew/brewFormat";
import type {GrindFigure} from "@/library/brew/dialAfterBrew";
import {
    BREW_FIGURE_DETAIL_VALUE_SIZE,
    BREW_FIGURE_INTERNAL_GAP,
    BREW_FIGURE_LABEL_SIZE,
    BREW_FIGURE_ROW_GAP,
    brewFigureBadgeGeometry,
    brewFigureTextGeometry
} from "@/library/brew/figureGeometry";
import {formatFlowRate} from "@/library/brew/flowRate";

const DOTO_LINE_HEIGHT = 1.35;
const FLOW_ROW_VERTICAL_ROOM = 4;

export function flowRowMinHeight(): number {
    const cupRateHeight = Math.ceil(drawnFontSize(14) * DOTO_LINE_HEIGHT);
    return Math.max(FLOW_SPARKLINE_HEIGHT, cupRateHeight) + FLOW_ROW_VERTICAL_ROOM;
}

export function detailRowMinHeight(): number {
    return Math.ceil(drawnFontSize(BREW_FIGURE_LABEL_SIZE) * DOTO_LINE_HEIGHT)
        + BREW_FIGURE_INTERNAL_GAP
        + Math.ceil(drawnFontSize(BREW_FIGURE_DETAIL_VALUE_SIZE) * DOTO_LINE_HEIGHT);
}

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
    /** The last 30 seconds of cup rate. Fewer than two readings draw no sparkline. */
    flowTail?: number[] | null;
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
     * Reserve the live second figures row before the clock may print.
     *
     * Live only. Records and shared images either have row two or do not, but
     * the live screen can learn drawdown and delay after the boundary.
     */
    reserveDrawdown?: boolean;
    /**
     * The average rate across the drawdown, in g/s.
     *
     * It sits on the drawdown figure because it is a property of that same
     * interval, not a fourth total beside water, cup and time.
     */
    drawdownRate?: number | null;
    /** Seconds late to the pour end, or null when nobody can say. */
    delay?: number | null;
    /**
     * What the machine's grind dial read, and the recipe grind if it differed.
     *
     * Null on the live screen, where the reading is taken after the brew has
     * ended.
     */
    grind?: GrindFigure | null;
    /** Story cards shrink figures from the 430 pt reference width. */
    textScale?: number;
};

function FigureBadge({children, testID, textScale = 1}: {
    children: string | number;
    testID?: string;
    textScale?: number;
}) {
    const badge = brewFigureBadgeGeometry(textScale);
    return (
        <XStack testID={testID}
                paddingHorizontal={badge.paddingHorizontal}
                paddingVertical={badge.paddingVertical}
                borderRadius={badge.borderRadius}
                borderWidth={badge.borderWidth} borderStyle="dashed"
                borderColor={palette.line}>
            <DotMatrixText fontSize={badge.fontSize} weight="bold" color={palette.dim}
                           letterSpacing={badge.tracking} minFontSize={0}>
                {children}
            </DotMatrixText>
        </XStack>
    );
}

function Figure({
    label, value, color, badge, badgeGap, fontSize, labelSize, labelTracking, valueTracking,
    testID, accessibilityLabel
}: {
    label: string;
    value: string;
    color: string;
    badge?: React.ReactNode;
    badgeGap?: number;
    fontSize: number;
    labelSize?: number;
    labelTracking?: number;
    valueTracking?: number;
    testID?: string;
    accessibilityLabel?: string;
}) {
    return (
        <YStack flex={1} gap={BREW_FIGURE_INTERNAL_GAP} testID={testID}
                minWidth={0}
                accessible={accessibilityLabel !== undefined}
                accessibilityLabel={accessibilityLabel}>
            <DotMatrixText fontSize={labelSize ?? BREW_FIGURE_LABEL_SIZE}
                           weight="bold" numberOfLines={1}
                           letterSpacing={labelTracking ?? 1.6} color={palette.dim}>
                {label}
            </DotMatrixText>
            <XStack alignItems="center" gap={badgeGap ?? brewFigureBadgeGeometry().gap}>
                <DotMatrixText fontSize={fontSize} weight="bold" color={color}
                               letterSpacing={valueTracking ?? 0.5}
                               numberOfLines={1}>
                    {value}
                </DotMatrixText>
                {badge}
            </XStack>
        </YStack>
    );
}

function FigurePlaceholder({testID}: {testID: string}) {
    return <YStack testID={testID} flex={1} />;
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
        flowTail, pourRate = null, reserveFlow = false, reserveDrawdown = false,
        drawdownRate = null, delay = null, grind = null, textScale = 1
    }: Props
) {
    const figureText = brewFigureTextGeometry(textScale);
    const badgeGeometry = brewFigureBadgeGeometry(textScale);
    const badge = bypass === undefined || bypass <= 0 ? undefined : (
        <FigureBadge testID="figures-bypass" textScale={textScale}>
            {`+${Math.round(bypass)}`}
        </FigureBadge>
    );
    const flowText = flow === null ? null : formatFlowRate(flow);
    const pourRateText = pourRate === null ? null : formatFlowRate(pourRate);
    const drawdownRateText = drawdownRate === null ? null : formatFlowRate(drawdownRate);
    // A row exists when the caller had a rate to give. The formatter only
    // declines a non-finite number, so presence stays one upstream decision
    // and the row cannot blink as a noisy fit crosses zero.
    const hasFlow = flowText !== null;
    const hasFlowTail = (flowTail?.length ?? 0) >= FLOW_SPARKLINE_MIN_POINTS;
    const flowAccessibilityLabel = flowText === null
        ? undefined
        : `Flow, ${flowText} grams per second${
            pourRateText === null ? "" : `, pouring ${pourRateText} millilitres per second`
        }`;
    const drawdownText = drawdown === null ? null : formatBrewClock(drawdown);
    const hasDetailRow = drawdownText !== null || delay !== null || grind !== null;
    const drawdownAccessibility = drawdown === null
        ? undefined
        : `Drawdown, ${Math.floor(drawdown)} seconds${
            drawdownRateText === null
                ? ""
                : `, average ${drawdownRateText} grams per second`
        }`;
    const delayAccessibility = delay === null ? undefined : `Delay, ${delay} seconds`;
    const grindAccessibility = grind === null
        ? undefined
        : grind.kind === "off"
            ? "Grind, the grinder was off"
            : `Grind, dial ${grind.dial}${
                grind.recipe === null ? "" : `, recipe ${grind.recipe}`
            }`;

    return (
        <YStack testID="brew-figures" gap={BREW_FIGURE_ROW_GAP}>
            <XStack gap={figureText.columnGap}>
                <Figure label="WATER" value={String(Math.round(water))} color={accent}
                        badge={badge} fontSize={figureText.valueSize}
                        badgeGap={badgeGeometry.gap}
                        labelSize={figureText.labelSize}
                        labelTracking={figureText.labelTracking}
                        valueTracking={figureText.valueTracking}
                        testID="figures-water" />
                <Figure label="CUP" value={String(Math.round(cup))} color={palette.text}
                        fontSize={figureText.valueSize}
                        badgeGap={badgeGeometry.gap}
                        labelSize={figureText.labelSize}
                        labelTracking={figureText.labelTracking}
                        valueTracking={figureText.valueTracking}
                        testID="figures-cup" />
                <Figure label="TIME" value={formatBrewClock(seconds)} color={palette.text}
                        fontSize={figureText.valueSize}
                        badgeGap={badgeGeometry.gap}
                        labelSize={figureText.labelSize}
                        labelTracking={figureText.labelTracking}
                        valueTracking={figureText.valueTracking}
                        testID="figures-time" />
            </XStack>
            {(hasFlow || reserveFlow) && (
                <YStack testID="figures-flow-slot"
                        minHeight={reserveFlow ? flowRowMinHeight() : undefined}
                        justifyContent="center">
                    {hasFlow && (
                        <XStack testID="figures-flow" alignItems="center"
                                accessible
                                accessibilityLabel={flowAccessibilityLabel}
                                justifyContent="space-between" gap="$2">
                            <DotMatrixText fontSize={10} weight="bold" letterSpacing={1.6}
                                           color={palette.dim}>
                                FLOW
                            </DotMatrixText>
                            <XStack alignItems="center" gap="$3" flex={1} minWidth={0}
                                    justifyContent="flex-end">
                                {hasFlowTail && flowTail !== null && flowTail !== undefined && (
                                    <FlowSparkline values={flowTail} accent={accent} />
                                )}
                                <DotMatrixText fontSize={14} weight="bold" color={palette.text}
                                               numberOfLines={1} style={{flexShrink: 0}}>
                                    {`${flowText} G/S`}
                                </DotMatrixText>
                                {pourRateText !== null && (
                                    <DotMatrixText fontSize={10} weight="bold"
                                                   letterSpacing={1.6} color={palette.dim}
                                                   numberOfLines={1} style={{flexShrink: 0}}>
                                        {`POUR ${pourRateText} ML/S`}
                                    </DotMatrixText>
                                )}
                            </XStack>
                        </XStack>
                    )}
                </YStack>
            )}
            {/* Absent, not zero, when a figure was not measured. A cancelled
                brew never drew down, an old record cannot say, and 0:00 would
                invent a figure somebody might dial a grind against. */}
            {(hasDetailRow || reserveDrawdown) && (
                <YStack testID="figures-detail-slot"
                        minHeight={reserveDrawdown ? detailRowMinHeight() : undefined}
                        justifyContent="center">
                    {hasDetailRow && (
                        <XStack testID="figures-detail-row" gap={figureText.columnGap}>
                            {/* TIME is the right figure above, and DRAWDOWN is
                                also a duration, so the right column rhymes. */}
                            {grind === null ? (
                                <FigurePlaceholder testID="figures-grind-placeholder" />
                            ) : (
                                <Figure
                                    testID="figures-grind"
                                    // GRIND SIZE is 80.4 pt at font scale 1.0
                                    // and 106.83 pt at the bounded 1.4 scale,
                                    // overflowing a 102.33 pt slot on a
                                    // 393 pt screen.
                                    label="GRIND"
                                    value={grind.kind === "off" ? "OFF" : String(grind.dial)}
                                    color={palette.text}
                                    fontSize={figureText.detailValueSize}
                                    badgeGap={badgeGeometry.gap}
                                    labelSize={figureText.labelSize}
                                    labelTracking={figureText.labelTracking}
                                    valueTracking={figureText.valueTracking}
                                    badge={grind.kind === "off" || grind.recipe === null
                                        ? undefined
                                        : (
                                            <FigureBadge testID="figures-grind-recipe"
                                                         textScale={textScale}>
                                                {`RECIPE ${grind.recipe}`}
                                            </FigureBadge>
                                        )}
                                    accessibilityLabel={grindAccessibility}
                                />
                            )}
                            {delay === null ? (
                                <FigurePlaceholder testID="figures-delay-placeholder" />
                            ) : (
                                <Figure
                                    testID="figures-delay"
                                    label="DELAY"
                                    value={`+${delay}`}
                                    color={palette.warn}
                                    fontSize={figureText.detailValueSize}
                                    badgeGap={badgeGeometry.gap}
                                    labelSize={figureText.labelSize}
                                    labelTracking={figureText.labelTracking}
                                    valueTracking={figureText.valueTracking}
                                    accessibilityLabel={delayAccessibility}
                                />
                            )}
                            {drawdownText === null ? (
                                <FigurePlaceholder testID="figures-drawdown-placeholder" />
                            ) : (
                                <Figure
                                    testID="figures-drawdown"
                                    label="DRAWDOWN"
                                    value={drawdownText}
                                    color={palette.text}
                                    fontSize={figureText.detailValueSize}
                                    badgeGap={badgeGeometry.gap}
                                    labelSize={figureText.labelSize}
                                    labelTracking={figureText.labelTracking}
                                    valueTracking={figureText.valueTracking}
                                    badge={drawdownRateText === null
                                        ? undefined
                                        : (
                                            <FigureBadge testID="figures-drawdown-rate"
                                                         textScale={textScale}>
                                                {`${drawdownRateText} G/S`}
                                            </FigureBadge>
                                        )}
                                    accessibilityLabel={drawdownAccessibility}
                                />
                            )}
                        </XStack>
                    )}
                </YStack>
            )}
        </YStack>
    );
}

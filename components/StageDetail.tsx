import React from "react";
import {Pressable} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {glyphForPattern} from "@/components/PourGlyph";
import {
    AGITATION_SENTENCE,
    PATTERN_SENTENCE,
    STAGE_DETAIL_LABEL,
    STAGE_NO_HOLD,
    STAGE_POURED_IN_FULL,
    STAGE_SHORT_CANCELLED,
    STAGE_SHORT_UNDERDELIVERED,
    STAGE_TIMING_UNAVAILABLE,
    stageShortLine
} from "@/constants/brewCopy";
import {palette} from "@/constants/colors";
import type {BrewOutcome, BrewSample} from "@/library/brew/BrewRecord";
import type {Stall} from "@/library/brew/stalls";
import {stageStory} from "@/library/brew/stageStory";
import type Pour from "@/library/Pour";

type Props = {
    /** Zero-based index of the selected stage. */
    index: number;
    /** The plan for that stage, from the record's own snapshot. */
    stage: Pour;
    /** Millilitres the stage actually delivered. */
    deliveredMl: number;
    /** The stalls recorded for this stage. May be empty. */
    stalls: Stall[];
    /**
     * The whole brew's sample stream, `pour` 1-based, `at` ms from first drop.
     * EMPTY when the raw trace was swept by the retention setting.
     */
    samples: BrewSample[];
    /** False when the stream was not kept; `samples` is then empty. */
    hasStream: boolean;
    /** How the brew as a whole ended. */
    outcome: BrewOutcome;
    /** The recipe's accent colour. */
    accent: string;
    /** Dismiss the panel. */
    onClose: () => void;
};

/** A Doto label above one part of the story. Module scope: never a fresh type. */
function Section({label, children}: {label: string; children: React.ReactNode}) {
    return (
        <YStack gap="$1">
            <DotMatrixText fontSize={10} weight="bold" letterSpacing={1.6}
                           color={palette.dim}>
                {label}
            </DotMatrixText>
            {children}
        </YStack>
    );
}

/**
 * What one recorded stage actually did.
 *
 * A fixed panel below the figures, filled when a rung or trace segment is
 * selected. It answers the question the ladder cannot fit: what the stage was
 * asked for, what it delivered, where and how long it held, and when it ran —
 * the same story the live brew card tells, but with the end result in hand,
 * including the shortfall and the holds. When the stream was swept it degrades
 * to what the record still knows rather than going blank: the delivered volume
 * and the holds survive the sweep, only the timing does not.
 */
export default function StageDetail({
    index, stage, deliveredMl, stalls, samples, hasStream, outcome, accent, onClose
}: Props) {
    const story = stageStory({index, stage, deliveredMl, stalls, samples, hasStream});

    // The same sentences the live brew card uses, so a stage reads the same way
    // whether it is happening or done. Agitation is a separate field with its
    // own clause; `ALL_OFF` is absent from the table, so a stage that does not
    // stir says nothing about stirring.
    const kind = glyphForPattern(stage.pourPattern);
    const stir = AGITATION_SENTENCE[stage.agitation];
    const askedProse = stir === undefined
        ? `${PATTERN_SENTENCE[kind]}.`
        : `${PATTERN_SENTENCE[kind]}. ${stir}`;

    const shortWhy = outcome === "cancelled"
        ? STAGE_SHORT_CANCELLED : STAGE_SHORT_UNDERDELIVERED;

    return (
        <YStack testID="stage-detail" backgroundColor={palette.raised}
                borderRadius="$4" padding="$3" gap="$3">
            <XStack alignItems="center" justifyContent="space-between">
                <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.6}
                               color={accent}>
                    {`STAGE ${story.stageNumber}`}
                </DotMatrixText>
                <Pressable accessibilityRole="button" accessibilityLabel="Close"
                           testID="stage-detail-close" onPress={onClose} hitSlop={12}>
                    <DotMatrixText fontSize={11} weight="bold" letterSpacing={2}
                                   color={palette.dim}>
                        CLOSE
                    </DotMatrixText>
                </Pressable>
            </XStack>

            <Section label={STAGE_DETAIL_LABEL.askedFor}>
                <DotMatrixText fontSize={13} weight="bold" color={accent}>
                    {`${story.plannedMl} ML · ${story.temperature}°`}
                </DotMatrixText>
                <Text color={palette.dim} fontSize={13}>{askedProse}</Text>
            </Section>

            <Section label={STAGE_DETAIL_LABEL.delivered}>
                <DotMatrixText fontSize={13} weight="bold" color={palette.text}>
                    {`${Math.round(story.deliveredMl)} ML OF ${story.plannedMl}`}
                </DotMatrixText>
                {story.stoppedShort ? (
                    <YStack gap="$1">
                        <DotMatrixText testID="stage-detail-short" fontSize={11}
                                       weight="bold" letterSpacing={1.6}
                                       color={palette.warn}>
                            {stageShortLine(Math.round(story.shortfallMl))}
                        </DotMatrixText>
                        <Text color={palette.dim} fontSize={13}>{shortWhy}</Text>
                    </YStack>
                ) : (
                    <Text color={palette.dim} fontSize={13}>{STAGE_POURED_IN_FULL}</Text>
                )}
            </Section>

            <Section label={STAGE_DETAIL_LABEL.held}>
                {story.holds.length === 0 ? (
                    <Text color={palette.dim} fontSize={13}>{STAGE_NO_HOLD}</Text>
                ) : (
                    <YStack gap="$1">
                        {story.holds.map((hold, i) => (
                            <DotMatrixText key={i} fontSize={13} weight="bold"
                                           color={palette.text}>
                                {`${hold.seconds} S AT ${hold.atMl} ML`}
                            </DotMatrixText>
                        ))}
                        <DotMatrixText testID="stage-detail-held-total" fontSize={11}
                                       weight="bold" letterSpacing={1.4}
                                       color={palette.dim}>
                            {`${story.totalHeldSeconds} S HELD IN TOTAL`}
                        </DotMatrixText>
                    </YStack>
                )}
            </Section>

            <Section label={STAGE_DETAIL_LABEL.when}>
                {story.timing.available ? (
                    <DotMatrixText testID="stage-detail-when" fontSize={13}
                                   weight="bold" color={palette.text}>
                        {`${Math.round(story.timing.startSec)} S – `
                            + `${Math.round(story.timing.endSec)} S`}
                    </DotMatrixText>
                ) : (
                    <Text testID="stage-detail-when-missing" color={palette.muted}
                          fontSize={13}>
                        {STAGE_TIMING_UNAVAILABLE}
                    </Text>
                )}
            </Section>
        </YStack>
    );
}

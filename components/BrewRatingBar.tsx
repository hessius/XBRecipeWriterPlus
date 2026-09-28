import React from "react";
import {Pressable} from "react-native";
import Animated, {FadeIn, SlideOutDown} from "react-native-reanimated";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {XStack, YStack} from "tamagui";

import BrewStars from "@/components/BrewStars";
import BrewTrace from "@/components/BrewTrace";
import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import {
    RATING_PROMPT_DISMISS_LABEL,
    RATING_PROMPT_OPEN_LABEL,
    RATING_PROMPT_QUESTION
} from "@/constants/brewCopy";
import {palette} from "@/constants/colors";
import {DURATION} from "@/constants/motion";
import {plannedSeconds} from "@/library/brew/brewShape";
import type Pour from "@/library/Pour";

const TRACE_WIDTH = 86;
const TRACE_HEIGHT = 34;
/** The live bar's padding, kept identical so the slot does not resize. */
const BAR_PADDING = 10;

/**
 * The last brew, asking how it was.
 *
 * The same height, padding and 86x34 trace as `BrewMiniBar`, so a slot that
 * changes occupant does not change size. It is a sibling rather than a tenth
 * state of that component: every state there is about a machine that is
 * running, and this one is about a machine that stopped an hour ago.
 *
 * The figures lead and the recipe follows. A recipe name does not identify a
 * brew when the same recipe was made three times this week; `14:32 · 244 G`
 * does.
 *
 * Two tap targets, which `BrewMiniBar` deliberately avoids. They are allowed
 * here because they are not two routes to one place: the left opens the brew,
 * the stars answer the question, and a star is visibly a control rather than a
 * label.
 */
export default function BrewRatingBar({
    recipeName, figures, pours, accent, onOpen, onRate, onDismiss
}: {
    recipeName: string;
    /** `14:32 · 244 G`, already formatted by the caller. */
    figures: string;
    pours: Pour[];
    /** Draws the planned silhouette: this bar identifies a brew, it is not a chart. */
    accent: string;
    onOpen: () => void;
    onRate: (rating: number) => void;
    onDismiss: () => void;
}) {
    const insets = useSafeAreaInsets();

    return (
        <Animated.View
            entering={FadeIn.duration(DURATION.base)}
            exiting={SlideOutDown.duration(DURATION.base)}
        >
            <XStack
                testID="rating-bar"
                alignItems="center"
                gap="$3"
                padding={BAR_PADDING}
                paddingBottom={insets.bottom + BAR_PADDING}
                backgroundColor={palette.surface}
                borderTopWidth={1}
                borderTopColor={palette.line}
            >
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${RATING_PROMPT_OPEN_LABEL}: ${figures}, ${recipeName}`}
                    onPress={onOpen}
                    style={{flexDirection: "row", alignItems: "center", flex: 1, gap: 12}}
                >
                    <BrewTrace
                        pours={pours}
                        samples={[]}
                        accent={accent}
                        width={TRACE_WIDTH}
                        height={TRACE_HEIGHT}
                        plannedSeconds={plannedSeconds(pours)}
                        compact
                    />
                    <YStack flex={1} gap="$1">
                        <DotMatrixText fontSize={12} weight="bold" color={palette.text}>
                            {figures}
                        </DotMatrixText>
                        <DotMatrixText fontSize={10} weight="bold" letterSpacing={1.4}
                                       color={palette.dim}>
                            {`${recipeName.toUpperCase()} · ${RATING_PROMPT_QUESTION}`}
                        </DotMatrixText>
                    </YStack>
                </Pressable>

                {/* Unrated, so `BrewStars` draws all five as a control. */}
                <BrewStars rating={0} onRate={onRate} clearable={false}
                           testID="rating-bar-stars"/>

                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={RATING_PROMPT_DISMISS_LABEL}
                    hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}
                    onPress={onDismiss}
                >
                    <DotIcon name="close" size={14} color={palette.dim} />
                </Pressable>
            </XStack>
        </Animated.View>
    );
}

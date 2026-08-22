import React from "react";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming
} from "react-native-reanimated";
import {XStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import {DURATION, EASING, useReducedMotion} from "@/constants/motion";

/** The size a screen title uses when the header is at rest. */
export const TITLE_FONT_SIZE = 28;

/** The size it shrinks to once the header collapses. */
export const TITLE_FONT_SIZE_COMPACT = 18;

/**
 * How far the superscript sits below the top of the title's line. Derived from
 * the title size rather than written as a literal so the two cannot drift apart
 * — including part-way through the collapse, which is why it is a worklet: it
 * is evaluated on the UI thread against the animated size, every frame.
 */
function countLift(fontSize: number): number {
    "worklet";
    return Math.round(fontSize * 0.14);
}

type Props = {
    /** Prose, so this is Inter — never rendered in Doto. */
    title: string;
    /** Rendered as a small superscript. Hidden when absent or zero. */
    count?: number;
    fontSize?: number;
};

/**
 * A screen title with a machine-counted superscript beside it.
 *
 * The split is the typography rule in miniature: the word is prose, the number
 * is a machine-derived value.
 *
 * The title animates between sizes rather than snapping, because the header
 * collapses under a finger that is still moving. The count does not scale with
 * it: Doto has an 11 px legibility floor, and a superscript that shrank with
 * the title would go straight through it.
 */
export default function ScreenTitle({title, count, fontSize = TITLE_FONT_SIZE}: Props) {
    const showCount = typeof count === "number" && count > 0;
    const reduced = useReducedMotion();

    const size = useSharedValue(fontSize);

    React.useEffect(() => {
        size.value = reduced
            ? fontSize
            : withTiming(fontSize, {duration: DURATION.base, easing: EASING.inOut});
    }, [fontSize, reduced, size]);

    const titleStyle = useAnimatedStyle(() => ({fontSize: size.value}));
    const countStyle = useAnimatedStyle(() => ({marginTop: countLift(size.value)}));

    return (
        <XStack alignItems="flex-start" gap="$1">
            {/* Without flexShrink a long title keeps its full measured width
                and pushes the count off the edge of the screen. */}
            <Animated.Text
                numberOfLines={1}
                style={[
                    {fontWeight: "700", color: palette.text, flexShrink: 1},
                    titleStyle
                ]}>
                {title}
            </Animated.Text>
            {showCount && (
                <Animated.View testID="screen-title-count-lift" style={countStyle}>
                    <DotMatrixText testID="screen-title-count" fontSize={11}
                                   weight="bold" color={palette.dim}>
                        {count}
                    </DotMatrixText>
                </Animated.View>
            )}
        </XStack>
    );
}

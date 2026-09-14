import React, {useEffect, useState} from "react";
import {View, type LayoutChangeEvent} from "react-native";
import Animated, {
    cancelAnimation,
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withTiming
} from "react-native-reanimated";

import {useReducedMotion} from "@/constants/motion";

/**
 * How fast the text travels, in points per second.
 *
 * Constant speed rather than constant duration: a fixed duration makes a long
 * name sprint and a barely-overflowing one crawl, and the reader has to
 * re-learn the pace for every recipe.
 */
export const MARQUEE_SPEED_PX_S = 40;

/** Below this a barely-overflowing name would twitch rather than travel. */
export const MARQUEE_MIN_MS = 600;

/**
 * How long the text sits still at each end.
 *
 * The rest is the point of this rather than a continuous crawl: the name is
 * readable in its resting position most of the time, and the movement is an
 * occasional offer to see the rest of it, not a permanent distraction on a
 * screen the user is trying to read numbers off.
 */
export const MARQUEE_REST_MS = 2200;

/** How long a run of `distance` points should take. Exported for its test. */
export function marqueeDuration(distance: number): number {
    if (distance <= 0) return 0;
    return Math.max(MARQUEE_MIN_MS, Math.round((distance / MARQUEE_SPEED_PX_S) * 1000));
}

type Props = {
    /**
     * The single line to show. Rendered whole and clipped, never ellipsised:
     * the travelling is what reveals the end, so there must be an end to
     * reveal.
     */
    children: React.ReactNode;
    /**
     * Holds the text at its resting position and stops the loop.
     *
     * The brew record sets this while it photographs the screen. A capture
     * taken mid-travel would freeze the name half-scrolled in a PNG that can
     * never scroll back.
     */
    paused?: boolean;
    testID?: string;
};

/**
 * A single line that shows its own end, when it has one to show.
 *
 * A truncated recipe name is a name the user cannot read, and the record screen
 * has nowhere to put a second line. So the line rests where it starts, travels
 * to its end, rests there, and comes back — with the rests long enough that the
 * screen is still most of the time.
 *
 * Text that fits does not move at all, and neither does any text when the
 * system asks for reduced motion: the fallback is the truncation we had, which
 * is worse but not misleading.
 */
export default function MarqueeText({children, paused = false, testID}: Props) {
    const reduced = useReducedMotion();
    const [frameWidth, setFrameWidth] = useState(0);
    const [textWidth, setTextWidth] = useState(0);
    const offset = useSharedValue(0);

    const overflow = textWidth - frameWidth;
    // Both widths start at zero, and zero minus zero is not an overflow. Only
    // once the text has actually been measured does a difference mean anything.
    const travels = frameWidth > 0 && overflow > 0 && !reduced && !paused;

    useEffect(() => {
        if (!travels) {
            cancelAnimation(offset);
            offset.value = 0;
            return;
        }
        const duration = marqueeDuration(overflow);
        offset.value = withRepeat(
            withSequence(
                // The first rest is at the start, so a name that has just
                // appeared is readable from its beginning before anything moves.
                withDelay(MARQUEE_REST_MS,
                          withTiming(-overflow, {duration, easing: Easing.linear})),
                withDelay(MARQUEE_REST_MS,
                          withTiming(0, {duration, easing: Easing.linear}))
            ),
            -1,
            false
        );
        return () => cancelAnimation(offset);
    }, [travels, overflow, offset]);

    const style = useAnimatedStyle(() => ({transform: [{translateX: offset.value}]}));

    const onFrame = (e: LayoutChangeEvent) => setFrameWidth(e.nativeEvent.layout.width);
    const onText  = (e: LayoutChangeEvent) => setTextWidth(e.nativeEvent.layout.width);

    return (
        <View testID={testID} style={{overflow: "hidden"}} onLayout={onFrame}>
            {/* `alignSelf: "flex-start"` lets the row measure its natural width
                rather than the frame's, which is the whole basis of the
                overflow the travel is calculated from. */}
            <Animated.View testID="marquee-track"
                           style={[{flexDirection: "row", alignSelf: "flex-start"}, style]}
                           onLayout={onText}>
                {children}
            </Animated.View>
        </View>
    );
}

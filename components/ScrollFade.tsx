import React from "react";
import {StyleSheet} from "react-native";
import Animated, {useAnimatedStyle} from "react-native-reanimated";
import type {SharedValue} from "react-native-reanimated";
import Svg, {Defs, LinearGradient, Rect, Stop} from "react-native-svg";

import {palette} from "@/constants/colors";
import {FADE_HEIGHT} from "@/library/scrollFade";

/**
 * A gradient at a scroller's bottom edge, saying that the content carries on
 * below it.
 *
 * It fades to the colour behind the scroller rather than to a grey, so the
 * content appears to run out under the edge instead of under a bar. That
 * makes `color` the background it is drawn over, and getting it wrong looks
 * like a smudge rather than like a fade.
 *
 * It is decorative and it must never be either touchable or readable: it
 * covers the last rung of the stage ladder, which is real content, so a
 * gradient that swallowed a tap or announced itself would take something
 * away in exchange for a hint.
 */
export default function ScrollFade({
    progress, color = palette.base, testID
}: {
    progress: SharedValue<number>;
    color?: string;
    testID?: string;
}) {
    const id = React.useId();
    const fillId = `scroll-fade-${id}`;

    const style = useAnimatedStyle(() => ({opacity: progress.value}));

    return (
        <Animated.View testID={testID} style={[styles.edge, style]}
                       pointerEvents="none"
                       accessibilityElementsHidden={true}
                       importantForAccessibility="no-hide-descendants">
            <Svg width="100%" height={FADE_HEIGHT}>
                <Defs>
                    <LinearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={color} stopOpacity={0} />
                        <Stop offset="1" stopColor={color} stopOpacity={1} />
                    </LinearGradient>
                </Defs>
                <Rect x="0" y="0" width="100%" height={FADE_HEIGHT}
                      fill={`url(#${fillId})`} />
            </Svg>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    edge: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: FADE_HEIGHT
    }
});

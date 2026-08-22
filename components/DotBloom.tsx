import React from "react";
import {View} from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming
} from "react-native-reanimated";

import {DURATION, EASING, useReducedMotion} from "@/constants/motion";
import {palette} from "@/constants/colors";

/** How many dots of `total` are lit at a given progress. */
export function litCount(progress: number, total: number): number {
    if (!Number.isFinite(progress)) {
        return 0;
    }
    return Math.round(Math.min(Math.max(progress, 0), 1) * total);
}

type DotProps = {
    lit: boolean;
    index: number;
    total: number;
    radius: number;
    size: number;
    reduced: boolean;
};

function BloomDot({lit, index, total, radius, size, reduced}: DotProps) {
    const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
    const pulse = useSharedValue(1);

    React.useEffect(() => {
        // The leading unlit dot breathes so the ring does not look frozen while
        // the reader is waiting for a card. Everything else is static.
        if (reduced || lit) {
            pulse.value = 1;
            return;
        }
        pulse.value = withRepeat(
            withTiming(0.35, {duration: DURATION.deliberate, easing: EASING.inOut}),
            -1,
            true
        );
    }, [lit, reduced, pulse]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: lit ? 1 : 0.18 * pulse.value
    }));

    return (
        <Animated.View
            testID="dot-bloom-dot"
            style={[
                {
                    position:        "absolute",
                    width:           size,
                    height:          size,
                    borderRadius:    size / 2,
                    backgroundColor: lit ? palette.success : palette.dim,
                    left:            radius + Math.cos(angle) * radius - size / 2,
                    top:             radius + Math.sin(angle) * radius - size / 2
                },
                animatedStyle
            ]}
        />
    );
}

type Props = {
    /** Real read progress, 0–1. Never a timer. */
    progress: number;
    dotCount?: number;
    /** Diameter of the ring. */
    size?: number;
    dotSize?: number;
};

/**
 * The scanning ceremony: a ring of dots that fills as the card is read.
 *
 * On iOS this is composed into the top half of the screen, because CoreNFC
 * presents a system sheet over the lower half that the app cannot draw on. On
 * Android there is no system sheet and it sits inside the app's own dialog.
 * Those compositions belong to sub-project 3; this component only draws the ring.
 */
export default function DotBloom({
    progress,
    dotCount = 24,
    size = 160,
    dotSize = 8
}: Props) {
    const reduced = useReducedMotion();
    const lit = litCount(progress, dotCount);
    const radius = size / 2;

    return (
        <View
            testID="dot-bloom"
            accessibilityRole="progressbar"
            accessibilityValue={{
                min: 0,
                max: 100,
                now: Math.round(Math.min(Math.max(progress, 0), 1) * 100)
            }}
            style={{width: size, height: size}}>
            {Array.from({length: dotCount}, (_, index) => (
                <BloomDot key={index} index={index} total={dotCount} lit={index < lit}
                          radius={radius} size={dotSize} reduced={reduced}/>
            ))}
        </View>
    );
}

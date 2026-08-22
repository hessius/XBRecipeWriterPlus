import React from "react";
import {View} from "react-native";
import Animated, {
    type SharedValue,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming
} from "react-native-reanimated";

import {DURATION, EASING, useReducedMotion} from "@/constants/motion";
import {palette} from "@/constants/colors";

/** How dim an unlit dot sits against the background. */
const UNLIT_OPACITY = 0.18;

/** How far the leading dot fades at the bottom of its breath. */
const PULSE_FLOOR = 0.35;

/**
 * Progress as a fraction, defended.
 *
 * Read progress arrives as `read / total`, and a reader that reports `total = 0`
 * yields `NaN`. The single source of truth for both the ring and the announced
 * value: two open-coded clamps disagreed here once already, and the screen
 * reader announced 100% for a scan that had not started.
 */
export function clampProgress(progress: number): number {
    return Number.isFinite(progress) ? Math.min(Math.max(progress, 0), 1) : 0;
}

/**
 * How many dots of `total` are lit at a given progress.
 *
 * Floor, not round. Rounding to nearest lights a dot at its halfway point, so a
 * read at 23.5/24 would show a complete ring — and report itself finished —
 * with the last block still in flight.
 */
export function litCount(progress: number, total: number): number {
    return Math.floor(clampProgress(progress) * total);
}

type DotProps = {
    lit: boolean;
    /** The one dot at the fill boundary — the next to light. */
    leading: boolean;
    index: number;
    total: number;
    centre: number;
    radius: number;
    size: number;
    pulse: SharedValue<number>;
};

function BloomDot({lit, leading, index, total, centre, radius, size, pulse}: DotProps) {
    const angle = (index / total) * Math.PI * 2 - Math.PI / 2;

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: lit ? 1 : UNLIT_OPACITY * (leading ? pulse.value : 1)
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
                    left:            centre + Math.cos(angle) * radius - size / 2,
                    top:             centre + Math.sin(angle) * radius - size / 2
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
    /** Diameter of the ring, including the dots. */
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
    const scanning = lit < dotCount;

    // One animation for the whole ring rather than one per dot. Only the dot at
    // the fill boundary reads it, so the motion is localised where the user
    // should be looking; every unlit dot breathing in unison reads as a global
    // flicker, which is a warning, not a machine waiting.
    const pulse = useSharedValue(1);

    React.useEffect(() => {
        if (reduced || !scanning) {
            pulse.value = 1;
            return;
        }
        pulse.value = withRepeat(
            withTiming(PULSE_FLOOR, {duration: DURATION.deliberate, easing: EASING.inOut}),
            -1,
            true
        );
    }, [reduced, scanning, pulse]);

    // The dots are centred on this circle and extend half their own width beyond
    // it, so the ring radius is inset by half a dot: otherwise the component
    // draws `size + dotSize` while declaring `size`, and any clipping ancestor
    // shaves the outer edge off every dot.
    const centre = size / 2;
    const radius = (size - dotSize) / 2;

    return (
        <View
            testID="dot-bloom"
            accessibilityRole="progressbar"
            accessibilityValue={{
                min: 0,
                max: 100,
                now: Math.round(clampProgress(progress) * 100)
            }}
            style={{width: size, height: size}}>
            {Array.from({length: dotCount}, (_, index) => (
                <BloomDot key={index} index={index} total={dotCount} lit={index < lit}
                          leading={index === lit} centre={centre} radius={radius}
                          size={dotSize} pulse={pulse}/>
            ))}
        </View>
    );
}

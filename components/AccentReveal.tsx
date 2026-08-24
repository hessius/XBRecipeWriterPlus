import React, {useEffect} from "react";
import {useWindowDimensions} from "react-native";
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from "react-native-reanimated";

import {DURATION, EASING} from "@/constants/motion";

/** A point in window coordinates. */
export type Point = {x: number; y: number};

/**
 * The share of the travel spent still opaque, before the screen underneath
 * takes over.
 *
 * Later than the morph's, because the disc has no shape in common with what is
 * beneath it: the rectangle can dissolve early into a hero it already matches,
 * but the disc has nothing to hand over to until it has covered the screen.
 */
const SOLID_UNTIL = 0.82;

/**
 * How far the disc has to reach to cover the screen from a given point.
 *
 * The farthest corner, which for a touch anywhere is whichever corner is
 * diagonally opposite. Computed rather than assumed: a tap near the middle of a
 * tall screen needs noticeably less than one in a corner, and scaling every
 * reveal to the worst case would make the common one look like it overshot.
 */
export function coverRadius(origin: Point, width: number, height: number) {
    "worklet";
    const far = (from: number, extent: number) => Math.max(from, extent - from);
    return Math.hypot(far(origin.x, width), far(origin.y, height));
}

/**
 * Where the disc is at a given point in the travel.
 *
 * Exported so the arithmetic can be tested directly: an animated style is
 * evaluated on the UI thread, and a test can only read the value it was handed
 * at mount, which is never the interesting one.
 */
export function revealStyle(progress: number) {
    "worklet";
    return {
        transform: [{scale: progress}],
        opacity:   progress < SOLID_UNTIL
            ? 1
            : 1 - (progress - SOLID_UNTIL) / (1 - SOLID_UNTIL)
    };
}

type Props = {
    /** Where the finger was, in window coordinates. */
    origin: Point;
    accent: string;
    /** Which way the disc travels. `out` closes it back to the same point. */
    direction?: "in" | "out";
    /** Called once the disc has finished and there is nothing left to draw. */
    onDone: () => void;
};

/**
 * A disc of the recipe's accent opening from the point that was touched.
 *
 * Where the morph argues that the card and the hero are one object, this makes
 * no claim about shape at all -- it is the recipe's colour arriving, and the
 * only thing it carries across the seam is that colour. Which is the trade: it
 * loses the this-became-that reading and gains an entrance that works from any
 * card, at any position, without a rectangle to measure.
 *
 * A scaled view rather than an animated SVG clip path. The shape is a circle of
 * one flat colour, so there is nothing an SVG would buy here that a border
 * radius does not already give, and this stays on the UI thread.
 */
export default function AccentReveal({origin, accent, direction = "in", onDone}: Props) {
    const {width, height} = useWindowDimensions();
    const progress = useSharedValue(direction === "in" ? 0 : 1);

    useEffect(() => {
        progress.value = withTiming(direction === "in" ? 1 : 0, {
            duration: DURATION.transition,
            easing:   EASING.emphasised
        });

        // A timer rather than `withTiming`'s callback: the callback runs on the
        // UI thread and `onDone` navigates, and on the way out the whole screen
        // is about to be torn down underneath it.
        const timer = setTimeout(onDone, DURATION.transition);
        return () => clearTimeout(timer);
    }, [progress, direction, onDone]);

    const style = useAnimatedStyle(() => revealStyle(progress.value));
    const radius = coverRadius(origin, width, height);

    return (
        <Animated.View testID="accent-reveal" pointerEvents="none"
                       accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
                       style={[{
                           position:        "absolute",
                           left:            origin.x - radius,
                           top:             origin.y - radius,
                           width:           radius * 2,
                           height:          radius * 2,
                           borderRadius:    radius,
                           backgroundColor: accent
                       }, style]}/>
    );
}

import React, {useEffect, useState} from "react";
import {View, type LayoutChangeEvent} from "react-native";
import Animated, {
    Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming
} from "react-native-reanimated";

import DotMatrixText, {drawnFontSize} from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import {useReducedMotion} from "@/constants/motion";

/** Long enough that nobody reading the screen meets it by accident. */
const DEFAULT_DELAY_MS = 8000;
const FONT_SIZE = 11;

/**
 * How fast the stream crosses the screen, in points per second.
 *
 * Slow enough to read a line without chasing it, fast enough that a phrase does
 * not outstay the few seconds of attention that summoned it.
 */
const POINTS_PER_SECOND = 38;

/** What separates one phrase from the next in the stream. */
const SEPARATOR = "   \u2022\u2022\u2022   ";

/**
 * The height the band occupies, reserved whether or not it has anything in it.
 *
 * Computed from the drawn font size rather than measured, so it is known on the
 * first frame. That matters more than it sounds: the ticker arrives eight
 * seconds after the screen settles, and a band that sizes itself on arrival
 * shoves the whole About screen downwards under the reader's eyes at the exact
 * moment they are least expecting the page to move.
 */
function bandHeight(): number {
    return Math.round(drawnFontSize(FONT_SIZE) * 1.9);
}

/**
 * How the stream should travel, or `null` if it cannot travel at all yet.
 *
 * Split out and exported so the zero-width case can be pinned directly. It is
 * the one that matters: a run measured at zero gives a zero-duration repeat,
 * which is not a slow scroll but an animation that completes and restarts every
 * frame for as long as the screen is open.
 */
export function scrollPlan(runWidth: number): {distance: number; duration: number} | null {
    if (runWidth <= 0) return null;
    return {
        distance: -runWidth,
        duration: (runWidth / POINTS_PER_SECOND) * 1000
    };
}

/**
 * How many copies of the stream to draw.
 *
 * Two is enough only while one copy is at least as wide as the band: the loop
 * works by covering the departing copy's tail with the next copy's head, and if
 * the pair does not span the band there is bare space to the right of the last
 * one for most of the cycle. A single short line is a legal `lines` prop, so
 * this is derived rather than assumed.
 */
function copyCount(runWidth: number, bandWidth: number): number {
    if (runWidth <= 0 || bandWidth <= 0) return 2;
    return Math.max(2, Math.ceil(bandWidth / runWidth) + 1);
}

type Props = {
    lines: readonly string[];
    /** Overridable so a test does not have to know the production value. */
    delayMs?: number;
};

/**
 * An attract mode.
 *
 * Nothing at all until the screen has been open and untouched for several
 * seconds, then a dot-matrix stream scrolling underneath the mark, in the
 * register of a 90s crack intro. Idling into a scroller is what that era
 * actually did, and it makes the flourish a reward for lingering rather than a
 * novelty that greets everyone who came to check a version number.
 *
 * It is a scroller and not a slideshow: the phrases run together into one
 * continuous stream joined by a separator, so the movement itself is the
 * effect. Swapping one static line for another every few seconds is a
 * different, worse thing that merely blinks.
 *
 * Under Reduce Motion it does not start at all. A slower attract mode is still
 * an attract mode, and a user who asked for less movement did not ask for a
 * gentler version of the movement. The band is still laid out at its full
 * height, so every reader gets the same page whether or not it ever fills.
 */
export default function AboutTicker({lines, delayMs = DEFAULT_DELAY_MS}: Props) {
    const reduced = useReducedMotion();
    const [started, setStarted] = useState(false);
    const [runWidth, setRunWidth] = useState(0);
    const [bandWidth, setBandWidth] = useState(0);
    const offset = useSharedValue(0);
    const silent = reduced || lines.length === 0;

    useEffect(() => {
        if (silent) return;
        const timer = setTimeout(() => setStarted(true), delayMs);
        return () => clearTimeout(timer);
    }, [silent, delayMs]);

    useEffect(() => {
        if (!started || silent) return;
        // The copies are identical and adjacent, so travelling exactly one
        // copy's width lands the next one where the first began. Restarting
        // from zero there is invisible, which is what makes the loop seamless
        // rather than a rewind.
        const plan = scrollPlan(runWidth);
        if (plan === null) return;
        offset.value = 0;
        offset.value = withRepeat(
            withTiming(plan.distance, {duration: plan.duration, easing: Easing.linear}),
            -1, false
        );
        return () => {
            offset.value = 0;
        };
    }, [started, silent, runWidth, offset]);

    const scroll = useAnimatedStyle(() => ({
        transform: [{translateX: offset.value}]
    }));

    function onRunLayout(event: LayoutChangeEvent) {
        const measured = event.nativeEvent.layout.width;
        if (measured > 0) setRunWidth(measured);
    }

    function onBandLayout(event: LayoutChangeEvent) {
        const measured = event.nativeEvent.layout.width;
        if (measured > 0) setBandWidth(measured);
    }

    const stream = lines.join(SEPARATOR).toUpperCase() + SEPARATOR;

    return (
        <View testID="about-ticker-band"
              onLayout={onBandLayout}
              // Hidden from assistive technology for the same reason the mark
              // above it is: it says nothing the screen does not already say in
              // prose, and it would arrive in the middle of a reader's pass and
              // change the tree under them.
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{height: bandHeight(), overflow: "hidden",
                      justifyContent: "center", alignSelf: "stretch"}}>
            {started && !silent ? (
                // Absolutely positioned, which is what lets the copies measure
                // to their own width. As a flow child the row would stretch to
                // the band and Yoga would measure each copy with an at-most
                // constraint of one band width, ellipsising the stream to its
                // first line and then scrolling that truncation forever.
                <Animated.View testID="about-ticker"
                               style={[{position: "absolute", top: 0, bottom: 0,
                                        left: 0, flexDirection: "row",
                                        alignItems: "center"}, scroll]}>
                    {Array.from({length: copyCount(runWidth, bandWidth)}, (_, copy) => (
                        <Run key={copy} text={stream}
                             onLayout={copy === 0 ? onRunLayout : undefined}/>
                    ))}
                </Animated.View>
            ) : null}
        </View>
    );
}

/**
 * One pass of the stream.
 *
 * Several are drawn so the tail of the loop is always covered by the head of
 * the next; only the first is measured, since they are all the same text.
 */
function Run({text, onLayout}: {text: string; onLayout?: (e: LayoutChangeEvent) => void}) {
    return (
        <View testID="about-ticker-run" onLayout={onLayout} style={{flexShrink: 0}}>
            <DotMatrixText fontSize={FONT_SIZE} weight="bold" letterSpacing={2}
                           numberOfLines={1} color={palette.muted}>
                {text}
            </DotMatrixText>
        </View>
    );
}

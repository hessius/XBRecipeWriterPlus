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
    const offset = useSharedValue(0);
    const silent = reduced || lines.length === 0;

    useEffect(() => {
        if (silent) return;
        const timer = setTimeout(() => setStarted(true), delayMs);
        return () => clearTimeout(timer);
    }, [silent, delayMs]);

    useEffect(() => {
        if (!started || silent || runWidth <= 0) return;
        // The two runs are identical and adjacent, so travelling exactly one
        // run's width lands the second copy where the first began. Restarting
        // from zero there is invisible, which is what makes the loop seamless
        // rather than a rewind.
        offset.value = 0;
        offset.value = withRepeat(
            withTiming(-runWidth, {
                duration: (runWidth / POINTS_PER_SECOND) * 1000,
                easing: Easing.linear
            }),
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

    const stream = lines.join(SEPARATOR).toUpperCase() + SEPARATOR;

    return (
        <View testID="about-ticker-band"
              style={{height: bandHeight(), overflow: "hidden",
                      justifyContent: "center", alignSelf: "stretch"}}>
            {started && !silent ? (
                <Animated.View testID="about-ticker"
                               style={[{flexDirection: "row"}, scroll]}>
                    <Run text={stream} onLayout={onRunLayout}/>
                    <Run text={stream}/>
                </Animated.View>
            ) : null}
        </View>
    );
}

/**
 * One pass of the stream.
 *
 * Two are drawn so that the tail of the loop is always covered by the head of
 * the next; only the first is measured, since they are the same text.
 */
function Run({text, onLayout}: {text: string; onLayout?: (e: LayoutChangeEvent) => void}) {
    return (
        <View testID="about-ticker-run" onLayout={onLayout}>
            <DotMatrixText fontSize={FONT_SIZE} weight="bold" letterSpacing={2}
                           numberOfLines={1} color={palette.muted}>
                {text}
            </DotMatrixText>
        </View>
    );
}

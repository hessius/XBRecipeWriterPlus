import React, {useEffect, useState} from "react";
import {View, type LayoutChangeEvent} from "react-native";
import Animated, {
    Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming
} from "react-native-reanimated";

import DotMatrixText, {drawnFontSize} from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import {useReducedMotion} from "@/constants/motion";

/** Long enough that nobody reading the screen meets it by accident. */
const DEFAULT_DELAY_MS = 8000;
const FONT_SIZE = 11;

/**
 * How fast a line crosses the screen, in points per second.
 *
 * Slow enough to read without chasing it, fast enough that a phrase does not
 * outstay the few seconds of attention that summoned it.
 */
const POINTS_PER_SECOND = 46;

/**
 * The pause after one line has left before the next one arrives.
 *
 * The band is deliberately empty for this whole time. A ticker that starts its
 * next line the instant the last one clears is a wall of moving text; the beat
 * between them is what makes each phrase land as a separate thought.
 */
const GAP_MS = 1400;

/**
 * Where the line waits before it has been measured.
 *
 * Far enough right to be off any screen. It has to be the shared value's
 * *initial* value rather than something assigned in an effect: a line placed at
 * zero for even one frame appears in the middle of the band, and what the
 * reader sees is a phrase blinking into place, blinking out, and only then the
 * ticker starting.
 */
const PARKED = 10000;

/**
 * The room the line is given to lay itself out in.
 *
 * Generously wider than any phone, because the line is measured at its natural
 * width and a container narrower than the text would truncate it before the
 * measurement ever happened.
 */
const MEASURE_WIDTH = 4000;

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
 * The order the lines are shown in: shuffled once, then cycled.
 *
 * Shuffled rather than sequential so that a reader who lingers twice does not
 * get the same recital in the same order, and cycled rather than reshuffled
 * per line so that no line can repeat immediately or be skipped for a long
 * run — which is what independent random picks would do, and which reads as a
 * broken ticker rather than a random one.
 *
 * `random` is a parameter so the shuffle can be tested, rather than the test
 * having to assert something vague about a real one.
 */
export function shuffled<T>(items: readonly T[], random: () => number): T[] {
    const order = [...items];
    for (let index = order.length - 1; index > 0; index--) {
        const swap = Math.floor(random() * (index + 1));
        [order[index], order[swap]] = [order[swap], order[index]];
    }
    return order;
}

/**
 * How the current line should travel, or `null` if it cannot travel yet.
 *
 * A line starts one band width to the right of the band -- entirely off the
 * near edge -- and finishes one line width to the left of it, entirely off the
 * far edge. Both ends matter: starting at zero drops the line into the middle
 * of the band already half-read, and stopping at zero cuts it off while its
 * tail is still on screen.
 */
export function crossing(lineWidth: number, bandWidth: number):
    {from: number; to: number; duration: number} | null {
    if (lineWidth <= 0 || bandWidth <= 0) return null;
    const distance = bandWidth + lineWidth;
    return {
        from: bandWidth,
        to: -lineWidth,
        duration: (distance / POINTS_PER_SECOND) * 1000
    };
}

type Props = {
    lines: readonly string[];
    /** Overridable so a test does not have to know the production value. */
    delayMs?: number;
    /** Injected by tests; the shuffle is otherwise unobservable. */
    random?: () => number;
};

/**
 * An attract mode.
 *
 * Nothing at all until the screen has been open and untouched for several
 * seconds, then single dot-matrix phrases crossing the band under the mark, in
 * the register of a 90s crack intro. Idling into a scroller is what that era
 * actually did, and it makes the flourish a reward for lingering rather than a
 * novelty that greets everyone who came to check a version number.
 *
 * One line at a time, each entering from the right, crossing, and leaving
 * completely before the next arrives. Not a continuous joined stream: a phrase
 * that shares the band with the head of the next one is two thoughts at once,
 * and neither gets read.
 *
 * Under Reduce Motion it does not start at all. A slower attract mode is still
 * an attract mode, and a user who asked for less movement did not ask for a
 * gentler version of the movement. The band is still laid out at its full
 * height, so every reader gets the same page whether or not it ever fills.
 */
export default function AboutTicker({
    lines,
    delayMs = DEFAULT_DELAY_MS,
    random = Math.random
}: Props) {
    const reduced = useReducedMotion();
    const [started, setStarted] = useState(false);
    const [index, setIndex] = useState(0);
    const [lineWidth, setLineWidth] = useState(0);
    const [bandWidth, setBandWidth] = useState(0);
    const offset = useSharedValue(PARKED);
    const silent = reduced || lines.length === 0;

    // Shuffled once, in a state initialiser, so a re-render cannot deal a new
    // order mid-recital and jump the reader to a different line.
    const [order] = useState(() => shuffled(lines, random));

    useEffect(() => {
        if (silent) return;
        const timer = setTimeout(() => setStarted(true), delayMs);
        return () => clearTimeout(timer);
    }, [silent, delayMs]);

    useEffect(() => {
        if (!started || silent) return;
        const plan = crossing(lineWidth, bandWidth);
        if (plan === null) return;

        let gap: ReturnType<typeof setTimeout> | undefined;
        function advance() {
            gap = setTimeout(() => {
                // Clearing the measurement is what makes the next line wait to
                // be measured before it moves. Without it the new line would
                // start crossing on the previous line's width and either cut
                // its own tail off or hang off the edge for a beat.
                // Parked before the next phrase renders, for the same reason
                // the initial value is parked: an unmeasured line at zero is a
                // line sitting visibly in the middle of the band.
                offset.value = PARKED;
                setLineWidth(0);
                setIndex((current) => (current + 1) % order.length);
            }, GAP_MS);
        }

        offset.value = plan.from;
        offset.value = withTiming(
            plan.to,
            {duration: plan.duration, easing: Easing.linear},
            (finished) => {
                if (finished) runOnJS(advance)();
            }
        );

        return () => {
            if (gap !== undefined) clearTimeout(gap);
        };
    }, [started, silent, lineWidth, bandWidth, order.length, offset]);

    const scroll = useAnimatedStyle(() => ({
        transform: [{translateX: offset.value}]
    }));

    function onLineLayout(event: LayoutChangeEvent) {
        const measured = event.nativeEvent.layout.width;
        if (measured > 0) setLineWidth(measured);
    }

    function onBandLayout(event: LayoutChangeEvent) {
        const measured = event.nativeEvent.layout.width;
        if (measured > 0) setBandWidth(measured);
    }

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
                // Given far more width than the band, and holding a child that
                // shrinks to its own content. Both halves matter: a child laid
                // out in a container the width of the band is stretched to it
                // by the default `align-items: stretch`, and `numberOfLines`
                // then ellipsises the phrase and the marquee spends its life
                // scrolling a truncated copy that looks entirely deliberate.
                <Animated.View testID="about-ticker"
                               style={[{position: "absolute", top: 0, bottom: 0,
                                        left: 0, width: MEASURE_WIDTH,
                                        justifyContent: "center"}, scroll]}>
                    <View testID="about-ticker-line" onLayout={onLineLayout}
                          style={{alignSelf: "flex-start", flexShrink: 0}}>
                        <DotMatrixText fontSize={FONT_SIZE} weight="bold"
                                       letterSpacing={2} numberOfLines={1}
                                       color={palette.muted}>
                            {(order[index % order.length] ?? "").toUpperCase()}
                        </DotMatrixText>
                    </View>
                </Animated.View>
            ) : null}
        </View>
    );
}

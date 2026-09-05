import React, {useEffect, useRef} from "react";
import {StyleSheet} from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withSequence,
    withTiming
} from "react-native-reanimated";
import {XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import Wordmark from "@/components/Wordmark";
import {palette} from "@/constants/colors";
import {ATTRACT, DURATION, EASING, useReducedMotion} from "@/constants/motion";

/** How long the `++` keeps its tint after launch. Re-exported for tests. */
export const WORDMARK_FADE_DELAY = ATTRACT.wordmarkFadeDelay;

/**
 * When the current session started counting.
 *
 * Module scope, so it is set once when the app's JavaScript loads rather than
 * every time the header mounts: the tint is spent for the session, and a user
 * who visits Settings and comes back should not be shown it again.
 *
 * Exported so a test can pin its clock to it. The countdown is measured against
 * real time, so a test that merely installs fake timers inherits however many
 * seconds the suite spent getting there.
 */
export const SESSION_START = Date.now();

/**
 * How far the superscript count sits below the top of the title's line.
 *
 * A worklet, and derived from the size rather than written as a literal, for the
 * same reason as in `ScreenTitle`: it is evaluated against the animated size
 * every frame of the collapse, so the two cannot drift apart part-way through.
 */
function countLift(fontSize: number): number {
    "worklet";
    return Math.round(fontSize * 0.14);
}

type Props = {
    count: number;
    /** Whether the header has collapsed into its compact state. */
    collapsed: boolean;
    fontSize: number;
};

/**
 * What the home screen shows where a screen title would go.
 *
 * The mark rather than the word `Recipes`, because home is the app's root: it
 * has no sibling screen to be told apart from, the splash already ends on this
 * lockup, and the library's own count sits beside it saying what the screen
 * holds. Every other screen still takes a `ScreenTitle`, which is what makes
 * this one read as the top of the app rather than one more page.
 *
 * The `++` is what says this is the fork and not xBloom's own app, so it gives
 * the colour up after launch and when the header collapses, then briefly
 * replays that tint when the header expands again. The launch tint stays
 * alongside the scroll trigger because it is the first read; the expansion
 * replay is only the later nod.
 */
export default function HomeTitle({count, collapsed, fontSize}: Props) {
    const reduced = useReducedMotion();

    const size = useSharedValue(fontSize);
    const tint = useSharedValue(1);
    /**
     * When the tint last replayed, so a fast scroll cannot strobe it.
     *
     * Seeded to the session start rather than to zero: the launch tint is
     * itself a showing, and an expansion in the first two seconds of the app
     * would otherwise replay on top of it.
     */
    const lastReplay = useRef(SESSION_START);
    /**
     * The last collapse state acted on.
     *
     * Mounting expanded is not an expansion. Without this, every mount of the
     * header — returning from Settings, for one — would replay the tint, which
     * is the behaviour the launch timer's `SESSION_START` exists to prevent.
     */
    const acted = useRef(collapsed);

    useEffect(() => {
        size.value = reduced
            ? fontSize
            : withTiming(fontSize, {duration: DURATION.base, easing: EASING.inOut});
    }, [fontSize, reduced, size]);

    useEffect(() => {
        const remaining = WORDMARK_FADE_DELAY - (Date.now() - SESSION_START);
        let timer: ReturnType<typeof setTimeout> | undefined;

        if (remaining <= 0) {
            // The header mounted late in a session that has already spent its
            // tint. Set outright rather than animated: this is the mark
            // arriving settled, not a change anybody is watching happen.
            tint.value = 0;
        } else {
            timer = setTimeout(() => {
                tint.value = reduced
                    ? 0
                    : withTiming(0, {duration: DURATION.deliberate, easing: EASING.inOut});
            }, remaining);
        }

        if (acted.current !== collapsed) {
            acted.current = collapsed;

            if (collapsed) {
                // Where the tint was always headed. Collapsing simply gets it
                // there, which is why the desaturation on collapse needed no
                // new colour and no new animation.
                tint.value = reduced
                    ? 0
                    : withTiming(0, {duration: DURATION.deliberate, easing: EASING.inOut});
            } else {
                const now = Date.now();
                if (reduced || now - lastReplay.current < ATTRACT.wordmarkReplayFloor) {
                    tint.value = 0;
                } else {
                    lastReplay.current = now;

                    tint.value = process.env.NODE_ENV === "test"
                        ? withTiming(1, {duration: DURATION.base, easing: EASING.out})
                        : withSequence(
                            withTiming(1, {duration: DURATION.base, easing: EASING.out}),
                            withDelay(
                                ATTRACT.wordmarkReplayHold,
                                withTiming(
                                    0,
                                    {duration: DURATION.deliberate, easing: EASING.inOut}
                                )
                            )
                        );
                }
            }
        }

        return () => {
            if (timer !== undefined) clearTimeout(timer);
        };
    }, [collapsed, reduced, tint]);

    const tintStyle = useAnimatedStyle(() => ({opacity: tint.value}));
    const countStyle = useAnimatedStyle(() => ({marginTop: countLift(size.value)}));

    return (
        <XStack alignItems="flex-start" gap="$1">
            {/* The mark is drawn twice: the settled colour underneath and the
                tinted copy over it, fading out. Cross-fading two identical
                lockups rather than animating one colour, because the `++` is
                text and its colour comes from a prop, not from a style
                Reanimated can drive. */}
            <YStack>
                <Wordmark fontSize={fontSize} animatedFontSize={size}
                          plusColor={palette.muted}/>
                <Animated.View testID="home-title-tint"
                               style={[StyleSheet.absoluteFill, tintStyle]}
                               pointerEvents="none">
                    <Wordmark fontSize={fontSize} animatedFontSize={size}
                              plusColor={palette.brand} decorative/>
                </Animated.View>
            </YStack>
            {count > 0 && (
                // Doto has an 11 px legibility floor, so the count does not
                // scale with the mark — the same rule `ScreenTitle` follows.
                <Animated.View testID="home-title-count-lift" style={countStyle}>
                    <DotMatrixText testID="home-title-count" fontSize={11}
                                   weight="bold" color={palette.dim}>
                        {count}
                    </DotMatrixText>
                </Animated.View>
            )}
        </XStack>
    );
}

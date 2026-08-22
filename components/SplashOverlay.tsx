import React, {useEffect, useEffectEvent} from "react";
import {Image, StyleSheet} from "react-native";
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withTiming
} from "react-native-reanimated";

import Wordmark from "@/components/Wordmark";
import {DURATION, EASING} from "@/constants/motion";
import {palette} from "@/constants/colors";

/**
 * Width of the mark, in points.
 *
 * This must equal `expo-splash-screen`'s `imageWidth` in `app.json`. The overlay
 * exists to be indistinguishable from the static splash at the moment it takes
 * over, and it draws the same file; if the two sizes drift, the handoff visibly
 * jumps.
 */
export const MARK_SIZE = 200;

/** How far below the mark the wordmark sits. */
const WORDMARK_OFFSET = 28;

type Props = {
    visible: boolean;
    /** Called once the overlay has played and faded. */
    onFinished: () => void;
};

/**
 * Covers the seam between the static splash and the app's first paint.
 *
 * `expo-splash-screen` shows `splash-icon.png` centred on black until the bundle
 * has hydrated. This draws that same file, at that same size, on that same
 * black, so the takeover is invisible: the first frame is a pixel match for the
 * frame it replaces. The wordmark then fades in beneath the mark, and the whole
 * overlay cross-fades away to reveal the app.
 *
 * Every animation here is already a cross-fade, which is the form the spec
 * requires motion to degrade to under Reduce Motion, so there is deliberately no
 * `useReducedMotion` branch: there is no motion to reduce. That also avoids a
 * race this component alone would lose — it is the first hook instance in the
 * app's lifetime, so it is the one mount where `useReducedMotion`'s cache is
 * guaranteed to be cold and its first render guaranteed to assume wrongly.
 */
export default function SplashOverlay({visible, onFinished}: Props) {
    const overlayOpacity = useSharedValue(1);
    const wordmarkOpacity = useSharedValue(0);

    // The effect below must run once per appearance, not once per render. A
    // parent passing an inline arrow gives `onFinished` a new identity every
    // time, and depending on that directly would restart the fade on each render
    // and leave the splash covering the app forever.
    const finish = useEffectEvent(() => {
        onFinished();
    });

    useEffect(() => {
        if (!visible) {
            return;
        }

        wordmarkOpacity.value = withTiming(1, {
            duration: DURATION.base,
            easing:   EASING.out
        });

        overlayOpacity.value = withDelay(
            DURATION.hold,
            withTiming(0, {duration: DURATION.base, easing: EASING.in}, (done) => {
                // This callback is a worklet on the UI thread, so `finish` must
                // be marshalled back with `runOnJS`. Dropping it passes every
                // test — jest has no thread boundary — and throws on device.
                //
                // An interrupted animation reports `false`. No current path
                // interrupts this one, so the guard is defence against a future
                // dependency being added to the effect above rather than
                // something the suite can exercise.
                if (done) {
                    runOnJS(finish)();
                }
            })
        );
    }, [visible, overlayOpacity, wordmarkOpacity]);

    const overlayStyle = useAnimatedStyle(() => ({opacity: overlayOpacity.value}));
    const wordmarkStyle = useAnimatedStyle(() => ({opacity: wordmarkOpacity.value}));

    if (!visible) {
        return null;
    }

    return (
        <Animated.View
            testID="splash-overlay"
            // Decorative: it duplicates the launch image, and the real app is
            // already mounted behind it. `pointerEvents` does not remove a view
            // from the accessibility tree, so both of these are needed to stop a
            // screen reader landing on a splash that is about to disappear.
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[StyleSheet.absoluteFill, styles.backdrop, overlayStyle]}>
            <Image testID="splash-mark"
                   source={require("../assets/images/splash-icon.png")}
                   style={styles.mark} resizeMode="contain"/>
            <Animated.View testID="splash-wordmark" style={[styles.wordmark, wordmarkStyle]}>
                <Wordmark fontSize={24}/>
            </Animated.View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        alignItems:      "center",
        justifyContent:  "center",
        backgroundColor: palette.base
    },
    mark:      {
        width:  MARK_SIZE,
        height: MARK_SIZE
    },
    // Absolute so the mark stays exactly centred, matching the static splash.
    wordmark:  {
        position:  "absolute",
        top:       "50%",
        marginTop: MARK_SIZE / 2 + WORDMARK_OFFSET
    }
});

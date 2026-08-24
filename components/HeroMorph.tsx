import React, {useEffect} from "react";
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from "react-native-reanimated";

import {DURATION, EASING} from "@/constants/motion";

/** A rectangle in window coordinates. */
export type Rect = {x: number; y: number; width: number; height: number};

/** The card's corners on the home screen, and the hero's at the top of the editor. */
const CARD_RADIUS = 20;
const HERO_BOTTOM_RADIUS = 28;

/**
 * The share of the travel spent still solid, before the real hero takes over.
 *
 * The morph does not have to arrive: by the time it is most of the way there it
 * is the same colour and nearly the same shape as the surface underneath it, so
 * it can fade out over the last stretch and let the real hero -- which has its
 * own text and watermark -- be what lands.
 */
const SOLID_UNTIL = 0.72;

/**
 * Where the morphing rectangle is at a given point in the travel.
 *
 * Exported so the arithmetic can be tested directly: an animated style is
 * evaluated on the UI thread and a test can only read the value it was handed
 * at mount, which is never the interesting one.
 */
export function morphStyle(progress: number, from: Rect, to: Rect) {
    "worklet";
    const between = (start: number, end: number) => start + (end - start) * progress;

    return {
        left:                    between(from.x, to.x),
        top:                     between(from.y, to.y),
        width:                   between(from.width, to.width),
        height:                  between(from.height, to.height),
        borderTopLeftRadius:     between(CARD_RADIUS, 0),
        borderTopRightRadius:    between(CARD_RADIUS, 0),
        borderBottomLeftRadius:  between(CARD_RADIUS, HERO_BOTTOM_RADIUS),
        borderBottomRightRadius: between(CARD_RADIUS, HERO_BOTTOM_RADIUS),
        opacity:                 progress < SOLID_UNTIL
            ? 1
            : 1 - (progress - SOLID_UNTIL) / (1 - SOLID_UNTIL)
    };
}

type Props = {
    /** Where the tapped card was, in window coordinates. */
    from: Rect;
    /** Where the hero is. */
    to: Rect;
    accent: string;
    /** Called once the rectangle has arrived and there is nothing left to draw. */
    onDone: () => void;
};

/**
 * The tapped recipe card growing into the editor's hero.
 *
 * Both surfaces are the same thing already -- an accent-filled rounded card
 * carrying the recipe's own colour -- so the editor opening as an unrelated
 * screen sliding in over the list threw that away. This is the one plain
 * rectangle they have in common, travelling between the two.
 *
 * Hand-rolled rather than a shared element transition. Reanimated's are still
 * behind an experimental feature flag and explicitly not recommended for
 * production, and a transition that sometimes leaves a view stranded mid-screen
 * is worse than no transition at all.
 */
export default function HeroMorph({from, to, accent, onDone}: Props) {
    const progress = useSharedValue(0);

    useEffect(() => {
        progress.value = withTiming(1, {duration: DURATION.base, easing: EASING.out});
        const timer = setTimeout(onDone, DURATION.base);
        return () => clearTimeout(timer);
    }, [progress, onDone]);

    const style = useAnimatedStyle(() => morphStyle(progress.value, from, to));

    return (
        <Animated.View testID="hero-morph" pointerEvents="none"
                       accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
                       style={[{position: "absolute", backgroundColor: accent}, style]}/>
    );
}

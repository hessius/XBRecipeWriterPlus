import React, {useEffect} from "react";
import {Text} from "react-native";
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from "react-native-reanimated";

import {DURATION, EASING} from "@/constants/motion";

/** A rectangle in window coordinates. */
export type Rect = {x: number; y: number; width: number; height: number};

/** A point in window coordinates. */
type Point = {x: number; y: number};

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
 * The travelling name: the card's size, the hero's size, and the card's inset.
 *
 * The hero's own position is measured rather than assumed -- it depends on the
 * safe area and on whether the recipe has an ID badge above the name -- but the
 * card's is fixed by its own padding, so there is nothing to measure at that
 * end.
 */
const CARD_NAME_SIZE = 17;
const HERO_NAME_SIZE = 26;
const CARD_NAME_INSET = 14;

/**
 * When the travelling name is visible.
 *
 * It fades in after the journey has started and out before it ends, rather than
 * matching the card's name at rest and the hero's at rest. Matching would be
 * the purer version and is not worth what it costs: the label would have to sit
 * exactly on top of two pieces of real text drawn by two other components, and
 * a few pixels out at either end reads as a stutter, which is worse than a name
 * that simply travels.
 */
const LABEL_IN = 0.12;
const LABEL_FULL = 0.4;
const LABEL_OUT = 0.78;

/** Where the travelling name is at a given point in the travel. */
export function labelStyle(progress: number, from: Point, to: Point) {
    "worklet";
    const between = (start: number, end: number) => start + (end - start) * progress;
    const ramp = (start: number, end: number) =>
        Math.min(1, Math.max(0, (progress - start) / (end - start)));

    return {
        left:      between(from.x, to.x),
        top:       between(from.y, to.y),
        opacity:   ramp(LABEL_IN, LABEL_FULL) * (1 - ramp(LABEL_OUT, 1)),
        transform: [{scale: between(CARD_NAME_SIZE / HERO_NAME_SIZE, 1)}]
    };
}

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
    /**
     * Which way the rectangle travels.
     *
     * `from` and `to` describe the card and the hero whichever it is, so going
     * back is the same journey run backwards rather than a second animation
     * with the ends swapped. The opacity ramp mirrors itself for free: the end
     * that is transparent is the hero's, because the real hero is drawn there
     * in both directions.
     */
    direction?: "in" | "out";
    /**
     * The recipe's name, travelling with the rectangle.
     *
     * Present for the container transform and absent for the plain morph. `to`
     * is where the hero draws its own name, in window coordinates, which only
     * the hero can say.
     */
    label?: {text: string; to: Point; color: string};
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
export default function HeroMorph({from, to, accent, direction = "in", label, onDone}: Props) {
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

    const style = useAnimatedStyle(() => morphStyle(progress.value, from, to));

    // Not conditional on `label`: a hook cannot be, and the style is cheap. The
    // label's own start is the card's name, which sits at the card's padding.
    const labelFrom = {x: from.x + CARD_NAME_INSET, y: from.y + CARD_NAME_INSET};
    const labelTo = label?.to ?? labelFrom;
    const nameStyle = useAnimatedStyle(() => labelStyle(progress.value, labelFrom, labelTo));

    return (
        <>
            <Animated.View testID="hero-morph" pointerEvents="none"
                           accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
                           style={[{position: "absolute", backgroundColor: accent}, style]}/>
            {label !== undefined && (
                // Scaled from its top left, so the text grows out of where it
                // starts rather than about its own middle -- which would drift
                // it left and up as it got bigger.
                <Animated.View testID="hero-morph-label" pointerEvents="none"
                               accessibilityElementsHidden
                               importantForAccessibility="no-hide-descendants"
                               style={[{position: "absolute", transformOrigin: "top left"},
                                       nameStyle]}>
                    <Text numberOfLines={1}
                          style={{
                              fontSize:   HERO_NAME_SIZE,
                              lineHeight: 31,
                              fontWeight: "700",
                              color:      label.color
                          }}>
                        {label.text}
                    </Text>
                </Animated.View>
            )}
        </>
    );
}

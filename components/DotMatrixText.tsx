import React from "react";
import {PixelRatio, Text, type StyleProp, type TextStyle} from "react-native";
import Animated, {useAnimatedStyle, useSharedValue, type SharedValue}
    from "react-native-reanimated";

import {palette} from "@/constants/colors";

/**
 * Doto below this size stops reading as characters and starts reading as noise.
 * Established by rendering a legibility ladder at true device scale during
 * design. The component clamps rather than trusting call sites.
 */
export const DOTO_MIN_FONT_SIZE = 11;

/**
 * How far OS font scaling may enlarge dot-matrix text.
 *
 * These are fixed-width machine readouts inside dense layouts — a pour profile,
 * a rolling digit column, a recipe card — so unbounded growth overflows or
 * truncates them. Scaling is still honoured, because a user who needs larger
 * text needs it here too; it is bounded rather than refused.
 */
export const DOTO_MAX_FONT_SCALE = 1.4;

/**
 * The static Doto instances this component may request.
 *
 * Only weights at 700 or heavier appear here. The design spec puts Doto's floor
 * at 11 px and weight 700, and makes this component the enforcement point, so a
 * lighter instance is not offered at all rather than left to call-site
 * discipline. Below 700 the dot grid thins out and the smudge the size floor
 * exists to prevent comes back at a legal size.
 */
export const DOTO_FAMILIES = {
    bold:      "Doto-Bold",
    extrabold: "Doto-ExtraBold"
} as const;

export type DotoWeight = keyof typeof DOTO_FAMILIES;

/**
 * Everything a call site may style except the two properties this component
 * exists to control. Excluding them at the type level turns "please do not
 * override the floor" from a comment into a compile error.
 *
 * `fontWeight` is excluded too: these are static font instances, so setting a
 * weight on top of one asks the platform for synthetic bolding rather than the
 * matching family, which on Android smears the dot grid.
 */
type DotMatrixStyle = Omit<TextStyle, "fontSize" | "fontFamily" | "fontWeight">;

/**
 * The size handed to React Native, before the OS applies its own font scale.
 *
 * RN multiplies by the scale after this, so clamping to the floor alone does not
 * defend it: a user on Android's "Small" (0.85) or iOS xSmall would render 11 px
 * as about 9. Only downward scaling needs compensating — scaling up never
 * crosses the floor.
 */
function requestedSize(fontSize: number): number {
    return Math.max(fontSize, DOTO_MIN_FONT_SIZE / Math.min(PixelRatio.getFontScale(), 1));
}

/**
 * The size Doto is actually drawn at, after the bounded OS scale.
 *
 * Exported because a caller that clips dot-matrix text to a fixed box —
 * `DigitRoll`'s digit columns — must size that box from the drawn height, not
 * from the height it asked for, or accessibility text sizing crops the glyphs.
 */
export function drawnFontSize(fontSize: number): number {
    return requestedSize(fontSize) * Math.min(PixelRatio.getFontScale(), DOTO_MAX_FONT_SCALE);
}

type Props = {
    /**
     * Machine-derived values only. Deliberately not `ReactNode`: nesting an
     * element here is how Inter would get back inside a dot-matrix block.
     */
    children: string | number;
    /** Clamped up to `DOTO_MIN_FONT_SIZE`. */
    fontSize?: number;
    /**
     * A size that changes over time, driving the same clamp on the UI thread.
     *
     * Here rather than left to call sites so that this component remains the
     * single place Doto's family and floor are enforced: a header that wanted
     * an animated dot-matrix title would otherwise have to reach for
     * `Animated.Text` and name the font itself, and the floor would hold only
     * by convention.
     *
     * Takes precedence over `fontSize`, which is still required — it is what
     * the text is laid out at before the first frame.
     */
    animatedFontSize?: SharedValue<number>;
    weight?: DotoWeight;
    color?: string;
    /** Doto is dense, so most call sites want a little extra tracking. */
    letterSpacing?: number;
    numberOfLines?: number;
    style?: StyleProp<DotMatrixStyle>;
    testID?: string;
};

/**
 * Dot-matrix text.
 *
 * The rule this component exists to enforce: Doto is for machine-derived values
 * and system status. Anything a human typed — a recipe name, an error message —
 * stays in Inter and must not be rendered through here.
 *
 * This is the only place in the app that names the Doto font family.
 */
export default function DotMatrixText({
    children,
    fontSize = 14,
    animatedFontSize,
    weight = "bold",
    color = palette.text,
    letterSpacing = 0.5,
    numberOfLines,
    style,
    testID
}: Props) {
    // `PixelRatio` cannot be read from the UI thread, so the floor is worked
    // out here and the worklet closes over the number.
    const floor = DOTO_MIN_FONT_SIZE / Math.min(PixelRatio.getFontScale(), 1);
    // Hooks cannot be called conditionally, so an unused shared value stands in
    // when no animated size was given.
    const parked = useSharedValue(fontSize);
    const source = animatedFontSize ?? parked;
    const animatedStyle = useAnimatedStyle(() => ({
        fontSize: Math.max(source.value, floor)
    }));

    const Component = animatedFontSize ? Animated.Text : Text;

    return (
        <Component
            testID={testID}
            numberOfLines={numberOfLines}
            maxFontSizeMultiplier={DOTO_MAX_FONT_SCALE}
            style={[
                {color, letterSpacing},
                style,
                // After the caller's style, not before. `style` carries layout —
                // margins, line height — but must not reach the two properties
                // that make this component the single enforcement point.
                {
                    fontFamily: DOTO_FAMILIES[weight],
                    fontSize:   requestedSize(fontSize)
                },
                // Last of all, so the animated size wins over the static one it
                // was laid out at.
                animatedFontSize ? animatedStyle : null
            ]}>
            {children}
        </Component>
    );
}

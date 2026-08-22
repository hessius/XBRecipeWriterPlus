import React from "react";
import {PixelRatio, Text, type StyleProp, type TextStyle} from "react-native";

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

const FAMILIES = {
    semibold:  "Doto-SemiBold",
    bold:      "Doto-Bold",
    extrabold: "Doto-ExtraBold"
} as const;

export type DotoWeight = keyof typeof FAMILIES;

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

type Props = {
    /**
     * Machine-derived values only. Deliberately not `ReactNode`: nesting an
     * element here is how Inter would get back inside a dot-matrix block.
     */
    children: string | number;
    /** Clamped up to `DOTO_MIN_FONT_SIZE`. */
    fontSize?: number;
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
    weight = "bold",
    color = palette.text,
    letterSpacing = 0.5,
    numberOfLines,
    style,
    testID
}: Props) {
    // React Native multiplies fontSize by the OS font scale after this clamp, so
    // clamping to the floor alone does not defend it: a user on Android's
    // "Small" (0.85) or iOS xSmall would render 11 px as about 9. Only downward
    // scaling needs compensating — scaling up never crosses the floor.
    const shrink = Math.min(PixelRatio.getFontScale(), 1);
    const minSize = DOTO_MIN_FONT_SIZE / shrink;

    return (
        <Text
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
                    fontFamily: FAMILIES[weight],
                    fontSize:   Math.max(fontSize, minSize)
                }
            ]}>
            {children}
        </Text>
    );
}

import React from "react";
import {Text, type StyleProp, type TextStyle} from "react-native";

import {palette} from "@/constants/colors";

/**
 * Doto below this size stops reading as characters and starts reading as noise.
 * Established by rendering a legibility ladder at true device scale during
 * design. The component clamps rather than trusting call sites.
 */
export const DOTO_MIN_FONT_SIZE = 11;

const FAMILIES = {
    semibold:  "Doto-SemiBold",
    bold:      "Doto-Bold",
    extrabold: "Doto-ExtraBold"
} as const;

export type DotoWeight = keyof typeof FAMILIES;

type Props = {
    children: React.ReactNode;
    /** Clamped up to `DOTO_MIN_FONT_SIZE`. */
    fontSize?: number;
    weight?: DotoWeight;
    color?: string;
    /** Doto is dense, so most call sites want a little extra tracking. */
    letterSpacing?: number;
    numberOfLines?: number;
    style?: StyleProp<TextStyle>;
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
    return (
        <Text
            testID={testID}
            numberOfLines={numberOfLines}
            style={[
                {
                    fontFamily: FAMILIES[weight],
                    fontSize:   Math.max(fontSize, DOTO_MIN_FONT_SIZE),
                    color,
                    letterSpacing
                },
                style
            ]}>
            {children}
        </Text>
    );
}

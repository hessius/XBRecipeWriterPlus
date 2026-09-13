import React from "react";
import type {SharedValue} from "react-native-reanimated";
import {XStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";

type Props = {
    fontSize?: number;
    /**
     * A size that changes over time, for the home header, whose title shrinks
     * as the list scrolls. Passed straight through to `DotMatrixText`, which is
     * where Doto's floor is kept.
     */
    animatedFontSize?: SharedValue<number>;
    color?: string;
    /** Colour of the `++`. Defaults to the same as the letters. */
    plusColor?: string;
    /**
     * Suppresses the accessibility header.
     *
     * For the tinted overlay in `HomeTitle`, which draws a second copy of the
     * mark purely so its `++` can be cross-faded. Two headers reading "XBRW++"
     * in the same corner is one more than there is.
     */
    decorative?: boolean;
};

/**
 * The `XBRW++` lockup.
 *
 * The name is an abbreviation and a version marker rather than a word, which is
 * why it is allowed in Doto — it is a label on a machine, not prose. The `++`
 * carries the fork's identity, so it is the part that may be tinted.
 */
export default function Wordmark({
    fontSize = 15,
    animatedFontSize,
    color = palette.text,
    plusColor,
    decorative = false
}: Props) {
    return (
        <XStack
            // React Native does not promote a View to an accessibility element
            // implicitly, so without this the role and label below are inert and
            // the two halves are announced as "XBRW" and "++" separately.
            accessible={decorative ? undefined : true}
            accessibilityRole={decorative ? undefined : "header"}
            accessibilityLabel={decorative ? undefined : "XBRW++"}
            accessibilityElementsHidden={decorative || undefined}
            importantForAccessibility={decorative ? "no-hide-descendants" : undefined}
            alignItems="center">
            <DotMatrixText fontSize={fontSize} animatedFontSize={animatedFontSize}
                           weight="extrabold" letterSpacing={1} color={color}>
                XBRW
            </DotMatrixText>
            <DotMatrixText fontSize={fontSize} animatedFontSize={animatedFontSize}
                           weight="extrabold" letterSpacing={1}
                           color={plusColor ?? color}>
                ++
            </DotMatrixText>
        </XStack>
    );
}

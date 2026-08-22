import React from "react";
import {XStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";

type Props = {
    fontSize?: number;
    color?: string;
    /** Colour of the `++`. Defaults to the same as the letters. */
    plusColor?: string;
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
    color = palette.text,
    plusColor
}: Props) {
    return (
        <XStack accessibilityRole="header" accessibilityLabel="XBRW++"
                alignItems="center">
            <DotMatrixText fontSize={fontSize} weight="extrabold" letterSpacing={1}
                           color={color}>
                XBRW
            </DotMatrixText>
            <DotMatrixText fontSize={fontSize} weight="extrabold" letterSpacing={1}
                           color={plusColor ?? color}>
                ++
            </DotMatrixText>
        </XStack>
    );
}

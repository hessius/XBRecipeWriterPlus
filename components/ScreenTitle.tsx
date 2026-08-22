import React from "react";
import {XStack, Text} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";

/** The size a screen title uses when the header is at rest. */
export const TITLE_FONT_SIZE = 28;

/** The size it shrinks to once the header collapses. */
export const TITLE_FONT_SIZE_COMPACT = 18;

/**
 * How far the superscript sits below the top of the title's line. Derived from
 * the title size rather than written as a literal so the two cannot drift apart
 * — including when the header collapses and the title changes size.
 */
function countLift(fontSize: number): number {
    return Math.round(fontSize * 0.14);
}

type Props = {
    /** Prose, so this is Inter — never rendered in Doto. */
    title: string;
    /** Rendered as a small superscript. Hidden when absent or zero. */
    count?: number;
    fontSize?: number;
};

/**
 * A screen title with a machine-counted superscript beside it.
 *
 * The split is the typography rule in miniature: the word is prose, the number
 * is a machine-derived value.
 */
export default function ScreenTitle({title, count, fontSize = TITLE_FONT_SIZE}: Props) {
    const showCount = typeof count === "number" && count > 0;

    return (
        <XStack alignItems="flex-start" gap="$1">
            {/* Without flexShrink a long title keeps its full measured width
                and pushes the count off the edge of the screen. */}
            <Text fontSize={fontSize} fontWeight="700" color={palette.text}
                  flexShrink={1} numberOfLines={1}>
                {title}
            </Text>
            {showCount && (
                <DotMatrixText testID="screen-title-count" fontSize={11}
                               weight="bold" color={palette.dim}
                               style={{marginTop: countLift(fontSize)}}>
                    {count}
                </DotMatrixText>
            )}
        </XStack>
    );
}

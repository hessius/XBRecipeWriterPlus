import React from "react";
import {XStack, Text} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";

const TITLE_FONT_SIZE = 28;

/**
 * How far the superscript sits below the top of the title's line. Derived from
 * the title size rather than written as a literal so the two cannot drift apart.
 */
const COUNT_LIFT = Math.round(TITLE_FONT_SIZE * 0.14);

type Props = {
    /** Prose, so this is Inter — never rendered in Doto. */
    title: string;
    /** Rendered as a small superscript. Hidden when absent or zero. */
    count?: number;
};

/**
 * A screen title with a machine-counted superscript beside it.
 *
 * The split is the typography rule in miniature: the word is prose, the number
 * is a machine-derived value.
 */
export default function ScreenTitle({title, count}: Props) {
    const showCount = typeof count === "number" && count > 0;

    return (
        <XStack alignItems="flex-start" gap="$1">
            {/* Without flexShrink a long title keeps its full measured width
                and pushes the count off the edge of the screen. */}
            <Text fontSize={TITLE_FONT_SIZE} fontWeight="700" color={palette.text}
                  flexShrink={1} numberOfLines={1}>
                {title}
            </Text>
            {showCount && (
                <DotMatrixText testID="screen-title-count" fontSize={11}
                               weight="bold" color={palette.muted}
                               style={{marginTop: COUNT_LIFT}}>
                    {count}
                </DotMatrixText>
            )}
        </XStack>
    );
}

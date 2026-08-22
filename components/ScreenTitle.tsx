import React from "react";
import {XStack, Text} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";

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
            <Text fontSize={28} fontWeight="700" color={palette.text}>
                {title}
            </Text>
            {showCount && (
                <DotMatrixText testID="screen-title-count" fontSize={11}
                               weight="bold" color={palette.muted}
                               style={{marginTop: 4}}>
                    {count}
                </DotMatrixText>
            )}
        </XStack>
    );
}

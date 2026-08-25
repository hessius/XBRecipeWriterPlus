import React from "react";
import {Text, XStack, YStack} from "tamagui";

import {palette} from "@/constants/colors";
import {RECIPE_HELP, type HelpTopic} from "@/constants/recipeHelp";

type Props = {
    topic: HelpTopic;
    /** Draw the one-line hint under the label. Off by default. */
    showHint?: boolean;
    /** A validation reason to show under the row. Prose, so it stays in Inter. */
    error?: string;
    children: React.ReactNode;
};

/**
 * One line of the BREW deck.
 *
 * The hint is the six-word version, and it is the only help this row carries.
 * It used to be drawn unconditionally, on the argument that it is what makes the
 * screen readable without any help mode at all; on a phone, nine of them turned
 * the deck into prose and pushed the values off the bottom. It is now a setting,
 * off by default. Anything longer than a hint is in the help sheet, one entry
 * down in the overflow -- not behind a marker on this label, and not unfolded
 * under this row. Both of those were tried and both spent the screen's height on
 * words nobody had asked for yet.
 *
 * The row has no label prop: it is identified by its help topic and takes its
 * words from `RECIPE_HELP`. A field on this deck without an entry there cannot
 * be drawn, which is the point — a field nobody wrote a note for is a field
 * nobody explained.
 */
export default function FieldRow({topic, showHint, error, children}: Props) {
    const entry = RECIPE_HELP[topic];

    return (
        <YStack paddingHorizontal="$4" paddingVertical="$3"
                borderBottomWidth={1} borderBottomColor={palette.line}>
            <XStack alignItems="center" justifyContent="space-between" gap="$3">
                <YStack flex={1} gap="$1">
                    <Text fontSize={11} letterSpacing={1.5}
                          textTransform="uppercase" color={palette.muted}>
                        {entry.title}
                    </Text>
                    {showHint && entry.hint !== undefined && (
                        <Text fontSize={11} color={palette.dim}>{entry.hint}</Text>
                    )}
                </YStack>
                {children}
            </XStack>

            {/* The validation reason, when there is one. Full width under the
                row rather than crammed beside the right-aligned input, and in
                Inter (the default body face) because it is a sentence, not a
                machine caption. */}
            {error && (
                <Text fontSize={11} lineHeight={16} color={palette.danger} marginTop="$2">
                    {error}
                </Text>
            )}

        </YStack>
    );
}

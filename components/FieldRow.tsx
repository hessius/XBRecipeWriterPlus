import React from "react";
import {Pressable} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import {palette} from "@/constants/colors";
import {RECIPE_HELP, type HelpTopic} from "@/constants/recipeHelp";
import type {HelpStyle} from "@/library/Settings";

type Props = {
    topic: HelpTopic;
    helpStyle?: HelpStyle;
    /** Explain mode is on. Only consulted when `helpStyle` is "explain". */
    explaining?: boolean;
    /** Draw the always-on one-line hint under the label. Off by default. */
    showHint?: boolean;
    /** A validation reason to show under the row. Prose, so it stays in Inter. */
    error?: string;
    onHelp?: (topic: HelpTopic) => void;
    children: React.ReactNode;
};

/**
 * One line of the BREW deck.
 *
 * The hint is the six-word version. It used to be drawn unconditionally, on the
 * argument that it is what makes the screen readable without any help mode at
 * all; on a phone, nine of them turned the deck into prose and pushed the values
 * off the bottom. It is now a setting, off by default. What the two help styles
 * change is where the *long* form goes: behind a marker on the label, or
 * unfolded under the row.
 *
 * The row has no label prop: it is identified by its help topic and takes its
 * words from `RECIPE_HELP`. A field on this deck without an entry there cannot
 * be drawn, which is the point — a field nobody wrote a note for is a field
 * nobody explained.
 */
export default function FieldRow({
    topic, helpStyle, explaining, showHint, error, onHelp, children
}: Props) {
    const entry = RECIPE_HELP[topic];
    const hasDetail = entry.detail !== undefined;
    const showMarker = hasDetail && helpStyle === "markers";
    const showDetail = hasDetail && helpStyle === "explain" && explaining === true;

    return (
        <YStack paddingHorizontal="$4" paddingVertical="$3"
                borderBottomWidth={1} borderBottomColor={palette.line}>
            <XStack alignItems="center" justifyContent="space-between" gap="$3">
                <YStack flex={1} gap="$1">
                    <XStack alignItems="center" gap="$2">
                        <Text fontSize={11} letterSpacing={1.5}
                              textTransform="uppercase" color={palette.muted}>
                            {entry.title}
                        </Text>
                        {showMarker && onHelp && (
                            <Pressable accessibilityRole="button"
                                       accessibilityLabel={`What is ${entry.title}?`}
                                       onPress={() => onHelp(topic)}
                                       hitSlop={10}>
                                <DotIcon name="help" size={13} color={palette.dim}/>
                            </Pressable>
                        )}
                    </XStack>
                    {showHint && (
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

            {/* Mounted only while explaining, never merely clipped. Collapsible
                keeps children mounted, which would make a "the detail is hidden"
                test pass for the wrong reason — and nothing here needs to
                animate: the explain toggle switches a whole screenful at once,
                which is a mode change rather than a disclosure. */}
            {showDetail && (
                <Text fontSize={12} lineHeight={18} color={palette.dim}
                      paddingTop="$3" paddingLeft="$3" marginTop="$2"
                      borderLeftWidth={2} borderLeftColor={palette.line}>
                    {entry.detail}
                </Text>
            )}
        </YStack>
    );
}

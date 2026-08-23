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
    onHelp?: (topic: HelpTopic) => void;
    children: React.ReactNode;
};

/**
 * One line of the BREW deck.
 *
 * The hint is always drawn — it is the six-word version, and it is what makes
 * the screen readable without any help mode at all. What the two help styles
 * change is where the long form goes: behind a marker on the label, or unfolded
 * under the row.
 *
 * The row has no label prop: it is identified by its help topic and takes its
 * words from `RECIPE_HELP`. A field on this deck without an entry there cannot
 * be drawn, which is the point — a field nobody wrote a note for is a field
 * nobody explained.
 */
export default function FieldRow({topic, helpStyle, explaining, onHelp, children}: Props) {
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
                                <DotIcon name="info" size={13} color={palette.dim}/>
                            </Pressable>
                        )}
                    </XStack>
                    <Text fontSize={11} color={palette.muted}>{entry.hint}</Text>
                </YStack>
                {children}
            </XStack>

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

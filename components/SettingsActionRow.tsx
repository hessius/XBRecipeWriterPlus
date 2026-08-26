import React from "react";
import {Pressable} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import {palette} from "@/constants/colors";

type Props = {
    label: string;
    /** Shown under the label. The version, or what the action will do. */
    detail?: string;
    /** `danger` for a row that destroys something. */
    tone?: "default" | "danger";
    onPress: () => void;
};

/**
 * A settings row that does something rather than holding a value.
 *
 * The chevron is the `back` glyph rotated, which is how `StageTile` already
 * builds its caret: rotating one bitmap beats drawing a second that has to look
 * like its sibling. The rotation goes on a wrapper because `DotIcon` owns its
 * own style prop.
 */
export default function SettingsActionRow({label, detail, tone = "default", onPress}: Props) {
    const ink = tone === "danger" ? palette.danger : palette.text;

    return (
        <Pressable accessibilityRole="button" accessibilityLabel={label}
                   accessibilityHint={detail}
                   onPress={onPress}>
            <XStack alignItems="center" justifyContent="space-between" gap="$4"
                    paddingVertical="$3.5" borderBottomWidth={1}
                    borderBottomColor={palette.line}>
                <YStack flex={1} gap="$1">
                    <Text fontSize={16} color={ink}>{label}</Text>
                    {detail !== undefined && (
                        <Text fontSize={13} color={palette.dim}>{detail}</Text>
                    )}
                </YStack>
                {/* Decorative: the row is already a labelled button, so the
                    glyph must not become a second accessibility element. */}
                <XStack style={{transform: [{rotate: "180deg"}]}}>
                    <DotIcon name="back" size={14} color={palette.muted}/>
                </XStack>
            </XStack>
        </Pressable>
    );
}

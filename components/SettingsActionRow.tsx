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
        // The detail joins the label rather than staying in the hint: VoiceOver
        // hints can be switched off, and a version number nobody hears is not
        // shown at all.
        //
        // The dim on press is CtaTile's (`opacity: 0.7, scale: 0.98`), so every
        // primary tap in the app answers the finger the same way. It rides the
        // Pressable's own pressed state rather than a Tamagui `pressStyle`
        // because this row is a plain React Native Pressable — the thing that
        // owns the button role and the composed label — and RN's press system
        // does not drive Tamagui's.
        <Pressable accessibilityRole="button"
                   accessibilityLabel={detail === undefined ? label : `${label}, ${detail}`}
                   onPress={onPress}
                   style={({pressed}) => ({
                       opacity:   pressed ? 0.7 : 1,
                       transform: [{scale: pressed ? 0.98 : 1}]
                   })}>
            {/* No borderBottom here any more: the card in `SettingsSection`
                draws the dividers between rows, so the first and last meet its
                rounded corners with no stray hairline. `paddingHorizontal="$4"`
                and `minHeight={44}` are the editor `FieldRow`'s inset and iOS's
                minimum touch target — a one-line action row would otherwise fall
                just short of 44pt. */}
            <XStack testID="settings-action-row"
                    alignItems="center" justifyContent="space-between" gap="$4"
                    minHeight={44} paddingVertical="$3" paddingHorizontal="$4">
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

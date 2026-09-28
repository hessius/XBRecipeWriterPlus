import React from "react";
import {Pressable, type FlexAlignType} from "react-native";
import {Text} from "tamagui";

import {openLink} from "@/components/openLink";
import {palette} from "@/constants/colors";

/**
 * A tappable line.
 *
 * A bare `Text` with an `onPress` is about thirty points tall and gives no
 * feedback; `Pressable` with a minimum height is what `SettingsActionRow` uses,
 * and these are the same kind of affordance.
 */
export default function LinkText({
    label,
    url,
    onPress,
    accessibilityLabel = label,
    fontSize = 14,
    textAlign,
    alignItems
}: {
    label: string;
    url?: string;
    onPress?: () => void;
    accessibilityLabel?: string;
    fontSize?: number;
    textAlign?: "auto" | "left" | "right" | "center" | "justify";
    alignItems?: FlexAlignType;
}) {
    return (
        <Pressable
            accessibilityRole="link"
            accessibilityLabel={accessibilityLabel}
            style={({pressed}) => ({
                alignItems,
                justifyContent: "center",
                minHeight: 44,
                opacity: pressed ? 0.6 : 1
            })}
            onPress={() => {
                if (onPress !== undefined) return onPress();
                if (url !== undefined) openLink(url);
            }}>
            {/* Brand magenta rather than an underline: the only coloured thing
                in a block of grey prose reads as "this is a link" without
                dressing the prose itself up as a hyperlink. */}
            <Text
                color={palette.brand}
                fontSize={fontSize}
                fontWeight="600"
                textAlign={textAlign}
            >
                {label}
            </Text>
        </Pressable>
    );
}

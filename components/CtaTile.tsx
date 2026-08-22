import React from "react";
import {AntDesign} from "@expo/vector-icons";
import {YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";

type Props = {
    /** An AntDesign glyph name. v15 uses kebab-case, e.g. `plus-circle`. */
    icon: React.ComponentProps<typeof AntDesign>["name"];
    /** Shown in Doto, so keep it short and upper-case. */
    label: string;
    onPress: () => void;
    /** Spell the action out here when the label is an abbreviation. */
    accessibilityLabel?: string;
    disabled?: boolean;
};

/**
 * A primary action: icon above a dot-matrix label.
 *
 * The home screen shows two of these at equal weight. There is deliberately no
 * primary/secondary variant — if a third action ever earns equal weight it joins
 * the row; if it does not, it does not belong here.
 */
export default function CtaTile({
    icon,
    label,
    onPress,
    accessibilityLabel,
    disabled = false
}: Props) {
    const handlePress = () => {
        if (!disabled) {
            onPress();
        }
    };

    return (
        <YStack
            flex={1}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? label}
            accessibilityState={{disabled}}
            onPress={handlePress}
            alignItems="center"
            justifyContent="center"
            gap="$2"
            paddingVertical="$4"
            borderRadius="$6"
            backgroundColor={palette.raised}
            borderWidth={1}
            borderColor={palette.line}
            opacity={disabled ? 0.4 : 1}
            pressStyle={disabled ? undefined : {opacity: 0.7, scale: 0.98}}>
            <AntDesign name={icon} size={22}
                       color={disabled ? palette.muted : palette.text}/>
            <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.5}
                           color={disabled ? palette.muted : palette.text}>
                {label}
            </DotMatrixText>
        </YStack>
    );
}

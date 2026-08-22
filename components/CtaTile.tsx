import React from "react";
import {YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import type {DotIconName} from "@/constants/dotIcons";
import {palette} from "@/constants/colors";

/** The icon size inside a tile: large enough that the dot grid still reads. */
const TILE_ICON_SIZE = 26;

type Props = {
    icon: DotIconName;
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
    return (
        <YStack
            flex={1}
            // React Native does not promote a View to an accessibility element
            // implicitly, so without this the role and label below are inert and
            // the icon and label are announced as two separate items.
            accessible
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? label}
            accessibilityState={{disabled}}
            onPress={disabled ? undefined : onPress}
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
            <DotIcon testID="cta-tile-icon" name={icon} size={TILE_ICON_SIZE}
                     color={disabled ? palette.muted : palette.text}/>
            <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.5}
                           color={disabled ? palette.muted : palette.text}>
                {label}
            </DotMatrixText>
        </YStack>
    );
}

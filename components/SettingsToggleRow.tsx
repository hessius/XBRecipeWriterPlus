import React from "react";
import {Switch, Text, XStack, YStack} from "tamagui";

import {palette} from "@/constants/colors";

type Props = {
    label: string;
    description: string;
    value: boolean;
    onChange: (value: boolean) => void;
};

/** A setting that is on or off. */
export default function SettingsToggleRow({label, description, value, onChange}: Props) {
    return (
        // No borderBottom, and `paddingHorizontal="$4"` / `minHeight={44}` to
        // match the other rows inside `SettingsSection`'s card: the section owns
        // the dividers, the inset is the editor `FieldRow`'s, and the switch's
        // 44pt keeps the row a full touch target even when the description wraps
        // to a single line.
        <XStack alignItems="center" justifyContent="space-between" gap="$4"
                minHeight={44} paddingVertical="$3" paddingHorizontal="$4">
            <YStack flex={1} gap="$1">
                <Text fontSize={16} color={palette.text}>{label}</Text>
                <Text fontSize={13} color={palette.dim}>{description}</Text>
            </YStack>
            {/* Off track is `control`, the token for a small control that has to
                read as tappable, not `line`, which is for hairlines: on the
                card's `surface` fill the lighter `control` grey is what tells
                the switch apart from a divider. `success` on marks "active" the
                way it does everywhere else the app confirms a state. */}
            <Switch accessibilityLabel={label} accessibilityRole="switch"
                    accessibilityState={{checked: value}} checked={value}
                    onCheckedChange={onChange} size="$3"
                    backgroundColor={value ? palette.success : palette.control}>
                <Switch.Thumb backgroundColor={palette.text}/>
            </Switch>
        </XStack>
    );
}

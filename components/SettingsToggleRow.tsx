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
        <XStack alignItems="center" justifyContent="space-between" gap="$4"
                paddingVertical="$3" borderBottomWidth={1} borderBottomColor={palette.line}>
            <YStack flex={1} gap="$1">
                <Text fontSize={16} color={palette.text}>{label}</Text>
                <Text fontSize={13} color={palette.dim}>{description}</Text>
            </YStack>
            <Switch accessibilityLabel={label} accessibilityRole="switch"
                    accessibilityState={{checked: value}} checked={value}
                    onCheckedChange={onChange} size="$3"
                    backgroundColor={value ? palette.success : palette.line}>
                <Switch.Thumb backgroundColor={palette.text}/>
            </Switch>
        </XStack>
    );
}

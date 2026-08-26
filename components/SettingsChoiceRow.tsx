import React from "react";
import {Text, XStack, YStack} from "tamagui";

import SegmentedControl, {type SegmentOption} from "@/components/SegmentedControl";
import {palette} from "@/constants/colors";

type Props = {
    label: string;
    description: string;
    value: string;
    options: readonly SegmentOption[];
    onChange: (value: string) => void;
};

/** A setting that is one of a short list. */
export default function SettingsChoiceRow({
    label, description, value, options, onChange
}: Props) {
    return (
        <XStack alignItems="center" justifyContent="space-between" gap="$4"
                paddingVertical="$3" borderBottomWidth={1} borderBottomColor={palette.line}>
            <YStack flex={1} gap="$1">
                <Text fontSize={16} color={palette.text}>{label}</Text>
                <Text fontSize={13} color={palette.dim}>{description}</Text>
            </YStack>
            <SegmentedControl value={value} options={options} onChange={onChange}/>
        </XStack>
    );
}

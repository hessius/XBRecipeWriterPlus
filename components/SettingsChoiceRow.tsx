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
        // Same card-row treatment as the other two: the section draws the
        // dividers, `paddingHorizontal="$4"` insets the content, `minHeight={44}`
        // keeps the row a full target. The `SegmentedControl` fills itself with
        // `raised`, a step lighter than the card's `surface`, so it reads as a
        // control sitting on the card rather than merging into it — which is the
        // whole reason the section is `surface` and not `raised`.
        <XStack alignItems="center" justifyContent="space-between" gap="$4"
                minHeight={44} paddingVertical="$3" paddingHorizontal="$4">
            <YStack flex={1} gap="$1">
                <Text fontSize={16} color={palette.text}>{label}</Text>
                <Text fontSize={13} color={palette.dim}>{description}</Text>
            </YStack>
            <SegmentedControl value={value} options={options} onChange={onChange}
                              accessibilityLabel={label}/>
        </XStack>
    );
}

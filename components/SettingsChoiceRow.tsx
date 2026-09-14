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
    /**
     * Put the control beneath the label rather than beside it.
     *
     * For a choice too wide to share a line. `SegmentedControl` sizes to its
     * content and does not flex, so four segments beside a flexible label
     * squeeze the description into a four-line wrap.
     *
     * Left unset this is decided from the width of the options themselves --
     * see `WIDE_OPTIONS_CHARS`. Pass it explicitly to overrule that.
     */
    stacked?: boolean;
};

/**
 * The combined length of the option labels past which a choice gets its own
 * line unless told otherwise.
 *
 * The retention row shipped without `stacked` and rendered its label one word
 * per line, because the control takes the width it needs and the label column
 * absorbs the loss. Guessing from the labels means forgetting the prop costs a
 * taller row rather than an unreadable one -- the failure that actually
 * happened. Twenty is comfortably above the widest pair that reads well beside
 * a label ("°C"/"°F", "ON"/"OFF") and below the retention row's twenty-three.
 */
const WIDE_OPTIONS_CHARS = 20;

/** A setting that is one of a short list. */
export default function SettingsChoiceRow({
    label, description, value, options, onChange, stacked
}: Props) {
    const width = options.reduce((n, option) => n + option.label.length, 0);
    if (stacked ?? width > WIDE_OPTIONS_CHARS) {
        return (
            <YStack testID="settings-choice-stacked" gap="$2.5"
                    paddingVertical="$3" paddingHorizontal="$4">
                <YStack gap="$1">
                    <Text fontSize={16} color={palette.text}>{label}</Text>
                    <Text fontSize={13} color={palette.dim}>{description}</Text>
                </YStack>
                <SegmentedControl value={value} options={options} onChange={onChange}
                                  accessibilityLabel={label}/>
            </YStack>
        );
    }

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

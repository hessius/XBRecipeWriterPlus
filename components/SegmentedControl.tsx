import React from "react";
import {Pressable} from "react-native";
import {Text, XStack} from "tamagui";

import {palette} from "@/constants/colors";

export type SegmentOption = {
    value: string;
    label: string;
};

type Props = {
    value: string;
    options: readonly SegmentOption[];
    onChange: (value: string) => void;
    /** Fill of the selected segment. The editor passes the recipe's accent. */
    accent?: string;
};

/**
 * A short list of options, one of which is on.
 *
 * Lifted out of `SegmentedRow`, which pairs it with a `FieldRow` and so requires
 * a `HelpTopic`. Settings has options to offer and no help topics to name them
 * by, and inventing one would put a settings row into the recipe editor's help
 * sheet. The chrome and the control are two responsibilities; this is the
 * control.
 */
export default function SegmentedControl({value, options, onChange, accent}: Props) {
    return (
        <XStack accessible accessibilityRole="radiogroup" backgroundColor={palette.raised}
                borderRadius="$3" padding={2} gap={2}>
            {options.map((option) => {
                const selected = option.value === value;
                return (
                    <Pressable key={option.value} accessibilityRole="radio"
                               accessibilityLabel={option.label}
                               accessibilityState={{checked: selected}}
                               onPress={() => onChange(option.value)}>
                        <Text fontSize={11} fontWeight="600"
                              paddingHorizontal="$2.5" paddingVertical="$1.5"
                              borderRadius="$2"
                              backgroundColor={selected ? (accent ?? palette.text) : undefined}
                              color={selected ? palette.base : palette.dim}>
                            {option.label}
                        </Text>
                    </Pressable>
                );
            })}
        </XStack>
    );
}

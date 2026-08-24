import React from "react";
import {Pressable} from "react-native";
import {Text, XStack} from "tamagui";

import FieldRow from "@/components/FieldRow";
import {palette} from "@/constants/colors";
import type {HelpTopic} from "@/constants/recipeHelp";
import type {HelpStyle} from "@/library/Settings";

export type SegmentOption = {
    value: string;
    label: string;
};

type Props = {
    topic: HelpTopic;
    value: string;
    options: readonly SegmentOption[];
    onChange: (value: string) => void;
    /** The recipe's accent, used to fill the selected segment. */
    accent?: string;
    helpStyle?: HelpStyle;
    explaining?: boolean;
    showHint?: boolean;
    onHelp?: (topic: HelpTopic) => void;
};

/** A `FieldRow` whose value is one of a short list. */
export default function SegmentedRow({
    topic, value, options, onChange, accent, helpStyle, explaining, showHint, onHelp
}: Props) {
    return (
        <FieldRow topic={topic} helpStyle={helpStyle} explaining={explaining}
                  showHint={showHint} onHelp={onHelp}>
            <XStack accessibilityRole="radiogroup" backgroundColor={palette.raised}
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
        </FieldRow>
    );
}

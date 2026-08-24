import React from "react";
import {ScrollView, Switch, Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import {useSetting} from "@/hooks/useSetting";
import {asHelpStyle, type Settings} from "@/library/Settings";

type Props = {
    /** Injected by tests. The route renders with the shared store. */
    settings?: Settings;
};

type RowProps = {
    label: string;
    description: string;
    value: boolean;
    onChange: (value: boolean) => void;
};

function ToggleRow({label, description, value, onChange}: RowProps) {
    return (
        <XStack alignItems="center" justifyContent="space-between" gap="$4"
                paddingVertical="$3">
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

type ChoiceRowProps<T extends string> = {
    label: string;
    description: string;
    value: T;
    options: readonly { value: T; label: string; description: string }[];
    onChange: (value: T) => void;
};

/**
 * A setting with more than two states.
 *
 * A radio group rather than a segmented control: the options carry a line of
 * explanation each, which a segment has nowhere to put.
 */
function ChoiceRow<T extends string>({label, description, value, options, onChange}: ChoiceRowProps<T>) {
    return (
        <YStack gap="$2" paddingVertical="$3">
            <YStack gap="$1">
                <Text fontSize={16} color={palette.text}>{label}</Text>
                <Text fontSize={13} color={palette.dim}>{description}</Text>
            </YStack>
            <YStack accessibilityRole="radiogroup" gap="$2" paddingTop="$1">
                {options.map((option) => (
                    <XStack key={option.value} accessible accessibilityRole="radio"
                            accessibilityLabel={option.label}
                            accessibilityState={{checked: option.value === value}}
                            onPress={() => onChange(option.value)}
                            alignItems="center" gap="$3"
                            backgroundColor={palette.raised} borderRadius="$4"
                            padding="$3"
                            borderWidth={1}
                            borderColor={option.value === value ? palette.text : palette.line}>
                        <YStack flex={1} gap="$1">
                            <Text fontSize={15} color={palette.text}>{option.label}</Text>
                            <Text fontSize={12} color={palette.dim}>{option.description}</Text>
                        </YStack>
                    </XStack>
                ))}
            </YStack>
        </YStack>
    );
}

/**
 * The settings screen.
 *
 * One section, deliberately. Sub-projects 4, 5 and 6 add rows to a screen that
 * already exists rather than each inventing one; this ships now because the
 * home screen's settings glyph must not open onto nothing.
 */
export default function SettingsScreen({settings}: Props) {
    const [showCoffeeMarker, setShowCoffeeMarker] =
        useSetting("showCoffeeMarker", settings);
    const [dotMatrixProfile, setDotMatrixProfile] =
        useSetting("dotMatrixProfile", settings);
    const [helpStyle, setHelpStyle] = useSetting("helpStyle", settings);
    const [showHints, setShowHints] = useSetting("showHints", settings);
    const [cardMorph, setCardMorph] = useSetting("cardMorph", settings);

    return (
        <ScrollView backgroundColor={palette.base} contentContainerStyle={{padding: 16}}>
            <YStack gap="$2">
                <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6}
                               color={palette.dim}>
                    RECIPE LIST
                </DotMatrixText>
                <ToggleRow
                    label="Show the COFFEE marker"
                    description="The TEA marker is always shown. COFFEE is redundant in a mostly-coffee library."
                    value={showCoffeeMarker}
                    onChange={setShowCoffeeMarker}/>
                <ToggleRow
                    label="Dot matrix pour profile"
                    description="Fill the graph behind each recipe with a screen of dots instead of a flat tint."
                    value={dotMatrixProfile}
                    onChange={setDotMatrixProfile}/>
            </YStack>
            <YStack gap="$2" paddingTop="$4">
                <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6}
                               color={palette.dim}>
                    EDITOR
                </DotMatrixText>
                <ToggleRow
                    label="Grow the card into the editor"
                    description="Open a recipe by growing the tapped card into the header, instead of sliding the editor in from the right."
                    value={cardMorph}
                    onChange={setCardMorph}/>
                <ToggleRow
                    label="One-line hints"
                    description="A short note under every label on the brew deck. The longer explanations are unaffected."
                    value={showHints}
                    onChange={setShowHints}/>
                <ChoiceRow
                    label="Field explanations"
                    description="Where the longer notes about a field live."
                    value={asHelpStyle(helpStyle)}
                    options={[
                        {
                            value:       "explain",
                            label:       "Explain mode",
                            description: "One switch in the header unfolds every note at once."
                        },
                        {
                            value:       "markers",
                            label:       "A marker per field",
                            description: "A dot beside each label with more to say."
                        }
                    ]}
                    onChange={setHelpStyle}/>
            </YStack>
        </ScrollView>
    );
}

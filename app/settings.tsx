import React from "react";
import {ScrollView, Switch, Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import {useSetting} from "@/hooks/useSetting";
import {asTransition, type Settings} from "@/library/Settings";

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
 * How each transition describes itself in settings.
 *
 * Written as what you will see rather than as what it is called, because the
 * names are only meaningful once you have watched all four.
 */
const TRANSITION_OPTIONS = [
    {value: "slide", label: "Slide in",
     description: "The system's own push, from the right. What every other app does."},
    {value: "morph", label: "Grow the card",
     description: "The tapped card grows into the editor's header and back again."},
    {value: "container", label: "Grow the card, with its name",
     description: "The same, with the recipe's name carried across and the fields rising in behind."},
    {value: "reveal", label: "Colour reveal",
     description: "A disc of the recipe's colour opens from your finger and floods the screen."}
] as const;

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
    const [showHints, setShowHints] = useSetting("showHints", settings);
    const [transition, setTransition] = useSetting("transition", settings);

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
                <ChoiceRow
                    label="Opening a recipe"
                    description="How the editor arrives when you tap a recipe."
                    value={asTransition(transition)}
                    options={TRANSITION_OPTIONS}
                    onChange={setTransition}/>
                <ToggleRow
                    label="One-line hints"
                    description="A short note under every label on the brew deck. The longer explanations live in Help, under the caret."
                    value={showHints}
                    onChange={setShowHints}/>
            </YStack>
        </ScrollView>
    );
}

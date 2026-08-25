import React from "react";
import {ScrollView, Switch, Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import {useSetting} from "@/hooks/useSetting";
import {type Settings} from "@/library/Settings";

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
        </ScrollView>
    );
}

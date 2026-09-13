import React from "react";
import {Pressable, View} from "react-native";
import {Pressable as GesturePressable} from "react-native-gesture-handler";
import {Text, XStack, YStack} from "tamagui";

import Collapsible from "@/components/Collapsible";
import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import {StageRow, StageValue} from "@/components/StageTile";
import {palette} from "@/constants/colors";
import {RECIPE_HELP} from "@/constants/recipeHelp";
import type {BypassField} from "@/hooks/useRecipeEditor";
import {BYPASS_VOLUME} from "@/library/bypassLimits";
import type Recipe from "@/library/Recipe";
import {
    displayRange, displayValues, fromDisplay, toDisplay, unitSuffix,
    type TemperatureUnit
} from "@/library/units";

type Props = {
    recipe: Recipe;
    /** The rung is the open one. */
    open: boolean;
    isTea?: boolean;
    /** Draw the long explanation inside the fold. The card note ignores this. */
    showHint: boolean;
    temperatureUnit: TemperatureUnit;
    onToggle: () => void;
    onEnabledChange: (on: boolean) => void;
    onChange: (field: BypassField, value: number) => void;
};

/**
 * Bypass water, drawn as the closing rung of the stage ladder.
 *
 * Bypass is not a `Pour` and is not in `recipe.pours` -- it is dispensed
 * straight into the cup and never enters the volume the machine checks. It is
 * drawn as a rung anyway because that is how the user experiences it and how
 * the official app presents it: one more thing that happens, at the end.
 *
 * With bypass off this is a dashed ghost in the shape of the rung it will
 * become. A switch in a settings list somewhere else was the alternative, and
 * it costs a screen change to do a thing that belongs where the brew is.
 *
 * The header is a Gesture Handler `Pressable` and everything inside the fold is
 * not -- exactly as in `StageTile`, and for both of its reasons. RN 0.86 dropped
 * `delaysContentTouches`, so a plain header inside a scroll swallowed roughly
 * every third tap; but `Collapsible` closes by setting `pointerEvents: none`,
 * and a Gesture Handler press does not honour an ancestor's pointer events, so
 * one inside the fold stays live while invisible.
 */
export default function BypassRung({
    recipe, open, isTea = false, showHint, temperatureUnit,
    onToggle, onEnabledChange, onChange
}: Props) {
    "use no memo";

    // The model is mutated in place, so the compiler cannot see that a value
    // moved and would serve a cached render.

    // Tea has no bypass anywhere: the machine ignores it, and `shareLink`
    // already suppresses it. An affordance for a thing that cannot happen is
    // worse than a missing one.
    if (isTea) return null;

    if (!recipe.bypassEnabled) {
        return (
            <GesturePressable accessibilityRole="button"
                              accessibilityLabel="Add bypass water"
                              onPress={() => onEnabledChange(true)}>
                <XStack testID="bypass-ghost" alignItems="center" justifyContent="center"
                        gap="$2" marginTop="$2.5" paddingVertical="$3.5"
                        borderRadius="$5" borderWidth={1} borderColor={palette.line}
                        borderStyle="dashed">
                    <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.8}
                                   color={palette.dim}>
                        + BYPASS WATER
                    </DotMatrixText>
                </XStack>
            </GesturePressable>
        );
    }

    return (
        <YStack testID="bypass-rung"
                backgroundColor={open ? palette.surface : palette.raised}
                borderRadius="$5" padding="$3" marginTop="$2.5"
                borderWidth={open ? 1 : 0} borderColor={palette.info}>
            <GesturePressable accessibilityRole="button"
                              accessibilityLabel="Bypass water"
                              accessibilityState={{expanded: open}}
                              onPress={onToggle}>
                <XStack alignItems="center" gap="$2.5">
                    <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.4}
                                   color={palette.info}>
                        BY
                    </DotMatrixText>
                    <XStack flex={1} gap="$3" alignItems="baseline">
                        <XStack gap="$1" alignItems="baseline">
                            <DotMatrixText fontSize={15} weight="bold" color={palette.text}>
                                {String(recipe.bypassVolume)}
                            </DotMatrixText>
                            <Text fontSize={10} color={palette.dim}>ml</Text>
                        </XStack>
                        <XStack gap="$1" alignItems="baseline">
                            <DotMatrixText fontSize={15} weight="bold" color={palette.text}>
                                {String(toDisplay(recipe.bypassTemp, temperatureUnit))}
                            </DotMatrixText>
                            <Text fontSize={10} color={palette.dim}>
                                {unitSuffix(temperatureUnit)}
                            </Text>
                        </XStack>
                    </XStack>
                    <View testID="bypass-caret"
                          style={{transform: [{rotate: open ? "180deg" : "0deg"}]}}>
                        <DotIcon name="more" size={14}
                                 color={open ? palette.info : palette.muted}/>
                    </View>
                </XStack>
            </GesturePressable>

            {/* Outside the fold on purpose. This is not an explanation, it is a
                data-loss warning: writing this recipe to a card silently drops
                the bypass, and someone who folded the notes away has not asked
                to stop being told that. */}
            <XStack testID="bypass-card-note" gap="$2" paddingTop="$2.5">
                <Text fontSize={11} lineHeight={15} color={palette.dim}>
                    A card cannot store bypass water. Writing this recipe to a card
                    leaves it out.
                </Text>
            </XStack>

            <Collapsible open={open}>
                <YStack gap="$2" paddingTop="$3">
                    <StageRow topics={["bypassVolume", "bypassTemperature"]}>
                        <StageValue topic="bypassVolume" value={recipe.bypassVolume}
                                    min={BYPASS_VOLUME.min} max={BYPASS_VOLUME.max}
                                    step={1} accent={palette.info}
                                    onChange={(value) => onChange("volume", value)}/>
                        <StageValue topic="bypassTemperature"
                                    value={toDisplay(recipe.bypassTemp, temperatureUnit)}
                                    min={displayRange(temperatureUnit).min}
                                    max={displayRange(temperatureUnit).max}
                                    step={1}
                                    values={displayValues(temperatureUnit)}
                                    onChange={(value) =>
                                        onChange("temperature",
                                                 fromDisplay(value, temperatureUnit))}/>
                    </StageRow>

                    {showHint && (
                        <Text testID="bypass-explainer" fontSize={11} lineHeight={15}
                              color={palette.dim}>
                            {RECIPE_HELP.bypass.detail}
                        </Text>
                    )}

                    <Pressable accessibilityRole="button"
                               accessibilityLabel="Remove bypass water"
                               onPress={() => onEnabledChange(false)}>
                        <XStack alignSelf="flex-start" paddingVertical="$1.5">
                            <DotMatrixText fontSize={10} weight="bold" letterSpacing={1.6}
                                           color={palette.danger}>
                                REMOVE
                            </DotMatrixText>
                        </XStack>
                    </Pressable>
                </YStack>
            </Collapsible>
        </YStack>
    );
}

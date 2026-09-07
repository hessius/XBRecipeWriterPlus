import React from "react";
import {Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import type Recipe from "@/library/Recipe";

export default function BypassSection({recipe}: {recipe: Recipe}) {
    if (!recipe.bypassEnabled) return null;

    return (
        <XStack marginTop="$3" padding="$3" borderRadius="$4" gap="$2.5"
                backgroundColor={palette.raised}
                borderLeftWidth={2} borderLeftColor={palette.info}>
            <YStack flex={1} gap={3}>
                <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.8}
                               color={palette.info}>
                    BYPASS WATER
                </DotMatrixText>
                <DotMatrixText fontSize={18} weight="bold" letterSpacing={1.2}
                               color={palette.text}>
                    {`${recipe.bypassVolume} ML · ${recipe.bypassTemp} °C`}
                </DotMatrixText>
                <Text testID="bypass-section-body" fontSize={12} lineHeight={17}
                      color={palette.dim}>
                    Bypass water is extra water added straight to the cup to dilute
                    the brew. It is not brewed through the coffee.
                </Text>
            </YStack>
        </XStack>
    );
}

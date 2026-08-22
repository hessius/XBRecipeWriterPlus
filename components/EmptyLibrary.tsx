import React from "react";
import {View} from "react-native";
import {Text, YStack} from "tamagui";

import DotBloom from "@/components/DotBloom";
import {palette} from "@/constants/colors";

const MARK_SIZE = 96;
const MARK_DOT_SIZE = 5;

/**
 * What the list area shows when there are no recipes.
 *
 * It replaces the list only. The header and both CTA tiles stay exactly where
 * they are, so the first thing a new user sees is the two things they can do —
 * which is also why there is no button in here.
 */
export default function EmptyLibrary() {
    return (
        <YStack flex={1} alignItems="center" justifyContent="center"
                gap="$4" paddingHorizontal="$6" paddingVertical="$8">
            {/* The bloom is the app's mark here, not a progress report. */}
            <View accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants">
                <DotBloom progress={0} size={MARK_SIZE} dotSize={MARK_DOT_SIZE}/>
            </View>

            <YStack alignItems="center" gap="$2">
                <Text fontSize={18} fontWeight="700" color={palette.text}>
                    No recipes yet
                </Text>
                <Text fontSize={14} textAlign="center" color={palette.dim}>
                    Read a card or import a recipe using the buttons above.
                </Text>
            </YStack>
        </YStack>
    );
}

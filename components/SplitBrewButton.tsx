import React from "react";
import {Pressable} from "react-native";
import {XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";

export type SplitBrewButtonProps = {
    enabled: boolean;
    accent: string;
    flex: number;
    /** Whether the quick edit panel this button opens is showing. */
    quickEditOpen: boolean;
    onBrew: () => void;
    onToggleQuickEdit: () => void;
};

/**
 * BREW, with the quick edit panel's handle on its right.
 *
 * One control rather than two, because the arrow opens an adjustment to the
 * very brew the other half starts. While the panel is open the arrow is the
 * way back: the panel carries no BREW of its own, so there is exactly one BREW
 * on screen and it always brews what the panel currently says.
 */
export default function SplitBrewButton({
    enabled, accent, flex, quickEditOpen, onBrew, onToggleQuickEdit
}: SplitBrewButtonProps) {
    const brewFill = enabled ? accent : palette.none;

    return (
        <XStack flex={flex} borderRadius="$4" overflow="hidden"
                borderWidth={1} borderColor={accent} backgroundColor={palette.none}>
            <Pressable accessibilityRole="button" accessibilityLabel="Brew"
                       accessibilityState={{disabled: !enabled}}
                       onPress={() => enabled && onBrew()}
                       style={{flex: 1.55}}>
                <YStack flex={1} alignItems="center" justifyContent="center"
                        paddingVertical="$3.5" backgroundColor={brewFill}>
                    <DotMatrixText fontSize={12} weight="bold" letterSpacing={2}
                                   color={enabled ? palette.base : palette.muted}>
                        BREW
                    </DotMatrixText>
                </YStack>
            </Pressable>
            <Pressable accessibilityRole="button"
                       accessibilityLabel={quickEditOpen ? "Close quick edit" : "Quick edit brew"}
                       accessibilityState={{expanded: quickEditOpen}}
                       onPress={onToggleQuickEdit}
                       style={{flex: 0.45}}>
                {/* The hairline is where one tap target ends and the next
                    begins, so it has to be visible against both fills. It was
                    drawn in the accent on an accent fill, which is to say not
                    drawn at all. `base` is the ink the labels already use on
                    an accent fill, so the boundary reads as part of the
                    control rather than as a new colour. */}
                {/* Both halves fill their pressable rather than sizing to
                    their own glyph. The arrow is a shorter run of dots than
                    BREW, so a content-sized half left a couple of points of
                    the control's own backing showing under it: a stray dark
                    line across the bottom of the arrow, with the hairline
                    stopping short of it. */}
                <YStack testID="split-brew-divider"
                        flex={1} alignItems="center" justifyContent="center"
                        paddingVertical="$3.5"
                        borderLeftWidth={1} borderLeftColor={palette.base}
                        backgroundColor={accent}>
                    <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.6}
                                   color={palette.base}>
                        {quickEditOpen ? "▼" : "▲"}
                    </DotMatrixText>
                </YStack>
            </Pressable>
        </XStack>
    );
}

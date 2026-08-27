import React from "react";
import {Pressable} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import ScreenTitle from "@/components/ScreenTitle";
import {onAccent, palette} from "@/constants/colors";

/** Matches the well the recipe screen puts its own back glyph in. */
const KEY_SIZE = 32;

type Props = {
    title: string;
    onBack: () => void;
};

/**
 * The header for the screens that are pushed on top of the app.
 *
 * Settings, About and Licences had the platform's own navigation bar, which put
 * a system-font title and a blue chevron on top of a black app that uses
 * neither. This is the same shape the recipe screen already draws — a glyph in
 * a dark well, then the title — so a pushed screen looks like part of the app
 * rather than like a sheet borrowed from somewhere else.
 *
 * The route that uses this must set `headerShown: false` in `app/_layout.tsx`
 * and not from inside the screen: an effect runs after the first paint, so the
 * native bar this replaces would otherwise get one frame to flash.
 *
 * The title is announced as a heading because the bar it replaces was: without
 * it, a screen reader arriving on a pushed screen has nothing for the rotor to
 * land on and no announcement saying where it landed.
 */
export default function ScreenHeader({title, onBack}: Props) {
    const insets = useSafeAreaInsets();

    return (
        <YStack backgroundColor={palette.base} paddingTop={insets.top}>
            <XStack alignItems="center" gap="$3"
                    paddingHorizontal="$4" paddingTop="$2" paddingBottom="$3">
                <Pressable accessibilityRole="button" accessibilityLabel="Back"
                           onPress={onBack} hitSlop={12}>
                    <YStack testID="screen-header-back" backgroundColor={onAccent.key}
                            borderRadius="$3" width={KEY_SIZE} height={KEY_SIZE}
                            alignItems="center" justifyContent="center">
                        <DotIcon name="back" size={16} color={palette.text}/>
                    </YStack>
                </Pressable>
                <ScreenTitle title={title} heading/>
            </XStack>
        </YStack>
    );
}

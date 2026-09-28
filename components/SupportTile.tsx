import React from "react";
import {Pressable} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import {openLink} from "@/components/openLink";
import {onAccent, palette} from "@/constants/colors";

/** Where the tap goes. */
export const SUPPORT_URL = "https://buymeacoffee.com/hsus";

export const SUPPORT_TITLE = "Buy me a coffee";
export const SUPPORT_BODY =
    "Built by one person in his own time. Free and open source. If you want to, I will not say no.";

/**
 * The tip jar.
 *
 * A filled tile rather than a settings row, and the only solid `brand` fill in
 * the app. `brand` is documented as marking the app being itself and never a
 * state, which is exactly what this is: the author asking, not the app
 * reporting. It is loud on purpose. Almost nobody opens an About screen, and a
 * row that reads like every other row is a row that gets scrolled past.
 *
 * It unlocks nothing and remembers nothing. There is no receipt, no thanks
 * screen and no "already supported" flag, so it needs no setting, which keeps
 * it out of `Settings.DEFAULTS` and out of the backup snapshot.
 *
 * Both lines take solid `onAccent.text` rather than the softer `onAccent.label`
 * the accent tiles use for their second line. That token promises 5.1:1 worst
 * case, but the promise is scoped to the twelve recipe accents; `brand` is not
 * one of them and is darker than all of them, so `onAccent.label` measures
 * 3.80:1 here and misses AA. Solid ink is 5.18:1 on `brand`, and the hierarchy
 * between the two lines comes from size and weight instead of alpha.
 */
export default function SupportTile() {
    return (
        // One label for the whole tile, the way `SettingsActionRow` composes
        // its label and detail: the body is the reason for the tap, not a hint,
        // and a VoiceOver hint can be switched off. "Opens in your browser"
        // because a link that leaves the app should say so before it is taken.
        //
        // The press response is CtaTile's, which every primary tap in the app
        // shares, on the Pressable's own pressed state rather than a Tamagui
        // `pressStyle` -- this is a plain React Native Pressable and RN's press
        // system does not drive Tamagui's.
        <Pressable accessibilityRole="link"
                   accessibilityLabel={`${SUPPORT_TITLE}. ${SUPPORT_BODY} Opens in your browser.`}
                   onPress={() => openLink(SUPPORT_URL)}
                   style={({pressed}) => ({
                       opacity:   pressed ? 0.7 : 1,
                       transform: [{scale: pressed ? 0.98 : 1}]
                   })}>
            <XStack testID="support-tile"
                    alignItems="center" justifyContent="space-between" gap="$4"
                    minHeight={44} marginTop="$4"
                    paddingVertical="$3" paddingHorizontal="$4"
                    backgroundColor={palette.brand} borderRadius="$5">
                <YStack flex={1} gap="$1">
                    <Text fontSize={16} fontWeight="700" color={onAccent.text}>
                        {SUPPORT_TITLE}
                    </Text>
                    <Text fontSize={13} lineHeight={18} color={onAccent.text}>
                        {SUPPORT_BODY}
                    </Text>
                </YStack>
                {/* Decorative: the tile is already one labelled link, so the
                    glyph must not become a second accessibility element. The
                    chevron is the `back` glyph rotated, as everywhere else. */}
                <XStack style={{transform: [{rotate: "180deg"}]}}>
                    <DotIcon name="back" size={14} color={onAccent.marker}/>
                </XStack>
            </XStack>
        </Pressable>
    );
}

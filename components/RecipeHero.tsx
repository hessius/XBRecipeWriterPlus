import React from "react";
import {View} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotMatrixText, {DOTO_MAX_FONT_SCALE} from "@/components/DotMatrixText";
import PourProfile, {PROFILE_BLEED} from "@/components/PourProfile";
import {onAccent} from "@/constants/colors";
import type Pour from "@/library/Pour";

/** How far the watermark runs past the slab before it is clipped. */
const PROFILE_OVERHANG = 2;

type Props = {
    /** Already resolved by the caller, via `Recipe.displayName()`. */
    name: string;
    /** False when `name` is a placeholder, which is then drawn muted. */
    named: boolean;
    xid: string;
    accent: string;
    beverage: "COFFEE" | "TEA";
    pours: Pour[];
};

/**
 * The recipe, as a picture.
 *
 * Deliberately inert. Every value shown here is edited in the BREW deck, so the
 * hero never has to be both a headline and a form — the two jobs pulled the
 * layout apart in every mockup that tried to do both.
 *
 * The name arrives already chosen. Working out what to call a recipe that has
 * none is `Recipe.displayName`'s job and it is a chain of four fallbacks, so a
 * second opinion here would eventually disagree with the home screen about what
 * the same recipe is called.
 */
export default function RecipeHero({name, named, xid, accent, beverage, pours}: Props) {
    return (
        <YStack testID="recipe-hero" backgroundColor={accent} borderRadius="$6"
                paddingHorizontal="$4" paddingTop="$3.5" paddingBottom="$3"
                overflow="hidden">
            {/* No opacity on this wrapper. The stroke colour already carries its
                own dimming and a group opacity multiplies it — which is how the
                watermark once measured 8.46:1 as a token and rendered at 2.72:1
                on the palest accent. */}
            <View pointerEvents="none"
                  style={{
                      position: "absolute",
                      right:    -(PROFILE_BLEED + PROFILE_OVERHANG),
                      bottom:   -(PROFILE_BLEED + PROFILE_OVERHANG)
                  }}>
                <PourProfile pours={pours} width={190} height={74}
                             stroke={onAccent.profileStroke} fill={onAccent.profileFill}/>
            </View>

            <XStack alignItems="center" gap="$2">
                <DotMatrixText fontSize={11} weight="bold" letterSpacing={2}
                               color={onAccent.label}>
                    {beverage}
                </DotMatrixText>
                {xid !== "" && (
                    <XStack testID="hero-xid" backgroundColor={onAccent.key}
                            borderRadius="$2" paddingHorizontal="$1.5" paddingVertical={1}>
                        <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6}
                                       color={accent}>
                            {xid}
                        </DotMatrixText>
                    </XStack>
                )}
            </XStack>

            {/* Bounded to the same scale Doto is, exactly as the home card is,
                so a long name at a large text size does not swallow the slab. */}
            <Text fontSize={26} fontWeight="700" lineHeight={31} marginTop="$2"
                  maxFontSizeMultiplier={DOTO_MAX_FONT_SCALE}
                  color={named ? onAccent.text : onAccent.label}
                  numberOfLines={2} maxWidth="72%">
                {name}
            </Text>
        </YStack>
    );
}

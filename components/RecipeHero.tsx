import React from "react";
import {Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import PourProfile from "@/components/PourProfile";
import {onAccent} from "@/constants/colors";
import type Pour from "@/library/Pour";

type Props = {
    name: string;
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
 */
export default function RecipeHero({name, xid, accent, beverage, pours}: Props) {
    return (
        <YStack testID="recipe-hero" backgroundColor={accent} borderRadius="$6"
                paddingHorizontal="$4" paddingTop="$3.5" paddingBottom="$3"
                overflow="hidden">
            <YStack position="absolute" right={-4} bottom={-2} opacity={0.9}>
                <PourProfile pours={pours} width={190} height={74}
                             stroke={onAccent.profileStroke} fill={onAccent.profileFill}/>
            </YStack>

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

            <Text fontSize={26} fontWeight="700" lineHeight={31} marginTop="$2"
                  color={onAccent.text} numberOfLines={2} maxWidth="72%">
                {name.trim() === "" ? "UNTITLED" : name}
            </Text>
        </YStack>
    );
}

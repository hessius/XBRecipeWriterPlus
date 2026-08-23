import React from "react";
import {Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";

/**
 * What tea does differently, said out loud.
 *
 * `Recipe` special-cases tea in eight places and the old editor explained none
 * of them, so a user who typed 120 ml watched it become 90 with no account of
 * why.
 */
export default function TeaBanner({accent}: {accent: string}) {
    return (
        <XStack marginTop="$3" padding="$3" borderRadius="$4" gap="$2.5"
                backgroundColor={palette.raised}
                borderLeftWidth={2} borderLeftColor={accent}>
            <YStack flex={1} gap={3}>
                <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.8}
                               color={accent}>
                    TEA
                </DotMatrixText>
                <Text testID="tea-banner-body" fontSize={12} lineHeight={17}
                      color={palette.dim}>
                    Tea stages are capped at 90 ml each and the grinder is not used.
                    The siphon draws roughly 30 ml more than the recipe asks for, so
                    a cup finishes fuller than the numbers here.
                </Text>
            </YStack>
        </XStack>
    );
}

import React, {useState} from "react";
import {Image} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import PourProfile from "@/components/PourProfile";
import {palette} from "@/constants/colors";
import type {ImportPreview} from "@/hooks/useRecipeImport";

/** The pod mark's diameter. Two lines of text tall, so nothing below it moves. */
const POD_SIZE = 44;
const PROFILE_WIDTH = 240;
const PROFILE_HEIGHT = 44;

type Props = {
    preview: ImportPreview;
    onOpen: () => void;
};

/**
 * What the lookup found, on the typed path.
 *
 * A picture of its props: no fetching, no timers, no subscription -- which is
 * what makes the sheet's `prewarm` safe, since a pre-warm renders this a second
 * time before it is seen.
 *
 * It says more than a name because it is the entire defence against a typo. A
 * typed value resolves without navigating precisely so that this panel can be
 * read first, and a panel showing only "Found" would make that pause worthless.
 */
export default function ImportResult({preview, onOpen}: Props) {
    const {recipe, isExisting, name, subtitle, imageURL} = preview;
    const [podLoaded, setPodLoaded] = useState(false);

    return (
        <YStack gap="$3" paddingTop="$2">
            <XStack alignItems="flex-start" gap="$3">
                <YStack flex={1} gap="$1">
                    <Text color={palette.text} fontSize={17} numberOfLines={2}>
                        {name}
                    </Text>
                    {subtitle.length > 0 && (
                        <Text color={palette.dim} fontSize={13} numberOfLines={1}>
                            {subtitle}
                        </Text>
                    )}
                </YStack>

                {/* The pod photo, when there is one. Absent for every shared
                    recipe, so there is no placeholder and no spinner: the panel
                    is only as tall as the two lines of text beside this, and
                    the layout does not lurch between a pod recipe and a shared
                    one. A failed load is indistinguishable from a recipe that
                    never had a photo, and is never reported. */}
                {imageURL.length > 0 && (
                    <Image testID="import-result-pod"
                           source={{uri: imageURL}}
                           onLoad={() => setPodLoaded(true)}
                           style={{
                               width:        POD_SIZE,
                               height:       POD_SIZE,
                               borderRadius: POD_SIZE / 2,
                               opacity:      podLoaded ? 1 : 0
                           }}/>
                )}
            </XStack>

            <PourProfile testID="import-result-profile"
                         pours={recipe.pours}
                         width={PROFILE_WIDTH} height={PROFILE_HEIGHT}
                         stroke={palette.dim} fill={palette.line}/>

            <XStack gap="$4">
                <Figure label="DOSE" value={String(recipe.dosage)}/>
                <Figure label="RATIO" value={`1:${recipe.ratio}`}/>
                <Figure label="STAGES" value={String(recipe.pours.length)}/>
            </XStack>

            {isExisting && (
                <Text color={palette.info} fontSize={13}>
                    Already in your library
                </Text>
            )}

            <XStack
                accessible
                accessibilityRole="button"
                accessibilityLabel={`Open ${name}`}
                onPress={onOpen}
                alignItems="center"
                justifyContent="center"
                paddingVertical="$3"
                borderRadius="$6"
                backgroundColor={palette.raised}
                borderWidth={1}
                borderColor={palette.line}
                pressStyle={{opacity: 0.7, scale: 0.99}}>
                {/* OPEN rather than IMPORT when it is already here: nothing is
                    being brought in, and `resolveOnOpen` never makes a copy. */}
                <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.5}
                               color={palette.text}>
                    {isExisting ? "OPEN" : "IMPORT"}
                </DotMatrixText>
            </XStack>
        </YStack>
    );
}

/** One reading: a Doto value over a small label. Module scope, not inline. */
function Figure({label, value}: {label: string; value: string}) {
    return (
        <YStack gap="$1">
            <DotMatrixText fontSize={18} weight="bold" color={palette.text}>
                {value}
            </DotMatrixText>
            <Text color={palette.muted} fontSize={11} letterSpacing={1}>
                {label}
            </Text>
        </YStack>
    );
}

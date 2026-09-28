import React, {useState} from "react";
import {Image, Pressable} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import {onAccent, palette} from "@/constants/colors";
import {heldHubCriteria, roastLabel} from "@/library/hub/hubCriteria";
import {hubAccent, type HubRecipe} from "@/library/hub/hubRow";

const PHOTO_SIZE = 104;
const PHOTO_RADIUS = 8;
const TICK_SIZE = 26;
const SIDE_PADDING = 12;
const ROW_PADDING = 8;

type Props = {
    recipe: HubRecipe;
    selecting: boolean;
    selected: boolean;
    onPress: () => void;
    onLongPress: () => void;
};

export default function HubRow({
    recipe, selecting, selected, onPress, onLongPress
}: Props) {
    const [failed, setFailed] = useState(false);

    const accent = hubAccent(recipe.id);
    const imageURL = recipe.imageURL;
    const provenance = [...recipe.origin, ...recipe.process].join(" · ").toUpperCase();
    const roast = roastLabel(recipe.roast, heldHubCriteria());

    return (
        <Pressable
            testID={`hub-row-${recipe.id}`}
            accessibilityLabel={recipe.name}
            accessibilityRole={selecting ? "checkbox" : "button"}
            accessibilityState={selecting ? {checked: selected} : undefined}
            onPress={onPress}
            onLongPress={onLongPress}>
            <XStack alignItems="center" maxWidth={600}
                    paddingHorizontal={SIDE_PADDING}
                    paddingVertical={ROW_PADDING}
                    gap="$3">
                {imageURL !== null && !failed ? (
                    <Image
                        testID="hub-row-photo"
                        source={{uri: imageURL}}
                        onError={() => setFailed(true)}
                        style={{
                            width:        PHOTO_SIZE,
                            height:       PHOTO_SIZE,
                            borderRadius: PHOTO_RADIUS
                        }}/>
                ) : (
                    <YStack testID="hub-row-photo-blank"
                            width={PHOTO_SIZE}
                            height={PHOTO_SIZE}
                            borderRadius={PHOTO_RADIUS}
                            backgroundColor={palette.raised}/>
                )}

                <YStack flex={1} gap="$2">
                    <YStack gap="$1">
                        <Text color={palette.text} fontSize={17}
                              fontWeight="700"
                              numberOfLines={2}>
                            {recipe.name}
                        </Text>

                        {provenance.length > 0 && (
                            <DotMatrixText testID="hub-row-origin-process"
                                           fontSize={11}
                                           weight="bold"
                                           letterSpacing={1.4}
                                           color={palette.dim}
                                           numberOfLines={1}>
                                {provenance}
                            </DotMatrixText>
                        )}

                        {roast !== null && (
                            <DotMatrixText testID="hub-row-roast"
                                           fontSize={11}
                                           weight="bold"
                                           letterSpacing={1.4}
                                           color={palette.dim}
                                           numberOfLines={1}>
                                {roast.toUpperCase()}
                            </DotMatrixText>
                        )}
                    </YStack>

                    <XStack gap="$4">
                        <Figure testID="hub-row-dose" label="DOSE"
                                value={`${recipe.dose} g`} accent={accent}/>
                        <Figure testID="hub-row-ratio" label="RATIO"
                                value={`1:${recipe.ratio}`} accent={accent}/>
                        <Figure testID="hub-row-grind" label="GRIND"
                                value={String(recipe.grind)} accent={accent}/>
                    </XStack>
                </YStack>

                {selecting && (
                    <YStack testID="hub-row-tick"
                            width={TICK_SIZE}
                            height={TICK_SIZE}
                            borderRadius={TICK_SIZE / 2}
                            alignItems="center"
                            justifyContent="center"
                            borderWidth={1}
                            borderColor={selected ? palette.text : palette.line}
                            backgroundColor={selected ? palette.text : palette.none}>
                        {selected && (
                            <YStack testID="hub-row-tick-icon">
                                <DotIcon name="success" size={14} color={onAccent.text}/>
                            </YStack>
                        )}
                    </YStack>
                )}
            </XStack>
        </Pressable>
    );
}

function Figure({
    testID, label, value, accent
}: {
    testID: string;
    label: string;
    value: string;
    accent: string;
}) {
    return (
        <YStack gap="$1">
            <DotMatrixText testID={testID}
                           fontSize={18}
                           weight="bold"
                           color={accent}>
                {value}
            </DotMatrixText>
            <DotMatrixText fontSize={11}
                           weight="bold"
                           letterSpacing={1.2}
                           color={palette.muted}>
                {label}
            </DotMatrixText>
        </YStack>
    );
}

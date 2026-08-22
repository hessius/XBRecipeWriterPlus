import Recipe from '@/library/Recipe'
import React, {useState} from 'react'
import {Circle, Text, XStack, YStack} from 'tamagui'
import {Pressable} from 'react-native'
import {palette} from '@/constants/colors'

export default function RecipeItem(props: {
    recipe: Recipe
    onPress: () => void
}) {
    const [pressed, setPressed] = useState(false)

    async function onPress() {
        props.onPress();
    }

    function getStyle(): any {
        return {
            backgroundColor: pressed ? palette.raised : palette.surface,
            borderWidth:     2,
            borderRadius:    20,
            borderColor:     palette.line,
            width:           "100%"
        };
    }

    return (
        <YStack padding="$2">
            <Pressable style={getStyle()}
                       onPressIn={() => setPressed(true)}
                       onPress={() => onPress()} onPressOut={() => setPressed(false)}>
                <YStack paddingHorizontal="$2" paddingVertical="$1" alignItems='center'>
                    <Text
                        numberOfLines={1}
                        ellipsizeMode="middle"
                        paddingVertical="$1"
                        fontSize="$4"
                        textAlign="center"
                    >
                        {props.recipe.title}
                    </Text>
                    <XStack flex={1} justifyContent='space-evenly' width="100%" flexDirection='row'>
                        <YStack>
                            <Circle size="$7" borderColor={palette.line} borderWidth={1}>
                                <Text fontSize={30} fontWeight={200}>{"1:" + props.recipe.ratio}</Text></Circle>
                            <Text alignSelf='center'>Ratio</Text>
                        </YStack>
                        <YStack>
                            <XStack flex={1} alignItems='center' justifyContent='center' borderColor={palette.line}
                                    borderWidth={2}>
                                <Text padding="$2" fontSize={40}
                                      fontWeight={700}>{props.recipe.getTotalVolume() + " ml"}</Text></XStack>
                            <Text
                                alignSelf='center'>{props.recipe.getCupTypeName()} | {props.recipe.pours.length}</Text>
                        </YStack>
                        <YStack>
                            <Circle size="$7" borderColor={palette.line} borderWidth={1}>
                                <Text fontSize={30} fontWeight={200}>{props.recipe.grindSize}</Text></Circle>
                            <Text alignSelf='center'>Grind</Text>
                        </YStack>
                    </XStack>
                </YStack>
            </Pressable>
        </YStack>
    )
}

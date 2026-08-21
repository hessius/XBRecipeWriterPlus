import Recipe, {CUP_TYPE} from '@/library/Recipe'
import React, {useState} from 'react'
import {Circle, Text, XStack, YStack} from 'tamagui'
import {Pressable, useColorScheme} from 'react-native'
import {cardColors, palette} from '@/constants/colors'

export default function RecipeItem(props: {
    recipe: Recipe
    onPress: () => void
}) {
    const [pressed, setPressed] = useState(false)
    const [showDialog, setShowDialog] = useState(false)
    const colorScheme = useColorScheme();

    async function onPress() {
        props.onPress();
    }

    function getStyle(cup: number): any {
        const colors = colorScheme === "light" ? cardColors.light : cardColors.dark;
        let s: {
            backgroundColor: string;
            borderWidth: number;
            borderRadius: number;
            borderColor: string;
            width: string;
        } = {
            backgroundColor: colors.background,
            borderWidth:     2,
            borderRadius:    20,
            borderColor:     palette.outline,
            width:           "100%"
        };
        if (pressed) {
            s.backgroundColor = colors.pressedFill;
            s.borderColor = colors.pressedBorder;
        } else {
            switch (cup) {
                case CUP_TYPE.TEA:
                    s.backgroundColor = colors.teaFill;
                    s.borderColor = colors.teaBorder;
                    break;
                default:
                    s.backgroundColor = colors.coffeeFill;
                    s.borderColor = colors.coffeeBorder;
            }
        }
        return s;
    }

    return (
        <YStack padding="$2">
            <Pressable style={getStyle(props.recipe.cupType)} onLongPress={() => setShowDialog(true)}
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
                            <Circle size="$7" borderColor={palette.outline} borderWidth={1}>
                                <Text fontSize={30} fontWeight={200}>{"1:" + props.recipe.ratio}</Text></Circle>
                            <Text alignSelf='center'>Ratio</Text>
                        </YStack>
                        <YStack>
                            <XStack flex={1} alignItems='center' justifyContent='center' borderColor={palette.outline}
                                    borderWidth={2}>
                                <Text padding="$2" fontSize={40}
                                      fontWeight={700}>{props.recipe.getTotalVolume() + " ml"}</Text></XStack>
                            <Text
                                alignSelf='center'>{props.recipe.getCupTypeName()} | {props.recipe.pours.length}</Text>
                        </YStack>
                        <YStack>
                            <Circle size="$7" borderColor={palette.outline} borderWidth={1}>
                                <Text fontSize={30} fontWeight={200}>{props.recipe.grindSize}</Text></Circle>
                            <Text alignSelf='center'>Grind</Text>
                        </YStack>
                    </XStack>
                </YStack>
            </Pressable>
        </YStack>
    )
}

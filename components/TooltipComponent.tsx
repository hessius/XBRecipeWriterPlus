import {YStack} from 'tamagui'
import {AntDesign} from "@expo/vector-icons";
import {Alert} from 'react-native';
import React from 'react';
import {palette} from '@/constants/colors';

export default function TooltipComponent(props: {
    content: string
    paddingLeft?: string
}) {

    async function handlePress() {
        Alert.alert('What is this?', props.content, [
            {
                text: 'Ok',
                onPress: () => console.log('Cancel Pressed'),
            },
        ]);
    }

    return (
        <YStack paddingLeft={props.paddingLeft}>
            <AntDesign onPress={() => handlePress()} name="question-circle" size={20} color={palette.dim}/>
        </YStack>
    )
}

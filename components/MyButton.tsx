import React from 'react';
import {useColorScheme} from 'react-native';
import {H6, type SizeTokens, styled, ToggleGroup} from 'tamagui';

interface MyButtonProps {
    id: number;
    label: string;
    value: string;
    // v2 dropped `size` from ToggleGroup itself; each item is sized instead.
    size?: SizeTokens;
}

export function MyButton({id, label, value, size}: MyButtonProps) {
    const colorScheme = useColorScheme();

    const MyToggleGroupItem = styled(ToggleGroup.Item, {
        variants: {
            active: {
                true: {
                    backgroundColor: 'red',
                },
            },
        },
    });

    let main_text_color = colorScheme === 'light' ? "black" : "white";
    let inverse_text_color = colorScheme === 'light' ? "white" : "black";

    return (
        <MyToggleGroupItem
            value={"" + id}
            size={size}
            active={value === "" + id}
            aria-label={label}
        >
            <H6 color={value == "" + id ? inverse_text_color : main_text_color}>
                {label}
            </H6>
        </MyToggleGroupItem>
    );
}

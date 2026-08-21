import React from 'react';
import {useColorScheme} from 'react-native';
import {H6, type SizeTokens, styled, ToggleGroup} from 'tamagui';
import {palette, textColors} from '@/constants/colors';

interface MyButtonProps {
    id: number;
    label: string;
    value: string;
    // v2 dropped `size` from ToggleGroup itself; each item is sized instead.
    size?: SizeTokens;
}

const MyToggleGroupItem = styled(ToggleGroup.Item, {
    variants: {
        active: {
            true: {
                backgroundColor: palette.danger,
            },
        },
    },
});

export function MyButton({id, label, value, size}: MyButtonProps) {
    const colorScheme = useColorScheme();

    const scheme = colorScheme === 'light' ? textColors.light : textColors.dark;

    return (
        <MyToggleGroupItem
            value={"" + id}
            size={size}
            active={value === "" + id}
            aria-label={label}
        >
            <H6 color={value === "" + id ? scheme.inverse : scheme.primary}>
                {label}
            </H6>
        </MyToggleGroupItem>
    );
}

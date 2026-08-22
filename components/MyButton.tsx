import React from 'react';
import {H6, type SizeTokens, styled, ToggleGroup} from 'tamagui';
import {palette} from '@/constants/colors';

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
    return (
        <MyToggleGroupItem
            value={"" + id}
            size={size}
            active={value === "" + id}
            aria-label={label}
        >
            <H6 color={value === "" + id ? palette.base : palette.text}>
                {label}
            </H6>
        </MyToggleGroupItem>
    );
}

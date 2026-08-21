
import type {SizeTokens} from 'tamagui'
import {Label, ToggleGroup, XStack} from 'tamagui'
import React, {useState} from 'react';
import {MyButton} from "@/components/MyButton";
import {palette} from '@/constants/colors';

export function MyButtonGroup(props: {
    size: SizeTokens
    minWidth?: SizeTokens
    label: string
    orientation: 'vertical' | 'horizontal'
    onToggle: (value: string) => void
    initialValue?: string
    buttons: number[]
    getLabelText: (id: number) => string
}) {
    const [value, setValue] = useState<string>(props.initialValue ?? "")
    // Re-sync when the parent supplies a different initial value. Done during
    // render rather than in an effect so there is no extra render pass.
    const [lastInitialValue, setLastInitialValue] = useState(props.initialValue)
    if (props.initialValue !== undefined && props.initialValue !== lastInitialValue) {
        setLastInitialValue(props.initialValue)
        setValue(props.initialValue)
    }

    const handleValueChange = (newValue: string) => {
        setValue(newValue)
        props.onToggle(newValue)
    }

    return (
        <XStack
            flexDirection={props.orientation === 'horizontal' ? 'row' : 'column'}
            alignItems="center"
            justifyContent="flex-start"
            padding="$2"
            gap="$1"
            flexWrap="wrap"
        >
            <Label paddingRight="$2" justifyContent="flex-end" size={props.size} minWidth={props.minWidth ?? "$2"}>
                {props.label}
            </Label>

            <ToggleGroup style={{borderColor: palette.muted, borderWidth: 1, padding: 1}}
                value={value}
                orientation={props.orientation}
                type="single"
                disableDeactivation={true}
                onValueChange={handleValueChange}
            >
                {props.buttons.map(btn => (
                    <MyButton
                        key={btn}
                        id={btn}
                        label={props.getLabelText(btn)}
                        value={value}
                        size={props.size}
                    />
                ))}
            </ToggleGroup>
        </XStack>
    )
}

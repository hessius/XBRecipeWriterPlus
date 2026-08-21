import React, {useState} from 'react';
import {H6, Input, type InputProps, Label, XStack, YStack} from 'tamagui';
import {palette} from '@/constants/colors';

type Props = InputProps & {
    validateInput?: ValidateCallbackFunction
    onValidEditFunction?: ValidEditCallbackFunction
    setErrorFunction?: (error: boolean) => void
    initialValue?: string
    pourNumber?: number
    label: string
    errorMessage?: string
    width?: number
    disabled?: boolean
    maxLength: number
};

type ValidateCallbackFunction = (value: string) => boolean;
type ValidEditCallbackFunction = (inputLabel: string, value: string, pourNumber?: number) => Promise<void>;


export default function LabeledInput(props: Props) {
    const [validated, setValidated] = useState(true);
    const [value, setValue] = useState(props.initialValue);

    async function validate(value: string): Promise<boolean> {
        setValue(value);
        if (props.validateInput !== undefined) {
            let valid = props.validateInput(value);
            setValidated(valid);
            props.setErrorFunction?.(!valid);
            if (valid) {
                await doneEditing(value);
            }
            return valid;
        } else {
            setValidated(true);
            await doneEditing(value);
            return true;
        }
    }

    async function doneEditing(value: string) {
        if (props.onValidEditFunction) {
            if (props.pourNumber !== undefined) {
                await props.onValidEditFunction(props.label?.toString()!, value, props.pourNumber);
            } else {
                await props.onValidEditFunction(props.label?.toString()!, value);
            }
        }
    }

    return (
        <>
            <YStack flex={1}>
                <XStack paddingLeft="$2" paddingVertical="$2" alignItems="center" alignSelf="flex-start"
                        gap={"$2"}>
                    <Label minWidth={"$3"}>{props.label}</Label>
                    <Input flex={1}
                           disabled={props.disabled}
                           marginLeft="$1"
                           value={value ? "" + value : ""}
                           onChangeText={(val) => validate(val)}
                           focusStyle={{borderColor: validated ? palette.muted : palette.danger}}
                           borderColor={validated ? palette.muted : palette.danger} {...props}
                           backgroundColor={props.disabled ? palette.surfaceDisabled : "$background"}
                           color={props.disabled ? palette.onLight : "$color"}>
                    </Input>
                </XStack>
                {!validated ?
                    <H6 fontWeight="600" color={palette.danger} padding="$2">{"Error: " + props.errorMessage}</H6> : ""}
            </YStack>
        </>
    );
}

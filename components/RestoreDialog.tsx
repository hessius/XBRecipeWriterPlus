import React, {useState} from "react";
import {ActivityIndicator} from "react-native";
import {Adapt, Button, Dialog, Fieldset, Sheet, XStack, YStack} from "tamagui";

import {notify} from "@/components/XbrwToast";
import {palette} from "@/constants/colors";

export type RestoreOption = {
    id: string;
    label: string;
    action: () => Promise<void>;
};

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    options: RestoreOption[];
    /** Called once a restore has finished, successfully or not. */
    onRestored: () => void;
};

export default function RestoreDialog({open, onOpenChange, options, onRestored}: Props) {
    const [isRestoring, setIsRestoring] = useState(false);

    const handleRestoreAction = async (action: () => Promise<void>) => {
        setIsRestoring(true);
        try {
            await action();
        } catch (error) {
            console.error("Failed to restore recipe:", error);
            notify({tone: "error", message: String(error)});
        } finally {
            setIsRestoring(false);
            onOpenChange(false);
            onRestored();
        }
    };

    return (
        <Dialog modal open={open} onOpenChange={onOpenChange}>
            <Adapt platform="touch">
                <Sheet
                    snapPoints={[Math.min(40 + options.length * 15, 80)]}
                    zIndex={200000} modal dismissOnSnapToBottom>
                    <Sheet.Frame padding="$4">
                        <Adapt.Contents/>
                    </Sheet.Frame>
                    <Sheet.Overlay
                        transition="quick"
                        enterStyle={{opacity: 0}}
                        exitStyle={{opacity: 0}}
                    />
                </Sheet>
            </Adapt>

            <Dialog.Portal>
                <Dialog.Overlay key="overlay" opacity={0.5}/>
                <Dialog.Content bordered elevate gap="$4" maxWidth={400}>
                    <Dialog.Title alignSelf="center" fontWeight={600}>
                        Restore Recipe
                    </Dialog.Title>
                    <Dialog.Description textAlign="center">
                        Choose how you would like to restore this recipe:
                    </Dialog.Description>

                    <Fieldset gap="$3" marginTop={"$3"}>
                        {options.map((option) => (
                            <YStack key={option.id} gap="$2">
                                <Button marginTop={"$2"}
                                        theme="red"
                                        onPress={() => handleRestoreAction(option.action)}
                                        size="$4"
                                        disabled={isRestoring}
                                        opacity={isRestoring ? 0.5 : 1}>
                                    {option.label}
                                </Button>
                            </YStack>
                        ))}
                        <XStack alignItems="center" gap="$2" justifyContent="center">
                            <ActivityIndicator size="large" color={palette.muted} animating={isRestoring}/>
                        </XStack>
                    </Fieldset>

                    <XStack justifyContent="center" paddingTop="$4">
                        <Button
                            theme="active"
                            onPress={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                    </XStack>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog>
    );
}

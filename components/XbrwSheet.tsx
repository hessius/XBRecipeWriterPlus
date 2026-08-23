import React from "react";
import {Adapt, Dialog, Sheet, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    children: React.ReactNode;
};

/** The house sheet: the ImportRecipeComponent pattern, with a dot-matrix title. */
export default function XbrwSheet({open, onOpenChange, title, children}: Props) {
    if (!open) return null;

    return (
        <Dialog modal open={open} onOpenChange={onOpenChange}>
            <Adapt platform="touch">
                <Sheet snapPoints={[70]} zIndex={200000} modal dismissOnSnapToBottom>
                    <Sheet.Frame padding="$4" backgroundColor={palette.surface}>
                        <Adapt.Contents/>
                    </Sheet.Frame>
                    <Sheet.Overlay transition="quick"
                                   enterStyle={{opacity: 0}} exitStyle={{opacity: 0}}/>
                </Sheet>
            </Adapt>

            <Dialog.Portal>
                <Dialog.Overlay key="overlay" opacity={0.5}/>
                <Dialog.Content bordered elevate maxWidth={440}
                                backgroundColor={palette.surface}>
                    <YStack gap="$3">
                        <DotMatrixText fontSize={11} weight="bold" letterSpacing={2}
                                       color={palette.muted}>
                            {title}
                        </DotMatrixText>
                        {children}
                    </YStack>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog>
    );
}

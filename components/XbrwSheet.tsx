import React from "react";
import {Adapt, Dialog, Sheet, XStack, YStack} from "tamagui";
import {Pressable} from "react-native";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    /**
     * Draw the title, or keep it only as the dialog's accessible name.
     *
     * The overflow sheet turns it off: its rows say what they do, so a word
     * above them naming the noun they all act on was chrome that carried no
     * information. The name still reaches the screen reader, which has no rows
     * to look at.
     */
    showTitle?: boolean;
    children: React.ReactNode;
};

/** The house sheet: the ImportRecipeComponent pattern, with a dot-matrix title. */
export default function XbrwSheet({open, onOpenChange, title, showTitle = true, children}: Props) {
    // Not merely an optimisation, and not something Tamagui already does: with
    // `open={false}` and no guard, Tamagui still mounts the sheet frame off
    // screen. This keeps a dismissed sheet out of the tree entirely, and is
    // also why these sheets cannot animate out. That is accepted: a sheet that
    // has been dismissed has nothing left to say.
    if (!open) return null;

    // Doto here, and Inter for whatever the caller puts inside. This is the
    // sheet's own chrome — the same register as the deck switch and the toast —
    // rather than copy about the recipe.
    const heading = (
        <XStack alignItems="center" justifyContent={showTitle ? "space-between" : "flex-end"}
                gap="$3">
            {showTitle && (
                <Dialog.Title unstyled>
                    <DotMatrixText fontSize={11} weight="bold" letterSpacing={2}
                                   color={palette.dim}>
                        {title}
                    </DotMatrixText>
                </Dialog.Title>
            )}
            <Pressable accessibilityRole="button" accessibilityLabel="Close"
                       onPress={() => onOpenChange(false)} hitSlop={12}>
                <DotMatrixText fontSize={11} weight="bold" letterSpacing={2}
                               color={palette.dim}>
                    CLOSE
                </DotMatrixText>
            </Pressable>
        </XStack>
    );

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
                <Dialog.Content bordered elevate maxWidth={440} aria-label={title}
                                backgroundColor={palette.surface}>
                    <YStack gap="$3">
                        {heading}
                        {children}
                    </YStack>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog>
    );
}

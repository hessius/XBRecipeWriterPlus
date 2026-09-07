import React from "react";
import {Button, Text, YStack} from "tamagui";

import XbrwSheet from "@/components/XbrwSheet";
import {onAccent, palette} from "@/constants/colors";
import type Recipe from "@/library/Recipe";

type Props = {
    open: boolean;
    recipe: Recipe | null;
    onCancel: () => void;
    onConfirm: () => void;
};

export default function BypassWriteSheet({open, recipe, onCancel, onConfirm}: Props) {
    const bypassVolume = recipe?.bypassVolume ?? 0;

    return (
        <XbrwSheet open={open} onOpenChange={(next) => {if (!next) onCancel();}}
                   title="BYPASS ON CARD" heightPercent={44}>
            <YStack gap="$3" paddingHorizontal="$4" paddingBottom="$4">
                <Text fontSize={15} lineHeight={21} color={palette.text}>
                    Cards cannot store bypass water. The recipe written to the card
                    will brew without the {bypassVolume} ml bypass, but the saved
                    recipe on this phone keeps it.
                </Text>

                <Button accessibilityRole="button" accessibilityLabel="Write without bypass"
                        backgroundColor={palette.warn} color={onAccent.text}
                        onPress={onConfirm}>
                    Write without bypass
                </Button>

                <Button accessibilityRole="button" accessibilityLabel="Do not write to the card"
                        chromeless onPress={onCancel}>
                    Do not write to the card
                </Button>
            </YStack>
        </XbrwSheet>
    );
}

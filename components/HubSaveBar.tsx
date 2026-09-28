import React from "react";
import {Pressable} from "react-native";
import {XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {onAccent, palette} from "@/constants/colors";

const BAR_PADDING = 12;
const BUTTON_HEIGHT = 44;

type Props = {
    count: number;
    saving: boolean;
    progress: {done: number; total: number};
    onCancel: () => void;
    onSave: () => void;
    paddingBottom?: number;
};

export default function HubSaveBar({
    count, saving, progress, onCancel, onSave, paddingBottom = 0
}: Props) {
    const disabled = saving || count === 0;
    const label = saving ? `${progress.done} OF ${progress.total}` : `SAVE ${count}`;
    const spoken = saving
        ? `Saving ${progress.done} of ${progress.total}`
        : count === 1
            ? "Save 1 recipe"
            : `Save ${count} recipes`;

    return (
        <YStack position="absolute" left={0} right={0} bottom={0}
                paddingHorizontal="$3" paddingTop={BAR_PADDING}
                paddingBottom={paddingBottom + BAR_PADDING}
                backgroundColor={palette.surface}
                borderTopWidth={1} borderTopColor={palette.line}
                testID="hub-save-bar">
            <XStack alignItems="center" gap="$3" justifyContent="flex-end">
                {!saving && (
                    <Pressable accessibilityRole="button" accessibilityLabel="Cancel"
                               testID="hub-save-cancel" onPress={onCancel}>
                        <XStack height={BUTTON_HEIGHT} paddingHorizontal="$3"
                                alignItems="center">
                            <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.5}
                                           color={palette.dim}>
                                CANCEL
                            </DotMatrixText>
                        </XStack>
                    </Pressable>
                )}

                <XStack accessibilityRole="button"
                        accessibilityLabel={spoken}
                        accessibilityState={{disabled}}
                        testID="hub-save-confirm"
                        onPress={disabled ? undefined : onSave}
                        opacity={disabled ? 0.35 : 1}
                        height={BUTTON_HEIGHT} paddingHorizontal="$4"
                        alignItems="center" justifyContent="center"
                        borderRadius="$4"
                        backgroundColor={palette.text}>
                    <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.5}
                                   color={onAccent.text}>
                        {label}
                    </DotMatrixText>
                </XStack>
            </XStack>
        </YStack>
    );
}

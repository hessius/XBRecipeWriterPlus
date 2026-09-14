import React from "react";
import {Pressable} from "react-native";
import {YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";

/**
 * One of the two export actions on a finished brew.
 *
 * Shared by the brew modal and the record screen, which had a copy each. It
 * says what it is doing because capturing a PNG and opening the share sheet
 * takes long enough to look like nothing happened: a press with no
 * acknowledgement reads as a press that missed.
 */
export default function ExportButton({label, busy, onPress}: {
    label: string;
    /** True while this export is in flight. */
    busy: boolean;
    onPress: () => void;
}) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{disabled: busy}}
            disabled={busy}
            onPress={onPress}
            style={{flex: 1, opacity: busy ? 0.5 : 1}}
        >
            <YStack alignItems="center" paddingVertical="$3" borderRadius="$4"
                    borderWidth={1} borderColor={palette.line}>
                <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6}
                               color={palette.dim}>
                    {busy ? "WORKING…" : label.toUpperCase()}
                </DotMatrixText>
            </YStack>
        </Pressable>
    );
}

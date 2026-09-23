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
export default function ExportButton({label, busy, disabled = false, accessibilityLabel, onPress}: {
    label: string;
    /** True while this export is in flight. */
    busy: boolean;
    /**
     * True when the action is not available yet, as distinct from in flight.
     *
     * Kept apart from `busy` because the two say different things: a busy
     * button has been pressed and is working, and says so, where a disabled one
     * is waiting for the user to give it something to do. Folding the second
     * into the first would have an untouched button claiming to be working.
     */
    disabled?: boolean;
    /**
     * What a screen reader says, when the printed label is not enough on its
     * own. The brew history's batch button prints SEND, which is plain beside
     * the rows it acts on and bare read aloud with no rows in earshot.
     */
    accessibilityLabel?: string;
    onPress: () => void;
}) {
    const inert = busy || disabled;
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? label}
            accessibilityState={{disabled: inert}}
            disabled={inert}
            onPress={onPress}
            style={{flex: 1, opacity: inert ? 0.5 : 1}}
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

import React from "react";
import {Pressable, View} from "react-native";
import {XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import type {StoredBrew} from "@/library/BrewDatabase";

type Props = {
    brew: StoredBrew;
    onPress: () => void;
};

/** `2026-09-03`. Uses local time so a brew made at 11 pm shows that night's date. */
function formatDate(ms: number): string {
    const d = new Date(ms);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

/** `4:23`. */
function formatDuration(startMs: number, endMs: number): string {
    const totalSeconds = Math.round((endMs - startMs) / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
}

/**
 * One past brew as a tappable row.
 *
 * The coloured mark preserves the accent at brew time — a recoloured or deleted
 * recipe does not rewrite its own history.
 */
export default function BrewHistoryRow({brew, onPress}: Props) {
    const stopped = brew.outcome !== "done";

    return (
        <Pressable accessibilityRole="button" accessibilityLabel={brew.recipeName}
                   onPress={onPress}>
            <XStack gap="$3" paddingVertical="$3" paddingHorizontal="$3"
                    alignItems="center">
                <View
                    testID="history-row-mark"
                    style={{width: 8, height: 8, borderRadius: 4,
                            backgroundColor: brew.accent}}
                />
                <YStack flex={1} gap="$1">
                    <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.2}
                                   color={palette.text}>
                        {brew.recipeName}
                    </DotMatrixText>
                    <XStack gap="$3" alignItems="center">
                        <DotMatrixText fontSize={11} letterSpacing={1} color={palette.dim}>
                            {formatDate(brew.startedAt)}
                        </DotMatrixText>
                        <DotMatrixText fontSize={11} letterSpacing={1} color={palette.text}>
                            {`${Math.round(brew.cupTotal)} G`}
                        </DotMatrixText>
                        <DotMatrixText fontSize={11} letterSpacing={1} color={palette.dim}>
                            {formatDuration(brew.startedAt, brew.endedAt)}
                        </DotMatrixText>
                        {stopped && (
                            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.4}
                                           color={palette.danger}>
                                STOPPED
                            </DotMatrixText>
                        )}
                        {!brew.hasStream && (
                            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.4}
                                           color={palette.muted}>
                                NO TRACE KEPT
                            </DotMatrixText>
                        )}
                    </XStack>
                </YStack>
            </XStack>
        </Pressable>
    );
}

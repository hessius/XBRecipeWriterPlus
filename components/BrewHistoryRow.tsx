import React from "react";
import {Pressable, View} from "react-native";
import {XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import type {StoredBrew} from "@/library/BrewDatabase";
import {formatBrewDate, formatBrewDuration} from "@/library/brew/brewFormat";

type Props = {
    brew: StoredBrew;
    onPress: () => void;
};


/** The outcomes that mean the brew did not finish. Short is not one of them. */
const STOPPED_OUTCOMES: ReadonlySet<string> =
    new Set(["cancelled", "failed", "lostContact"]);

/**
 * One past brew as a tappable row.
 *
 * The coloured mark preserves the accent at brew time — a recoloured or deleted
 * recipe does not rewrite its own history.
 */
export default function BrewHistoryRow({brew, onPress}: Props) {
    // Named outcomes, not "anything but done". A brew the machine finished
    // short is not a failure and must not sit in the history wearing the same
    // red chip as one that was cancelled or lost the link -- that would
    // contradict the neutral note the record screen shows for it.
    const stopped = STOPPED_OUTCOMES.has(brew.outcome);
    const endedEarly = brew.outcome === "endedOnMachine";

    // The label has to carry everything the row draws. `Pressable` with an
    // explicit label replaces the whole subtree for a screen reader, so with
    // the name alone every brew of the same recipe is announced identically --
    // and a history whose entries cannot be told apart cannot be navigated. In
    // particular the two chips are the only warning that a brew did not run to
    // plan, and reading them out is how a user decides whether to open it.
    const label = [
        brew.recipeName,
        formatBrewDate(brew.startedAt),
        `${Math.round(brew.cupTotal)} grams`,
        formatBrewDuration(brew.startedAt, brew.endedAt),
        endedEarly ? "ended early" : undefined,
        stopped ? "stopped" : undefined,
        brew.hasStream ? undefined : "no trace kept"
    ].filter((part) => part !== undefined).join(", ");

    return (
        // Opaque, because the delete tile sits *behind* the row rather than
        // beside it: a transparent row let the tile read through its words as
        // the drawer closed. The recipe list never showed this only because its
        // cards are painted with the recipe's accent.
        <Pressable accessibilityRole="button" accessibilityLabel={label}
                   onPress={onPress}
                   style={{backgroundColor: palette.base}}>
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
                            {formatBrewDate(brew.startedAt)}
                        </DotMatrixText>
                        <DotMatrixText fontSize={11} letterSpacing={1} color={palette.text}>
                            {`${Math.round(brew.cupTotal)} G`}
                        </DotMatrixText>
                        <DotMatrixText fontSize={11} letterSpacing={1} color={palette.dim}>
                            {formatBrewDuration(brew.startedAt, brew.endedAt)}
                        </DotMatrixText>
                        {endedEarly && (
                            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.4}
                                           color={palette.warn}>
                                ENDED EARLY
                            </DotMatrixText>
                        )}
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

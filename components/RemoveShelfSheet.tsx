import React from "react";
import {Pressable} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import XbrwSheet from "@/components/XbrwSheet";
import {onAccent, palette} from "@/constants/colors";

/**
 * Asks before a shelf is removed.
 *
 * Two ways in, and the sheet says which one it is. Emptied: the bar already
 * said REMOVE SHELF rather than DONE, so this is the second warning, not the
 * first. Deleted: the user chose it from the shelf's own menu, and there was no
 * warning before this one.
 *
 * Either way it arrives before the thing happens rather than after, which is
 * what a shelf has instead of an undo: a shelf is a query, so once its tag is
 * off its last recipe there is nothing left to put back.
 *
 * It also says the one thing a person is actually worried about. Nothing about
 * a shelf is a container, so removing it keeps every recipe that was on it, and
 * saying so is the difference between a confirmation and a scare.
 */
export default function RemoveShelfSheet({
    open, tag, emptied = true, onOpenChange, onRemove
}: {
    open: boolean;
    /** The shelf's name, shown so the user can see which one they emptied. */
    tag: string;
    /**
     * Whether the shelf got here by having its last member unticked.
     *
     * False when the user asked for it outright, which changes the sentence:
     * there is nobody left on an emptied shelf, and there may be a room full of
     * recipes on a deleted one.
     */
    emptied?: boolean;
    onOpenChange: (open: boolean) => void;
    onRemove: () => void;
}) {
    return (
        <XbrwSheet open={open} onOpenChange={onOpenChange}
                   title="Remove this shelf?" heightPercent={34}>
            <YStack gap="$3" paddingHorizontal="$4" paddingBottom="$4">
                <Text fontSize={13} color={palette.dim}>
                    {(emptied
                        ? `${tag} has nobody left on it, so it will be removed. `
                        : `${tag} will be removed. `)
                        + "Your recipes are not affected: a shelf is a way of "
                        + "looking at the library, not a place things are kept."}
                </Text>

                <Pressable accessibilityRole="button"
                           accessibilityLabel={`Remove the ${tag} shelf`}
                           testID="remove-shelf-confirm"
                           onPress={onRemove}>
                    <XStack height={48} alignItems="center" justifyContent="center"
                            borderRadius="$4" backgroundColor={palette.danger}>
                        <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.5}
                                       color={onAccent.text}>
                            REMOVE SHELF
                        </DotMatrixText>
                    </XStack>
                </Pressable>

                <Pressable accessibilityRole="button"
                           accessibilityLabel="Keep this shelf"
                           testID="remove-shelf-cancel"
                           onPress={() => onOpenChange(false)}>
                    <XStack height={48} alignItems="center" justifyContent="center"
                            borderRadius="$4" borderWidth={1} borderColor={palette.line}>
                        <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.5}
                                       color={palette.dim}>
                            KEEP IT
                        </DotMatrixText>
                    </XStack>
                </Pressable>
            </YStack>
        </XbrwSheet>
    );
}

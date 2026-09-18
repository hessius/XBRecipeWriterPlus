import React from "react";
import {Pressable} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import ScreenTitle from "@/components/ScreenTitle";
import {onAccent, palette} from "@/constants/colors";

/** Matches the well every other header puts its back glyph in. */
const KEY_SIZE = 32;

/**
 * The header the library wears while a shelf is being built.
 *
 * The library's own header is the app's front door: a wordmark, a machine
 * panel, a scan, an import, a new recipe, and three large tiles under it. None
 * of that is reachable while picking -- every one of those doors leads out of
 * the half-built shelf -- so drawing them spent the top third of the screen on
 * controls that do nothing and pushed the rows the user is actually ticking
 * below the fold.
 *
 * This says instead what the screen is now for. It is deliberately the same
 * shape as `ScreenHeader`, the header of every pushed screen, because picking
 * *is* a pushed screen in everything but routing: it is a place the user goes,
 * finishes, and comes back from.
 *
 * Cancel is here as well as in the bottom bar, which is not a duplicate so much
 * as the two habits meeting: the bar is where the decision is made, and the
 * top-left glyph is where a user who has changed their mind reaches first.
 */
export default function ShelfPickerHeader({
    title, count, onCancel, onRename
}: {
    /** The shelf's name while editing, or what is being made while creating. */
    title: string;
    /** How many are on the shelf, which is not how many are on screen. */
    count: number;
    onCancel: () => void;
    /**
     * Rename this shelf. Absent for a shelf that has no name yet: a new shelf
     * is named at the end, by the bar, once it has members to be named for.
     */
    onRename?: () => void;
}) {
    const insets = useSafeAreaInsets();

    return (
        <YStack backgroundColor={palette.base} paddingTop={insets.top}
                testID="shelf-picker-header">
            <XStack alignItems="center" gap="$3"
                    paddingHorizontal="$4" paddingTop="$2" paddingBottom="$3">
                <Pressable accessibilityRole="button" accessibilityLabel="Cancel"
                           testID="shelf-picker-header-cancel"
                           onPress={onCancel} hitSlop={12}>
                    <YStack backgroundColor={onAccent.key}
                            borderRadius="$3" width={KEY_SIZE} height={KEY_SIZE}
                            alignItems="center" justifyContent="center">
                        <DotIcon name="close" size={16} color={palette.text}/>
                    </YStack>
                </Pressable>

                <ScreenTitle title={title} count={count} heading/>

                {onRename !== undefined && (
                    <Pressable accessibilityRole="button"
                               accessibilityLabel="Rename this shelf"
                               testID="shelf-picker-rename"
                               onPress={onRename} hitSlop={12}
                               style={{marginLeft: "auto", paddingLeft: 8}}>
                        <DotMatrixText fontSize={11} weight="bold"
                                       letterSpacing={1.2} color={palette.dim}>
                            RENAME
                        </DotMatrixText>
                    </Pressable>
                )}
            </XStack>
        </YStack>
    );
}

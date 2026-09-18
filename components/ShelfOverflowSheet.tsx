import React from "react";
import {Pressable} from "react-native";
import {XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import XbrwSheet from "@/components/XbrwSheet";
import {palette} from "@/constants/colors";
import type {DotIconName} from "@/constants/dotIcons";

/**
 * How much of the screen the shelf menu takes.
 *
 * Four rows and nothing that scrolls, sized to them for the same reason the
 * recipe menu is: a sheet standing most of the way up the screen with two
 * thirds of it empty reads as one that failed to load.
 */
export const SHELF_OVERFLOW_HEIGHT = 40;

/**
 * What can be done to a shelf the user made.
 *
 * Two doors, one sheet, the same arrangement the recipe menu uses. A long press
 * on the tile is the shortcut, for the hand that already knows where it is; the
 * glyph in the picker's header is the way it is found, because a gesture with
 * no drawn control is not an interface, it is a secret. Neither door may be the
 * only one.
 *
 * Auto shelves never open this. They are a query the app wrote, so there is no
 * name of the user's to change and nothing of theirs to delete: emptying one
 * means editing the recipes it describes.
 */
export default function ShelfOverflowSheet({
    open, shelf, count, onOpenChange, onEdit, onRename, onDuplicate, onDelete
}: {
    open: boolean;
    /** The shelf's name, as the user spelled it. */
    shelf: string;
    /** How many recipes are on it, so DELETE can say what it is taking. */
    count: number;
    onOpenChange: (open: boolean) => void;
    /**
     * Change who is on it. Absent from the picker's own door: the user is
     * already inside the edit this row would start.
     */
    onEdit?: () => void;
    onRename: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
}) {
    function pick(action: () => void) {
        onOpenChange(false);
        action();
    }

    // A helper, not a component: called, never used as a JSX tag, so it does
    // not become a new type on every render.
    const row = (
        label: string, icon: DotIconName, action: () => void,
        {tone = palette.text, testID, caption, hint}: {
            tone?: string; testID?: string; caption?: string; hint?: string;
        } = {}
    ) => (
        <Pressable accessibilityRole="button" accessibilityLabel={label}
                   accessibilityHint={hint} testID={testID}
                   onPress={() => pick(action)}>
            <XStack alignItems="center" gap="$3" paddingVertical="$3"
                    paddingHorizontal="$3" backgroundColor={palette.raised}
                    borderRadius="$4">
                <DotIcon name={icon} size={16} color={tone}/>
                <DotMatrixText fontSize={11} weight="bold"
                               letterSpacing={1.8} color={tone}>
                    {(caption ?? label).toUpperCase()}
                </DotMatrixText>
            </XStack>
        </Pressable>
    );

    const recipes = count === 1 ? "1 recipe" : `${count} recipes`;

    return (
        <XbrwSheet open={open} onOpenChange={onOpenChange} title={shelf}
                   heightPercent={SHELF_OVERFLOW_HEIGHT}>
            <YStack gap="$2" paddingBottom="$4">
                {onEdit && row("Choose what is on this shelf", "edit", onEdit, {
                    caption: "Edit members",
                    testID:  "shelf-overflow-edit"
                })}
                {row("Rename this shelf", "write", onRename, {
                    caption: "Rename",
                    testID:  "shelf-overflow-rename"
                })}
                {row("Duplicate this shelf", "duplicate", onDuplicate, {
                    caption: "Duplicate",
                    testID:  "shelf-overflow-duplicate",
                    hint:    `Makes a second shelf holding the same ${recipes}.`
                })}
                {/* Set apart, like the recipe menu's own delete: it is the one
                    row here the user cannot take back by pressing it again. */}
                <YStack marginTop="$2" paddingTop="$2"
                        borderTopWidth={1} borderTopColor={palette.line}>
                    {row("Delete this shelf", "delete", onDelete, {
                        tone:    palette.danger,
                        caption: "Delete shelf",
                        testID:  "shelf-overflow-delete",
                        // Says what it does not do, because a shelf is a tag on
                        // recipes and deleting one looks from the grid exactly
                        // like deleting what is on it.
                        hint:    `Takes the shelf away. The ${recipes} on it stay in the library.`
                    })}
                </YStack>
            </YStack>
        </XbrwSheet>
    );
}

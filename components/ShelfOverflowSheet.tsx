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
 * Sized to its rows rather than to its longest case, for the reason the recipe
 * menu is: a sheet standing most of the way up the screen with two thirds of it
 * empty reads as one that failed to load. A shelf the user made has five things
 * that can be done to it; a tag has exactly one, and a sheet built for five
 * would be almost all empty.
 */
export const SHELF_OVERFLOW_HEIGHT = 48;

/** The same sheet over a tag, which offers promotion and nothing else. */
export const TAG_OVERFLOW_HEIGHT = 22;

/**
 * What one more row costs, as a share of the screen.
 *
 * The move rows come and go with the shelf's place in the grid -- the first
 * shelf cannot move up, the last cannot move down, an only shelf does neither
 * -- so a fixed height would be right for one shelf and leave a third of the
 * sheet empty under another.
 */
const ROW_HEIGHT = 8;

export function shelfOverflowHeight(mine: boolean, moves: number): number {
    return mine ? SHELF_OVERFLOW_HEIGHT + moves * ROW_HEIGHT : TAG_OVERFLOW_HEIGHT;
}

/**
 * What can be done to a shelf, or to a tag that is ready to become one.
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
    open, shelf, count, mine, onOpenChange, onEdit, onMoveUp, onMoveDown,
    onRename, onDuplicate, onDelete, onPromote, onDemote
}: {
    open: boolean;
    /** The shelf's name, as the user spelled it. */
    shelf: string;
    /** How many recipes are on it, so DELETE can say what it is taking. */
    count: number;
    /** Whether this is a shelf the user made, rather than a tag they typed. */
    mine: boolean;
    onOpenChange: (open: boolean) => void;
    /**
     * Change who is on it. Absent from the picker's own door: the user is
     * already inside the edit this row would start.
     */
    onEdit?: () => void;
    /**
     * Move the shelf one place earlier in the grid, or one place later.
     *
     * Absent at either end of the arrangement, so the rows say what can be
     * done rather than offering a press that does nothing. They are also the
     * single-pointer way to do what dragging a tile does, which WCAG 2.5.7
     * requires of any drag, so they are not a convenience that can be dropped
     * once the gesture works.
     */
    onMoveUp?: () => void;
    onMoveDown?: () => void;
    onRename: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    /** Mark the tag as a shelf of the user's own. */
    onPromote: () => void;
    /** Put it back to being an ordinary tag. */
    onDemote: () => void;
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
    const moves = (onMoveUp ? 1 : 0) + (onMoveDown ? 1 : 0);

    return (
        <XbrwSheet open={open} onOpenChange={onOpenChange} title={shelf}
                   heightPercent={shelfOverflowHeight(mine, moves)}>
            <YStack gap="$2" paddingBottom="$4">
                {/* A tag shelf is recipe metadata that happened to clear the
                    shelf threshold. Rename, duplicate, delete and member edits
                    all rewrite an assembled shelf; offering them here would
                    turn ordinary tagging into shelf management without the
                    user's consent. Promotion is the explicit hand-off. */}
                {mine && onEdit && row("Choose what is on this shelf", "edit", onEdit, {
                    caption: "Edit members",
                    testID:  "shelf-overflow-edit"
                })}
                {mine && onMoveUp && row("Move this shelf up", "chevron-up", onMoveUp, {
                    caption: "Move up",
                    testID:  "shelf-overflow-up"
                })}
                {mine && onMoveDown && row("Move this shelf down", "chevron-down", onMoveDown, {
                    caption: "Move down",
                    testID:  "shelf-overflow-down"
                })}
                {mine && row("Rename this shelf", "write", onRename, {
                    caption: "Rename",
                    testID:  "shelf-overflow-rename"
                })}
                {mine && row("Duplicate this shelf", "duplicate", onDuplicate, {
                    caption: "Duplicate",
                    testID:  "shelf-overflow-duplicate",
                    hint:    `Makes a second shelf holding the same ${recipes}.`
                })}
                {mine
                    ? row("Make this a tag", "revert", onDemote, {
                        testID: "shelf-overflow-demote"
                    })
                    : row("Make this a shelf", "shelves", onPromote, {
                        testID: "shelf-overflow-promote"
                    })}
                {mine && (
                    // Set apart, like the recipe menu's own delete: it is the
                    // one row here the user cannot take back by pressing it
                    // again.
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
                )}
            </YStack>
        </XbrwSheet>
    );
}

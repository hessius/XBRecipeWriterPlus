import {router} from "expo-router";
import React from "react";
import {Pressable} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import XbrwSheet from "@/components/XbrwSheet";
import {palette} from "@/constants/colors";
import type {DotIconName} from "@/constants/dotIcons";

/**
 * How much of the screen the more menu takes.
 *
 * It holds one switch and five rows and nothing that scrolls, so it is sized to
 * them. At the house default it stood most of the way up the screen with two
 * thirds of it empty, which read as a sheet that had failed to load.
 */
export const OVERFLOW_HEIGHT = 48;

type Props = {
    open: boolean;
    /** False for a recipe with no xBloom identity to re-read a name from. */
    canRefreshName: boolean;
    /** The recipe's UUID, used to filter the brew history. */
    recipeUuid?: string;
    onOpenChange: (open: boolean) => void;
    /**
     * Whether the deck draws its one-line hints, and the handle to flip it.
     *
     * Editor-only. The switch reads and writes the editor deck's setting, so a
     * call site that has no deck -- the library's own door onto this sheet --
     * leaves both out, and the row is not drawn. Every editor-owned row is
     * gated on its handler this way, so one component can be the editor's
     * overflow and the library's recipe-actions sheet without either growing a
     * row that belongs to the other.
     */
    showHints?: boolean;
    onShowHintsChange?: (show: boolean) => void;
    onShare: () => void;
    onDuplicate: () => void;
    /** Editor-only: re-read the name from xBloom. Gated by `canRefreshName` too. */
    onRefreshName?: () => void;
    /** Editor-only: step back to a saved state. Absent from the library door. */
    onRevert?: () => void;
    onDelete: () => void;
    /**
     * The three the library door adds and the editor does not.
     *
     * Brew it, put it on a card, and star it: the acts that make sense on a
     * recipe sitting in the library rather than open on the bench. Each is
     * optional and its row is drawn only when handed over, the mirror of the
     * editor-only rows above, so the two doors share one sheet and neither
     * carries the other's verbs. `onBrew` follows the swipe tray's own rule and
     * is withheld when there is no machine to brew on, so a dead row never
     * shows.
     */
    onBrew?: () => void;
    onWrite?: () => void;
    onToggleFavourite?: () => void;
    /** Which way the star row reads and speaks. */
    favourite?: boolean;
};

/**
 * Everything that is not WRITE or SAVE.
 *
 * Two actions earn the bar at the bottom of the editor. The rest are either
 * rare, reversible, or destructive, and a row of six equal buttons made the two
 * that matter impossible to find.
 *
 * The same sheet is the library's recipe-actions door, opened by a long press on
 * a shelf tile and on a list row -- two doors to one sheet, so the grid and the
 * list cannot drift apart about what a recipe's actions are. The editor-only
 * rows (hints, refresh name, revert) and the library-only rows (brew, write,
 * star) are each gated on their handler, so a caller gets exactly the verbs it
 * hands over and no others.
 */
export default function RecipeOverflowSheet({
    open, canRefreshName, recipeUuid, onOpenChange, showHints, onShowHintsChange,
    onShare, onDuplicate, onRefreshName, onRevert, onDelete,
    onBrew, onWrite, onToggleFavourite, favourite = false
}: Props) {
    function pick(action: () => void) {
        onOpenChange(false);
        action();
    }

    // A helper, not a component: it is called, never used as a JSX tag, so it
    // does not become a new type on every render.
    const row = (
        label: string, icon: DotIconName, action: () => void,
        {tone = palette.text, testID, caption, hint}: {
            tone?: string; testID?: string; caption?: string; hint?: string;
        } = {}
    ) => (
        <Pressable accessibilityRole="button" accessibilityLabel={label}
                   accessibilityHint={hint}
                   onPress={() => pick(action)}>
            <XStack alignItems="center" gap="$3" paddingVertical="$3"
                    paddingHorizontal="$3" backgroundColor={palette.raised}
                    borderRadius="$4">
                <DotIcon name={icon} size={16} color={tone}/>
                <DotMatrixText testID={testID} fontSize={11} weight="bold"
                               letterSpacing={1.8} color={tone}>
                    {(caption ?? label).toUpperCase()}
                </DotMatrixText>
            </XStack>
        </Pressable>
    );

    // Safe to warm: every row here is a function of its props, so the warm copy
    // does nothing but measure itself.
    return (
        <XbrwSheet open={open} onOpenChange={onOpenChange} title="RECIPE"
                   showTitle={false} prewarm heightPercent={OVERFLOW_HEIGHT}>
            <YStack gap="$2" paddingBottom="$4">
                {/* A switch, so it does not close the sheet the way the action
                    rows do: it is the one row here that has a state to show,
                    and dismissing on the tap would take the answer away with
                    it. It reads and writes the same stored setting as the
                    settings screen, which is why it needs no memory of its
                    own. Editor-only: gated on its handler, so the library door
                    -- which owns no deck to hint -- leaves it out. */}
                {onShowHintsChange && (<>
                <Pressable accessibilityRole="switch" accessibilityLabel="Show hints"
                           accessibilityState={{checked: showHints}}
                           accessibilityHint="Draws a short note under each field's label."
                           onPress={() => onShowHintsChange(!showHints)}>
                    <XStack alignItems="center" gap="$3" paddingVertical="$3"
                            paddingHorizontal="$3" backgroundColor={palette.raised}
                            borderRadius="$4">
                        <DotIcon name="help" size={16} color={palette.text}/>
                        <XStack flex={1}>
                            <DotMatrixText fontSize={11} weight="bold"
                                           letterSpacing={1.8} color={palette.text}>
                                SHOW HINTS
                            </DotMatrixText>
                        </XStack>
                        <Text testID="show-hints-state" fontSize={11} fontWeight="600"
                              paddingHorizontal="$2.5" paddingVertical="$1.5"
                              borderRadius="$2"
                              backgroundColor={showHints ? palette.text : palette.surface}
                              color={showHints ? palette.base : palette.dim}>
                            {showHints ? "ON" : "OFF"}
                        </Text>
                    </XStack>
                </Pressable>

                <YStack marginTop="$1" paddingTop="$2"
                        borderTopWidth={1} borderTopColor={palette.line}/>
                </>)}

                {/* The library door's own three, ahead of the shared rows: the
                    acts on the recipe itself lead, the way the swipe tray leads
                    with them. Each is drawn only when handed over, so the editor
                    -- which hands over none -- shows none. Brew follows the
                    tray's rule and is absent without a machine to brew on. */}
                {onBrew && row("Brew recipe", "brew", onBrew, {caption: "Brew"})}
                {onWrite && row("Write recipe to card", "write", onWrite, {
                    caption: "Write to card"
                })}

                {row("Share", "share", onShare, {
                    testID: "overflow-share-label",
                    hint:   "Creates a link that opens this recipe in the xBloom app."
                })}
                {row("Duplicate", "duplicate", onDuplicate)}
                {onToggleFavourite && row(
                    favourite ? "Remove star from recipe" : "Star recipe",
                    "favourite", onToggleFavourite,
                    {caption: favourite ? "Starred" : "Star"}
                )}
                {row("Brew history", "info", () => router.push(recipeUuid ? `/brewHistory?recipeUuid=${recipeUuid}` : "/brewHistory"), {
                    hint: "Shows every recorded brew of this recipe."
                })}
                {/* Spoken in full, but captioned short: the other four rows are
                    one-word captions, and a sentence set in uppercase Doto
                    beside them reads as a different kind of thing. */}
                {canRefreshName && onRefreshName && row(
                    "Refresh name from xBloom", "import", onRefreshName,
                    {caption: "Refresh name"}
                )}
                {onRevert && row("Revert", "revert", onRevert)}
                {/* Set apart, because it is the one row here that cannot be
                    undone and there is no second question after it. */}
                <YStack marginTop="$2" paddingTop="$2"
                        borderTopWidth={1} borderTopColor={palette.line}>
                    {row("Delete", "delete", onDelete, {
                        tone:   palette.danger,
                        testID: "overflow-delete-label",
                        hint:   "Removes this recipe from the app. This cannot be undone."
                    })}
                </YStack>
            </YStack>
        </XbrwSheet>
    );
}

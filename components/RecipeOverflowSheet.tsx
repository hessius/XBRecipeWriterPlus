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
    onOpenChange: (open: boolean) => void;
    /** Whether the deck draws its one-line hints. */
    showHints: boolean;
    onShowHintsChange: (show: boolean) => void;
    onShare: () => void;
    onDuplicate: () => void;
    onRefreshName: () => void;
    onRevert: () => void;
    onDelete: () => void;
};

/**
 * Everything that is not WRITE or SAVE.
 *
 * Two actions earn the bar at the bottom of the editor. The rest are either
 * rare, reversible, or destructive, and a row of six equal buttons made the two
 * that matter impossible to find.
 */
export default function RecipeOverflowSheet({
    open, canRefreshName, onOpenChange, showHints, onShowHintsChange,
    onShare, onDuplicate, onRefreshName, onRevert, onDelete
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
                    own. */}
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

                {row("Share", "share", onShare, {
                    testID: "overflow-share-label",
                    hint:   "Creates a link that opens this recipe in the xBloom app."
                })}
                {row("Duplicate", "duplicate", onDuplicate)}
                {/* Spoken in full, but captioned short: the other four rows are
                    one-word captions, and a sentence set in uppercase Doto
                    beside them reads as a different kind of thing. */}
                {canRefreshName && row(
                    "Refresh name from xBloom", "import", onRefreshName,
                    {caption: "Refresh name"}
                )}
                {row("Revert", "revert", onRevert)}
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

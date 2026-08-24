import React from "react";
import {Pressable} from "react-native";
import {XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import XbrwSheet from "@/components/XbrwSheet";
import {palette} from "@/constants/colors";
import type {DotIconName} from "@/constants/dotIcons";

type Props = {
    open: boolean;
    /** False for a recipe with no xBloom identity to re-read a name from. */
    canRefreshName: boolean;
    onOpenChange: (open: boolean) => void;
    onDuplicate: () => void;
    onRefreshName: () => void;
    onRevert: () => void;
    onHelp: () => void;
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
    open, canRefreshName, onOpenChange,
    onDuplicate, onRefreshName, onRevert, onHelp, onDelete
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

    return (
        <XbrwSheet open={open} onOpenChange={onOpenChange} title="RECIPE" showTitle={false}>
            <YStack gap="$2" paddingBottom="$4">
                {row("Duplicate", "duplicate", onDuplicate)}
                {/* Spoken in full, but captioned short: the other four rows are
                    one-word captions, and a sentence set in uppercase Doto
                    beside them reads as a different kind of thing. */}
                {canRefreshName && row(
                    "Refresh name from xBloom", "import", onRefreshName,
                    {caption: "Refresh name"}
                )}
                {row("Revert", "revert", onRevert)}
                {row("Help", "info", onHelp)}
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

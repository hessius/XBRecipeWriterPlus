import React from "react";
import {Button, Text, YStack} from "tamagui";

import XbrwSheet from "@/components/XbrwSheet";
import {palette} from "@/constants/colors";

type Props = {
    open: boolean;
    count: number;
    onCancel: () => void;
    onBackUpFirst: () => void;
    onDelete: () => void;
};

/**
 * The one thing in this app that destroys user data.
 *
 * It offers a backup before it offers the deletion, because the backup is the
 * actual safety — a dialog can only ask a question, and a user who has already
 * decided will answer any wording. The count is in the sentence so the answer is
 * given against a number rather than against the word "all".
 *
 * The safe choice is the one that reads as the plain action: "Keep my recipes",
 * not "Cancel".
 */
export default function DeleteAllSheet({
    open, count, onCancel, onBackUpFirst, onDelete
}: Props) {
    const subject = count === 1 ? "1 recipe" : `${count} recipes`;

    return (
        <XbrwSheet open={open} onOpenChange={(next) => {if (!next) onCancel();}}
                   title="Delete all recipes" heightPercent={52}>
            <YStack gap="$3" paddingHorizontal="$4" paddingBottom="$4">
                <Text fontSize={15} color={palette.text}>
                    This deletes {subject} from this phone. It cannot be undone, and
                    a recipe already written to a card is not a copy of this library.
                </Text>

                <Button accessibilityRole="button" accessibilityLabel="Back up first"
                        onPress={onBackUpFirst}>
                    Back up first
                </Button>

                <Button accessibilityRole="button"
                        accessibilityLabel={`Delete all ${count} recipes`}
                        backgroundColor={palette.danger} onPress={onDelete}>
                    Delete all recipes
                </Button>

                <Button accessibilityRole="button" accessibilityLabel="Keep my recipes"
                        chromeless onPress={onCancel}>
                    Keep my recipes
                </Button>
            </YStack>
        </XbrwSheet>
    );
}

import React from "react";
import {Button, Text, YStack} from "tamagui";

import XbrwSheet from "@/components/XbrwSheet";
import {onAccent, palette} from "@/constants/colors";

/**
 * What the user was trying to do when the unsaved work was noticed.
 *
 * `brew` is worded differently because the brew runs either way: the question
 * is which recipe the machine is handed, not whether anything happens. Offering
 * "discard" there would suggest the brew could be called off.
 */
export type LeaveIntent = "leave" | "brew";

type Props = {
    open: boolean;
    intent: LeaveIntent;
    inLibrary?: boolean;
    onSave: () => void;
    onDiscard: () => void;
    onCancel: () => void;
};

// Deliberately not "the dose and the stages have changed". The check behind
// this sheet covers every field the card carries, including the grind, the
// ratio, the cup and the bypass, so naming two of them would send a user
// looking in the wrong place for what they changed.
const WORDS = {
    leaveSaved: {
        body:    "This recipe has changes that are not saved yet. The name, note and tags are already saved.",
        save:    "Save changes",
        discard: "Discard changes"
    },
    leaveNew: {
        body:    "This recipe is not in your library yet. Save it to keep the name, note, tags and brew settings.",
        save:    "Save to library",
        discard: "Discard recipe"
    },
    brew: {
        body:    "This recipe has changes that are not saved yet. The brew will run either way.",
        save:    "Save and brew",
        discard: "Brew without saving"
    }
} as const;

export default function LeaveEditorSheet({
    open, intent, inLibrary = true, onSave, onDiscard, onCancel
}: Props) {
    // BREW saves a rowless recipe before navigating, so the rowless wording is
    // unreachable there; only leaving can be about discarding the whole recipe.
    const words = intent === "brew"
        ? WORDS.brew
        : inLibrary ? WORDS.leaveSaved : WORDS.leaveNew;

    return (
        // Dismissing is cancelling, never discarding. A swipe must not be a way
        // to throw work away without having said so.
        <XbrwSheet open={open} onOpenChange={(next) => {if (!next) onCancel();}}
                   title="UNSAVED CHANGES" heightPercent={46}>
            <YStack gap="$3" paddingHorizontal="$4" paddingBottom="$4">
                <Text fontSize={15} lineHeight={21} color={palette.text}>
                    {words.body}
                </Text>

                {/* `palette.text` as the primary fill, matching RenameSheet's
                    SAVE NAME. Not the recipe's accent: the accent marks the act
                    that runs the recipe, and this is a question about storage. */}
                <Button accessibilityRole="button" accessibilityLabel={words.save}
                        backgroundColor={palette.text} color={onAccent.text}
                        onPress={onSave}>
                    {words.save}
                </Button>

                <Button accessibilityRole="button" accessibilityLabel={words.discard}
                        chromeless color={palette.danger} onPress={onDiscard}>
                    {words.discard}
                </Button>

                <Button accessibilityRole="button" accessibilityLabel="Keep editing"
                        chromeless onPress={onCancel}>
                    Keep editing
                </Button>
            </YStack>
        </XbrwSheet>
    );
}

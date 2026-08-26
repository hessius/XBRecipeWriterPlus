import React, {useState} from "react";
import {Button, Text, XStack, YStack} from "tamagui";

import SettingsToggleRow from "@/components/SettingsToggleRow";
import XbrwSheet from "@/components/XbrwSheet";
import {palette} from "@/constants/colors";
import {mergeRecipes, type BackupPayload} from "@/library/backup";
import type Recipe from "@/library/Recipe";

export type RestoreChoice = {
    replace: boolean;
    includeSettings: boolean;
};

type Props = {
    open: boolean;
    payload: BackupPayload;
    existing: readonly Recipe[];
    onCancel: () => void;
    onRestore: (choice: RestoreChoice) => void;
};

function plural(count: number, one: string, many: string): string {
    return `${count} ${count === 1 ? one : many}`;
}

/**
 * What was found in a backup, and what to do with it.
 *
 * Merging is the button. It cannot lose anything: recipes are matched by UUID
 * and nothing already in the library is touched, so a user who restores an old
 * backup keeps every edit they made since.
 *
 * Replacing exists, because restoring a library onto a device that has drifted
 * is a real thing to want, but it is a second way to destroy a library and it
 * gets its own confirmation. It is not offered at all when there is nothing to
 * destroy.
 */
export default function RestoreSheet({open, payload, existing, onCancel, onRestore}: Props) {
    const [includeSettings, setIncludeSettings] = useState(false);
    const [confirmingReplace, setConfirmingReplace] = useState(false);
    const {toAdd, alreadyPresent} = mergeRecipes(existing, payload.recipes);

    return (
        <XbrwSheet open={open} onOpenChange={(next) => {
            if (!next) {
                setConfirmingReplace(false);
                onCancel();
            }
        }} title="Restore" heightPercent={60}>
            <YStack gap="$3" paddingHorizontal="$4" paddingBottom="$4">
                {confirmingReplace ? (
                    <YStack gap="$3">
                        <Text fontSize={15} color={palette.text}>
                            Replacing deletes {plural(existing.length, "recipe", "recipes")} and
                            puts {plural(payload.recipes.length, "recipe", "recipes")} in their
                            place. This cannot be undone.
                        </Text>
                        <XStack gap="$3">
                            <Button flex={1} accessibilityRole="button"
                                    onPress={() => setConfirmingReplace(false)}>
                                Back
                            </Button>
                            <Button flex={1} accessibilityRole="button"
                                    accessibilityLabel="Yes, replace my library"
                                    backgroundColor={palette.danger}
                                    onPress={() => onRestore({replace: true, includeSettings})}>
                                Yes, replace
                            </Button>
                        </XStack>
                    </YStack>
                ) : (
                    <YStack gap="$3">
                        <Text fontSize={15} color={palette.text}>
                            {toAdd.length === 0
                                ? "Every recipe in this backup is already in your library."
                                : `This backup has ${plural(toAdd.length, "new recipe", "new recipes")}.`}
                        </Text>
                        {toAdd.length > 0 && alreadyPresent > 0 && (
                            <Text fontSize={13} color={palette.dim}>
                                {plural(alreadyPresent, "recipe is", "recipes are")} already in your
                                library and will be left exactly as they are.
                            </Text>
                        )}
                        {payload.skipped > 0 && (
                            <Text fontSize={13} color={palette.danger}>
                                {plural(payload.skipped, "entry", "entries")} in this file could not
                                be read and will be skipped.
                            </Text>
                        )}

                        <SettingsToggleRow
                            label="Take the settings from this backup"
                            description="Off by default: restoring someone else's library should not change your preferences."
                            value={includeSettings}
                            onChange={setIncludeSettings}/>

                        <Button accessibilityRole="button"
                                accessibilityLabel="Add to my library"
                                disabled={toAdd.length === 0}
                                opacity={toAdd.length === 0 ? 0.4 : 1}
                                onPress={() => onRestore({replace: false, includeSettings})}>
                            Add to my library
                        </Button>

                        {existing.length > 0 && (
                            <Button accessibilityRole="button"
                                    accessibilityLabel="Replace my library"
                                    chromeless color={palette.danger}
                                    onPress={() => setConfirmingReplace(true)}>
                                Replace my library instead
                            </Button>
                        )}
                    </YStack>
                )}
            </YStack>
        </XbrwSheet>
    );
}

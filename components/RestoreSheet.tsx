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
    /**
     * What was found in the backup, or `null` before one has been picked.
     *
     * Nullable so the host can keep the sheet permanently mounted and merely
     * toggle `open` — the pattern `DeleteAllSheet` already follows — rather than
     * mounting it already-open and losing the entrance and exit animations.
     */
    payload: BackupPayload | null;
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
    const incoming = payload?.recipes ?? [];
    const {toAdd, alreadyPresent} = mergeRecipes(existing, incoming);
    const skipped = payload?.skipped ?? 0;
    const canAdd = toAdd.length > 0;
    // The honest figure for the replace confirmation: a replace inserts the
    // deduped recipes, not the raw file count, so a backup with a repeated UUID
    // must not promise more than it will actually put back.
    const replaceCount = mergeRecipes([], incoming).toAdd.length;

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
                            puts {plural(replaceCount, "recipe", "recipes")} in their
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
                        {skipped > 0 && (
                            <Text fontSize={13} color={palette.danger}>
                                {plural(skipped, "entry", "entries")} in this file could not
                                be read and will be skipped.
                            </Text>
                        )}

                        <SettingsToggleRow
                            label="Take the settings from this backup"
                            description="Off by default: restoring someone else's library should not change your preferences."
                            value={includeSettings}
                            onChange={setIncludeSettings}/>

                        {/* House pattern for an unavailable control: Tamagui's
                            `disabled` prop suppresses the press but does not
                            forward a disabled state to the host, so a screen
                            reader would still announce this as an ordinary
                            button (see components/ImportTile.tsx). The
                            accessibility state and the withheld handler are set
                            by hand instead. */}
                        <Button accessibilityRole="button"
                                accessibilityLabel="Add to my library"
                                accessibilityState={{disabled: !canAdd}}
                                opacity={canAdd ? 1 : 0.4}
                                onPress={canAdd
                                    ? () => onRestore({replace: false, includeSettings})
                                    : undefined}>
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

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

    // The sheet is mounted for the settings screen's whole life so it keeps its
    // animations, so neither answer is thrown away by an unmount. Both used to
    // outlive the sheet: the next backup a user picked could open straight onto
    // "Yes, replace my library" with a decision they had made about a different
    // file still selected.
    //
    // Cleared in the handlers rather than in an effect on `open`, because
    // dismissing and restoring are the only two ways out -- `onOpenChange`
    // funnels a swipe or a backdrop tap into `onCancel` -- so there is no close
    // an event handler does not already see, and an effect would only be
    // reacting to state this component had just caused.
    function leaveWith(close: () => void) {
        return () => {
            setConfirmingReplace(false);
            setIncludeSettings(false);
            close();
        };
    }

    const dismiss = leaveWith(onCancel);
    const incoming = payload?.recipes ?? [];
    const {toAdd, alreadyPresent} = mergeRecipes(existing, incoming);
    const skipped = payload?.skipped ?? 0;
    // Settings are restorable work in their own right. Judging this on new
    // recipes alone meant that a backup whose recipes you already had left the
    // only non-destructive button disabled, so the sole way to take its
    // settings was to replace the entire library -- destroying recipes in order
    // to accept a preference.
    const canAdd = toAdd.length > 0 || includeSettings;
    const addLabel = toAdd.length === 0 && includeSettings
        ? "Take the settings"
        : "Add to my library";
    // The honest figure for the replace confirmation: a replace inserts the
    // deduped recipes, not the raw file count, so a backup with a repeated UUID
    // must not promise more than it will actually put back.
    const replaceCount = mergeRecipes([], incoming).toAdd.length;

    return (
        <XbrwSheet open={open} onOpenChange={(next) => {
            if (!next) dismiss();
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
                                    onPress={leaveWith(() => onRestore({replace: true, includeSettings}))}>
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
                        {/* Named for what pressing it will actually do. With
                            nothing new to add, "Add to my library" describes an
                            action that is not going to happen, and a screen
                            reader would announce it as the only enabled control
                            on a sheet that had just said there was nothing to
                            add. */}
                        <Button accessibilityRole="button"
                                accessibilityLabel={addLabel}
                                accessibilityState={{disabled: !canAdd}}
                                opacity={canAdd ? 1 : 0.4}
                                onPress={canAdd
                                    ? leaveWith(() => onRestore({replace: false, includeSettings}))
                                    : undefined}>
                            {addLabel}
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

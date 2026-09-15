import React from "react";
import {Pressable} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import {accents, palette} from "@/constants/colors";
import {accentGroupFor} from "@/library/accent";
import type {ImportEntry, ImportStatus} from "@/library/cloud/importPlan";

/**
 * One recipe offered for import, and what importing it would do.
 *
 * `edited` is shown in the same voice as the rest, not as a warning: nothing
 * has gone wrong. The app is saying it will not overwrite a change the user
 * made here unless asked, which is a courtesy, and a red row would read as a
 * problem to be solved.
 *
 * It does carry one extra line, though. Ticking the box *is* the consent --
 * there is no confirmation dialog after it -- so the row has to state the
 * consequence at the point of decision, or the user is agreeing to something
 * the screen never told them (spec 4.4).
 */

const LABELS: Record<ImportStatus, string> = {
    new: "New",
    updated: "Changed in xBloom",
    unchanged: "Already imported",
    edited: "Edited here",
};

/**
 * The consequence, for the one status where ticking costs the user something.
 *
 * Only `edited` has one: for the others, importing is either the obvious thing
 * or a no-op, and a caption on every row would turn into wallpaper and stop
 * being read on the row that matters.
 */
const CAPTIONS: Partial<Record<ImportStatus, string>> = {
    edited: "Importing replaces the changes you made here",
};

// `unchanged` and `edited` step back to secondary text. `dim` rather than
// `muted`: `muted` is 4.12:1 on `base` and documented as a non-text colour, so
// a status line drawn in it would fall under AA.
const TONES: Record<ImportStatus, string> = {
    new: palette.text,
    updated: palette.text,
    unchanged: palette.dim,
    edited: palette.dim,
};

type Props = {
    entry: ImportEntry;
    onToggle: (cloudId: number) => void;
};

export default function CloudImportRow({entry, onToggle}: Props) {
    const group = accentGroupFor(entry.recipe);
    const groupAccents = accents[group];
    const accent = groupAccents[(entry.recipe.accentIndex ?? 0) % groupAccents.length];

    return (
        <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{checked: entry.selected}}
            accessibilityLabel={[entry.name, LABELS[entry.status], CAPTIONS[entry.status]]
                .filter(Boolean)
                .join(", ")}
            onPress={() => onToggle(entry.cloudId)}
            style={({pressed}) => ({
                opacity: pressed ? 0.7 : 1,
                transform: [{scale: pressed ? 0.98 : 1}],
            })}>
            <XStack alignItems="center" gap="$3" paddingVertical="$3" paddingHorizontal="$4">
                {/* The tick is the selection; the bar is the accent this
                    recipe will wear once it lands, so the choice and its
                    result are visible in the same glance. */}
                <YStack
                    width={4}
                    height={32}
                    borderRadius={2}
                    backgroundColor={entry.selected ? accent : palette.dim}/>
                <YStack flex={1} gap="$1">
                    <Text color={palette.text} fontSize={16}>{entry.name}</Text>
                    <Text color={TONES[entry.status]} fontSize={13}>
                        {LABELS[entry.status]}
                    </Text>
                    {CAPTIONS[entry.status] ? (
                        <Text color={palette.dim} fontSize={12}>
                            {CAPTIONS[entry.status]}
                        </Text>
                    ) : null}
                </YStack>
                <Text
                    color={entry.selected ? accent : palette.dim}
                    fontSize={18}>
                    {entry.selected ? "✓" : "○"}
                </Text>
            </XStack>
        </Pressable>
    );
}

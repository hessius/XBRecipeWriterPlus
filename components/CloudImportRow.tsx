import React from "react";
import {Pressable} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import {palette} from "@/constants/colors";
import {resolveAccent} from "@/library/accent";
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

// The wording runs on one axis -- *here* versus *in xBloom* -- so the four
// statuses read as one sentence about two places rather than four unrelated
// adjectives. Taken from spec 4.4, which quotes its copy.
const LABELS: Record<ImportStatus, string> = {
    new: "New here",
    updated: "Changed in xBloom",
    unchanged: "Already in your library",
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

/**
 * Replaces the status caption on a row that cannot be ticked.
 *
 * Two local recipes claim this one, and nothing here can say which. The row
 * has to explain why it is inert, or it reads as a bug; and it has to say
 * where the fix is, because the fix is not on this screen.
 */
const UNSELECTABLE_CAPTION = "Two recipes here claim this one. Remove one in your library first";

// `unchanged` and `edited` step back to secondary text. `dim` rather than
// `muted`: `muted` is 4.12:1 on `base` and documented as a non-text colour, so
// a status line drawn in it would fall under AA.
const TONES: Record<ImportStatus, string> = {
    new: palette.text,
    updated: palette.text,
    unchanged: palette.dim,
    edited: palette.dim,
};

const BAR_WIDTH = 4;

type Props = {
    entry: ImportEntry;
    onToggle: (cloudId: number) => void;
};

export default function CloudImportRow({entry, onToggle}: Props) {
    const caption = entry.selectable ? CAPTIONS[entry.status] : UNSELECTABLE_CAPTION;
    // The library's own resolver, not a local lookup: it validates the index
    // and falls back to the same hash every other screen uses, so a recipe
    // with a missing or bogus index is the same colour here as it will be in
    // the list this screen is feeding.
    const accent = resolveAccent(entry.recipe);

    return (
        <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{checked: entry.selected}}
            accessibilityLabel={[entry.name, LABELS[entry.status], caption]
                .filter(Boolean)
                .join(", ")}
            // One prop, two jobs: `Pressable` both stops calling `onPress`
            // and merges `disabled` into the announced accessibility state, so
            // the row goes inert and says so without a second declaration.
            // (Unlike Tamagui's `Button`, which mirrors nothing and has to be
            // told twice.)
            disabled={!entry.selectable}
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
                    testID="cloud-import-accent"
                    width={BAR_WIDTH}
                    height={32}
                    // Half the width, so the bar is a pill at any width. Not a
                    // `$` token: the radius is a consequence of this bar's
                    // geometry, and a token would drift away from it.
                    borderRadius={BAR_WIDTH / 2}
                    backgroundColor={entry.selected ? accent : palette.dim}/>
                <YStack flex={1} gap="$1">
                    <Text testID="cloud-import-name" color={palette.text} fontSize={16}>
                        {entry.name}
                    </Text>
                    <Text testID="cloud-import-status" color={TONES[entry.status]} fontSize={13}>
                        {LABELS[entry.status]}
                    </Text>
                    {caption ? (
                        <Text testID="cloud-import-caption" color={palette.dim} fontSize={12}>
                            {caption}
                        </Text>
                    ) : null}
                </YStack>
                <Text
                    testID="cloud-import-tick"
                    color={entry.selected ? accent : palette.dim}
                    fontSize={18}>
                    {entry.selected ? "✓" : "○"}
                </Text>
            </XStack>
        </Pressable>
    );
}

import React from "react";
import {Pressable} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import XbrwSheet from "@/components/XbrwSheet";
import {accents, palette, type AccentGroup} from "@/constants/colors";

/** How many swatches a door shows. The tea half only has four. */
const SWATCH_COUNT = 4;
const SWATCH_SIZE = 10;

/**
 * The two doors, in the order they are offered.
 *
 * The summary states the presets `blankRecipe` will apply. The door is the only
 * place a user is told what they are about to get, so the two have to agree.
 * They are written out rather than derived from `blankRecipe` because a door is
 * a sentence, not a field dump — "up to 3" is a card limit and "steeps" is a
 * word for the user, neither of which the factory knows. The agreement is held
 * by a test in this component's suite that reads the factory and checks these
 * strings against it, so a changed preset fails here rather than quietly
 * leaving the door telling the wrong story.
 */
const DOORS: {group: AccentGroup; label: string; summary: string}[] = [
    {group: "coffee", label: "COFFEE", summary: "15 g · 1:16 · grind 65 · OMNI"},
    {group: "tea",    label: "TEA",    summary: "5 g · 90 ml steeps · up to 3"}
];

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Called with the beverage chosen. The sheet does not close itself. */
    onChoose: (group: AccentGroup) => void;
};

/**
 * Asks the one question the editor cannot ask later.
 *
 * `editRecipe` hides the cup-type row on a tea recipe, so a recipe that opens
 * as coffee can never become tea. Deferring the choice would be offering a
 * change the editor does not permit.
 *
 * The swatches are not decoration. `constants/colors.ts` splits the accent
 * palette into a coffee half and a tea half, and `accentGroupFor` chooses
 * between them on `isTea()` — so a door shows the colours the recipe it makes
 * will actually be drawn in.
 *
 * No `prewarm`. `ImportSheet` opts in because it builds a text field and reads
 * the clipboard; two static rows have nothing to warm.
 *
 * Holds no state: it is a picture of its props, and the screen owns both the
 * open flag and what a choice means.
 */
export default function NewRecipeSheet({open, onOpenChange, onChoose}: Props) {
    return (
        <XbrwSheet open={open} onOpenChange={onOpenChange}
                   title="New recipe" heightPercent={27}>
            <YStack gap="$3" paddingHorizontal="$4" paddingBottom="$4">
                {DOORS.map((door) => (
                    <Pressable key={door.group}
                               accessibilityRole="button"
                               accessibilityLabel={`New ${door.group} recipe`}
                               onPress={() => onChoose(door.group)}>
                        <XStack alignItems="center" gap="$3"
                                paddingVertical="$3.5" paddingHorizontal="$3.5"
                                borderRadius="$6"
                                backgroundColor={palette.raised}
                                borderWidth={1} borderColor={palette.line}>
                            <XStack gap="$1"
                                    accessibilityElementsHidden
                                    importantForAccessibility="no-hide-descendants">
                                {accents[door.group].slice(0, SWATCH_COUNT).map((colour) => (
                                    <YStack key={colour}
                                            width={SWATCH_SIZE} height={SWATCH_SIZE}
                                            borderRadius="$1"
                                            backgroundColor={colour}/>
                                ))}
                            </XStack>
                            <YStack gap="$1.5" flex={1}>
                                <DotMatrixText fontSize={13} weight="bold"
                                               letterSpacing={1.5} color={palette.text}>
                                    {door.label}
                                </DotMatrixText>
                                {/*
                                  * `dim`, not `muted`: muted measures 3.55:1
                                  * against this door's fill, and the palette
                                  * says outright it is not a text colour. This
                                  * line is the only statement of what the user
                                  * is about to get, so it has to be readable.
                                  */}
                                <Text fontSize={12} color={palette.dim}>
                                    {door.summary}
                                </Text>
                            </YStack>
                        </XStack>
                    </Pressable>
                ))}
            </YStack>
        </XbrwSheet>
    );
}

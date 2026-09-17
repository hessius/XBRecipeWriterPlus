import React from "react";
import {Pressable} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import type {Shelf} from "@/library/shelves";

/** The tile's height. Two lines of type with room to breathe, and a wide tap. */
const TILE_HEIGHT = 96;

/**
 * One shelf in the grid.
 *
 * The mark is a slot, not a decision: the design says the art is unsettled and
 * going to testers, so this draws the plainest thing that distinguishes the two
 * kinds -- a filled bar for a shelf a person made, a short faint one for one the
 * app derived -- and leaves the variants to a later pass. Nothing else in the
 * tile depends on which mark is drawn, so replacing it is replacing this block.
 *
 * The count is part of the label a reader hears rather than a separate element,
 * because "morning, 4 recipes" is one fact and two elements would make the user
 * swipe twice to learn it.
 */
export default function ShelfTile({shelf, onPress, onEdit}: {
    shelf: Shelf;
    onPress: () => void;
    /**
     * Change who is on this shelf. Manual shelves only: an auto shelf has no
     * membership to change, only a rule.
     *
     * A second, smaller target inside the tile rather than a long press, because
     * a long press is not discoverable and this is the only way a member ever
     * comes off a shelf. A shelf with no way out is a tag the user can never
     * undo.
     */
    onEdit?: () => void;
}) {
    const manual = shelf.kind === "manual";
    const recipes = shelf.count === 1 ? "1 recipe" : `${shelf.count} recipes`;
    const kind = manual ? "your shelf" : "auto shelf";

    return (
        <Pressable accessibilityRole="button"
                   accessibilityLabel={`${shelf.label}, ${kind}, ${recipes}`}
                   testID={`shelf-${shelf.id}`}
                   onPress={onPress} style={{flex: 1}}>
            <YStack height={TILE_HEIGHT} justifyContent="space-between"
                    padding="$3" borderRadius="$4"
                    backgroundColor={palette.raised}
                    borderWidth={manual ? 0 : 1}
                    borderColor={palette.line}>
                <XStack alignItems="center" justifyContent="space-between">
                    <YStack height={4} width={manual ? 28 : 16} borderRadius={2}
                            backgroundColor={manual ? palette.text : palette.muted}/>
                    {onEdit && (
                        <Pressable accessibilityRole="button"
                                   accessibilityLabel={`Edit the ${shelf.label} shelf`}
                                   testID={`shelf-edit-${shelf.id}`}
                                   hitSlop={12}
                                   onPress={onEdit}>
                            <DotIcon name="edit" size={14} color={palette.dim}/>
                        </Pressable>
                    )}
                </XStack>

                <YStack gap="$1">
                    {/*
                      * A stock shelf's name is the app's word and is already in
                      * Doto caps, so it draws in the matrix face the headings
                      * use. A tag is the user's own word, capitals and all, and
                      * the matrix face would recase it into something they did
                      * not type.
                      */}
                    {manual ? (
                        <Text fontSize={14} fontWeight="600" color={palette.text}
                              numberOfLines={1}>
                            {shelf.label}
                        </Text>
                    ) : (
                        <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.4}
                                       color={palette.text}>
                            {shelf.label}
                        </DotMatrixText>
                    )}
                    <Text fontSize={11} color={palette.dim}>{recipes}</Text>
                </YStack>
            </YStack>
        </Pressable>
    );
}

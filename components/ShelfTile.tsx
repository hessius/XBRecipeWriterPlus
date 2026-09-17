import React from "react";
import {Pressable} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import ShelfMark from "@/components/ShelfMark";
import {palette} from "@/constants/colors";
import type {Shelf} from "@/library/shelves";

/**
 * The tile's height: the mark's 44 pt square, two lines of type, and padding.
 *
 * Sized from the mark rather than chosen, because the design fixes the square
 * at 44 and a tile that could not hold it would make the art reflow the grid,
 * which is the one thing the square is fixed to prevent.
 */
export const TILE_HEIGHT = 120;

/**
 * One shelf in the grid.
 *
 * The mark is a slot, not a decision, and the slot is `ShelfMark`: the design
 * says the art is unsettled and going to testers, so the tile commits only to
 * the 44 pt square it is drawn in and knows nothing about what fills it.
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
                <XStack alignItems="flex-start" justifyContent="space-between">
                    <ShelfMark kind={shelf.kind}/>
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

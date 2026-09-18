import React from "react";
import {Pressable} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import ShelfMark from "@/components/ShelfMark";
import {onAccent, palette} from "@/constants/colors";
import {shelfGlyph} from "@/constants/shelfGlyphs";
import type {ShelfMarkMembers} from "@/hooks/useRecipeLibrary";
import type {ShelfMarkVariant} from "@/library/Settings";
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
export default function ShelfTile({
    shelf, members, variant = "hybrid", inverted = false, onPress, onActions,
    onHide
}: {
    shelf: Shelf;
    /** What this shelf's art is drawn from. Absent for an empty shelf. */
    members?: ShelfMarkMembers;
    /** Which art candidate to draw. From the LABS setting. */
    variant?: ShelfMarkVariant;
    /**
     * Draw this tile accent-first: the shelf's colour fills the card and the
     * mark's square goes quiet. A preference.
     *
     * Only the grid sets this, and only on the auto section. A manual shelf's
     * mark is made of its members' own colours, so there is no single accent to
     * lift out of it and nothing left in the square if one were.
     */
    inverted?: boolean;
    onPress: () => void;
    /**
     * Open what can be done to this shelf. Manual shelves only: an auto shelf
     * is a rule the app wrote, with no name of the user's to change and nothing
     * of theirs to delete.
     *
     * Reached three ways, and deliberately so. A glyph inside the tile, because
     * a long press is not discoverable and editing is the only way a recipe
     * ever comes off a shelf -- a shelf with no drawn way out is a tag the user
     * can never undo. A long press on the tile itself, for the hand that
     * already knows. And an accessibility action, because the glyph is nested
     * inside this one element and a screen reader cannot reach it.
     */
    onActions?: () => void;
    /**
     * Put this auto shelf away. Auto shelves only, and by long press only.
     *
     * The gesture with no drawn control that the manual tile's menu is careful
     * not to be, and it can afford to be: the footer under the grid names every
     * shelf that has been put away and brings it back with a tap, so the only
     * way to discover this is also the only way to undo it. A shelf cannot be
     * lost by a long press the user did not mean to make.
     */
    onHide?: () => void;
}) {
    const manual = shelf.kind === "manual";
    const recipes = shelf.count === 1 ? "1 recipe" : `${shelf.count} recipes`;
    const kind = manual ? "your shelf" : "auto shelf";
    // The accent the mark would have filled its square with. Inverting moves it
    // out here, so the two have to read it from the same place or the tile and
    // its square would disagree about which colour this shelf is.
    const field = members?.accents?.[0] ?? palette.surface;
    const actions = [
        ...(onActions !== undefined
            ? [{name: "edit", label: `Actions for the ${shelf.label} shelf`}]
            : []),
        ...(onHide !== undefined
            ? [{name: "hide", label: `Hide the ${shelf.label} shelf`}]
            : [])
    ];

    return (
        <Pressable accessibilityRole="button"
                   accessibilityLabel={`${shelf.label}, ${kind}, ${recipes}`}
                   testID={`shelf-${shelf.id}`}
                   // The edit button below is nested inside this element, which
                   // is one accessibility element, so VoiceOver cannot reach it
                   // -- the same trap `components/RecipeCard.tsx` documents for
                   // its tray tiles. Editing is the only way a recipe comes off
                   // a manual shelf, so without this action a reader has a shelf
                   // it can never change.
                   // Both gestures here are unreachable by a screen reader: the
                   // glyph is nested inside this one element, and a long press
                   // cannot be made at all. Each act is offered as an action so
                   // neither kind of shelf has something only a sighted hand
                   // can do.
                   accessibilityActions={actions.length > 0 ? actions : undefined}
                   onAccessibilityAction={(event) => {
                       if (event.nativeEvent.actionName === "edit") onActions?.();
                       else if (event.nativeEvent.actionName === "hide") onHide?.();
                   }}
                   onPress={onPress} onLongPress={onActions ?? onHide}
                   style={{flex: 1}}>
            <YStack height={TILE_HEIGHT} justifyContent="space-between"
                    padding="$3" borderRadius="$4"
                    backgroundColor={inverted ? field : palette.raised}
                    borderWidth={manual || inverted ? 0 : 1}
                    borderColor={palette.line}>
                <XStack alignItems="flex-start" justifyContent="space-between">
                    <ShelfMark kind={shelf.kind} variant={variant}
                               glyph={shelfGlyph(shelf.id)}
                               accents={members?.accents}
                               profiles={members?.profiles}
                               inverted={inverted}/>
                    {onActions && (
                        <Pressable accessibilityRole="button"
                                   accessibilityLabel={`Actions for the ${shelf.label} shelf`}
                                   testID={`shelf-edit-${shelf.id}`}
                                   hitSlop={12}
                                   onPress={onActions}>
                            <DotIcon name="more" size={14} color={palette.dim}/>
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
                                       color={inverted ? onAccent.text : palette.text}>
                            {shelf.label}
                        </DotMatrixText>
                    )}
                    <Text fontSize={11}
                          color={inverted ? onAccent.label : palette.dim}>
                        {recipes}
                    </Text>
                </YStack>
            </YStack>
        </Pressable>
    );
}

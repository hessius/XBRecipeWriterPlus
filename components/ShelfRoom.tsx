import React from "react";
import {Pressable, ScrollView} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import RecipeShelfTile from "@/components/RecipeShelfTile";
import {onAccent, palette} from "@/constants/colors";
import type Recipe from "@/library/Recipe";

/** Two per row, the same as the shelf grid, so a room reads as the same grid. */
const COLUMNS = 2;

/** The back key's square, the same well `ScreenHeader` puts its own glyph in. */
const KEY_SIZE = 32;

/**
 * A recipe and every act the room can perform on it.
 *
 * Bundled rather than passed as six parallel per-recipe callbacks, because the
 * room only ever forwards them straight to the tile and a bundle keeps that
 * forwarding from becoming six near-identical closures per tile. `onBrew` and
 * `onToggleFavourite` are optional for the same reason they are on the tile: the
 * screen withholds brew when there is no machine, and the tile withdraws the
 * write action itself on a recipe no card can hold.
 */
export type RoomRecipeActions = {
    onOpen: () => void;
    onLongPress: () => void;
    onBrew?: () => void;
    onShare: () => void;
    onWrite: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onToggleFavourite?: () => void;
    /** Open this recipe's brew history, the sheet row no tray carries. */
    onHistory: () => void;
};

/**
 * The shelf room: a shelf opened into itself.
 *
 * Not a route, the same way selection mode is not a route: it is the library
 * screen in a third state, drawn below the one header and the one rail the
 * screen already owns. What it replaces is the grid of shelves, with the grid of
 * this shelf's recipes -- the shelf's name where a section heading would be, its
 * count beneath, and its recipes as tiles of the same square. Opening a shelf
 * changes what is on the squares, not what a square is.
 *
 * The name is the grid's own heading vocabulary, Doto caps at the same size and
 * tracking `ShelfGrid` uses, so the room reads as a titled section of the grid
 * rather than a different screen.
 *
 * A row-wrapping stack rather than a FlatList, the same choice `ShelfGrid` makes
 * and for the same reason: a shelf is bounded by what one person saved, nothing
 * here needs recycling, and a virtualised list inside a scroll view is the
 * shape React Native warns against.
 *
 * Scroll position is deliberately not carried between the grid and the room.
 * The two are alternatives in one slot, so opening a room unmounts the grid's
 * `ScrollView` and its offset with it, and restoring that offset onto a freshly
 * mounted list of different content is fiddle that would only ever approximate
 * the real position -- faking it is worse than not, and the grids are short
 * enough (eight auto shelves plus a person's tags) that they rarely scroll at
 * all. If a grid ever grows long enough to need it, the honest fix is to keep it
 * mounted behind the room, not to replay a saved offset here.
 */
export default function ShelfRoom({
    label, recipes, onBack, actionsFor, manual = false,
    showCoffeeMarker = true, dottedProfile = false, paddingBottom = 0
}: {
    /** The shelf's name, drawn as the room's heading. */
    label: string;
    /**
     * The shelf's recipes, and the only source of the count beneath the name.
     *
     * Counted here rather than taken as a second prop: a caller that could pass
     * a count alongside the recipes is a caller that can pass a count that
     * disagrees with them, and a heading that says four over three tiles is
     * worse than no heading at all.
     */
    recipes: readonly Recipe[];
    /** Leave the room, back to the grid. */
    onBack: () => void;
    /** The acts the room can perform on one recipe, built by the screen. */
    actionsFor: (recipe: Recipe) => RoomRecipeActions;
    /**
     * True for a tag shelf, whose name is the user's own word. It draws in a
     * plain face so the matrix does not recase it; a stock shelf is already the
     * app's Doto caps and draws in the matrix face, exactly as `ShelfTile` does.
     */
    manual?: boolean;
    showCoffeeMarker?: boolean;
    dottedProfile?: boolean;
    paddingBottom?: number;
}) {
    const rows: Recipe[][] = [];
    for (let i = 0; i < recipes.length; i += COLUMNS) {
        rows.push(recipes.slice(i, i + COLUMNS) as Recipe[]);
    }

    const recipeCount = recipes.length === 1 ? "1 recipe" : `${recipes.length} recipes`;

    return (
        <ScrollView testID="shelf-room"
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{
                        paddingHorizontal: 12, paddingTop: 12, paddingBottom, gap: 12
                    }}>
            <XStack alignItems="center" gap="$3" paddingBottom="$2">
                <Pressable accessibilityRole="button" accessibilityLabel="Back to shelves"
                           testID="shelf-room-back" onPress={onBack} hitSlop={12}>
                    <YStack backgroundColor={onAccent.key} borderRadius="$3"
                            width={KEY_SIZE} height={KEY_SIZE}
                            alignItems="center" justifyContent="center">
                        <DotIcon name="back" size={16} color={palette.text}/>
                    </YStack>
                </Pressable>
                {/*
                  * The shelf's name in the grid's heading face and the count
                  * beneath it, so a room announces which shelf it is the way a
                  * section announces itself. A tag's own casing is kept -- the
                  * matrix face would recase a user's word -- but a stock shelf's
                  * name is already the app's Doto caps, so both land right in it.
                  */}
                <YStack flex={1} gap="$1">
                    {manual ? (
                        <Text testID="shelf-room-title" fontSize={16} fontWeight="700"
                              color={palette.text} numberOfLines={1}>
                            {label}
                        </Text>
                    ) : (
                        <DotMatrixText testID="shelf-room-title" fontSize={14} weight="bold"
                                       letterSpacing={1.6} color={palette.text}>
                            {label}
                        </DotMatrixText>
                    )}
                    <Text testID="shelf-room-count" fontSize={11} color={palette.dim}>
                        {recipeCount}
                    </Text>
                </YStack>
            </XStack>

            <YStack gap="$3">
                {rows.map((row) => (
                    <XStack key={row[0].uuid} gap="$3">
                        {row.map((recipe) => {
                            const acts = actionsFor(recipe);
                            return (
                                <RecipeShelfTile
                                    key={recipe.uuid}
                                    recipe={recipe}
                                    onPress={acts.onOpen}
                                    onLongPress={acts.onLongPress}
                                    showCoffeeMarker={showCoffeeMarker}
                                    dottedProfile={dottedProfile}
                                    onBrew={acts.onBrew}
                                    onShare={acts.onShare}
                                    onWrite={acts.onWrite}
                                    onDuplicate={acts.onDuplicate}
                                    onDelete={acts.onDelete}
                                    onToggleFavourite={acts.onToggleFavourite}
                                    onHistory={acts.onHistory}/>
                            );
                        })}
                        {/* Pad an odd last row to a full pair, so the final tile
                            keeps the width of every other tile rather than
                            stretching across the row. The grid does the same. */}
                        {row.length < COLUMNS && <YStack flex={1}/>}
                    </XStack>
                ))}
            </YStack>
        </ScrollView>
    );
}

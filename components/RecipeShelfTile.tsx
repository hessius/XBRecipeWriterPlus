import React from "react";
import {Pressable, View} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import PourProfile, {PROFILE_BLEED} from "@/components/PourProfile";
import {TILE_HEIGHT} from "@/components/ShelfTile";
import Recipe from "@/library/Recipe";
import {accentGroupFor, resolveAccent} from "@/library/accent";
import {canWriteToCard} from "@/library/cardLimits";
import {onAccent} from "@/constants/colors";

/**
 * How far past the tile's corner the pour profile is pushed, matching the card.
 *
 * The same silhouette the list card wears, at the same overhang, so a recipe is
 * recognisable by its shape whether it is a row or a tile. The number is the
 * card's, copied deliberately rather than shared: the card's constant is private
 * to it and a tile is a different shape, so tying the two together would couple
 * two views that only happen to agree today.
 */
const PROFILE_OVERHANG = 2;
const PROFILE_HEIGHT = 44;

type Props = {
    recipe: Recipe;
    /** Open the recipe in the editor, the tile's plain tap. */
    onPress: () => void;
    /**
     * Open the recipe's actions.
     *
     * A square tile has no room to swipe a tray open the way a list row does, so
     * the write/brew/delete actions the row reaches by swiping are reached here
     * by a long press, which opens the one overflow sheet both views share. The
     * gesture is unreachable by a screen reader, which is what the
     * `accessibilityActions` below are for: the same acts, by another route.
     */
    onLongPress: () => void;
    /** Forwarded to the mark. Owned by the settings screen. */
    showCoffeeMarker?: boolean;
    /** Fill the pour profile with a dot screen. Owned by the settings screen. */
    dottedProfile?: boolean;
    /**
     * The recipe's own actions, mirrored from the overflow sheet the long press
     * opens. Each is optional for the same reason its row in the sheet is: brew
     * needs a machine, write needs a card-worthy recipe, and a star is only
     * offered where one can be set. They exist on the tile so a screen reader,
     * which cannot long-press, still reaches every act the sheet offers.
     */
    onBrew?: () => void;
    onShare: () => void;
    onWrite?: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onToggleFavourite?: () => void;
    /**
     * Open this recipe's brew history, the sheet's one row that no tray carries.
     *
     * Every other action here mirrors something a list row can also be swiped
     * to; this one mirrors the long press itself, so without it the history
     * would be reachable only by a gesture a reader cannot make.
     */
    onHistory?: () => void;
};

/**
 * A recipe as a shelf tile.
 *
 * Opening a shelf changes what is on the squares, not what a square is: a recipe
 * tile is the same 44-plus-two-lines geometry the shelf grid draws, at the same
 * `TILE_HEIGHT`, so a shelf room reads as the same grid with different tiles
 * rather than a different screen. It carries no `ShelfMark` -- that 44 pt square
 * is a shelf's art, and a recipe is a different thing -- but it wears the
 * recipe's accent and its pour-profile silhouette, the same identity the list
 * card wears, so the same recipe is recognisable in either view.
 *
 * The name is prose and stays in Inter, matching the list card and the manual
 * shelf's own label; the marker is machine vocabulary and is Doto.
 */
export default function RecipeShelfTile({
    recipe, onPress, onLongPress, showCoffeeMarker = true, dottedProfile = false,
    onBrew, onShare, onWrite, onDuplicate, onDelete, onToggleFavourite, onHistory
}: Props) {
    const accent = resolveAccent(recipe);
    const isTea = accentGroupFor(recipe) === "tea";
    const marker = isTea ? "TEA" : "COFFEE";
    const showMarker = isTea || showCoffeeMarker;

    // The whole tile is one accessibility element, so nothing inside is spoken
    // on its own: everything it shows has to be in this label or it reaches a
    // screen reader as the accent colour alone.
    const summary = [
        recipe.displayName(),
        marker.toLowerCase(),
        recipe.favourite ? "starred" : undefined
    ].filter((part) => part !== undefined).join(", ");

    // The long press is unreachable by a screen reader, so the acts it opens are
    // offered here as actions instead. The set is the overflow sheet's, gated
    // the same way: brew only with a machine, write only on a card-worthy
    // recipe, favourite only where a star can be set. Drift between this list
    // and the sheet's rows is the failure the shared-sheet design guards, and a
    // test pins the two together.
    const actions = [
        ...(onBrew !== undefined ? [{name: "brew", label: "Brew this recipe"}] : []),
        {name: "share", label: "Share recipe"},
        ...(onWrite !== undefined && canWriteToCard(recipe)
            ? [{name: "write", label: "Write recipe to card"}]
            : []),
        {name: "duplicate", label: "Duplicate recipe"},
        ...(onToggleFavourite !== undefined
            ? [{
                name:  "favourite",
                label: recipe.favourite ? "Remove star from recipe" : "Star recipe"
            }]
            : []),
        ...(onHistory !== undefined
            ? [{name: "history", label: "Brew history"}]
            : []),
        {name: "delete", label: "Delete recipe"}
    ];

    return (
        <Pressable
            testID={`recipe-tile-${recipe.uuid}`}
            accessible
            accessibilityRole="button"
            accessibilityLabel={summary}
            accessibilityHint="Opens this recipe. Long press for its actions."
            accessibilityActions={actions}
            onPress={onPress}
            onLongPress={onLongPress}
            onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === "brew") {
                    onBrew?.();
                } else if (event.nativeEvent.actionName === "share") {
                    onShare();
                } else if (event.nativeEvent.actionName === "write") {
                    onWrite?.();
                } else if (event.nativeEvent.actionName === "duplicate") {
                    onDuplicate();
                } else if (event.nativeEvent.actionName === "favourite") {
                    onToggleFavourite?.();
                } else if (event.nativeEvent.actionName === "history") {
                    onHistory?.();
                } else if (event.nativeEvent.actionName === "delete") {
                    onDelete();
                }
            }}
            style={({pressed}) => ({
                flex:      1,
                opacity:   pressed ? 0.85 : 1,
                transform: [{scale: pressed ? 0.99 : 1}]
            })}>
            <YStack testID="recipe-tile" height={TILE_HEIGHT}
                    justifyContent="space-between" overflow="hidden"
                    padding="$3" borderRadius="$4"
                    style={{backgroundColor: accent}}>
                <View pointerEvents="none"
                      style={{
                          position: "absolute",
                          right:    -(PROFILE_BLEED + PROFILE_OVERHANG),
                          bottom:   -(PROFILE_BLEED + PROFILE_OVERHANG)
                      }}>
                    <PourProfile testID="recipe-tile-profile" pours={recipe.pours}
                                 width={140} height={PROFILE_HEIGHT} dotted={dottedProfile}/>
                </View>

                <XStack alignItems="center" justifyContent="flex-end" gap="$1.5">
                    {recipe.favourite && (
                        <DotIcon testID="recipe-tile-favourite" name="favourite"
                                 size={12} color={onAccent.marker}/>
                    )}
                    {showMarker && (
                        <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.4}
                                       color={onAccent.marker}>
                            {marker}
                        </DotMatrixText>
                    )}
                </XStack>

                <Text fontSize={15} fontWeight="700" numberOfLines={2}
                      color={recipe.hasName() ? onAccent.text : onAccent.label}>
                    {recipe.displayName()}
                </Text>
            </YStack>
        </Pressable>
    );
}

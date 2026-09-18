import React from "react";
import {Pressable} from "react-native";
import {XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import RecipeCard from "@/components/RecipeCard";
import {onAccent, palette} from "@/constants/colors";
import type Recipe from "@/library/Recipe";

/** The tick's diameter. A touch under the card's own corner radius. */
const TICK_SIZE = 26;

/**
 * The frame `SwipeableRecipeRow` draws its card in, repeated here.
 *
 * The two rows stand in for each other -- the picker is the library with the
 * swipe taken out -- so a card that sat flush to the screen edge while picking
 * and inset everywhere else would read as a different list. The numbers are
 * copied rather than shared because the swipeable's frame is also the geometry
 * its action tray is measured against, and one constant serving both would
 * invite a change here to move the tiles there.
 */
const SIDE_PADDING = 12;
const ROW_PADDING  = 6;

/**
 * A recipe row while the library is picking members for a shelf.
 *
 * Not the swipeable row with a tick added. A row cannot both open a tray of
 * verbs and be a checkbox: the swipe would be the only way to reach actions the
 * picker has no business offering, and the pan would fight the tap that is now
 * the row's whole purpose. So the picker draws the same card with the swipe
 * left out.
 *
 * The card's own `onPress` is not wired through either. In selection mode the
 * row selects; it does not also navigate, because a tap that sometimes opened
 * the editor and sometimes ticked a box is the kind of control people learn to
 * distrust.
 */
export default function SelectableRecipeRow({
    recipe, selected, onToggle, showCoffeeMarker, dottedProfile
}: {
    recipe: Recipe;
    selected: boolean;
    onToggle: () => void;
    showCoffeeMarker?: boolean;
    dottedProfile?: boolean;
}) {
    return (
        <Pressable accessibilityRole="checkbox"
                   accessibilityState={{checked: selected}}
                   accessibilityLabel={recipe.displayName()}
                   testID={`select-${recipe.uuid}`}
                   onPress={onToggle}>
            <XStack alignItems="center" maxWidth={600}
                    paddingHorizontal={SIDE_PADDING}
                    paddingVertical={ROW_PADDING}
                    gap="$2.5">
                {/*
                  * The card is drawn inert: `pointerEvents` none, so its own
                  * pressables cannot take the tap away from the row. Without
                  * this the card would keep its editor navigation underneath a
                  * row that means something else now.
                  */}
                <YStack flex={1} pointerEvents="none"
                        opacity={selected ? 1 : 0.65}>
                    <RecipeCard recipe={recipe} onPress={onToggle}
                                showCoffeeMarker={showCoffeeMarker}
                                dottedProfile={dottedProfile}/>
                </YStack>

                <YStack width={TICK_SIZE} height={TICK_SIZE}
                        borderRadius={TICK_SIZE / 2}
                        alignItems="center" justifyContent="center"
                        borderWidth={1}
                        borderColor={selected ? palette.text : palette.line}
                        backgroundColor={selected ? palette.text : palette.none}>
                    {selected && (
                        <DotIcon name="success" size={14} color={onAccent.text}/>
                    )}
                </YStack>
            </XStack>
        </Pressable>
    );
}

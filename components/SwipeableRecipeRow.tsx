import React, {useEffect, useRef} from "react";
import {View} from "react-native";
import Swipeable, {type SwipeableMethods} from "react-native-gesture-handler/ReanimatedSwipeable";
import {XStack, YStack} from "tamagui";

import Recipe from "@/library/Recipe";
import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import RecipeCard from "@/components/RecipeCard";
import type {Rect} from "@/components/HeroMorph";
import type {DotIconName} from "@/constants/dotIcons";
import {palette} from "@/constants/colors";

type Props = {
    recipe: Recipe;
    /**
     * Handed where the card was on screen, so the editor can open out of it.
     * Measuring is asynchronous and can fail on a view that has just been
     * unmounted, in which case the press still happens without the rectangle.
     */
    onPress: (from?: Rect) => void;
    onDelete: () => void;
    onDuplicate: () => void;
    /** Nudges the row open briefly on mount so the swipe actions are discoverable. */
    bounceOnMount?: boolean;
    /** When true, the card shows its destructive actions instead of hiding them behind a swipe. */
    editing?: boolean;
    /** Forwarded to the card. Owned by the settings screen. */
    showCoffeeMarker?: boolean;
    /** Forwarded to the card. Owned by the settings screen. */
    dottedProfile?: boolean;
};

/**
 * How long the press waits for the card's rectangle before opening without it.
 *
 * Short enough that a dropped callback is not felt as a dead tap, long enough
 * that the usual round trip to the native side wins comfortably.
 */
const MEASURE_DEADLINE = 100;

const BOUNCE_OPEN_DELAY = 300;
const BOUNCE_CLOSE_DELAY = 1000;

const TILE_WIDTH = 76;
const TILE_GLYPH_SIZE = 24;

type TileProps = {
    icon: DotIconName;
    caption: string;
    tone: string;
    label: string;
    testID: string;
    onPress: () => void;
};

/**
 * One action revealed by swiping a row aside.
 *
 * The tile is the app's own surface colour and the tone appears only as ink.
 * Filled tiles were tried first and put two saturated blocks next to an already
 * saturated accent card — three loud things in a row, with the colour spent on
 * the tile rather than on the thing being said.
 *
 * Captioned, because a glyph on its own asks the user to guess, and one of the
 * two guesses here is unrecoverable.
 */
function Tile({icon, caption, tone, label, testID, onPress}: TileProps) {
    return (
        <YStack
            accessible
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={onPress}
            pressStyle={{opacity: 0.6}}
            width={TILE_WIDTH}
            alignItems="center"
            justifyContent="center"
            gap="$2"
            // Matched to the card's radius so the revealed actions read as
            // objects of the same kind, rather than as chrome behind it.
            borderRadius="$8"
            backgroundColor={palette.surface}>
            <DotIcon testID={testID} name={icon} size={TILE_GLYPH_SIZE} color={tone}/>
            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.2} color={tone}>
                {caption}
            </DotMatrixText>
        </YStack>
    );
}

export default function SwipeableRecipeRow({
                                               recipe,
                                               onPress,
                                               onDelete,
                                               onDuplicate,
                                               bounceOnMount = false,
                                               editing = false,
                                               showCoffeeMarker = true,
                                               dottedProfile = false
                                           }: Props) {
    const swipeableRef = useRef<SwipeableMethods | null>(null);
    const cardRef = useRef<View | null>(null);

    function press() {
        // The measurement decorates the navigation; it must never gate it. It
        // crosses to the native side and comes back on a callback that a view
        // torn down in between will simply never fire, so the press is armed
        // with a deadline and whichever arrives first wins. Opening a recipe is
        // the whole point of the row -- it cannot be allowed to depend on an
        // animation's nicety.
        let opened = false;
        const open = (from?: Rect) => {
            if (opened) {
                return;
            }
            opened = true;
            onPress(from);
        };

        const deadline = setTimeout(() => open(), MEASURE_DEADLINE);

        // Window coordinates, because the editor's hero is measured against the
        // window too and the two have no ancestor in common to be relative to.
        cardRef.current?.measureInWindow?.((x, y, width, height) => {
            clearTimeout(deadline);
            open(width > 0 && height > 0 ? {x, y, width, height} : undefined);
        });
    }

    useEffect(() => {
        if (!bounceOnMount) {
            return;
        }
        const open = setTimeout(() => swipeableRef.current?.openRight(), BOUNCE_OPEN_DELAY);
        const close = setTimeout(() => swipeableRef.current?.close(), BOUNCE_CLOSE_DELAY);
        return () => {
            clearTimeout(open);
            clearTimeout(close);
        };
    }, [bounceOnMount]);

    function renderRightActions() {
        return (
            // The left padding is the gap between the card and the first tile.
            // Without it the tile butts against the card's edge and reads as
            // part of it, rather than as something the card slid off.
            <XStack testID="row-actions" paddingLeft="$2" paddingRight="$2"
                    paddingVertical="$3" alignItems="stretch" gap="$2">
                <Tile icon="duplicate" caption="COPY" tone={palette.success}
                      testID="row-action-duplicate"
                      label={`Duplicate ${recipe.displayName()}`}
                      onPress={() => {
                          swipeableRef.current?.close();
                          onDuplicate();
                      }}/>
                <Tile icon="delete" caption="DELETE" tone={palette.danger}
                      testID="row-action-delete"
                      label={`Delete ${recipe.displayName()}`}
                      onPress={() => {
                          swipeableRef.current?.close();
                          onDelete();
                      }}/>
            </XStack>
        );
    }

    return (
        <View style={{maxWidth: 600, paddingHorizontal: 12, paddingVertical: 6}}>
            <Swipeable
                ref={swipeableRef}
                friction={2}
                rightThreshold={40}
                overshootRight={false}
                renderRightActions={renderRightActions}>
                {/* `collapsable={false}` keeps this view in the native
                    hierarchy on Android, where a layout-only view is otherwise
                    flattened away and has nothing left to measure. */}
                <View ref={cardRef} collapsable={false}>
                    <RecipeCard recipe={recipe} onPress={press} editing={editing}
                                showCoffeeMarker={showCoffeeMarker}
                                dottedProfile={dottedProfile}
                                onDelete={onDelete} onDuplicate={onDuplicate}/>
                </View>
            </Swipeable>
        </View>
    );
}

import React, {useEffect, useRef} from "react";
import {View} from "react-native";
import Swipeable, {type SwipeableMethods} from "react-native-gesture-handler/ReanimatedSwipeable";
import {XStack, YStack} from "tamagui";

import Recipe from "@/library/Recipe";
import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import RecipeCard from "@/components/RecipeCard";
import type {DotIconName} from "@/constants/dotIcons";
import {palette} from "@/constants/colors";
import type {BrewShortcut} from "@/library/brewShortcut";
import {resolveAccent} from "@/library/accent";

type Props = {
    recipe: Recipe;
    onPress: () => void;
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
    /**
     * Forwarded to the card, which draws the on-card shape. The tray offers BREW
     * regardless — the setting only chooses whether a *second*, visible
     * affordance is drawn on the card to be judged against the tray.
     */
    brewShortcut?: BrewShortcut;
    /** Brew this recipe. Present only when there is a machine to brew on. */
    onBrew?: () => void;
    /** Share a link to this recipe. */
    onShare?: () => void;
    /** Write this recipe to an NFC card. */
    onWrite?: () => void;
};

const BOUNCE_OPEN_DELAY = 300;
const BOUNCE_CLOSE_DELAY = 1000;

/**
 * The width of one action tile.
 *
 * The action tray is the widest, at three tiles. On the smallest supported
 * device — an iPhone SE class phone at 320 pt — the row sits inside 12 pt of
 * horizontal padding on each side, leaving 296 pt. The tray is
 * `3·TILE_WIDTH + 2·gap + 2·padding`; with the `$2` (7 pt) gap and padding that
 * is `3·72 + 14 + 14 = 244`, which leaves a 52 pt strip of card still visible
 * to grab when the tray is fully open. 76 (the previous value, for a two-tile
 * tray) would have left only 40, and RNTL performs no layout so this is a number
 * that only a device can finally settle. 72 stays well above the 44 pt minimum
 * touch target.
 */
const TILE_WIDTH = 72;
const TILE_GLYPH_SIZE = 24;

type TileProps = {
    /**
     * The tile's glyph. Required.
     *
     * The action tray was built glyphless on the argument that its verbs are set
     * as words elsewhere, and the result simply read as unfinished beside the
     * management tray: two marked, coloured tiles on one side and three
     * near-identical white words on the other. The trays are told apart by which
     * way the card slides, not by one of them being plainer.
     */
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
 * management tray's two guesses is unrecoverable.
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
            <DotMatrixText fontSize={11} weight="bold"
                           letterSpacing={1.2} color={tone}>
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
                                               dottedProfile = false,
                                               brewShortcut,
                                               onBrew,
                                               onShare,
                                               onWrite
                                           }: Props) {
    const swipeableRef = useRef<SwipeableMethods | null>(null);

    useEffect(() => {
        if (!bounceOnMount) {
            return;
        }
        // Hint the *action* tray, not the management one.
        //
        // There are two trays now, and bouncing both on launch — a wobble left
        // then right on the top card of every cold start — would be exactly the
        // intolerable thing this nudge is gated so tightly to avoid (only the
        // first row, only while the caller keeps `bounceOnMount` true). So it
        // hints one direction. The management tray is revealed by swiping left,
        // the iOS swipe-to-delete convention every user already carries; the
        // genuinely new and unconventional direction is swiping *right* to reach
        // BREW/SHARE/WRITE, and `openLeft` opens exactly that tray. Teach the
        // thing that is not already known.
        const open = setTimeout(() => swipeableRef.current?.openLeft(), BOUNCE_OPEN_DELAY);
        const close = setTimeout(() => swipeableRef.current?.close(), BOUNCE_CLOSE_DELAY);
        return () => {
            clearTimeout(open);
            clearTimeout(close);
        };
    }, [bounceOnMount]);

    /**
     * The management tray, revealed by swiping the card left.
     *
     * Copy and delete are housekeeping on the *list*. BREW used to sit here too,
     * which muddled acting on a recipe in with managing the collection of them;
     * it has moved to the action tray on the other side.
     */
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

    /**
     * The action tray, revealed by swiping the card right.
     *
     * BREW, SHARE and WRITE all act on the *recipe* — run it, hand out a link to
     * it, put it on a card — which is a different kind of thing from managing the
     * list, and so deserves its own side. Each tile appears only when the screen
     * can perform it: BREW needs a machine, so it is absent when `onBrew` is not
     * given, the same rule the card's own shortcut follows.
     */
    function renderLeftActions() {
        return (
            // The right padding is the gap between the last tile and the card,
            // the mirror of the management tray's left padding.
            <XStack testID="row-actions-brew" paddingLeft="$2" paddingRight="$2"
                    paddingVertical="$3" alignItems="stretch" gap="$2">
                {onBrew !== undefined && (
                    // The one tile carrying the recipe's own accent: it is the
                    // act on this specific recipe. Same helper the card uses, so
                    // the tile and the card it slid off cannot disagree.
                    <Tile icon="brew" caption="BREW" tone={resolveAccent(recipe)}
                          testID="row-action-brew"
                          label={`Brew ${recipe.displayName()}`}
                          onPress={() => {
                              swipeableRef.current?.close();
                              onBrew();
                          }}/>
                )}
                {onShare !== undefined && (
                    // Recipe-agnostic verbs, so a neutral ink rather than the
                    // accent BREW earns.
                    <Tile icon="share" caption="SHARE" tone={palette.info}
                          testID="row-action-share"
                          label={`Share ${recipe.displayName()}`}
                          onPress={() => {
                              swipeableRef.current?.close();
                              onShare();
                          }}/>
                )}
                {onWrite !== undefined && (
                    <Tile icon="write" caption="WRITE" tone={palette.text}
                          testID="row-action-write"
                          label={`Write ${recipe.displayName()} to a card`}
                          onPress={() => {
                              swipeableRef.current?.close();
                              onWrite();
                          }}/>
                )}
            </XStack>
        );
    }

    // Both trays are drawn only when they have at least one tile: an empty
    // action tray (no machine, and a caller that also withholds share/write)
    // would otherwise open onto a blank strip.
    const hasLeftActions =
        onBrew !== undefined || onShare !== undefined || onWrite !== undefined;

    return (
        <View style={{maxWidth: 600, paddingHorizontal: 12, paddingVertical: 6}}>
            <Swipeable
                ref={swipeableRef}
                friction={2}
                leftThreshold={40}
                rightThreshold={40}
                // No over-swipe: a full drag must never commit an action. Both
                // trays are buttons only, so overshoot is switched off on each
                // side and there is no `onSwipeableOpen` shortcut that would act
                // on a fling.
                overshootLeft={false}
                overshootRight={false}
                renderLeftActions={hasLeftActions ? renderLeftActions : undefined}
                renderRightActions={renderRightActions}>
                <RecipeCard recipe={recipe} onPress={onPress} editing={editing}
                            showCoffeeMarker={showCoffeeMarker}
                            dottedProfile={dottedProfile}
                            brewShortcut={brewShortcut} onBrew={onBrew}
                            onDelete={onDelete} onDuplicate={onDuplicate}/>
            </Swipeable>
        </View>
    );
}

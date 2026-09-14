import {router, useFocusEffect, useLocalSearchParams} from "expo-router";
import React, {useRef, useState} from "react";
import {FlatList} from "react-native-gesture-handler";
import Swipeable, {type SwipeableMethods} from "react-native-gesture-handler/ReanimatedSwipeable";
import {Button, Text, XStack, YStack} from "tamagui";

import BrewHistoryRow from "@/components/BrewHistoryRow";
import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import ScreenHeader from "@/components/ScreenHeader";
import XbrwSheet from "@/components/XbrwSheet";
import {palette} from "@/constants/colors";
import {useBrewHistory} from "@/hooks/useBrewHistory";
import type {StoredBrew} from "@/library/BrewDatabase";

/** How long one push to the record screen refuses a second (same latch as index.tsx). */
const PUSH_GUARD_MS = 2000;

const TILE_WIDTH = 76;
const TILE_GLYPH_SIZE = 24;

/**
 * The screen's own header, drawn in content rather than by the native bar.
 *
 * The route keeps the platform back chevron — it is pushed on top of the record
 * screen or a recipe sheet — but its system-font title is emptied in favour of
 * this, the same move the record screen makes: the native title read in the
 * platform font, out of register with the app's Doto chrome. "BREW HISTORY" is
 * fixed chrome, so it is Doto like the rest of it.
 *
 * When the list is filtered to one recipe, that recipe is named beneath the
 * heading so the screen says which history it is showing. A recipe name is
 * human-typed, so it is Inter prose (a plain `Text`) and never rendered through
 * `DotMatrixText` — the one dot-matrix exception for a recipe name, on the brew
 * screen, is not extended here.
 */
function HistoryHeader({recipeName, count}: {recipeName?: string; count: number}) {
    return (
        <YStack>
            {/* The same header the other pushed screens draw, rather than a
                second one of its own. An earlier pass hand-set a Doto title
                here, which read as a third kind of header in an app that
                already had two -- and, being drawn in content, sat *under* the
                native bar instead of replacing it. */}
            <ScreenHeader title="Brew history" count={count}
                          onBack={() => router.back()}/>
            {recipeName !== undefined && (
                <Text testID="history-header-recipe" fontSize={13}
                      color={palette.dim} numberOfLines={1}
                      paddingHorizontal="$4" paddingBottom="$2">
                    {recipeName}
                </Text>
            )}
        </YStack>
    );
}

/**
 * The delete tile revealed by swiping a row left.
 *
 * Tapping it does not delete immediately — it opens a confirmation sheet,
 * because a brew record cannot be recovered once removed.
 */
function DeleteTile({onPress}: {onPress: () => void}) {
    return (
        <YStack
            accessible
            accessibilityRole="button"
            accessibilityLabel="Delete brew"
            onPress={onPress}
            pressStyle={{opacity: 0.6}}
            width={TILE_WIDTH}
            alignItems="center"
            justifyContent="center"
            gap="$2"
            borderRadius="$8"
            backgroundColor={palette.surface}>
            <DotIcon testID="brew-delete-icon" name="delete" size={TILE_GLYPH_SIZE}
                     color={palette.danger}/>
            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.2}
                           color={palette.danger}>
                DELETE
            </DotMatrixText>
        </YStack>
    );
}

/**
 * One swipeable brew history row.
 *
 * Extracted as a component so that the Swipeable ref is owned by the row
 * rather than by the `renderItem` callback — hooks cannot be called inside a
 * render function.
 */
function SwipeableBrewRow({
    brew,
    onPress,
    onDeleteRequest
}: {
    brew: StoredBrew;
    onPress: () => void;
    onDeleteRequest: (ref: React.RefObject<SwipeableMethods | null>) => void;
}) {
    const rowRef = useRef<SwipeableMethods | null>(null);
    return (
        <Swipeable
            ref={rowRef}
            friction={2}
            rightThreshold={40}
            overshootRight={false}
            renderRightActions={() => (
                // The left padding is the gap between the row and the tile.
                // Without it the tile butts against the row's edge and reads as
                // part of it rather than as something the row slid off -- the
                // same reasoning, and the same measurements, as the recipe
                // list's trays in SwipeableRecipeRow.
                <XStack testID="brew-row-actions" paddingLeft="$2"
                        paddingRight="$2" paddingVertical="$2"
                        alignItems="stretch">
                    <DeleteTile onPress={() => onDeleteRequest(rowRef)} />
                </XStack>
            )}>
            <BrewHistoryRow brew={brew} onPress={onPress} />
        </Swipeable>
    );
}

/**
 * The brew history list.
 *
 * Three entry points: the recipe overflow sheet (filtered by `recipeUuid`),
 * the record screen's "All brews" button (unfiltered), and Settings → Library
 * (unfiltered).
 */
export default function BrewHistory() {
    const {recipeUuid} = useLocalSearchParams<{recipeUuid?: string}>();
    const {brews, remove, refresh} = useBrewHistory();

    const lastPushRef = useRef(0);
    // The id of the brew the user has swiped and tapped Delete on, waiting for
    // confirmation. Null when no confirmation sheet is open.
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    // Keep a ref to the currently-open swipeable so it can be closed when the
    // confirmation sheet is dismissed without deleting.
    const swipeableRef = useRef<SwipeableMethods | null>(null);

    useFocusEffect(
        // `useFocusEffect` demands a stable callback, which is the one place the
        // repo hand-writes `React.useCallback` despite the React Compiler owning
        // memoisation elsewhere — see `components/ImportTile.tsx`. Deps empty on
        // purpose: this must re-run on focus, not on every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        React.useCallback(() => { refresh(); }, [])
    );

    const filtered = recipeUuid
        ? brews.filter((b) => b.recipeUuid === recipeUuid)
        : brews;

    function handlePress(brew: StoredBrew) {
        // eslint-disable-next-line react-hooks/purity
        if (Date.now() - lastPushRef.current < PUSH_GUARD_MS) return;
        // eslint-disable-next-line react-hooks/purity
        lastPushRef.current = Date.now();
        router.push(`/brewRecord?id=${brew.id}`);
    }

    function handleDeleteRequest(brew: StoredBrew, ref: React.RefObject<SwipeableMethods | null>) {
        swipeableRef.current = ref.current;
        setPendingDeleteId(brew.id);
    }

    function handleDeleteConfirm() {
        if (pendingDeleteId !== null) remove(pendingDeleteId);
        setPendingDeleteId(null);
        swipeableRef.current = null;
    }

    function handleDeleteCancel() {
        swipeableRef.current?.close();
        setPendingDeleteId(null);
        swipeableRef.current = null;
    }

    const pendingBrew = pendingDeleteId !== null
        ? filtered.find((b) => b.id === pendingDeleteId) ?? null
        : null;

    // When filtered to one recipe, name it under the heading. Taken from the
    // brew rows themselves (the name at brew time), so a since-renamed recipe
    // does not relabel its own history.
    const recipeName = recipeUuid ? filtered[0]?.recipeName : undefined;

    if (filtered.length === 0) {
        return (
            <YStack flex={1} backgroundColor={palette.base}>
                <HistoryHeader recipeName={recipeName} count={filtered.length} />
                <YStack flex={1} padding="$4" alignItems="center"
                        justifyContent="center" gap="$2">
                    <DotMatrixText fontSize={14} weight="bold" letterSpacing={1.6}
                                   color={palette.dim}>
                        NO BREWS YET
                    </DotMatrixText>
                    <Text color={palette.muted} fontSize={13} textAlign="center">
                        Brew a recipe and it will appear here.
                    </Text>
                </YStack>
            </YStack>
        );
    }

    return (
        <YStack flex={1} backgroundColor={palette.base}>
            <HistoryHeader recipeName={recipeName} count={filtered.length} />
            <FlatList
                data={filtered}
                keyExtractor={(item) => item.id}
                renderItem={({item}) => (
                    <SwipeableBrewRow
                        brew={item}
                        onPress={() => handlePress(item)}
                        onDeleteRequest={(ref) => handleDeleteRequest(item, ref)}
                    />
                )}
                contentContainerStyle={{paddingVertical: 8}}
            />

            {/* Confirmation sheet — shown after swipe+tap, before the delete lands. */}
            <XbrwSheet
                open={pendingBrew !== null}
                onOpenChange={(next) => { if (!next) handleDeleteCancel(); }}
                title="Delete brew"
                heightPercent={40}>
                <YStack gap="$3" paddingHorizontal="$4" paddingBottom="$4">
                    <Text fontSize={15} color={palette.text}>
                        Delete {pendingBrew?.recipeName}? This cannot be undone.
                    </Text>
                    <Button
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${pendingBrew?.recipeName ?? "brew"}`}
                        backgroundColor={palette.danger}
                        onPress={handleDeleteConfirm}>
                        Delete
                    </Button>
                    <Button
                        accessibilityRole="button"
                        accessibilityLabel="Keep this brew"
                        chromeless
                        onPress={handleDeleteCancel}>
                        Keep this brew
                    </Button>
                </YStack>
            </XbrwSheet>
        </YStack>
    );
}

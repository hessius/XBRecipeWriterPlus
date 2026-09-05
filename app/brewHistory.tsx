import {router, useFocusEffect, useLocalSearchParams, useNavigation} from "expo-router";
import React, {useEffect, useRef, useState} from "react";
import {FlatList} from "react-native-gesture-handler";
import Swipeable, {type SwipeableMethods} from "react-native-gesture-handler/ReanimatedSwipeable";
import {Button, Text, YStack} from "tamagui";

import BrewHistoryRow from "@/components/BrewHistoryRow";
import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import XbrwSheet from "@/components/XbrwSheet";
import {palette} from "@/constants/colors";
import {useBrewHistory} from "@/hooks/useBrewHistory";
import type {StoredBrew} from "@/library/BrewDatabase";

/** How long one push to the record screen refuses a second (same latch as index.tsx). */
const PUSH_GUARD_MS = 2000;

const TILE_WIDTH = 76;
const TILE_GLYPH_SIZE = 24;

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
                <DeleteTile onPress={() => onDeleteRequest(rowRef)} />
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
    const navigation = useNavigation();
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

    useEffect(() => {
        navigation.setOptions({title: "Brew history"});
    }, [navigation]);

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

    if (filtered.length === 0) {
        return (
            <YStack flex={1} backgroundColor={palette.base} padding="$4"
                    alignItems="center" justifyContent="center" gap="$2">
                <DotMatrixText fontSize={14} weight="bold" letterSpacing={1.6}
                               color={palette.dim}>
                    NO BREWS YET
                </DotMatrixText>
                <Text color={palette.muted} fontSize={13} textAlign="center">
                    Brew a recipe and it will appear here.
                </Text>
            </YStack>
        );
    }

    return (
        <YStack flex={1} backgroundColor={palette.base}>
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

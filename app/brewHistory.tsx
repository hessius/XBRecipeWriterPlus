import {useFocusEffect, useLocalSearchParams} from "expo-router";
import router from "@/hooks/steadyRouter";
import React, {useRef, useState} from "react";
import {FlatList} from "react-native-gesture-handler";
import Swipeable, {type SwipeableMethods} from "react-native-gesture-handler/ReanimatedSwipeable";
import {Button, Text, XStack, YStack} from "tamagui";

import BrewHistoryRow from "@/components/BrewHistoryRow";
import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import ExportButton from "@/components/ExportButton";
import ScreenHeader from "@/components/ScreenHeader";
import XbrwSheet from "@/components/XbrwSheet";
import {palette} from "@/constants/colors";
import {useBrewBatchHandoff} from "@/hooks/useBrewBatchHandoff";
import {useBrewHistory} from "@/hooks/useBrewHistory";
import {useSetting} from "@/hooks/useSetting";
import type {StoredBrew} from "@/library/BrewDatabase";
import {canHandOff, HANDOFF_TARGETS} from "@/library/brew/handoff/targets";

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
 * The selection controls, above the list.
 *
 * Its own row rather than a slot on `ScreenHeader`, which several screens share
 * and none of the others has an action for: one screen's button is not a reason
 * to grow the chrome every pushed screen draws.
 *
 * Delete and Send share the top row and the count sits under them. They were
 * on one row with the count until a two-digit selection pushed the buttons off
 * the edge on a narrow phone.
 *
 * Selecting is available whether or not the handoff is switched on, because
 * deleting several brews at once is worth having on its own. Only the Send
 * button is behind the gate.
 */
function SelectionActionRow({
    selecting,
    count,
    blocked,
    fits,
    busy,
    canSend,
    onSelect,
    onSend,
    onDelete,
    onCancel
}: {
    selecting: boolean;
    count: number;
    /** How many of the selected brews cannot be handed over. */
    blocked: number;
    fits: boolean;
    busy: boolean;
    canSend: boolean;
    onSelect: () => void;
    onSend: () => void;
    onDelete: () => void;
    onCancel: () => void;
}) {
    if (!selecting) {
        return (
            <XStack paddingHorizontal="$4" paddingVertical="$2" justifyContent="flex-end"
                    borderBottomWidth={1} borderColor={palette.line}>
                <Button
                    accessibilityRole="button"
                    accessibilityLabel="Select brews"
                    chromeless
                    size="$2"
                    onPress={onSelect}>
                    <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.2}
                                   color={palette.dim}>
                        SELECT
                    </DotMatrixText>
                </Button>
            </XStack>
        );
    }

    const tooLarge = count > 0 && !fits;

    return (
        <YStack paddingHorizontal="$4" paddingVertical="$2" gap="$2"
                borderBottomWidth={1} borderColor={palette.line}>
            <XStack alignItems="center" justifyContent="space-between" gap="$3">
                <Button
                    accessibilityRole="button"
                    accessibilityLabel="Delete selected brews"
                    accessibilityState={{disabled: count === 0}}
                    disabled={count === 0}
                    opacity={count === 0 ? 0.5 : 1}
                    chromeless
                    size="$2"
                    onPress={onDelete}>
                    <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.2}
                                   color={palette.danger}>
                        DELETE
                    </DotMatrixText>
                </Button>
                <XStack gap="$2" alignItems="center" flexShrink={1} minWidth={0}>
                    {/* The same outlined Doto button, and the same words, the
                        record screen sends a single brew with, so the batch
                        action reads as the same action rather than a second,
                        louder one. A bare "Send" did not say where to. */}
                    {canSend && (
                        <ExportButton
                            label={HANDOFF_TARGETS[0].buttonLabel}
                            accessibilityLabel="Send selected brews to Beanconqueror"
                            busy={busy}
                            disabled={count === 0 || tooLarge || blocked > 0}
                            onPress={onSend}
                        />
                    )}
                    <Button
                        accessibilityRole="button"
                        accessibilityLabel="Cancel selection"
                        chromeless
                        size="$2"
                        onPress={onCancel}>
                        <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.2}
                                       color={palette.dim}>
                            CANCEL
                        </DotMatrixText>
                    </Button>
                </XStack>
            </XStack>
            <Text color={palette.dim} fontSize={13}>
                {count === 1 ? "1 brew selected" : `${count} brews selected`}
            </Text>
            {tooLarge && (
                <Text color={palette.warn} fontSize={12}>
                    Select fewer brews to send them together.
                </Text>
            )}
            {/* A brew that was cancelled, that failed, or that the app stopped
                watching has no drink behind it, so it stays selectable for
                delete but blocks the send rather than being quietly dropped
                from it. Sending the rest without saying so would write a
                different diary than the one the user picked. */}
            {canSend && blocked > 0 && (
                <Text testID="selection-blocked" color={palette.warn} fontSize={12}>
                    {blocked === 1
                        ? "1 selected brew did not finish, so it cannot be sent."
                        : `${blocked} selected brews did not finish, so they cannot be sent.`}
                </Text>
            )}
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
    onDeleteRequest,
    selecting,
    selected
}: {
    brew: StoredBrew;
    onPress: () => void;
    onDeleteRequest: (ref: React.RefObject<SwipeableMethods | null>) => void;
    selecting: boolean;
    selected: boolean;
}) {
    const rowRef = useRef<SwipeableMethods | null>(null);
    return (
        <Swipeable
            ref={rowRef}
            enabled={!selecting}
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
            <BrewHistoryRow
                brew={brew}
                onPress={onPress}
                selectionMode={selecting}
                selected={selected}
            />
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
    const {brews, open, remove, refresh} = useBrewHistory();
    const [handoffEnabled] = useSetting("beanconquerorHandoff");
    const handoff = useBrewBatchHandoff((id) => {
        const opened = open(id);
        return opened === null ? null : {record: opened.record, samples: opened.samples};
    });

    const lastPushRef = useRef(0);
    // The id of the brew the user has swiped and tapped Delete on, waiting for
    // confirmation. Null when no confirmation sheet is open.
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    const [selecting, setSelecting] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [selectionFits, setSelectionFits] = useState(false);
    // True while the batch delete confirmation is open. Kept apart from
    // `pendingDeleteId` because the two delete different things and say so
    // differently: one names a brew, the other counts them.
    const [confirmingBatchDelete, setConfirmingBatchDelete] = useState(false);
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

    // How many of the selected brews cannot be handed over. Counted from the
    // rows on screen rather than from the database so it agrees with what the
    // user can actually see and tick.
    const blockedCount = selectedIds.filter((id) => {
        const brew = filtered.find((candidate) => candidate.id === id);
        return brew !== undefined && !canHandOff(brew.outcome);
    }).length;

    function handlePress(brew: StoredBrew) {
        if (selecting) {
            toggleSelected(brew.id);
            return;
        }
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

    function handleSelectStart() {
        setSelecting(true);
        setSelectedIds([]);
        setSelectionFits(false);
        handoff.reset();
    }

    function handleSelectCancel() {
        setSelecting(false);
        setSelectedIds([]);
        setSelectionFits(false);
        setConfirmingBatchDelete(false);
        handoff.reset();
    }

    function toggleSelected(id: string) {
        const next = selectedIds.includes(id)
            ? selectedIds.filter((selectedId) => selectedId !== id)
            : [...selectedIds, id];
        setSelectedIds(next);
        setSelectionFits(handoff.fits(next));
    }

    async function handleSelectionSend() {
        if (selectedIds.length === 0 || !selectionFits || handoff.busy) return;
        if (blockedCount > 0) return;
        await handoff.send(selectedIds);
        handleSelectCancel();
    }

    function handleSelectionDelete() {
        for (const id of selectedIds) remove(id);
        handleSelectCancel();
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
            {/* Always rendered. Selecting several brews to delete them is worth
                having whether or not the handoff is switched on; the gate is
                carried into the row and hides the Send button alone. */}
            <SelectionActionRow
                selecting={selecting}
                count={selectedIds.length}
                blocked={blockedCount}
                fits={selectionFits}
                busy={handoff.busy}
                canSend={handoffEnabled}
                onSelect={handleSelectStart}
                onSend={() => void handleSelectionSend()}
                onDelete={() => setConfirmingBatchDelete(true)}
                onCancel={handleSelectCancel}
            />
            <FlatList
                data={filtered}
                keyExtractor={(item) => item.id}
                renderItem={({item}) => (
                    <SwipeableBrewRow
                        brew={item}
                        onPress={() => handlePress(item)}
                        onDeleteRequest={(ref) => handleDeleteRequest(item, ref)}
                        selecting={selecting}
                        selected={selectedIds.includes(item.id)}
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

            {/* The batch equivalent, opened from the selection row. It counts
                the brews rather than naming them: a list of names long enough
                to be worth batching is longer than a sheet can show. */}
            <XbrwSheet
                open={confirmingBatchDelete}
                onOpenChange={(next) => { if (!next) setConfirmingBatchDelete(false); }}
                title="Delete brews"
                heightPercent={40}>
                <YStack gap="$3" paddingHorizontal="$4" paddingBottom="$4">
                    <Text fontSize={15} color={palette.text}>
                        {selectedIds.length === 1
                            ? "Delete 1 brew? This cannot be undone."
                            : `Delete ${selectedIds.length} brews? This cannot be undone.`}
                    </Text>
                    <Button
                        accessibilityRole="button"
                        accessibilityLabel="Delete the selected brews"
                        backgroundColor={palette.danger}
                        onPress={handleSelectionDelete}>
                        Delete
                    </Button>
                    <Button
                        accessibilityRole="button"
                        accessibilityLabel="Keep these brews"
                        chromeless
                        onPress={() => setConfirmingBatchDelete(false)}>
                        Keep these brews
                    </Button>
                </YStack>
            </XbrwSheet>
        </YStack>
    );
}

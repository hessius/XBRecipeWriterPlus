import {File as FSFile, Paths} from "expo-file-system";
import {router, useLocalSearchParams, useNavigation} from "expo-router";
import * as Sharing from "expo-sharing";
import React, {useEffect, useRef, useState} from "react";
import {Pressable, useWindowDimensions} from "react-native";
import ViewShot, {type ViewShotRef} from "react-native-view-shot";
import {Text, XStack, YStack} from "tamagui";

import BrewFigures from "@/components/BrewFigures";
import BrewStageLadder from "@/components/BrewStageLadder";
import BrewTrace from "@/components/BrewTrace";
import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import {useBrewHistory} from "@/hooks/useBrewHistory";
import {brewFilename, toExportJson} from "@/library/brew/brewExport";
import RecipeDatabase from "@/library/RecipeDatabase";
import type Recipe from "@/library/Recipe";

const TRACE_HEIGHT = 150;
const SCREEN_PADDING = 16;

/** Minimal interface for looking up a recipe. Injected by tests. */
export type RecipeLookup = {getRecipe: (uuid: string) => Recipe | null};

let sharedLookup: RecipeLookup | undefined;
function getSharedLookup(): RecipeLookup {
    if (sharedLookup === undefined) sharedLookup = new RecipeDatabase();
    return sharedLookup;
}

type Props = {
    /** Injected by tests to avoid opening the real SQLite database. */
    recipeLookup?: RecipeLookup;
};

/** An export action button. Defined at module scope — see house rules. */
function ExportButton({label, onPress}: {label: string; onPress: () => void}) {
    return (
        <Pressable accessibilityRole="button" accessibilityLabel={label}
                   onPress={onPress} style={{flex: 1}}>
            <YStack alignItems="center" paddingVertical="$3" borderRadius="$4"
                    borderWidth={1} borderColor={palette.line}>
                <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6}
                               color={palette.dim}>
                    {label.toUpperCase()}
                </DotMatrixText>
            </YStack>
        </Pressable>
    );
}

/** The "All brews" header button. Defined at module scope — see house rules. */
function AllBrewsButton({onPress}: {onPress: () => void}) {
    return (
        <Pressable accessibilityRole="button" accessibilityLabel="All brews"
                   onPress={onPress} style={{paddingHorizontal: 12}}>
            <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.6}
                           color={palette.dim}>
                ALL BREWS
            </DotMatrixText>
        </Pressable>
    );
}

/**
 * A single recorded brew, frozen.
 *
 * The same layout as the live brew screen: trace, figures, the stage ladder
 * with every stage done. The record preserves the accent and recipe name at
 * brew time, so a recipe recoloured or deleted afterwards does not rewrite its
 * own history. If the recipe has since been deleted the ladder is omitted with
 * a short note; figures and trace remain.
 */
export default function BrewRecord({recipeLookup}: Props) {
    const {id, latest} = useLocalSearchParams<{id?: string; latest?: string}>();
    const navigation = useNavigation();
    const {width} = useWindowDimensions();

    const {open, brews} = useBrewHistory();

    // Read the record once at mount (not on every render). `open` runs two
    // synchronous SELECTs and JSON.parse on the stream, potentially hundreds
    // of kilobytes — doing it in render causes re-parsing on every rotation.
    // When `latest=1` is set (navigated from the brew screen) use the most
    // recent brew in the history.
    const [opened] = useState(() => {
        if (id) return open(id);
        if (latest === "1") {
            const first = brews[0];
            return first ? open(first.id) : null;
        }
        return null;
    });

    // Look up the recipe for the stage ladder. The recipe may have been
    // deleted since the brew was recorded; that must not crash the screen.
    const [recipe] = useState<Recipe | null>(() => {
        if (!opened) return null;
        const store = recipeLookup ?? getSharedLookup();
        return store.getRecipe(opened.record.recipeUuid);
    });

    // Ref for capturing the trace + figures as a PNG.
    const shotRef = useRef<ViewShotRef>(null);

    // Guards against a second press while an export is already in flight.
    const isSharingImageRef = useRef(false);
    const isSharingDataRef  = useRef(false);

    const lastPushRef = useRef(0);

    function handleAllBrews() {
        if (Date.now() - lastPushRef.current < 2000) return;
        lastPushRef.current = Date.now();
        router.push("/brewHistory");
    }

    /**
     * Capture the trace + figures as a PNG and hand it to the system share
     * sheet. Sharing can fail silently (user cancel, simulator, no share
     * sheet) — none of those is an error worth surfacing.
     */
    async function shareImage() {
        if (!opened) return;
        if (isSharingImageRef.current) return;
        isSharingImageRef.current = true;
        try {
            const uri = await shotRef.current?.capture?.();
            if (uri === undefined) return;
            if (!(await Sharing.isAvailableAsync())) return;
            await Sharing.shareAsync(uri, {
                mimeType:    "image/png",
                dialogTitle: brewFilename(opened.record, "png")
            });
        } catch {
            // User cancelled, or the share sheet is unavailable — not an error.
        } finally {
            isSharingImageRef.current = false;
        }
    }

    /**
     * Write the brew as JSON to the cache directory and share the file.
     * The cache directory is the right place: it is writable, and the system
     * may reclaim it when space is low, which is exactly what we want for a
     * temporary export file.
     *
     * Availability is checked before writing so we do not produce a file that
     * is never read. The temporary file is deleted after sharing: it would
     * eventually be reclaimed anyway, but removing it immediately avoids
     * accumulating stale exports in the cache directory.
     */
    async function shareData() {
        if (!opened) return;
        if (isSharingDataRef.current) return;
        isSharingDataRef.current = true;
        try {
            if (!(await Sharing.isAvailableAsync())) return;
            const name = brewFilename(opened.record, "json");
            const file = new FSFile(Paths.cache, name);
            file.write(toExportJson(opened.record, opened.samples));
            await Sharing.shareAsync(file.uri, {
                mimeType:    "application/json",
                dialogTitle: name
            });
        } catch {
            // User cancelled — not an error.
        } finally {
            isSharingDataRef.current = false;
        }
    }

    useEffect(() => {
        navigation.setOptions({
            title: "",
            headerRight: () => <AllBrewsButton onPress={handleAllBrews} />
        });
    }, [navigation]);

    if (opened === null) {
        return (
            <YStack flex={1} backgroundColor={palette.base} padding="$4"
                    alignItems="center" justifyContent="center" gap="$2">
                <DotMatrixText fontSize={14} weight="bold" letterSpacing={1.6}
                               color={palette.dim}>
                    BREW NOT FOUND
                </DotMatrixText>
                <Text color={palette.muted} fontSize={13} textAlign="center">
                    That brew is no longer here.
                </Text>
            </YStack>
        );
    }

    const {record, samples} = opened;
    const accent = record.accent;

    // Measured from the first drop, because that is where the sample stream is
    // zeroed. From `startedAt` the axis would also carry waking and grinding,
    // against which the trace — which knows nothing of them — would be drawn
    // short. Older rows have no `pouringAt` and fall back to the old meaning.
    const zero = (record.pouringAt ?? 0) > 0 ? record.pouringAt! : record.startedAt;
    const durationSeconds = (record.endedAt - zero) / 1000;
    // Planned seconds is total minus the overrun the record saved.
    const plannedSecs = Math.max(0, durationSeconds - record.heldSeconds);

    return (
        <YStack flex={1} backgroundColor={palette.base} padding="$4" gap="$3">
            <Text color={palette.dim} fontSize={13}>{record.recipeName}</Text>

            {/* The ViewShot wraps only the trace and the figures — the parts a
                person would share as an image. The ladder and the buttons are
                outside it deliberately. */}
            <ViewShot ref={shotRef} options={{format: "png", quality: 1}}>
                {record.hasStream ? (
                    <BrewTrace
                        pours={[]}
                        samples={samples}
                        accent={accent}
                        width={width - SCREEN_PADDING * 2}
                        height={TRACE_HEIGHT}
                        plannedSeconds={plannedSecs}
                        planOpacity={0}
                        planColor={palette.muted}
                        planDashed={false}
                    />
                ) : (
                    <YStack height={TRACE_HEIGHT} alignItems="center"
                            justifyContent="center">
                        <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.6}
                                       color={palette.muted}>
                            NO TRACE KEPT
                        </DotMatrixText>
                        <Text color={palette.muted} fontSize={12} marginTop="$2"
                              textAlign="center">
                            No trace was kept for this brew.
                        </Text>
                    </YStack>
                )}

                <BrewFigures
                    water={record.waterTotal}
                    cup={record.cupTotal}
                    seconds={durationSeconds}
                    accent={accent}
                />
            </ViewShot>

            {recipe !== null ? (
                <BrewStageLadder
                    pours={recipe.pours}
                    accent={accent}
                    activeIndex={recipe.pours.length}
                    barHeight={11}
                    rungGap={8}
                    scrolls={false}
                    stageWater={recipe.pours.map(pour => Math.max(pour.volume, 0))}
                    // Task 17 puts the recorded stalls here.
                    stalls={recipe.pours.map(() => [])}
                    pauseElapsed={0}
                />
            ) : (
                <DotMatrixText fontSize={11} letterSpacing={1.2} color={palette.muted}>
                    Recipe deleted. Stages not available.
                </DotMatrixText>
            )}

            <XStack gap="$3">
                <ExportButton label="Save as image"
                              onPress={() => void shareImage()} />
                <ExportButton label="Export the data"
                              onPress={() => void shareData()} />
            </XStack>
        </YStack>
    );
}

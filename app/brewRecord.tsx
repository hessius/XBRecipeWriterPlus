import {router, useLocalSearchParams} from "expo-router";
import React, {useState} from "react";
import {useWindowDimensions} from "react-native";
import ViewShot from "react-native-view-shot";
import {Text, XStack, YStack} from "tamagui";

import BrewSummary from "@/components/BrewSummary";
import StageDetail from "@/components/StageDetail";
import DotMatrixText from "@/components/DotMatrixText";
import ExportButton from "@/components/ExportButton";
import ScreenHeader from "@/components/ScreenHeader";
import {ENDED_ON_MACHINE_NOTE} from "@/constants/brewCopy";
import {palette} from "@/constants/colors";
import {useBrewExport} from "@/hooks/useBrewExport";
import {useBrewHistory} from "@/hooks/useBrewHistory";
import {formatBrewDate, formatBrewTime} from "@/library/brew/brewFormat";
import {poursFromPlan} from "@/library/brew/BrewRecord";
import {ladderFrontier} from "@/library/brew/ladderState";
import RecipeDatabase from "@/library/RecipeDatabase";
import type Recipe from "@/library/Recipe";
import {SCREEN_PADDING} from "@/constants/layout";

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

    // Export mechanics — the ViewShot ref and both shares — live in the hook,
    // shared with the live brew modal so the two export identically. The
    // record and its samples are already in memory here.
    // The stage whose detail is open, or null for none.
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

    // Cleared before the PNG is taken. A shaded band and a tinted rung are
    // answers to a tap, and a picture cannot be tapped: baked in they would
    // read as the brew itself having done something odd at that stage.
    const {shotRef, shareImage, shareData, busy} = useBrewExport(
        () => opened,
        async () => { setSelectedIndex(null); }
    );

    // No "All brews" control. The list is the only way in here, so it sat
    // beside a back chevron that already went to exactly the same screen —
    // two affordances for one destination, one of them pushing a *second*
    // copy of the list onto the stack rather than returning to the first.

    if (opened === null) {
        return (
            <YStack flex={1} backgroundColor={palette.base}>
                <ScreenHeader title="Brew" onBack={() => router.back()}/>
                <YStack flex={1} padding="$4"
                    alignItems="center" justifyContent="center" gap="$2">
                <DotMatrixText fontSize={14} weight="bold" letterSpacing={1.6}
                               color={palette.dim}>
                    BREW NOT FOUND
                </DotMatrixText>
                <Text color={palette.muted} fontSize={13} textAlign="center">
                    That brew is no longer here.
                </Text>
                </YStack>
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

    // The record's own plan, or the live recipe for rows written before brews
    // kept one. A snapshot is preferred even when the recipe still exists: it
    // is what was actually brewed, and the recipe may have been edited since.
    const snapshot = poursFromPlan(record.plan);
    const stages = snapshot.length > 0 ? snapshot : recipe?.pours ?? [];
    // Falling back to the plan means claiming every stage poured, which is
    // what it always did and is only ever right for a brew that finished.
    const delivered = record.stageWater
        ?? stages.map((pour) => Math.max(pour.volume, 0));

    return (
        <YStack flex={1} backgroundColor={palette.base} gap="$3">
            {/* Titled "Brew", not with the recipe's name: `BrewSummary` draws
                that name immediately below, and it has to, because the capture
                needs it. A header repeating it would say the same word twice in
                two fonts. The date says the thing the name cannot — which brew
                of that recipe this is. */}
            <YStack>
                <ScreenHeader title="Brew" onBack={() => router.back()}/>
                <Text testID="record-header-when" fontSize={13} color={palette.dim}
                      paddingHorizontal="$4" paddingBottom="$2">
                    {`${formatBrewDate(record.startedAt)} · ${formatBrewTime(record.startedAt)}`}
                </Text>
            </YStack>
            {/* Everything worth sharing sits inside the ViewShot: the recipe
                name, the trace, the figures and the stage ladder. BrewSummary
                owns its own background and padding, because a capture inherits
                neither margin nor background from its ancestors. */}
            <ViewShot ref={shotRef} options={{format: "png", quality: 1}}>
                <BrewSummary
                    recipeName={record.recipeName}
                    hasStream={record.hasStream}
                    samples={samples}
                    stages={stages}
                    accent={accent}
                    width={width}
                    plannedSeconds={plannedSecs}
                    water={record.waterTotal}
                    cup={record.cupTotal}
                    seconds={durationSeconds}
                    activeIndex={ladderFrontier(record.outcome, delivered)}
                    stageWater={delivered}
                    stalls={record.stalls ?? stages.map(() => [])}
                    note={record.outcome === "endedOnMachine"
                        ? ENDED_ON_MACHINE_NOTE : undefined}
                    stagesUnavailable={snapshot.length === 0 && recipe === null}
                    selectedIndex={selectedIndex}
                    onSelectStage={(index) =>
                        setSelectedIndex((was) => (was === index ? null : index))}
                />
            </ViewShot>

            {/* Below the figures rather than over them: the panel explains a
                stage that stays highlighted above it, and a sheet would cover
                the very highlight that opened it. */}
            {selectedIndex !== null && stages[selectedIndex] !== undefined && (
                <StageDetail
                    index={selectedIndex}
                    stage={stages[selectedIndex]}
                    deliveredMl={delivered[selectedIndex] ?? 0}
                    stalls={(record.stalls ?? [])[selectedIndex] ?? []}
                    samples={samples}
                    hasStream={record.hasStream}
                    outcome={record.outcome}
                    accent={accent}
                    onClose={() => setSelectedIndex(null)}
                />
            )}

            <XStack gap="$3" paddingHorizontal={SCREEN_PADDING}>
                <ExportButton label="Save as image" busy={busy}
                              onPress={() => void shareImage()} />
                <ExportButton label="Export the data" busy={busy}
                              onPress={() => void shareData()} />
            </XStack>
        </YStack>
    );
}


import {router, useLocalSearchParams, useNavigation} from "expo-router";
import React, {useEffect, useRef, useState} from "react";
import {Pressable, useWindowDimensions} from "react-native";
import {Text, YStack} from "tamagui";

import BrewFigures from "@/components/BrewFigures";
import BrewStageLadder from "@/components/BrewStageLadder";
import BrewTrace from "@/components/BrewTrace";
import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import {useBrewHistory} from "@/hooks/useBrewHistory";
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
    const {id} = useLocalSearchParams<{id?: string}>();
    const navigation = useNavigation();
    const {width} = useWindowDimensions();

    const {open} = useBrewHistory();

    // Read the record once at mount (not on every render). `open` runs two
    // synchronous SELECTs and JSON.parse on the stream, potentially hundreds
    // of kilobytes — doing it in render causes re-parsing on every rotation.
    const [opened] = useState(() => id ? open(id) : null);

    // Look up the recipe for the stage ladder. The recipe may have been
    // deleted since the brew was recorded; that must not crash the screen.
    const [recipe] = useState<Recipe | null>(() => {
        if (!opened) return null;
        const store = recipeLookup ?? getSharedLookup();
        return store.getRecipe(opened.record.recipeUuid);
    });

    const lastPushRef = useRef(0);

    function handleAllBrews() {
        if (Date.now() - lastPushRef.current < 2000) return;
        lastPushRef.current = Date.now();
        router.push("/brewHistory");
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

    // The duration of this brew in seconds.
    const durationSeconds = (record.endedAt - record.startedAt) / 1000;
    // Planned seconds is total minus the overrun the record saved.
    const plannedSecs = Math.max(0, durationSeconds - record.heldSeconds);

    return (
        <YStack flex={1} backgroundColor={palette.base} padding="$4" gap="$3">
            <Text color={palette.dim} fontSize={13}>{record.recipeName}</Text>

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

            {recipe !== null ? (
                <BrewStageLadder
                    pours={recipe.pours}
                    accent={accent}
                    activeIndex={recipe.pours.length}
                    stageElapsed={0}
                />
            ) : (
                <DotMatrixText fontSize={11} letterSpacing={1.2} color={palette.muted}>
                    Recipe deleted — stages not available.
                </DotMatrixText>
            )}
        </YStack>
    );
}

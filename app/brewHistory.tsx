import {router, useLocalSearchParams, useNavigation} from "expo-router";
import React, {useEffect, useRef} from "react";
import {FlatList} from "react-native";
import {Text, YStack} from "tamagui";

import BrewHistoryRow from "@/components/BrewHistoryRow";
import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import {useBrewHistory} from "@/hooks/useBrewHistory";
import type {StoredBrew} from "@/library/BrewDatabase";

/** How long one push to the record screen refuses a second (same latch as index.tsx). */
const PUSH_GUARD_MS = 2000;

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
    const {brews} = useBrewHistory();

    const lastPushRef = useRef(0);

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
                    <BrewHistoryRow brew={item} onPress={() => handlePress(item)} />
                )}
                contentContainerStyle={{paddingVertical: 8}}
            />
        </YStack>
    );
}

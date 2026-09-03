import {router, useLocalSearchParams, useNavigation} from "expo-router";
import React, {useEffect, useRef} from "react";
import {Pressable, useWindowDimensions} from "react-native";
import {Text, YStack} from "tamagui";

import BrewFigures from "@/components/BrewFigures";
import BrewTrace from "@/components/BrewTrace";
import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import {useBrewHistory} from "@/hooks/useBrewHistory";

const TRACE_HEIGHT = 150;
const SCREEN_PADDING = 16;

/**
 * A single recorded brew, frozen.
 *
 * The same layout as the live brew screen: trace, figures, held time. The
 * record preserves the accent and recipe name at brew time, so a recipe
 * recoloured or deleted afterwards does not rewrite its own history.
 */
export default function BrewRecord() {
    const {id} = useLocalSearchParams<{id?: string; latest?: string}>();
    const navigation = useNavigation();
    const {width} = useWindowDimensions();

    const {open} = useBrewHistory();
    const opened = id ? open(id) : null;

    const lastPushRef = useRef(0);

    useEffect(() => {
        navigation.setOptions({title: ""});
    }, [navigation]);

    function handleAllBrews() {
        if (Date.now() - lastPushRef.current < 2000) return;
        lastPushRef.current = Date.now();
        router.push("/brewHistory");
    }

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

            <Pressable accessibilityRole="button" accessibilityLabel="All brews"
                       onPress={handleAllBrews}>
                <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.6}
                               color={palette.dim}>
                    ALL BREWS
                </DotMatrixText>
            </Pressable>
        </YStack>
    );
}

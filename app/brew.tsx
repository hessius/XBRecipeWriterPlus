import {router, useLocalSearchParams, useNavigation} from "expo-router";
import React, {useEffect, useState} from "react";
import {Pressable, useWindowDimensions} from "react-native";
import {Text, YStack} from "tamagui";

import BrewFigures from "@/components/BrewFigures";
import BrewStageLadder from "@/components/BrewStageLadder";
import BrewTrace from "@/components/BrewTrace";
import DotMatrixText from "@/components/DotMatrixText";
import {BLOCKED_WATER_HEADLINE, blockedWaterCopy, FAILURE_COPY,
        FIRST_BREW_REMINDER, NO_RETRY, PHASE_COPY, PRO_MODE_PROMPT,
        RUNNING} from "@/constants/brewCopy";
import {palette} from "@/constants/colors";
import {useBrewRun} from "@/hooks/useBrewRun";
import {useSetting} from "@/hooks/useSetting";
import {resolveAccent} from "@/library/accent";
import {plannedSeconds} from "@/library/brew/brewShape";
import Recipe from "@/library/Recipe";

const TRACE_HEIGHT = 150;
const SCREEN_PADDING = 16;

/** A bordered press. The screen has four of them and they differ only in colour. */
function Action({label, color, onPress}: {label: string; color: string; onPress: () => void}) {
    return (
        <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>
            <YStack alignItems="center" paddingVertical="$3.5" borderRadius="$4"
                    borderWidth={1} borderColor={color}>
                <DotMatrixText fontSize={12} weight="bold" letterSpacing={2} color={color}>
                    {label.toUpperCase()}
                </DotMatrixText>
            </YStack>
        </Pressable>
    );
}

export default function Brew() {
    const {recipeJSON} = useLocalSearchParams<{recipeJSON: string}>();
    const navigation = useNavigation();
    const {width} = useWindowDimensions();
    const [recipe] = useState(() => new Recipe(undefined, recipeJSON));
    const runState = useBrewRun(recipe);
    const {phase, error, samples, elapsed, stageElapsed, activeIndex, holding,
           brew, startBrew, cancelBrew, canOfferProMode, switchToProAndRetry} = runState;
    const [firstBrewDone, setFirstBrewDone] = useSetting("firstBrewDone");

    useEffect(() => {
        navigation.setOptions({title: ""});
    }, [navigation]);

    // Once, on mount. Re-sending on every render would commit the recipe again
    // to a machine that is already grinding it.
    useEffect(() => {
        void brew(recipe);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (phase.name === "pouring" && !firstBrewDone) setFirstBrewDone(true);
    }, [phase.name, firstBrewDone, setFirstBrewDone]);

    const accent = resolveAccent(recipe);
    const running = RUNNING.has(phase.name);
    // The two water events are not the same thing. `blocked` means nothing was
    // sent and the dose is safe; a failure by name means the machine stopped
    // with the dose already spent.
    const blocked = phase.name === "failed" && phase.reason === "blocked";
    const failed = phase.name === "failed" && !blocked;
    const total = recipe.pours.reduce((sum, pour) => sum + Math.max(pour.volume, 0), 0);
    const last = samples[samples.length - 1];

    const headline = blocked
        ? BLOCKED_WATER_HEADLINE
        : failed
            ? (FAILURE_COPY[phase.reason] ?? phase.detail ?? "The brew did not start.")
            : PHASE_COPY[phase.name];
    const headlineColor = blocked ? palette.warn : failed ? palette.danger : palette.text;
    const offerPro = failed && phase.reason === "rejected" && canOfferProMode();
    const offerRetry = blocked || (failed && !NO_RETRY.has(phase.reason));

    return (
        <YStack flex={1} backgroundColor={palette.base} padding="$4" gap="$3">
            <Text color={palette.dim} fontSize={13}>{recipe.displayName()}</Text>

            <BrewTrace
                pours={recipe.pours}
                samples={samples}
                accent={accent}
                width={width - SCREEN_PADDING * 2}
                height={TRACE_HEIGHT}
                plannedSeconds={plannedSeconds(recipe.pours)}
                stage={phase.name === "pouring" ? phase.pour : undefined}
                stages={phase.name === "pouring" ? phase.pours : undefined}
                holding={holding}
            />

            <BrewFigures
                water={last?.water ?? 0}
                cup={last?.cup ?? 0}
                seconds={elapsed}
                accent={accent}
            />

            <DotMatrixText fontSize={14} weight="bold" letterSpacing={1.8}
                           color={headlineColor}>
                {headline}
            </DotMatrixText>

            {blocked && (
                <Text color={palette.warn} fontSize={13}>{blockedWaterCopy(total)}</Text>
            )}

            {!firstBrewDone && running && (
                <Text color={palette.warn} fontSize={13}>{FIRST_BREW_REMINDER}</Text>
            )}

            {offerPro && <Text color={palette.dim} fontSize={13}>{PRO_MODE_PROMPT}</Text>}
            {error !== null && <Text color={palette.danger} fontSize={13}>{error}</Text>}

            <YStack flex={1}>
                <BrewStageLadder
                    pours={recipe.pours}
                    accent={accent}
                    activeIndex={activeIndex}
                    stageElapsed={stageElapsed}
                    holding={holding}
                />
            </YStack>

            {running ? (
                <YStack gap="$3">
                    {phase.name === "readyToStart" && (
                        // The frame this sends is the one that sets a burr
                        // spinning, so it is a press of its own rather than
                        // something BREW did on the user's behalf.
                        <Action label="Start brewing" color={palette.success}
                                onPress={() => void startBrew()} />
                    )}
                    <Action label="Cancel" color={palette.danger}
                            onPress={() => void cancelBrew()} />
                </YStack>
            ) : (
                <YStack gap="$3">
                    {offerRetry && (
                        // The machine will not answer a question outside a
                        // fresh session, and opening one makes it beep — so
                        // noticing a refilled tank cannot be done quietly on a
                        // timer. A press asks again, and only when somebody is
                        // there to have done something about the reason.
                        <Action label="Try again" color={palette.text}
                                onPress={() => void brew(recipe)} />
                    )}
                    {offerPro && (
                        <Action label="Switch to PRO" color={palette.warn}
                                onPress={() => void switchToProAndRetry(recipe)} />
                    )}
                    {phase.name === "done" && (
                        <Action label="Export this brew" color={palette.dim}
                                onPress={() => router.push("/brewRecord?latest=1")} />
                    )}
                    <Action label="Done" color={palette.line} onPress={() => router.back()} />
                </YStack>
            )}
        </YStack>
    );
}

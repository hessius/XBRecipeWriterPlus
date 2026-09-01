import {router, useLocalSearchParams, useNavigation} from "expo-router";
import React, {useEffect, useState} from "react";
import {Pressable} from "react-native";
import {Text, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import {useBrew} from "@/hooks/useBrew";
import {useSetting} from "@/hooks/useSetting";
import Recipe from "@/library/Recipe";

/** What each phase says. The wording is the feature. */
const PHASE_COPY: Record<string, string> = {
    idle:        "Ready when you are.",
    // Deliberately slow: the frames are spaced two seconds apart, because the
    // machine drops a burst. Saying so stops this reading as a hang.
    sending:     "Sending the recipe… this takes a few seconds.",
    armed:       "Recipe loaded.",
    // The app never sends 40518, so this is where a parked machine ends up.
    // The user is standing in front of it; one press costs them a second.
    pressPlay:   "PRESS ▶ ON THE MACHINE",
    grinding:    "Grinding…",
    done:        "Enjoy.",
    cancelled:   "Stopped.",
    lostContact: "Lost contact — the machine is still brewing."
};

const FAILURE_COPY: Record<string, string> = {
    noWater:      "The machine ran out of water.",
    noBeans:      "The machine is waiting for beans.",
    gearPosition: "The grinder could not find its gear position.",
    doseMismatch: "The machine would not accept that dose and water volume.",
    idling:       "The machine went idle before the brew started.",
    rejected:     "The machine would not take the recipe."
};

/**
 * Said once, on a user's first brew, and never again.
 *
 * None of it is detectable — the machine cannot tell us whether a cup is under
 * the spout, whether the pod is loaded, or whether the beans in the hopper are
 * the ones the recipe was written for. So it is stated rather than checked, and
 * stating it every time would train people to stop reading it.
 */
const FIRST_BREW_REMINDER =
    "Check there is a cup under the spout and a pod in the holder.";

/** The offer to escape EASY mode, when a send has gone nowhere because of it. */
const PRO_MODE_PROMPT =
    "Your machine is in Easy mode. Switch it to Pro and try again?";

/** The phases during which stopping the machine is still a meaningful thing. */
const RUNNING = new Set(["sending", "armed", "pressPlay", "grinding", "pouring"]);

export default function Brew() {
    const {recipeJSON} = useLocalSearchParams<{recipeJSON: string}>();
    const navigation = useNavigation();
    const {phase, error, brew, cancelBrew, canOfferProMode, switchToProAndRetry} = useBrew();
    const [firstBrewDone, setFirstBrewDone] = useSetting("firstBrewDone");
    const [recipe] = useState(() => new Recipe(undefined, recipeJSON));

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

    const running = RUNNING.has(phase.name);
    const headline = phase.name === "failed"
        ? FAILURE_COPY[phase.reason]
        : PHASE_COPY[phase.name];
    const offerPro = phase.name === "failed"
        && phase.reason === "rejected"
        && canOfferProMode();

    return (
        <YStack flex={1} backgroundColor={palette.base} padding="$4" gap="$4">
            <Text color={palette.dim} fontSize={13}>{recipe.displayName()}</Text>

            <DotMatrixText fontSize={16} weight="bold" letterSpacing={2}
                           color={phase.name === "failed" ? palette.danger : palette.text}>
                {headline}
            </DotMatrixText>

            {phase.name === "pouring" && (
                <Text color={palette.dim} fontSize={13}>
                    {`Pour ${phase.pour} of ${phase.pours}`}
                </Text>
            )}

            {!firstBrewDone && running && (
                <Text color={palette.warn} fontSize={13}>{FIRST_BREW_REMINDER}</Text>
            )}

            {offerPro && (
                <Text color={palette.dim} fontSize={13}>{PRO_MODE_PROMPT}</Text>
            )}

            {error !== null && (
                <Text color={palette.danger} fontSize={13}>{error}</Text>
            )}

            <YStack flex={1}/>

            {running ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Cancel"
                           onPress={() => void cancelBrew()}>
                    <YStack alignItems="center" paddingVertical="$3.5" borderRadius="$4"
                            borderWidth={1} borderColor={palette.danger}>
                        <DotMatrixText fontSize={12} weight="bold" letterSpacing={2}
                                       color={palette.danger}>
                            CANCEL
                        </DotMatrixText>
                    </YStack>
                </Pressable>
            ) : (
                <YStack gap="$3">
                    {offerPro && (
                        <Pressable accessibilityRole="button"
                                   accessibilityLabel="Switch to PRO mode and try again"
                                   onPress={() => void switchToProAndRetry(recipe)}>
                            <YStack alignItems="center" paddingVertical="$3.5" borderRadius="$4"
                                    borderWidth={1} borderColor={palette.warn}>
                                <DotMatrixText fontSize={12} weight="bold" letterSpacing={2}
                                               color={palette.warn}>
                                    SWITCH TO PRO
                                </DotMatrixText>
                            </YStack>
                        </Pressable>
                    )}
                    <Pressable accessibilityRole="button" accessibilityLabel="Done"
                               onPress={() => router.back()}>
                        <YStack alignItems="center" paddingVertical="$3.5" borderRadius="$4"
                                borderWidth={1} borderColor={palette.line}>
                            <DotMatrixText fontSize={12} weight="bold" letterSpacing={2}
                                           color={palette.text}>
                                DONE
                            </DotMatrixText>
                        </YStack>
                    </Pressable>
                </YStack>
            )}
        </YStack>
    );
}

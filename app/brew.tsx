import {router, useLocalSearchParams} from "expo-router";
import React, {useEffect, useState} from "react";
import {Pressable, useWindowDimensions} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import BrewFigures from "@/components/BrewFigures";
import BrewNowCard from "@/components/BrewNowCard";
import BrewStageLadder from "@/components/BrewStageLadder";
import BrewTrace from "@/components/BrewTrace";
import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import MachineDot from "@/components/MachineDot";
import {BLOCKED_HEADLINE, BLOCKED_WATER_HEADLINE, blockedWaterCopy, FAILURE_COPY,
        FIRST_BREW_REMINDER, NO_RETRY, PHASE_COPY, PRO_MODE_PROMPT,
        RUNNING} from "@/constants/brewCopy";
import {mix, palette} from "@/constants/colors";
import {useMachine} from "@/hooks/useMachine";
import {useSetting} from "@/hooks/useSetting";
import {useTraceAnimation} from "@/hooks/useTraceAnimation";
import {useLiveBrew} from "@/hooks/useLiveBrew";
import {resolveAccent} from "@/library/accent";
import {allocateBands} from "@/library/brew/bands";
import {pauseSeconds, plannedSeconds} from "@/library/brew/brewShape";
import Recipe from "@/library/Recipe";

const SCREEN_PADDING = 16;
const WORKING = new Set(["idle", "waking", "sending"]);

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
    const {recipeJSON, view} = useLocalSearchParams<{recipeJSON: string; view: string}>();
    // Opened to look at a run that already exists — from the mini bar — rather
    // than to start one. Without this, coming back to watch the brew you just
    // made would make it again: `start` replaces a finished run, and this
    // screen would hand it a freshly deserialised recipe on every mount.
    const viewing = view === "1";
    const {width} = useWindowDimensions();

    // A local recipe from the route params. Used for the first render (before
    // RunOwner in the provider has its first tick) and for `total` below.
    const [localRecipe] = useState(() => new Recipe(undefined, recipeJSON));

    const {run, start, startInPro, startBrew, cancelBrew, canOfferProMode,
           error} = useLiveBrew();

    // Tell the provider to start a run for this recipe. `start` is idempotent:
    // if RunOwner is already mounted it replaces `start` with a no-op, so
    // re-mounting this screen while a brew is in flight never commands a second
    // brew (Finding 2).
    useEffect(() => {
        if (!viewing) start(localRecipe);
        // localRecipe and viewing are stable for the life of this screen.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Read display state from the provider's run. The provider owns the single
    // recorder and the single DB write; the screen is a pure reader (Finding 1).
    const phase = run?.phase ?? {name: "grinding"} as const;
    const samples = run?.samples ?? [];
    const elapsed = run?.elapsed ?? 0;
    const activeIndex = run?.activeIndex ?? null;
    const holding = run?.holding ?? false;

    // The recipe the provider is running takes precedence once it is available,
    // because it is the object the recorder was started with.
    const recipe = run?.recipe ?? localRecipe;
    const stageWater = run?.stageWater ?? recipe.pours.map(() => 0);
    const stalls = run?.stalls ?? recipe.pours.map(() => []);
    const pauseElapsed = run?.pauseElapsed ?? 0;

    const [flexHeight, setFlexHeight] = useState(0);
    const bands = allocateBands(flexHeight, recipe.pours.length);
    const [firstBrewDone, setFirstBrewDone] = useSetting("firstBrewDone");

    useEffect(() => {
        if (phase.name === "pouring" && !firstBrewDone) setFirstBrewDone(true);
    }, [phase.name, firstBrewDone, setFirstBrewDone]);

    const accent = resolveAccent(recipe);
    const motion = useTraceAnimation(phase.name);
    const running = RUNNING.has(phase.name);

    // The two water events are not the same thing. `blocked` means nothing was
    // sent and the dose is safe; a failure by name means the machine stopped
    // with the dose already spent.
    const blocked = phase.name === "failed" && phase.reason === "blocked";
    const failed = phase.name === "failed" && !blocked;
    const total = localRecipe.pours.reduce((sum, pour) => sum + Math.max(pour.volume, 0), 0);
    const last = samples[samples.length - 1];

    // Only a refusal for water gets the water copy. `block` names which of the
    // pre-flight checks said no, so a busy machine is no longer told to go and
    // fill a tank that is already full.
    const blockKind = phase.name === "failed" ? phase.block : undefined;
    // Water is the default when the kind is missing, so a phase from before
    // `block` existed still reads the way it always did.
    const blockedForWater = blocked && (blockKind ?? "notEnoughWater") === "notEnoughWater";
    // A commanded run that has not moved yet is not finished, which is what
    // "Ready when you are." claimed at the exact moment it had not begun.
    const phaseCopy = phase.name === "idle" && !viewing
        ? PHASE_COPY.connecting
        : PHASE_COPY[phase.name];
    const headline = blocked
        ? (BLOCKED_HEADLINE[blockKind ?? "notEnoughWater"] ?? BLOCKED_WATER_HEADLINE)
        : failed
            ? (FAILURE_COPY[phase.reason] ?? phase.detail ?? "The brew did not start.")
            : phaseCopy;
    const headlineColor = blocked ? palette.warn : failed ? palette.danger : palette.text;
    // The same beat that pulses the plan line. A second progress metaphor
    // would compete with the ladder, and a spinner says "busy" without saying
    // "busy with what".
    const headlineOpacity = WORKING.has(phase.name) ? motion.opacity : 1;
    const offerPro = failed && phase.reason === "rejected" && canOfferProMode();
    const offerRetry = blocked || (failed && !NO_RETRY.has(phase.reason));
    // Blended, not thresholded. `warmth` is how far the line has travelled
    // between the two colours, and grinding beats between 1 and 0.15 — both of
    // which are "greater than zero", so a threshold drew the two halves of the
    // beat identically and the flicker never appeared at all.
    const planColor = mix(palette.muted, accent, motion.warmth);
    const {status, connect} = useMachine();
    const liveIndex = activeIndex !== null && activeIndex < recipe.pours.length
        ? activeIndex : null;
    const livePour = liveIndex === null ? undefined : recipe.pours[liveIndex];
    const resting = livePour !== undefined
        && (stageWater[liveIndex ?? 0] ?? 0) >= Math.max(livePour.volume, 0)
        && pauseSeconds(livePour) > 0;

    return (
        <YStack flex={1} backgroundColor={palette.base} padding="$4" gap="$3">
            {/* The nav row the mockup drew. `brew` is declared in the navigator
                with `headerShown: false`, so this is the only bar. */}
            <XStack alignItems="center" gap="$2">
                <Pressable accessibilityRole="button" accessibilityLabel="Close"
                           onPress={() => router.back()}>
                    <DotIcon name="chevron-down" size={16} color={palette.dim} />
                </Pressable>
                <MachineDot status={status} accent={accent} onPress={() => void connect()} />
                <Text color={palette.dim} fontSize={13} flex={1} numberOfLines={1}>
                    {recipe.displayName()}
                </Text>
                {phase.name === "pouring" && (
                    <DotMatrixText testID="brew-stage-counter" fontSize={12}
                                   weight="bold" letterSpacing={1.4} color={palette.dim}>
                        {`${phase.pour}/${phase.pours}`}
                    </DotMatrixText>
                )}
            </XStack>

            <YStack flex={1} gap="$3"
                    onLayout={(e) => setFlexHeight(e.nativeEvent.layout.height)}>
                <BrewTrace
                    pours={recipe.pours}
                    samples={samples}
                    accent={accent}
                    width={width - SCREEN_PADDING * 2}
                    height={bands.traceHeight}
                    plannedSeconds={plannedSeconds(recipe.pours)}
                    holding={holding}
                    planOpacity={motion.opacity}
                    planColor={planColor}
                    planDashed={motion.dashed}
                    planHeadAt={motion.headAt}
                />

                <BrewStageLadder
                    pours={recipe.pours}
                    accent={accent}
                    activeIndex={activeIndex}
                    barHeight={bands.barHeight}
                    rungGap={bands.rungGap}
                    scrolls={bands.scrolls}
                    stageWater={stageWater}
                    stalls={stalls}
                    pauseElapsed={pauseElapsed}
                />
            </YStack>

            <BrewFigures
                water={last?.water ?? 0}
                cup={last?.cup ?? 0}
                seconds={elapsed}
                accent={accent}
            />

            <BrewNowCard pour={livePour} accent={accent} resting={resting} />

            <DotMatrixText fontSize={14} weight="bold" letterSpacing={1.8}
                           color={headlineColor} style={{opacity: headlineOpacity}}>
                {headline}
            </DotMatrixText>

            {blocked && (
                <Text color={palette.warn} fontSize={13}>
                    {/* The water sentence names the recipe's own volume and
                        promises the dose is safe. Every other refusal already
                        arrives as a sentence from the machine. */}
                    {blockedForWater
                        ? blockedWaterCopy(total)
                        : (phase.name === "failed" ? phase.detail : undefined)
                          ?? "The machine would not take this brew."}
                </Text>
            )}

            {!firstBrewDone && running && (
                <Text color={palette.warn} fontSize={13}>{FIRST_BREW_REMINDER}</Text>
            )}

            {offerPro && <Text color={palette.dim} fontSize={13}>{PRO_MODE_PROMPT}</Text>}
            {/* `error` is the transport channel. When the phase is already a
                failure it is restating it, which is how one refusal came to be
                printed three times. It speaks only about things the phase
                cannot. */}
            {error !== null && phase.name !== "failed" && (
                <Text color={palette.danger} fontSize={13}>{error}</Text>
            )}

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
                        // Through `start`, not `brew`: a retry is a new run,
                        // and only a new run gets a fresh recorder. Retrying
                        // on the spent one brewed a coffee that no history row
                        // ever mentioned.
                        <Action label="Try again" color={palette.text}
                                onPress={() => start(recipe)} />
                    )}
                    {offerPro && (
                        <Action label="Switch to PRO" color={palette.warn}
                                onPress={() => startInPro(recipe)} />
                    )}
                    {phase.name === "done" && (
                        <Action label="Export this brew" color={palette.dim}
                                onPress={() => router.push("/brewRecord?latest=1")} />
                    )}
                    {/* No DONE. The chevron in the nav row dismisses the modal,
                        and a second control duplicated it — painted in
                        `palette.line`, the hairline colour, which is why it
                        read as disabled. */}
                </YStack>
            )}
        </YStack>
    );
}

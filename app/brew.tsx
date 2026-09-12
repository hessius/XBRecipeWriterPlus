import {router, useLocalSearchParams} from "expo-router";
import React, {useEffect, useState} from "react";
import {Pressable, ScrollView, StyleSheet, useWindowDimensions} from "react-native";
import ViewShot from "react-native-view-shot";
import {Text, XStack, YStack} from "tamagui";

import BrewFigures from "@/components/BrewFigures";
import BrewNowCard from "@/components/BrewNowCard";
import BrewStageLadder from "@/components/BrewStageLadder";
import BrewSummary from "@/components/BrewSummary";
import BrewWakeLock from "@/components/BrewWakeLock";
import ExportButton from "@/components/ExportButton";
import BrewTrace from "@/components/BrewTrace";
import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import MachineDot from "@/components/MachineDot";
import {BLOCKED_HEADLINE, BLOCKED_WATER_HEADLINE, blockedWaterCopy,
        ENDED_ON_MACHINE_NOTE, FAILURE_COPY,
        FIRST_BREW_REMINDER, NO_RETRY, PHASE_COPY, PRO_MODE_PROMPT,
        RUNNING} from "@/constants/brewCopy";
import {mix, palette} from "@/constants/colors";
import {useBrewExport, type BrewExportSource} from "@/hooks/useBrewExport";
import {sharedBrewDatabase, type HistoryStore} from "@/hooks/useBrewHistory";
import {useMachine} from "@/hooks/useMachine";
import {useSetting} from "@/hooks/useSetting";
import {useTraceAnimation} from "@/hooks/useTraceAnimation";
import {useLiveBrew} from "@/hooks/useLiveBrew";
import {resolveAccent} from "@/library/accent";
import {allocateBands} from "@/library/brew/bands";
import {finalOutcome} from "@/library/brew/BrewRecord";
import {pauseSeconds, plannedSeconds} from "@/library/brew/brewShape";
import Recipe from "@/library/Recipe";
import {SCREEN_PADDING} from "@/constants/layout";

const WORKING = new Set(["idle", "waking", "sending"]);

/** Where an export sources its record: the freshest brew in the store. */
type ExportStore = Pick<HistoryStore, "all" | "samples">;

/** The just-finished brew, read from the store on press (not on render). */
function latestExport(store: ExportStore): BrewExportSource | null {
    const latest = store.all()[0];
    if (latest === undefined) return null;
    return {record: latest, samples: store.samples(latest.id)};
}

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

export default function Brew({historyStore}: {historyStore?: ExportStore} = {}) {
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
           error, watch} = useLiveBrew();

    // Tell the provider to start a run for this recipe. `start` is idempotent:
    // if RunOwner is already mounted it replaces `start` with a no-op, so
    // re-mounting this screen while a brew is in flight never commands a second
    // brew (Finding 2).
    useEffect(() => {
        if (!viewing) start(localRecipe);
        // localRecipe and viewing are stable for the life of this screen.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Hold the run open for as long as this screen is showing it, so the
    // stopped-bar countdown cannot clear it while it is being read.
    // watch is stable for the life of the provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => watch(), []);

    // Read display state from the provider's run. The provider owns the single
    // recorder and the single DB write; the screen is a pure reader (Finding 1).
    //
    // The grinding default covers the moment between mounting and `start`
    // taking effect, when the machine has genuinely not said anything yet. It
    // must not be allowed to cover a run that has gone away: that drew a
    // grinding animation for a brew which had already failed.
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
    const motion = useTraceAnimation(phase.name, recipe.grindRPM);
    const running = RUNNING.has(phase.name);

    // The two water events are not the same thing. `blocked` means nothing was
    // sent and the dose is safe; a failure by name means the machine stopped
    // with the dose already spent.
    const blocked = phase.name === "failed" && phase.reason === "blocked";
    const failed = phase.name === "failed" && !blocked;
    // From `recipe`, not `localRecipe`: opened from the mini bar the route
    // carries no recipe at all, and the refusal copy quoted 0 ml.
    const total = recipe.pours.reduce((sum, pour) => sum + Math.max(pour.volume, 0), 0);
    const last = samples[samples.length - 1];

    const bypass = run?.bypass;
    // The scale reports one running total, and the bypass goes onto the same
    // scale — so the last reading is brew water *plus* bypass. The figure has
    // to name the brew water, with the bypass beside it, or a 240 ml recipe
    // reads as having used 245.
    const scaleTotal = last?.water ?? 0;
    const brewWater = Math.max(0, scaleTotal - (bypass?.delivered ?? 0));

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

    // Export mechanics, shared with the record screen so the two look and
    // behave identically. The record is read from the store on press — after
    // the brew has finished and the provider has written it — never on render.
    // The live modal has no record to read yet, so it applies the same rule to
    // the live figures. One definition, two call sites.
    const plannedWater = recipe.pours.reduce(
        (sum, pour) => sum + Math.max(pour.volume, 0), 0
    );
    const {shotRef, shareImage, shareData, busy} = useBrewExport(
        () => latestExport(historyStore ?? sharedBrewDatabase())
    );
    const liveIndex = activeIndex !== null && activeIndex < recipe.pours.length
        ? activeIndex : null;
    const livePour = liveIndex === null ? undefined : recipe.pours[liveIndex];
    const resting = livePour !== undefined
        && (stageWater[liveIndex ?? 0] ?? 0) >= Math.max(livePour.volume, 0)
        && pauseSeconds(livePour) > 0;

    return (
        <YStack flex={1} backgroundColor={palette.base} padding="$4" gap="$3">
            {running && <BrewWakeLock />}
            {/* The nav row the mockup drew. `brew` is declared in the navigator
                with `headerShown: false`, so this is the only bar. */}
            <XStack alignItems="center" gap="$2">
                <Pressable accessibilityRole="button" accessibilityLabel="Close"
                           style={styles.close} onPress={() => router.back()}>
                    <DotIcon name="chevron-down" size={16} color={palette.dim} />
                </Pressable>
                <MachineDot status={status} collapsed={false}
                            onPress={() => void connect()} />
                <DotMatrixText testID="brew-recipe-title" fontSize={13}
                               color={palette.dim} numberOfLines={1}
                               style={{flex: 1}}>
                    {recipe.displayName()}
                </DotMatrixText>
                {phase.name === "pouring" && (
                    <DotMatrixText testID="brew-stage-counter" fontSize={12}
                                   weight="bold" letterSpacing={1.4} color={palette.dim}>
                        {`${phase.pour}/${phase.pours}`}
                    </DotMatrixText>
                )}
            </XStack>

            {phase.name === "done" ? (
                // The finished brew is drawn once, by the shared component, and
                // that same node is what the export captures — so what you see
                // is exactly what leaves the phone. No second screen.
                //
                // Inside a scroller, because the summary draws its ladder at a
                // fixed rung size and so grows with the stage count: a
                // seventeen-stage brew is taller than the modal, and without
                // this the last stages ran off the bottom with no way to reach
                // them. The export buttons stay outside it, pinned below,
                // rather than being scrolled away with the summary.
                //
                // The record screen has done exactly this from the start; only
                // the live modal was missing it.
                <ScrollView testID="done-scroll" style={{flex: 1}}
                            contentContainerStyle={{flexGrow: 1}}>
                <ViewShot ref={shotRef} options={{format: "png", quality: 1}}>
                    <BrewSummary
                        recipeName={recipe.displayName()}
                        hasStream={samples.length > 0}
                        samples={samples}
                        stages={recipe.pours}
                        accent={accent}
                        width={width}
                        plannedSeconds={plannedSeconds(recipe.pours)}
                        water={brewWater}
                        cup={last?.cup ?? 0}
                        seconds={elapsed}
                        activeIndex={activeIndex}
                        stageWater={stageWater}
                        stalls={stalls}
                        note={finalOutcome("done", brewWater, plannedWater)
                            === "endedOnMachine" ? ENDED_ON_MACHINE_NOTE : undefined}
                        stagesUnavailable={false}
                        bypass={bypass}
                    />
                </ViewShot>
                </ScrollView>
            ) : (
                <>
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
                            bypass={bypass}
                        />

                        <BrewStageLadder
                            pours={recipe.pours}
                            accent={accent}
                            activeIndex={activeIndex}
                            barHeight={bands.barHeight}
                            rungGap={bands.rungGap}
                            scrolls={bands.scrolls}
                            fill={true}
                            stageWater={stageWater}
                            stalls={stalls}
                            pauseElapsed={pauseElapsed}
                            bypass={bypass}
                        />
                    </YStack>

                    <BrewFigures
                        water={brewWater}
                        cup={last?.cup ?? 0}
                        seconds={elapsed}
                        accent={accent}
                        bypass={bypass?.delivered}
                    />

                    <BrewNowCard pour={livePour} accent={accent} resting={resting} />
                </>
            )}

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
                        <Action label="Switch to Pro" color={palette.warn}
                                onPress={() => startInPro(recipe)} />
                    )}
                    {phase.name === "done" && (
                        // In place, on the screen you are already on. This used
                        // to push a second /brewRecord screen that drew the
                        // brew again through different components, and that
                        // second drawing was the mangled export.
                        <XStack gap="$3">
                            <ExportButton label="Save as image" busy={busy}
                                          onPress={() => void shareImage()} />
                            <ExportButton label="Export the data" busy={busy}
                                          onPress={() => void shareData()} />
                        </XStack>
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

const CLOSE_ICON = 16;
/** The HIG's smallest comfortable target. */
const TOUCH_TARGET = 44;
const CLOSE_PADDING = (TOUCH_TARGET - CLOSE_ICON) / 2;

const styles = StyleSheet.create({
    /**
     * A 16-point glyph at the top of a modal sheet is a target you miss, and on
     * device this chevron read as broken while dragging the sheet worked.
     *
     * Padded out rather than given `hitSlop`, for the reason `RecipeCard`
     * records: slop on adjacent controls overlaps and the later sibling wins,
     * and the machine dot is right next to this. The negative margins give the
     * padding back to the layout, so the row looks exactly as it did.
     */
    close: {
        padding:     CLOSE_PADDING,
        marginLeft:  -CLOSE_PADDING,
        marginRight: -CLOSE_PADDING
    }
});

import {useLocalSearchParams} from "expo-router";
import router from "@/hooks/steadyRouter";
import React, {useEffect, useState} from "react";
import {KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View}
    from "react-native";
import ViewShot from "react-native-view-shot";
import {Text, XStack, YStack} from "tamagui";

import BrewFigures from "@/components/BrewFigures";
import BrewJudgement from "@/components/BrewJudgement";
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
        FIRST_BREW_REMINDER, LONGEST_ACTIVE_HEADLINE, NO_RETRY, PHASE_COPY,
        PRO_MODE_PROMPT} from "@/constants/brewCopy";
import {mix, palette} from "@/constants/colors";
import {useBrewExport, type BrewExportSource} from "@/hooks/useBrewExport";
import {sharedBrewDatabase, useBrewJudgement, type HistoryStore, type JudgementStore}
    from "@/hooks/useBrewHistory";
import {useMachine} from "@/hooks/useMachine";
import {useSetting} from "@/hooks/useSetting";
import {useBrewHandoff} from "@/hooks/useBrewHandoff";
import BeanNameSheet from "@/components/BeanNameSheet";
import {useTraceAnimation} from "@/hooks/useTraceAnimation";
import {useLiveBrew} from "@/hooks/useLiveBrew";
import {resolveAccent} from "@/library/accent";
import {allocateBands} from "@/library/brew/bands";
import {finalOutcome} from "@/library/brew/BrewRecord";
import {canHandOff, HANDOFF_TARGETS} from "@/library/brew/handoff/targets";
import {handoffCoffee} from "@/library/brew/handoff/backfill";
import {beanNameFromRecipe} from "@/library/brew/handoff/beanName";
import {pauseSeconds, plannedSeconds} from "@/library/brew/brewShape";
import {isActiveBrewPhase} from "@/library/machine/Machine";
import Recipe from "@/library/Recipe";
import {SCREEN_PADDING} from "@/constants/layout";

const WORKING = new Set(["idle", "waking", "sending"]);
export const BREW_BAND_GAP = 13;

/** Where an export sources its record: the freshest brew in the store. */
type ExportStore = Pick<HistoryStore, "all" | "samples"> & Partial<JudgementStore>;

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
    const usableBandHeight = Math.max(0, flexHeight - BREW_BAND_GAP);
    const bands = allocateBands(usableBandHeight, recipe.pours.length);
    const [doneHeight, setDoneHeight] = useState(0);
    const [firstBrewDone, setFirstBrewDone] = useSetting("firstBrewDone");

    useEffect(() => {
        if (phase.name === "pouring" && !firstBrewDone) setFirstBrewDone(true);
    }, [phase.name, firstBrewDone, setFirstBrewDone]);

    const accent = resolveAccent(recipe);
    const motion = useTraceAnimation(phase.name, recipe.grindRPM);
    const running = isActiveBrewPhase(phase);

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
    // Beanconqueror reads the same just-written row the exports do. It is
    // offered here as well as on the record screen because this is the screen
    // the user is on when the cup is poured, and a handoff you have to go
    // looking for in history afterwards is one nobody makes.
    //
    // Its own busy flag, like the record screen's: a share sheet that is open
    // should not grey out a handoff that could still run.
    const [handoffEnabled] = useSetting("beanconquerorHandoff");
    const {send: sendHandoff, busy: handoffBusy} = useBrewHandoff(
        () => latestExport(historyStore ?? sharedBrewDatabase())
    );
    // The machine knows what a pod was and never what a hopper held, so the
    // coffee is only ever a question for a brew that came from beans.
    const [namingBean, setNamingBean] = useState(false);
    const [handoffTarget] = HANDOFF_TARGETS;
    // The verdict goes on the row the run has just written, which is why the id
    // is resolved on press rather than on render: at the moment this screen
    // draws the row may not exist yet, and the finished brew is always the
    // freshest one in the store -- the same rule, and the same reason, as the
    // export above.
    //
    // The store is reached for inside these calls, never in render: opening
    // SQLite while drawing would open it in every test that renders this
    // screen, which is the rule `latestExport` above already follows.
    //
    // The two writes are optional on an injected store so a test that only
    // cares about the trace does not have to grow a judgement fake. The real
    // database has both; a fake that does not simply records nothing.
    const judgementStore: JudgementStore = {
        judge:     (id, verdict) =>
            (historyStore ?? sharedBrewDatabase()).judge?.(id, verdict),
        setPinned: (id, pinned) =>
            (historyStore ?? sharedBrewDatabase()).setPinned?.(id, pinned)
    };
    const judgement = useBrewJudgement(
        () => (historyStore ?? sharedBrewDatabase()).all()[0]?.id ?? null,
        {rating: 0, note: "", pinned: false},
        judgementStore
    );
    const liveIndex = activeIndex !== null && activeIndex < recipe.pours.length
        ? activeIndex : null;
    const livePour = liveIndex === null ? undefined : recipe.pours[liveIndex];
    const resting = livePour !== undefined
        && (stageWater[liveIndex ?? 0] ?? 0) >= Math.max(livePour.volume, 0)
        && pauseSeconds(livePour) > 0;

    return (
        // The finished brew puts a text field at the bottom of a modal, below a
        // scroller that has taken all the height there is -- so on iOS the
        // software keyboard came up over the note being typed into. Android
        // resizes the window under Expo's default
        // `softwareKeyboardLayoutMode: "resize"` and needs nothing, which is
        // why the behaviour is `undefined` there rather than a second
        // adjustment on top of the OS's.
        //
        // Here and not on the scroller: `automaticallyAdjustKeyboardInsets`,
        // the editor's answer, only moves what is inside the scroll view, and
        // the judgement is deliberately outside it -- pinned under the summary
        // rather than scrolled away with it.
        <KeyboardAvoidingView style={{flex: 1, backgroundColor: palette.base}}
                              behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* Hidden from the reader while the bean sheet is up. XbrwSheet is
            not a modal, so on Android `accessibilityViewIsModal` on the sheet
            does not take the screen behind it out of the reader's path. */}
        <YStack flex={1} backgroundColor={palette.base} padding="$4" gap="$3"
                accessibilityElementsHidden={namingBean}
                importantForAccessibility={namingBean ? "no-hide-descendants" : "auto"}>
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
                            onLayout={(e) => setDoneHeight(e.nativeEvent.layout.height)}
                            contentContainerStyle={{flexGrow: 1}}>
                <ViewShot ref={shotRef} options={{format: "png", quality: 1}}>
                    <BrewSummary
                        recipeName={recipe.displayName()}
                        hasStream={samples.length > 0}
                        samples={samples}
                        stages={recipe.pours}
                        accent={accent}
                        // The summary sits inside this screen's own padding,
                        // so the width it may draw in is not the window's.
                        // Handed the window width it laid its trace out 36
                        // points too wide: it overflowed right, read as
                        // off-centre, and clipped the trace's right-aligned
                        // overrun label. The export is unaffected — ViewShot
                        // takes the capture's width from its parent, and this
                        // prop only sizes the trace inside it.
                        width={width - SCREEN_PADDING * 2}
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
                        availableHeight={doneHeight}
                    />
                </ViewShot>
                </ScrollView>
            ) : (
                <>
                    <YStack testID="brew-band-region" flex={1} gap={BREW_BAND_GAP}
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

                            {/* Held for the whole run. Between the last pour and the
                        summary there is no live stage, and a card that
                        unmounts there gives its height back to the band
                        region above — redrawing the ladder mid-brew. */}
                    <BrewNowCard pour={livePour} accent={accent} resting={resting}
                                 hold={running} />
                </>
            )}

            <PhaseHeadline text={headline} color={headlineColor}
                           opacity={headlineOpacity} reserve={running} />

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
                        // Outside the ViewShot, deliberately. The capture is the
                        // same node the screen draws, so anything put inside it
                        // is in every PNG anybody shares, and an empty row of
                        // stars in a shared image is an invitation to rate
                        // somebody else's brew.
                        //
                        // Here rather than only on the record screen because
                        // this is the moment the user is holding the cup, and a
                        // rating that can only be given from a history screen is
                        // a rating nobody gives.
                        <BrewJudgement rating={judgement.rating} note={judgement.note}
                                       onRate={judgement.rate}
                                       onNote={judgement.annotate}/>
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
                    {phase.name === "done" && handoffEnabled
                        && canHandOff(finalOutcome("done", brewWater, plannedWater)) && (
                        // Read through `canHandOff` rather than assumed from
                        // the phase. Reaching "done" today means one of the two
                        // outcomes that may be handed over, but the rule for
                        // that lives in one place and this screen asks it the
                        // same question the record screen does.
                        //
                        // A full row of its own for the same reason as there:
                        // at Doto's 1.4x accessibility scale the Beanconqueror
                        // label cannot share a split with the two exports.
                        <XStack>
                            <ExportButton label={handoffTarget.buttonLabel}
                                          busy={handoffBusy}
                                          onPress={() => {
                                              const source = latestExport(
                                                  historyStore ?? sharedBrewDatabase()
                                              );
                                              if (source == null
                                                  || handoffCoffee(source.record, recipe) === undefined) {
                                                  setNamingBean(true);
                                                  return;
                                              }
                                              void sendHandoff();
                                          }} />
                        </XStack>
                    )}
                    {/* No DONE. The chevron in the nav row dismisses the modal,
                        and a second control duplicated it — painted in
                        `palette.line`, the hairline colour, which is why it
                        read as disabled. */}
                </YStack>
            )}
        </YStack>

        <BeanNameSheet open={namingBean} onOpenChange={setNamingBean}
                       suggestion={beanNameFromRecipe(recipe.name) ?? ""}
                       onConfirm={(name) => void sendHandoff(name)} />
        </KeyboardAvoidingView>
    );
}

/**
 * The phase line, holding the tallest running sentence while a brew is live.
 *
 * It is a sibling of the measured band region, so a phase whose copy wraps to
 * a second line takes that height out of the ladder and changes every rung's
 * thickness mid-brew. Reserved only while running: a terminal sentence may
 * legitimately be taller than any running one, and by then the screen is
 * changing anyway.
 */
function PhaseHeadline({text, color, opacity, reserve}: {
    text: string; color: string; opacity: number; reserve: boolean;
}) {
    const line = (
        <DotMatrixText testID="brew-headline" fontSize={14} weight="bold"
                       letterSpacing={1.8} color={color} style={{opacity}}>
            {text}
        </DotMatrixText>
    );
    if (!reserve) return line;
    return (
        <View>
            <View accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants">
                <DotMatrixText testID="brew-headline-reserve" fontSize={14}
                               weight="bold" letterSpacing={1.8} color={color}
                               style={{opacity: 0}}>
                    {LONGEST_ACTIVE_HEADLINE}
                </DotMatrixText>
            </View>
            <View style={{position: "absolute", top: 0, left: 0, right: 0}}>
                {line}
            </View>
        </View>
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

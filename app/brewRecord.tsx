import {useLocalSearchParams} from "expo-router";
import router from "@/hooks/steadyRouter";
import React, {useRef, useState} from "react";
import {ScrollView, useWindowDimensions} from "react-native";
import ViewShot from "react-native-view-shot";
import {Text, XStack, YStack} from "tamagui";

import BrewJudgement from "@/components/BrewJudgement";
import BrewSummary from "@/components/BrewSummary";
import StageDetail from "@/components/StageDetail";
import DotMatrixText from "@/components/DotMatrixText";
import * as Clipboard from "expo-clipboard";

import ExportButton from "@/components/ExportButton";
import LinkText from "@/components/LinkText";
import {notify} from "@/components/XbrwToast";
import ScreenHeader from "@/components/ScreenHeader";
import {ENDED_ON_MACHINE_NOTE} from "@/constants/brewCopy";
import {palette} from "@/constants/colors";
import {useBrewExport} from "@/hooks/useBrewExport";
import {useBrewHandoff} from "@/hooks/useBrewHandoff";
import {sharedBrewDatabase, useBrewHistory, useBrewJudgement, type JudgementStore}
    from "@/hooks/useBrewHistory";
import {useSetting} from "@/hooks/useSetting";
import {bypassViewFromRecord} from "@/library/brew/bypassState";
import {formatBrewDate, formatBrewTime} from "@/library/brew/brewFormat";
import {poursFromPlan} from "@/library/brew/BrewRecord";
import {canHandOff, HANDOFF_ENABLED, HANDOFF_TARGETS} from "@/library/brew/handoff/targets";
import {ladderFrontier} from "@/library/brew/ladderState";
import {plannedSeconds} from "@/library/brew/brewShape";
import RecipeDatabase from "@/library/RecipeDatabase";
import type Recipe from "@/library/Recipe";
import {SCREEN_PADDING} from "@/constants/layout";

/** Minimal interface for looking up a recipe. Injected by tests. */
export type RecipeLookup = {getRecipe: (uuid: string) => Recipe | null};

let sharedLookup: RecipeLookup | undefined;
/**
 * Put the machine's own account of this brew on the clipboard.
 *
 * Raw frames rather than a summary: the whole point of keeping them is that
 * nobody knew in advance which byte would matter, and a report of a machine
 * that behaved impossibly is only worth anything if it carries what the
 * machine actually said.
 */
function copyFrames(frames: string): void {
    void Clipboard.setStringAsync(frames).then(() => notify({
        tone:    "success",
        message: "Frame log copied"
    }));
}

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
    const [recordHeight, setRecordHeight] = useState(0);
    const scroller = useRef<ScrollView>(null);

    // The same seven-tap gate the machine console and the card diagnostics
    // ride on. Read here rather than beside the button because it is a hook
    // and the "brew not found" return below is earlier.
    const [consoleFound] = useSetting("machineConsoleAcknowledged");

    // Cleared before the PNG is taken. A shaded band and a tinted rung are
    // answers to a tap, and a picture cannot be tapped: baked in they would
    // read as the brew itself having done something odd at that stage.
    const {shotRef, shareImage, shareData, busy} = useBrewExport(
        () => opened,
        async () => {
            setSelectedIndex(null);
            // Back to the top as well: with the panel gone the summary fits
            // again, and capturing it while scrolled part-way off the screen is
            // how a capture comes out clipped.
            scroller.current?.scrollTo({y: 0, animated: false});
        }
    );
    // Handoff opens Beanconqueror directly and keeps its own in-flight guard.
    // The share exports are separate actions with separate state, so one busy
    // export should not disable a different handoff path that can still run.
    const {send: sendHandoff, busy: handoffBusy} = useBrewHandoff(() => opened);

    // Seeded from the record that is already in memory, so the screen shows
    // the verdict the user gave at the end of the brew rather than an empty
    // row. Optional writes for the same reason the brew screen has them: an
    // injected store need not grow a judgement fake to draw a trace.
    const judgementStore: JudgementStore = {
        judge: (id, verdict) =>
            (sharedBrewDatabase() as Partial<JudgementStore>).judge?.(id, verdict),
        setPinned: (id, pinned) =>
            (sharedBrewDatabase() as Partial<JudgementStore>).setPinned?.(id, pinned)
    };
    const judgement = useBrewJudgement(
        () => opened?.record.id ?? null,
        {
            rating: opened?.record.rating ?? 0,
            note:   opened?.record.note ?? "",
            pinned: opened?.record.pinned ?? false
        },
        judgementStore
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
    // The record screen renders the first target only; adding a second target
    // means revisiting this selection rather than assuming it appears here.
    const [handoffTarget] = HANDOFF_TARGETS;
    const showHandoff = HANDOFF_ENABLED && canHandOff(record.outcome);
    // `?? ""` because a record opened before the frame log existed — and any
    // stand-in for the store — simply has no log, which is a brew with nothing
    // to copy rather than an error.
    const frames = opened.frames ?? "";
    const accent = record.accent;

    // Measured from the first drop, because that is where the sample stream is
    // zeroed. From `startedAt` the axis would also carry waking and grinding,
    // against which the trace — which knows nothing of them — would be drawn
    // short. Older rows have no `pouringAt` and fall back to the old meaning.
    const zero = (record.pouringAt ?? 0) > 0 ? record.pouringAt! : record.startedAt;
    const durationSeconds = (record.endedAt - zero) / 1000;

    // The record's own plan, or the live recipe for rows written before brews
    // kept one. A snapshot is preferred even when the recipe still exists: it
    // is what was actually brewed, and the recipe may have been edited since.
    // A brew a person logged by hand. The machine never saw it, so there is
    // no trace, no figure and no stage: only a name, a date and whatever the
    // user said about it. Falling through to the summary would draw the
    // recipe's pours as though they had been poured and noughts where the
    // scale should be, putting a brew on the screen that never happened.
    const watched = record.watched !== false;

    const snapshot = poursFromPlan(record.plan);
    const stages = snapshot.length > 0 ? snapshot : recipe?.pours ?? [];

    // Read off the stages, not inferred from the clock. `heldSeconds` is only
    // the overrun, and it is clamped at zero, so subtracting it from the run
    // returns the plan's length for a brew that overran and the *run's* length
    // for one that ended early, stalled, or merely drifted -- drawing the plan
    // line short or long against stages that say otherwise. Only a row with
    // neither a snapshot nor a surviving recipe still has to guess.
    const plannedSecs = stages.length > 0
        ? plannedSeconds(stages)
        : Math.max(0, durationSeconds - record.heldSeconds);
    // Falling back to the plan means claiming every stage poured, which is
    // what it always did and is only ever right for a brew that finished.
    const delivered = record.stageWater
        ?? stages.map((pour) => Math.max(pour.volume, 0));

    const bypass = bypassViewFromRecord(record.bypass);
    // The scale's running total includes the bypass, so the brew water is the
    // total less what the bypass put in. Same reasoning as the live screen.
    const brewWater = Math.max(0, record.waterTotal - (bypass?.delivered ?? 0));

    return (
        <YStack flex={1} backgroundColor={palette.base} gap="$2">
            {/* Titled "Brew", not with the recipe's name: `BrewSummary` draws
                that name immediately below, and it has to, because the capture
                needs it. A header repeating it would say the same word twice in
                two fonts. The date says the thing the name cannot — which brew
                of that recipe this is. */}
            <ScreenHeader
                title="Brew"
                meta={`${formatBrewDate(record.startedAt)} · ${formatBrewTime(record.startedAt)}`}
                onBack={() => router.back()}
            />
            {/* Everything worth sharing sits inside the ViewShot: the recipe
                name, the trace, the figures and the stage ladder. BrewSummary
                owns its own background and padding, because a capture inherits
                neither margin nor background from its ancestors. */}
            {/* The screen scrolls, because an open stage detail is taller than
                what is left below the figures and there was otherwise no way to
                read the end of it. */}
            <ScrollView ref={scroller} testID="record-scroll"
                        onLayout={(e) => setRecordHeight(e.nativeEvent.layout.height)}
                        // The note field is low in this scroller, so iOS grows
                        // the bottom inset by the keyboard's height and scrolls
                        // it clear instead of typing behind the keys. The same
                        // prop the editor uses, for the same field at the same
                        // end of the same kind of screen. Android resizes the
                        // window and needs nothing.
                        automaticallyAdjustKeyboardInsets
                        // A tap on a star while the keyboard is up rates the
                        // brew rather than being eaten by the dismiss.
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={{paddingBottom: 24, gap: 8}}>
            {watched ? (
                <ViewShot ref={shotRef} options={{format: "png", quality: 1}}>
                    <BrewSummary
                        recipeName={record.recipeName}
                        hasStream={record.hasStream}
                        samples={samples}
                        stages={stages}
                        accent={accent}
                        width={width}
                        plannedSeconds={plannedSecs}
                        water={brewWater}
                        cup={record.cupTotal}
                        seconds={durationSeconds}
                        activeIndex={ladderFrontier(record.outcome, delivered)}
                        stageWater={delivered}
                        stalls={record.stalls ?? stages.map(() => [])}
                        note={record.outcome === "endedOnMachine"
                            ? ENDED_ON_MACHINE_NOTE : undefined}
                        stagesUnavailable={snapshot.length === 0 && recipe === null}
                        // `busy` is set synchronously at the press, before the
                        // paint the export waits for, so the name is already
                        // parked at its start by the time the shutter falls.
                        nameStill={busy}
                        selectedIndex={selectedIndex}
                        onSelectStage={(index) =>
                            setSelectedIndex((was) => (was === index ? null : index))}
                        bypass={bypass}
                        availableHeight={recordHeight}
                    />
                </ViewShot>
            ) : (
                <YStack paddingHorizontal={SCREEN_PADDING} gap="$2">
                    <DotMatrixText fontSize={20} weight="bold" letterSpacing={1.4}
                                   color={palette.text}>
                        {record.recipeName}
                    </DotMatrixText>
                    <DotMatrixText testID="record-not-watched" fontSize={13}
                                   weight="bold" letterSpacing={1.6}
                                   color={palette.muted}>
                        NOT WATCHED
                    </DotMatrixText>
                </YStack>
            )}

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

            {/* Outside the ViewShot, like its twin on the live screen: the
                capture is a picture of what the machine did, and a control
                inside it would be in every PNG anybody shares. */}
            <YStack paddingHorizontal={SCREEN_PADDING} gap="$2">
                <BrewJudgement rating={judgement.rating} note={judgement.note}
                               onRate={judgement.rate}
                               onNote={judgement.annotate}/>
                {judgement.pinned && (
                    // The pin as a state rather than a question. It is set by
                    // judging, so the user is told what happened and offered
                    // the way out, instead of being asked twice whether a brew
                    // they just rated is worth keeping.
                    <XStack alignItems="center" justifyContent="space-between">
                        <DotMatrixText testID="record-pinned" fontSize={11}
                                       letterSpacing={1.4} color={palette.dim}>
                            KEPT THROUGH THE SWEEP
                        </DotMatrixText>
                        <Pressable testID="record-release"
                                   accessibilityRole="button"
                                   accessibilityLabel="Let this brew expire with the rest"
                                   hitSlop={8}
                                   onPress={() => judgement.setPinned(false)}>
                            <DotMatrixText fontSize={11} letterSpacing={1.4}
                                           color={palette.muted}>
                                RELEASE
                            </DotMatrixText>
                        </Pressable>
                    </XStack>
                )}
            </YStack>

            {/* Nothing to picture and no stream to hand over: both exports
                would return an empty file for a brew the app never watched. */}
            {watched && (
                <YStack gap="$2" paddingHorizontal={SCREEN_PADDING}>
                    <XStack gap="$3">
                        <ExportButton label="Save as image" busy={busy}
                                      onPress={() => void shareImage()} />
                        <ExportButton label="Export the data" busy={busy}
                                      onPress={() => void shareData()} />
                    </XStack>
                    {showHandoff && (
                        // At Doto's maximum 1.4x accessibility scale, the
                        // Beanconqueror label cannot share a three-way split
                        // with the two exports; a full row gives it width.
                        <XStack>
                            <ExportButton label={handoffTarget.buttonLabel}
                                          busy={handoffBusy}
                                          onPress={() => void sendHandoff()} />
                        </XStack>
                    )}
                    {showHandoff && (
                        <LinkText label={handoffTarget.credit}
                                  url={handoffTarget.siteUrl}
                                  accessibilityLabel={handoffTarget.siteAccessibilityLabel}
                                  fontSize={12}
                                  textAlign="center"
                                  alignItems="center" />
                    )}
                </YStack>
            )}
            {/* Only when there is one to copy, and only for someone who has
                found the machine console. A brew recorded before this existed,
                or one whose log the retention sweep has taken, would otherwise
                offer a copy that yields an empty clipboard — which reads as the
                app having lost it rather than never having had it. And a raw
                frame log means nothing to anyone who is not debugging the
                machine, so it rides the same seven-tap gate as the rest of the
                diagnostics rather than sitting in everyone's way. */}
            {frames.length > 0 && consoleFound && (
                <XStack paddingHorizontal={SCREEN_PADDING}>
                    <ExportButton label="Copy the frame log" busy={false}
                                  onPress={() => copyFrames(frames)} />
                </XStack>
            )}
            </ScrollView>
        </YStack>
    );
}

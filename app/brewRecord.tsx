import {useLocalSearchParams} from "expo-router";
import router from "@/hooks/steadyRouter";
import React, {useState} from "react";
import {PixelRatio, Pressable, ScrollView, useWindowDimensions} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import BrewJudgement from "@/components/BrewJudgement";
import {brewFigureAdjustmentMeasures, type BrewFigureAdjustments} from "@/components/BrewFigures";
import BrewStoryCard from "@/components/BrewStoryCard";
import BrewStorySheet from "@/components/BrewStorySheet";
import BrewSummary from "@/components/BrewSummary";
import CompareWithSheet from "@/components/CompareWithSheet";
import StageDetail from "@/components/StageDetail";
import DotMatrixText from "@/components/DotMatrixText";

import ExportButton from "@/components/ExportButton";
import ScreenHeader from "@/components/ScreenHeader";
import {palette} from "@/constants/colors";
import {useBrewExport} from "@/hooks/useBrewExport";
import {useBrewRecordHandoff} from "@/hooks/useBrewRecordHandoff";
import {useLiveBrew} from "@/hooks/useLiveBrew";
import BeanNameSheet from "@/components/BeanNameSheet";
import BrewNoteSheet from "@/components/BrewNoteSheet";
import {beanNameFromRecipe} from "@/library/brew/handoff/beanName";
import {sharedBrewDatabase, useBrewHistory, useBrewJudgement, type JudgementStore}
    from "@/hooks/useBrewHistory";
import {useSetting} from "@/hooks/useSetting";
import {bypassViewFromRecord} from "@/library/brew/bypassState";
import {formatBrewDate, formatBrewTime} from "@/library/brew/brewFormat";
import {brewFigures} from "@/library/brew/brewFigures";
import {poursFromPlan} from "@/library/brew/BrewRecord";
import {dialNote, type GrindFigure} from "@/library/brew/dialAfterBrew";
import {drawdownFigures, retrospectiveFlowSeries} from "@/library/brew/flowRate";
import {hasDrawableRateRun} from "@/library/brew/rateChartGeometry";
import {canHandOff, HANDOFF_TARGETS} from "@/library/brew/handoff/targets";
import {ladderFrontier} from "@/library/brew/ladderState";
import {
    offeredStoryContent,
    storyCoffeeLine,
    storyContentFacts,
    storyChartWidth,
    storyHiddenFromSetting,
    storyHiddenToSetting,
    storySummaryBudget,
    storyTextContentWidth,
    storyTextScale,
    type StoryContentKey
} from "@/library/brew/storyCard";
import {plannedSeconds, pourEndDelaySeconds} from "@/library/brew/brewShape";
import {brewFigureAdjustmentLayout} from "@/library/brew/figureGeometry";
import RecipeDatabase from "@/library/RecipeDatabase";
import type Recipe from "@/library/Recipe";
import {RECORD_ACTION_GAP, SCREEN_PADDING} from "@/constants/layout";
import type {StoredBrew} from "@/library/BrewDatabase";
import {HANDOFF_ALREADY_SENT, ENDED_ON_MACHINE_NOTE, pausedNote}
    from "@/constants/brewCopy";

/** Minimal interface for looking up a recipe. Injected by tests. */
export type RecipeLookup = {getRecipe: (uuid: string) => Recipe | null};

let sharedLookup: RecipeLookup | undefined;

const JUDGEMENT_ACTION_GAP = "$4";

function quickEditFigures(
    record: StoredBrew,
    grind: GrindFigure | null
): BrewFigureAdjustments | undefined {
    const adjustments: BrewFigureAdjustments = {};

    if (record.adjustedFromDose !== undefined && record.dose !== undefined) {
        adjustments.dose = {value: record.dose, from: record.adjustedFromDose};
    }

    if (record.adjustedFromRatio !== undefined && record.ratio !== undefined) {
        adjustments.ratio = {value: record.ratio, from: record.adjustedFromRatio};
    }
    if (record.adjustedFromGrind !== undefined && record.grindSize !== undefined) {
        adjustments.grind = {
            value:     record.grindSize,
            from:      record.adjustedFromGrind,
            confirmed: grind?.kind === "recipe" ? false : undefined
        };
    }
    const tempOffset = record.adjustedTempOffset;
    if (tempOffset !== undefined) {
        const temperatures = record.plan?.map((stage) => stage.temperature) ?? [];
        if (temperatures.length > 0) {
            adjustments.temperature = {offset: tempOffset, temperatures};
        }
    }

    return Object.keys(adjustments).length === 0 ? undefined : adjustments;
}

type RecordAction = {
    key: "handoff" | "export" | "compare" | "story";
    label: string;
    busy: boolean;
    accessibilityLabel?: string;
    wide?: boolean;
    onPress: () => void;
};

type RecordActionPair = readonly [RecordAction | null, RecordAction | null];

const STORY_TOGGLE_LABELS: Record<StoryContentKey, string> = {
    coffee:  "COFFEE",
    rating:  "RATING",
    tags:    "TAGS",
    note:    "NOTE",
    details: "DETAILS",
    flow:    "FLOW"
};

function storyGrindForBudget(
    grind: GrindFigure | null,
    showRecipeBadge: boolean
): GrindFigure | null {
    if (showRecipeBadge || grind === null || grind.kind !== "dial") return grind;
    return {...grind, recipe: null};
}

function RecordActionRows(
    {pairs, halfWidth, fullWidth, accent}: {
        pairs: readonly RecordActionPair[];
        halfWidth: number;
        fullWidth: number;
        accent: string;
    }
) {
    const rows: React.ReactNode[] = [];
    for (const pair of pairs) {
        const actions = pair.filter((action): action is RecordAction => action !== null);
        if (actions.length === 0) continue;

        for (const action of actions.filter((item) => item.wide)) {
            rows.push(
                <XStack key={`${action.key}-wide`} testID="record-action-row">
                    <YStack testID={`record-action-${action.key}`} width={fullWidth}>
                        <ExportButton
                            testID={`record-action-${action.key}-button`}
                            label={action.label}
                            busy={action.busy}
                            accent={accent}
                            accessibilityLabel={action.accessibilityLabel}
                            onPress={action.onPress}
                        />
                    </YStack>
                </XStack>
            );
        }

        const regular = actions.filter((item) => !item.wide);
        if (regular.length === 0) continue;
        rows.push(
            <XStack key={regular.map((action) => action.key).join("-")}
                    testID="record-action-row" gap={RECORD_ACTION_GAP}>
                {regular.map((action) => (
                    <YStack key={action.key} testID={`record-action-${action.key}`}
                            width={halfWidth}>
                        <ExportButton
                            testID={`record-action-${action.key}-button`}
                            label={action.label}
                            busy={action.busy}
                            accent={accent}
                            accessibilityLabel={action.accessibilityLabel}
                            onPress={action.onPress}
                        />
                    </YStack>
                ))}
            </XStack>
        );
    }
    return <>{rows}</>;
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
    // of kilobytes. Doing it in render causes re-parsing on every rotation.
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

    // Export mechanics live in the hook shared with the live brew modal. The
    // record screen only uses the data export now; the image path remains for
    // the live modal and the story card.
    // The stage whose detail is open, or null for none.
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [recordHeight, setRecordHeight] = useState(0);

    const [handoffEnabled] = useSetting("beanconquerorHandoff");
    const [storyCardHidden, setStoryCardHidden] = useSetting("storyCardHidden");
    const {ratingNoteOpen} = useLiveBrew();

    const {shareData, busy} = useBrewExport(() => opened);
    // The machine knows what a pod was and never what a hopper held, so the
    // coffee is only ever a question for a brew that came from beans. Asked
    // here and not in the batch path: once is a courtesy, once per brew across
    // a selection is a questionnaire.
    const [pickingComparison, setPickingComparison] = useState(false);
    const [storyOpen, setStoryOpen] = useState(false);
    // A second export, not a second mechanism. The story card is a different
    // composition at a different ratio and so needs a capture target of its
    // own, but it shares the guard, the filename and the share sheet by
    // joining the same hook.
    const story = useBrewExport(() => opened);
    const [comparisonCandidates, setComparisonCandidates] = useState<StoredBrew[]>([]);

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
    const handoff = useBrewRecordHandoff(opened, recipe, judgement);

    // No "All brews" control. The list is the only way in here, so it sat
    // beside a back chevron that already went to exactly the same screen,
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
    const showHandoff = handoffEnabled && canHandOff(record.outcome);
    const accent = record.accent;

    // Measured from the first drop, because that is where the sample stream is
    // zeroed. From `startedAt` the axis would also carry waking and grinding,
    // against which the trace, which knows nothing of them, would be drawn
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
    const hasComparisonCandidate = brews.some(
        (brew) => brew.recipeUuid === record.recipeUuid && brew.id !== record.id
    );
    const figures = brewFigures(record);
    const drawdown = drawdownFigures(record);
    const grind = dialNote(record);
    const adjustments = quickEditFigures(record, grind);
    const summaryGrind = adjustments?.grind?.confirmed === false ? null : grind;

    function openComparisonPicker(): void {
        const candidates = sharedBrewDatabase()
            .brewsFor(record.recipeUuid)
            .filter((brew) => brew.id !== record.id);
        setComparisonCandidates(candidates);
        setPickingComparison(true);
    }

    function compareWith(candidateId: string): void {
        const other = comparisonCandidates.find((candidate) => candidate.id === candidateId);
        if (other === undefined) return;
        setPickingComparison(false);
        setComparisonCandidates([]);
        // The brew you came from leads, whether it is the older of the two or
        // not. Arriving here you were already looking at one brew, and having
        // it turn grey because the one you picked happened to be newer would
        // answer a question you did not ask. The history door sorts instead,
        // because arriving from a list you came from neither.
        router.push({pathname: "/brewCompare", params: {a: record.id, b: other.id}});
    }

    function closeComparisonPicker(): void {
        setPickingComparison(false);
        setComparisonCandidates([]);
    }

    const screenCovered = handoff.namingBean || handoff.ratingBeforeSend || pickingComparison
        || ratingNoteOpen || storyOpen;

    // The one description of this brew, given to both drawings of it. The
    // record screen adds its width, its measured height and its taps; the
    // story card adds its own width and nothing else. Neither works the
    // figures out a second time.
    const summary = {
        recipeName:        record.recipeName,
        hasStream:         record.hasStream,
        samples,
        stages,
        accent,
        plannedSeconds:    plannedSecs,
        water:             brewWater,
        cup:               record.cupTotal,
        seconds:           durationSeconds,
        activeIndex:       ladderFrontier(record.outcome, delivered),
        stageWater:        delivered,
        stalls:            record.stalls ?? stages.map(() => []),
        // A paused brew's clock runs long and its trace holds a flat stretch
        // nothing else on the screen accounts for. Ending on the machine is
        // the louder fact, so it keeps the slot where both are true.
        note:              record.outcome === "endedOnMachine"
            ? ENDED_ON_MACHINE_NOTE
            : pausedNote(record.pausedSeconds),
        stagesUnavailable: snapshot.length === 0 && recipe === null,
        bypass,
        drawdown:          drawdown?.seconds ?? null,
        drawdownRate:      drawdown?.rate ?? null,
        rateSeries:        record.hasStream && samples.length > 0
            ? retrospectiveFlowSeries(samples, record.pours)
            : [],
        delay:             pourEndDelaySeconds(
            durationSeconds,
            drawdown?.seconds ?? null,
            plannedSecs,
            record.pausedSeconds ?? 0
        ),
        grind:             summaryGrind,
        adjustments
    };
    const hasStoryRateChart = hasDrawableRateRun(summary.rateSeries);
    const hasStoryDetails = [
        summary.drawdown !== null,
        summary.delay !== null,
        summary.grind !== null,
        summary.adjustments !== undefined
    ].some(Boolean);
    const storyFigureDetailRows = ([
        summary.drawdown !== null || summary.delay !== null || summary.grind !== null
    ].filter(Boolean)).length;
    const storyFacts = storyContentFacts({
        hasRateChart:   hasStoryRateChart,
        hasCoffee:      storyCoffeeLine(record) !== null,
        hasRating:      judgement.rating > 0,
        tags:           record.tags ?? [],
        hasSummaryNote: summary.note !== undefined,
        figureExtraRows: storyFigureDetailRows,
        figureAdjustmentRows: summary.adjustments === undefined ? 0 : 1
    });
    const storyHidden = storyHiddenFromSetting(storyCardHidden);
    function storyContentRequested(key: StoryContentKey): boolean {
        return !storyHidden.has(key);
    }
    function toggleStoryContent(key: StoryContentKey) {
        const next = storyHiddenFromSetting(storyCardHidden);
        if (next.has(key)) {
            next.delete(key);
        } else {
            next.add(key);
        }
        setStoryCardHidden(storyHiddenToSetting(next));
    }
    const storyCoffee = storyContentRequested("coffee") ? storyCoffeeLine(record) : null;
    const storyRating = storyContentRequested("rating") ? judgement.rating : 0;
    const storyTags = storyContentRequested("tags") ? record.tags ?? [] : [];
    const storyHasNote = summary.note !== undefined && storyContentRequested("note");
    const storyHasDetails = hasStoryDetails && storyContentRequested("details");
    const storyHasRateChart = hasStoryRateChart && storyContentRequested("flow");
    const actionFullWidth = Math.max(0, width - SCREEN_PADDING * 2);
    const actionHalfWidth = Math.max(0, (actionFullWidth - RECORD_ACTION_GAP) / 2);
    // COMPARE and the Beanconqueror handoff each keep a full width row, then
    // the two short output actions pair. Doto Bold at 11 pt and the bounded
    // 1.4 font scale measures SEND TO BEANCONQUEROR at 226.04 pt. On a 320 pt
    // screen the two up slot is 135.5 pt, so the handoff cannot share a row.
    // Missing full width actions are skipped, leaving EXPORT THE DATA and
    // SHARE STORY together whenever both are present.
    const compareAction: RecordAction | null = hasComparisonCandidate ? {
        key:                "compare",
        label:              "Compare",
        busy:               false,
        accessibilityLabel: "Compare with another brew",
        wide:               true,
        onPress:            openComparisonPicker
    } : null;
    const handoffAction: RecordAction | null = showHandoff ? {
        key:   "handoff",
        label: handoffTarget.buttonLabel,
        busy:  handoff.busy,
        wide:  true,
        onPress: handoff.requestSend
    } : null;
    const actionPairs: RecordActionPair[] = [
        [compareAction, null],
        [handoffAction, null],
        [
            {
                key:   "export",
                label: "Export the data",
                busy,
                onPress: () => void shareData()
            },
            {
                key:                "story",
                label:              "Share story",
                busy:               story.busy,
                accessibilityLabel: "Share this brew as a story card",
                onPress:            () => setStoryOpen(true)
            }
        ]
    ];

    return (
        <YStack flex={1} backgroundColor={palette.base}>
            {/* Hidden from a screen reader while the bean sheet is up. A
                Tamagui sheet renders as a sibling on Android and isolates
                nothing on its own, so the screen underneath stays reachable
                unless it is hidden from here. The sheet sits outside this
                subtree so it never hides itself. */}
            <YStack flex={1} gap="$2" testID="brew-record-content"
                    accessibilityElementsHidden={screenCovered}
                    importantForAccessibility={screenCovered ? "no-hide-descendants" : "auto"}>
            {/* Titled "Brew", not with the recipe's name: `BrewSummary` draws
                that name immediately below, and it has to, because the capture
                needs it. A header repeating it would say the same word twice in
                two fonts. The date says the thing the name cannot: which brew
                of that recipe this is. */}
            <ScreenHeader
                title="Brew"
                meta={`${formatBrewDate(record.startedAt)} · ${formatBrewTime(record.startedAt)}`}
                onBack={() => router.back()}
            />
            {/* BrewSummary owns its own background and padding because the
                story card still captures the same subtree at a different
                ratio. */}
            {/* The screen scrolls, because an open stage detail is taller than
                what is left below the figures and there was otherwise no way to
                read the end of it. */}
            <ScrollView testID="record-scroll"
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
                <BrewSummary
                    {...summary}
                    width={width}
                    selectedIndex={selectedIndex}
                    onSelectStage={(index) =>
                        setSelectedIndex((was) => (was === index ? null : index))}
                    availableHeight={recordHeight}
                />
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

            {/* Outside the summary: a judgement is about the finished cup, not
                part of the machine trace or figures. */}
            <YStack paddingHorizontal={SCREEN_PADDING} gap="$2"
                    marginBottom={JUDGEMENT_ACTION_GAP}>
                <BrewJudgement rating={judgement.rating} note={judgement.note}
                               onRate={handoff.rateBrew}
                               onNote={handoff.annotateBrew}
                               onNoteDraft={handoff.setNoteDraft}/>
                {judgement.pinned && (
                    // The pin as a state rather than a question. It is set by
                    // judging, so the user is told what happened and offered
                    // the way out, instead of being asked twice whether a brew
                    // they just rated is worth keeping.
                    <XStack alignItems="center" justifyContent="space-between">
                        <DotMatrixText testID="record-pinned" fontSize={11}
                                       letterSpacing={1.4} color={palette.dim}>
                            TRACE KEPT
                        </DotMatrixText>
                        <Pressable testID="record-release"
                                   accessibilityRole="button"
                                   accessibilityLabel="Let this brew expire with the rest"
                                   hitSlop={8}
                                   onPress={() => judgement.setPinned(false)}>
                            <DotMatrixText fontSize={11} letterSpacing={1.4}
                                           color={palette.muted}>
                                LET IT EXPIRE
                            </DotMatrixText>
                        </Pressable>
                    </XStack>
                )}
            </YStack>

            {/* No stream to export or share as a story for a brew the app never
                watched. */}
            {watched && (
                <YStack paddingHorizontal={SCREEN_PADDING}>
                    <YStack testID="record-actions" width={actionFullWidth} gap="$2">
                    <RecordActionRows pairs={actionPairs}
                                      halfWidth={actionHalfWidth}
                                      fullWidth={actionFullWidth}
                                      accent={accent} />
                    {handoff.sentAt > 0 && (
                        <Text fontSize={12} color={palette.dim}>
                            {HANDOFF_ALREADY_SENT(
                                new Date(handoff.sentAt).toLocaleDateString()
                            )}
                        </Text>
                    )}
                    </YStack>
                </YStack>
            )}
            </ScrollView>
            </YStack>

            <BeanNameSheet open={handoff.namingBean} onOpenChange={handoff.setNamingBean}
                           suggestion={beanNameFromRecipe(record.recipeName) ?? ""}
                           onConfirm={(name) => void handoff.sendNow(name)} />
            <BrewNoteSheet
                open={handoff.ratingBeforeSend}
                onOpenChange={handoff.setRatingBeforeSend}
                onDone={handoff.continueSend}
                figures={figures}
                recipeName={record.recipeName}
                rating={judgement.rating}
                note={judgement.note}
                onRate={handoff.rateBrew}
                onNote={handoff.annotateBrew}
                onNoteDraft={handoff.setNoteDraft}
                footer={
                    <XStack accessibilityRole="button"
                            accessibilityLabel="Send without rating it"
                            testID="send-without-rating"
                            onPress={handoff.continueSend}
                            height={44} alignItems="center" justifyContent="center">
                        <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.5}
                                       color={palette.dim}>
                            SEND WITHOUT RATING
                        </DotMatrixText>
                    </XStack>
                }/>
            <BrewStorySheet open={storyOpen} onOpenChange={setStoryOpen}
                            shotRef={story.shotRef} busy={story.busy}
                            onShare={() => void story.shareImage()}
                            layout={(cardWidth) => {
                                const storyFontScale = PixelRatio.getFontScale();
                                const storyAdjustmentRows = summary.adjustments === undefined
                                    ? 0
                                    : brewFigureAdjustmentLayout(
                                        storyTextContentWidth(cardWidth),
                                        storyFontScale,
                                        brewFigureAdjustmentMeasures(summary.adjustments),
                                        storyTextScale(cardWidth)
                                    ).rows;
                                const budget = storySummaryBudget({
                                    width: cardWidth,
                                    stages: stages.length,
                                    hasRateChart: storyHasRateChart,
                                    hasCoffee: storyCoffee !== null,
                                    hasRating: storyRating > 0,
                                    tags: storyTags,
                                    hasBypass: summary.bypass !== undefined,
                                    hasGrindRecipeBadge: storyHasDetails
                                        && summary.grind?.kind === "dial"
                                        && summary.grind.recipe !== null,
                                    drawdownRate: storyHasDetails ? summary.drawdownRate : null,
                                    hasSummaryNote: storyHasNote,
                                    stagesUnavailable: summary.stagesUnavailable,
                                    figureExtraRows: storyHasDetails ? storyFigureDetailRows : 0,
                                    figureAdjustmentRows: storyHasDetails ? storyAdjustmentRows : 0,
                                    fontScale: storyFontScale
                                });
                                const toggles = offeredStoryContent(storyFacts).map((key) => ({
                                    key,
                                    label:       STORY_TOGGLE_LABELS[key],
                                    active:      storyContentRequested(key),
                                    unavailable: budget.declinedContent[key],
                                    onPress:     () => toggleStoryContent(key)
                                }));
                                return {
                                    toggles,
                                    card: (
                    <BrewStoryCard
                        width={cardWidth}
                        budget={budget}
                        when={`${formatBrewDate(record.startedAt)} · ${formatBrewTime(record.startedAt)}`}
                        accent={accent}
                        rating={storyRating}
                        coffee={storyCoffee}
                        tags={storyTags}
                        summary={(budget) => (
                            <BrewSummary
                                {...summary}
                                note={storyHasNote && budget.showSummaryNote
                                    ? summary.note : undefined}
                                drawdown={storyHasDetails && budget.showFigureDetails
                                    ? summary.drawdown : null}
                                drawdownRate={storyHasDetails && budget.showFigureDetails
                                    && budget.showDrawdownRateBadge ? summary.drawdownRate : null}
                                delay={storyHasDetails && budget.showFigureDetails
                                    ? summary.delay : null}
                                grind={storyHasDetails && budget.showFigureDetails
                                    ? storyGrindForBudget(
                                        summary.grind,
                                        budget.showGrindRecipeBadge
                                    ) : null}
                                adjustments={storyHasDetails && budget.showFigureDetails
                                    ? summary.adjustments : undefined}
                                showBypassBadge={budget.showBypassBadge}
                                width={cardWidth}
                                testID="story-capture"
                                traceHeight={budget.traceHeight}
                                rateHeight={budget.rateHeight}
                                rateTopGap={budget.rateTopGap}
                                rateBottomGap={budget.rateBottomGap}
                                capturePadding={budget.capturePadding}
                                ladderTopGap={budget.ladderTopGap}
                                storyBands={{
                                    barHeight: budget.barHeight,
                                    rungGap: budget.rungGap
                                }}
                                showRateChart={budget.showRateChart}
                                showStages={budget.showStages}
                                textScale={storyTextScale(cardWidth)}
                                chartWidth={storyChartWidth(cardWidth)}
                                // Always still: a capture taken mid-travel
                                // freezes the name half-scrolled, and unlike
                                // the screen's own summary there is no moment
                                // here when the card is not about to be shot.
                                nameStill
                            />
                        )}
                    />
                                    )
                                };
                            }} />
            <CompareWithSheet
                open={pickingComparison}
                candidates={comparisonCandidates}
                onPick={compareWith}
                onClose={closeComparisonPicker}
            />
        </YStack>
    );
}

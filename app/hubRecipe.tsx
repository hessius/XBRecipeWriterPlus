import {useLocalSearchParams} from "expo-router";
import React, {useEffect, useState} from "react";
import {Image, Pressable, ScrollView} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {Text, XStack, YStack} from "tamagui";

import BrewStageLadder from "@/components/BrewStageLadder";
import DotMatrixText from "@/components/DotMatrixText";
import ScreenHeader from "@/components/ScreenHeader";
import {notify} from "@/components/XbrwToast";
import {onAccent, palette} from "@/constants/colors";
import {SCREEN_PADDING} from "@/constants/layout";
import router from "@/hooks/steadyRouter";
import {useHubSave} from "@/hooks/useHubSave";
import {fetchHubDetail, type HubDetailRow, HubApiError} from "@/library/hub/hubApi";
import {criteriaVocabulary, heldHubCriteria} from "@/library/hub/hubCriteria";
import {hubPours} from "@/library/hub/hubStages";
import {hubAccent, normaliseHubRow, type HubRecipe} from "@/library/hub/hubRow";

const PHOTO_HEIGHT = 260;
const PHOTO_RADIUS = 12;
const LADDER_BAR_HEIGHT = 18;
const LADDER_RUNG_GAP = 12;

type Loaded = {
    request: string;
    detail: HubDetailRow | null;
    error: Error | null;
};

function saveMessage(saved: number, alreadyHeld: number): string {
    if (saved > 0) return "Saved to your library.";
    if (alreadyHeld > 0) return "Already in your library.";
    return "Nothing new was saved.";
}

function saveFailureMessage(names: readonly string[]): string {
    const name = names[0] ?? "this recipe";
    return `Could not save ${name}.`;
}

function rowFromDetail(detail: HubDetailRow): HubRecipe {
    // The same vocabulary the list normalised against, or this screen would
    // split the same recipe's origin differently from the row that opened it.
    return normaliseHubRow({
        ...detail,
        pourCount: detail.pourList?.length ?? 0
    }, criteriaVocabulary(heldHubCriteria()));
}

/**
 * A link that does not carry a hub recipe id at all.
 *
 * Reachable from a malformed deep link, or from one with no `id` at all. It
 * used to leave the screen loading for ever: the fetch never started, so
 * nothing ever arrived to end it and nothing ever said why.
 */
const UNREADABLE_LINK = new Error("That link does not point at a hub recipe.");
UNREADABLE_LINK.name = "UnreadableHubLink";

/** What an error should say, and whether trying again could possibly help. */
function saying(error: Error): {heading: string; body: string; retry: boolean} {
    if (error === UNREADABLE_LINK) {
        return {
            heading: "BROKEN LINK",
            body: "That link does not point at a hub recipe.",
            retry: false
        };
    }
    if (error instanceof HubApiError && error.isRefusal) {
        return {
            heading: "NO LONGER SHARED",
            body: "This recipe is no longer shared.",
            retry: false
        };
    }
    return {
        heading: "CONNECTION LOST",
        body: "The hub is having trouble. Please try again.",
        retry: true
    };
}

function ErrorState({
    error,
    onRetry
}: {
    error: Error;
    onRetry: () => void;
}) {
    const said = saying(error);
    return (
        <YStack flex={1} alignItems="center" justifyContent="center"
                gap="$4" paddingHorizontal="$6" paddingVertical="$8">
            <YStack alignItems="center" gap="$2">
                <DotMatrixText fontSize={14} weight="bold" letterSpacing={1.6}
                               color={palette.dim}>
                    {said.heading}
                </DotMatrixText>
                <Text color={palette.muted} fontSize={14} textAlign="center">
                    {said.body}
                </Text>
            </YStack>
            {said.retry && (
                <Pressable accessibilityRole="button" accessibilityLabel="Try again"
                           onPress={onRetry}>
                    <XStack height={44} paddingHorizontal="$4" borderRadius="$4"
                            alignItems="center" justifyContent="center"
                            backgroundColor={palette.text}>
                        <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.5}
                                       color={onAccent.text}>
                            TRY AGAIN
                        </DotMatrixText>
                    </XStack>
                </Pressable>
            )}
        </YStack>
    );
}

function LoadingState() {
    return (
        <YStack flex={1} alignItems="center" justifyContent="center"
                gap="$2" paddingHorizontal="$6" paddingVertical="$8">
            <DotMatrixText fontSize={14} weight="bold" letterSpacing={1.6}
                           color={palette.dim}>
                LOADING RECIPE
            </DotMatrixText>
            <Text color={palette.muted} fontSize={14} textAlign="center">
                Loading the recipe.
            </Text>
        </YStack>
    );
}

function Figure({
    label,
    value,
    accent
}: {
    label: string;
    value: string;
    accent: string;
}) {
    return (
        <YStack flex={1} minWidth={88} gap="$1">
            <DotMatrixText fontSize={22} weight="bold" color={accent}>
                {value}
            </DotMatrixText>
            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.2}
                           color={palette.muted}>
                {label}
            </DotMatrixText>
        </YStack>
    );
}

function Chip({label}: {label: string}) {
    return (
        <YStack paddingHorizontal="$2" paddingVertical="$1"
                borderRadius="$3" backgroundColor={palette.raised}
                borderWidth={1} borderColor={palette.line}>
            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.2}
                           color={palette.dim}>
                {label.toUpperCase()}
            </DotMatrixText>
        </YStack>
    );
}

function DetailPhoto({uri}: {uri: string | null}) {
    const [failed, setFailed] = useState(false);
    if (uri !== null && !failed) {
        return (
            <Image
                testID="hub-recipe-photo"
                source={{uri}}
                onError={() => setFailed(true)}
                style={{
                    width: "100%",
                    height: PHOTO_HEIGHT,
                    borderBottomLeftRadius: PHOTO_RADIUS,
                    borderBottomRightRadius: PHOTO_RADIUS
                }}/>
        );
    }

    return (
        <YStack testID="hub-recipe-photo-blank"
                width="100%" height={PHOTO_HEIGHT}
                borderBottomLeftRadius={PHOTO_RADIUS}
                borderBottomRightRadius={PHOTO_RADIUS}
                backgroundColor={palette.raised}/>
    );
}

function RecipeDetail({
    detail,
    saving,
    onSave
}: {
    detail: HubDetailRow;
    saving: boolean;
    onSave: () => void;
}) {
    const row = rowFromDetail(detail);
    const accent = hubAccent(row.id);
    const stages = hubPours(detail.pourList);
    const water = row.volume ?? row.dose * row.ratio;
    const note = detail.introduce?.trim() ?? "";
    const byline = [row.author, row.machine].filter((part) => part.length > 0).join(" · ");

    return (
        <ScrollView testID="hub-recipe-scroll" showsVerticalScrollIndicator={false}
                    contentContainerStyle={{paddingBottom: 24, gap: 18}}>
            <DetailPhoto uri={row.imageURL}/>
            <YStack paddingHorizontal={SCREEN_PADDING} gap="$4">
                {byline.length > 0 && (
                    <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.4}
                                   color={palette.dim}>
                        {byline}
                    </DotMatrixText>
                )}

                {note.length > 0 && (
                    <Text color={palette.text} fontSize={15} lineHeight={22}>
                        {note}
                    </Text>
                )}

                {row.flavour.length > 0 && (
                    <XStack flexWrap="wrap" gap="$2">
                        {row.flavour.map((flavour) => <Chip key={flavour} label={flavour}/>)}
                    </XStack>
                )}

                <XStack flexWrap="wrap" gap="$3">
                    <Figure label="DOSE" value={`${row.dose} g`} accent={accent}/>
                    <Figure label="RATIO" value={`1:${row.ratio}`} accent={accent}/>
                    <Figure label="GRIND" value={String(row.grind)} accent={accent}/>
                    <Figure label="WATER" value={`${water} ml`} accent={accent}/>
                </XStack>

                {stages.length > 0 && (
                    <YStack gap="$2">
                        <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.5}
                                       color={palette.dim}>
                            STAGES
                        </DotMatrixText>
                        <BrewStageLadder
                            pours={stages}
                            accent={accent}
                            activeIndex={null}
                            barHeight={LADDER_BAR_HEIGHT}
                            rungGap={LADDER_RUNG_GAP}
                            scrolls={false}
                            fill={false}
                            stageWater={[]}
                            stalls={[]}
                            pauseElapsed={0}/>
                    </YStack>
                )}

                <Pressable accessibilityRole="button"
                           accessibilityLabel={saving ? "Saving recipe" : "Save recipe"}
                           accessibilityState={{disabled: saving}}
                           onPress={saving ? undefined : onSave}>
                    <XStack height={48} alignItems="center" justifyContent="center"
                            borderRadius="$4" backgroundColor={palette.text}
                            opacity={saving ? 0.35 : 1}>
                        <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.6}
                                       color={onAccent.text}>
                            {saving ? "SAVING" : "SAVE"}
                        </DotMatrixText>
                    </XStack>
                </Pressable>
            </YStack>
        </ScrollView>
    );
}

export default function HubRecipeScreen() {
    const {id} = useLocalSearchParams<{id: string}>();
    const recipeId = Number(id);
    const insets = useSafeAreaInsets();
    const save = useHubSave();
    const [retry, setRetry] = useState(0);
    const [loaded, setLoaded] = useState<Loaded | null>(null);

    useEffect(() => {
        if (!Number.isFinite(recipeId)) return;

        const request = `${recipeId}:${retry}`;
        const controller = new AbortController();
        let alive = true;

        fetchHubDetail(recipeId, controller.signal)
            .then((detail) => {
                if (alive) setLoaded({request, detail, error: null});
            })
            .catch((error) => {
                if (error instanceof Error && error.name === "AbortError") return;
                const caught = error instanceof Error
                    ? error
                    : new Error("The recipe hub could not answer that.");
                if (alive) setLoaded({request, detail: null, error: caught});
            });

        return () => {
            alive = false;
            controller.abort();
        };
    }, [recipeId, retry]);

    const request = `${recipeId}:${retry}`;
    const readable = Number.isFinite(recipeId);
    const arrived = loaded !== null && loaded.request === request;
    const detail = arrived ? loaded.detail : null;
    const error = readable ? (arrived ? loaded.error : null) : UNREADABLE_LINK;
    const loading = readable && !arrived;
    const title = detail === null ? "Recipe" : rowFromDetail(detail).name;

    async function saveOne() {
        if (detail === null) return;
        const row = rowFromDetail(detail);
        const outcome = await save.save([row]);
        if (outcome.refused) return;
        if (outcome.failed.length > 0) {
            notify({tone: "error", message: saveFailureMessage(outcome.failed)});
            return;
        }
        notify({tone: "success",
                message: saveMessage(outcome.saved, outcome.alreadyHeld)});
        router.back();
    }

    return (
        <YStack flex={1} backgroundColor={palette.base}
                paddingBottom={insets.bottom}>
            <ScreenHeader title={title} onBack={() => router.back()}/>
            {loading && <LoadingState/>}
            {!loading && error !== null && (
                <ErrorState error={error} onRetry={() => setRetry((value) => value + 1)}/>
            )}
            {!loading && detail !== null && (
                <RecipeDetail
                    detail={detail}
                    saving={save.saving}
                    onSave={saveOne}/>
            )}
        </YStack>
    );
}

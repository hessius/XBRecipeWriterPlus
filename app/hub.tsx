import React, {useEffect, useState} from "react";
import {Pressable, ScrollView} from "react-native";
import {FlatList} from "react-native-gesture-handler";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {Button, Text, XStack, YStack} from "tamagui";

import HubFilterSheet from "@/components/HubFilterSheet";
import HubRow from "@/components/HubRow";
import HubSaveBar from "@/components/HubSaveBar";
import RailChip from "@/components/RailChip";
import {RailSearchChip, RailSearchField} from "@/components/RailSearch";
import ScreenHeader from "@/components/ScreenHeader";
import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import XbrwSheet from "@/components/XbrwSheet";
import {notify} from "@/components/XbrwToast";
import {onAccent, palette} from "@/constants/colors";
import router from "@/hooks/steadyRouter";
import {useHubBrowse} from "@/hooks/useHubBrowse";
import {useHubSave} from "@/hooks/useHubSave";
import {loadHubCriteria, roastLabel} from "@/library/hub/hubCriteria";
import {HUB_SORTS, type HubFacet, type HubSort} from "@/library/hub/hubQuery";
import type {HubCriteria} from "@/library/hub/hubApi";
import type {HubRecipe} from "@/library/hub/hubRow";

const FACETS: readonly HubFacet[] = ["origins", "processes", "varietals", "flavours"];

const FACET_COPY: Record<HubFacet, {label: string; title: string; spoken: string}> = {
    origins:   {label: "ORIGIN", title: "Origin", spoken: "Origin"},
    processes: {label: "PROCESS", title: "Process", spoken: "Process"},
    varietals: {label: "VARIETAL", title: "Varietal", spoken: "Varietal"},
    flavours:  {label: "FLAVOUR", title: "Flavour", spoken: "Flavour"}
};

const SAVE_BAR_SPACE = 92;
const FAILURE_NAME_LIMIT = 3;

type CountedOption = {value: string; count: number};

function searchState(text: string): string {
    const term = text.trim();
    return term.length === 0 ? "no search term" : `term ${term} active`;
}

function selectedRows(rows: readonly HubRecipe[], chosen: ReadonlySet<number>): HubRecipe[] {
    return rows.filter((row) => chosen.has(row.id));
}

function toggleChosen(chosen: ReadonlySet<number>, id: number): Set<number> {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
}

function roastOptions(criteria: HubCriteria, rows: readonly HubRecipe[]): CountedOption[] {
    return criteria.roastList
        .map((item) => {
            const roast = Number(item.value);
            return {
                value: item.name,
                count: rows.filter((row) => row.roast === roast).length
            };
        })
        .filter((option) => option.count > 0);
}

function selectedRoastNames(criteria: HubCriteria, roasts: readonly number[]): string[] {
    return roasts
        .map((roast) => roastLabel(roast, criteria))
        .filter((name): name is string => name !== null);
}

function roastsFromNames(criteria: HubCriteria, names: readonly string[]): number[] {
    return names
        .map((name) => criteria.roastList.find((item) => item.name === name))
        .filter((item): item is {name: string; value: string} => item !== undefined)
        .map((item) => Number(item.value))
        .filter((value) => Number.isFinite(value));
}

function failureMessage(names: readonly string[], saved: number): string {
    const shown = names.slice(0, FAILURE_NAME_LIMIT);
    const rest = names.length - shown.length;
    const failed = rest > 0
        ? `${shown.join(", ")} and ${rest} more`
        : shown.join(", ");
    return saved > 0
        ? `Saved ${saved}. Could not save: ${failed}.`
        : `Could not save: ${failed}.`;
}

function successMessage(saved: number, alreadyHeld: number): string {
    if (saved > 0 && alreadyHeld > 0) {
        return `Saved ${saved}. ${alreadyHeld} already in your library.`;
    }
    if (saved > 0) {
        return saved === 1 ? "Saved 1 recipe." : `Saved ${saved} recipes.`;
    }
    if (alreadyHeld > 0) {
        return alreadyHeld === 1
            ? "That recipe is already in your library."
            : `${alreadyHeld} recipes are already in your library.`;
    }
    return "Nothing new was saved.";
}

function HubRail({
    browse,
    criteria,
    openFacet,
    sortOpen,
    roastOpen,
    onSortOpen,
    onFacetOpen,
    onRoastOpen
}: {
    browse: ReturnType<typeof useHubBrowse>;
    criteria: HubCriteria | null;
    openFacet: HubFacet | null;
    sortOpen: boolean;
    roastOpen: boolean;
    onSortOpen: () => void;
    onFacetOpen: (facet: HubFacet) => void;
    onRoastOpen: () => void;
}) {
    const search = browse.search;
    const state = searchState(search.text);
    const roastsActive = browse.query.roasts.length > 0;

    return (
        <YStack borderBottomWidth={1} borderColor={palette.line}
                backgroundColor={palette.base}>
            <XStack minHeight={64} alignItems="center" paddingHorizontal="$3"
                    paddingVertical="$2">
                <ScrollView
                    testID="hub-rail"
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    style={{flexGrow: 0, flexShrink: 1}}
                    contentContainerStyle={{gap: 8, alignItems: "center"}}>
                    {!search.expanded && (
                        <RailSearchChip state={state} onPress={search.onExpand}/>
                    )}
                    <RailChip
                        testID="hub-sort-chip"
                        active={browse.query.sort !== "newest"}
                        expanded={sortOpen}
                        caretOpen={sortOpen}
                        icon="sort"
                        label={HUB_SORTS[browse.query.sort].label}
                        accessibilityLabel="Sort catalogue"
                        onPress={onSortOpen}/>
                    {FACETS.map((facet) => {
                        const copy = FACET_COPY[facet];
                        const active = browse.query[facet].length > 0;
                        return (
                            <RailChip
                                key={facet}
                                active={active}
                                expanded={openFacet === facet}
                                caretOpen={openFacet === facet}
                                label={copy.label}
                                accessibilityLabel={`${copy.spoken} filter`}
                                onPress={() => onFacetOpen(facet)}/>
                        );
                    })}
                    {criteria !== null && (
                        <RailChip
                            active={roastsActive}
                            expanded={roastOpen}
                            caretOpen={roastOpen}
                            label="ROAST"
                            accessibilityLabel="Roast filter"
                            onPress={onRoastOpen}/>
                    )}
                </ScrollView>
                {search.expanded && (
                    <XStack position="absolute" top={0} left={0} right={0} bottom={0}
                            alignItems="center" paddingHorizontal="$3">
                        <RailSearchField
                            state={state}
                            text={search.text}
                            active={search.active}
                            onChangeText={search.onChangeText}
                            onBlur={search.onBlur}
                            onClear={search.onClear}/>
                    </XStack>
                )}
            </XStack>
        </YStack>
    );
}

function SortRow({
    sort,
    selected,
    onPress
}: {
    sort: HubSort;
    selected: boolean;
    onPress: () => void;
}) {
    return (
        <Pressable accessibilityRole="radio"
                   accessibilityLabel={HUB_SORTS[sort].label}
                   accessibilityState={{checked: selected}}
                   onPress={onPress}>
            <XStack minHeight={48} alignItems="center" justifyContent="space-between"
                    paddingHorizontal="$3" borderRadius="$4"
                    backgroundColor={selected ? palette.raised : palette.none}>
                <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.8}
                               color={selected ? palette.text : palette.dim}>
                    {HUB_SORTS[sort].label}
                </DotMatrixText>
                {selected && <DotIcon name="success" size={14} color={palette.text}/>}
            </XStack>
        </Pressable>
    );
}

function HubSortSheet({
    open,
    selected,
    onOpenChange,
    onSort
}: {
    open: boolean;
    selected: HubSort;
    onOpenChange: (open: boolean) => void;
    onSort: (sort: HubSort) => void;
}) {
    const sorts = Object.keys(HUB_SORTS) as HubSort[];

    return (
        <XbrwSheet open={open} onOpenChange={onOpenChange} title="SORT"
                   heightPercent={42}>
            <YStack accessibilityRole="radiogroup" accessibilityLabel="Sort catalogue"
                    gap="$2" paddingBottom="$4">
                {sorts.map((sort) => (
                    <SortRow key={sort}
                             sort={sort}
                             selected={selected === sort}
                             onPress={() => onSort(sort)}/>
                ))}
            </YStack>
        </XbrwSheet>
    );
}

function HubStatus({
    title,
    body,
    action,
    onAction
}: {
    title: string;
    body: string;
    action?: string;
    onAction?: () => void;
}) {
    return (
        <YStack flex={1} alignItems="center" justifyContent="center"
                gap="$4" paddingHorizontal="$6" paddingVertical="$8">
            <YStack alignItems="center" gap="$2">
                <DotMatrixText fontSize={14} weight="bold" letterSpacing={1.6}
                               color={palette.dim}>
                    {title}
                </DotMatrixText>
                <Text fontSize={14} textAlign="center" color={palette.muted}>
                    {body}
                </Text>
            </YStack>
            {action !== undefined && onAction !== undefined && (
                <Button accessibilityRole="button"
                        accessibilityLabel={action}
                        backgroundColor={palette.text}
                        color={onAccent.text}
                        borderRadius="$4"
                        onPress={onAction}>
                    {action}
                </Button>
            )}
        </YStack>
    );
}

function HubFooter({
    arriving,
    failed,
    page,
    totalPage,
    onRetry
}: {
    arriving: boolean;
    failed: Error | null;
    page: number;
    totalPage: number;
    onRetry: () => void;
}) {
    if (arriving) {
        const progress = totalPage > 0 && page > 0 ? `Page ${page} of ${totalPage}.` : "";
        return (
            <YStack alignItems="center" gap="$1" paddingVertical="$5"
                    paddingHorizontal="$4">
                <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6}
                               color={palette.dim}>
                    LOADING CATALOGUE
                </DotMatrixText>
                {progress.length > 0 && (
                    <Text color={palette.muted} fontSize={13}>{progress}</Text>
                )}
            </YStack>
        );
    }

    if (failed !== null) {
        return (
            <YStack alignItems="center" gap="$3" paddingVertical="$5"
                    paddingHorizontal="$4">
                <Text color={palette.muted} fontSize={13} textAlign="center">
                    Could not load the catalogue.
                </Text>
                <Button accessibilityRole="button"
                        accessibilityLabel="Try again"
                        size="$3"
                        backgroundColor={palette.text}
                        color={onAccent.text}
                        onPress={onRetry}>
                    Try again
                </Button>
            </YStack>
        );
    }

    return null;
}

export default function HubScreen() {
    const insets = useSafeAreaInsets();
    const browse = useHubBrowse();
    const save = useHubSave();
    const [openFacet, setOpenFacet] = useState<HubFacet | null>(null);
    const [sortOpen, setSortOpen] = useState(false);
    const [roastOpen, setRoastOpen] = useState(false);
    const [choosing, setChoosing] = useState(false);
    const [chosen, setChosen] = useState<ReadonlySet<number>>(new Set());
    const [criteria, setCriteria] = useState<HubCriteria | null>(null);

    useEffect(() => {
        let alive = true;
        loadHubCriteria().then((loaded) => {
            if (alive) setCriteria(loaded);
        }).catch(() => {
            if (alive) setCriteria(null);
        });
        return () => {
            alive = false;
        };
    }, []);

    function closeChoosing() {
        setChosen(new Set());
        setChoosing(false);
    }

    function pick(row: HubRecipe) {
        setChosen((was) => toggleChosen(was, row.id));
    }

    function openRow(row: HubRecipe) {
        router.push({pathname: "/hubRecipe", params: {id: String(row.id)}});
    }

    function pressRow(row: HubRecipe) {
        if (choosing) {
            pick(row);
            return;
        }
        openRow(row);
    }

    function holdRow(row: HubRecipe) {
        setChoosing(true);
        setChosen((was) => {
            const next = new Set(was);
            next.add(row.id);
            return next;
        });
    }

    async function saveChosen() {
        const outcome = await save.save(selectedRows(browse.all, chosen));
        if (outcome.refused) return;

        const landed = outcome.saved + outcome.alreadyHeld;
        if (outcome.failed.length > 0) {
            notify({tone: "error", message: failureMessage(outcome.failed, landed)});
        } else {
            notify({tone: "success",
                    message: successMessage(outcome.saved, outcome.alreadyHeld)});
        }
        closeChoosing();
    }

    function clearQuestion() {
        browse.clearQuery();
        setOpenFacet(null);
        setRoastOpen(false);
        setSortOpen(false);
    }

    const rows = browse.rows;
    const failed = browse.failed === null ? null : browse.failed;
    const screenCovered = openFacet !== null || sortOpen || roastOpen;
    const activeFacetCopy = openFacet === null ? null : FACET_COPY[openFacet];
    const roastSheetOptions = criteria === null ? [] : roastOptions(criteria, browse.all);
    const roastSheetSelected = criteria === null
        ? []
        : selectedRoastNames(criteria, browse.query.roasts);
    const bottomPadding = insets.bottom + 8 + (choosing ? SAVE_BAR_SPACE : 0);

    let body: React.ReactNode;
    if (rows.length === 0 && browse.arriving) {
        body = (
            <HubStatus title="LOADING CATALOGUE"
                       body="Loading the catalogue."/>
        );
    } else if (rows.length === 0 && failed !== null) {
        body = (
            <HubStatus title="CONNECTION LOST"
                       body="Could not load the catalogue."
                       action="Try again"
                       onAction={browse.retry}/>
        );
    } else if (rows.length === 0) {
        body = (
            <HubStatus title="NO MATCHES"
                       body="No recipes match this search or filters."
                       action="Clear search and filters"
                       onAction={clearQuestion}/>
        );
    } else {
        body = (
            <FlatList
                testID="hub-list"
                data={rows}
                keyExtractor={(row) => String(row.id)}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{paddingBottom: bottomPadding}}
                ListFooterComponent={(
                    <HubFooter
                        arriving={browse.arriving}
                        failed={failed}
                        page={browse.page}
                        totalPage={browse.totalPage}
                        onRetry={browse.retry}/>
                )}
                renderItem={({item}) => (
                    <HubRow
                        recipe={item}
                        selecting={choosing}
                        selected={chosen.has(item.id)}
                        onPress={() => pressRow(item)}
                        onLongPress={() => holdRow(item)}/>
                )}/>
        );
    }

    return (
        <>
            <YStack flex={1} backgroundColor={palette.base}
                    accessibilityElementsHidden={screenCovered}
                    importantForAccessibility={screenCovered ? "no-hide-descendants" : "auto"}>
                <ScreenHeader title="CATALOGUE" count={rows.length}
                              onBack={() => router.back()}/>
                <HubRail
                    browse={browse}
                    criteria={criteria}
                    openFacet={openFacet}
                    sortOpen={sortOpen}
                    roastOpen={roastOpen}
                    onSortOpen={() => setSortOpen(true)}
                    onFacetOpen={(facet) => setOpenFacet(facet)}
                    onRoastOpen={() => setRoastOpen(true)}/>
                {body}
            </YStack>

            {choosing && !screenCovered && (
                <HubSaveBar
                    count={chosen.size}
                    saving={save.saving}
                    progress={save.progress}
                    paddingBottom={insets.bottom}
                    onCancel={closeChoosing}
                    onSave={saveChosen}/>
            )}

            <HubFilterSheet
                open={openFacet !== null}
                onOpenChange={(next) => {
                    if (!next) setOpenFacet(null);
                }}
                title={activeFacetCopy?.title ?? "Filter"}
                options={openFacet === null ? [] : browse.chips(openFacet)}
                selected={openFacet === null ? [] : browse.query[openFacet]}
                onChange={(values) => {
                    if (openFacet !== null) browse.setFacet(openFacet, values);
                }}/>

            {criteria !== null && (
                <HubFilterSheet
                    open={roastOpen}
                    onOpenChange={setRoastOpen}
                    title="Roast"
                    options={roastSheetOptions}
                    selected={roastSheetSelected}
                    onChange={(values) => browse.setRoasts(roastsFromNames(criteria, values))}/>
            )}

            <HubSortSheet
                open={sortOpen}
                selected={browse.query.sort}
                onOpenChange={setSortOpen}
                onSort={(sort) => browse.setSort(sort)}/>
        </>
    );
}

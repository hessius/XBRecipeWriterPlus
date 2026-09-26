import React, {useEffect, useRef, useState} from "react";
import {BackHandler, Platform, Share} from "react-native";
// gesture-handler's FlatList, not React Native's: it keeps the list scroll
// gesture and each row's swipe gesture from fighting each other on Android.
import {FlatList} from "react-native-gesture-handler";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {useFocusEffect, useNavigation} from "expo-router";
import {useShareIntentContext} from "expo-share-intent";
import {Button, Text, XStack, YStack} from "tamagui";

import Collapsible from "@/components/Collapsible";
import BeanFilterSheet from "@/components/BeanFilterSheet";
import CtaTile from "@/components/CtaTile";
import DotMatrixText from "@/components/DotMatrixText";
import EmptyLibrary from "@/components/EmptyLibrary";
import HomeHeader from "@/components/HomeHeader";
import ImportSheet from "@/components/ImportSheet";
import ImportTile from "@/components/ImportTile";
import LibraryRail, {type RailFilter} from "@/components/LibraryRail";
import MachinePanel from "@/components/MachinePanel";
import NewRecipeSheet from "@/components/NewRecipeSheet";
import NfcOverlay from "@/components/NfcOverlay";
import SortSheet from "@/components/SortSheet";
import SwipeableRecipeRow from "@/components/SwipeableRecipeRow";
import {notify} from "@/components/XbrwToast";
import type {MachineVitals} from "@/components/MachinePanel";
import {OVER} from "@/constants/brewCopy";
import {ALREADY_IN_LIBRARY, CARD_READ_FAILED, HOLD_CARD} from "@/constants/copy";
import {onAccent, palette, type AccentGroup} from "@/constants/colors";
import {useCollapsibleHeader} from "@/hooks/useCollapsibleHeader";
import {useShelfPicker} from "@/hooks/useShelfPicker";
import {useCardWriter} from "@/hooks/useCardWriter";
import {useBeanFilters, type BeanVocabularyStore} from "@/hooks/useBeanFilters";
import {useMachine} from "@/hooks/useMachine";
import {useLibraryQuery} from "@/hooks/useLibraryQuery";
import {useRecipeImport} from "@/hooks/useRecipeImport";
import {useRecipeLibrary, type RecipeStore, type ShelfWriteOutcome}
    from "@/hooks/useRecipeLibrary";
import {useSetting} from "@/hooks/useSetting";
import {forgetLastMove, useSteadyRouter} from "@/hooks/steadyRouter";
import {SHARE_FAILURE_MESSAGE, useShareRecipe} from "@/hooks/useShareRecipe";
import {useLiveBrew} from "@/hooks/useLiveBrew";
import NFC, {setNfcAlertIOS} from "@/library/NFC";
import Recipe from "@/library/Recipe";
import {serialiseCapture} from "@/library/cardDiagnostics";
import RecipeDatabase from "@/library/RecipeDatabase";
import {blankRecipe} from "@/library/newRecipe";
import {assignAccent} from "@/library/accent";
import NameShelfSheet from "@/components/NameShelfSheet";
import RemoveShelfSheet from "@/components/RemoveShelfSheet";
import SelectableRecipeRow from "@/components/SelectableRecipeRow";
import ShelfGrid from "@/components/ShelfGrid";
import ShelfOverflowSheet from "@/components/ShelfOverflowSheet";
import ShelfPickerHeader from "@/components/ShelfPickerHeader";
import ShelfPickerBar, {PICKER_BAR_HEIGHT} from "@/components/ShelfPickerBar";
import ShelfRoom, {type RoomRecipeActions} from "@/components/ShelfRoom";
import RecipeOverflowSheet from "@/components/RecipeOverflowSheet";
import {resolveOnOpen} from "@/library/duplicates";
import {parseImportInput} from "@/library/importInput";
import {
    asStockFilters,
    availableFilters,
    filterLabel,
    STOCK_FILTERS,
    type FilterId
} from "@/library/libraryFilters";
import {buildShelves} from "@/library/shelves";
import {parseHidden, toggleHidden} from "@/library/hiddenShelves";
import {canWriteToCard} from "@/library/cardLimits";
import {tagKey} from "@/library/tagKey";
import {shareBlockReason} from "@/library/shareLink";
import {type Settings} from "@/library/Settings";

type Props = {
    /** Injected by tests. The route renders against the real database. */
    db?: RecipeStore;
    /** Injected by tests that render the route without a native brew database. */
    beanStore?: BeanVocabularyStore;
    /** Injected by tests. */
    settings?: Settings;
};

/**
 * The recipe library.
 *
 * Layout only. Loading and mutating recipes belong to `useRecipeLibrary`, the
 * scroll collapse to `useCollapsibleHeader`, and every message to `notify`.
 */
/**
 * How long one push to the editor refuses a second.
 *
 * The refusal exists to stop an impatient double tap, or a share intent
 * delivered twice, stacking two editors on one intention -- and a push takes
 * milliseconds, so a second or two covers it many times over.
 *
 * Time-bounded rather than cleared by an event. The refusal used to be lifted
 * in exactly one place, this screen regaining focus, which meant a push that
 * opened nothing left it set for ever: focus was never lost, so it was never
 * regained, and every later scan returned silently having looked like it
 * worked. A guard whose only release is an event that may never arrive is a
 * wedge waiting to happen.
 */
export const EDITOR_PUSH_GUARD_MS = 2000;

/** When the editor was last pushed, so a second push in that window is refused. */
let lastEditorPushAt = 0;

type RecipeListItem =
    | {kind: "heading"; id: string; label: string}
    | {kind: "recipe"; recipe: Recipe; recipeIndex: number};

function SectionHeading({label}: {label: string}) {
    return (
        <YStack paddingHorizontal="$3" paddingTop="$4" paddingBottom="$1">
            <DotMatrixText fontSize={12} weight="bold" letterSpacing={2}
                           color={palette.dim}>
                {label}
            </DotMatrixText>
        </YStack>
    );
}

function EmptyQuery({
    search,
    filters,
    onClear
}: {
    search: string;
    filters: readonly string[];
    onClear: () => void;
}) {
    const term = search.trim();
    const filterCopy = filters.length > 0 ? filters.join(", ") : "";

    return (
        <YStack flex={1} alignItems="center" justifyContent="center"
                gap="$4" paddingHorizontal="$6" paddingVertical="$8">
            <YStack alignItems="center" gap="$2">
                <DotMatrixText fontSize={14} weight="bold" letterSpacing={1.6}
                               color={palette.dim}>
                    NO MATCHES
                </DotMatrixText>
                <Text fontSize={13} textAlign="center" color={palette.muted}>
                    No recipes match the current search or filters.
                </Text>
                {term.length > 0 && (
                    <Text fontSize={13} textAlign="center" color={palette.text}>
                        {term}
                    </Text>
                )}
                {filterCopy.length > 0 && (
                    <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.4}
                                   color={palette.text}>
                        {filterCopy}
                    </DotMatrixText>
                )}
            </YStack>
            <Button accessibilityLabel="Clear search and filters"
                    backgroundColor={palette.text}
                    color={onAccent.text}
                    borderRadius="$4"
                    onPress={onClear}>
                CLEAR SEARCH AND FILTERS
            </Button>
        </YStack>
    );
}

/**
 * The empty state SELECTED draws when nothing has been ticked yet.
 *
 * Its own line rather than `EmptyQuery`'s: the SELECTED lens is not a search,
 * so "no recipes match the current search or filters" would be answering a
 * question the user never asked. The chip is how a shelf under construction is
 * reviewed, so the line points back at the gesture that fills it.
 */
function EmptySelection() {
    return (
        <YStack flex={1} alignItems="center" justifyContent="center"
                gap="$2" paddingHorizontal="$6" paddingVertical="$8">
            <DotMatrixText fontSize={14} weight="bold" letterSpacing={1.6}
                           color={palette.dim}>
                NOTHING TICKED
            </DotMatrixText>
            <Text fontSize={13} textAlign="center" color={palette.muted}>
                Tick a recipe to add it to this shelf.
            </Text>
        </YStack>
    );
}

export default function HomeScreen({db, beanStore, settings}: Props) {
    const insets = useSafeAreaInsets();
    const router = useSteadyRouter();
    const navigation = useNavigation();

    const libraryQuery = useLibraryQuery(settings);
    const library = useRecipeLibrary(db, libraryQuery.query);
    const {collapsed, onScroll} = useCollapsibleHeader();
    // The picker's selection lives apart from the library's query, which is
    // what lets a ticked recipe survive a change of lens: filter to tea, tick
    // three, clear the filter, and the three are still ticked.
    const picker = useShelfPicker();
    const [namingShelf, setNamingShelf] = useState(false);
    const [removingShelf, setRemovingShelf] = useState<string | null>(null);
    const [renamingShelf, setRenamingShelf] = useState<string | null>(null);
    // Whether the rename is the reason an edit is running. A rename from the
    // grid starts one the user never sees, so dismissing the sheet has to end
    // it or they land in the member editor they never asked for; a rename from
    // inside an edit must leave that edit exactly where it was.
    const [renameStartedEdit, setRenameStartedEdit] = useState(false);
    const [shelfActions, setShelfActions] = useState<string | null>(null);
    // Deleting a shelf outright and emptying one both end at the same
    // confirmation, and it has to say which happened, so the reason travels
    // with the tag rather than being guessed from the picker's state: by the
    // time the sheet is up, the picker may not be running at all.
    const [deletingShelf, setDeletingShelf] = useState<string | null>(null);
    const [onlySelected, setOnlySelected] = useState(false);
    const [showCoffeeMarker] = useSetting("showCoffeeMarker", settings);
    const [dottedProfile] = useSetting("dotMatrixProfile", settings);
    const [invertAutoShelves] = useSetting("invertAutoShelves", settings);
    const [hiddenShelves, setHiddenShelves] = useSetting("hiddenShelves", settings);
    // Written from the card-read sink below, never read here. The setter is the
    // whole point: a diagnostic capture has to be persisted the instant it is
    // taken, before `parseData` gets a chance to crash on a bypass card.
    const [, setLastCardRead] = useSetting("lastCardRead", settings);

    const {machine, status: machineStatus, connect: connectMachine, remembered} =
        useMachine();
    // Seeded from machine.info so a machine that is already connected when the
    // screen mounts does not show "Not in range" while the header dot says
    // connected. The useState initialiser runs once; subsequent updates arrive
    // through onLink below.
    const [machineVitals, setMachineVitals] = useState<MachineVitals | null>(() => {
        const info = machine.info;
        if (info === null) return null;
        return {waterEnough: info.waterEnough, waterFeed: info.waterFeed, mode: info.mode,
                grindSize: info.grindSize, askedAt: Date.now()};
    });

    const [popoverOpen, setPopoverOpen] = useState(false);
    const [popoverNow, setPopoverNow] = useState(0);
    const [sortOpen, setSortOpen] = useState(false);
    const [beanFilterOpen, setBeanFilterOpen] = useState(false);
    const injectedBeanStore = beanStore
        ?? (db !== undefined && "beanVocabulary" in db
            ? db as unknown as BeanVocabularyStore
            : undefined);
    const beanFilters = useBeanFilters({
        filters:      libraryQuery.query.filters,
        applyFilters: libraryQuery.applyFilters,
        store:        injectedBeanStore
    });

    // The recipe whose actions sheet is open, or null when it is closed. This is
    // the library's own door onto `RecipeOverflowSheet`: a tile in a shelf room
    // has no swipe tray, so its actions are reached by a long press, and a list
    // row carries the same long press so both idioms open the one sheet rather
    // than two lists that can drift. Held at the screen so a single sheet serves
    // every tile and every row, rather than one sheet per recipe.
    const [overflowRecipe, setOverflowRecipe] = useState<Recipe | null>(null);

    // Advance the displayed age while the popover is open.
    //
    // Minutes-granularity only, so every 25 s is more than enough. The timer
    // is created only while open and cleared on close and on unmount. setState
    // is called only from inside the interval callback — never synchronously
    // from the effect body — which satisfies react-hooks/set-state-in-effect.
    useEffect(() => {
        if (!popoverOpen) return;
        const id = setInterval(() => setPopoverNow(Date.now()), 25_000);
        return () => clearInterval(id);
    }, [popoverOpen]);

    // A shelf room is a state of this screen and not a route, so the navigator
    // has no frame to pop for it: without this, Android's hardware back would
    // exit the library while a shelf was still open on the squares. The room is
    // open when the shelf view is showing and a shelf id is set, and the two are
    // kept together in the query so this stays a single truth.
    const inShelfRoom =
        libraryQuery.view === "shelves" && libraryQuery.openShelfId !== null;
    // The subscription exists only while a room is open, so exactly one handler
    // is registered at a time and back behaves normally everywhere else; it is
    // torn down when the room closes or the screen unmounts. The handler returns
    // true to say the app consumed the press, and it closes the room from inside
    // a callback rather than the effect body -- a hardware-back event, not a
    // render -- which is why setting state here does not trip
    // react-hooks/set-state-in-effect.
    useEffect(() => {
        if (!inShelfRoom) return;
        const sub = BackHandler.addEventListener("hardwareBackPress", () => {
            libraryQuery.closeShelf();
            return true;
        });
        return () => sub.remove();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inShelfRoom]);
    const {run: liveRun} = useLiveBrew();
    /** When the brew screen was last pushed, so a second press in that window is refused. */
    const lastBrewPushRef = useRef(0);

    // Repaint vitals whenever the link emits an event (connected, info arrived,
    // disconnected). The info blob is mutated in place on the shared machine, so
    // React cannot see it without this subscription.
    // On disconnect the last answered snapshot is deliberately kept — MachinePanel
    // shows "Last seen X min ago" when status is not "connected" but vitals exist,
    // and that copy is unreachable if we clear here.
    useEffect(() => machine.onLink(() => {
        const info = machine.info;
        if (info !== null) {
            setMachineVitals({
                waterEnough: info.waterEnough,
                waterFeed:   info.waterFeed,
                mode:        info.mode,
                grindSize:   info.grindSize,
                askedAt:     Date.now()
            });
        }
    }), [machine]);

    const [editing, setEditing] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [readProgress, setReadProgress] = useState(0);
    // Retired the moment the nudge has been given, not merely when the library
    // is touched. "The first row" is whichever recipe the current query puts on
    // top, so every sort, filter and search would otherwise hand the gate a
    // fresh row and replay the lesson -- a card wobbling open on every chip tap.
    const [bounceFirstRow, setBounceFirstRow] = useState(true);

    // Named rather than written inline at the call site, because the call site
    // is `renderItem`, which the list invokes outside this component's memoised
    // render scope: an arrow built there is a fresh identity on every cell
    // render, the row's nudge effect re-runs, and its timers restart. The peek
    // cannot be left open by that -- the closing timer restarts too -- but it
    // can replay while a cold start settles.
    function retireBounce() {
        setBounceFirstRow(false);
    }

    const {hasShareIntent, shareIntent, resetShareIntent} = useShareIntentContext();
    // Held for the screen's lifetime, not rebuilt per render. Starting a scan
    // shows the overlay, which re-renders — so a per-render transport meant the
    // Cancel the user could actually press closed a different `NFC` than the one
    // `readCard` was awaiting, hiding the ceremony while the request lived on.
    const [nfc] = useState(() => new NFC());

    // The action tray on each row can write a recipe to a card and share a link
    // to it, the same two acts the editor offers — so they come from the same
    // two hooks rather than a second implementation. `useCardWriter` brings its
    // own `NFC` transport, its own overlay state and the `getIsClosed()` handling
    // for a cancelled Android scan, so hosting WRITE here is wiring, not a new
    // NFC path. Its volume-error report has no field to land in on this screen,
    // so it becomes a toast; a library recipe that will not write already shows
    // the card's own "will not write" mark.
    const {writeCard, onNFCDialogClose, showNfcOverlay, writeProgress} =
        useCardWriter((message) => {
            if (message !== null) notify({tone: "error", message});
        });
    const {state: shareState, share: shareRecipe} = useShareRecipe();

    // The same failures, and the same words, as the editor's share path.
    useEffect(() => {
        if (shareState.status !== "failed") {
            return;
        }
        notify({tone: "error", message: SHARE_FAILURE_MESSAGE[shareState.reason]});
    }, [shareState]);

    const wholeLibraryEmpty = library.librarySize === 0;
    /** The chip's own id, which is not a filter and never reaches a query. */
    const SELECTED_CHIP = "picker:selected";
    /** The bean picker chip is a door into a sheet, not a filter id. */
    const BEANS_CHIP = "picker:beans";
    const offeredFilterIds = asStockFilters(availableFilters(
        library.filterCounts,
        library.librarySize,
        // What is already applied, so suppression cannot withdraw a filter the
        // user switched on and strand the library narrowed with no control.
        libraryQuery.query.filters
    ));
    // Every applied filter the stock row cannot offer, which in practice means
    // the shelf the user just opened from the grid. Without these the tag stays
    // in the query and in the filter button's count with no chip naming it, so
    // the narrowing is on and there is nothing on screen that turns it off. It
    // is worse inside the picker: the shelf being edited would hide every
    // recipe that is not already on it, which is most of the ones the user came
    // to add.
    const appliedNonStock = libraryQuery.query.filters.filter(
        (id) => !offeredFilterIds.includes(id as FilterId)
    );
    const railFilters: RailFilter[] = [
        // Drawn first and only while picking, because from inside a narrowed
        // library it is the only way back to what has been chosen. It is a chip
        // rather than a filter because it narrows the view without touching the
        // query: the selection has to outlive every filter around it.
        ...(picker.active ? [{
            id:     SELECTED_CHIP,
            label:  `SELECTED (${picker.count})`,
            active: onlySelected
        }] : []),
        {
            id:        BEANS_CHIP,
            label:     "BEANS",
            active:    beanFilters.active,
            caretOpen: beanFilterOpen
        },
        ...appliedNonStock.map((id) => ({
            id,
            label:  filterLabel(id),
            active: true
        })),
        ...offeredFilterIds.map((id) => ({
            id,
            label:  STOCK_FILTERS[id].label,
            active: libraryQuery.isFilterActive(id)
        }))
    ];
    const activeFilterLabels = libraryQuery.query.filters.map(filterLabel);
    // Both halves of the grid, assembled from counts the library already read.
    // The applied filters go in so a shelf the user is standing in is drawn
    // whatever its size, which matters most for the shelf they just opened.
    const shelves = buildShelves({
        filterCounts: library.filterCounts,
        tagCounts:    library.tagCounts,
        authorCounts: library.authorCounts,
        librarySize:  library.librarySize,
        applied:      libraryQuery.query.filters
    });
    // The rows the picker draws are the rows the list draws, so a filter, a
    // search and a sort narrow the picker exactly as they narrow the library.
    //
    // SELECTED is the one lens that does not, and it is read from the whole
    // table rather than from `library.recipes` on purpose: its whole job is to
    // bring back a choice the current lens has hidden, and an intersection with
    // that lens would show the user the subset they could already see.
    const shownRecipes = picker.active && onlySelected
        ? library.allRecipes().filter((recipe) => picker.selected.has(recipe.uuid))
        : library.recipes;
    const favouriteRecipes = shownRecipes.filter((recipe) => recipe.favourite);
    const otherRecipes = shownRecipes.filter((recipe) => !recipe.favourite);
    const drawSections =
        libraryQuery.favouritesFirst && favouriteRecipes.length > 0 && otherRecipes.length > 0;
    function beginEditingShelf(tag: string) {
        // Members read from the whole table, not the list. A shelf edited while
        // a filter was applied would otherwise start with only the members that
        // happened to be on screen and take the tag off the rest on save.
        const key = tagKey(tag);
        picker.startEditing(tag, library.allRecipes().filter((recipe) =>
            (recipe.tags ?? []).some((existing) => tagKey(existing) === key)
        ));
    }

    // Narrowed once, here, rather than at each of the three places the header
    // needs it: `picker.mode` is a union and a closure that reads it again
    // inside a callback has to re-prove what the caller already knows.
    const editingTag = picker.mode.kind === "editing" ? picker.mode.tag : null;

    function stopPicking() {
        setOnlySelected(false);
        picker.cancel();
    }

    /**
     * Say what a shelf write could not do, and say nothing when it did it all.
     *
     * The cap is the case worth naming: a recipe already on twenty shelves
     * cannot join a twenty-first, and without this the tick simply would not
     * stick with no explanation on screen.
     */
    function reportShelfWrite({full, failed}: ShelfWriteOutcome) {
        // Both, when both happened. Reporting the cap and returning left a user
        // whose save had also been refused by the database believing every
        // recipe under the cap had made it, which is the more dangerous of the
        // two silences: the cap is a rule they can act on, a refused write is
        // one they cannot even see.
        if (full > 0) {
            notify({
                tone:    "error",
                message: full === 1
                    ? "One recipe is already on as many shelves as it can hold."
                    : `${full} recipes are already on as many shelves as they can hold.`
            });
        }
        if (failed > 0) {
            notify({tone: "error", message: "Some recipes could not be saved."});
        }
    }

    function finishPicking() {
        if (picker.mode.kind === "editing") {
            // An emptied shelf is a removal, and it is asked about before it
            // happens rather than apologised for after: once the tag is off its
            // last recipe there is no shelf left to put back.
            if (picker.count === 0) {
                setRemovingShelf(picker.mode.tag);
                return;
            }
            reportShelfWrite(library.setShelfMembers(picker.mode.tag, picker.chosen()));
            stopPicking();
            return;
        }
        // A new shelf has no name yet, and cannot be named before it has
        // members: a shelf of nothing is not a shelf.
        setNamingShelf(true);
    }

    function nameShelf(name: string): boolean {
        // A name that folds to a shelf that already exists is refused rather
        // than saved. `setShelfMembers` writes an exact membership: it takes the
        // tag off every recipe that was not just ticked, so naming a new shelf
        // "mornings" while a "Mornings" existed would not make a second shelf,
        // it would silently rewrite the first one to whatever happened to be
        // ticked here. Folded through `tagKey` for the same reason the query
        // is: the two names are one shelf as far as everything downstream is
        // concerned, so a case variant is a collision, not a new shelf.
        //
        // Refused rather than merged, because the two readings of the gesture
        // are opposite and the app cannot tell which was meant: add these to
        // that shelf, or replace that shelf with these. The shelf is reachable
        // for editing from its own tile, where the membership on screen is the
        // membership being changed.
        const taken = library.tagCounts.some(({tag}) => tagKey(tag) === tagKey(name));
        if (taken) {
            notify({tone: "error", message: `There is already a shelf called ${name}.`});
            return false;
        }
        reportShelfWrite(library.setShelfMembers(name, picker.chosen()));
        setNamingShelf(false);
        stopPicking();
        return true;
    }

    /**
     * Give a shelf a different name, keeping everyone on it.
     *
     * A shelf is its tag, so a rename is two writes: take the old tag off its
     * members, then put the new one on. In that order, and not the reverse,
     * because `setTags` folds through `tagKey` and keeps the spelling it
     * already has: adding "Morning" to a recipe that carries "morning" is not
     * a change at all, so a rename that only re-spells a name would silently
     * do nothing. Clearing first also frees each member's tag slot, so the cap
     * cannot refuse a recipe its own shelf back.
     *
     * The members come from the picker rather than from the database, so a
     * rename saves the ticks the user has made as well: the sheet is opened
     * from inside an edit, and finishing one gesture while silently abandoning
     * the other would be the worse surprise.
     */
    function renameShelf(name: string): boolean {
        if (renamingShelf === null) return false;
        const from = tagKey(renamingShelf);
        // A name that only changes case is still this shelf, and refusing it
        // would make the app disagree with itself: `tagKey` folds case, so
        // "mornings" and "Mornings" are one shelf everywhere downstream. It is
        // allowed through as the rename it is -- the display text changes and
        // the membership does not.
        const taken = library.tagCounts.some(({tag}) =>
            tagKey(tag) === tagKey(name) && tagKey(tag) !== from);
        if (taken) {
            notify({tone: "error", message: `There is already a shelf called ${name}.`});
            return false;
        }
        // One pass over the library rather than an empty followed by a fill:
        // between two writes the shelf does not exist, and a refused second
        // write left its members with neither name.
        reportShelfWrite(library.renameShelf(renamingShelf, name, picker.chosen()));
        setRenamingShelf(null);
        setRenameStartedEdit(false);
        stopPicking();
        return true;
    }

    /**
     * Count what is on a shelf, from the whole table rather than the list.
     *
     * The same reason `beginEditingShelf` reads the table: a shelf narrowed by
     * a filter would otherwise report the members that happen to be on screen,
     * and the sheet uses this to tell the user what a delete is about to take.
     */
    function shelfSize(tag: string): number {
        const key = tagKey(tag);
        return library.tagCounts.find(({tag: existing}) => tagKey(existing) === key)?.count ?? 0;
    }

    /**
     * Copy a shelf, members and all.
     *
     * The copy is named by the user rather than given "morning 2": a shelf's
     * name is the only thing about it the user wrote, and a machine-made one
     * would have to be renamed immediately anyway. So this borrows the naming
     * flow the picker already has -- put the members in the picker, then ask
     * for a name -- which also means the user can adjust who comes along before
     * the copy exists.
     */
    function duplicateShelf(tag: string) {
        beginEditingShelf(tag);
        // Creating, not editing: the original keeps its tag and its members,
        // and the name sheet writes a second shelf beside it.
        setNamingShelf(true);
    }

    /** Take a shelf away, keeping every recipe that was on it. */
    function deleteShelf(tag: string) {
        reportShelfWrite(library.setShelfMembers(tag, []));
        setDeletingShelf(null);
        stopPicking();
    }

    const listItems: RecipeListItem[] = drawSections
        ? [
            {kind: "heading", id: "favourites", label: "FAVOURITES"},
            ...favouriteRecipes.map((recipe, recipeIndex) => (
                {kind: "recipe" as const, recipe, recipeIndex}
            )),
            {kind: "heading", id: "all", label: "ALL RECIPES"},
            ...otherRecipes.map((recipe, index) => (
                {kind: "recipe" as const, recipe, recipeIndex: favouriteRecipes.length + index}
            ))
        ]
        : shownRecipes.map((recipe, recipeIndex) => (
            {kind: "recipe" as const, recipe, recipeIndex}
        ));
    // The empty branch gates on what the list actually draws, not on the
    // query's count. While picking with SELECTED on, the rows come from the
    // whole table rather than the query, so `library.recipes.length` and the
    // rendered rows disagree in both directions: an empty query would paint NO
    // MATCHES over the ticked members, and a matching query with nothing ticked
    // would draw a blank area.
    const listEmpty = listItems.length === 0;
    // SELECTED is on and the shelf being built has nothing on it. Its own line,
    // not the search-and-filter one, because nothing was searched for.
    const nothingTicked = picker.active && onlySelected && listEmpty;

    // `importId` used to do double duty -- "is the sheet open" and "what to
    // import" -- which is why `""` meant open-with-nothing and `null` meant
    // closed. Two questions, two answers. Whether the field is drawn is no
    // longer a third: that rule moved into `useRecipeImport` (`showField`), so
    // the screen only owns "is the sheet open".
    const [importOpen, setImportOpen] = useState(false);

    // Whether the coffee-or-tea chooser is open. Separate from `importOpen`:
    // the two sheets are different questions and only ever one is up.
    const [newOpen, setNewOpen] = useState(false);

    // The web URL of the share intent we have already acted on, so a re-delivery
    // of the *same* payload is ignored. expo-share-intent can hand the same
    // intent back more than once -- `useShareIntent` re-runs its refresh on a new
    // `options` identity (a literal passed by `_layout`) and recreates
    // `resetShareIntent` every render, and `resetOnBackground` re-fires across a
    // foreground transition -- and without this each delivery pushed another
    // editor, stacking two screens for one shared link.
    //
    // A redelivery and a deliberate re-share of the same link are *identical* in
    // `hasShareIntent`/`shareIntent`: both are `false -> true` with the same
    // `webUrl`. So the guard cannot be cleared on the intent going away -- that
    // absence is one we cause ourselves by calling `resetShareIntent`, which
    // fires between the first handling and the redelivery and would forget the
    // payload just in time to import it again (the race the previous fix only
    // sometimes won). What actually tells the two apart is the user: a
    // deliberate re-share happens only after they backed out of the editor this
    // import opened and returned *here*. So the guard is cleared on this screen
    // regaining focus (the `useFocusEffect` below) -- an explicit user action --
    // and never on the mere absence of an intent.
    const handledShareUrl = useRef<string | null>(null);
    // The share URL present on the *previous* render, so the effect can act on a
    // genuinely new delivery rather than on a live intent merely continuing to
    // sit there. A dropped redelivery is not consumed by `resetShareIntent`
    // (there is nothing left to import), so `hasShareIntent` stays true with the
    // same `webUrl` until the next focus clears the guard -- at which point the
    // guard alone would let that still-live intent re-import. Keyed on the URL
    // going from absent (or different) to present, the effect ignores that
    // unchanged intent no matter when focus lands, while a deliberate re-share --
    // which the app's own `resetShareIntent` first drives to absent -- still
    // reads as a fresh delivery.
    const lastSeenShareUrl = useRef<string | null>(null);

    // True from the moment a push to the editor is issued until a library screen
    // is focused again. Everything upstream of this guards one particular way a
    // recipe can arrive twice -- a redelivered share intent, a double tap, a
    // paste racing a share -- and each of those guards has to model its own
    // source correctly to work. This one models nothing: opening a second editor
    // while the first is still opening is never what the user asked for,
    // whatever produced the second recipe.
    //
    // Deliberately module state rather than a ref. The bug this exists to stop
    // was two library screens mounted at once, each importing the same shared
    // link, and a ref would have given each of them its own private guard and
    // caught nothing. `+native-intent` stops that pair from forming; this is
    // what holds if anything ever mounts a second one again.

    const importer = useRecipeImport({
        stored:       () => library.allRecipes(),
        onOpenRecipe: (recipe, isExisting) => {
            setImportOpen(false);
            // Ask to navigate first: a recipe that arrives while an editor is
            // already opening is dropped whole, and a dropped arrival must not
            // announce itself either.
            if (!openRecipe(recipe)) {
                return;
            }
            if (isExisting) {
                // The same words a card read already uses when it turns out the
                // library has this one. `resolveOnOpen` never makes a copy, so
                // opening the existing recipe is the whole reveal.
                notify({tone: "info", message: ALREADY_IN_LIBRARY});
            }
        }
    });

    // The URL of a live web-URL share intent, or null when there is none. A
    // redelivery of the same payload and a deliberate re-share both surface here
    // as the same string; the effect below tells them apart by *when* the URL
    // appears, not by the value.
    const liveShareUrl =
        hasShareIntent && shareIntent.type === "weburl" && shareIntent.webUrl
            ? shareIntent.webUrl
            : null;
    // A failed shared lookup has nothing left to guard, and its intent is
    // already consumed. Read as a primitive so the clearing effect depends on
    // the status, not on the per-render `importer` identity.
    const importStatus = importer.state.status;

    // The header owns the whole strip, so the navigator's own bar would be a
    // second title above ours.
    useEffect(() => {
        navigation.setOptions({headerShown: false});
    }, [navigation]);

    useFocusEffect(
        React.useCallback(() => {
            library.refresh();
            // The bean picker offers what the user's own brews carry, and they
            // have been brewing, rating and deleting on screens this one stays
            // mounted behind.
            beanFilters.refresh();
            // Back from the editor, so the next recipe to arrive is a new
            // journey and may open one of its own.
            lastEditorPushAt = 0;
            lastBrewPushRef.current = 0;
            // And for the same reason, the app-wide double-tap guard. It is a
            // blunt instrument that only knows how long ago a move was made,
            // and returning here is better evidence than any elapsed time that
            // the move is over. Without this it would outlive the screen-level
            // guards above and refuse a second, deliberate visit that they had
            // deliberately allowed.
            forgetLastMove();
            // Regaining focus is the one signal that separates a redelivery of a
            // shared link from a deliberate re-share of it: a re-share only
            // happens after the user left the editor this import opened and came
            // back here, whereas a redelivery arrives while that editor is still
            // opening or open and this screen never re-focuses. So this is where
            // the share guard is forgotten -- an explicit return by the user,
            // not the absence of an intent, which we cause ourselves.
            handledShareUrl.current = null;
            // Refreshing on focus is how a recipe saved in the editor appears
            // here. `library` is rebuilt every render, so depending on it would
            // re-run this on every render instead of on every focus.
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [])
    );

    useEffect(() => {
        // `useShareIntent` recreates `resetShareIntent` every render and hands a
        // redelivery back as a fresh object, so this effect re-runs over one
        // unchanging intent again and again. Acting only when the live URL
        // *differs from the one present last render* is what makes a redelivery
        // -- the same URL still sitting there -- a no-op, whether it arrives
        // while the editor is opening or survives untouched to a later focus.
        // The previous guard leaned on focus never landing during a redelivery;
        // but a dropped redelivery is never consumed, so it outlived the focus
        // that then cleared the guard and re-imported. A deliberate re-share is
        // a real change: the app reset the intent after handling, so the URL was
        // absent in between and reappears as a genuine new delivery.
        const previousUrl = lastSeenShareUrl.current;
        lastSeenShareUrl.current = liveShareUrl;
        if (!liveShareUrl || liveShareUrl === previousUrl) {
            // No live intent, or the same one we already saw last render. The
            // guard is *not* cleared here: that absence is one we cause by
            // calling `resetShareIntent` after handling, and clearing on it is
            // exactly what let a redelivery re-import. The guard is cleared only
            // when the user returns to this screen (the `useFocusEffect` above).
            return;
        }
        if (handledShareUrl.current === liveShareUrl) {
            // A genuinely new delivery, but of a payload we already acted on: the
            // redelivery that follows the reset we caused. Consume it so it
            // cannot linger in `useShareIntent` and re-fire across a foreground.
            resetShareIntent();
            return;
        }
        handledShareUrl.current = liveShareUrl;
        // The screen no longer knows what an xBloom link looks like. One module
        // does, and it is the same one the field uses -- two that had to agree
        // eventually would not.
        const source = parseImportInput(liveShareUrl);
        if (source) {
            // Reacting to an inbound share intent — an external system pushing
            // into React, which is what effects are for. The field is hidden by
            // the hook's `"shared"` path, not here; and if the lookup fails the
            // hook restores the field without focus, so the keyboard does not
            // ambush someone whose attention is still in the app they shared
            // from.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setImportOpen(true);
            importer.resolveNow(source, "shared");
        }
        resetShareIntent();
        // `importer` is rebuilt every render; depending on it would re-run this
        // on every render instead of on every intent.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [liveShareUrl, resetShareIntent]);

    useEffect(() => {
        // A shared link that failed (network down, not found) leaves its guard
        // set while its intent is already consumed, so re-sharing the same link
        // to retry would be dropped until the user navigated away and back. An
        // error has nothing left to guard against a redelivery of, so forget it
        // and let a retry land. A fresh delivery is still required to act (see
        // the share effect), so clearing here cannot re-run the failed import on
        // its own.
        if (importStatus === "error") {
            handledShareUrl.current = null;
        }
    }, [importStatus]);

    async function progressCallback(progress: number): Promise<string | undefined> {
        if (Platform.OS === "ios") {
            // The placement teaching rather than a percentage: a read reports
            // only 30, 50 and 80, so a number here would be precise-looking
            // and wrong, and the sheet already has its own spinner.
            setNfcAlertIOS(progress >= 100
                ? "Recipe read from card"
                : HOLD_CARD);
        }
        setReadProgress(progress);
        return undefined;
    }

    async function readCard() {
        setScanning(true);
        setReadProgress(0);
        try {
            const recipe = new Recipe();
            const success = await recipe.readCard(nfc, progressCallback, (capture) => {
                // Persisted before `parseData` runs (the sink fires first), so a
                // crash on a bypass card leaves the raw bytes recoverable from
                // Settings → the card-read diagnostic rather than lost.
                setLastCardRead(serialiseCapture(capture));
            });
            setScanning(false);
            if (!success) {
                // A false result now means one thing only: the user cancelled.
                // Every real failure -- a card `parseData` cannot handle, a read
                // that yields no bytes -- throws out of `readCard` and lands in
                // the catch below. So silence here is the user getting what they
                // asked for, not a swallowed error.
                return;
            }

            // Stamped before serialising: the editor rebuilds the recipe from
            // this JSON, so anything set afterwards would be lost.
            recipe.source = "read";
            const {recipe: toOpen, isExisting} = resolveOnOpen(library.allRecipes(), recipe);

            // A successful read needs no announcement: the editor opens on top
            // of this screen with the recipe in it, which says it better than a
            // toast could. The one thing the editor cannot say for itself is
            // why Save arrives disabled, so that message stays.
            //
            // No `saveEnabled` param: the editor lets any recipe be saved now,
            // including one that will not write, so there is nothing left for a
            // caller to disable.
            if (!openRecipe(toOpen)) {
                return;
            }
            if (isExisting) {
                notify({tone: "info", message: ALREADY_IN_LIBRARY});
            }
        } catch {
            setScanning(false);
            // A cancelled scan throws. That is the user getting what they
            // asked for, not a failure to report.
            if (!nfc.wasCancelled()) {
                notify({tone: "error", message: CARD_READ_FAILED});
            }
        }
    }

    async function cancelScan() {
        await nfc.cancel();
        setScanning(false);
    }

    /**
     * @returns whether the machine answered -- the refresh control's whole
     * input, so it can show the wait rather than guess at how long one lasts.
     */
    async function refreshWater(): Promise<boolean> {
        // Asking for the water level opens a BLE session and makes the machine
        // beep — only do it when the user explicitly asks.
        const answered = await machine.askHowItIsDoing();
        if (answered && machine.info !== null) {
            const {waterEnough, waterFeed, mode, grindSize} = machine.info;
            setMachineVitals({waterEnough, waterFeed, mode, grindSize, askedAt: Date.now()});
        }
        return answered;
    }

    function openRecipe(recipe: Recipe): boolean {
        if (Date.now() - lastEditorPushAt < EDITOR_PUSH_GUARD_MS) {
            return false;
        }
        lastEditorPushAt = Date.now();
        // Every route into the editor comes through here: a card read, an
        // import, a tap on a row that is already saved, and a recipe written
        // from scratch. The accent is settled here rather than on save, so the
        // colour the user edits under is the colour the library row gets.
        // `assignAccent` is idempotent: a
        // row that already holds a valid index for its half is left untouched,
        // so re-settling a saved recipe on the way in does not repaint it. The
        // two rows it does touch are a legacy recipe saved before the index
        // existed and one whose cup type has crossed between coffee and tea;
        // both then match the editor, which is what we want.
        assignAccent(recipe, library.allRecipes());
        router.push({
            pathname: "/editRecipe",
            params:   {recipeJSON: JSON.stringify(recipe)}
        });
        return true;
    }

    function createRecipe(group: AccentGroup): void {
        // Close the chooser regardless of what `openRecipe` decides. The only
        // way it refuses is the 2 s push guard rejecting a double-tap, and in
        // that case leaving the sheet open would just invite another tap into
        // the same rejected push; the user's next deliberate attempt reopens it.
        setNewOpen(false);
        // Straight to `openRecipe`, so a new recipe gets the same push guard
        // and the same accent settling as a read or an import.
        openRecipe(blankRecipe(group));
    }

    function openBrew(recipe: Recipe): void {
        // There is one machine, and `LiveBrewProvider.start` refuses a second
        // run while the first is still going. Without this the tap would push
        // a brew screen that quietly showed the *other* recipe brewing, which
        // reads as the app having started the wrong thing.
        if (liveRun !== null
            && !OVER.has(liveRun.phase.name)
            && liveRun.recipe.uuid !== recipe.uuid) {
            notify({
                tone:    "info",
                message: `The machine is busy brewing ${liveRun.recipe.displayName()}.`
            });
            return;
        }
        // eslint-disable-next-line react-hooks/purity
        if (Date.now() - lastBrewPushRef.current < EDITOR_PUSH_GUARD_MS) {
            return;
        }
        // eslint-disable-next-line react-hooks/purity
        lastBrewPushRef.current = Date.now();
        router.push({
            pathname: "/brew",
            params:   {recipeJSON: JSON.stringify(recipe)}
        });
    }

    async function shareFromHome(recipe: Recipe): Promise<void> {
        // The same shape as the editor's share: ask first whether the recipe
        // can be shared at all, mint a link, remember it, then hand it to the
        // system sheet. The `share` hook owns the "cannot share" message, so a
        // blocked recipe only reports and mints nothing.
        if (shareBlockReason(recipe) !== null) {
            await shareRecipe(recipe);
            return;
        }
        const url = await shareRecipe(recipe);
        if (!url) {
            return;
        }
        // Persist the minted link onto the stored recipe so a second share of
        // the unchanged recipe returns it rather than minting a second permanent
        // copy. Best-effort: the share itself has already happened either way.
        try {
            new RecipeDatabase().updateRecipe(recipe.uuid, recipe);
        } catch {
            // The link is still live in memory for this session.
        }
        try {
            await Share.share({message: url});
        } catch {
            // The user dismissing the system sheet throws on some platforms.
            // Nothing failed; there is nothing to say.
        }
    }

    // The import sheet, the new-recipe chooser, the sort sheet and phase 4's two
    // shelf sheets each cover the screen while open, and the NFC ceremony while
    // a scan is running. All of them hide the subtree below from the reader.
    // Every open sheet has to be named here: on Android a Tamagui sheet renders
    // as a sibling and isolates nothing on its own, so one left out leaves the
    // library reachable underneath it.
    const screenCovered = scanning || importOpen || newOpen || sortOpen || showNfcOverlay
        || namingShelf || renamingShelf !== null || shelfActions !== null
        || deletingShelf !== null || beanFilterOpen
        || removingShelf !== null || overflowRecipe !== null;

    // The sheet's own row, reachable without the long press that opens it. A
    // reader cannot make that gesture, so every verb the sheet offers is also an
    // accessibility action on the tile and the row, and this is the one of them
    // no swipe tray already carries.
    function openHistory(recipe: Recipe) {
        router.push(`/brewHistory?recipeUuid=${recipe.uuid}`);
    }

    // Every act the shelf room can perform on one of its recipes, built once here
    // and handed to the room per tile. It is the same set the swipe tray offers a
    // list row -- brew (only with a machine, the tray's own rule), share, write,
    // duplicate, star, delete -- plus the two doors onto them: a tap opens the
    // editor, a long press opens the shared actions sheet. Sharing one builder
    // keeps a tile and a row from drifting about what a recipe can do.
    const roomActionsFor = (recipe: Recipe): RoomRecipeActions => ({
        onOpen:            () => openRecipe(recipe),
        onLongPress:       () => setOverflowRecipe(recipe),
        onBrew:            remembered !== "" ? () => openBrew(recipe) : undefined,
        onShare:           () => shareFromHome(recipe),
        onWrite:           () => writeCard(recipe),
        onDuplicate:       () => library.duplicateRecipe(recipe),
        onDelete:          () => library.deleteRecipe(recipe),
        onToggleFavourite: () => library.toggleFavourite(recipe),
        onHistory:         () => openHistory(recipe)
    });

    // The shelf standing open, found by the id the query holds. Its label and
    // kind come from the same `buildShelves` the grid drew, so the room names the
    // shelf exactly as its tile did; `filterLabel` is the fallback for the gap
    // between a shelf being cleared and the room closing. The count under the
    // name is the room's own, counted from the recipes it drew rather than the
    // shelf's library-wide tally: the two agree except in the instant a delete
    // is settling, and what is on screen is the honest answer.
    const openShelf = shelves.find((shelf) => shelf.id === libraryQuery.openShelfId);

    return (
        <>
            {/* The NFC ceremony is a modal moment, and an absolutely positioned
                overlay only covers the screen visually. While it -- or the
                import sheet, the new-recipe chooser or the sort sheet, all
                non-modal Tamagui sheets that render as a sibling of this screen
                rather than through a native Modal and so isolate nothing on
                Android -- is
                up, this subtree hides its own descendants from the screen
                reader, so TalkBack cannot reach and fire the controls behind it
                — the Android half of what `accessibilityViewIsModal` does on
                iOS. The sheets are rendered outside this guarded subtree, so
                they never hide themselves. */}
            <YStack flex={1} backgroundColor={palette.base}
                    accessibilityElementsHidden={screenCovered}
                    importantForAccessibility={screenCovered ? "no-hide-descendants" : "auto"}>
                {picker.active ? (
                    <ShelfPickerHeader
                        title={editingTag ?? "NEW SHELF"}
                        count={picker.count}
                        onCancel={stopPicking}
                        onActions={editingTag === null
                            ? undefined
                            : () => setShelfActions(editingTag)}/>
                ) : (
                <HomeHeader
                    count={library.librarySize}
                    collapsed={collapsed}
                    canImport
                    // Shown whether or not a machine has ever been paired. It
                    // was hidden until one was remembered, which meant the one
                    // control that connects a machine only appeared once you
                    // had connected one: a first-time user had nowhere to
                    // start. Idle draws grey and the panel offers TRY NOW,
                    // which scans and remembers, so the first connection now
                    // happens through the same drawer as every one after it.
                    // With nothing remembered the dot is idle whatever the
                    // link last said. There is nothing to be out of range
                    // from, and forgetting a machine leaves the link on its
                    // last status, which would otherwise show a faint red
                    // "not in range" to someone who has no machine at all.
                    machineStatus={remembered === "" ? "idle" : machineStatus}
                    // Derived, never stored. It becomes true the moment a
                    // connected machine answers with a low tank and no tap to
                    // draw from, which is the moment the fact becomes knowable,
                    // and false again as soon as the tank is filled and the
                    // readings refreshed. Nothing has to remember to raise or
                    // clear it, and a second connection to a machine that is
                    // still low says so again.
                    machineAlarm={
                        machineStatus === "connected"
                        && machineVitals !== null
                        && machineVitals.waterFeed !== "tap"
                        && !machineVitals.waterEnough
                    }
                    machinePanel={(
                        <MachinePanel
                            open={popoverOpen}
                            status={machineStatus}
                            accent={palette.success}
                            vitals={machineVitals}
                            now={popoverNow}
                            onRefreshWater={refreshWater}
                            onConnect={connectMachine}
                        />
                    )}
                    onMachinePress={() => {
                        setPopoverNow(Date.now());
                        setPopoverOpen((open) => !open);
                    }}
                    onMachineConnect={connectMachine}
                    onScan={readCard}
                    onImport={() => setImportOpen(true)}
                    onNew={() => setNewOpen(true)}
                    onBrewHistory={() => router.push("/brewHistory")}
                    onSettings={() => router.push("/settings")}/>
                )}

                <Collapsible open={!collapsed && !picker.active}>
                    <XStack gap="$3" paddingHorizontal="$3" paddingBottom="$3">
                        <CtaTile icon="scan" label="READ CARD"
                                 accessibilityLabel="Read a card" onPress={readCard}/>
                        <ImportTile
                            onOpen={() => setImportOpen(true)}
                            onPasted={(text) => {
                                const source = parseImportInput(text);
                                setImportOpen(true);
                                // The tile's paste shortcut: atomic, but the hook
                                // degrades it to the found panel with the field
                                // shown when the recipe is already in the library,
                                // so a sticky clipboard cannot trap the user on
                                // the recipe they just imported. A value that does
                                // not parse opens the sheet with a plain field
                                // (the hook's default), indistinguishable from a
                                // plain tap.
                                if (source) importer.resolveNow(source, "shortcut");
                            }}/>
                        <CtaTile icon="plus" label="NEW"
                                 accessibilityLabel="Create a recipe"
                                 onPress={() => setNewOpen(true)}/>
                    </XStack>
                </Collapsible>

                {!wholeLibraryEmpty && (
                    <LibraryRail
                        key={libraryQuery.clearToken}
                        collapsed={collapsed}
                        onSearchChange={libraryQuery.onSearchChange}
                        sort={libraryQuery.sort}
                        direction={libraryQuery.direction}
                        onSortPress={() => setSortOpen(true)}
                        filters={railFilters}
                        onFilterPress={(id) => {
                            if (id === SELECTED_CHIP) setOnlySelected((on) => !on);
                            else if (id === BEANS_CHIP) setBeanFilterOpen(true);
                            else libraryQuery.toggleFilter(id);
                        }}
                        activeFilterCount={libraryQuery.activeFilterCount}
                        // Forced open while picking, because SELECTED lives in
                        // that rail and a count the user cannot reach is the
                        // same as no count at all.
                        filtersOpen={libraryQuery.filterRailOpen || picker.active}
                        picking={picker.active}
                        onFilterToggle={libraryQuery.toggleFilterRail}
                        view={libraryQuery.view}
                        onViewChange={libraryQuery.onViewChange}
                        // Offered where there are recipes on screen to act on:
                        // the list, and a shelf standing open. The shelf grid
                        // draws shelves, and edit has nothing to say about a
                        // shelf, so it is left out there exactly as sort and
                        // filter are.
                        editing={editing}
                        onToggleEdit={
                            libraryQuery.view === "list" || inShelfRoom
                                ? () => setEditing((current) => !current)
                                : undefined
                        }/>
                )}

                {wholeLibraryEmpty ? (
                    <EmptyLibrary/>
                ) : inShelfRoom && !picker.active ? (
                    // A shelf opened into itself, ahead of the grid branch it
                    // replaces: same view, same rail, but the squares now carry
                    // this shelf's recipes rather than the shelves. Not drawn
                    // while picking, the same guard the grid carries, because a
                    // room's tiles are not selectable and the picker's rows are
                    // where members are chosen.
                    <ShelfRoom
                        label={openShelf?.label ?? filterLabel(libraryQuery.openShelfId ?? "")}
                        manual={openShelf?.kind === "manual"}
                        recipes={library.recipes}
                        onBack={libraryQuery.closeShelf}
                        onScroll={onScroll}
                        actionsFor={roomActionsFor}
                        evidence={library.evidence}
                        showCoffeeMarker={showCoffeeMarker}
                        dottedProfile={dottedProfile}
                        editing={editing}
                        paddingBottom={insets.bottom + 8}/>
                ) : libraryQuery.view === "shelves" && !picker.active ? (
                    // The grid steps aside while picking without changing the
                    // remembered view, so cancelling puts the user back where
                    // they pressed NEW SHELF. Members are chosen from rows: a
                    // grid of shelves has nothing on it to tick.
                    // Ahead of the empty-query branch on purpose. The grid is a
                    // way out of a narrowing that matched nothing, so a view
                    // that showed NO MATCHES instead of the shelves would hide
                    // the control the user came to it for.
                    <ShelfGrid shelves={shelves}
                               marks={library.shelfMarks}
                               invertAuto={invertAutoShelves}
                               hidden={parseHidden(hiddenShelves)}
                               onOpen={libraryQuery.openShelf}
                               onNewShelf={picker.startCreating}
                               onShelfActions={setShelfActions}
                               onHideShelf={(id) =>
                                   setHiddenShelves(toggleHidden(hiddenShelves, id))}
                               onScroll={onScroll}
                               paddingBottom={insets.bottom + 8}/>
                ) : listEmpty ? (
                    nothingTicked ? (
                        <EmptySelection/>
                    ) : (
                        <EmptyQuery
                            search={libraryQuery.query.search}
                            filters={activeFilterLabels}
                            onClear={libraryQuery.clear}/>
                    )
                ) : (
                    <FlatList
                        data={listItems}
                        // Namespaced rather than raw, because the two kinds draw
                        // their keys from different vocabularies that are not
                        // guaranteed to be disjoint: a heading's id is a word
                        // like "favourites", and a recipe's uuid is any string a
                        // backup was willing to carry. A restored recipe whose
                        // uuid happened to be "favourites" would collide with
                        // the heading and have its row recycled into the wrong
                        // place. The prefix costs nothing and removes the
                        // question.
                        keyExtractor={(item: RecipeListItem) =>
                            item.kind === "heading"
                                ? `heading:${item.id}`
                                : `recipe:${item.recipe.key}`}
                        onScroll={onScroll}
                        scrollEventThrottle={16}
                        showsVerticalScrollIndicator={false}
                        // The list runs to the bottom of the display and the
                        // last card scrolls clear of the home indicator, rather
                        // than the whole screen stopping short of it.
                        contentContainerStyle={{
                            paddingBottom: insets.bottom + 8
                                + (picker.active ? PICKER_BAR_HEIGHT : 0)
                        }}
                        renderItem={({item}: {item: RecipeListItem}) => item.kind === "heading" ? (
                            <SectionHeading label={item.label}/>
                        ) : picker.active ? (
                            <SelectableRecipeRow
                                recipe={item.recipe}
                                selected={picker.selected.has(item.recipe.uuid)}
                                onToggle={() => picker.toggle(item.recipe.uuid)}
                                showCoffeeMarker={showCoffeeMarker}
                                dottedProfile={dottedProfile}/>
                        ) : (
                            <SwipeableRecipeRow
                                recipe={item.recipe}
                                editing={editing}
                                showCoffeeMarker={showCoffeeMarker}
                                dottedProfile={dottedProfile}
                                evidence={library.evidence[item.recipe.uuid]}
                                bounceOnMount={item.recipeIndex === 0 && bounceFirstRow}
                                onBounced={retireBounce}
                                // Gated on a machine: a dead BREW in every row's
                                // tray is worse than none. Share and write need
                                // no machine, so they are always offered.
                                onBrew={remembered !== "" ? () => openBrew(item.recipe) : undefined}
                                onShare={() => shareFromHome(item.recipe)}
                                onWrite={() => writeCard(item.recipe)}
                                onPress={() => openRecipe(item.recipe)}
                                // The row's second door onto the actions sheet:
                                // the same long press a shelf-room tile carries,
                                // so both idioms open the one sheet rather than
                                // two lists that can drift. The swipe trays keep
                                // their tiles; this is an addition, not a
                                // replacement.
                                onLongPress={() => setOverflowRecipe(item.recipe)}
                                onHistory={() => openHistory(item.recipe)}
                                onDelete={() => {
                                    setBounceFirstRow(false);
                                    library.deleteRecipe(item.recipe);
                                }}
                                onDuplicate={() => {
                                    setBounceFirstRow(false);
                                    library.duplicateRecipe(item.recipe);
                                }}
                                onToggleFavourite={() => {
                                    setBounceFirstRow(false);
                                    library.toggleFavourite(item.recipe);
                                }}/>
                        )}/>
                )}
            </YStack>

            {/* Hidden while a sheet covers the screen. `screenCovered` guards the
                main stack, which ends above this, so without this the bar stayed
                in the accessibility tree underneath the naming and removal
                sheets: on Android, where a sheet does not hide its siblings,
                TalkBack could focus and press DONE on a screen the user was not
                looking at. */}
            {picker.active && !screenCovered && (
                <ShelfPickerBar count={picker.count}
                                editing={picker.mode.kind === "editing"}
                                paddingBottom={insets.bottom}
                                onCancel={stopPicking}
                                onDone={finishPicking}/>
            )}

            <RemoveShelfSheet open={removingShelf !== null}
                              tag={removingShelf ?? ""}
                              onOpenChange={(next) => {
                                  // Dismissing keeps the picker open on the
                                  // shelf it was editing, so backing out of the
                                  // question is not backing out of the edit.
                                  if (!next) setRemovingShelf(null);
                              }}
                              onRemove={() => {
                                  if (removingShelf !== null) {
                                      reportShelfWrite(
                                          library.setShelfMembers(removingShelf, [])
                                      );
                                  }
                                  setRemovingShelf(null);
                                  stopPicking();
                              }}/>

            <NameShelfSheet open={namingShelf} count={picker.count}
                            onOpenChange={setNamingShelf}
                            onName={nameShelf}/>

            <ShelfOverflowSheet
                open={shelfActions !== null}
                shelf={shelfActions ?? ""}
                count={shelfActions === null ? 0 : shelfSize(shelfActions)}
                onOpenChange={(next) => {
                    if (!next) setShelfActions(null);
                }}
                // Withheld from the picker's own door: the user is already
                // inside the edit this row would start.
                onEdit={picker.active || shelfActions === null
                    ? undefined
                    : () => beginEditingShelf(shelfActions)}
                onRename={() => {
                    // Renaming saves the ticks along with the name, so the
                    // shelf has to be under edit for there to be ticks to save.
                    // From the grid there is no edit running yet, and this
                    // starts one the user never sees: the sheet opens over it
                    // and closing either way ends it.
                    const starting = !picker.active && shelfActions !== null;
                    if (starting) beginEditingShelf(shelfActions);
                    setRenameStartedEdit(starting);
                    setRenamingShelf(shelfActions);
                }}
                onDuplicate={() => {
                    if (shelfActions !== null) duplicateShelf(shelfActions);
                }}
                onDelete={() => setDeletingShelf(shelfActions)}/>

            <RemoveShelfSheet open={deletingShelf !== null}
                              tag={deletingShelf ?? ""}
                              emptied={false}
                              onOpenChange={(next) => {
                                  if (!next) setDeletingShelf(null);
                              }}
                              onRemove={() => {
                                  if (deletingShelf !== null) deleteShelf(deletingShelf);
                              }}/>

            <NameShelfSheet open={renamingShelf !== null} count={picker.count}
                            current={renamingShelf ?? undefined}
                            onOpenChange={(next) => {
                                if (next) return;
                                setRenamingShelf(null);
                                // Only the edit this rename started. One the
                                // user opened for themselves is theirs to
                                // finish, and cancelling a name is not
                                // cancelling their ticks.
                                if (renameStartedEdit) {
                                    setRenameStartedEdit(false);
                                    stopPicking();
                                }
                            }}
                            onName={renameShelf}/>

            <SortSheet
                open={sortOpen}
                onOpenChange={setSortOpen}
                sort={libraryQuery.sort}
                direction={libraryQuery.direction}
                favouritesFirst={libraryQuery.favouritesFirst}
                onSortChange={libraryQuery.onSortChange}
                onFavouritesFirstChange={libraryQuery.onFavouritesFirstChange}/>

            <BeanFilterSheet
                open={beanFilterOpen}
                onOpenChange={setBeanFilterOpen}
                vocabulary={beanFilters.vocabulary}
                selected={beanFilters.selected}
                ratedOnly={beanFilters.ratedOnly}
                onRatedOnlyChange={beanFilters.setRatedOnly}
                onChange={beanFilters.setValues}/>

            {/* The library's one door onto the recipe-actions sheet, opened by a
                long press on a shelf-room tile or a list row. One sheet for the
                whole screen, keyed by which recipe is held: the shelf variant
                (brew, write, share, duplicate, star, delete) with none of the
                editor's own rows, because it is handed none of their handlers.
                Brew follows the swipe tray's rule and is offered only with a
                machine. The handlers close over the held recipe, and every one
                is guarded because the value is null whenever the sheet is shut --
                which is exactly when none of them can be pressed. */}
            <RecipeOverflowSheet
                open={overflowRecipe !== null}
                onOpenChange={(next) => {
                    if (!next) setOverflowRecipe(null);
                }}
                recipeUuid={overflowRecipe?.uuid}
                canRefreshName={false}
                favourite={overflowRecipe?.favourite ?? false}
                onBrew={overflowRecipe !== null && remembered !== ""
                    ? () => openBrew(overflowRecipe)
                    : undefined}
                // The same gate the swipe tray and both sets of accessibility
                // actions apply. Without it the long press was the one door that
                // offered a write on a recipe no card can hold, and the offer
                // could only be discovered to be empty by taking it.
                onWrite={overflowRecipe !== null && canWriteToCard(overflowRecipe)
                    ? () => writeCard(overflowRecipe)
                    : undefined}
                onShare={() => {
                    if (overflowRecipe !== null) shareFromHome(overflowRecipe);
                }}
                onDuplicate={() => {
                    if (overflowRecipe !== null) library.duplicateRecipe(overflowRecipe);
                }}
                onToggleFavourite={overflowRecipe !== null
                    ? () => library.toggleFavourite(overflowRecipe)
                    : undefined}
                onDelete={() => {
                    if (overflowRecipe !== null) library.deleteRecipe(overflowRecipe);
                }}/>

            <ImportSheet
                open={importOpen}
                importer={importer}
                onOpenChange={(open) => {
                    setImportOpen(open);
                    if (!open) {
                        importer.reset();
                        library.refresh();
                    }
                }}/>

            <NewRecipeSheet open={newOpen} onOpenChange={setNewOpen}
                            onChoose={createRecipe}/>

            <NfcOverlay visible={scanning} mode="read" progress={readProgress}
                        onCancel={cancelScan}/>

            {/* The write ceremony, hosted the same way the editor hosts it. A
                second overlay rather than a shared one because reading and
                writing are separate transports and only ever one is visible. */}
            <NfcOverlay visible={showNfcOverlay} mode="write" progress={writeProgress}
                        onCancel={onNFCDialogClose}/>
        </>
    );
}

import React, {useEffect} from "react";
import {ScrollView} from "react-native";
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from "react-native-reanimated";
import {XStack} from "tamagui";

import RailChip from "@/components/RailChip";
import {RailSearchChip, RailSearchField} from "@/components/RailSearch";
import RailViewToggle, {type ViewToggleOption} from "@/components/RailViewToggle";
import {DURATION, EASING, useReducedMotion} from "@/constants/motion";
import {useRailSearch} from "@/hooks/useRailSearch";
import {type LibraryView} from "@/library/libraryView";
import {
    chipLabel,
    isDefaultSort,
    SORT_AXES,
    type SortAxis,
    type SortDirection
} from "@/library/librarySort";

/** The rail's own vertical padding when expanded, and when shrunk to make room. */
const RAIL_PADDING = 10;
/**
 * The floor the top rail shrinks to. Not two: device review read a two-point
 * band under the chips as a clipped edge rather than a margin, so this is the
 * smallest gap that still reads as deliberate spacing. The chips stay 44 either
 * way; this is the rail's breathing room, not a touch target.
 */
const RAIL_PADDING_SHRUNK = 6;

/** The gap between chips, both in the pinned cluster and the scrolling row. */
const CHIP_GAP = 8;

/** How far the filter rail rises into place as it reveals. Spatial, so it lives here. */
const FILTER_RAIL_RISE = 8;

/** A filter the rail has been handed to draw. Deriving this list is not the rail's job. */
export type RailFilter = {
    id: string;
    /** The chip's word, in Doto caps. */
    label: string;
    active: boolean;
};

type Props = {
    /**
     * Whether the list has scrolled far enough that the rail should give up its
     * padding. Driven from outside, not sensed here: see the note on the shrink
     * below.
     */
    collapsed: boolean;
    /**
     * The debounced search term. The rail owns the field, its expansion and its
     * timer through `RailSearch`; the owner is handed only the settled string.
     */
    onSearchChange: (term: string) => void;
    /** The current sort, so the sort chip can name its axis once it leaves the default. */
    sort: SortAxis;
    direction: SortDirection;
    onSortPress: () => void;
    /** The filter chips to draw, in the order they should appear. */
    filters: readonly RailFilter[];
    onFilterPress: (id: string) => void;
    /** How many filters are applied, for the button's count and fill. */
    activeFilterCount: number;
    /** Which of the two library views is showing. */
    view: LibraryView;
    onViewChange: (view: LibraryView) => void;
    /** Whether the filter rail is showing. Derived by the owner, not stored here. */
    filtersOpen: boolean;
    /**
     * Members are being chosen for a shelf.
     *
     * The rail stays: a picker that could not be filtered or searched would make
     * the user scroll their whole library to build a shelf out of four recipes.
     */
    picking?: boolean;
    /** Reveal or hide the filter rail. */
    onFilterToggle: () => void;
    /**
     * Whether the rows are in edit mode, and the handle to turn it on and off.
     *
     * Edit used to sit in the top bar, next to the wordmark and settings. It
     * belongs here instead: it acts on the recipes on screen, which is what
     * every other control on this rail does, and the top bar had six touch
     * targets fighting for the width beside the mark.
     *
     * Omitted rather than disabled where there is nothing to edit, the same way
     * search and sort are: the shelf grid draws shelves, not recipes.
     */
    editing?: boolean;
    onToggleEdit?: () => void;
};

// Locale-independent on purpose. These labels are a fixed English vocabulary,
// and `toLocaleLowerCase` would case them by the device's language: on a Turkish
// locale "SINGLE POUR" comes back "sıngle pour", so the reader speaks a
// misspelling of a word the user cannot have chosen a spelling for.
function sentenceCase(label: string): string {
    const lower = label.toLowerCase();
    const sentence = `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    return sentence.replace(/xbloom/i, "xBloom");
}

/**
 * The two halves of the view pair, drawn as glyphs.
 *
 * Both are always on screen and the active one is lit, which is the design's
 * whole argument for a pair over a toggling icon: a single grid glyph might mean
 * "you are in grid" or "tap for grid", and users of the same app disagree about
 * which. Glyphs rather than words because the pair shares a row with search,
 * sort and filter, and two words here is a third of the row; the labels are kept
 * and are what a screen reader announces, so nothing is lost but ink.
 */
const VIEW_OPTIONS: readonly ViewToggleOption<LibraryView>[] = [
    {value: "list", label: "List", icon: "list"},
    {value: "shelves", label: "Shelves", icon: "shelves"}
];

function sortAccessibilityLabel(sort: SortAxis, direction: SortDirection): string {
    const {axis, directions} = SORT_AXES[sort].spoken;
    return `Sort by ${axis}, ${directions[direction]}`;
}

function filterAccessibilityLabel(filter: RailFilter): string {
    if (filter.id.startsWith("sharedBy:")) {
        const name = filter.id.slice("sharedBy:".length).trim() || sentenceCase(filter.label);
        return `Recipes that arrived from ${name}`;
    }
    return `${sentenceCase(filter.label)} filter`;
}

/**
 * The filter button's spoken label: a full sentence that names how many filters
 * are applied and what a tap does. Singular and plural are spelled out because a
 * screen reader reads "1 filters" as wrong as it sounds. The action half is
 * unconditional because the tap is: the rail may open itself when a filter is
 * applied, but it never refuses to close.
 */
function filterToggleAccessibilityLabel(count: number, open: boolean): string {
    const applied = count === 0 ? "No filters applied"
        : count === 1 ? "1 filter applied"
            : `${count} filters applied`;
    const action = open ? "Tap to hide the filter row." : "Tap to show the filter row.";
    return `${applied}. ${action}`;
}

/**
 * The scrolling row of filter chips, revealed beneath the top rail on demand.
 *
 * Its own component, and module scope like everything in this file, so that it
 * mounts only when open and its reveal value resets with it -- a component
 * declared inside the rail's body would be a fresh type every render, remount,
 * and throw its animation away. The reveal rides a shared value the same way the
 * top rail's shrink does: under Reduced Motion it arrives outright, otherwise it
 * fades and rises the base duration.
 *
 * Full screen width by design: the filters left the top rail precisely so they
 * would not be squeezed into the budget the pinned controls leave, so here they
 * get the whole width and a scroll that is a scroll rather than a cliff.
 */
function FilterRail({
    filters,
    onFilterPress
}: {
    filters: readonly RailFilter[];
    onFilterPress: (id: string) => void;
}) {
    const reduced = useReducedMotion();
    const reveal = useSharedValue(reduced ? 1 : 0);

    useEffect(() => {
        reveal.value = reduced
            ? 1
            : withTiming(1, {duration: DURATION.base, easing: EASING.out});
    }, [reduced, reveal]);

    const enter = useAnimatedStyle(() => ({
        opacity:   reveal.value,
        transform: [{translateY: (1 - reveal.value) * -FILTER_RAIL_RISE}]
    }));

    return (
        <Animated.View style={enter}>
            <ScrollView testID="rail-filter-row"
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        accessibilityRole="list"
                        accessibilityLabel="Recipe filters"
                        contentContainerStyle={{
                            gap:               CHIP_GAP,
                            alignItems:        "center",
                            paddingHorizontal: 12,
                            paddingTop:        CHIP_GAP
                        }}>
                {filters.map((filter) => (
                    <RailChip key={filter.id} testID={`rail-filter-${filter.id}`}
                              active={filter.active} label={filter.label}
                              accessibilityLabel={filterAccessibilityLabel(filter)}
                              onPress={() => onFilterPress(filter.id)}/>
                ))}
            </ScrollView>
        </Animated.View>
    );
}

/**
 * The rail: the chrome above the library that searches it, sorts it and narrows
 * it.
 *
 * Two rows now, not one. The top rail is pinned all the way across: a single
 * cluster of search, sort and a filter button, left to right, with the filter
 * button among the others rather than shoved to the trailing edge, because
 * nothing scrolls past it any more. The filter chips live on a second rail
 * beneath, drawn only when open, at the full width of the screen -- a small
 * phone could not give the pinned cluster and a filter row the same row without
 * strangling the filters, so the filters moved out. The top rail still shrinks
 * as the list scrolls by shedding its own vertical padding; the chips inside it
 * never move off 44.
 *
 * The old hairline divider is gone with the filters. It marked where the row
 * stopped being pinned, and the top rail is pinned end to end now, so a line
 * there would be ornament -- and the rule that a structural divider must never
 * be removed as ornament cuts both ways.
 *
 * The shrink rides the home screen's existing collapse rather than owning a
 * second scroll listener: `collapsed` arrives as a prop from the same
 * `useCollapsibleHeader` that drives the header above. Two listeners on one list
 * can disagree by a frame and strobe, and the rail shrinking in lockstep with
 * the header collapsing reads as one motion rather than two chasing each other.
 * Keeping the sensing outside also leaves this a pure presentational component a
 * test can drive without a ScrollView.
 *
 * Module scope, and every chip and the filter rail below are too: a component
 * declared inside another remounts on every render and throws its state away.
 */
export default function LibraryRail({
    collapsed,
    onSearchChange,
    sort,
    direction,
    onSortPress,
    filters,
    onFilterPress,
    activeFilterCount,
    filtersOpen,
    picking = false,
    onFilterToggle,
    view,
    onViewChange,
    editing = false,
    onToggleEdit
}: Props) {
    const reduced = useReducedMotion();

    // The rail owns the search state rather than the control, because the two
    // halves of that control are drawn in different places: the square sits in
    // the cluster and the field is drawn over the whole rail, so no one
    // component contains both.
    const {expanded: searchOpen, text: searchText, active: searchActive,
        onExpand, onChangeText, onBlur, onClear} = useRailSearch(onSearchChange);
    const searchState = searchActive ? `term ${searchText} active` : "no search term";

    const shrink = useSharedValue(collapsed ? 1 : 0);

    useEffect(() => {
        const target = collapsed ? 1 : 0;
        // Under Reduced Motion the rail still shrinks -- the padding is real
        // layout, not decoration -- it just arrives outright rather than easing.
        shrink.value = reduced
            ? target
            : withTiming(target, {duration: DURATION.base, easing: EASING.out});
    }, [collapsed, reduced, shrink]);

    const padding = useAnimatedStyle(() => {
        const pad = RAIL_PADDING - (RAIL_PADDING - RAIL_PADDING_SHRUNK) * shrink.value;
        return {paddingTop: pad, paddingBottom: pad};
    });

    // A sort that has left name-ascending has something to say, so the chip
    // fills and names its axis; the default sort stays a bare glyph.
    const sortActive = !isDefaultSort(sort, direction);

    // An active sort names its axis, and now keeps the word whatever search is
    // doing. Phase 3 dropped it while the field was live, to hand that width
    // over to a field that was flexed into the same row; the field is drawn over
    // the rail now, so there is no width to hand over and nothing to drop.
    const sortLabel = sortActive ? chipLabel(sort) : undefined;

    // No filters to show means no button: one that opens an empty rail is worse
    // than none at all.
    const hasFilters = filters.length > 0;

    /**
     * Whether this view is asking a question of the list.
     *
     * Search, sort and filter all narrow or order a list of recipes, so they
     * belong to the view that shows one. The grid shows shelves: there is
     * nothing to sort it by while shelf ordering is out of scope, a filter and a
     * shelf narrow the same library by the same means, and a grid of eight named
     * squares has nothing in it worth searching for. Device testing found four
     * controls fighting over a 320 pt rail; this is the half of the fix that
     * removes the ones that had nothing to do there.
     *
     * Picking is the exception, and the reason this is not simply the view: the
     * grid steps aside for rows while members are chosen, so the query controls
     * are narrowing something the user can see again.
     */
    const asksOfTheList = view === "list" || picking;

    // The pinned cluster is a list rather than a fixed set, so a view can be
    // handed the controls it needs without the rail being restructured around
    // which ones those are.
    //
    // The toggle leads in both views, and it is the only control present in
    // both: a control that moved when the views changed would be a control that
    // moved under the thumb that had just tapped it.
    const cluster = [
        // Left out while picking. The grid has nothing on it to tick, so a pair
        // whose other half ended the selection would be a way to lose a
        // half-built shelf to a single tap.
        ...(picking ? [] : [
            <RailViewToggle key="view" value={view} options={VIEW_OPTIONS}
                            accessibilityLabel="Library view"
                            onChange={onViewChange}/>
        ]),
        ...(asksOfTheList ? [
            <RailSearchChip key="search" state={searchState} onPress={onExpand}/>,
            <RailChip key="sort" testID="rail-sort" icon="sort"
                      active={sortActive}
                      label={sortLabel}
                      accessibilityLabel={sortAccessibilityLabel(sort, direction)}
                      onPress={onSortPress}/>
        ] : [])
    ];

    if (asksOfTheList && hasFilters) {
        cluster.push(
            // The count shows at all times, including "0": a hidden filter is
            // worse than a visible one, so the button never falls back to a bare
            // glyph. The fill reports whether anything is filtered -- the one
            // binary a chip's fill may carry -- and the caret reports whether the
            // rail is open, because the fill is spent on the state the user
            // cannot otherwise see.
            <RailChip key="filter" testID="rail-filter-toggle" icon="filter"
                      active={activeFilterCount > 0}
                      label={String(activeFilterCount)}
                      expanded={filtersOpen}
                      caretOpen={filtersOpen}
                      accessibilityLabel={
                          filterToggleAccessibilityLabel(activeFilterCount, filtersOpen)
                      }
                      onPress={onFilterToggle}/>
        );
    }

    // Edit is pinned to the trailing edge rather than joining the scrolling
    // cluster. It acts on the list the same way the others do, but it is the
    // one control that switches a mode rather than asking a question, and the
    // platform puts that at the trailing edge. Outside the scroller it is also
    // the one control that can never be scrolled out of reach, which matters
    // most for the one you use to get back out of editing.
    //
    // Absent while picking: ticking members is already a selection mode, and a
    // second one over the top of it would be two ways to choose at once.
    const editChip = onToggleEdit !== undefined && !picking
        ? (
            <RailChip testID="rail-edit" icon="edit"
                      active={editing}
                      accessibilityLabel={editing ? "Done editing" : "Edit recipes"}
                      onPress={onToggleEdit}/>
        )
        : null;

    return (
        <Animated.View style={padding} testID="library-rail">
            {/* The field is drawn over this row, so the row is its coordinate
                space and has to stay a positioned box even when nothing is
                drawn over it. */}
            <XStack position="relative">
                {/* Hidden from a reader while the field covers it. The controls
                    underneath are drawn over, not unmounted, so without this
                    they stayed focusable: a reader could reach and press a
                    toggle that was invisible to everyone else. Both props,
                    because they are the iOS and Android halves of the one
                    instruction and neither platform reads the other's. */}
                <XStack flex={1} alignItems="center"
                        paddingHorizontal="$3" gap={CHIP_GAP}
                        accessibilityElementsHidden={searchOpen}
                        importantForAccessibility={
                            searchOpen ? "no-hide-descendants" : "auto"
                        }>
                    {/* The cluster scrolls. Five controls, one of them a
                        segmented pair and one of them naming a sort axis, are
                        wider than a 320 pt phone, and the row used to simply
                        run off the edge with no way to reach what fell off.
                        The short axis labels keep the common case on screen;
                        this is the backstop for the rest, so a control can be
                        crowded but never lost.

                        `flexShrink` and no `flexGrow`: the scroller hugs its
                        chips while they fit, so the trailing Edit stays beside
                        them rather than being pushed to the far edge of a
                        half-empty rail, and gives way to it when they do not. */}
                    <ScrollView testID="rail-control-row"
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                style={{flexGrow: 0, flexShrink: 1}}
                                contentContainerStyle={{
                                    gap:        CHIP_GAP,
                                    alignItems: "center"
                                }}>
                        {cluster}
                    </ScrollView>
                    {editChip !== null && (
                        // Takes the leftover width so Edit sits at the trailing
                        // edge whether or not the cluster fills the rail.
                        <XStack flex={1} justifyContent="flex-end">
                            {editChip}
                        </XStack>
                    )}
                </XStack>

                {searchOpen && (
                    <XStack position="absolute" top={0} left={0} right={0} bottom={0}
                            alignItems="center" paddingHorizontal="$3">
                        <RailSearchField state={searchState} text={searchText}
                                         active={searchActive}
                                         onChangeText={onChangeText}
                                         onBlur={onBlur} onClear={onClear}/>
                    </XStack>
                )}
            </XStack>

            {asksOfTheList && hasFilters && filtersOpen && (
                <FilterRail filters={filters} onFilterPress={onFilterPress}/>
            )}
        </Animated.View>
    );
}

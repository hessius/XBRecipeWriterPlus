import React, {useEffect, useState} from "react";
import {ScrollView} from "react-native";
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from "react-native-reanimated";
import {XStack} from "tamagui";

import RailChip from "@/components/RailChip";
import RailSearch from "@/components/RailSearch";
import {DURATION, EASING, useReducedMotion} from "@/constants/motion";
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
    /** Whether the filter rail is showing. Derived by the owner, not stored here. */
    filtersOpen: boolean;
    /** Reveal or hide the filter rail. */
    onFilterToggle: () => void;
};

function sentenceCase(label: string): string {
    const lower = label.toLocaleLowerCase();
    const sentence = `${lower.charAt(0).toLocaleUpperCase()}${lower.slice(1)}`;
    return sentence.replace(/xbloom/i, "xBloom");
}

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
    onFilterToggle
}: Props) {
    const reduced = useReducedMotion();

    // Set from RailSearch's own event handlers, not an effect: while the search
    // field is open the sort chip gives up its word to reclaim that width, and
    // the rail learns the field opened only so it can ask for it back.
    const [searchOpen, setSearchOpen] = useState(false);

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

    // The word goes, not the accent, while search is open: an active sort still
    // fills, it just falls back to its icon-only form so the expanding field has
    // the width. The spoken label is unchanged -- only the visible word is
    // dropped -- so a screen reader still names the axis.
    const sortLabel = sortActive && !searchOpen ? chipLabel(sort) : undefined;

    // No filters to show means no button: one that opens an empty rail is worse
    // than none at all.
    const hasFilters = filters.length > 0;

    // The pinned cluster is a list rather than a fixed set so phase 4 can splice
    // the view segmented pair into it without restructuring the rail. Do not add
    // the view pair here; that is phase 4's job -- and when it comes, it belongs
    // between search and the sort chip, at the leading edge of the button group.
    //
    // Search leads and is flexed, so it claims the row and pushes the buttons to
    // the trailing edge itself. Nothing here carries a `marginLeft="auto"`: the
    // buttons are not pinned right, they are simply what is left after search
    // has taken its width, which stays true however many of them phase 4 adds.
    const cluster = [
        <RailSearch key="search" onTermChange={onSearchChange}
                    onExpandedChange={setSearchOpen}/>,
        <RailChip key="sort" testID="rail-sort" icon="sort"
                  active={sortActive}
                  label={sortLabel}
                  accessibilityLabel={sortAccessibilityLabel(sort, direction)}
                  onPress={onSortPress}/>
    ];

    if (hasFilters) {
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

    return (
        <Animated.View style={padding} testID="library-rail">
            <XStack alignItems="center" paddingHorizontal="$3" gap={CHIP_GAP}>
                {cluster}
            </XStack>

            {hasFilters && filtersOpen && (
                <FilterRail filters={filters} onFilterPress={onFilterPress}/>
            )}
        </Animated.View>
    );
}

import React, {useEffect} from "react";
import {ScrollView} from "react-native";
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from "react-native-reanimated";
import {Text, XStack, YStack} from "tamagui";

import RailChip, {CHIP_HEIGHT} from "@/components/RailChip";
import RailSearch from "@/components/RailSearch";
import {palette} from "@/constants/colors";
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
const RAIL_PADDING_SHRUNK = 2;

/** The gap between chips, both in the pinned cluster and the scrolling row. */
const CHIP_GAP = 8;

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
    /** Called once a rail control is used, so the owner can dismiss onboarding. */
    onUse?: () => void;
    /** One-line guidance, gated by the owner through the existing hints setting. */
    hint?: string;
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
 * The rail: one row of chrome above the library that can search it, sort it and
 * narrow it.
 *
 * A pinned leading cluster of always-reachable controls, a divider, then a row
 * of filter chips that scrolls past them. It shrinks as the list scrolls by
 * shedding its own vertical padding; the chips inside it never move off 44.
 *
 * The shrink rides the home screen's existing collapse rather than owning a
 * second scroll listener: `collapsed` arrives as a prop from the same
 * `useCollapsibleHeader` that drives the header above. Two listeners on one list
 * can disagree by a frame and strobe, and the rail shrinking in lockstep with
 * the header collapsing reads as one motion rather than two chasing each other.
 * Keeping the sensing outside also leaves this a pure presentational component a
 * test can drive without a ScrollView.
 *
 * Module scope, and every chip below is too: a component declared inside another
 * remounts on every render and throws its state away.
 */
export default function LibraryRail({
    collapsed,
    onSearchChange,
    sort,
    direction,
    onSortPress,
    filters,
    onFilterPress,
    onUse,
    hint
}: Props) {
    const reduced = useReducedMotion();

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

    // The pinned cluster is a list rather than a fixed pair so phase 4 can splice
    // the view segmented pair into it without restructuring the rail. Do not add
    // the view pair here; that is phase 4's job.
    const cluster = [
        <RailSearch key="search" onTermChange={onSearchChange} onUse={onUse}/>,
        <RailChip key="sort" testID="rail-sort" icon="sort"
                  active={sortActive}
                  label={sortActive ? chipLabel(sort) : undefined}
                  accessibilityLabel={sortAccessibilityLabel(sort, direction)}
                  onPress={() => {
                      onUse?.();
                      onSortPress();
                  }}/>
    ];

    return (
        <Animated.View style={padding} testID="library-rail">
            <XStack alignItems="center" paddingHorizontal="$3" gap={CHIP_GAP}>
                <XStack alignItems="center" gap={CHIP_GAP}>
                    {cluster}
                </XStack>

                {/* Structural, not decorative. Left of it are controls that never
                    scroll away; right of it is a row that does. Without the line a
                    user has no way to know part of the rail scrolls and part does
                    not, so it must never be removed as ornament. */}
                <YStack testID="rail-divider" width={1} height={CHIP_HEIGHT}
                        backgroundColor={palette.line}/>

                {/* `flexShrink` because a ScrollView sizes to its content by
                    default, and this one is a row sibling of controls that must
                    never be pushed off screen. Unbounded, the chips would simply
                    run past the edge and the row would not scroll at all, which
                    is the half of the rail that has to. */}
                <ScrollView testID="rail-filter-row"
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            accessibilityRole="list"
                            accessibilityLabel="Recipe filters"
                            style={{flexShrink: 1}}
                            contentContainerStyle={{gap: CHIP_GAP, alignItems: "center"}}>
                    {filters.map((filter) => (
                        <RailChip key={filter.id} testID={`rail-filter-${filter.id}`}
                                  active={filter.active} label={filter.label}
                                  accessibilityLabel={filterAccessibilityLabel(filter)}
                                  onPress={() => {
                                      onUse?.();
                                      onFilterPress(filter.id);
                                  }}/>
                    ))}
                </ScrollView>
            </XStack>
            {hint !== undefined && (
                <Text color={palette.dim} fontSize={13} paddingHorizontal="$3" paddingTop="$1"
                      accessibilityLiveRegion="polite">
                    {hint}
                </Text>
            )}
        </Animated.View>
    );
}

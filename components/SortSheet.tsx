import React from "react";
import {Pressable} from "react-native";
import {Switch, Text, XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import SegmentedControl from "@/components/SegmentedControl";
import XbrwSheet from "@/components/XbrwSheet";
import {palette} from "@/constants/colors";
import {
    defaultDirection,
    directionLabels,
    SORT_AXES,
    SORT_AXIS_ORDER,
    type SortAxis,
    type SortDirection
} from "@/library/librarySort";

/**
 * How much of the screen the sort sheet takes.
 *
 * Five axis rows, a direction pair and one switch, none of which scroll, so it
 * is sized to them rather than standing at the house default with two thirds of
 * it empty -- the same reason `RecipeOverflowSheet` sizes itself down.
 */
export const SORT_HEIGHT = 62;

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The current sort axis and direction, owned above so the rail chip and this sheet cannot disagree. */
    sort: SortAxis;
    direction: SortDirection;
    /** Whether favourites are held above the chosen order. */
    favouritesFirst: boolean;
    /**
     * The whole sort, axis and direction together, in one call.
     *
     * One atomic change rather than two callbacks, because the two settings only
     * make sense as a pair: NEWEST and LONGEST AGO are opposite directions of
     * different axes, so an axis and a direction that belonged to the axis
     * before it are never a valid intermediate state to persist. Choosing an
     * axis carries that axis's default direction; the direction pair carries the
     * current axis.
     */
    onSortChange: (axis: SortAxis, direction: SortDirection) => void;
    onFavouritesFirstChange: (value: boolean) => void;
};

/**
 * What the rail's sort chip opens: the five axes, a direction pair worded by the
 * chosen axis, and a favourites-first modifier.
 *
 * Layout only, handed its values and callbacks rather than reaching for the
 * settings store. The sort is shared state -- the rail chip draws the same axis
 * this sheet changes -- so a single owner above both (the home screen, in the
 * wiring task) is what keeps the chip and the sheet from disagreeing, and it
 * leaves this component testable with plain spies and no database.
 *
 * Module scope, like every component here: one declared inside another's body
 * is a new type on every render and loses its state.
 */
export default function SortSheet({
    open, onOpenChange, sort, direction, favouritesFirst,
    onSortChange, onFavouritesFirstChange
}: Props) {
    // The two direction words belong to the chosen axis, not to a fixed
    // ascending or descending, so the pair relabels itself when the axis
    // changes. Read from the vocabulary rather than restated so the words
    // cannot drift from the query the same axis produces.
    const labels = directionLabels(sort);
    const directionOptions = [
        {value: "asc", label: labels.asc},
        {value: "desc", label: labels.desc}
    ] as const;

    return (
        <XbrwSheet open={open} onOpenChange={onOpenChange} title="SORT"
                   prewarm heightPercent={SORT_HEIGHT}>
            <YStack gap="$4" paddingBottom="$4">
                <YStack accessibilityRole="radiogroup" accessibilityLabel="Sort by"
                        gap="$2">
                    {SORT_AXIS_ORDER.map((axis) => {
                        const selected = axis === sort;
                        return (
                            <Pressable key={axis} accessibilityRole="radio"
                                       accessibilityLabel={SORT_AXES[axis].label}
                                       accessibilityState={{checked: selected}}
                                       // Choosing an axis applies that axis's
                                       // default direction, so a sort is never
                                       // two taps when one would do.
                                       onPress={() => onSortChange(axis, defaultDirection(axis))}>
                                <XStack alignItems="center" justifyContent="space-between"
                                        gap="$3" minHeight={44} paddingHorizontal="$3"
                                        borderRadius="$4"
                                        backgroundColor={selected ? palette.raised : undefined}>
                                    <DotMatrixText fontSize={12} weight="bold"
                                                   letterSpacing={1.8}
                                                   color={selected ? palette.text : palette.dim}>
                                        {SORT_AXES[axis].label}
                                    </DotMatrixText>
                                    {/* A visible tick for the marked axis, not
                                        colour alone: the row's fill and text
                                        weight already move, but a screen reader
                                        gets the checked state and a sighted user
                                        gets an unambiguous mark. */}
                                    {selected && (
                                        <DotIcon name="success" size={14} color={palette.text}/>
                                    )}
                                </XStack>
                            </Pressable>
                        );
                    })}
                </YStack>

                <YStack gap="$2">
                    <DotMatrixText fontSize={10} weight="bold" letterSpacing={2}
                                   color={palette.muted}>
                        DIRECTION
                    </DotMatrixText>
                    <SegmentedControl value={direction} options={directionOptions}
                                      accessibilityLabel="Sort direction"
                                      onChange={(value) =>
                                          onSortChange(sort, value as SortDirection)}/>
                </YStack>

                {/* A modifier, not a sixth axis: it composes with the sort rather
                    than replacing it, so it is a switch that leaves the axis and
                    direction untouched. A real Switch, so assistive tech reports
                    its on/off state. */}
                <XStack alignItems="center" justifyContent="space-between" gap="$4"
                        minHeight={44} paddingHorizontal="$3">
                    <YStack flex={1} gap="$1">
                        <Text fontSize={16} color={palette.text}>Favourites first</Text>
                        <Text fontSize={13} color={palette.dim}>
                            Keep starred recipes at the top, in the same order
                        </Text>
                    </YStack>
                    <Switch accessibilityLabel="Favourites first" accessibilityRole="switch"
                            accessibilityState={{checked: favouritesFirst}}
                            checked={favouritesFirst}
                            onCheckedChange={onFavouritesFirstChange} size="$3"
                            backgroundColor={favouritesFirst ? palette.success : palette.control}>
                        <Switch.Thumb backgroundColor={palette.text}/>
                    </Switch>
                </XStack>
            </YStack>
        </XbrwSheet>
    );
}

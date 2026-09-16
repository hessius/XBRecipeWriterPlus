import React, {useEffect, useRef} from "react";
import {Pressable, TextInput} from "react-native";
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from "react-native-reanimated";
import {Input, XStack, type ColorTokens} from "tamagui";

import DotIcon from "@/components/DotIcon";
import RailChip, {CHIP_HEIGHT} from "@/components/RailChip";
import {palette} from "@/constants/colors";
import {DURATION, EASING, useReducedMotion} from "@/constants/motion";
import {useRailSearch} from "@/hooks/useRailSearch";

/**
 * How wide the field grows to. A fixed width rather than flex so the expansion
 * is a single animatable number, and wide enough for a few words without taking
 * so much of a small phone's rail that the filter row behind it has nowhere to
 * scroll.
 */
const FIELD_WIDTH = 200;

/** The glyph size inside the field, matching the chip it grew out of. */
const ICON_SIZE = 18;

type Props = {
    /**
     * The debounced term, and only that. The rail's owner is handed the settled
     * search string and never the keystrokes or the field's open/closed state,
     * which is what lets the rail be tested without the query behind it.
     */
    onTermChange: (term: string) => void;
};

/**
 * The rail's search: an icon chip until tapped, a field once it is.
 *
 * Search is the least used of the rail's three controls at this library size and
 * the most expensive in width, so it pays for its space only while in use: it
 * sits as a 44 square glyph and grows into a field on demand.
 *
 * Module scope, and it owns its state through `useRailSearch`: a component
 * declared inside another's body is a fresh type every render, so React remounts
 * it and the field loses what was typed. That bug has been fixed twice here.
 */
export default function RailSearch({onTermChange}: Props) {
    const {expanded, text, active, onExpand, onChangeText, onClear} = useRailSearch(onTermChange);
    const reduced = useReducedMotion();

    const open = useSharedValue(0);
    const inputRef = useRef<TextInput | null>(null);

    useEffect(() => {
        if (!expanded) {
            // Nothing to animate: the field is unmounted below, so the value is
            // only reset for the next expansion.
            open.value = 0;
            return;
        }
        // Reduced Motion still expands -- the field is real layout, not
        // decoration -- it just arrives outright rather than widening.
        open.value = reduced
            ? 1
            : withTiming(1, {duration: DURATION.base, easing: EASING.out});
    }, [expanded, reduced, open]);

    // The imperative replacement for `autoFocus`, which under a programmatic
    // mount can fire before the field is in the tree. Focus on the edge into the
    // expanded state so the keyboard follows the tap.
    useEffect(() => {
        if (expanded) inputRef.current?.focus();
    }, [expanded]);

    const width = useAnimatedStyle(() => ({
        width: CHIP_HEIGHT + (FIELD_WIDTH - CHIP_HEIGHT) * open.value
    }));

    if (!expanded) {
        return (
            <RailChip testID="rail-search" icon="search" active={false}
                      accessibilityLabel="Search recipes" onPress={onExpand}/>
        );
    }

    return (
        <Animated.View style={width}>
            <XStack testID="rail-search-field" height={CHIP_HEIGHT} alignItems="center"
                    paddingLeft="$3" gap="$2" borderRadius="$4" borderWidth={1}
                    backgroundColor={palette.raised}
                    // Border and glyph carry the on state, the same accent the
                    // chip would show, so a filtered library never reads as an
                    // unfiltered one.
                    borderColor={active ? palette.text : palette.line}>
                <DotIcon name="search" size={ICON_SIZE}
                         color={active ? palette.text : palette.dim}/>
                <Input
                    ref={inputRef}
                    testID="rail-search-input"
                    accessibilityLabel="Search recipes"
                    flex={1}
                    unstyled
                    placeholder="Search"
                    placeholderTextColor={palette.dim as ColorTokens}
                    value={text}
                    onChangeText={onChangeText}
                    autoCapitalize="none"
                    autoCorrect={false}
                    color={palette.text}/>
                <Pressable testID="rail-search-clear" accessibilityRole="button"
                           accessibilityLabel="Clear search" onPress={onClear}
                           hitSlop={8}
                           style={{width: CHIP_HEIGHT, height: CHIP_HEIGHT,
                                   alignItems: "center", justifyContent: "center"}}>
                    <DotIcon name="close" size={ICON_SIZE} color={palette.dim}/>
                </Pressable>
            </XStack>
        </Animated.View>
    );
}

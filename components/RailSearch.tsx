import React, {useEffect, useRef} from "react";
import {Pressable, TextInput} from "react-native";
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from "react-native-reanimated";
import {Input, XStack, type ColorTokens, type TamaguiElement} from "tamagui";

import DotIcon from "@/components/DotIcon";
import RailChip, {CHIP_HEIGHT} from "@/components/RailChip";
import {palette} from "@/constants/colors";
import {DURATION, EASING, useReducedMotion} from "@/constants/motion";
import {useRailSearch} from "@/hooks/useRailSearch";

/**
 * How wide the field is before it grows: the square chip it expands out of.
 * Growth is `flexGrow`, not a fixed width -- a hardcoded width overflowed the
 * pinned cluster on a small phone and pushed the trailing filter button off an
 * edge that cannot scroll, and no single number is right across every device.
 * So the field takes exactly whatever the other pinned controls leave, at any
 * width, and this is only its collapsed floor while `flexGrow` ramps.
 */
const FIELD_BASIS = CHIP_HEIGHT;

/** The glyph size inside the field, matching the chip it grew out of. */
const ICON_SIZE = 18;

type Props = {
    /**
     * The debounced term, and only that. The rail's owner is handed the settled
     * search string and never the keystrokes or the field's open/closed state,
     * which is what lets the rail be tested without the query behind it.
     */
    onTermChange: (term: string) => void;
    /**
     * The rail is told when the field opens and closes so a sibling control can
     * give up width to it -- the sort chip drops its word while search is open.
     * Reported from the same event handlers that open and close the field, never
     * an effect, so the parent's state is set on the tap rather than synced after
     * it. Optional, because the hook that exercises this component in isolation
     * does not care.
     */
    onExpandedChange?: (expanded: boolean) => void;
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
export default function RailSearch({onTermChange, onExpandedChange}: Props) {
    const {expanded, text, active, onExpand, onChangeText, onClear} = useRailSearch(onTermChange);
    const reduced = useReducedMotion();
    const searchState = active ? `term ${text} active` : "no search term";

    function expand() {
        onExpand();
        onExpandedChange?.(true);
    }

    function clear() {
        onClear();
        onExpandedChange?.(false);
    }

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

    // Grow by `flexGrow`, not width: the field claims whatever the other pinned
    // controls leave, which is correct at every device width where a fixed
    // number was not. `flexBasis` holds it at the collapsed square while the
    // grow ramps 0 -> 1, so it opens out of the chip it replaced rather than
    // jumping. Layout-animating `flexGrow` relayouts each frame rather than
    // riding a transform on the UI thread, which is the deliberate cost of never
    // measuring a leftover width the field is itself part of.
    const grow = useAnimatedStyle(() => ({flexGrow: open.value}));

    if (!expanded) {
        return (
            <RailChip testID="rail-search" icon="search" active={false}
                      accessibilityLabel={`Search recipes, collapsed, ${searchState}`}
                      onPress={expand}/>
        );
    }

    return (
        <Animated.View style={[grow, {flexBasis: FIELD_BASIS, flexShrink: 1}]}>
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
                    // Tamagui types every element ref as `TamaguiElement`, which
                    // is a View, while `Input` forwards a real `TextInput` at
                    // runtime. The ref is typed for what actually arrives so the
                    // `focus()` above is checked; the cast is only for the prop.
                    ref={inputRef as React.Ref<TamaguiElement>}
                    testID="rail-search-input"
                    accessibilityLabel={`Search recipes, expanded, ${searchState}`}
                    flex={1}
                    unstyled
                    placeholder="Search"
                    placeholderTextColor={palette.dim as ColorTokens}
                    value={text}
                    onChangeText={onChangeText}
                    autoCapitalize="none"
                    autoCorrect={false}
                    color={palette.text}/>
                {/* No `hitSlop`. The square is already 44, and slop here would
                    reach back into the field's trailing edge, where a tap meant
                    to place the cursor would wipe the term instead. */}
                <Pressable testID="rail-search-clear" accessibilityRole="button"
                           accessibilityLabel="Clear search" onPress={clear}
                           style={{width: CHIP_HEIGHT, height: CHIP_HEIGHT,
                                   alignItems: "center", justifyContent: "center"}}>
                    <DotIcon name="close" size={ICON_SIZE} color={palette.dim}/>
                </Pressable>
            </XStack>
        </Animated.View>
    );
}

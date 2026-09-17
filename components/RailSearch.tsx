import React, {useEffect, useRef, useState} from "react";
import {Pressable, TextInput, type LayoutChangeEvent} from "react-native";
import {Input, XStack, type ColorTokens, type TamaguiElement} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import {CHIP_HEIGHT} from "@/components/RailChip";
import {palette} from "@/constants/colors";
import {useRailSearch} from "@/hooks/useRailSearch";

/** The glyph size inside the field, matching the chips beside it. */
const ICON_SIZE = 18;

/**
 * The width the idle control must have before it spells its own name.
 *
 * Search takes whatever the trailing buttons leave, and on a narrow phone
 * carrying a long sort word that remainder is not much more than the glyph. The
 * word is the first thing to go, because a clipped half-word reads as a broken
 * control while a bare glyph reads as a search button.
 *
 * Measured rather than guessed: the remainder depends on the sort axis's word,
 * which changes as the user sorts, so no fixed breakpoint on device width can
 * answer it. The measurement cannot loop -- the label sits in a box that is
 * sized by the control's siblings, so showing or hiding it does not change the
 * width being measured: `flex` resolves to a basis of 0, so the control's width
 * is decided by its siblings and its own content cannot feed back into it. That
 * is what makes the measurement safe, so do not rewrite the `flex` below as a
 * bare `flexGrow`, which leaves the basis at `auto` and would make the label's
 * own width part of what is being measured.
 */
const LABEL_MIN_WIDTH = 132;

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
 * The rail's search: a field across the rail, live once tapped.
 *
 * It takes whatever the trailing buttons leave, idle or not. Paying for its
 * space only while in use was right while twelve filter chips competed for the
 * same row, and stopped being right the moment they moved to a rail of their
 * own: there is nothing left to give the width back to, so a square glyph beside
 * two buttons leaves a long dead gap that reads as a missing control. Tapping it
 * therefore moves nothing across the rail; it puts a cursor in a field already
 * where it will be, and takes the sort chip's word as the little extra room it
 * gains.
 *
 * Module scope, and it owns its state through `useRailSearch`: a component
 * declared inside another's body is a fresh type every render, so React remounts
 * it and the field loses what was typed. That bug has been fixed twice here.
 */
export default function RailSearch({onTermChange, onExpandedChange}: Props) {
    const {expanded, text, active, onExpand, onChangeText, onClear} = useRailSearch(onTermChange);
    const searchState = active ? `term ${text} active` : "no search term";

    function expand() {
        onExpand();
        onExpandedChange?.(true);
    }

    function clear() {
        onClear();
        onExpandedChange?.(false);
    }

    const inputRef = useRef<TextInput | null>(null);
    // Set from a layout event, not an effect, and never read to decide the width
    // it came from.
    const [width, setWidth] = useState(0);

    function measure(event: LayoutChangeEvent) {
        setWidth(event.nativeEvent.layout.width);
    }

    // The imperative replacement for `autoFocus`, which under a programmatic
    // mount can fire before the field is in the tree. Focus on the edge into the
    // expanded state so the keyboard follows the tap.
    useEffect(() => {
        if (expanded) inputRef.current?.focus();
    }, [expanded]);

    // Nothing animates the width any more. The control already occupies its
    // width when idle, so there is no expansion to describe: the only room it
    // gains on a tap is the sort chip's word, and easing a field a few points
    // wider draws the eye to a change that is not the point of the gesture. The
    // shared value, its effect and the motion constants went with it rather than
    // being left inert.

    if (!expanded) {
        return (
            <XStack testID="rail-search" onLayout={measure}
                    accessible accessibilityRole="button"
                    accessibilityLabel={`Search recipes, collapsed, ${searchState}`}
                    onPress={expand}
                    // Flexed, exactly as the live field is, so tapping does not
                    // move the control. `minWidth` is the floor a touch target
                    // may not go below whatever the buttons beside it claim.
                    flex={1} minWidth={CHIP_HEIGHT}
                    height={CHIP_HEIGHT} alignItems="center"
                    paddingHorizontal="$3" gap="$2"
                    borderRadius="$4" borderWidth={1}
                    backgroundColor={palette.raised} borderColor={palette.line}
                    // The word is clipped rather than allowed to push the
                    // buttons, on the frame before the measurement lands.
                    overflow="hidden"
                    pressStyle={{opacity: 0.7}}>
                <DotIcon name="search" size={ICON_SIZE} color={palette.dim}/>
                {width >= LABEL_MIN_WIDTH && (
                    <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.5}
                                   color={palette.dim}>
                        SEARCH
                    </DotMatrixText>
                )}
            </XStack>
        );
    }

    return (
        <XStack testID="rail-search-field" flex={1} minWidth={CHIP_HEIGHT}
                height={CHIP_HEIGHT} alignItems="center"
                paddingLeft="$3" gap="$2" borderRadius="$4" borderWidth={1}
                backgroundColor={palette.raised}
                // Border and glyph carry the on state, the same accent the sort
                // and filter chips beside it use, so a filtered library never
                // reads as an unfiltered one.
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
    );
}

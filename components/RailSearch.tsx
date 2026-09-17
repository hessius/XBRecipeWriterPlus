import React, {useEffect, useRef} from "react";
import {Pressable, TextInput} from "react-native";
import {XStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import {dotMatrixTextProps} from "@/components/DotMatrixText";
import {CHIP_HEIGHT} from "@/components/RailChip";
import {palette} from "@/constants/colors";

/** The glyph size inside the control, matching the chips beside it. */
const ICON_SIZE = 18;

/**
 * Search, idle: a square in the rail.
 *
 * It was a flexed field that filled the row, which was right for a rail holding
 * search and two buttons, and wrong the moment phase 4 put a segmented pair in
 * the same row. A flexing control and a fixed one share a rail by taking width
 * from each other, and on a 320 pt phone the field lost: device testing found it
 * too cramped to type in. A square takes the least the rail can offer, and the
 * field it opens does not have to fit beside anything, because it is drawn over
 * the rail rather than in it.
 *
 * Kept apart from the field on purpose: the field has to be positioned against
 * the rail, not against this square, so the two cannot be one component without
 * this square becoming the field's coordinate space.
 */
export function RailSearchChip({state, onPress}: {
    /** What a reader hears about the search behind the square. */
    state: string;
    onPress: () => void;
}) {
    return (
        <XStack testID="rail-search"
                accessible accessibilityRole="button"
                accessibilityLabel={`Search recipes, collapsed, ${state}`}
                onPress={onPress}
                width={CHIP_HEIGHT} height={CHIP_HEIGHT}
                alignItems="center" justifyContent="center"
                borderRadius="$4" borderWidth={1}
                // The same unfilled shape the sort and filter chips wear when
                // they are off. The fill arrives with the cursor.
                backgroundColor={palette.none} borderColor={palette.line}
                pressStyle={{opacity: 0.7}}>
            <DotIcon name="search" size={ICON_SIZE} color={palette.dim}/>
        </XStack>
    );
}

/**
 * Search, live: the field, drawn over the rail.
 *
 * The caller positions it; this only fills what it is given. Because it covers
 * the rail rather than joining it, opening search moves nothing underneath --
 * the view toggle stays exactly where the thumb left it -- and the field gets
 * the whole width whatever the rail is carrying that day.
 *
 * That is also what retired the sort chip's word suppression. Phase 3 had the
 * sort chip drop its word while the field was live, to hand the width over; with
 * nothing competing for width there is nothing to hand over.
 */
export function RailSearchField({state, text, active, onChangeText, onBlur, onClear}: {
    state: string;
    text: string;
    /** Whether a term is held. Lights the border and the glyph. */
    active: boolean;
    onChangeText: (next: string) => void;
    onBlur: () => void;
    onClear: () => void;
}) {
    const inputRef = useRef<TextInput | null>(null);
    // The header is dot matrix throughout, and a field that dropped to the
    // system face in the middle of it read as a borrowed control. Asked for
    // rather than spelled out, so Doto's size floor and scale cap still hold.
    const doto = dotMatrixTextProps({fontSize: 12, letterSpacing: 1.5});

    // The imperative replacement for `autoFocus`, which under a programmatic
    // mount can fire before the field is in the tree. This component exists only
    // while the field is live, so mounting is the edge to focus on.
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    return (
        <XStack testID="rail-search-field" flex={1}
                height={CHIP_HEIGHT} alignItems="center"
                paddingLeft="$3" gap="$2" borderRadius="$4" borderWidth={1}
                backgroundColor={palette.raised}
                // Border and glyph carry the on state, the same accent the sort
                // and filter chips beside it use, so a filtered library never
                // reads as an unfiltered one.
                borderColor={active ? palette.text : palette.line}>
            <DotIcon name="search" size={ICON_SIZE}
                     color={active ? palette.text : palette.dim}/>
            {/* React Native's own field, not Tamagui's `Input`. Tamagui resolves
                `fontFamily` against the theme's font tokens and drops anything
                that is not one, and an `unstyled` Input discards a plain `style`
                prop too, so Doto could not be asked for through it either way. */}
            <TextInput
                ref={inputRef}
                testID="rail-search-input"
                accessibilityLabel={`Search recipes, expanded, ${state}`}
                maxFontSizeMultiplier={doto.maxFontSizeMultiplier}
                style={[doto.style, {flex: 1, color: palette.text}]}
                placeholder="SEARCH"
                placeholderTextColor={palette.dim}
                value={text}
                onChangeText={onChangeText}
                onBlur={onBlur}
                // Both, and each covers what the other cannot. The hook holds
                // the text upper case, which is the guarantee -- it catches a
                // pasted term, which never passes through the keyboard at all.
                // But a correction made in JavaScript arrives a frame after the
                // native field has already drawn the key that was pressed, so
                // typing flickered lower case and then snapped up. Shift-locking
                // the keyboard means the letter is upper case before it is ever
                // drawn, and the hook then has nothing left to change.
                autoCapitalize="characters"
                autoCorrect={false}/>
            {/* No `hitSlop`. The square is already 44, and slop here would
                reach back into the field's trailing edge, where a tap meant
                to place the cursor would wipe the term instead. */}
            <Pressable testID="rail-search-clear" accessibilityRole="button"
                       accessibilityLabel="Clear search" onPress={onClear}
                       style={{width: CHIP_HEIGHT, height: CHIP_HEIGHT,
                               alignItems: "center", justifyContent: "center"}}>
                <DotIcon name="close" size={ICON_SIZE} color={palette.dim}/>
            </Pressable>
        </XStack>
    );
}

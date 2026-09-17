import React, {useEffect} from "react";
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from "react-native-reanimated";
import {XStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import {onAccent, palette} from "@/constants/colors";
import type {DotIconName} from "@/constants/dotIcons";
import {DURATION, EASING, useReducedMotion} from "@/constants/motion";

/**
 * The touch minimum, and the whole height of every chip whatever the rail does
 * around it. `components/HomeHeader.tsx:19` is the authority: glyphs in a row of
 * adjacent controls are padded to this rather than given `hitSlop`, because slop
 * on one control overlaps into the gap and the later sibling wins the tap. Chips
 * in a rail are exactly those adjacent siblings, so a chip drawn below this
 * cannot be rescued by slop and must be born at 44.
 */
export const CHIP_HEIGHT = 44;

/** The glyph size inside a chip. Large enough to read, small enough to breathe. */
const ICON_SIZE = 18;

/**
 * The trailing caret's size. A touch smaller than the leading glyph: it is a
 * disclosure mark, not a peer of the icon that names the control, so it reads as
 * subordinate the way the stage tile's caret does beside its title.
 */
const CARET_SIZE = 14;

/** Side padding a labelled chip earns; an icon-only chip is square and takes none. */
const CHIP_PADDING_X = 12;

type Props = {
    /**
     * Whether the chip is on. This is the whole of its state, and it carries in
     * the fill alone: `app/editRecipe.tsx`'s action bar learned the hard way
     * that one step of ink is not a state. Active is the accent fill; inactive
     * is the outline treatment, a hairline with no fill.
     */
    active: boolean;
    onPress: () => void;
    /**
     * Spelled out, because an icon-only chip has no visible text to fall back on
     * and a filter chip's Doto label is an abbreviation. Names the state, not the
     * glyph.
     */
    accessibilityLabel: string;
    /** A leading glyph. Absent for a text-only filter chip. */
    icon?: DotIconName;
    /** The chip's word, in Doto caps. Absent for an icon-only chip. */
    label?: string;
    /**
     * When set, the chip is an expander rather than a selection, and announces
     * its expanded/collapsed state instead of a selected one. A control that
     * both selects and expands would say two state words at once, which is the
     * contradictory double-announcement the filter chips were fixed for; a chip
     * is one or the other, never both.
     */
    expanded?: boolean;
    /**
     * When set, a trailing caret is drawn that points down when `false` and
     * flips to point up when `true`, so the chip can show whether the surface it
     * discloses is open without spending its fill on it -- the fill carries
     * exactly one binary and it belongs to the state, not the disclosure. Its
     * colour follows the same `ink` as the leading glyph and the label, so it
     * agrees with the fill rather than reading as a separate mark.
     */
    caretOpen?: boolean;
    /**
     * The active fill. Defaults to `palette.text`, the house "selected with no
     * recipe accent" fill that `SegmentedControl` also uses, so the rail reads as
     * on without borrowing the brand colour, which never means a state.
     */
    accent?: string;
    testID?: string;
};

/**
 * The chip's trailing disclosure caret.
 *
 * Its own module-scope component so the rotation's shared value survives the
 * chip's renders rather than being reallocated, and so the animation hooks only
 * mount when a chip actually asks for a caret. The `chevron-down` bitmap is
 * turned a half-turn to point up when open, the same trick the stage tile uses
 * to avoid drawing a second glyph. It animates the base duration, and under
 * Reduced Motion it arrives outright -- the same degradation as the rail's
 * shrink, because the rotation is state, not decoration.
 *
 * `DotIcon` owns its own style prop, so the rotation rides a wrapper. The wrapper
 * takes no label: the caret is part of the chip's one accessible node, whose
 * expanded state already carries what the caret shows.
 */
function RailCaret({open, color}: {open: boolean; color: string}) {
    const reduced = useReducedMotion();
    const turn = useSharedValue(open ? 1 : 0);

    useEffect(() => {
        const target = open ? 1 : 0;
        turn.value = reduced
            ? target
            : withTiming(target, {duration: DURATION.base, easing: EASING.out});
    }, [open, reduced, turn]);

    const spin = useAnimatedStyle(() => ({
        transform: [{rotate: `${turn.value * 180}deg`}]
    }));

    return (
        <Animated.View testID="rail-chip-caret" style={spin}>
            <DotIcon name="chevron-down" size={CARET_SIZE} color={color}/>
        </Animated.View>
    );
}

/**
 * One control in the rail: search, sort, or a filter. Everything in the rail is
 * one of these, so the shape lives here once.
 *
 * A chip is always 44 tall and, when icon-only, 44 wide. The rail may shrink
 * around it but never it: a target below the touch minimum is a target a finger
 * misses, and the comment on `CHIP_HEIGHT` says why slop cannot buy it back.
 *
 * Module scope, so the chip is a stable component type across the rail's
 * renders rather than a fresh one that remounts and drops its state each time.
 */
export default function RailChip({
    active, onPress, accessibilityLabel, icon, label, expanded, caretOpen,
    accent = palette.text, testID
}: Props) {
    const iconOnly = label === undefined;
    // Ink only agrees with the fill; it does not carry the state itself.
    const ink = active ? onAccent.text : palette.text;

    return (
        <XStack
            testID={testID}
            accessible
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityState={expanded === undefined ? {selected: active} : {expanded}}
            onPress={onPress}
            height={CHIP_HEIGHT}
            // An icon-only chip is a fixed square; a labelled one hugs its word.
            width={iconOnly ? CHIP_HEIGHT : undefined}
            paddingHorizontal={iconOnly ? 0 : CHIP_PADDING_X}
            alignItems="center"
            justifyContent="center"
            gap="$1.5"
            borderRadius="$4"
            borderWidth={1}
            backgroundColor={active ? accent : "transparent"}
            borderColor={active ? accent : palette.line}
            pressStyle={{opacity: 0.7}}>
            {icon !== undefined && (
                <DotIcon name={icon} size={ICON_SIZE} color={ink}/>
            )}
            {label !== undefined && (
                <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.5} color={ink}>
                    {label}
                </DotMatrixText>
            )}
            {caretOpen !== undefined && (
                <RailCaret open={caretOpen} color={ink}/>
            )}
        </XStack>
    );
}

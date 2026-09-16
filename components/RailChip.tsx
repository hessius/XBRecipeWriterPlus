import React from "react";
import {XStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import {onAccent, palette} from "@/constants/colors";
import type {DotIconName} from "@/constants/dotIcons";

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
     * The active fill. Defaults to `palette.text`, the house "selected with no
     * recipe accent" fill that `SegmentedControl` also uses, so the rail reads as
     * on without borrowing the brand colour, which never means a state.
     */
    accent?: string;
    testID?: string;
};

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
    active, onPress, accessibilityLabel, icon, label, accent = palette.text, testID
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
            accessibilityState={{selected: active}}
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
        </XStack>
    );
}

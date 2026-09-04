import React from "react";
import {Pressable, type ViewStyle} from "react-native";

import DotMatrixText from "@/components/DotMatrixText";

/** The shapes the card itself draws. `swipe` is a tile in the tray, not chrome. */
export type CardShortcut = "edge" | "tab" | "chip";

type Props = {
    variant: CardShortcut;
    /** The card's accent, used for the letter ink. */
    accent: string;
    /** The card's own ink, so the shortcut reads as cut from the card. */
    ink: string;
    onPress: () => void;
};

/** Wide enough to centre four stacked letters, which 21 was not. */
const BAND_WIDTH = 34;
const TAB_INSET = 4;
/**
 * `RecipeCard`'s `borderRadius="$8"`, read off the running theme.
 *
 * A literal because the token is not a number at this call site — the same
 * reason `constants/layout.ts` exists. Tamagui's `$8` radius is 22, which is
 * not the value a reader guesses, so it is written down here once.
 */
const CARD_RADIUS = 22;
/**
 * Concentric with the card, rather than derived from the tab's own width.
 *
 * A shape inset by n inside a radius r is concentric at r - n. The capsule this
 * replaces used `width / 2`, which gave 10.5 against the card's 22: a rule that
 * refers to the shape's own width can only agree with the card by coincidence,
 * and here it did not come close.
 */
const TAB_RADIUS = CARD_RADIUS - TAB_INSET;
const CHIP_WIDTH = 78;
const CHIP_HEIGHT = 34;
/** The chip's inner corner. A fold, so it is smaller than the card's own. */
const CHIP_FOLD = 14;
/** `RecipeCard`'s `padding="$3.5"`, read off the running theme. It is 16. */
const CARD_PADDING = 16;

/**
 * How much of the card's trailing edge each shape occupies.
 *
 * The card adds this to its title row's right padding. Fault 2 of the shipped
 * capsule was landing on the `TEA` marker, and it is fixed by the card knowing
 * what the shortcut takes rather than by choosing a shape that happens to miss.
 * The pour profile and the stats row are not inset, because neither reaches
 * that edge.
 */
export const SHORTCUT_INSET: Record<CardShortcut, number> = {
    edge: BAND_WIDTH - CARD_PADDING,
    tab:  BAND_WIDTH + TAB_INSET - CARD_PADDING,
    chip: 0
};

/**
 * Slop, not a wider shape.
 *
 * `left` is deliberately 0, for the reason the capsule's comment gave: a left
 * slop steals presses from the card body behind it, and the card is the bigger
 * and more common target. The bands are 34 across, so 10 to the right reaches
 * the HIG's 44; they already run the card's height. The chip is 34 tall and
 * takes its 10 vertically instead.
 */
const BAND_SLOP = {top: 8, bottom: 8, left: 0, right: 10};
const CHIP_SLOP = {top: 10, bottom: 0, left: 10, right: 0};

const SHAPES: Record<CardShortcut, ViewStyle> = {
    edge: {right: 0, top: 0, bottom: 0, width: BAND_WIDTH},
    tab:  {
        right:        TAB_INSET,
        top:          TAB_INSET,
        bottom:       TAB_INSET,
        width:        BAND_WIDTH,
        borderRadius: TAB_RADIUS
    },
    chip: {
        right:                   0,
        bottom:                  0,
        width:                   CHIP_WIDTH,
        height:                  CHIP_HEIGHT,
        borderTopLeftRadius:     CHIP_FOLD,
        borderBottomRightRadius: CARD_RADIUS
    }
};

/**
 * BREW, on a recipe card, in one of three shapes.
 *
 * Three rather than one because the shape that shipped was chosen from a mockup
 * and had five faults in the hand. They are alternatives, never composed, and
 * they live in one file precisely so they can be read against each other while
 * the choice is open. When one wins the other two are deleted.
 *
 * The bands stack their letters, one per line, rather than rotating them:
 * rotated text at this size is unreadable, and four stacked letters stay a
 * shape you recognise without reading. The chip is wide enough to say the word
 * outright, which is most of why it is worth trying.
 *
 * Every shape shares the card's right edge with the swipe tray. That was
 * predicted before the capsule shipped and confirmed on hardware, and it is
 * accepted: a tap and a horizontal drag are distinguishable by intent, and
 * every alternative costs more than the collision does.
 */
export default function BrewShortcut({variant, accent, ink, onPress}: Props) {
    const horizontal = variant === "chip";

    return (
        <Pressable
            testID="brew-shortcut"
            accessibilityRole="button"
            accessibilityLabel="Brew this recipe"
            onPress={onPress}
            hitSlop={horizontal ? CHIP_SLOP : BAND_SLOP}
            style={{
                position:        "absolute",
                backgroundColor: ink,
                alignItems:      "center",
                justifyContent:  "center",
                ...SHAPES[variant]
            }}
        >
            {horizontal ? (
                <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.4}
                               color={accent}>
                    BREW
                </DotMatrixText>
            ) : (
                ["B", "R", "E", "W"].map((letter) => (
                    <DotMatrixText key={letter} fontSize={9} weight="bold" color={accent}>
                        {letter}
                    </DotMatrixText>
                ))
            )}
        </Pressable>
    );
}

import React from "react";
import {Pressable} from "react-native";

import DotMatrixText from "@/components/DotMatrixText";

type Props = {
    /** The card's accent colour, used for the letter ink. */
    accent: string;
    /** The card's own ink, so the capsule reads as part of the card. */
    ink: string;
    onPress: () => void;
};

const WIDTH = 21;
const INSET = 5;
/**
 * Slop, not a wider capsule.
 *
 * The capsule is 21 px across and runs the height of the card, so vertically
 * it is already far past the HIG's 44 px; the slop only has to help
 * horizontally, where it brings the target to 29 px. Not 44: `left` is
 * deliberately 0, because a left slop here steals presses from the card body
 * behind it and the card is the bigger, more common target. Reaching 44 px
 * means widening the capsule, which is a visual decision, not a slop one.
 */
const SLOP = {top: 8, bottom: 8, left: 0, right: 8};

/**
 * BREW, on the right edge of a recipe card.
 *
 * Upright — one letter per line — rather than rotated: rotated text at 21 px is
 * unreadable, and four stacked letters say the same thing while staying a shape
 * you can recognise without reading.
 *
 * Shares the card's right edge with the swipe-to-delete tiles. Judged
 * acceptable, and on the hardware checklist to confirm in the hand.
 */
export default function BrewCapsule({accent, ink, onPress}: Props) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel="Brew this recipe"
            onPress={onPress}
            hitSlop={SLOP}
            style={{
                position: "absolute",
                right: INSET,
                top: INSET,
                bottom: INSET,
                width: WIDTH,
                borderRadius: WIDTH / 2,
                backgroundColor: ink,
                alignItems: "center",
                justifyContent: "center"
            }}
        >
            {["B", "R", "E", "W"].map((letter) => (
                <DotMatrixText key={letter} fontSize={9} weight="bold" color={accent}>
                    {letter}
                </DotMatrixText>
            ))}
        </Pressable>
    );
}

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
/** Enough to reach the HIG's 44 px without widening the capsule itself. */
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

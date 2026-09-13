import React from "react";
import {View} from "react-native";
import {YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {glyphForPattern, type GlyphKind} from "@/components/PourGlyph";
import {AGITATION_SENTENCE, LONGEST_NOW_SENTENCE, PATTERN_SENTENCE}
    from "@/constants/brewCopy";
import {palette} from "@/constants/colors";
import {pauseSeconds} from "@/library/brew/brewShape";
import type Pour from "@/library/Pour";

type Props = {
    /** The live stage. Undefined before the first pour and after the last. */
    pour: Pour | undefined;
    accent: string;
    /** The water is in and the planned rest has begun. */
    resting: boolean;
};

/**
 * The pattern word, upper case, for the heading.
 *
 * Total over `GlyphKind` for the same reason `PATTERN_SENTENCE` is.
 */
const PATTERN_WORD: Record<GlyphKind, string> = {
    centered:  "CENTRED",
    circular:  "CIRCULAR",
    spiral:    "SPIRAL",
    agitation: "AGITATION"
};

/**
 * One sentence about the stage in front of you.
 *
 * Never grows: the figures row above already shows water and cup in large
 * type, so a second big number here would be a duplicate. The value of this
 * card is the sentence.
 */
export default function BrewNowCard({pour, accent, resting}: Props) {
    if (pour === undefined) return null;

    const kind = glyphForPattern(pour.pourPattern);
    const rest = Math.round(pauseSeconds(pour));
    const heading = `${resting ? "RESTING" : "POURING"} · ${PATTERN_WORD[kind]} · `
        + `${Math.max(pour.temperature, 0)}°`;
    const pattern = rest > 0
        ? `${PATTERN_SENTENCE[kind]}, then it rests ${rest} s.`
        : `${PATTERN_SENTENCE[kind]}.`;
    const stir = AGITATION_SENTENCE[pour.agitation];
    const sentence = stir === undefined ? pattern : `${pattern} ${stir}`;

    return (
        <YStack
            backgroundColor={palette.raised}
            borderRadius="$4"
            padding="$3"
            gap="$2"
        >
            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6} color={accent}>
                {heading}
            </DotMatrixText>
            <View>
                {/* Reserves the height; never read — and hidden from screen
                    readers, which would otherwise announce this sentence and
                    then the real one. The card sits below the measured band
                    region, so a sentence that wraps to a third line takes that
                    height out of the ladder and thins every rung in the brew.
                    Real text, not a minHeight: it wraps to the true tallest
                    height and scales with Dynamic Type. */}
                <View accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants">
                    <DotMatrixText testID="brew-now-reserve" fontSize={11} color={palette.dim}
                                   style={{opacity: 0}}>
                        {LONGEST_NOW_SENTENCE}
                    </DotMatrixText>
                </View>
                <View style={{position: "absolute", top: 0, left: 0, right: 0}}>
                    <DotMatrixText testID="brew-now-sentence" fontSize={11}
                                   color={palette.dim}>
                        {sentence}
                    </DotMatrixText>
                </View>
            </View>
        </YStack>
    );
}

import React from "react";
import {Text, XStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {CHIP_HEIGHT} from "@/components/RailChip";
import {palette} from "@/constants/colors";

const FIELD_WIDTH = 82;
const FIGURES_WIDTH = 72;

type Props = {
    field: string;
    value: string;
    /**
     * Counted brews, or null when the count is already in the value column.
     *
     * The untagged row is the only caller that passes null. It has no field of
     * its own, so its count sits where a value would and printing it again in
     * the figures would give the one row the design leans on being right the
     * shape `NOT TAGGED | 9 brews | 3.9 · 9`.
     */
    brews: number | null;
    rating: number;
    rated: number;
    accent: string;
    accessibilityLabel?: string;
};

/**
 * The figures as a sentence, for a row that is spoken as one thing.
 *
 * A grouped row replaces its children's spoken text with its label, so the
 * count and the average have to be in the label or a screen reader will not
 * hear them at all. `4.5 · 11` is a glance, not a sentence: the separator is
 * silent and the two numbers arrive with nothing to tell them apart.
 */
function spokenFigures(rating: number, rated: number): string {
    if (rated === 0) return "not rated";
    const brews = rated === 1 ? "1 rated brew" : `${rated} rated brews`;
    return `rated ${rating.toFixed(1)} from ${brews}`;
}

export function BeanProfileRow({
    field, value, brews, rating, rated, accent, accessibilityLabel
}: Props) {
    // No rated brews means no average: 0.0 would claim a measurement nobody
    // took. What is left is the count, and where the count has already been
    // shown there is nothing left to print at all.
    const average = rated === 0 ? "" : rating.toFixed(1);
    const figures = brews === null
        ? average
        : average === "" ? `${brews}` : `${average} · ${brews}`;

    return (
        <XStack
            testID="bean-profile-row"
            accessible={accessibilityLabel !== undefined}
            accessibilityLabel={accessibilityLabel === undefined
                ? undefined
                : `${accessibilityLabel}, ${value}, ${spokenFigures(rating, rated)}`}
            minHeight={CHIP_HEIGHT}
            alignItems="center"
            gap="$2">
            <DotMatrixText
                fontSize={11}
                weight="bold"
                letterSpacing={1.3}
                color={palette.dim}
                style={{width: FIELD_WIDTH}}>
                {field}
            </DotMatrixText>
            <Text
                flex={1}
                minWidth={0}
                numberOfLines={1}
                ellipsizeMode="tail"
                fontSize={13}
                color={palette.text}>
                {value}
            </Text>
            <DotMatrixText
                fontSize={11}
                weight="bold"
                letterSpacing={1.2}
                color={accent}
                style={{width: FIGURES_WIDTH, textAlign: "right"}}>
                {figures}
            </DotMatrixText>
        </XStack>
    );
}

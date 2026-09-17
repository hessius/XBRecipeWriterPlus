import React from "react";
import {Pressable} from "react-native";
import {XStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import {palette} from "@/constants/colors";
import {MAX_RATING} from "@/library/brew/BrewRecord";

/** How a rating reads aloud, for the label and for the interactive hint. */
export function spokenRating(rating: number): string {
    if (rating <= 0) return "Not rated";
    return rating === 1 ? "1 star" : `${rating} stars`;
}

type Props = {
    /** 0 to 5, where 0 is unrated and draws nothing at all. */
    rating: number;
    /** Present makes the row a control; absent leaves it a reading. */
    onRate?: (rating: number) => void;
    /**
     * Set false inside a control that already says the rating in its own
     * label. A `Pressable` replaces its subtree for a screen reader, so an
     * accessible node inside one only makes the same words reachable twice.
     */
    announce?: boolean;
    size?: number;
    testID?: string;
};

/**
 * A brew's rating, read or given.
 *
 * Zero draws nothing rather than five hollow stars. An unrated brew is not a
 * bad one, and a row of empty outlines is exactly how a bad one would have to
 * be drawn if the scale ever showed its unfilled half: the reading surface and
 * the control therefore differ on purpose. The control shows all five, because
 * a control the user cannot see cannot be used; the reading shows only what was
 * given.
 *
 * Pressing the star that already holds the rating clears it. That is the only
 * way back to unrated, and it has to exist: a rating given by accident on a
 * screen the user is tapping through is otherwise permanent.
 */
export default function BrewStars(
    {rating, onRate, announce = true, size = 18, testID}: Props
) {
    const shown = onRate === undefined ? rating : MAX_RATING;
    if (shown <= 0) return null;

    const stars = Array.from({length: shown}, (_, index) => index + 1);

    if (onRate === undefined) {
        return (
            <XStack gap="$1" testID={testID}
                    accessible={announce}
                    accessibilityLabel={announce ? spokenRating(rating) : undefined}>
                {stars.map((star) => (
                    <DotIcon key={star} name="favourite" size={size}
                             color={palette.text}/>
                ))}
            </XStack>
        );
    }

    return (
        <XStack gap="$2" testID={testID}>
            {stars.map((star) => (
                <Pressable key={star}
                           testID={`${testID ?? "brew-stars"}-${star}`}
                           // One control per star rather than one adjustable
                           // row: an adjustable reports a value and takes
                           // increments, which is right for a slider and wrong
                           // for five discrete things a user wants to hit
                           // directly. Each button says what it will do, and
                           // the one that is already the rating says it will
                           // undo it.
                           accessibilityRole="button"
                           accessibilityLabel={star === rating
                               ? `Clear the rating, currently ${spokenRating(rating).toLowerCase()}`
                               : `Rate ${star === 1 ? "1 star" : `${star} stars`}`}
                           hitSlop={6}
                           onPress={() => onRate(star === rating ? 0 : star)}>
                    <DotIcon name="favourite" size={size}
                             color={star <= rating ? palette.text : palette.muted}/>
                </Pressable>
            ))}
        </XStack>
    );
}

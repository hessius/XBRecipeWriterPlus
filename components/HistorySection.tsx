import React from "react";
import {Text, XStack, YStack} from "tamagui";

import BrewStars from "@/components/BrewStars";
import DeckSection from "@/components/DeckSection";
import {palette} from "@/constants/colors";
import {formatBrewDate} from "@/library/brew/brewFormat";
import type {BrewSummary} from "@/library/BrewDatabase";

/**
 * How a recipe has gone, and the one place a user says how it went.
 *
 * The star is the whole of the recipe side of rating. One gesture, two
 * outcomes: where the app watched a brew today it rates that brew, and where it
 * watched nothing it writes a record carrying only the verdict. The mechanism
 * is never explained because it never needs to be. In both cases the user has
 * said this coffee was a four.
 *
 * Without it a user who writes cards and brews at the machine could never
 * produce a rating at all, and the axis the library sorts by would ship
 * permanently empty for them.
 *
 * A recipe never brewed still says so plainly and still invites nothing beyond
 * the star. There is a BREW button on the screen above this line already, and a
 * second prompt down here would be the app nagging.
 *
 * The comparison between two brews of one recipe is still #95's, and still
 * lands here, in a section that is already named and already scrolled to.
 */
export default function HistorySection({summary, onRate}: {
    summary: BrewSummary;
    /** Absent leaves the section a reading rather than a control. */
    onRate?: (rating: number) => void;
}) {
    const {avgRating, rated} = summary;

    return (
        <DeckSection title="HOW IT HAS GONE" testID="about-history">
            <YStack gap="$2">
                <Text testID="history-summary" fontSize={13}
                      color={summary.times > 0 ? palette.text : palette.dim}>
                    {line(summary)}
                </Text>

                {onRate !== undefined && (
                    <XStack alignItems="center" gap="$3">
                        {/* Rounded, because the stars summarise several brews
                            rather than one verdict, and half a star is not a
                            thing this scale has. The exact figure sits beside
                            them for anyone who wants it. */}
                        <BrewStars rating={Math.round(avgRating)} onRate={onRate}
                                   clearable={false} testID="recipe-stars"/>
                        {rated > 0 && (
                            <Text testID="history-rating" fontSize={12}
                                  color={palette.dim}>
                                {`${avgRating.toFixed(1)} from ${rated}`}
                                {rated === 1 ? " rating" : " ratings"}
                            </Text>
                        )}
                    </XStack>
                )}
            </YStack>
        </DeckSection>
    );
}

function line({times, lastAt}: BrewSummary): string {
    if (times === 0) return "Not brewed yet.";
    // The date is skipped rather than guessed when the row carries no
    // timestamp: an old record still counts as a brew, it just cannot say when.
    const when = lastAt > 0 ? `, last on ${formatBrewDate(lastAt)}` : "";
    return times === 1 ? `Brewed once${when}.` : `Brewed ${times} times${when}.`;
}

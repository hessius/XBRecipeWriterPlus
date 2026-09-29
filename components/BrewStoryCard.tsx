import React from "react";
import {StyleSheet, View} from "react-native";
import {XStack, YStack} from "tamagui";

import BrewStars from "@/components/BrewStars";
import DotMatrixText from "@/components/DotMatrixText";
import Wordmark from "@/components/Wordmark";
import {palette} from "@/constants/colors";
import {SCREEN_PADDING} from "@/constants/layout";
import {storyFrame} from "@/library/brew/storyCard";

/** How many tags fit on the card before the rest are counted instead. */
const MAX_SHOWN_TAGS = 4;

type Props = {
    /** The width the card is drawn at; the height follows from the ratio. */
    width: number;
    /**
     * The very same `BrewSummary` element the record screen draws.
     *
     * Passed in rather than rebuilt from a second set of props, because a
     * second drawing of a brew through different components is exactly what
     * produced the mangled export `app/brewRecord.tsx` replaced. The screen
     * has already worked out the plan, the delivered water, the bypass and
     * the frontier; the card is the frame around that answer, not a second
     * one.
     */
    summary: React.ReactNode;
    /** When the brew happened, already formatted. */
    when: string;
    accent: string;
    /** 0 to 5. Zero draws no row at all. */
    rating: number;
    /** The coffee as one line, from `storyCoffeeLine`, or null. */
    coffee: string | null;
    /** The brew's tags, in the order they were given. */
    tags: string[];
};

/**
 * A finished brew as a 9:16 card, for a story.
 *
 * Separate from the in-place export on purpose. `ViewShot` on the record
 * screen photographs the node that is on the glass, so that what you see is
 * exactly what leaves the phone, and that promise is worth keeping: this is a
 * different composition at a different ratio, with its own capture target.
 *
 * The bands at the top and bottom are empty rather than decorated. Story UI is
 * laid over them by the platform, and anything drawn there is either covered
 * or fighting with a reply box.
 *
 * Branding is a line of the card's own, at the head of the content, rather
 * than a watermark over the trace. A mark that has to be seen through the data
 * is a mark that damages the data.
 */
export default function BrewStoryCard({
    width, summary, when, accent, rating, coffee, tags
}: Props) {
    const frame = storyFrame(width);
    const shown = tags.slice(0, MAX_SHOWN_TAGS);
    const extra = tags.length - shown.length;

    return (
        <View
            testID="brew-story-card"
            style={[styles.frame, {width: frame.width, height: frame.height}]}
        >
            <View style={{height: frame.safeTop}} testID="story-safe-top"/>
            <YStack flex={1} justifyContent="center" gap="$2">
                <XStack paddingHorizontal={SCREEN_PADDING}
                        alignItems="center" justifyContent="space-between">
                    <Wordmark fontSize={16} plusColor={accent}/>
                    <DotMatrixText testID="story-when" fontSize={11}
                                   weight="bold" letterSpacing={1.4}
                                   color={palette.dim}>
                        {when}
                    </DotMatrixText>
                </XStack>

                {summary}

                {/* Left out entirely when there is nothing to say. A card that
                    reserves a row for a coffee nobody named, or for stars
                    nobody gave, reads as a card that failed to load them. */}
                {coffee !== null && (
                    <XStack paddingHorizontal={SCREEN_PADDING}>
                        <DotMatrixText testID="story-coffee" fontSize={12}
                                       weight="bold" letterSpacing={1.4}
                                       color={palette.text}>
                            {coffee}
                        </DotMatrixText>
                    </XStack>
                )}

                {/* Guarded here as well as inside `BrewStars`, which draws
                    nothing for an unrated brew: the row itself still has
                    padding, and an empty padded row is the gap a card for an
                    unrated brew would otherwise carry. */}
                {rating > 0 && (
                    <XStack testID="story-rating-row" paddingHorizontal={SCREEN_PADDING}>
                        {/* A reading, not a control: no `onRate`, so only the
                            stars that were given are drawn. */}
                        <BrewStars testID="story-rating" rating={rating} size={16}/>
                    </XStack>
                )}

                {shown.length > 0 && (
                    <XStack paddingHorizontal={SCREEN_PADDING} gap="$2"
                            flexWrap="wrap" testID="story-tags">
                        {shown.map((tag) => (
                            <XStack key={tag} paddingHorizontal={8}
                                    paddingVertical={4} borderRadius={4}
                                    backgroundColor={palette.raised}>
                                <DotMatrixText fontSize={10} weight="bold"
                                               letterSpacing={1.2}
                                               color={palette.dim}>
                                    {tag}
                                </DotMatrixText>
                            </XStack>
                        ))}
                        {/* Counted rather than crammed. Five tags at this size
                            wrap to a second row and push the ladder into the
                            platform's reply box. */}
                        {extra > 0 && (
                            <DotMatrixText testID="story-tags-more" fontSize={10}
                                           weight="bold" letterSpacing={1.2}
                                           color={palette.muted}>
                                {`+${extra}`}
                            </DotMatrixText>
                        )}
                    </XStack>
                )}
            </YStack>
            <View style={{height: frame.safeBottom}} testID="story-safe-bottom"/>
        </View>
    );
}

const styles = StyleSheet.create({
    /**
     * The card supplies its own background for the same reason `BrewSummary`
     * does: a capture inherits nothing from its ancestors. `overflow: hidden`
     * holds the ratio — content that outgrew the frame would otherwise be
     * photographed spilling past the 9:16 the platforms are about to crop to.
     */
    frame: {
        backgroundColor: palette.base,
        overflow:        "hidden"
    }
});

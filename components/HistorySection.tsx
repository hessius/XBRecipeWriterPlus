import React from "react";
import {Text} from "tamagui";

import DeckSection from "@/components/DeckSection";
import {palette} from "@/constants/colors";
import {formatBrewDate} from "@/library/brew/brewFormat";
import type {BrewSummary} from "@/library/BrewDatabase";

/**
 * How a recipe has gone: one line, and nothing more yet.
 *
 * Deliberately a stub. The ratings and the comparison between two brews of one
 * recipe land in #95, and they land here, in a section that is already named,
 * already in the deck's order and already scrolled to. A feature that has to
 * invent a home for its output is a feature that gets a screen redesigned
 * twice.
 *
 * A recipe never brewed says so plainly and invites nothing. There is a BREW
 * button on the screen above this line already, and a second prompt down here
 * would be the app nagging.
 */
export default function HistorySection({summary}: {summary: BrewSummary}) {
    return (
        <DeckSection title="HOW IT HAS GONE" testID="about-history">
            <Text testID="history-summary" fontSize={13}
                  color={summary.times > 0 ? palette.text : palette.dim}>
                {line(summary)}
            </Text>
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

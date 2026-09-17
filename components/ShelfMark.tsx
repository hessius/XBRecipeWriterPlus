import React from "react";
import {YStack} from "tamagui";

import {palette} from "@/constants/colors";

/**
 * The size the design fixes, and the reason it is fixed.
 *
 * §"Shelf art is a slot, not a decision" commits to a 44 pt square for every
 * variant so that swapping the art cannot reflow the grid. The art is going to
 * testers; the geometry is not, which is why it lives here rather than inside
 * whichever variant wins.
 */
export const MARK_SIZE = 44;

/** How wide the placeholder bar is, as a fraction of the square. */
const BAR_WIDTH = {manual: 28, auto: 16};

/**
 * The square a shelf's art is drawn in.
 *
 * This is the contract the design asked for, with the plainest possible art
 * inside it: a filled bar for a shelf a person made, a shorter faint one for one
 * the app derived. Both candidates the spec is testing -- an accent field with a
 * dot matrix glyph for auto shelves, superimposed pour profiles for manual ones
 * -- drop into this component without the grid noticing, because the square is
 * the same size whatever is drawn in it and everything it draws arrives as a
 * prop. Nothing is fetched here and nothing is stored, so a mark cannot go stale
 * against the shelf it sits on.
 *
 * `accents` and `profiles` are the props those candidates will read. They are
 * declared and unused on purpose: the caller that will have to supply them is
 * the grid, and typing them now is what keeps the eventual swap to this file.
 */
export default function ShelfMark({kind}: {
    kind: "auto" | "manual";
    /** Member accents, dominant first. For the mosaic and profile variants. */
    accents?: readonly string[];
    /** At most three members' pour profiles, for the profile variant. */
    profiles?: readonly unknown[];
}) {
    const manual = kind === "manual";

    return (
        <YStack width={MARK_SIZE} height={MARK_SIZE} justifyContent="center"
                testID="shelf-mark">
            <YStack height={4} width={manual ? BAR_WIDTH.manual : BAR_WIDTH.auto}
                    borderRadius={2}
                    backgroundColor={manual ? palette.text : palette.muted}/>
        </YStack>
    );
}

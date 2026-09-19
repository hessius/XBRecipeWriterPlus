import React from "react";
import {XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import {onAccent, palette} from "@/constants/colors";
import type {DotIconName} from "@/constants/dotIcons";

/**
 * The size the design fixes, and the reason it is fixed.
 *
 * §"Shelf art: a glyph for an auto shelf, a mosaic for a manual one" commits
 * to a 44 pt square for both marks so that changing the art cannot reflow the
 * grid. The section used to leave the art itself open; the tester group has
 * since answered, but the geometry outlives the answer, which is why it is
 * still fixed here.
 */
export const MARK_SIZE = 44;

/**
 * How many members a mark reads.
 *
 * The design's cap, and it is a drawing rule rather than a query one: a mosaic
 * of forty tiles is a texture, not a mark. Enforced here as well as in the
 * query that supplies it, because the component is what the cap is about -- a
 * caller handing over more must not be able to make the square illegible.
 */
export const MARK_MEMBERS = 3;

/** The dot matrix glyph's size inside the square. */
const GLYPH_SIZE = 26;

/** The mosaic's gutter, in points. One dot of air, as the icons use. */
const MOSAIC_GAP = 2;

/** Radius shared by both marks, so the grid has one silhouette, not two. */
const RADIUS = 10;

/**
 * Which art this shelf takes.
 *
 * The design's central claim, now settled: an auto shelf is a closed set that
 * ships with the app, so it carries a glyph drawn at design time, while a
 * manual shelf is open ended and takes a mosaic of its members' accents. The
 * art then says which kind of shelf it is, without a caption saying so.
 *
 * It was a setting while the tester group was deciding, and the losing
 * candidates have been deleted along with the switch. A function rather than
 * an inlined conditional because the rule is the interesting part and it is
 * worth being able to read it, and test it, on its own.
 */
export function markFor(kind: "auto" | "manual"): "mosaic" | "glyph" {
    return kind === "auto" ? "glyph" : "mosaic";
}

/**
 * The square a shelf's art is drawn in.
 *
 * Everything it draws arrives as a prop. Nothing is fetched here and nothing is
 * stored, so a mark cannot go stale against the shelf it sits on.
 *
 * A shelf whose members give its mark nothing to draw falls back to the plain
 * accent field rather than to the other mark. A tile that silently changed art
 * when its last member left would read as two shelves.
 */
export default function ShelfMark({
    kind, glyph, accents = [], inverted = false
}: {
    kind: "auto" | "manual";
    /** The glyph an auto shelf carries. Auto shelves only. */
    glyph?: DotIconName | null;
    /** Member accents, dominant first. */
    accents?: readonly string[];
    /**
     * Swap the glyph square with its tile: the accent has gone to the card
     * behind this, so the square takes the quiet field and the glyph draws in
     * the accent it gave up.
     *
     * Glyph only. The mosaic *is* the members' colours, so there is nothing in
     * it to hand to a tile and nothing left over here.
     */
    inverted?: boolean;
}) {
    // An auto shelf with no glyph draws the mosaic rather than an empty square.
    // Every auto shelf is supposed to have one -- the stock shelves are a
    // closed set drawn at design time, and the per-author shelves share a
    // single drawing -- so this is a floor under a bug, not a route anything
    // is expected to take.
    const asked = markFor(kind);
    const mark = asked === "glyph" && glyph == null ? "mosaic" : asked;
    const members = accents.slice(0, MARK_MEMBERS);
    const field = members[0] ?? palette.surface;

    if (mark === "glyph" && glyph != null) {
        // Inverted, the accent is behind the whole tile and this square is the
        // quiet one, so the glyph draws in the accent rather than on it. With
        // no members there is no accent to draw in, and the plain ink that the
        // upright mark already falls back to is the right answer either way.
        const ink = inverted
            ? (members.length > 0 ? field : palette.text)
            : (members.length > 0 ? onAccent.text : palette.text);
        return (
            // The test id carries the inversion because Tamagui resolves colour
            // to a class rather than to a style object, so a test cannot read
            // the background back. It is the one thing about this square a test
            // has to be able to see.
            <Square testID={inverted ? "shelf-mark-glyph-inverted" : "shelf-mark-glyph"}
                    background={inverted ? palette.surface : field}>
                <DotIcon name={glyph} size={GLYPH_SIZE} color={ink}/>
            </Square>
        );
    }

    if (mark === "mosaic" && members.length > 0) {
        // Four tiles from at most three accents: the dominant one takes the
        // spare corner rather than a fourth member being read, so the mosaic
        // obeys the member cap above and a shelf of one still fills its square
        // instead of drawing a lone quarter.
        const tiles = [0, 1, 2, 3].map((i) => members[i % members.length]);
        return (
            <Square testID="shelf-mark-mosaic" background={palette.surface}>
                <YStack width={MARK_SIZE} height={MARK_SIZE} gap={MOSAIC_GAP}>
                    {[0, 2].map((row) => (
                        <XStack key={row} flex={1} gap={MOSAIC_GAP}>
                            <YStack flex={1} backgroundColor={tiles[row]}/>
                            <YStack flex={1} backgroundColor={tiles[row + 1]}/>
                        </XStack>
                    ))}
                </YStack>
            </Square>
        );
    }

    return <Square testID="shelf-mark-field" background={field}/>;
}

/** The 44 pt square itself, which both marks share and neither may resize. */
function Square({background, testID, children}: {
    background: string;
    testID: string;
    children?: React.ReactNode;
}) {
    return (
        <YStack width={MARK_SIZE} height={MARK_SIZE} borderRadius={RADIUS}
                overflow="hidden" alignItems="center" justifyContent="center"
                backgroundColor={background}
                testID="shelf-mark">
            <YStack testID={testID} alignItems="center" justifyContent="center">
                {children}
            </YStack>
        </YStack>
    );
}

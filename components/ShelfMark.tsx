import React from "react";
import Svg, {Path} from "react-native-svg";
import {XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import {buildProfilePath, PROFILE_STROKE_WIDTH} from "@/components/PourProfile";
import {onAccent, palette} from "@/constants/colors";
import type {DotIconName} from "@/constants/dotIcons";
import type Pour from "@/library/Pour";
import type {ShelfMarkVariant} from "@/library/Settings";

/**
 * The size the design fixes, and the reason it is fixed.
 *
 * §"Shelf art is a slot, not a decision" commits to a 44 pt square for every
 * variant so that swapping the art cannot reflow the grid. The art is going to
 * testers; the geometry is not, which is why it lives here rather than inside
 * whichever variant wins.
 */
export const MARK_SIZE = 44;

/**
 * How many members any variant reads.
 *
 * The design's cap, and it is a drawing rule rather than a query one: a shelf of
 * forty drawn as forty staircases is a solid block, and a mosaic of forty tiles
 * is a texture. Enforced here as well as in the query that supplies it, because
 * the component is what the cap is about -- a caller handing over more must not
 * be able to make the square illegible.
 */
export const MARK_MEMBERS = 3;

/** The dot matrix glyph's size inside the square. */
const GLYPH_SIZE = 26;

/** The mosaic's gutter, in points. One dot of air, as the icons use. */
const MOSAIC_GAP = 2;

/** Radius shared by every variant, so a swap does not change the silhouette. */
const RADIUS = 10;

/**
 * Which art this shelf takes, given the variant the tester picked.
 *
 * `hybrid` is the only branch with anything to decide, and what it decides is
 * the design's central claim: an auto shelf is a closed set that ships with the
 * app, so it carries a glyph drawn at design time, while a manual shelf is open
 * ended and takes a mark derived from its members. The art then says which kind
 * of shelf it is, without a caption saying so.
 */
export function markFor(
    variant: ShelfMarkVariant, kind: "auto" | "manual"
): "mosaic" | "profiles" | "glyph" {
    if (variant !== "hybrid") return variant;
    return kind === "auto" ? "glyph" : "profiles";
}

/**
 * The square a shelf's art is drawn in.
 *
 * Everything it draws arrives as a prop. Nothing is fetched here and nothing is
 * stored, so a mark cannot go stale against the shelf it sits on, and switching
 * variants cannot make one shelf disagree with another about what it holds.
 *
 * A shelf whose members give the chosen variant nothing to draw falls back to
 * the plain accent field rather than to a different variant. A tile that
 * silently changed art when its last member left would read as two shelves.
 */
export default function ShelfMark({
    kind, variant = "hybrid", glyph, accents = [], profiles = []
}: {
    kind: "auto" | "manual";
    /** Which candidate to draw. From the LABS setting. */
    variant?: ShelfMarkVariant;
    /** The glyph an auto shelf carries. Auto shelves only. */
    glyph?: DotIconName | null;
    /** Member accents, dominant first. For the mosaic and glyph variants. */
    accents?: readonly string[];
    /** Members' pour profiles, for the profile variant. */
    profiles?: readonly Pour[][];
}) {
    // A glyph that was asked for and does not exist becomes the derived mark
    // rather than an empty square. The glyphs are a closed set drawn at design
    // time for the shelves that ship with the app; a per-author shelf is also
    // `auto`, but it is named by a stranger, so there is no drawing for it and
    // none can be invented. It is open ended in the way a tag is, so it takes
    // what a tag takes.
    const asked = markFor(variant, kind);
    const mark = asked === "glyph" && glyph == null ? "profiles" : asked;
    const members = accents.slice(0, MARK_MEMBERS);
    // Paired before the empty ones are dropped, not after. The accent is what
    // says which recipe a staircase belongs to, and a recipe with no pours
    // leaves a hole in the profile list but not in the accent list: indexing
    // one by the other's position draws a shape in a stranger's colour.
    const shapes = profiles.slice(0, MARK_MEMBERS)
        .map((pours, index) => ({pours, accent: accents[index] ?? palette.muted}))
        .filter(({pours}) => pours.length > 0);
    const field = members[0] ?? palette.surface;

    if (mark === "glyph" && glyph != null) {
        return (
            <Square testID="shelf-mark-glyph" background={field}>
                {/* Dark ink only when the field is an accent. An empty shelf
                    draws on `surface`, where `onAccent.text` would vanish. */}
                <DotIcon name={glyph} size={GLYPH_SIZE}
                         color={members.length > 0 ? onAccent.text : palette.text}/>
            </Square>
        );
    }

    if (mark === "profiles" && shapes.length > 0) {
        return (
            <Square testID="shelf-mark-profiles" background={palette.surface}>
                <Svg width={MARK_SIZE} height={MARK_SIZE}
                     viewBox={`0 0 ${MARK_SIZE} ${MARK_SIZE}`}>
                    {shapes.map(({pours, accent}, index) => (
                        <Path key={index} testID={`shelf-mark-profile-${index}`}
                              // Inset so a staircase reaching the top of its
                              // box is not clipped by the rounded corner.
                              d={buildProfilePath(pours as Pour[],
                                                  MARK_SIZE - 12, MARK_SIZE - 16)}
                              translateX={6} translateY={10}
                              fill="none"
                              stroke={accent}
                              strokeWidth={PROFILE_STROKE_WIDTH}/>
                    ))}
                </Svg>
            </Square>
        );
    }

    if (mark === "mosaic" && members.length > 0) {
        // Four tiles from at most three accents: the dominant one takes the
        // spare corner rather than a fourth member being read, so the mosaic
        // obeys the same member cap as the other variants and a shelf of one
        // still fills its square instead of drawing a lone quarter.
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

/** The 44 pt square itself, which every variant shares and none may resize. */
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

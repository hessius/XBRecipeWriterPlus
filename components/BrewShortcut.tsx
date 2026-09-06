import React from "react";
import {Pressable, View, type ViewStyle} from "react-native";

import DotMatrixText from "@/components/DotMatrixText";

/** The shapes the card itself draws. `swipe` is a tile in the tray, not chrome. */
export type CardShortcut = "edge" | "tab" | "chip" | "glyph";

type Props = {
    variant: CardShortcut;
    /** The card's accent, used for the letter ink. */
    accent: string;
    /** The card's own ink, so the shortcut reads as cut from the card. */
    ink: string;
    onPress: () => void;
};

/** Wide enough to centre four stacked letters, which 21 was not. */
const BAND_WIDTH = 34;
const TAB_INSET = 4;
/**
 * `RecipeCard`'s `borderRadius="$8"`, read off the running theme.
 *
 * A literal because the token is not a number at this call site — the same
 * reason `constants/layout.ts` exists. Tamagui's `$8` radius is 22, which is
 * not the value a reader guesses, so it is written down here once.
 */
const CARD_RADIUS = 22;
/**
 * Concentric with the card, rather than derived from the tab's own width.
 *
 * A shape inset by n inside a radius r is concentric at r - n. The capsule this
 * replaces used `width / 2`, which gave 10.5 against the card's 22: a rule that
 * refers to the shape's own width can only agree with the card by coincidence,
 * and here it did not come close.
 */
const TAB_RADIUS = CARD_RADIUS - TAB_INSET;
const CHIP_WIDTH = 78;
const CHIP_HEIGHT = 34;
/** The chip's inner corner. A fold, so it is smaller than the card's own. */
const CHIP_FOLD = 14;
/** `RecipeCard`'s `padding="$3.5"`, read off the running theme. It is 16. */
const CARD_PADDING = 16;

/**
 * The play mark's dimensions.
 *
 * ~20 pt tall, the brief's "roughly a 20 pt glyph", and drawn as the classic
 * transparent-border triangle: `borderLeftWidth` becomes its width and the top
 * and bottom borders its height. A little narrower than it is tall, which is
 * how a play triangle reads as a play triangle rather than an arrowhead.
 */
const GLYPH_HEIGHT = 20;
const GLYPH_WIDTH = 16;
/**
 * How faint the mark is until it is pressed.
 *
 * The brief asks for "low-contrast until pressed": the quietest possible
 * visible affordance, a hint the card can be brewed rather than a control
 * demanding it. On press it goes to full ink. Only a device settles whether
 * this is the right amount of quiet.
 */
const GLYPH_REST_OPACITY = 0.4;

/**
 * How much of the card's trailing edge each shape occupies.
 *
 * The card adds this to its title row's right padding. Fault 2 of the shipped
 * capsule was landing on the `TEA` marker, and it is fixed by the card knowing
 * what the shortcut takes rather than by choosing a shape that happens to miss.
 * The pour profile and the stats row are not inset, because neither reaches
 * that edge.
 */
export const SHORTCUT_INSET: Record<CardShortcut, number> = {
    edge:  BAND_WIDTH - CARD_PADDING,
    tab:   BAND_WIDTH + TAB_INSET - CARD_PADDING,
    chip:  0,
    // The glyph occupies the edge band's column (a small mark centred in it),
    // so it reserves the band's room and the marker clears it the same way.
    glyph: BAND_WIDTH - CARD_PADDING
};

/**
 * Slop, not a wider shape.
 *
 * It has to point inward. The card clips its subtree, and React Native will
 * not hit-test into a clipping container for a point outside it, so slop on
 * the band's top, right and bottom -- every side it shares with the card's
 * edge -- is bought and never delivered. Only `left` reaches anywhere the
 * finger can actually be found.
 *
 * That reverses the capsule's rule, which kept `left` at 0 so as not to steal
 * presses from the card body. The capsule was an island in the middle of the
 * card, where the body it stole from was on both sides of it; a band is pinned
 * to the edge, and the alternative to stealing 10 is a 34 wide target for the
 * one control on the card that starts a machine. The chip already takes its
 * slop inward for the same reason.
 */
const BAND_SLOP = {top: 8, bottom: 8, left: 10, right: 0};
const CHIP_SLOP = {top: 10, bottom: 0, left: 10, right: 0};

const SHAPES: Record<CardShortcut, ViewStyle> = {
    edge: {right: 0, top: 0, bottom: 0, width: BAND_WIDTH},
    tab:  {
        right:        TAB_INSET,
        top:          TAB_INSET,
        bottom:       TAB_INSET,
        width:        BAND_WIDTH,
        borderRadius: TAB_RADIUS
    },
    chip: {
        right:                   0,
        bottom:                  0,
        width:                   CHIP_WIDTH,
        height:                  CHIP_HEIGHT,
        borderTopLeftRadius:     CHIP_FOLD,
        borderBottomRightRadius: CARD_RADIUS
    },
    // The edge band's column with no fill: a full-height 34 wide touch target
    // pinned to the trailing edge, holding a small centred triangle. Reusing
    // the band's geometry is what lets it share the band's slop and inset.
    glyph: {right: 0, top: 0, bottom: 0, width: BAND_WIDTH}
};

/**
 * The play mark drawn by the `glyph` shape.
 *
 * A right-pointing triangle built from borders: the left border is inked and
 * becomes the width, the transparent top and bottom borders the height. A
 * module-scope component, not a local render helper -- a component defined
 * inside another's body is a new type every render, which remounts it and
 * throws away its state.
 */
function PlayGlyph({ink, pressed}: {ink: string; pressed: boolean}) {
    return (
        <View
            testID="brew-glyph"
            style={{
                width:             0,
                height:            0,
                borderStyle:       "solid",
                borderTopWidth:    GLYPH_HEIGHT / 2,
                borderBottomWidth: GLYPH_HEIGHT / 2,
                borderLeftWidth:   GLYPH_WIDTH,
                borderTopColor:    "transparent",
                borderBottomColor: "transparent",
                borderLeftColor:   ink,
                opacity:           pressed ? 1 : GLYPH_REST_OPACITY
            }}
        />
    );
}

/**
 * BREW, on a recipe card, in one of four shapes.
 *
 * Four rather than one because the shape that shipped was chosen from a mockup
 * and had five faults in the hand. They are alternatives, never composed, and
 * they live in one file precisely so they can be read against each other while
 * the choice is open. When one wins the others are deleted.
 *
 * The bands stack their letters, one per line, rather than rotating them:
 * rotated text at this size is unreadable, and four stacked letters stay a
 * shape you recognise without reading. The chip is wide enough to say the word
 * outright. The glyph is the opposite extreme: no word, no capsule, no fill,
 * just a low-contrast play triangle centred in the edge band's column -- the
 * quietest a visible affordance can be, to judge against the swipe tray.
 *
 * Every shape shares the card's right edge with the swipe tray. That was
 * predicted before the capsule shipped and confirmed on hardware, and it is
 * accepted: a tap and a horizontal drag are distinguishable by intent, and
 * every alternative costs more than the collision does.
 */
export default function BrewShortcut({variant, accent, ink, onPress}: Props) {
    const horizontal = variant === "chip";
    const isGlyph = variant === "glyph";

    return (
        <Pressable
            testID="brew-shortcut"
            accessibilityRole="button"
            accessibilityLabel="Brew this recipe"
            onPress={onPress}
            hitSlop={horizontal ? CHIP_SLOP : BAND_SLOP}
            style={{
                position:   "absolute",
                // No capsule and no fill for the glyph: the column stays
                // transparent so only the play mark shows.
                backgroundColor: isGlyph ? "transparent" : ink,
                alignItems:      "center",
                justifyContent:  "center",
                ...SHAPES[variant]
            }}
        >
            {({pressed}) =>
                isGlyph ? (
                    <PlayGlyph ink={ink} pressed={pressed}/>
                ) : horizontal ? (
                    <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.4}
                                   color={accent}>
                        BREW
                    </DotMatrixText>
                ) : (
                    <>
                        {["B", "R", "E", "W"].map((letter) => (
                            <DotMatrixText key={letter} fontSize={9} weight="bold"
                                           color={accent}>
                                {letter}
                            </DotMatrixText>
                        ))}
                    </>
                )
            }
        </Pressable>
    );
}

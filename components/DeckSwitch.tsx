import React from "react";
import {Pressable} from "react-native";
import {XStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";

export type Deck = "brew" | "stages" | "about";

type Props = {
    deck: Deck;
    stageCount: number;
    /** The recipe's accent, filling the active half. */
    accent?: string;
    onChange: (deck: Deck) => void;
};

/**
 * Which deck of the editor is showing.
 *
 * Not a tab bar to look at: it navigates nothing, appears on no other screen,
 * and carries no icons. It exists so that neither half needs a scroll view of
 * its own — the pours used to be a horizontal pager nested inside the vertical
 * scroll, and the two fought each other and the sliders.
 *
 * It is a tab bar to listen to, though, which is why the halves are tabs and
 * not radios. A radio picks a value and leaves the screen where it was; these
 * two swap which half of the editor is on screen at all, and that is what a
 * screen reader means by a tab. The segmented rows inside the brew deck pick
 * values, so those are radios.
 */
export default function DeckSwitch({deck, stageCount, accent, onChange}: Props) {
    // One segment of however many there are. Named for what it is rather than
    // for how many there used to be: it was `half` when there were two, and the
    // name was the only thing standing between the switch and a third deck.
    // Width follows the text each segment has to hold rather than equal thirds.
    // `flexBasis: 0` gives the whole row to the grow weights, so STAGES claims
    // the extra room its count needs. `flexShrink: 1` keeps a long label
    // narrowing at large text sizes instead of overflowing.
    function segment(value: Deck, label: string, spoken: string) {
        const active = deck === value;
        return (
            <Pressable accessibilityRole="tab" accessibilityLabel={spoken}
                       accessibilityState={{selected: active}}
                       onPress={() => {
                           if (!active) onChange(value);
                       }}
                       style={{
                           flexBasis:       0,
                           flexGrow:        label.length,
                           flexShrink:      1,
                           alignItems:      "center",
                           paddingVertical: 9,
                           borderRadius:    9,
                           backgroundColor: active ? (accent ?? palette.text) : undefined
                       }}>
                <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.8}
                               color={active ? palette.base : palette.dim}>
                    {label}
                </DotMatrixText>
            </Pressable>
        );
    }

    return (
        <XStack accessibilityRole="tablist" gap={2} padding={3}
                marginHorizontal="$4" marginTop="$2"
                backgroundColor={palette.raised} borderRadius="$4">
            {segment("brew", "BREW", "Brew settings")}
            {segment("stages", `STAGES · ${stageCount}`, `Stages, ${stageCount}`)}
            {segment("about", "ABOUT", "About this recipe")}
        </XStack>
    );
}

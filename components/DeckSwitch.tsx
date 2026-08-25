import React from "react";
import {Pressable} from "react-native";
import {XStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";

export type Deck = "brew" | "stages";

type Props = {
    deck: Deck;
    stageCount: number;
    /** The recipe's accent, filling the active half. */
    accent?: string;
    onChange: (deck: Deck) => void;
};

/**
 * Which half of the editor is showing.
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
    function half(value: Deck, label: string, spoken: string) {
        const active = deck === value;
        return (
            <Pressable accessibilityRole="tab" accessibilityLabel={spoken}
                       accessibilityState={{selected: active}}
                       onPress={() => {
                           if (!active) onChange(value);
                       }}
                       style={{
                           flex:            1,
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
            {half("brew", "BREW", "Brew settings")}
            {half("stages", `STAGES · ${stageCount}`, `Stages, ${stageCount}`)}
        </XStack>
    );
}

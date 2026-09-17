import React from "react";
import {TextInput} from "react-native";
import {XStack, YStack} from "tamagui";

import BrewStars from "@/components/BrewStars";
import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";

/**
 * How the coffee was, said by the person who drank it.
 *
 * The first user-authored thing in the brew database, and the reason the rest
 * of #95 can exist: a machine log ranks nothing on its own.
 *
 * Both controls pin the brew, and neither says so in a second place. A user who
 * has just marked a brew has already said it is worth keeping, and the pin is
 * the app acting on that rather than another question to answer. The record
 * screen shows the resulting state, and offers to release it.
 *
 * The note is uncontrolled and committed on end-editing, the pattern every text
 * field in the editor uses: a value handed back on each keystroke fights the
 * cursor. There is no counter and no ceiling, because unlike a recipe's note
 * this one never has to fit on a library row.
 */
export default function BrewJudgement({rating, note, onRate, onNote, testID}: {
    rating: number;
    note: string;
    onRate: (rating: number) => void;
    onNote: (note: string) => void;
    testID?: string;
}) {
    return (
        <YStack gap="$2" testID={testID ?? "brew-judgement"}>
            <XStack alignItems="center" justifyContent="space-between">
                <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.4}
                               color={palette.dim}>
                    HOW WAS IT
                </DotMatrixText>
                <BrewStars rating={rating} onRate={onRate} testID="judgement-stars"/>
            </XStack>

            <TextInput
                testID="judgement-note"
                accessibilityLabel="Note on this brew"
                accessibilityHint="What the cup was like, and what to change next time."
                defaultValue={note}
                placeholder="Sweet, a little thin. Grind finer."
                placeholderTextColor={palette.muted}
                multiline={true}
                onEndEditing={(event) => onNote(event.nativeEvent.text)}
                style={{
                    fontSize:          15,
                    minHeight:         44,
                    color:             palette.text,
                    backgroundColor:   palette.raised,
                    borderRadius:      12,
                    paddingHorizontal: 14,
                    paddingVertical:   12
                }}/>
        </YStack>
    );
}

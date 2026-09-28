import React from "react";
import {Keyboard} from "react-native";
import {XStack, YStack} from "tamagui";

import BrewJudgement from "@/components/BrewJudgement";
import DotMatrixText from "@/components/DotMatrixText";
import XbrwSheet from "@/components/XbrwSheet";
import {RATING_SHEET_DONE, RATING_SHEET_TITLE} from "@/constants/brewCopy";
import {onAccent, palette} from "@/constants/colors";

/**
 * Somewhere to say more, once the stars have already been given.
 *
 * The rating is written before this opens, which is what makes the sheet
 * acceptable: dismissing it loses nothing. It is an offer of room, not a form
 * standing between the user and a saved verdict.
 *
 * Not the brew record screen. Being thrown into a whole screen for a five
 * second gesture is the annoyance this feature exists to avoid, and the record
 * is one tap away on the bar itself.
 *
 * The brew is named by its figures first and its recipe second, for the same
 * reason the bar is: a recipe brewed three times this week does not identify
 * which cup is being asked about.
 */
export default function BrewNoteSheet({
    open, onOpenChange, figures, recipeName, rating, note, onRate, onNote, onNoteDraft
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** `14:32 · 244 G`, already formatted by the caller. */
    figures: string;
    recipeName: string;
    rating: number;
    note: string;
    onRate: (rating: number) => void;
    onNote: (note: string) => void;
    onNoteDraft?: (note: string) => void;
}) {
    function close(): void {
        Keyboard.dismiss();
        onOpenChange(false);
    }

    return (
        <XbrwSheet open={open} onOpenChange={onOpenChange}
                   title={RATING_SHEET_TITLE} heightPercent={44}>
            <YStack gap="$3" paddingHorizontal="$4" paddingBottom="$4">
                <YStack gap="$1">
                    <DotMatrixText fontSize={16} weight="bold" color={palette.text}>
                        {figures}
                    </DotMatrixText>
                    <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.4}
                                   color={palette.dim}>
                        {recipeName.toUpperCase()}
                    </DotMatrixText>
                </YStack>

                <BrewJudgement rating={rating} note={note}
                               onRate={onRate} onNote={onNote} onNoteDraft={onNoteDraft}
                               showHeading={false} clearable={false}/>

                <XStack
                    accessibilityRole="button"
                    accessibilityLabel={RATING_SHEET_DONE}
                    testID="brew-note-done"
                    onPress={close}
                    height={48} alignItems="center" justifyContent="center"
                    borderRadius="$4"
                    backgroundColor={palette.text}>
                    <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.5}
                                   color={onAccent.text}>
                        {RATING_SHEET_DONE}
                    </DotMatrixText>
                </XStack>
            </YStack>
        </XbrwSheet>
    );
}

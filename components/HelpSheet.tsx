import React from "react";
import {ScrollView, Text, YStack} from "tamagui";

import XbrwSheet from "@/components/XbrwSheet";
import {palette} from "@/constants/colors";
import {DETAILED_TOPICS, helpQuestion} from "@/constants/recipeHelp";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

/**
 * How much of the screen the sheet takes.
 *
 * It is a reference rather than a note, so it wants the room: enough that the
 * first questions are readable without a scroll, and enough that the screen
 * behind it is plainly still there.
 */
export const HELP_HEIGHT = 75;

/**
 * Everything the card format does not explain about itself, as one short FAQ.
 *
 * There used to be a marker beside every complicated label, and then a mode that
 * unfolded all of them at once. Both put the depth on the screen you were trying
 * to work on: the markers dotted it with fifteen small unanswered questions, and
 * the mode doubled its height. The screen now carries the six-word version under
 * each label and nothing more, and everything longer than that lives here,
 * behind one entry in the overflow.
 *
 * Questions rather than field names as headings. Someone opens this having
 * already read the label -- they are looking for what they wanted to know, not
 * for the glossary entry they have just come from.
 */
export default function HelpSheet({open, onOpenChange}: Props) {
    return (
        <XbrwSheet open={open} onOpenChange={onOpenChange} title="Help"
                   heightPercent={HELP_HEIGHT} prewarm>
            <ScrollView>
                <YStack gap="$4" paddingBottom="$4">
                    {DETAILED_TOPICS.map((topic) => {
                        const entry = helpQuestion(topic);
                        if (!entry) {
                            return null;
                        }

                        return (
                            <YStack key={topic} gap="$1.5">
                                <Text fontSize={13} fontWeight="700" color={palette.text}>
                                    {entry.question}
                                </Text>
                                <Text fontSize={12.5} lineHeight={19} color={palette.dim}>
                                    {entry.detail}
                                </Text>
                            </YStack>
                        );
                    })}
                </YStack>
            </ScrollView>
        </XbrwSheet>
    );
}

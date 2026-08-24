import React from "react";
import {ScrollView, Text, YStack} from "tamagui";

import XbrwSheet from "@/components/XbrwSheet";
import {palette} from "@/constants/colors";
import {DETAILED_TOPICS, RECIPE_HELP, type HelpTopic} from "@/constants/recipeHelp";

type Props = {
    open: boolean;
    /** One topic, or every topic that has a long-form note. */
    topic: HelpTopic | "all";
    onOpenChange: (open: boolean) => void;
};

/**
 * The long-form notes, on demand rather than in the way.
 *
 * A topic's title is set the way `FieldRow` sets it, because it is the same
 * string: the label beside the control and the heading of its paragraph must
 * not arrive in two different faces depending on which route reached them.
 */
/**
 * How much of the screen each shape of the sheet takes.
 *
 * A single paragraph in a sheet covering seventy per cent of the screen read as
 * an error rather than a note. The all-topics sheet is a different object -- a
 * scrolling reference -- and wants the room.
 */
export const HELP_HEIGHT = {one: 42, all: 75} as const;

export default function HelpSheet({open, topic, onOpenChange}: Props) {
    const topics = topic === "all" ? DETAILED_TOPICS : [topic];

    return (
        // No title. Every note in here is already headed by the name of the
        // thing it describes, so a word above them saying ABOUT was chrome
        // repeating what the first line said. It stays as the dialog's
        // accessible name, which has no headings to look at.
        <XbrwSheet open={open} onOpenChange={onOpenChange} showTitle={false}
                   heightPercent={topic === "all" ? HELP_HEIGHT.all : HELP_HEIGHT.one}
                   title={topic === "all" ? "About these settings" : RECIPE_HELP[topic].title}>
            <ScrollView>
                <YStack gap="$4" paddingBottom="$4">
                    {topics.map((key) => (
                        <YStack key={key} gap="$1.5">
                            <Text fontSize={11} letterSpacing={1.5}
                                  textTransform="uppercase" color={palette.text}>
                                {RECIPE_HELP[key].title}
                            </Text>
                            <Text fontSize={13} lineHeight={19} color={palette.dim}>
                                {RECIPE_HELP[key].detail ?? RECIPE_HELP[key].hint}
                            </Text>
                        </YStack>
                    ))}
                </YStack>
            </ScrollView>
        </XbrwSheet>
    );
}

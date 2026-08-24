import React from "react";
import {useWindowDimensions} from "react-native";
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
export default function HelpSheet({open, topic, onOpenChange}: Props) {
    const window = useWindowDimensions();
    const topics = topic === "all" ? DETAILED_TOPICS : [topic];

    return (
        // Sized to what it has to say. A single paragraph in a sheet covering
        // seventy per cent of the screen read as an error rather than a note,
        // and the same sheet has to hold every topic at once when it is opened
        // from the overflow menu -- so the height cannot be a constant either
        // way. The cap keeps the long form from filling the screen.
        <XbrwSheet open={open} onOpenChange={onOpenChange} fitContent
                   title={topic === "all" ? "ABOUT THESE SETTINGS" : "ABOUT"}>
            <ScrollView maxHeight={window.height * 0.55}>
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

import React from "react";
import {ScrollView, Text, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import XbrwSheet from "@/components/XbrwSheet";
import {palette} from "@/constants/colors";
import {DETAILED_TOPICS, RECIPE_HELP, type HelpTopic} from "@/constants/recipeHelp";

type Props = {
    open: boolean;
    /** One topic, or every topic that has a long-form note. */
    topic: HelpTopic | "all";
    onOpenChange: (open: boolean) => void;
};

/** The long-form notes, on demand rather than in the way. */
export default function HelpSheet({open, topic, onOpenChange}: Props) {
    const topics = topic === "all" ? DETAILED_TOPICS : [topic];

    return (
        <XbrwSheet open={open} onOpenChange={onOpenChange}
                   title={topic === "all" ? "ABOUT THESE SETTINGS" : "ABOUT"}>
            <ScrollView>
                <YStack gap="$4" paddingBottom="$4">
                    {topics.map((key) => (
                        <YStack key={key} gap="$1.5">
                            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.8}
                                           color={palette.text}>
                                {RECIPE_HELP[key].title}
                            </DotMatrixText>
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

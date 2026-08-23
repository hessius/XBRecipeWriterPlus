import React, {useState} from "react";
import {AntDesign} from "@expo/vector-icons";
import {Sheet, Text, YStack} from "tamagui";

import {palette} from "@/constants/colors";

type Props = {
    content: string;
    paddingLeft?: string;
};

/**
 * The "what is this?" affordance.
 *
 * A sheet rather than a native `Alert`: this is a paragraph of explanation, and
 * a modal you must dismiss before you can look at the thing being explained is
 * the wrong shape for it — as well as the one surface the app cannot style.
 */
export default function TooltipComponent({content, paddingLeft}: Props) {
    const [open, setOpen] = useState(false);

    return (
        <YStack paddingLeft={paddingLeft}>
            <AntDesign accessibilityRole="button" accessibilityLabel="What is this?"
                       onPress={() => setOpen(true)} name="question-circle"
                       size={20} color={palette.dim}/>

            <Sheet open={open} onOpenChange={setOpen} modal dismissOnSnapToBottom
                   snapPointsMode="fit">
                <Sheet.Overlay enterStyle={{opacity: 0}} exitStyle={{opacity: 0}}/>
                <Sheet.Handle/>
                <Sheet.Frame padding="$4" backgroundColor={palette.surface}>
                    <YStack gap="$3" paddingBottom="$6">
                        <Text fontSize={18} fontWeight="700" color={palette.text}>
                            What is this?
                        </Text>
                        <Text fontSize={15} color={palette.dim}>{content}</Text>
                    </YStack>
                </Sheet.Frame>
            </Sheet>
        </YStack>
    );
}

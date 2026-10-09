import React, {useState} from "react";
import {useLocalSearchParams} from "expo-router";
import {Text, YStack} from "tamagui";
import router from "@/hooks/steadyRouter";
import {useMachine} from "@/hooks/useMachine";
import {useLiveBrew} from "@/hooks/useLiveBrew";
import {useRecipeLibrary} from "@/hooks/useRecipeLibrary";
import {incomingEasyModeRecipe, useEasyModeSlots} from "@/hooks/useEasyModeSlots";
import EasyModeSlots from "@/components/EasyModeSlots";
import ScreenHeader from "@/components/ScreenHeader";
import {palette} from "@/constants/colors";

export default function EasyModeScreen() {
    const {recipeJSON} = useLocalSearchParams<{recipeJSON?: string | string[]}>();
    const {remembered, machine, status} = useMachine();
    const {ratingNoteOpen} = useLiveBrew();
    const library = useRecipeLibrary();
    const slots = useEasyModeSlots({
        deviceId: remembered, serial: machine.info?.serial.trim() || null
    });
    const [incoming] = useState(() => incomingEasyModeRecipe(recipeJSON));
    return (
        <YStack testID="easy-mode-screen" flex={1} backgroundColor={palette.base}
                accessibilityElementsHidden={ratingNoteOpen}
                importantForAccessibility={ratingNoteOpen ? "no-hide-descendants" : "auto"}>
            <EasyModeSlots record={slots.record} recipes={library.allRecipes()}
                           header={<>
                               <ScreenHeader title="EASY MODE" onBack={() => router.back()}/>
                               {incoming.error !== null && (
                                   <Text selectable accessibilityRole="alert" color={palette.danger} padding="$4">
                                       {incoming.error}
                                   </Text>
                               )}
                           </>}
                           incoming={incoming.recipe} deviceId={remembered}
                           connected={status === "connected"} available={slots.available}
                           running={slots.running} error={slots.error}
                           onAssign={slots.assign} onWrite={slots.write}
                           onRecover={slots.recover}/>
        </YStack>
    );
}

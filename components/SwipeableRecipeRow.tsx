import AntDesign from "@expo/vector-icons/AntDesign";
import Feather from "@expo/vector-icons/Feather";
import React, {useEffect, useRef} from "react";
import {View} from "react-native";
import Swipeable, {type SwipeableMethods} from "react-native-gesture-handler/ReanimatedSwipeable";
import {Button, XStack} from "tamagui";

import Recipe from "@/library/Recipe";
import RecipeItem from "@/components/RecipeItem";

type Props = {
    recipe: Recipe;
    onPress: () => void;
    onDelete: () => void;
    onDuplicate: () => void;
    /** Nudges the row open briefly on mount so the swipe actions are discoverable. */
    bounceOnMount?: boolean;
};

const BOUNCE_OPEN_DELAY = 300;
const BOUNCE_CLOSE_DELAY = 1000;

export default function SwipeableRecipeRow({
                                               recipe,
                                               onPress,
                                               onDelete,
                                               onDuplicate,
                                               bounceOnMount = false
                                           }: Props) {
    const swipeableRef = useRef<SwipeableMethods | null>(null);

    useEffect(() => {
        if (!bounceOnMount) {
            return;
        }
        const open = setTimeout(() => swipeableRef.current?.openRight(), BOUNCE_OPEN_DELAY);
        const close = setTimeout(() => swipeableRef.current?.close(), BOUNCE_CLOSE_DELAY);
        return () => {
            clearTimeout(open);
            clearTimeout(close);
        };
    }, [bounceOnMount]);

    function renderRightActions() {
        return (
            <XStack paddingRight="$2" paddingVertical="$3" alignItems="center">
                <Button onPress={() => {
                    swipeableRef.current?.close();
                    onDelete();
                }}
                        width={80} height="100%" marginRight="$1" alignItems="center" justifyContent="center"
                        backgroundColor="red" borderColor="#ffa592" borderWidth={2} borderRadius={10}
                        aria-label={`Delete ${recipe.title}`}>
                    <AntDesign name="delete" size={25} color="white"/>
                </Button>
                <Button onPress={() => {
                    swipeableRef.current?.close();
                    onDuplicate();
                }}
                        width={80} height="100%" alignItems="center" justifyContent="center"
                        backgroundColor="#dddddd" borderColor="#ffa592" borderWidth={2} borderRadius={10}
                        aria-label={`Duplicate ${recipe.title}`}>
                    <Feather name="copy" size={25} color="black"/>
                </Button>
            </XStack>
        );
    }

    return (
        <View style={{maxWidth: 600}}>
            <Swipeable
                ref={swipeableRef}
                friction={2}
                rightThreshold={40}
                overshootRight={false}
                renderRightActions={renderRightActions}>
                <RecipeItem recipe={recipe} onPress={onPress}/>
            </Swipeable>
        </View>
    );
}

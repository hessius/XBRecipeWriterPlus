import React, {useState} from "react";
import {Image, Pressable} from "react-native";
import {Text, View, XStack} from "tamagui";

import DeckSection from "@/components/DeckSection";
import DotIcon from "@/components/DotIcon";
import {openLink} from "@/components/openLink";
import {palette} from "@/constants/colors";
import Recipe from "@/library/Recipe";

/** The mark's diameter, from the design: a small promise, not a hero image. */
const MARK_SIZE = 40;

/**
 * What the button back to the producer's page says.
 *
 * Named where the producer is known, because "View on BrewMind" tells someone
 * where the tap goes and a generic label does not. An import link from anyone
 * else still gets the button, since the page is just as much the reasoning
 * behind the recipe; it simply cannot be named.
 */
function pageLabel(recipe: Recipe): string {
    return recipe.source === "brewmind"
        ? "View on BrewMind"
        : "View the recipe page";
}

/**
 * Where a recipe arrived from, when it arrived from somewhere.
 *
 * A claim, not an identity. The copy says a recipe arrived from a name, never
 * that it was made by one: `sharedBy` is whatever the person sharing it had
 * typed into xBloom, and the app has no way to know whether it is true.
 *
 * Three cases, and only two of them draw. A share link names its sharer. A
 * recipe with a pod ID and no sharer came from xBloom with nobody attached, so
 * it says so. A recipe the user built here came from nowhere, and the section
 * is absent rather than present and empty: it used to answer "nobody shared
 * this one with you", which is a row spent telling someone something they
 * already knew about a recipe they had just written.
 *
 * The picture is behind a setting, off by default, and anything that will not
 * load falls back to the accent mark without a word. A missing image is not an
 * error, and it is never a broken-image box.
 */
export default function FromSection({recipe, accent, showAvatar}: {
    recipe: Recipe;
    /** The recipe's own colour, which the mark falls back to. */
    accent: string;
    /** `showRecipeAvatars`. Off, the accent mark is all that is ever drawn. */
    showAvatar: boolean;
}) {
    const [failed, setFailed] = useState(false);

    const sharedBy = recipe.sharedBy?.trim() ?? "";
    const fromXbloom = recipe.xid.trim().length > 0;
    const avatar = recipe.sharedByAvatar ?? "";
    const drawAvatar = showAvatar && avatar.length > 0 && !failed;
    const recipeUrl = recipe.recipeUrl ?? "";

    if (sharedBy.length === 0 && !fromXbloom && recipeUrl.length === 0) return null;

    return (
        <DeckSection title="FROM" testID="about-from">
            <XStack alignItems="center" gap="$3">
                {drawAvatar ? (
                    <Image testID="from-avatar" source={{uri: avatar}}
                           onError={() => setFailed(true)}
                           style={{
                               width:        MARK_SIZE,
                               height:       MARK_SIZE,
                               borderRadius: MARK_SIZE / 2
                           }}/>
                ) : (
                    <View testID="from-mark"
                          width={MARK_SIZE} height={MARK_SIZE}
                          borderRadius={MARK_SIZE / 2}
                          backgroundColor={accent}/>
                )}

                <Text flex={1} fontSize={sharedBy.length > 0 ? 16 : 13}
                      color={sharedBy.length > 0 ? palette.text : palette.dim}>
                    {sharedBy.length > 0
                        ? `Arrived from ${sharedBy}`
                        : "An xBloom recipe. Nobody is named as the sharer."}
                </Text>
            </XStack>

            {recipeUrl.length > 0 ? (
                <Pressable accessibilityRole="link"
                           testID="from-recipe-page"
                           accessibilityLabel={`${pageLabel(recipe)}. Opens in your browser.`}
                           onPress={() => openLink(recipeUrl)}
                           style={({pressed}) => ({
                               opacity:   pressed ? 0.7 : 1,
                               transform: [{scale: pressed ? 0.98 : 1}]
                           })}>
                    <XStack alignItems="center" justifyContent="space-between"
                            gap="$3" minHeight={44} marginTop="$3"
                            paddingVertical="$2" paddingHorizontal="$3"
                            borderWidth={1} borderColor={accent}
                            borderRadius="$5">
                        <Text flex={1} fontSize={14} fontWeight="600"
                              color={palette.text}>
                            {pageLabel(recipe)}
                        </Text>
                        {/* Decorative: the row is already one labelled link. */}
                        <XStack style={{transform: [{rotate: "180deg"}]}}>
                            <DotIcon name="back" size={12} color={accent}/>
                        </XStack>
                    </XStack>
                </Pressable>
            ) : null}
        </DeckSection>
    );
}

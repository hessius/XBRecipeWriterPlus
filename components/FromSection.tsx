import React, {useState} from "react";
import {Image} from "react-native";
import {Text, View, XStack} from "tamagui";

import DeckSection from "@/components/DeckSection";
import {palette} from "@/constants/colors";
import Recipe from "@/library/Recipe";

/** The mark's diameter, from the design: a small promise, not a hero image. */
const MARK_SIZE = 40;

/**
 * Where a recipe arrived from.
 *
 * A claim, not an identity. The copy says a recipe arrived from a name, never
 * that it was made by one: `sharedBy` is whatever the person sharing it had
 * typed into xBloom, and the app has no way to know whether it is true.
 *
 * Only a share link carries a sharer at all. A recipe pulled from your own
 * xBloom library has no other author to name, so the section reads sensibly
 * with the field absent rather than treating it as missing data.
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
    const avatar = recipe.sharedByAvatar ?? "";
    const drawAvatar = showAvatar && avatar.length > 0 && !failed;

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
                        : "Nobody shared this one with you. It is yours."}
                </Text>
            </XStack>
        </DeckSection>
    );
}

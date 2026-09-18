import React, {useState} from "react";
import {Image} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DeckSection from "@/components/DeckSection";
import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import TextFieldRow from "@/components/TextFieldRow";
import {palette} from "@/constants/colors";
import Recipe, {isValidXID} from "@/library/Recipe";

/** The pod mark's diameter, matching the one on the import panel. */
const POD_SIZE = 44;

/**
 * What a recipe is linked to.
 *
 * Drawn the way `ImportResult` draws a pod, so a pod looks the same the day it
 * is imported and a year later, and always drawn, even for a recipe with no pod
 * at all: someone hunting for the ID field needs it in a fixed place rather
 * than in a section that appears only once the answer is already known.
 *
 * The ID lives here rather than behind the title, because it is a lookup key
 * and not a name. Nobody looking for it would think to tap a title they are
 * perfectly happy with.
 *
 * USE THIS NAME **clears** the recipe's own name rather than copying the pod's
 * into it. `displayName()` already falls back to the pod name when yours is
 * empty, so an empty name is not a missing value: it means follow the pod.
 * Copying would freeze a string, and the day the pod name changes or the ID is
 * corrected, yours would go on saying something slightly wrong forever. One tap
 * in, one tap out, and which of the two is in force is visible either way.
 */
export default function PodSection({
    recipe, showHint, showAvatar, xidLookupFailed, externalEpoch,
    onXidFocusChange, onInputErrorChange, onDraft, onCommit, onFollowPod
}: {
    recipe: Recipe;
    showHint: boolean;
    /**
     * The name lookup for this XID was tried and failed. A note, not an error:
     * the recipe is perfectly valid without a looked-up name, so this never
     * touches the save gate.
     */
    xidLookupFailed: boolean;
    /** `showRecipeAvatars`. Off, the pod photo is not drawn. */
    showAvatar: boolean;
    /** Bumped only when the recipe instance is swapped, which remounts the row. */
    externalEpoch: number;
    onXidFocusChange: (focused: boolean) => void;
    onInputErrorChange: (invalid: boolean) => void;
    onDraft: (value: string) => void;
    onCommit: (value: string) => void;
    /** Clears the recipe's own name, putting the title back on the pod's. */
    onFollowPod: () => void;
}) {
    const [podFailed, setPodFailed] = useState(false);

    const linked = recipe.xbloomName.trim().length > 0;
    const renamed = recipe.name.trim().length > 0;
    // Gated on the same setting as the sharer's mark. The setting exists to
    // answer one question -- does a picture help at all -- and it could not
    // answer it while half the pictures it names drew regardless of it. Its own
    // description already promised the pod photo; this section had simply never
    // been asked.
    const podImage = showAvatar ? recipe.imageURL ?? "" : "";

    return (
        <DeckSection title="XBLOOM POD" testID="about-pod">
            {/* Keyed on the external-replacement epoch, not on the value it
                mirrors. The counter bumps only when the whole recipe is swapped
                out — a revert — so that one case still remounts the row and
                resets its visible text, local `invalid` mark and the screen's
                save gate to the restored ID. An ordinary keystroke or a
                late-arriving XID lookup does not touch the epoch, so the field a
                user is typing in is never remounted mid-entry: keying on
                `recipe.xid` used to do exactly that, and a mid-typing render
                (the XID lookup resolving) reset the uncontrolled input and ate
                keystrokes.

                The `xid-` prefix keeps this row in its own key namespace, so a
                share-link import — which arrives with several fields empty and
                shares one epoch — cannot land two siblings on the same key. */}
            <TextFieldRow key={`xid-${externalEpoch}`} topic="xid" label="Recipe ID"
                          initialValue={recipe.xid}
                          maxLength={8} autoCapitalize="characters"
                          showHint={showHint}
                          note={xidLookupFailed ? "not found" : undefined}
                          validate={isValidXID} onInvalidChange={onInputErrorChange}
                          invalidReason="Not a valid ID: three letters, an optional T, then two or three digits, like CGL12."
                          onFocusChange={onXidFocusChange}
                          onDraft={onDraft}
                          onCommit={onCommit}/>

            {xidLookupFailed && (
                <Text testID="pod-not-found" fontSize={13} color={palette.dim}>
                    That ID did not match a pod. It is saved either way and will
                    be looked up again.
                </Text>
            )}

            {!linked && !xidLookupFailed && (
                <Text testID="pod-none" fontSize={13} color={palette.dim}>
                    A pod ID links this recipe to the pod it was made for, and
                    lends it the pod name.
                </Text>
            )}

            {linked && (
                <XStack testID="pod-linked" alignItems="center" gap="$3">
                    {/* Skipped entirely on a failed load rather than left as an
                        empty circle, so a pod whose photo will not load is
                        indistinguishable from one that never had a photo. A
                        missing image is not an error worth reporting. */}
                    {podImage.length > 0 && !podFailed && (
                        <Image testID="pod-image" source={{uri: podImage}}
                               onError={() => setPodFailed(true)}
                               style={{
                                   width:        POD_SIZE,
                                   height:       POD_SIZE,
                                   borderRadius: POD_SIZE / 2
                               }}/>
                    )}
                    <YStack flex={1} gap="$1">
                        <Text fontSize={16} color={palette.text} numberOfLines={2}>
                            {recipe.xbloomName}
                        </Text>
                        {!renamed && (
                            <XStack testID="pod-following" alignItems="center" gap="$1.5">
                                <DotIcon name="success" size={12} color={palette.dim}/>
                                <DotMatrixText fontSize={11} weight="bold"
                                               letterSpacing={1.4} color={palette.dim}>
                                    USING THIS NAME
                                </DotMatrixText>
                            </XStack>
                        )}
                    </YStack>

                    {renamed && (
                        <XStack
                            accessible
                            accessibilityRole="button"
                            accessibilityLabel={`Use the pod name, ${recipe.xbloomName}`}
                            accessibilityHint="Clears the name you gave this recipe, so its title follows the pod."
                            testID="pod-use-name"
                            onPress={onFollowPod}
                            paddingHorizontal="$3" paddingVertical="$2"
                            borderRadius="$4"
                            backgroundColor={palette.raised}
                            borderWidth={1} borderColor={palette.line}
                            pressStyle={{opacity: 0.7, scale: 0.99}}>
                            <DotMatrixText fontSize={11} weight="bold"
                                           letterSpacing={1.4} color={palette.text}>
                                USE THIS NAME
                            </DotMatrixText>
                        </XStack>
                    )}
                </XStack>
            )}
        </DeckSection>
    );
}

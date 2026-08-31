import React, {useState} from "react";
import {Image} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import PourProfile, {PROFILE_STROKE_WIDTH} from "@/components/PourProfile";
import {palette} from "@/constants/colors";
import type {ImportPreview} from "@/hooks/useRecipeImport";
import {CARD_GRIND_MIN, grindBand} from "@/library/grindBands";
import {CUP_TYPE} from "@/library/Recipe";

/** The pod mark's diameter. Two lines of text tall, so nothing below it moves. */
const POD_SIZE = 44;
const PROFILE_HEIGHT = 44;

type Props = {
    preview: ImportPreview;
    onOpen: () => void;
};

/**
 * What the lookup found, on the typed path.
 *
 * Its only state is the width it measures for the graph: no fetching, no
 * timers, no subscription -- which is what keeps the sheet's `prewarm` safe,
 * since a pre-warm renders this a second time, hidden, before it is seen. An
 * `onLayout` still fires there, so the graph arrives already sized.
 *
 * It says more than a name because it is the entire defence against a typo. A
 * typed value resolves without navigating precisely so that this panel can be
 * read first, and a panel showing only "Found" would make that pause worthless.
 */
export default function ImportResult({preview, onOpen}: Props) {
    const {recipe, isExisting, name, subtitle, imageURL} = preview;
    const [podLoaded, setPodLoaded] = useState(false);
    const [podFailed, setPodFailed] = useState(false);
    // The graph is an SVG with a computed viewBox, so it needs a real number,
    // not a percentage. We measure the panel and let the graph fill it: at a
    // fixed 240 it huddled against the left of a phone-wide sheet with dead
    // space to the right. Nothing is drawn until the first measurement lands,
    // inside a box already reserving the graph's height, so the panel does not
    // reflow when it appears -- only the graph fades in at its final size.
    const [profileWidth, setProfileWidth] = useState(0);

    // Composed as one sentence, the way `RecipeCard` announces a recipe:
    // otherwise VoiceOver reads six loose elements -- "18", "DOSE", "1:16",
    // "RATIO" -- and "1:16" is spoken "one colon sixteen". `accessible` on the
    // row groups them, so this label is the whole of what is heard.
    const figuresLabel =
        `${recipe.dosage} grams, ratio 1 to ${recipe.ratio}, ${recipe.pours.length} stages`;

    // The name the user gave a recipe they already hold -- the most useful thing
    // on this panel, because it is how they recognise which of theirs this is.
    // Only the name *they* chose: `recipe.name` is exactly that field. Neither
    // `hasName()` nor `displayName()` is right here -- both fold in `xbloomName`
    // and `xid`, so for a never-renamed import (which always carries an XID)
    // they would report a name, and `displayName()` would print the xBloom
    // title, which is already the heading above. Repeating the heading says
    // nothing, so the row is drawn only when a custom name genuinely exists.
    const customName = recipe.name.trim();

    // The cloud stores grind on the grinder's own 1-80 scale, so an imported
    // recipe can legitimately hold a value finer than a card can carry. It is
    // imported unchanged -- an espresso grind raised to 40 would be a different
    // drink, not a corrected recipe -- so the panel says so instead, here,
    // rather than letting the user find out at the card reader.
    //
    // Guarded on the grinder the same way the editor's grind row is. An import
    // whose `isSetGrinderSize` is 2 still carries whatever `grinderSize` the
    // cloud happened to send, so a grinder-off recipe can hold a value below 40
    // that nothing will ever grind to; and a tea card always writes the default
    // grind regardless. Neither has a coarseness worth naming.
    const grinds = recipe.grinder && recipe.cupType !== CUP_TYPE.TEA;
    const fineBand = grinds && recipe.grindSize < CARD_GRIND_MIN
        ? grindBand(recipe.grindSize)
        : undefined;

    return (
        <YStack gap="$3" paddingTop="$2">
            <XStack alignItems="flex-start" gap="$3">
                <YStack flex={1} gap="$1">
                    <Text color={palette.text} fontSize={17} numberOfLines={2}>
                        {name}
                    </Text>
                    {subtitle.length > 0 && (
                        <Text color={palette.dim} fontSize={13} numberOfLines={1}>
                            {subtitle}
                        </Text>
                    )}
                </YStack>

                {/* The pod photo, when there is one. Absent for every shared
                    recipe, so there is no placeholder and no spinner: the panel
                    is only as tall as the two lines of text beside this, and
                    the layout does not lurch between a pod recipe and a shared
                    one. A failed load is skipped entirely rather than left as an
                    empty circle, so it is genuinely indistinguishable from a
                    recipe that never had a photo -- including the width it would
                    otherwise steal from the name column -- and is never
                    reported. */}
                {imageURL.length > 0 && !podFailed && (
                    <Image testID="import-result-pod"
                           source={{uri: imageURL}}
                           onLoad={() => setPodLoaded(true)}
                           onError={() => setPodFailed(true)}
                           style={{
                               width:        POD_SIZE,
                               height:       POD_SIZE,
                               borderRadius: POD_SIZE / 2,
                               opacity:      podLoaded ? 1 : 0
                           }}/>
                )}
            </XStack>

            <YStack testID="import-result-profile-frame" height={PROFILE_HEIGHT}
                    onLayout={(event) => setProfileWidth(event.nativeEvent.layout.width)}>
                {/* The Svg draws itself half a stroke wider than its geometry on
                    every side, so a width equal to the panel would overrun it by
                    one stroke. Handing the geometry `measured - strokeWidth`
                    lands the rendered element back on the panel's own width,
                    the way the cards absorb the same bleed by offsetting it. */}
                {profileWidth > 0 && (
                    <PourProfile testID="import-result-profile"
                                 pours={recipe.pours}
                                 width={profileWidth - PROFILE_STROKE_WIDTH}
                                 height={PROFILE_HEIGHT}
                                 stroke={palette.dim} fill={palette.line}/>
                )}
            </YStack>

            <XStack accessible accessibilityLabel={figuresLabel} gap="$4">
                <Figure label="DOSE" value={String(recipe.dosage)}/>
                <Figure label="RATIO" value={`1:${recipe.ratio}`}/>
                <Figure label="STAGES" value={String(recipe.pours.length)}/>
            </XStack>

            {isExisting && (
                customName.length > 0 ? (
                    <Text color={palette.info} fontSize={13} numberOfLines={1}
                          // Straight quotes, to match the app's ASCII copy
                          // (`Couldn't`, `can't`) -- it uses no typographic
                          // marks. But VoiceOver reads them aloud as
                          // "quote … quote", so the spoken form drops them, the
                          // way `figuresLabel` above and `RecipeCard` compose a
                          // label that reads differently from what is drawn. The
                          // label keeps the whole name; `numberOfLines` only
                          // clips the drawn line, so a long custom name cannot
                          // blow up the layout the way a long title once did.
                          accessibilityLabel={`Already in your library as ${customName}`}>
                        {`Already in your library as "${customName}"`}
                    </Text>
                ) : (
                    <Text color={palette.info} fontSize={13}>
                        Already in your library
                    </Text>
                )
            )}

            {fineBand !== undefined && (
                <Text testID="import-grind-notice" color={palette.info} fontSize={13}>
                    {`Ground for ${fineBand.longLabel}. You will need to coarsen it to write a card.`}
                </Text>
            )}

            <XStack
                accessible
                accessibilityRole="button"
                accessibilityLabel={`Open ${name}`}
                onPress={onOpen}
                alignItems="center"
                justifyContent="center"
                paddingVertical="$3"
                borderRadius="$6"
                backgroundColor={palette.raised}
                borderWidth={1}
                borderColor={palette.line}
                pressStyle={{opacity: 0.7, scale: 0.99}}>
                {/* OPEN rather than IMPORT when it is already here: nothing is
                    being brought in, and `resolveOnOpen` never makes a copy. */}
                <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.5}
                               color={palette.text}>
                    {isExisting ? "OPEN" : "IMPORT"}
                </DotMatrixText>
            </XStack>
        </YStack>
    );
}

/** One reading: a Doto value over a small label. Module scope, not inline. */
function Figure({label, value}: {label: string; value: string}) {
    return (
        <YStack gap="$1">
            <DotMatrixText fontSize={18} weight="bold" color={palette.text}>
                {value}
            </DotMatrixText>
            <Text color={palette.muted} fontSize={11} letterSpacing={1}>
                {label}
            </Text>
        </YStack>
    );
}

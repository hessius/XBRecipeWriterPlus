import React from "react";
import {View} from "react-native";
import {XStack, YStack, Text} from "tamagui";

import DigitRoll from "@/components/DigitRoll";
import DotIcon from "@/components/DotIcon";
import DotMatrixText, {DOTO_MAX_FONT_SCALE} from "@/components/DotMatrixText";
import PourProfile from "@/components/PourProfile";
import Recipe from "@/library/Recipe";
import {accentGroupFor, resolveAccent} from "@/library/accent";
import {onAccent, palette} from "@/constants/colors";
import type {DotIconName} from "@/constants/dotIcons";

const CARD_HEIGHT = 116;
const PROFILE_HEIGHT = 56;

/**
 * The smallest comfortable touch target, per the HIG. The action icons are 18px
 * and are padded out to this rather than given `hitSlop`, because hit slop on
 * adjacent icons overlaps into the gap between them and the later sibling wins —
 * which would make a tap at the edge of "duplicate" delete the recipe instead.
 */
const TOUCH_TARGET = 44;
const ACTION_ICON_SIZE = 18;
const ACTION_PADDING = (TOUCH_TARGET - ACTION_ICON_SIZE) / 2;

/**
 * `Recipe` initialises `ratio` and `grindSize` to -1 to mean "not set yet".
 * `DigitRoll` clamps at zero, so passing a sentinel straight through would tell
 * the user the ratio is 0 — not a possible value, and indistinguishable from a
 * real reading.
 */
function isSet(value: number): boolean {
    return Number.isFinite(value) && value > 0;
}

type StatProps = {
    label: string;
    value: number;
    suffix?: string;
};

function Stat({label, value, suffix}: StatProps) {
    return (
        <YStack gap="$0.5">
            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.2}
                           color={onAccent.label}>
                {label}
            </DotMatrixText>
            {isSet(value) ? (
                <DigitRoll value={value} suffix={suffix} fontSize={18}
                           weight="extrabold" color={onAccent.text}/>
            ) : (
                <DotMatrixText fontSize={18} weight="extrabold"
                               color={onAccent.text}>
                    —
                </DotMatrixText>
            )}
        </YStack>
    );
}

type ActionProps = {
    label: string;
    icon: DotIconName;
    tone: string;
    testID: string;
    onPress: () => void;
};

/**
 * One of the two actions a card offers in edit mode.
 *
 * The glyph sits in a dark key rather than directly on the accent. Drawn on the
 * accent it was both short of contrast on the lighter cards and, more to the
 * point, indistinguishable from the card's own decoration — there was nothing
 * to suggest it could be pressed.
 */
function Action({label, icon, tone, testID, onPress}: ActionProps) {
    return (
        <YStack accessible accessibilityRole="button" accessibilityLabel={label}
                alignItems="center" justifyContent="center"
                padding={ACTION_PADDING} borderRadius="$4"
                backgroundColor={onAccent.key}
                pressStyle={{opacity: 0.7}}
                onPress={onPress}>
            <DotIcon testID={testID} name={icon} size={ACTION_ICON_SIZE}
                     color={tone}/>
        </YStack>
    );
}

type Props = {
    recipe: Recipe;
    onPress: () => void;
    /** When true, the destructive actions are visible rather than swipe-only. */
    editing?: boolean;
    onDuplicate?: () => void;
    onDelete?: () => void;
    /**
     * The `TEA` marker is always shown; the `COFFEE` marker is redundant for a
     * mostly-coffee library and sub-project 6 adds a setting to hide it.
     */
    showCoffeeMarker?: boolean;
};

/**
 * A recipe as a card.
 *
 * The name is prose and stays in Inter. Dose, ratio and grind are
 * machine-derived and are Doto. The pour profile is drawn behind the content at
 * low contrast, so a recipe is recognisable by its silhouette before it is read.
 */
export default function RecipeCard({
    recipe,
    onPress,
    editing = false,
    onDuplicate,
    onDelete,
    showCoffeeMarker = true
}: Props) {
    const accent = resolveAccent(recipe);
    const isTea = accentGroupFor(recipe) === "tea";
    const marker = isTea ? "TEA" : "COFFEE";
    const showMarker = isTea || showCoffeeMarker;

    // `accessible` groups the whole subtree into one element on iOS, so nothing
    // inside is announced on its own. Everything the card shows has to be in
    // this label or it is, to a screen reader, conveyed by the accent colour
    // alone -- which is the state the TEA/COFFEE marker exists to prevent.
    const summary = [
        recipe.displayName(),
        marker.toLowerCase(),
        isSet(recipe.dosage) ? `${recipe.dosage} grams` : undefined,
        isSet(recipe.ratio) ? `ratio 1 to ${recipe.ratio}` : undefined,
        !isTea && isSet(recipe.grindSize) ? `grind ${recipe.grindSize}` : undefined
    ].filter((part) => part !== undefined).join(", ");

    // The row actions are nested inside that same group, so VoiceOver cannot
    // reach the buttons. These are the only non-visual path to them -- and the
    // swipe gesture they mirror is not available to a screen reader either.
    const actions = [
        ...(onDuplicate !== undefined
            ? [{name: "duplicate", label: "Duplicate recipe"}]
            : []),
        ...(onDelete !== undefined ? [{name: "delete", label: "Delete recipe"}] : [])
    ];

    return (
        <YStack
            testID="recipe-card"
            // React Native does not promote a View to an accessibility element
            // implicitly, so without this the role and label are inert and the
            // card is announced as a loose pile of numbers.
            accessible
            accessibilityRole="button"
            accessibilityLabel={summary}
            accessibilityActions={actions}
            onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === "duplicate") {
                    onDuplicate?.();
                } else if (event.nativeEvent.actionName === "delete") {
                    onDelete?.();
                }
            }}
            onPress={onPress}
            pressStyle={{opacity: 0.85, scale: 0.99}}
            // A minimum rather than a fixed height: the title and the Doto stats
            // both grow with the OS text size, and a fixed height plus the clip
            // below would crop the stats away for exactly those users.
            minHeight={CARD_HEIGHT}
            borderRadius="$8"
            overflow="hidden"
            justifyContent="space-between"
            gap="$2"
            padding="$3.5"
            style={{backgroundColor: accent}}>

            <View pointerEvents="none"
                  style={{position: "absolute", right: 0, bottom: 0}}>
                <PourProfile testID="recipe-card-profile" pours={recipe.pours}
                             width={200} height={PROFILE_HEIGHT}/>
            </View>

            <XStack justifyContent="space-between" alignItems="flex-start" gap="$2">
                {/* Bounded to the same scale Doto is, so the two halves of the
                    card grow together rather than the prose swamping the data. */}
                <Text flex={1} fontSize={17} fontWeight="700" numberOfLines={2}
                      maxFontSizeMultiplier={DOTO_MAX_FONT_SCALE}
                      color={recipe.hasName() ? onAccent.text : onAccent.label}>
                    {recipe.displayName()}
                </Text>
                <XStack alignItems="center" gap="$1.5">
                    {showMarker && (
                        <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.4}
                                       color={onAccent.marker}>
                            {marker}
                        </DotMatrixText>
                    )}
                </XStack>
            </XStack>

            <XStack justifyContent="space-between" alignItems="flex-end" gap="$4">
                <XStack gap="$5">
                    <Stat label="DOSE" value={recipe.dosage} suffix="g"/>
                    <Stat label="RATIO" value={recipe.ratio}/>
                    {!isTea && <Stat label="GRIND" value={recipe.grindSize}/>}
                </XStack>

                {editing && (
                    <XStack gap="$1">
                        {onDuplicate !== undefined && (
                            <Action label="Duplicate recipe" icon="duplicate"
                                    tone={palette.success}
                                    testID="recipe-card-duplicate"
                                    onPress={onDuplicate}/>
                        )}
                        {onDelete !== undefined && (
                            <Action label="Delete recipe" icon="delete"
                                    tone={palette.danger}
                                    testID="recipe-card-delete" onPress={onDelete}/>
                        )}
                    </XStack>
                )}
            </XStack>
        </YStack>
    );
}

import React from "react";
import {Pressable, View} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {Text, XStack, YStack} from "tamagui";

import Collapsible from "@/components/Collapsible";
import DotIcon from "@/components/DotIcon";
import DotMatrixText, {DOTO_MAX_FONT_SCALE} from "@/components/DotMatrixText";
import PourProfile, {PROFILE_BLEED} from "@/components/PourProfile";
import {onAccent} from "@/constants/colors";
import type Pour from "@/library/Pour";

/** How far the watermark runs past the slab before it is clipped. */
const PROFILE_OVERHANG = 2;

/** A control in the header's chrome row, drawn in a well cut out of the accent. */
function HeaderButton({label, icon, accent, onPress}: {
    label: string;
    icon: "back" | "overflow";
    accent: string;
    onPress: () => void;
}) {
    return (
        <Pressable accessibilityRole="button" accessibilityLabel={label}
                   onPress={onPress} hitSlop={12}>
            <YStack backgroundColor={onAccent.key} borderRadius="$3"
                    width={32} height={32} alignItems="center" justifyContent="center">
                <DotIcon name={icon} size={16} color={accent}/>
            </YStack>
        </Pressable>
    );
}

type Props = {
    /** Already resolved by the caller, via `Recipe.displayName()`. */
    name: string;
    /** False when `name` is a placeholder, which is then drawn muted. */
    named: boolean;
    xid: string;
    accent: string;
    beverage: "COFFEE" | "TEA";
    pours: Pour[];
    /** Folds the slab down to its chrome row, which then carries the name. */
    collapsed: boolean;
    onBack: () => void;
    onMore: () => void;
};

/**
 * The recipe, as a picture.
 *
 * Inert apart from its chrome row. Every value shown here is edited in the BREW
 * deck, so the hero never has to be both a headline and a form — the two jobs
 * pulled the layout apart in every mockup that tried to do both.
 *
 * It is also the screen's navigation bar. The native header was a second
 * surface stacked on top of this one, in a different colour, carrying a back
 * control auto-labelled "index" and a title that only repeated the slab below
 * it; folding the two together leaves one object that is plainly the recipe.
 * That is why this sits outside the scroll view and collapses itself rather
 * than scrolling away.
 *
 * The name arrives already chosen. Working out what to call a recipe that has
 * none is `Recipe.displayName`'s job and it is a chain of four fallbacks, so a
 * second opinion here would eventually disagree with the home screen about what
 * the same recipe is called.
 */
export default function RecipeHero({
    name, named, xid, accent, beverage, pours, collapsed, onBack, onMore
}: Props) {
    "use no memo";

    // The accent slab runs up behind the status bar rather than starting below
    // it, so the screen has one surface at the top instead of a black strip
    // above a coloured card.
    const insets = useSafeAreaInsets();

    // `pours` is the recipe's own array, mutated in place, and the watermark
    // reads each pour through a getter rather than a property — so there is
    // nothing for the React Compiler to compare and a stale watermark would
    // survive a stage edit. The compiler is off under jest, so no test here can
    // catch that. Same reason as `StageTile` and `StageProfile`.
    return (
        <YStack testID="recipe-hero" backgroundColor={accent}
                borderBottomLeftRadius="$6" borderBottomRightRadius="$6"
                paddingHorizontal="$4" paddingTop={insets.top + 6} paddingBottom="$3"
                overflow="hidden">
            {/* No opacity on this wrapper. The stroke colour already carries its
                own dimming and a group opacity multiplies it — which is how the
                watermark once measured 8.46:1 as a token and rendered at 2.72:1
                on the palest accent. */}
            {!collapsed && (
                <View pointerEvents="none"
                      style={{
                          position: "absolute",
                          right:    -(PROFILE_BLEED + PROFILE_OVERHANG),
                          bottom:   -(PROFILE_BLEED + PROFILE_OVERHANG)
                      }}>
                    <PourProfile pours={pours} width={190} height={74}
                                 stroke={onAccent.profileStroke} fill={onAccent.profileFill}/>
                </View>
            )}

            {/* The navigation chrome lives on the accent rather than in a bar
                above it. Two surfaces stacked at the top of the screen read as
                two unrelated things; one reads as the recipe. */}
            <XStack alignItems="center" gap="$2" minHeight={36}>
                <HeaderButton label="Back" icon="back" accent={accent} onPress={onBack}/>

                {/* The name moves up here once the slab is folded away, so the
                    screen never loses its title. */}
                <Text flex={1} numberOfLines={1} fontSize={15} fontWeight="700"
                      maxFontSizeMultiplier={DOTO_MAX_FONT_SCALE}
                      color={named ? onAccent.text : onAccent.label}>
                    {collapsed ? name : ""}
                </Text>

                <HeaderButton label="More" icon="overflow" accent={accent} onPress={onMore}/>
            </XStack>

            <Collapsible open={!collapsed}>
                <XStack alignItems="center" gap="$2" marginTop="$2">
                    <DotMatrixText fontSize={11} weight="bold" letterSpacing={2}
                                   color={onAccent.label}>
                        {beverage}
                    </DotMatrixText>
                    {xid !== "" && (
                        <XStack testID="hero-xid" backgroundColor={onAccent.key}
                                borderRadius="$2" paddingHorizontal="$1.5" paddingVertical={1}>
                            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6}
                                           color={accent}>
                                {xid}
                            </DotMatrixText>
                        </XStack>
                    )}
                </XStack>

                {/* Bounded to the same scale Doto is, exactly as the home card
                    is, so a long name at a large text size does not swallow the
                    slab. */}
                <Text fontSize={26} fontWeight="700" lineHeight={31} marginTop="$2"
                      maxFontSizeMultiplier={DOTO_MAX_FONT_SCALE}
                      color={named ? onAccent.text : onAccent.label}
                      numberOfLines={2} maxWidth="72%">
                    {name}
                </Text>
            </Collapsible>
        </YStack>
    );
}

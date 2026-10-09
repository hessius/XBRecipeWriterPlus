import React from "react";
import {useWindowDimensions} from "react-native";
import {XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import {
    BREW_RECIPE_AFTER_GAP,
    BREW_RECIPE_LABEL_GAP,
    BREW_RECIPE_ROW_GAP,
    BREW_RECIPE_SIZE,
    BREW_RECIPE_TRACKING,
    BREW_RECIPE_UNIT_GAP,
    brewFigureBadgeGeometry,
    brewRecipeContextLayout,
    type BrewRecipeInputs,
    type BrewRecipeMeasuredUnit
} from "@/library/brew/figureGeometry";
import {DOTO_MIN_FONT_SIZE} from "@/library/dotoMetrics";

type Props = {
    inputs?: BrewRecipeInputs;
    contentWidth: number;
    textScale?: number;
};

function InputUnit({entry, columnWidth, textScale}: {
    entry: BrewRecipeMeasuredUnit;
    columnWidth: number;
    textScale: number;
}) {
    const {unit, badgeBelow, height} = entry;
    const badge = brewFigureBadgeGeometry(textScale);
    const Segment = badgeBelow ? YStack : XStack;
    return (
        <YStack width={columnWidth} minHeight={height}
                accessible accessibilityLabel={unit.accessibilityLabel}
                testID={`brew-recipe-${unit.key}`}>
            <Segment gap={badge.gap} alignItems={badgeBelow ? undefined : "center"}>
                <XStack gap={BREW_RECIPE_LABEL_GAP * textScale} alignItems="center">
                    <DotMatrixText fontSize={BREW_RECIPE_SIZE * textScale}
                                   letterSpacing={BREW_RECIPE_TRACKING * textScale}
                                   color={palette.dim} numberOfLines={1}>
                        {unit.label}
                    </DotMatrixText>
                    <DotMatrixText fontSize={BREW_RECIPE_SIZE * textScale}
                                   letterSpacing={BREW_RECIPE_TRACKING * textScale}
                                   color={palette.text} numberOfLines={1}>
                        {unit.value}
                    </DotMatrixText>
                </XStack>
                {unit.badge !== null && (
                    <XStack testID={`brew-recipe-${unit.key}-comparison`}
                            borderStyle="dashed" borderColor={palette.line}
                            borderWidth={badge.borderWidth} borderRadius={badge.borderRadius}
                            paddingHorizontal={badge.paddingHorizontal}
                            paddingVertical={badge.paddingVertical}
                            alignSelf="flex-start" flexShrink={0}>
                        <DotMatrixText fontSize={badge.fontSize} letterSpacing={badge.tracking}
                                       minFontSize={DOTO_MIN_FONT_SIZE * textScale}
                                       color={palette.dim} numberOfLines={1}>
                            {unit.badge}
                        </DotMatrixText>
                    </XStack>
                )}
            </Segment>
        </YStack>
    );
}

export default function BrewRecipeContext({inputs, contentWidth, textScale = 1}: Props) {
    const {fontScale} = useWindowDimensions();
    const layout = brewRecipeContextLayout(inputs, contentWidth, fontScale, textScale);
    if (layout.rows.length === 0) return null;

    return (
        <YStack testID="brew-recipe-context" gap={BREW_RECIPE_ROW_GAP * textScale}
                marginBottom={BREW_RECIPE_AFTER_GAP * textScale}>
            {layout.rows.map((row) => (
                <XStack testID="brew-recipe-row" key={row.units[0].unit.key}
                        gap={BREW_RECIPE_UNIT_GAP * textScale} minHeight={row.height}>
                    {row.units.map((entry) => (
                        <InputUnit key={entry.unit.key} entry={entry}
                                   columnWidth={layout.columnWidth} textScale={textScale}/>
                    ))}
                </XStack>
            ))}
        </YStack>
    );
}

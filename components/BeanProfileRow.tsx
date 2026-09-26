import React from "react";
import {Text, XStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {CHIP_HEIGHT} from "@/components/RailChip";
import {palette} from "@/constants/colors";

const FIELD_WIDTH = 82;
const FIGURES_WIDTH = 72;

type Props = {
    field: string;
    value: string;
    brews: number;
    rating: number;
    rated: number;
    accent: string;
    accessibilityLabel?: string;
};

export function BeanProfileRow({
    field, value, brews, rating, rated, accent, accessibilityLabel
}: Props) {
    const figures = rated === 0 ? `${brews}` : `${rating.toFixed(1)} · ${brews}`;

    return (
        <XStack
            testID="bean-profile-row"
            accessible={accessibilityLabel !== undefined}
            accessibilityLabel={accessibilityLabel}
            minHeight={CHIP_HEIGHT}
            alignItems="center"
            gap="$2">
            <DotMatrixText
                fontSize={11}
                weight="bold"
                letterSpacing={1.3}
                color={palette.dim}
                style={{width: FIELD_WIDTH}}>
                {field}
            </DotMatrixText>
            <Text
                flex={1}
                minWidth={0}
                numberOfLines={1}
                ellipsizeMode="tail"
                fontSize={13}
                color={palette.text}>
                {value}
            </Text>
            <DotMatrixText
                fontSize={11}
                weight="bold"
                letterSpacing={1.2}
                color={accent}
                style={{width: FIGURES_WIDTH, textAlign: "right"}}>
                {figures}
            </DotMatrixText>
        </XStack>
    );
}

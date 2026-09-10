import React from "react";
import {XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";

type Props = {
    water: number;
    cup: number;
    seconds: number;
    accent: string;
    /**
     * Millilitres of bypass, if this brew had any.
     *
     * Broken out beside WATER rather than given a column of its own: at 28 pt
     * a fourth column is too tight to read on a narrow phone. And broken out
     * rather than added in, because 240 + 5 in one figure says the brew used
     * 245 ml of brew water, which it did not.
     */
    bypass?: number;
};

/** `2:06`. Floored, not rounded: a clock that shows 2:07 at 2:06.6 is wrong. */
function clock(seconds: number): string {
    const whole = Math.floor(Math.max(0, seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function Figure({label, value, color, badge}: {
    label: string; value: string; color: string; badge?: React.ReactNode;
}) {
    return (
        <YStack flex={1} gap="$1">
            <DotMatrixText fontSize={10} weight="bold" letterSpacing={1.6}
                           color={palette.dim}>
                {label}
            </DotMatrixText>
            <XStack alignItems="center" gap="$1.5">
                <DotMatrixText fontSize={28} weight="bold" color={color}>
                    {value}
                </DotMatrixText>
                {badge}
            </XStack>
        </YStack>
    );
}

/**
 * The three numbers, at the app's machine-readout scale.
 *
 * Rounded to whole units because the scale reports tenths and they flicker;
 * a figure this size that changes every 100 ms cannot be read at all.
 */
export default function BrewFigures({water, cup, seconds, accent, bypass}: Props) {
    const badge = bypass === undefined || bypass <= 0 ? undefined : (
        <XStack testID="figures-bypass"
                paddingHorizontal={4} paddingVertical={1}
                borderRadius="$2" borderWidth={1} borderStyle="dashed"
                borderColor={palette.line}>
            <DotMatrixText fontSize={11} weight="bold" color={palette.dim}>
                {`+${Math.round(bypass)}`}
            </DotMatrixText>
        </XStack>
    );

    return (
        <XStack gap="$3">
            <Figure label="WATER" value={String(Math.round(water))} color={accent}
                    badge={badge} />
            <Figure label="CUP" value={String(Math.round(cup))} color={palette.text} />
            <Figure label="TIME" value={clock(seconds)} color={palette.text} />
        </XStack>
    );
}

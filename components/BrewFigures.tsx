import React from "react";
import {XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";

type Props = {
    water: number;
    cup: number;
    seconds: number;
    accent: string;
};

/** `2:06`. Floored, not rounded: a clock that shows 2:07 at 2:06.6 is wrong. */
function clock(seconds: number): string {
    const whole = Math.floor(Math.max(0, seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function Figure({label, value, color}: {label: string; value: string; color: string}) {
    return (
        <YStack flex={1} gap="$1">
            <DotMatrixText fontSize={10} weight="bold" letterSpacing={1.6}
                           color={palette.dim}>
                {label}
            </DotMatrixText>
            <DotMatrixText fontSize={28} weight="bold" color={color}>
                {value}
            </DotMatrixText>
        </YStack>
    );
}

/**
 * The three numbers, at the app's machine-readout scale.
 *
 * Rounded to whole units because the scale reports tenths and they flicker;
 * a figure this size that changes every 100 ms cannot be read at all.
 */
export default function BrewFigures({water, cup, seconds, accent}: Props) {
    return (
        <XStack gap="$3">
            <Figure label="WATER" value={String(Math.round(water))} color={accent} />
            <Figure label="CUP" value={String(Math.round(cup))} color={palette.text} />
            <Figure label="TIME" value={clock(seconds)} color={palette.text} />
        </XStack>
    );
}

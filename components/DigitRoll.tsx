import React, {useEffect} from "react";
import {View} from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming
} from "react-native-reanimated";

import DotMatrixText, {type DotoWeight} from "@/components/DotMatrixText";
import {DURATION, EASING, useReducedMotion} from "@/constants/motion";
import {palette} from "@/constants/colors";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

type ColumnProps = {
    digit: number;
    fontSize: number;
    weight: DotoWeight;
    color: string;
    reduced: boolean;
};

/**
 * One digit position. The full 0–9 strip is rendered and translated, so the
 * intermediate glyphs are genuinely visible as it moves.
 */
function DigitColumn({digit, fontSize, weight, color, reduced}: ColumnProps) {
    // Doto's line box is close to 1.35em at these sizes; hard-coding the ratio
    // keeps the strip aligned without measuring on every render.
    const rowHeight = Math.round(fontSize * 1.35);
    const offset = useSharedValue(-digit * rowHeight);

    useEffect(() => {
        const target = -digit * rowHeight;
        offset.value = reduced
            ? target
            : withTiming(target, {duration: DURATION.base, easing: EASING.out});
    }, [digit, rowHeight, reduced, offset]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{translateY: offset.value}]
    }));

    return (
        <View testID="digit-roll-column"
              style={{height: rowHeight, overflow: "hidden"}}>
            <Animated.View style={animatedStyle}>
                {DIGITS.map((d) => (
                    <DotMatrixText key={d} fontSize={fontSize} weight={weight}
                                   color={color}
                                   style={{height: rowHeight, lineHeight: rowHeight}}>
                        {d}
                    </DotMatrixText>
                ))}
            </Animated.View>
        </View>
    );
}

type Props = {
    value: number;
    /** Zero-pads up to this many digits. */
    minDigits?: number;
    /** Static text after the digits — a unit, not part of the roll. */
    suffix?: string;
    fontSize?: number;
    weight?: DotoWeight;
    color?: string;
};

/**
 * A number whose digits roll when it changes.
 *
 * Reduce Motion snaps each column to its target rather than removing the
 * component, so the value is still correct and still visibly updates.
 */
export default function DigitRoll({
    value,
    minDigits = 1,
    suffix,
    fontSize = 20,
    weight = "bold",
    color = palette.text
}: Props) {
    const reduced = useReducedMotion();
    const text = Math.max(0, Math.round(value)).toString().padStart(minDigits, "0");
    const digits = text.split("").map((d) => Number(d));

    return (
        <View accessibilityLabel={text}
              style={{flexDirection: "row", alignItems: "flex-end"}}>
            {digits.map((digit, index) => (
                <DigitColumn
                    // Position-keyed on purpose: index 0 is the same column
                    // whether it holds a 2 or a 3, which is what should roll.
                    key={index}
                    digit={digit}
                    fontSize={fontSize}
                    weight={weight}
                    color={color}
                    reduced={reduced}
                />
            ))}
            {suffix !== undefined && (
                <DotMatrixText fontSize={Math.round(fontSize * 0.6)} weight="semibold"
                               color={color} style={{marginLeft: 2}}>
                    {suffix}
                </DotMatrixText>
            )}
        </View>
    );
}

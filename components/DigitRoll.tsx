import React, {useEffect} from "react";
import {View} from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withSequence,
    withTiming
} from "react-native-reanimated";

import DotMatrixText, {drawnFontSize, type DotoWeight} from "@/components/DotMatrixText";
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
    // keeps the strip aligned without measuring on every render. It is applied
    // to the size the glyphs are actually *drawn* at rather than the size asked
    // for, because a user with accessibility text sizing turned up would
    // otherwise get 28 px digits clipped into a 27 px box.
    const rowHeight = Math.round(drawnFontSize(fontSize) * 1.35);
    const offset = useSharedValue(-digit * rowHeight);
    const fade = useSharedValue(1);

    useEffect(() => {
        const target = -digit * rowHeight;

        if (!reduced) {
            offset.value = withTiming(target, {
                duration: DURATION.base,
                easing:   EASING.out
            });
            return;
        }

        // Reduce Motion removes the travel, not the transition. The strip fades
        // out, repositions while it cannot be seen, and fades back carrying the
        // new digit — so the change still registers without anything sliding
        // across the screen. Assigning the target outright would satisfy the
        // letter of "no motion" and leave the number rewriting itself between
        // frames with nothing to mark that it had.
        fade.value = withSequence(
            withTiming(0, {duration: DURATION.fast, easing: EASING.in}),
            withTiming(1, {duration: DURATION.fast, easing: EASING.out})
        );
        offset.value = withDelay(DURATION.fast, withTiming(target, {duration: 0}));
    }, [digit, rowHeight, reduced, offset, fade]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity:   fade.value,
        transform: [{translateY: offset.value}]
    }));

    return (
        <View testID="digit-roll-column"
              style={{height: rowHeight, overflow: "hidden"}}>
            <Animated.View
                // The nine glyphs that are not currently showing are decoration.
                // Without this each column offers a screen reader all ten, and a
                // three-digit readout is announced as "0 1 2 3 4 5 6 7 8 9"
                // three times over. The real value is on the container's label.
                importantForAccessibility="no-hide-descendants"
                accessibilityElementsHidden
                style={animatedStyle}>
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
        // `accessibilityLabel` on a bare View is inert — React Native does not
        // make the node an accessibility element implicitly, so the label is
        // never reached and the descendants are announced instead. The label
        // carries the suffix because a volume readout announced as "255" rather
        // than "255ml" drops the one thing a sighted user gets for free.
        <View accessible
              accessibilityLabel={suffix === undefined ? text : `${text}${suffix}`}
              style={{flexDirection: "row", alignItems: "flex-end"}}>
            {digits.map((digit, index) => (
                <DigitColumn
                    // Position-keyed on purpose: index 0 is the same column
                    // whether it holds a 2 or a 3, which is what should roll.
                    // Keying by digit would remount on every change — the column
                    // would cut to the new glyph instead of travelling to it —
                    // and a value like 255 would produce duplicate sibling keys.
                    key={index}
                    digit={digit}
                    fontSize={fontSize}
                    weight={weight}
                    color={color}
                    reduced={reduced}
                />
            ))}
            {suffix !== undefined && (
                <DotMatrixText fontSize={Math.round(fontSize * 0.6)} weight="bold"
                               color={color} style={{marginLeft: 2}}>
                    {suffix}
                </DotMatrixText>
            )}
        </View>
    );
}

import React from "react";
import {View} from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withTiming
} from "react-native-reanimated";

import {DOT_ICONS, DOT_ICON_GRID, litCells, type DotIconName} from "@/constants/dotIcons";
import {palette} from "@/constants/colors";
import {DURATION, EASING, useReducedMotion} from "@/constants/motion";

/**
 * Dot diameter as a fraction of a cell. Below about a third the icon reads as a
 * scatter of specks; above it the dots touch and the grid closes into a solid
 * shape, which is the thing the dot matrix exists not to be.
 */
const DOT_RATIO = 0.36;

/** Stagger between consecutive dots when the icon animates in. */
const STAGGER_MS = 12;

type Props = {
    name: DotIconName;
    /** Edge length of the whole icon in points. Dot size is derived from it. */
    size?: number;
    color?: string;
    /**
     * Illuminate the dots in sequence on mount. For the feedback surfaces; a
     * navigation glyph should not perform.
     */
    animated?: boolean;
    /**
     * Only set this when the icon is the entire control. When it sits inside a
     * labelled pressable — which is the usual case — leave it undefined so the
     * parent is the single accessibility element.
     */
    accessibilityLabel?: string;
    testID?: string;
};

type DotProps = {
    x: number;
    y: number;
    cell: number;
    dot: number;
    color: string;
    /** 0 when static; otherwise this dot's place in the entry sequence. */
    delay: number;
};

function IconDot({x, y, cell, dot, color, delay}: DotProps) {
    const opacity = useSharedValue(delay > 0 ? 0 : 1);

    React.useEffect(() => {
        if (delay > 0) {
            opacity.value = withDelay(
                delay,
                withTiming(1, {duration: DURATION.fast, easing: EASING.out})
            );
        } else {
            opacity.value = 1;
        }
    }, [delay, opacity]);

    const animatedStyle = useAnimatedStyle(() => ({opacity: opacity.value}));

    return (
        <Animated.View
            testID="dot-icon-dot"
            style={[
                {
                    position:        "absolute",
                    width:           dot,
                    height:          dot,
                    borderRadius:    dot / 2,
                    backgroundColor: color,
                    // Centred in the cell, then pulled back by its own radius,
                    // so the drawing occupies exactly `size` and a clipping
                    // ancestor cannot shave the outer dots.
                    left:            (x + 0.5) * cell - dot / 2,
                    top:             (y + 0.5) * cell - dot / 2
                },
                animatedStyle
            ]}
        />
    );
}

/**
 * One icon, drawn as dots.
 *
 * Geometry is derived from `size` alone, so the same glyph at 16 and at 44 is
 * the same drawing rather than two that drifted apart. The bitmaps live in
 * `constants/dotIcons.ts`; this component knows nothing about which icons exist.
 */
export default function DotIcon({
    name,
    size = 20,
    color = palette.text,
    animated = false,
    accessibilityLabel,
    testID = "dot-icon"
}: Props) {
    const reduced = useReducedMotion();
    const cell = size / DOT_ICON_GRID;
    const dot = cell * DOT_RATIO;
    const cells = litCells(DOT_ICONS[name]);

    // Reduced Motion still gets a change of state -- every dot fades in at once
    // rather than in sequence -- because degrading to nothing would leave a user
    // who disabled motion with no signal that the toast had arrived.
    const staggered = animated && !reduced;

    const labelled = accessibilityLabel !== undefined;

    return (
        <View
            testID={testID}
            accessible={labelled}
            accessibilityRole={labelled ? "image" : undefined}
            accessibilityLabel={accessibilityLabel}
            accessibilityElementsHidden={!labelled}
            importantForAccessibility={labelled ? "yes" : "no-hide-descendants"}
            style={{width: size, height: size}}>
            {cells.map((point, index) => (
                <IconDot
                    key={`${point.x}-${point.y}`}
                    x={point.x}
                    y={point.y}
                    cell={cell}
                    dot={dot}
                    color={color}
                    delay={staggered ? index * STAGGER_MS : animated ? 1 : 0}
                />
            ))}
        </View>
    );
}

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
};

/** Where a dot sits and how big it is. Shared by both kinds of dot. */
function dotStyle({x, y, cell, dot, color}: DotProps) {
    return {
        position:        "absolute" as const,
        width:           dot,
        height:          dot,
        borderRadius:    dot / 2,
        backgroundColor: color,
        // Centred in the cell, then pulled back by its own radius, so the
        // drawing occupies exactly `size` and a clipping ancestor cannot shave
        // the outer dots.
        left:            (x + 0.5) * cell - dot / 2,
        top:             (y + 0.5) * cell - dot / 2
    };
}

/**
 * A dot that never moves.
 *
 * This is the common case by far — every navigation glyph, every card action,
 * every swipe tile — and it is a plain View on purpose. Drawing it as an
 * Animated.View gave each of some forty dots a shared value, an effect and an
 * animated style to set up; mounting two glyphs on every row of a list took
 * long enough to feel like a delay before edit mode appeared.
 */
function StaticDot(props: DotProps) {
    return <View testID="dot-icon-dot" style={dotStyle(props)}/>;
}

/** A dot that fades up, optionally after waiting its turn in the sequence. */
function AnimatedDot({delay, ...rest}: DotProps & {delay: number}) {
    const opacity = useSharedValue(0);

    React.useEffect(() => {
        opacity.value = withDelay(
            delay,
            withTiming(1, {duration: DURATION.fast, easing: EASING.out})
        );
    }, [delay, opacity]);

    const animatedStyle = useAnimatedStyle(() => ({opacity: opacity.value}));

    return (
        <Animated.View testID="dot-icon-dot" style={[dotStyle(rest), animatedStyle]}/>
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
                animated ? (
                    <AnimatedDot
                        key={`${point.x}-${point.y}`}
                        x={point.x}
                        y={point.y}
                        cell={cell}
                        dot={dot}
                        color={color}
                        delay={staggered ? index * STAGGER_MS : 0}
                    />
                ) : (
                    <StaticDot
                        key={`${point.x}-${point.y}`}
                        x={point.x}
                        y={point.y}
                        cell={cell}
                        dot={dot}
                        color={color}
                    />
                )
            ))}
        </View>
    );
}

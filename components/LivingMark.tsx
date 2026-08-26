import React, {useEffect} from "react";
import {Pressable} from "react-native";
import Animated, {
    type SharedValue,
    useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence,
    withSpring, withTiming
} from "react-native-reanimated";
import {XStack} from "tamagui";

import {palette} from "@/constants/colors";
import {DOT_ICONS, DOT_ICON_GRID, litCells} from "@/constants/dotIcons";
import {SPRING, useReducedMotion} from "@/constants/motion";

type Cell = {
    row: number;
    column: number;
    /** Where this dot flies to when the mark is tapped, in dot widths. */
    scatterX: number;
    scatterY: number;
    /** Staggers the breath so the mark ripples rather than pulsing as a block. */
    phase: number;
};

const BREATH_MS = 2400;

/**
 * The lit cells of both plus signs, laid out side by side, resolved once.
 *
 * At module scope because the layout is a constant: it depends on the glyph
 * bitmap and nothing else, so recomputing it per render would be work in
 * support of the same answer. The scatter offsets are fixed here too, so a dot
 * flies the same way every time rather than somewhere new on each tap — which
 * reads as a mark coming apart rather than as noise.
 */
const CELLS: Cell[] = (() => {
    // litCells reports {x, y}, not {row, column} — matched here rather than
    // renamed at the call site, since the fields are the grid's own vocabulary.
    const lit = litCells(DOT_ICONS.plus);
    const cells: Cell[] = [];
    for (const mark of [0, 1]) {
        for (const cell of lit) {
            const row = cell.y;
            const column = cell.x + mark * (DOT_ICON_GRID + 1);
            // Deterministic pseudo-random: the same cell always flies the same
            // way, and no random number generator has to be seeded for a test.
            const angle = (row * 7 + column * 13) % 360;
            const radius = 3 + ((row * 5 + column * 3) % 5);
            cells.push({
                row,
                column,
                scatterX: Math.cos(angle * Math.PI / 180) * radius,
                scatterY: Math.sin(angle * Math.PI / 180) * radius,
                phase: ((row * 3 + column * 5) % 8) * 90
            });
        }
    }
    return cells;
})();

const COLUMNS = DOT_ICON_GRID * 2 + 1;

type Props = {
    /** Width of the whole mark, in points. */
    size: number;
};

/**
 * The `++` of XBRW++, drawn as dots that breathe and scatter.
 *
 * The app's one moment of personality, and deliberately built out of the dot
 * machinery the icons already use rather than a second animation system. Under
 * Reduce Motion it renders as a static mark: the screen must be complete
 * without the movement, so the movement is the only thing that goes.
 */
export default function LivingMark({size}: Props) {
    const reduced = useReducedMotion();
    const breath = useSharedValue(0);
    const scatter = useSharedValue(0);
    const dot = size / (COLUMNS + (COLUMNS - 1) * 0.35);
    const gap = dot * 0.35;

    useEffect(() => {
        if (reduced) {
            breath.value = 0;
            return;
        }
        breath.value = withRepeat(
            withSequence(
                withTiming(1, {duration: BREATH_MS / 2}),
                withTiming(0, {duration: BREATH_MS / 2})
            ),
            -1, false
        );
    }, [reduced, breath]);

    function onPress() {
        if (reduced) return;
        scatter.value = withSequence(
            withTiming(1, {duration: 220}),
            withDelay(120, withSpring(0, SPRING.gentle))
        );
    }

    return (
        <Pressable accessibilityRole="image" accessibilityLabel="XBRW++"
                   onPress={onPress}>
            <XStack width={size} height={dot * DOT_ICON_GRID + gap * (DOT_ICON_GRID - 1)}>
                {CELLS.map((cell) => (
                    <MarkDot key={`${cell.row}-${cell.column}`} cell={cell}
                             dot={dot} gap={gap} breath={breath} scatter={scatter}
                             reduced={reduced}/>
                ))}
            </XStack>
        </Pressable>
    );
}

type DotProps = {
    cell: Cell;
    dot: number;
    gap: number;
    breath: SharedValue<number>;
    scatter: SharedValue<number>;
    /**
     * `breath.value` is pinned at 0 under Reduce Motion, but 0 is a point in
     * the middle of the ripple, not its neutral phase — so the frozen frame
     * still needs telling to ignore each dot's phase offset rather than
     * evaluating `sin` of it.
     */
    reduced: boolean;
};

/**
 * One dot.
 *
 * At module scope, like every component in this repository: declared inside
 * `LivingMark` it would be a new type on every render and React would remount
 * every dot, taking each one's animation with it.
 */
function MarkDot({cell, dot, gap, breath, scatter, reduced}: DotProps) {
    const style = useAnimatedStyle(() => {
        const phased = reduced
            ? 0
            : Math.sin((breath.value * 360 + cell.phase) * Math.PI / 180);
        return {
            opacity: 0.72 + phased * 0.28 - scatter.value * 0.4,
            transform: [
                {translateX: scatter.value * cell.scatterX * (dot + gap)},
                {translateY: scatter.value * cell.scatterY * (dot + gap)},
                {scale: 1 + phased * 0.08}
            ]
        };
    });

    return (
        <Animated.View testID="living-mark-dot" style={[
            {
                position: "absolute",
                left: cell.column * (dot + gap),
                top: cell.row * (dot + gap),
                width: dot,
                height: dot,
                borderRadius: dot / 2,
                backgroundColor: palette.text
            },
            style
        ]}/>
    );
}

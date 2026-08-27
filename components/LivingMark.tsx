import React, {useEffect} from "react";
import {Pressable, View} from "react-native";
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
 * The grid the whole mark is laid out on.
 *
 * Two 9x9 plus glyphs side by side with a column between them span 19 columns,
 * and the disc is drawn square on that, so the mark is 19x19 with the `++`
 * centred in it. Both numbers are derived rather than written down, so a change
 * to the glyph bitmap cannot leave the disc the wrong size around it.
 */
const COLUMNS = DOT_ICON_GRID * 2 + 1;
const MARK_ROW_OFFSET = Math.floor((COLUMNS - DOT_ICON_GRID) / 2);

/**
 * How far out the disc reaches, in cells from the centre.
 *
 * Just under half the grid: at exactly half, the four cells at the compass
 * points sit on the boundary and the circle reads as a square with the corners
 * filed off. This is the radius at which the silhouette in `icon.png` is
 * reproduced.
 */
const DISC_RADIUS = COLUMNS / 2 - 0.2;

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
            const row = cell.y + MARK_ROW_OFFSET;
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

type FieldCell = {row: number; column: number; opacity: number};

/**
 * The disc of unlit dots the `++` is punched out of.
 *
 * These do not breathe and do not scatter. They are the field the mark sits in,
 * and 250-odd animated views to make a background shimmer would cost more than
 * the effect is worth — so they are plain views, varied once by position into a
 * faint texture rather than a flat wash.
 */
const FIELD: FieldCell[] = (() => {
    const lit = new Set(CELLS.map((cell) => `${cell.row}-${cell.column}`));
    const centre = (COLUMNS - 1) / 2;
    const cells: FieldCell[] = [];
    for (let row = 0; row < COLUMNS; row++) {
        for (let column = 0; column < COLUMNS; column++) {
            const dx = column - centre;
            const dy = row - centre;
            if (Math.sqrt(dx * dx + dy * dy) > DISC_RADIUS) continue;
            if (lit.has(`${row}-${column}`)) continue;
            cells.push({
                row,
                column,
                // Deterministic, so the texture is the same every render and a
                // test can count on it.
                opacity: 0.5 + ((row * 5 + column * 11) % 5) * 0.075
            });
        }
    }
    return cells;
})();

type Props = {
    /** Width of the whole mark, in points. */
    size: number;
    /**
     * Hides the mark from assistive technology.
     *
     * For when the app's name is already given in readable type right beside
     * it. Announcing "XBRW++, image" and then "XBRW++, heading" is the same
     * fact twice, and the second one is the one a reader can act on.
     */
    decorative?: boolean;
};

/**
 * The app's icon, drawn live.
 *
 * This is the same mark as `assets/images/icon.png` — a disc of dots with the
 * `++` of XBRW++ picked out in the brand magenta — rather than a picture of it.
 * Drawing it means it can breathe, and can come apart when tapped, which a PNG
 * cannot; it also means the mark is built from the dot machinery the icons
 * already use rather than a second source of truth that would drift from the
 * icon on the home screen.
 *
 * Under Reduce Motion it renders as a static mark: the screen must be complete
 * without the movement, so the movement is the only thing that goes.
 */
export default function LivingMark({size, decorative = false}: Props) {
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
        <Pressable accessibilityRole={decorative ? "none" : "image"}
                   accessibilityLabel={decorative ? undefined : "XBRW++"}
                   accessibilityElementsHidden={decorative}
                   importantForAccessibility={decorative ? "no-hide-descendants" : "auto"}
                   onPress={onPress}>
            <XStack width={size} height={dot * COLUMNS + gap * (COLUMNS - 1)}>
                {FIELD.map((cell) => (
                    <FieldDot key={`f${cell.row}-${cell.column}`} cell={cell}
                              dot={dot} gap={gap}/>
                ))}
                {CELLS.map((cell) => (
                    <MarkDot key={`${cell.row}-${cell.column}`} cell={cell}
                             dot={dot} gap={gap} breath={breath} scatter={scatter}
                             reduced={reduced}/>
                ))}
            </XStack>
        </Pressable>
    );
}

/** One dot of the surrounding disc. Inert, and at module scope like the rest. */
function FieldDot({cell, dot, gap}: {cell: FieldCell; dot: number; gap: number}) {
    return (
        <View testID="living-mark-field-dot" style={{
            position: "absolute",
            left: cell.column * (dot + gap),
            top: cell.row * (dot + gap),
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            backgroundColor: palette.text,
            opacity: cell.opacity
        }}/>
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
                backgroundColor: palette.brand
            },
            style
        ]}/>
    );
}

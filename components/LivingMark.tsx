import React, {useEffect} from "react";
import {Pressable, View} from "react-native";
import Animated, {
    type SharedValue,
    interpolateColor, useAnimatedStyle, useSharedValue, withDelay, withRepeat,
    withSpring, withTiming, withSequence
} from "react-native-reanimated";
import {XStack} from "tamagui";

import {palette} from "@/constants/colors";
import {DOT_ICONS, DOT_ICON_GRID, litCells} from "@/constants/dotIcons";
import {ATTRACT, EASING, SPRING, useReducedMotion} from "@/constants/motion";

type Cell = {
    row: number;
    column: number;
    /** Where this dot flies to when the mark is tapped, in dot widths. */
    scatterX: number;
    scatterY: number;
    /** Staggers the breath so the mark ripples rather than pulsing as a block. */
    phase: number;
    /** Distance from the mark's centre, 0 at the middle and 1 at the furthest
     *  dot, so a tap can travel outwards rather than happening everywhere. */
    reach: number;
    /** Direction from the centre, in radians, for the variants that orbit. */
    bearing: number;
};


/**
 * The tap responses, one picked at random per tap.
 *
 * Named rather than numbered at the call sites, but carried across the worklet
 * boundary as a number: a shared value holds one, and a string comparison in a
 * style worklet that runs for every dot on every frame is not free.
 */
export const VARIANTS = {
    scatter: 0,
    spin: 1,
    bounce: 2,
    flash: 3,
    ripple: 4
} as const;

const VARIANT_COUNT = Object.keys(VARIANTS).length;

/**
 * Which response the next tap gets.
 *
 * Random, but never the same one twice running. Independent picks would repeat
 * one tap in five, and a repeat reads as the mark having only one trick that
 * sometimes fails to fire — the opposite of the impression a random response is
 * there to give. `random` is a parameter so this can be asserted on rather than
 * observed.
 */
export function nextVariant(random: () => number, previous: number): number {
    const choice = Math.floor(random() * (VARIANT_COUNT - 1));
    return choice >= previous ? choice + 1 : choice;
}

/**
 * Sweep plus rest, run as one repeating timing.
 *
 * The whole cycle is a single linear pass so that there are no zero-duration
 * steps to be dropped or reordered; `crestAt` scales progress back up so the
 * crest has crossed and gone before the rest of the cycle plays out.
 */
const GLIMMER_CYCLE_MS = ATTRACT.glimmer + ATTRACT.glimmerRest;

/**
 * How wide the bright crest of the glimmer is, as a fraction of the sweep.
 *
 * Narrow enough to read as a wave travelling across the disc rather than the
 * whole disc brightening at once.
 */
const GLIMMER_WIDTH = 0.22;

/**
 * How dim the field sits when no glimmer is passing over it.
 *
 * The whole reason there is a resting value below 1: opacity has no headroom
 * above full, so a wave can only be drawn as brightness returning to a field
 * that was held back. At 0.78 the difference was real and invisible — a fifth
 * of a stop on a dot four points across, which nobody was ever going to catch
 * out of the corner of an eye. Half is enough to read as light moving.
 */
const FIELD_REST = 0.55;

/**
 * Maps the cycle's 0..1 progress onto the crest's position across the disc.
 *
 * The rest between sweeps is part of the same linear run rather than a separate
 * step in a sequence: progress climbs steadily, the crest crosses the disc
 * during the first fifth of it, and spends the rest of the cycle out beyond the
 * far edge lighting nothing. One `withTiming` that never stops, instead of a
 * sequence of timings and delays whose zero-duration steps have to land exactly
 * right to leave the mark at the value it started from.
 */
export function crestAt(progress: number): number {
    "worklet";
    const span = 1 + GLIMMER_WIDTH * 2;
    return -GLIMMER_WIDTH + progress * span * (GLIMMER_CYCLE_MS / ATTRACT.glimmer);
}

/**
 * How brightly one diagonal is lit with the crest at `crest`.
 *
 * Zero everywhere but the band the crest is currently over, which is what makes
 * it read as a wave travelling rather than as the whole disc pulsing.
 */
export function glowAt(crest: number, position: number): number {
    "worklet";
    return Math.max(0, 1 - Math.abs(crest - position) / GLIMMER_WIDTH);
}

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
            const centre = (COLUMNS - 1) / 2;
            const dx = column - centre;
            const dy = row - centre;
            cells.push({
                row,
                column,
                scatterX: Math.cos(angle * Math.PI / 180) * radius,
                scatterY: Math.sin(angle * Math.PI / 180) * radius,
                phase: ((row * 3 + column * 5) % 8) * 90,
                reach: Math.sqrt(dx * dx + dy * dy) / (COLUMNS / 2),
                bearing: Math.atan2(dy, dx)
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
 * varied once by position into a faint texture rather than a flat wash.
 *
 * Individually they are plain views: 250-odd animated views, each running its
 * own style worklet every frame, would cost more than a background shimmer is
 * worth. The glimmer is animated a band at a time instead — see `BANDS`.
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
                opacity: 0.85 + ((row * 5 + column * 11) % 5) * 0.0375
            });
        }
    }
    return cells;
})();

/**
 * The field dots grouped into diagonal bands.
 *
 * The glimmer needs to travel across the disc, and the cheapest way to move
 * light over 255 dots is to move it over the three dozen diagonals they fall
 * on: one animated wrapper per band, and the dots inside it stay inert. Opacity
 * multiplies through a parent, so a wrapper at 0.8 dims everything under it
 * without any of the dots knowing.
 *
 * Grouping by `row + column` gives a wave that arrives from the top-left
 * corner and leaves at the bottom-right, which is the direction light falls
 * from in every other piece of this app's chrome. The wrappers are absolutely
 * positioned over each other and lay nothing out, so they cost nothing beyond
 * the animation itself.
 */
const BAND_SPAN = (COLUMNS - 1) * 2;
const BANDS: FieldCell[][] = (() => {
    const bands: FieldCell[][] = Array.from({length: BAND_SPAN + 1}, () => []);
    for (const cell of FIELD) bands[cell.row + cell.column].push(cell);
    return bands;
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
    const variant = useSharedValue<number>(VARIANTS.scatter);
    const glimmer = useSharedValue(0);
    const dot = size / (COLUMNS + (COLUMNS - 1) * 0.35);
    const gap = dot * 0.35;

    useEffect(() => {
        if (reduced) {
            breath.value = 0;
            return;
        }
        breath.value = withRepeat(
            withSequence(
                withTiming(1, {duration: ATTRACT.breath / 2}),
                withTiming(0, {duration: ATTRACT.breath / 2})
            ),
            -1, false
        );
    }, [reduced, breath]);

    useEffect(() => {
        if (reduced) {
            // Left at zero, which under `crestAt` is the crest still outside
            // the near edge. Freezing it mid-sweep would leave one diagonal of
            // the disc permanently brighter than the rest.
            glimmer.value = 0;
            return;
        }
        glimmer.value = withRepeat(
            withTiming(1, {duration: GLIMMER_CYCLE_MS, easing: EASING.linear}),
            -1, false
        );
    }, [reduced, glimmer]);

    function onPress() {
        if (reduced) return;
        variant.value = nextVariant(Math.random, variant.value);
        scatter.value = withSequence(
            withTiming(1, {duration: ATTRACT.tap}),
            withDelay(ATTRACT.tapHold, withSpring(0, SPRING.gentle))
        );
    }

    return (
        <Pressable accessibilityRole={decorative ? "none" : "image"}
                   accessibilityLabel={decorative ? undefined : "XBRW++"}
                   accessibilityElementsHidden={decorative}
                   importantForAccessibility={decorative ? "no-hide-descendants" : "auto"}
                   onPress={onPress}>
            <XStack width={size} height={dot * COLUMNS + gap * (COLUMNS - 1)}>
                {BANDS.map((cells, band) => (
                    <FieldBand key={`b${band}`} cells={cells}
                               position={band / BAND_SPAN}
                               dot={dot} gap={gap} glimmer={glimmer}/>
                ))}
                {CELLS.map((cell) => (
                    <MarkDot key={`${cell.row}-${cell.column}`} cell={cell}
                             dot={dot} gap={gap} breath={breath} scatter={scatter}
                             variant={variant} reduced={reduced}/>
                ))}
            </XStack>
        </Pressable>
    );
}

/**
 * One diagonal of the disc, lit as the glimmer passes over it.
 *
 * The band brightens from its resting dimness to full as the crest reaches it,
 * which is why the resting state has to be dim: opacity cannot exceed 1, so
 * there is no headroom above a band that already sits at full brightness. Every
 * dot underneath keeps its own share of the texture and pays for none of the
 * animation.
 */
function FieldBand({cells, position, dot, gap, glimmer}: {
    cells: FieldCell[];
    position: number;
    dot: number;
    gap: number;
    glimmer: SharedValue<number>;
}) {
    const style = useAnimatedStyle(() => {
        const glow = glowAt(crestAt(glimmer.value), position);
        return {opacity: FIELD_REST + glow * (1 - FIELD_REST)};
    });

    return (
        <Animated.View testID="living-mark-band" pointerEvents="none"
                       style={[{position: "absolute", left: 0, top: 0,
                                right: 0, bottom: 0}, style]}>
            {cells.map((cell) => (
                <View key={`f${cell.row}-${cell.column}`}
                      testID="living-mark-field-dot" style={{
                          position: "absolute",
                          left: cell.column * (dot + gap),
                          top: cell.row * (dot + gap),
                          width: dot,
                          height: dot,
                          borderRadius: dot / 2,
                          backgroundColor: palette.text,
                          opacity: cell.opacity
                      }}/>
            ))}
        </Animated.View>
    );
}

type DotProps = {
    cell: Cell;
    dot: number;
    gap: number;
    breath: SharedValue<number>;
    scatter: SharedValue<number>;
    /** Which of `VARIANTS` the current tap is playing. */
    variant: SharedValue<number>;
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
function MarkDot({cell, dot, gap, breath, scatter, variant, reduced}: DotProps) {
    const style = useAnimatedStyle(() => {
        const phased = reduced
            ? 0
            : Math.sin((breath.value * 360 + cell.phase) * Math.PI / 180);
        const step = dot + gap;
        const tap = scatter.value;
        const mode = variant.value;

        let x = 0;
        let y = 0;
        let scale = 1 + phased * 0.08;
        let fade = 0;
        let colour = 0;

        if (mode === VARIANTS.spin) {
            // The whole mark turns about its own centre and shrinks slightly as
            // it goes, so it reads as one object rotating rather than as every
            // dot independently deciding to move.
            const turn = tap * Math.PI * 0.9;
            const radius = cell.reach * (COLUMNS / 2) * step;
            x = Math.cos(cell.bearing + turn) * radius - Math.cos(cell.bearing) * radius;
            y = Math.sin(cell.bearing + turn) * radius - Math.sin(cell.bearing) * radius;
            scale -= tap * 0.15;
        } else if (mode === VARIANTS.bounce) {
            // No displacement at all: the mark swells and drops back. The one
            // variant that leaves the glyph legible throughout.
            scale += tap * 0.45;
            y = -tap * step * 0.8;
        } else if (mode === VARIANTS.flash) {
            colour = tap;
            scale += tap * 0.2;
        } else if (mode === VARIANTS.ripple) {
            // Delayed by distance from the centre, so the tap travels outwards
            // instead of arriving everywhere at once. The window is half the
            // progress, which leaves the outermost dots the other half to move
            // in rather than snapping at the end.
            const local = Math.max(0, Math.min(1, (tap - cell.reach * 0.5) / 0.5));
            x = local * cell.scatterX * step * 0.8;
            y = local * cell.scatterY * step * 0.8;
            fade = local * 0.35;
        } else {
            x = tap * cell.scatterX * step;
            y = tap * cell.scatterY * step;
            fade = tap * 0.4;
        }

        return {
            opacity: 0.72 + phased * 0.28 - fade,
            backgroundColor: interpolateColor(
                // Magenta to the field's own white and back: the flash reads as
            // the mark being briefly overexposed rather than as it changing
            // into some third colour that appears nowhere else in the app.
            colour, [0, 1], [palette.brand, palette.text]
            ),
            transform: [{translateX: x}, {translateY: y}, {scale}]
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

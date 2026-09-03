// components/PourGlyph.tsx
import React from "react";
import Svg, {Circle, Path, Rect} from "react-native-svg";

import {POUR_PATTERN} from "@/library/Pour";

export type GlyphKind = "centered" | "circular" | "spiral" | "agitation";

type Props = {
    kind: GlyphKind;
    accent: string;
    size?: number;
    /** Dimmed for a stage that has not run yet. */
    faded?: boolean;
    testID?: string;
};

const BOX = 9;
const MID = BOX / 2;
/** The target's three radii and the plain ring's one, from the spec's table. */
const OUTER = 3.4;
const INNER = 1.9;
const BULLSEYE = 0.85;
const RING = 2.9;

const LABELS: Record<GlyphKind, string> = {
    centered: "Centred pour",
    circular: "Circular pour",
    spiral: "Spiral pour",
    // Agitation, not shake. The card format, the editor and the help text all
    // call it agitation; two words for one thing is one word too many.
    agitation: "Agitation"
};

/** The pattern glyph a pour's stored pattern byte asks for. */
export function glyphForPattern(pattern: number): GlyphKind {
    if (pattern === POUR_PATTERN.SPIRAL) return "spiral";
    if (pattern === POUR_PATTERN.CIRCULAR) return "circular";
    return "centered";
}

/**
 * An Archimedean spiral, `r = a·θ`, sampled as a polyline.
 *
 * Sampled rather than approximated with arcs: two turns as four half-circles
 * has visible corners at the joins at this size. `a = 0.285` over two turns
 * reaches `r ≈ 3.58` in the 9-unit box — just outside the target's outer ring,
 * just inside the edge. Change the box and you must change `a`.
 */
function spiralPath(points = 120, turns = 2, a = 0.285): string {
    const commands: string[] = [];
    for (let i = 0; i < points; i += 1) {
        const theta = (i / (points - 1)) * turns * 2 * Math.PI;
        const r = a * theta;
        const x = round(MID + r * Math.cos(theta));
        const y = round(MID + r * Math.sin(theta));
        commands.push(`${i === 0 ? "M" : "L"}${x} ${y}`);
    }
    return commands.join(" ");
}

function round(value: number): number {
    return Math.round(value * 100) / 100;
}

/** Unequal and symmetric, because equal heights read as a barcode. */
const TREMORS = [1.6, 2.8, 3.8, 2.8, 1.6];

export default function PourGlyph({kind, accent, size = 24, faded = false, testID}: Props) {
    const stroke = accent;
    const id = (suffix: string) => (testID === undefined ? undefined : `${testID}-${suffix}`);

    return (
        <Svg
            width={size}
            height={size}
            viewBox={`0 0 ${BOX} ${BOX}`}
            opacity={faded ? 0.35 : 1}
            accessibilityRole="image"
            accessibilityLabel={LABELS[kind]}
            testID={testID}
        >
            {kind === "spiral" && (
                <Path
                    testID={id("spiral")}
                    d={spiralPath()}
                    stroke={stroke}
                    strokeWidth={0.6}
                    strokeLinecap="round"
                    fill="none"
                />
            )}
            {(kind === "centered" || kind === "circular") && (
                <Circle
                    testID={id("ring")}
                    cx={MID}
                    cy={MID}
                    r={kind === "centered" ? OUTER : RING}
                    stroke={stroke}
                    strokeWidth={0.6}
                    fill="none"
                />
            )}
            {kind === "centered" && (
                <Circle
                    testID={id("inner")}
                    cx={MID}
                    cy={MID}
                    r={INNER}
                    stroke={stroke}
                    strokeWidth={0.6}
                    fill="none"
                />
            )}
            {kind === "centered" && (
                <Circle testID={id("dot")} cx={MID} cy={MID} r={BULLSEYE} fill={stroke} />
            )}
            {kind === "agitation" && TREMORS.map((height, index) => (
                <Rect
                    key={index}
                    testID={id(`tremor-${index}`)}
                    x={1.6 + index * 1.45}
                    y={MID - height / 2}
                    width={0.6}
                    height={height}
                    rx={0.3}
                    fill={stroke}
                />
            ))}
        </Svg>
    );
}

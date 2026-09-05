import type Pour from "@/library/Pour";

import {pauseSeconds, pourSeconds} from "./brewShape";
import type {Stall} from "./stalls";

/**
 * What a piece of a rung's lane is.
 *
 * `water` is solid and fills by millilitres; `stall` is amber and always full,
 * because a stall that happened happened; `pause` is hatched and fills by time.
 */
export type SegmentKind = "water" | "stall" | "pause";

/**
 * One piece of a lane.
 *
 * `seconds` is its width on the shared time scale, which is why a stalled
 * stage is exactly as much longer than a clean one as the time it lost.
 * `fill` is 0 to 1 through this piece alone.
 */
export type Segment = {kind: SegmentKind; seconds: number; fill: number};

export type RungInput = {
    pour: Pour;
    /** Millilitres delivered in this stage so far. */
    delivered: number;
    /** Seconds into the planned rest. Zero until the pour is complete. */
    pauseElapsed: number;
    stalls: Stall[];
};

/**
 * A stage as the ordered pieces of its lane.
 *
 * Stalls are inserted rather than overlaid so that water either side of one
 * keeps flowing rightwards: the count, the position and the duration are all
 * readable at once, and a stage that stopped once badly looks different from
 * one that stopped three times briefly.
 */
export function rungSegments({pour, delivered, pauseElapsed, stalls}: RungInput): Segment[] {
    const target = Math.max(pour.volume, 0);
    const perMl = target > 0 ? pourSeconds(pour) / target : 0;
    const segments: Segment[] = [];

    let at = 0;
    for (const stall of [...stalls].sort((a, b) => a.atMl - b.atMl)) {
        const begins = clamp(stall.atMl, 0, target);
        const span = begins - at;
        // A stall at 0 ml, or a second stall at the same millilitre, would
        // otherwise emit a zero-width water segment that renders as a seam.
        if (span > 0) {
            segments.push({kind: "water", seconds: round1(span * perMl),
                           fill: fillFor(at, span, delivered)});
        }
        segments.push({kind: "stall", seconds: round1(stall.seconds), fill: 1});
        at = begins;
    }

    const tail = target - at;
    if (tail > 0) {
        segments.push({kind: "water", seconds: round1(tail * perMl),
                       fill: fillFor(at, tail, delivered)});
    }

    const rest = pauseSeconds(pour);
    if (rest > 0) {
        segments.push({kind: "pause", seconds: round1(rest),
                       fill: clamp(pauseElapsed / rest, 0, 1)});
    }

    return segments;
}

/** How far `delivered` has got through the span starting at `startMl`. */
function fillFor(startMl: number, spanMl: number, delivered: number): number {
    if (spanMl <= 0) return 0;
    return round2(clamp((delivered - startMl) / spanMl, 0, 1));
}

function clamp(n: number, low: number, high: number): number {
    return Math.min(Math.max(n, low), high);
}

function round1(n: number): number {
    return Math.round(n * 10) / 10;
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

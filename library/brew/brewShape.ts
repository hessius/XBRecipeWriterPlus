import type Pour from "@/library/Pour";

import type {BrewSample} from "./BrewRecord";

/** A point on the brew's plane: seconds since the start, and millilitres. */
export type Point = {t: number; v: number};

/**
 * The flow assumed for a pour that does not state one.
 *
 * `Pour.flowRate` defaults to -1, meaning unset. Dividing by it would put the
 * pour's end before its start and draw a line across the whole chart. 3.2 ml/s
 * is the middle of the machine's range.
 */
const DEFAULT_FLOW_ML_S = 3.2;

/** How long a pour takes. `flowRate` is stored times ten. */
export function pourSeconds(pour: Pour): number {
    const volume = Math.max(pour.volume, 0);
    const flow = pour.flowRate > 0 ? pour.flowRate / 10 : DEFAULT_FLOW_ML_S;
    return volume / flow;
}

/** The pause after a pour, in seconds. Negative means unset, so it is clamped. */
export function pauseSeconds(pour: Pour): number {
    return Math.max(pour.pauseTime, 0);
}

/** How long the recipe says the whole brew should take. */
export function plannedSeconds(pours: Pour[]): number {
    return pours.reduce((total, pour) => total + pourSeconds(pour) + pauseSeconds(pour), 0);
}

/** Where one stage begins, stops pouring, and finally ends. Seconds. */
export type StageSpan = {start: number; pourEnd: number; end: number};

/** Index-aligned with `pours`. The ladder's timing lane is drawn from this. */
export function stageSpans(pours: Pour[]): StageSpan[] {
    const spans: StageSpan[] = [];
    let at = 0;
    for (const pour of pours) {
        const pourEnd = at + pourSeconds(pour);
        const end = pourEnd + pauseSeconds(pour);
        spans.push({start: at, pourEnd, end});
        at = end;
    }
    return spans;
}

/**
 * The recipe as a cumulative-water staircase on a real-seconds axis.
 *
 * The same shape as `buildProfilePath` in `components/PourProfile.tsx`, on a
 * different x-axis, and the difference is deliberate. That one divides time
 * evenly between pours because a card's mark is an identifying shape and even
 * division keeps a short pour visible. This one cannot: the stage ladder below
 * the trace draws pauses to real duration, and if the two axes disagreed the
 * live line would say a stage was over while the ladder said it had not begun.
 */
export function planPoints(pours: Pour[]): Point[] {
    if (pours.length === 0) return [];
    const spans = stageSpans(pours);
    const points: Point[] = [{t: 0, v: 0}];
    let poured = 0;
    pours.forEach((pour, i) => {
        poured += Math.max(pour.volume, 0);
        points.push({t: spans[i].pourEnd, v: poured});
        // Only when there is actually a pause. Emitting the plateau regardless
        // adds a zero-length segment per pour for identical geometry.
        if (spans[i].end > spans[i].pourEnd) points.push({t: spans[i].end, v: poured});
    });
    return points;
}

/**
 * One channel of a sample stream as points.
 *
 * Deliberately permissive: samples are drawn in the order they were recorded
 * and are neither sorted nor de-duplicated. The recorder appends in arrival
 * order from a single subscription, so the stream is already monotonic; sorting
 * here would hide a recorder bug behind a tidy-looking curve.
 */
export function livePoints(samples: BrewSample[], of: "water" | "cup"): Point[] {
    return samples.map((sample) => ({t: sample.at / 1000, v: sample[of]}));
}

/**
 * The rectangle a set of points is drawn into, and the range it spans.
 *
 * `toPath` does not clamp: a point beyond `maxT` or `maxV` maps outside the
 * box rather than being clipped or wrapped. That is deliberate — a brew that
 * overruns its plan must look like it overran. Callers size the box to fit the
 * run rather than to fit the plan.
 */
export type Box = {width: number; height: number; maxT: number; maxV: number};

/**
 * Points to an SVG path, y flipped.
 *
 * Returns "" below two points: a single point renders as an invisible path in
 * some engines and a stray dot in others, and neither is what an empty brew
 * should look like.
 */
/**
 * How long the line `toPath` draws actually is, in points.
 *
 * The travelling head is a dash pattern, and a dash pattern is measured along
 * the path. Sizing it in `box.width` assumed the plan ran straight across, but
 * a plan is a staircase: its length is the width plus the whole of its rise.
 * Too short a pattern repeats, so a second lit head appeared on the line and
 * the first stopped short of the end.
 */
export function pathLength(points: Point[], box: Box): number {
    if (points.length < 2) return 0;
    const spanT = box.maxT > 0 ? box.maxT : 1;
    const spanV = box.maxV > 0 ? box.maxV : 1;
    const at = ({t, v}: Point) => ({
        x: (t / spanT) * box.width,
        y: box.height - (v / spanV) * box.height
    });

    let total = 0;
    for (let i = 1; i < points.length; i++) {
        const a = at(points[i - 1]);
        const b = at(points[i]);
        total += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return total;
}

export function toPath(points: Point[], box: Box): string {
    if (points.length < 2) return "";
    // Both ranges are zero on the first frame of every brew, before any time
    // has passed or any water has moved.
    const spanT = box.maxT > 0 ? box.maxT : 1;
    const spanV = box.maxV > 0 ? box.maxV : 1;
    const round = (n: number) => Math.round(n * 10) / 10;
    return "M" + points
        .map(({t, v}) => {
            const x = round((t / spanT) * box.width);
            const y = round(box.height - (v / spanV) * box.height);
            return `${x} ${y}`;
        })
        .join(" L");
}

import type Pour from "@/library/Pour";

import type {BrewSample} from "./BrewRecord";
import {intervalExtent, pausedWithin, type PauseInterval} from "./pauseIntervals";

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

/** Below this a pour-end delay is rounding, not a hold worth naming. */
export const DELAY_FLOOR_SECONDS = 2;

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

/**
 * How long the bypass takes to dispense.
 *
 * At the default flow, because a bypass has no flow rate of its own: it is not
 * a `Pour` and the machine is not told one. The figure is only ever used to
 * give the dashed box on the trace and the bar on the rung a width, and at a
 * typical 5 ml that is under two seconds either way.
 *
 * What it deliberately does *not* model is the drawdown wait before it. That
 * wait is however long the dripper takes and cannot be known in advance, so
 * the plan places the bypass immediately after the last stage and the live
 * drawing slides right if the machine takes longer.
 */
export function bypassSeconds(volume: number): number {
    return Math.max(volume, 0) / DEFAULT_FLOW_ML_S;
}

/** How long the recipe says the whole brew should take. */
export function plannedSeconds(pours: Pour[]): number {
    return pours.reduce((total, pour) => total + pourSeconds(pour) + pauseSeconds(pour), 0);
}

/**
 * How late the pour section ended, separated from drawdown.
 *
 * A recipe's plan ends when the last pour ends. It has no drawdown stage, so a
 * delay measured to the end of the brew mostly reports a normal bed drawdown.
 * Null means nobody can separate the two, or the separated delay is too small
 * to name.
 *
 * `pausedSeconds` comes off first. The figure exists to say the machine took
 * longer than the recipe asked for; time the user held the brew is not the
 * machine's and reporting it here blames the machine for a button press. Same
 * correction as `summarise` makes to held time, and for the same reason.
 */
export function pourEndDelaySeconds(
    seconds: number,
    drawdown: number | null,
    planSeconds: number,
    pausedSeconds = 0
): number | null {
    if (drawdown === null || planSeconds <= 0) return null;
    const pourEnd = seconds - drawdown - Math.max(0, pausedSeconds);
    const delay = Math.round(pourEnd - planSeconds);
    return delay >= DELAY_FLOOR_SECONDS ? delay : null;
}

/**
 * Seconds of pause that sit before the pour ended, for `pourEndDelaySeconds`.
 * Drawdown seconds already exclude pauses after the boundary, so only interval
 * overlap before `drawdownAt` (ms, interval clock) may be subtracted. Without
 * intervals (legacy records) the stored total is the only evidence there is.
 */
export function pausedBeforeDrawdownSeconds(
    intervals: readonly PauseInterval[] | undefined,
    drawdownAt: number | undefined,
    pausedSeconds = 0
): number {
    if (intervals === undefined || intervals.length === 0
        || drawdownAt === undefined || !(drawdownAt > 0)) {
        return Math.max(0, pausedSeconds);
    }
    return pausedWithin(intervals, 0, drawdownAt) / 1000;
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
 * Breaks a series where two consecutive samples bridge a whole overflow pause.
 *
 * The machine was stopped by the app across that gap, so a line joining the two
 * would claim a flow nobody measured. A manual pause is the user's own and keeps
 * the existing joined line. Samples inside a pause are real readings and stay.
 */
export function splitAtPauses(
    points: Point[], intervals: readonly PauseInterval[]
): Point[][] {
    const automatic = intervals.filter((i) => i.reason === "overflow" && i.to > i.from);
    if (automatic.length === 0 || points.length === 0) return [points];
    const runs: Point[][] = [[points[0]]];
    for (let i = 1; i < points.length; i++) {
        const bridged = automatic.some((interval) =>
            points[i - 1].t * 1000 <= interval.from && points[i].t * 1000 >= interval.to);
        if (bridged) runs.push([points[i]]);
        else runs[runs.length - 1].push(points[i]);
    }
    return runs;
}

/**
 * The pieces a trace's horizontal axis is built from.
 *
 * `BrewTrace` needs the parts as well as the total: the bypass box is drawn
 * at `bypassFrom` and is `bypassWide` seconds across. Returning them from here
 * rather than letting the component recompute them keeps the box and the axis
 * it is measured against from drifting apart if either is ever retuned.
 */
export type TraceTimeParts = {
    ranTo: number;
    bypassMl: number;
    bypassWide: number;
    bypassFrom: number;
    maxT: number;
};

export function traceTimeParts(
    plannedSeconds: number,
    samples: BrewSample[],
    bypass?: {volume: number; startedAt: number | null},
    intervals: readonly PauseInterval[] = []
): TraceTimeParts {
    const ranTo = Math.max(
        samples.length > 0 ? samples[samples.length - 1].at / 1000 : 0,
        intervalExtent(intervals)
    );
    const bypassMl = bypass === undefined ? 0 : Math.max(bypass.volume, 0);
    const bypassWide = bypassSeconds(bypassMl);
    /*
     * With no real start time the box tracks the later of the plan and now, so
     * it visibly slides right while the machine waits for the dripper instead
     * of sitting at a plan time that has already gone past.
     */
    const bypassFrom = bypass === undefined ? 0
        : bypass.startedAt !== null ? bypass.startedAt
        : Math.max(plannedSeconds, ranTo);
    return {
        ranTo,
        bypassMl,
        bypassWide,
        bypassFrom,
        maxT: Math.max(plannedSeconds, ranTo, bypassFrom + bypassWide),
    };
}

/**
 * The real-seconds extent a trace uses on its horizontal axis.
 *
 * Shared by the volume trace and the finished rate chart. The rate chart sits
 * directly under the trace, so the same second must map to the same x even
 * when the visible rate series ends before the plan, a run overran its plan,
 * or a bypass box extends the trace tail.
 */
export function traceTimeExtent(
    plannedSeconds: number,
    samples: BrewSample[],
    bypass?: {volume: number; startedAt: number | null},
    intervals: readonly PauseInterval[] = []
): number {
    return traceTimeParts(plannedSeconds, samples, bypass, intervals).maxT;
}

/**
 * The whole extent a volume trace is sized to: its real seconds across, and
 * the highest volume anything drawn in it reaches.
 *
 * `BrewTrace` sizes itself with this, and `BrewSummary` hands the same value
 * down so the rate chart underneath shares the horizontal extent. Both read it
 * from here rather than each spelling the rule out. Derived separately the two
 * agreed only while the summary passed no plan of its own, and a plan line
 * added to it later would have silently cost the volume trace its tail: a
 * short axis clips at the viewport instead of rescaling, with nothing on
 * screen to say anything is missing.
 */
export function traceAxisFor(
    pours: Pour[],
    samples: BrewSample[],
    plannedSeconds: number,
    bypass?: {volume: number; startedAt: number | null},
    intervals: readonly PauseInterval[] = []
): {maxT: number; maxV: number} {
    const times = traceTimeParts(plannedSeconds, samples, bypass, intervals);
    const plan = planPoints(pours);
    // The plan's final water level: the floor the bypass box is stacked on.
    const planTop = plan.length > 0 ? plan[plan.length - 1].v : 0;
    const water = livePoints(samples, "water");
    return {
        maxT: times.maxT,
        maxV: Math.max(
            water.length > 0 ? water[water.length - 1].v : 0,
            // The bypass box is stacked on the plan's final level rather than
            // drawn beside it. `bypassMl` is clamped non-negative upstream, so
            // this covers a plan with no bypass at all.
            planTop + times.bypassMl
        )
    };
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

type DrawnPoint = {x: number; y: number};

function drawnPoints(points: Point[], box: Box): DrawnPoint[] {
    const spanT = box.maxT > 0 ? box.maxT : 1;
    const spanV = box.maxV > 0 ? box.maxV : 1;
    const round = (n: number) => Math.round(n * 10) / 10;
    return points.map(({t, v}) => ({
        x: round((t / spanT) * box.width),
        y: round(box.height - (v / spanV) * box.height)
    }));
}

/**
 * Points to an SVG path whose cubic spans preserve each local value range.
 *
 * Fritsch and Carlson tangents make each interval monotone when the points on
 * either side are monotone, so the rate chart can look smooth without drawing
 * a rate that was never fitted. Runs that cannot support a cubic fall back to
 * the same straight path as `toPath`.
 */
export function toMonotonePath(points: Point[], box: Box): string {
    if (points.length < 3) return toPath(points, box);

    const drawn = drawnPoints(points, box);
    const segments = drawn.length - 1;
    const deltas: number[] = [];
    for (let i = 0; i < segments; i += 1) {
        const dx = drawn[i + 1].x - drawn[i].x;
        if (dx <= 0) return toPath(points, box);
        deltas.push((drawn[i + 1].y - drawn[i].y) / dx);
    }

    const slopes = Array<number>(drawn.length);
    slopes[0] = deltas[0];
    slopes[drawn.length - 1] = deltas[deltas.length - 1];
    for (let i = 1; i < drawn.length - 1; i += 1) {
        slopes[i] = deltas[i - 1] * deltas[i] <= 0
            ? 0
            : (deltas[i - 1] + deltas[i]) / 2;
    }

    for (let i = 0; i < segments; i += 1) {
        if (deltas[i] === 0) {
            slopes[i] = 0;
            slopes[i + 1] = 0;
            continue;
        }
        const alpha = slopes[i] / deltas[i];
        const beta = slopes[i + 1] / deltas[i];
        const magnitude = Math.hypot(alpha, beta);
        if (magnitude > 3) {
            const shrink = 3 / magnitude;
            slopes[i] = shrink * alpha * deltas[i];
            slopes[i + 1] = shrink * beta * deltas[i];
        }
    }

    const round = (n: number) => Math.round(n * 10) / 10;
    const parts = [`M${drawn[0].x} ${drawn[0].y}`];
    for (let i = 0; i < segments; i += 1) {
        const start = drawn[i];
        const end = drawn[i + 1];
        const dx = end.x - start.x;
        parts.push(
            `C${round(start.x + dx / 3)} ${round(start.y + slopes[i] * dx / 3)} `
            + `${round(end.x - dx / 3)} ${round(end.y - slopes[i + 1] * dx / 3)} `
            + `${end.x} ${end.y}`
        );
    }
    return parts.join(" ");
}

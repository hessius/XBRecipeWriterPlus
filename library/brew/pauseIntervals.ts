export type PauseKind = "manual" | "overflow";
export type PauseInterval = {from: number; to: number; pour: number; reason: PauseKind};

export function isPauseIntervals(value: unknown): value is PauseInterval[] {
    if (!Array.isArray(value)) return false;
    let previousTo = 0;
    for (const interval of value) {
        if (interval === null || typeof interval !== "object") return false;
        const prototype = Object.getPrototypeOf(interval);
        if (prototype !== Object.prototype && prototype !== null) return false;
        const {from, to, pour, reason} = interval;
        if (typeof from !== "number" || !Number.isFinite(from) || from < previousTo
            || typeof to !== "number" || !Number.isFinite(to) || to < from
            || !Number.isSafeInteger(pour) || pour < 0
            || (reason !== "manual" && reason !== "overflow")) return false;
        previousTo = to;
    }
    return true;
}

export function pausedWithin(
    intervals: readonly PauseInterval[], from: number, to: number
): number {
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to <= from) return 0;
    return intervals.reduce((total, interval) =>
        total + Math.max(0, Math.min(to, interval.to) - Math.max(from, interval.from)), 0);
}

export function intervalExtent(intervals: readonly PauseInterval[]): number {
    return intervals.reduce(
        (max, interval) => Number.isFinite(interval.to) ? Math.max(max, interval.to / 1000) : max, 0);
}

export type IntervalRect = {x: number; width: number; interval: PauseInterval};

export function intervalRects(
    intervals: readonly PauseInterval[], width: number, maxT: number
): IntervalRect[] {
    if (!(width > 0) || !(maxT > 0) || !Number.isFinite(width) || !Number.isFinite(maxT)) return [];
    return intervals
        .filter((interval) => interval.to > interval.from)
        .map((interval) => ({
            x: interval.from / 1000 / maxT * width,
            width: (interval.to - interval.from) / 1000 / maxT * width,
            interval,
        }));
}

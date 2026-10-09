import Pour from "@/library/Pour";
import {
    bypassSeconds, livePoints, pausedBeforeDrawdownSeconds, pathLength, planPoints, plannedSeconds, pourEndDelaySeconds,
    pourSeconds, stageSpans, toMonotonePath, toPath
} from "@/library/brew/brewShape";
import type {BrewSample} from "@/library/brew/BrewRecord";

/** 40 ml at 4 ml/s (flowRate is stored x10) then a 20 s pause. */
const bloom = () => new Pour(1, 40, 93, 40, 0, 0, 20);
/** 160 ml at 4 ml/s, no pause. */
const main = () => new Pour(2, 160, 92, 40, 0, 0, 0);

describe("pourSeconds", () => {
    it("divides volume by the flow rate, which is stored times ten", () => {
        expect(pourSeconds(bloom())).toBe(10);
    });

    it("falls back to a nominal flow when the recipe has none", () => {
        // flowRate defaults to -1 on Pour. Dividing by it would run the curve
        // backwards in time, which draws as a line through the whole chart.
        expect(pourSeconds(new Pour(1, 32, 93, -1, 0, 0, 0))).toBeCloseTo(10);
    });
});

describe("plannedSeconds", () => {
    it("adds every pour and every pause", () => {
        expect(plannedSeconds([bloom(), main()])).toBe(10 + 20 + 40);
    });

    const overflow = [{from: 40700, to: 55700, pour: 1, reason: "overflow" as const}];

    describe("pourEndDelaySeconds", () => {
        it("subtracts drawdown before measuring delay against the plan", () => {
            // A 132 second brew with 32 seconds of drawdown was only five seconds
            // late against a 95 second pour plan. Measuring to the brew end would
            // report 37 seconds and count normal drawdown as lateness.
            expect(pourEndDelaySeconds(132, 32, 95)).toBe(5);
        });

        it("says nothing when drawdown is unknown", () => {
            expect(pourEndDelaySeconds(132, null, 95)).toBeNull();
        });

        it("suppresses delays below the reporting floor", () => {
            expect(pourEndDelaySeconds(128, 32, 95)).toBeNull();
        });

        it("says nothing when there is no plan to compare with", () => {
            expect(pourEndDelaySeconds(132, 32, 0)).toBeNull();
        });

        it("does not charge the machine for a pause the user asked for", () => {
            // The same 132 second brew, 40 seconds of which the user held it
            // paused. The pour section ran 35 seconds under the plan, not five
            // seconds over it, so there is no delay to report at all.
            expect(pourEndDelaySeconds(132, 32, 95, 40)).toBeNull();
        });

        it("still reports the part of a delay the pause does not explain", () => {
            // Ten seconds paused out of a brew that ran 25 seconds late.
            expect(pourEndDelaySeconds(152, 32, 95, 10)).toBe(15);
        });

        it("does not subtract a pause that fell after the drawdown boundary", () => {
            // 30 s plan, pouring ended at 40 s, 15 s overflow pause inside the
            // drawdown, done at 60 s. Drawdown seconds already exclude the pause.
            const paused = pausedBeforeDrawdownSeconds(overflow, 40000, 15);
            expect(paused).toBe(0);
            expect(pourEndDelaySeconds(60, 20, 30, paused)).toBe(10);
        });
    });

    describe("pausedBeforeDrawdownSeconds", () => {
        it("counts only the part of a straddling interval before the boundary", () => {
            const straddle = [{from: 38000, to: 48000, pour: 1, reason: "manual" as const}];
            expect(pausedBeforeDrawdownSeconds(straddle, 40000, 10)).toBe(2);
        });

        it("counts a pre-boundary pause once", () => {
            const early = [{from: 5000, to: 12000, pour: 0, reason: "manual" as const}];
            expect(pausedBeforeDrawdownSeconds(early, 40000, 7)).toBe(7);
        });

        it("falls back to the stored total without intervals", () => {
            expect(pausedBeforeDrawdownSeconds(undefined, 40000, 9)).toBe(9);
            expect(pausedBeforeDrawdownSeconds([], 40000, 9)).toBe(9);
            expect(pausedBeforeDrawdownSeconds(undefined, undefined)).toBe(0);
        });

        it("falls back to the total when the drawdown boundary is absent", () => {
            expect(pausedBeforeDrawdownSeconds(overflow, 0, 15)).toBe(15);
        });
    });

    it("is zero for a recipe with no pours", () => {
        expect(plannedSeconds([])).toBe(0);
    });
});

describe("stageSpans", () => {
    it("places each stage after the one before it, pause included", () => {
        expect(stageSpans([bloom(), main()])).toEqual([
            {start: 0, pourEnd: 10, end: 30},
            {start: 30, pourEnd: 70, end: 70}
        ]);
    });
});

describe("planPoints", () => {
    it("steps up over each pour and runs level through each pause", () => {
        expect(planPoints([bloom(), main()])).toEqual([
            {t: 0, v: 0}, {t: 10, v: 40}, {t: 30, v: 40}, {t: 70, v: 200}
        ]);
    });

    it("emits no flat segment for a pour with no pause", () => {
        // A zero-length segment per pour is a third more path data for
        // identical geometry, on a component that renders in a list.
        expect(planPoints([main()])).toEqual([{t: 0, v: 0}, {t: 40, v: 160}]);
    });

    it("draws a recipe with no pours as nothing at all", () => {
        expect(planPoints([])).toEqual([]);
    });
});

describe("livePoints", () => {
    const samples: BrewSample[] = [
        {at: 0, water: 0, cup: 0, pour: 1},
        {at: 5000, water: 20, cup: 4, pour: 1}
    ];

    it("reads the water channel in seconds", () => {
        expect(livePoints(samples, "water")).toEqual([{t: 0, v: 0}, {t: 5, v: 20}]);
    });

    it("reads the cup channel from the same stream", () => {
        expect(livePoints(samples, "cup")).toEqual([{t: 0, v: 0}, {t: 5, v: 4}]);
    });
});

describe("toPath", () => {
    it("maps seconds across and volume up, with y flipped for SVG", () => {
        const path = toPath([{t: 0, v: 0}, {t: 10, v: 50}],
                            {width: 100, height: 40, maxT: 20, maxV: 100});
        expect(path).toBe("M0 40 L50 20");
    });

    it("is empty for fewer than two points, so no stray dot is drawn", () => {
        expect(toPath([{t: 0, v: 0}], {width: 100, height: 40, maxT: 20, maxV: 100})).toBe("");
    });

    it("does not divide by zero before the first sample has any spread", () => {
        // maxT is elapsed time, which is 0 on the first frame of every brew.
        expect(toPath([{t: 0, v: 0}, {t: 0, v: 0}],
                      {width: 100, height: 40, maxT: 0, maxV: 0})).toBe("M0 40 L0 40");
    });
});

function cubicY(a: number, b: number, c: number, d: number, t: number): number {
    const mt = 1 - t;
    return mt * mt * mt * a
        + 3 * mt * mt * t * b
        + 3 * mt * t * t * c
        + t * t * t * d;
}

function cubicSegments(path: string): {
    startY: number;
    c1Y: number;
    c2Y: number;
    endY: number;
}[] {
    const parts = path.match(
        /M[-\d.]+ ([-\d.]+)|C[-\d.]+ ([-\d.]+) [-\d.]+ ([-\d.]+) [-\d.]+ ([-\d.]+)/g
    ) ?? [];
    let startY = 0;
    const segments: ReturnType<typeof cubicSegments> = [];
    for (const part of parts) {
        const move = part.match(/^M[-\d.]+ ([-\d.]+)$/);
        if (move !== null) {
            startY = Number(move[1]);
            continue;
        }
        const curve = part.match(
            /^C[-\d.]+ ([-\d.]+) [-\d.]+ ([-\d.]+) [-\d.]+ ([-\d.]+)$/
        );
        if (curve !== null) {
            const c1Y = Number(curve[1]);
            const c2Y = Number(curve[2]);
            const endY = Number(curve[3]);
            segments.push({startY, c1Y, c2Y, endY});
            startY = endY;
        }
    }
    return segments;
}

describe("toMonotonePath", () => {
    const box = {width: 100, height: 40, maxT: 4, maxV: 10};

    it("is empty for one point", () => {
        expect(toMonotonePath([{t: 0, v: 0}], box)).toBe("");
    });

    it("keeps a two point run straight", () => {
        expect(toMonotonePath([{t: 0, v: 0}, {t: 2, v: 5}], box))
            .toBe("M0 40 L50 20");
    });

    it("draws a cubic that still passes through every measured point", () => {
        const path = toMonotonePath([
            {t: 0, v: 0},
            {t: 1, v: 8},
            {t: 2, v: 6}
        ], box);

        expect(path).toBe("M0 40 C8.3 29.3 16.7 8 25 8 C33.3 8 41.7 13.3 50 16");
    });

    it("does not overshoot the local bounds around a peak", () => {
        const path = toMonotonePath([
            {t: 0, v: 0},
            {t: 1, v: 0},
            {t: 2, v: 0},
            {t: 3, v: 8},
            {t: 4, v: 0}
        ], box);

        for (const segment of cubicSegments(path)) {
            const lower = Math.min(segment.startY, segment.endY);
            const upper = Math.max(segment.startY, segment.endY);
            for (let i = 1; i < 20; i += 1) {
                const y = cubicY(
                    segment.startY, segment.c1Y, segment.c2Y, segment.endY, i / 20
                );
                expect(y).toBeGreaterThanOrEqual(lower - 0.05);
                expect(y).toBeLessThanOrEqual(upper + 0.05);
            }
        }
    });
});

describe("pathLength", () => {
    const box = {width: 100, height: 100, maxT: 100, maxV: 100};

    it("is the width for a path that only runs across", () => {
        expect(pathLength([{t: 0, v: 0}, {t: 100, v: 0}], box)).toBeCloseTo(100);
    });

    it("counts the rise as well, which is what a staircase is mostly made of", () => {
        // The travelling head's dash pattern was sized in `width`, so on a
        // staircase -- which every plan is -- the pattern was shorter than the
        // line and repeated, putting a second lit head on the trace and
        // stopping the first one short of the end.
        const stair = [{t: 0, v: 0}, {t: 0, v: 100}, {t: 100, v: 100}];

        expect(pathLength(stair, box)).toBeCloseTo(200);
    });

    it("is zero when there is nothing to draw", () => {
        expect(pathLength([{t: 0, v: 0}], box)).toBe(0);
    });
});

describe("bypassSeconds", () => {
    it("is the volume at the default flow", () => {
        // 5 ml at 3.2 ml/s.
        expect(bypassSeconds(5)).toBeCloseTo(1.5625);
    });

    it("is zero for no bypass", () => {
        expect(bypassSeconds(0)).toBe(0);
        expect(bypassSeconds(-4)).toBe(0);
    });
});

describe("pause intervals on the axis", () => {
    const {traceAxisFor, traceTimeExtent, traceTimeParts, splitAtPauses} =
        jest.requireActual("@/library/brew/brewShape");
    const rows: BrewSample[] = [
        {at: 5000, water: 20, cup: 0, pour: 1},
        {at: 20000, water: 20, cup: 0, pour: 1},
    ];
    const open = [{from: 20000, to: 60000, pour: 1, reason: "overflow" as const}];

    it("is byte for byte unchanged without intervals", () => {
        expect(traceTimeParts(10, rows)).toEqual(traceTimeParts(10, rows, undefined, []));
        expect(traceAxisFor([], rows, 10)).toEqual(traceAxisFor([], rows, 10, undefined, []));
    });

    it("extends past the last sample for an open pause", () => {
        expect(traceTimeParts(10, rows, undefined, open).ranTo).toBe(60);
        expect(traceTimeExtent(10, rows, undefined, open)).toBe(60);
        expect(traceAxisFor([], rows, 10, undefined, open).maxT).toBe(60);
    });

    it("places the bypass after the pause", () => {
        const parts = traceTimeParts(10, rows, {volume: 20, startedAt: null}, open);
        expect(parts.bypassFrom).toBe(60);
    });

    it("splits a line only where consecutive samples bridge an overflow pause", () => {
        const pts = [{t: 5, v: 1}, {t: 10, v: 2}, {t: 40, v: 2}, {t: 45, v: 3}];
        const gap = [{from: 10000, to: 40000, pour: 1, reason: "overflow" as const}];
        expect(splitAtPauses(pts, gap)).toEqual([pts.slice(0, 2), pts.slice(2)]);
        expect(splitAtPauses(pts, [{...gap[0], reason: "manual" as const}])).toEqual([pts]);
        expect(splitAtPauses(pts, [])).toEqual([pts]);
    });
});

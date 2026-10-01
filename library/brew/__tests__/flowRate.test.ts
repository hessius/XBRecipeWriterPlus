import type {BrewRecord, BrewSample} from "@/library/brew/BrewRecord";
import {
    FLOW_MIN_WINDOW_MS,
    FLOW_WINDOW_MS,
    cupAtDrawdownFrom,
    drawdownFigures,
    drawdownRate,
    formatFlowRate,
    flowAt,
    flowNow,
    flowSeries,
    flowTail,
    maxRateOf,
    retrospectiveFlowSeries
}
    from "@/library/brew/flowRate";

/** A stream at 10 Hz. `slope` is g/s and ml/s; both channels get it. */
function ramp(seconds: number, slope: number, from = 0, at0 = 0): BrewSample[] {
    const out: BrewSample[] = [];
    for (let i = 0; i <= seconds * 10; i++) {
        out.push({
            at: at0 + i * 100,
            water: from + slope * (i / 10),
            cup: from + slope * (i / 10),
            pour: 1
        });
    }
    return out;
}

function directSlope(window: BrewSample[], of: "cup" | "water"): number | null {
    if (
        window.length < 2 ||
        window[window.length - 1].at - window[0].at < FLOW_MIN_WINDOW_MS
    ) {
        return null;
    }

    let sumT = 0;
    let sumV = 0;
    for (const sample of window) {
        sumT += sample.at / 1000;
        sumV += sample[of];
    }
    const meanT = sumT / window.length;
    const meanV = sumV / window.length;

    let covariance = 0;
    let variance = 0;
    for (const sample of window) {
        const dt = sample.at / 1000 - meanT;
        covariance += dt * (sample[of] - meanV);
        variance += dt * dt;
    }
    if (variance === 0) return null;
    const fitted = covariance / variance;
    return Number.isFinite(fitted) ? fitted : null;
}

function directFlowAt(samples: BrewSample[], stages: number, at: number) {
    const from = at - FLOW_WINDOW_MS;
    const window = samples.filter((sample) =>
        sample.pour >= 1 &&
        sample.pour <= stages &&
        sample.at >= from &&
        sample.at <= at
    );
    const cup = directSlope(window, "cup");
    const water = directSlope(window, "water");
    return cup === null || water === null ? null : {at, cup, water};
}

function bucketTailFromSeries(
    series: {at: number; cup: number}[], lastAt: number, seconds: number, buckets: number
): number[] {
    const from = lastAt - seconds * 1000;
    const recent = series.filter((point) => point.at >= from);
    if (recent.length === 0) return [];

    const span = Math.max(1, lastAt - from);
    const sums = new Array<number>(buckets).fill(0);
    const counts = new Array<number>(buckets).fill(0);
    for (const point of recent) {
        const slot = Math.min(
            buckets - 1,
            Math.floor(((point.at - from) / span) * buckets)
        );
        sums[slot] += point.cup;
        counts[slot] += 1;
    }

    const out: number[] = [];
    let carried = recent[0].cup;
    for (let i = 0; i < buckets; i += 1) {
        if (counts[i] > 0) carried = sums[i] / counts[i];
        out.push(carried);
    }
    return out;
}

function noisySquareWave(): BrewSample[] {
    let water = 0;
    let cup = 0;
    const out: BrewSample[] = [];
    for (let i = 0; i <= 320; i += 1) {
        const at = i * 100;
        const rate = at < 10_000 ? 0 : at < 22_000 ? 4 : 0;
        if (i > 0) {
            water += rate * 0.1;
            cup += rate * 0.1;
        }
        const noise = i % 4 === 0 ? 0.18 : i % 4 === 2 ? -0.18 : 0;
        out.push({
            at,
            water: water + noise,
            cup: cup - noise / 2,
            pour: 1
        });
    }
    return out;
}

function quantisedSteadyFlow(seconds = 60, phase = 0): BrewSample[] {
    const out: BrewSample[] = [];
    for (let i = 0; i <= Math.round(seconds * 10); i += 1) {
        const at = i * 100;
        const value = Math.round((2 * (at / 1000) + phase) / 0.5) * 0.5;
        out.push({
            at,
            water: value,
            cup: value,
            pour: 1
        });
    }
    return out;
}

function quantisedProfile(
    seconds: number,
    rateAt: (at: number) => number,
    phase = 0
): BrewSample[] {
    const out: BrewSample[] = [];
    let value = 0;
    for (let i = 0; i <= Math.round(seconds * 10); i += 1) {
        const at = i * 100;
        if (i > 0) value += rateAt(at) * 0.1;
        const quantised = Math.round((value + phase) / 0.5) * 0.5;
        out.push({
            at,
            water: quantised,
            cup: quantised,
            pour: 1
        });
    }
    return out;
}

function quantise(value: number, phase: number): number {
    return Math.round((value + phase) / 0.5) * 0.5;
}

function longCleanRun(): BrewSample[] {
    return Array.from({length: 121}, (_, i) => ({
        at: i * 100,
        water: quantise(i * 0.2, 0.125),
        cup: quantise(i * 0.2, 0.125),
        pour: 1
    }));
}

function realisticRampProfile(): BrewSample[] {
    return quantisedProfile(36, (at) => {
        if (at < 1_000) return 0;
        if (at < 2_000) return 4 * ((at - 1_000) / 1_000);
        if (at < 30_000) return 4;
        if (at < 36_000) return 4 * (1 - ((at - 30_000) / 6_000));
        return 0;
    });
}

function populationSpread(values: number[]): number {
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return Math.sqrt(
        values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
    );
}

function movingAverage(points: {at: number; water: number}[], windowMs: number) {
    return points.map((point) => {
        const from = point.at - windowMs / 2;
        const to = point.at + windowMs / 2;
        const window = points.filter((candidate) => candidate.at >= from && candidate.at <= to);
        return {
            at: point.at,
            water: window.reduce((sum, candidate) => sum + candidate.water, 0) / window.length
        };
    });
}

function consecutiveRates(samples: BrewSample[]) {
    const out: {at: number; water: number}[] = [];
    for (let i = 1; i < samples.length; i += 1) {
        const seconds = (samples[i].at - samples[i - 1].at) / 1000;
        if (seconds > 0) {
            out.push({
                at: samples[i].at,
                water: (samples[i].water - samples[i - 1].water) / seconds
            });
        }
    }
    return out;
}

/** A finished record with only the fields the rate arithmetic reads. */
function record(over: Partial<BrewRecord> = {}): BrewRecord {
    return {
        id: "b1",
        recipeUuid: "r1",
        recipeName: "Test",
        accent: "#FF007F",
        startedAt: 1_000_000,
        pouringAt: 1_000_000,
        drawdownAt: 100_000,
        endedAt: 1_140_000,
        outcome: "done",
        failure: null,
        pours: 2,
        waterTotal: 240,
        cupTotal: 200,
        heldSeconds: 0,
        cupAtDrawdown: 120,
        ...over
    };
}

describe("flowAt", () => {
    it("fits a constant slope exactly when the stream is clean", () => {
        const samples = ramp(10, 2);
        expect(flowAt(samples, 1, 5000)?.cup).toBeCloseTo(2, 6);
    });

    it("survives the scale's noise floor where a two point secant does not", () => {
        // The window holds 21 samples at 10 Hz. The noise is the scale's own
        // half millilitre, placed at its worst for a secant: the window's first
        // reading sits low and its last sits high, so the endpoints alone
        // manufacture a whole extra gram across two seconds.
        const samples = ramp(2, 2).map((s, i) => {
            const noise = i === 0 ? -0.5 : i === 20 ? 0.5 : i % 2 === 1 ? 0.5 : -0.5;
            return {...s, cup: s.cup + noise};
        });

        const fitted = flowAt(samples, 1, 2000)!.cup;
        const first = samples[0];
        const last = samples[samples.length - 1];
        const secant = (last.cup - first.cup) / ((last.at - first.at) / 1000);

        expect(Math.abs(fitted - 2)).toBeLessThan(0.2);
        // The assertion that stops somebody simplifying the fit away. A secant
        // over the same readings is off by a quarter of the signal.
        expect(Math.abs(secant - 2)).toBeGreaterThan(0.4);
    });

    it("lags a change of slope by the window and no more", () => {
        // Slope 1 for ten seconds, then slope 3.
        const first = ramp(10, 1);
        const second = ramp(10, 3, 10, 10_000).slice(1);
        const samples = [...first, ...second];

        // Wholly before the change: the old slope, exactly.
        expect(flowAt(samples, 1, 9_900)!.cup).toBeCloseTo(1, 6);
        // Halfway through the window after it: somewhere between the two.
        const midway = flowAt(samples, 1, 11_000)!.cup;
        expect(midway).toBeGreaterThan(1.2);
        expect(midway).toBeLessThan(2.9);
        // A full window past it: the new slope, exactly.
        expect(flowAt(samples, 1, 12_500)!.cup).toBeCloseTo(3, 6);
    });

    it("is null before there is enough of a window to fit", () => {
        expect(flowAt([], 1, 0)).toBeNull();
        expect(flowAt(ramp(0, 2), 1, 0)).toBeNull();
    });

    it("is null when the window is only a few milliseconds wide", () => {
        const samples: BrewSample[] = [
            {at: 0, water: 0, cup: 0, pour: 1},
            {at: 5, water: 0.5, cup: 0.5, pour: 1}
        ];

        expect(flowAt(samples, 1, 5)).toBeNull();
    });

    it("is null when one channel cannot produce a finite slope", () => {
        const samples = ramp(3, 2).map((sample, i) => ({
            ...sample,
            cup: i === 10 ? Number.NaN : sample.cup
        }));

        expect(flowAt(samples, 1, 3000)).toBeNull();
    });

    it("is null when all samples in the window share one timestamp", () => {
        const samples: BrewSample[] = [
            {at: 1000, water: 1, cup: 1, pour: 1},
            {at: 1000, water: 2, cup: 2, pour: 1},
            {at: 1000, water: 3, cup: 3, pour: 1}
        ];

        expect(flowAt(samples, 1, 1000)).toBeNull();
    });

    it("never lets the bypass into the cup channel", () => {
        // Two stages, then a bypass tagged stage 3, dumping 30 g in 2 seconds.
        const brew = ramp(10, 2);
        const bypass: BrewSample[] = [];
        for (let i = 1; i <= 20; i++) {
            bypass.push({
                at: 10_000 + i * 100,
                water: 20 + i * 1.5,
                cup: 20 + i * 1.5,
                pour: 3
            });
        }
        const samples = [...brew, ...bypass];

        // Read at the height of the bypass. The bed's rate is what it was.
        expect(flowAt(samples, 2, 10_000)!.cup).toBeCloseTo(2, 6);
        // The first bypass frame is enough to make the prior fit stale.
        expect(flowAt(samples, 2, 10_100)).toBeNull();
        // And once the window holds nothing but bypass, there is nothing to say.
        expect(flowAt(samples, 2, 12_000)).toBeNull();
    });
});

describe("flowNow", () => {
    it("reads the end of the stream", () => {
        expect(flowNow(ramp(10, 2), 1)!.cup).toBeCloseTo(2, 6);
    });

    it("is null on a stream that has not started", () => {
        expect(flowNow([], 1)).toBeNull();
    });

    it("stops reporting the last brew rate as soon as bypass starts", () => {
        const samples = [
            ...ramp(10, 2),
            {at: 10_000, water: 22, cup: 22, pour: 2}
        ];

        expect(flowNow(samples, 1)).toBeNull();
    });
});

describe("flowSeries", () => {
    it("carries both channels on the sample clock", () => {
        const series = flowSeries(ramp(10, 2), 1);
        expect(series.length).toBeGreaterThan(0);
        const last = series[series.length - 1];
        expect(last.at).toBe(10_000);
        expect(last.cup).toBeCloseTo(2, 6);
        expect(last.water).toBeCloseTo(2, 6);
    });

    it("has no point where only the bypass was running", () => {
        const brew = ramp(5, 2);
        const bypass = Array.from({length: 40}, (_, i) => ({
            at: 5_000 + (i + 1) * 100,
            water: 10 + (i + 1) * 1.5,
            cup: 10 + (i + 1) * 1.5,
            pour: 2
        }));
        const series = flowSeries([...brew, ...bypass], 1);
        expect(series.length).toBeGreaterThan(0);
        expect(series.every((point) => point.cup < 3)).toBe(true);
    });

    it("does not report the opening scale tick as a real flow rate", () => {
        const samples: BrewSample[] = [
            {at: 0, water: 0, cup: 0, pour: 1},
            {at: 80, water: 0.5, cup: 0.5, pour: 1}
        ];
        for (let i = 1; i <= 30; i++) {
            const at = 80 + i * 100;
            const value = 0.5 + 2 * ((at - 80) / 1000);
            samples.push({at, water: value, cup: value, pour: 1});
        }

        const series = flowSeries(samples, 1);

        expect(series.length).toBeGreaterThan(0);
        expect(Math.max(...series.slice(0, 4).map((point) => point.cup))).toBeLessThan(2.6);
    });

    it("matches direct mean-centred fits on a long realistic stream", () => {
        const samples = ramp(240, 2).map((sample, i) => {
            const wobble = i % 10 === 0 ? 0.18 : i % 3 === 0 ? -0.12 : 0.08;
            return {
                ...sample,
                cup: sample.cup + wobble,
                water: sample.water - wobble / 2
            };
        });
        const direct = new Map(
            [60_000, 120_000, 180_000, 240_000]
                .map((at) => [at, directFlowAt(samples, 1, at)])
        );
        const series = new Map(flowSeries(samples, 1).map((point) => [point.at, point]));

        for (const [at, point] of direct) {
            expect(point).not.toBeNull();
            expect(Math.abs(series.get(at)!.cup - point!.cup)).toBeLessThan(1e-8);
            expect(Math.abs(series.get(at)!.water - point!.water)).toBeLessThan(1e-8);
        }
    });

    it.each([
        ["NaN", Number.NaN],
        ["Infinity", Number.POSITIVE_INFINITY]
    ])("recovers from a non-finite %s reading", (_, poison) => {
        const samples = ramp(30, 2).map((sample, i) => ({
            ...sample,
            cup: i === 50 ? poison : sample.cup,
            water: i === 50 ? poison : sample.water
        }));

        const series = flowSeries(samples, 1);
        const byTime = new Map(series.map((point) => [point.at, point]));
        const recovered = byTime.get(7_100);
        const afterPoison = byTime.get(25_000);
        const direct = flowAt(samples, 1, 25_000);

        expect(byTime.get(5_000)).toBeUndefined();
        expect(recovered).toBeDefined();
        expect(recovered!.cup).toBeCloseTo(flowAt(samples, 1, 7_100)!.cup, 8);
        expect(afterPoison).toBeDefined();
        expect(direct).not.toBeNull();
        expect(afterPoison!.cup).toBeCloseTo(2, 6);
        expect(afterPoison!.water).toBeCloseTo(2, 6);
        expect(afterPoison!.cup).toBeCloseTo(direct!.cup, 8);
        expect(afterPoison!.water).toBeCloseTo(direct!.water, 8);
        expect(series.length).toBeGreaterThan(samples.length - 60);
        expect(series[series.length - 1].at).toBe(30_000);
    });
});

describe("retrospectiveFlowSeries", () => {
    it("smooths run endpoints instead of letting raw quantisation set the axis", () => {
        const smoothed = retrospectiveFlowSeries(quantisedSteadyFlow(), 1);
        const first = smoothed[0];
        const last = smoothed[smoothed.length - 1];

        expect(smoothed).toHaveLength(600);
        expect(first.cup).toBeGreaterThan(1.8);
        expect(first.cup).toBeLessThan(2.2);
        expect(last.cup).toBeGreaterThan(1.8);
        expect(last.cup).toBeLessThan(2.2);
        expect(maxRateOf(smoothed)).toBeLessThan(2.25);
    });

    it("does not let a short quantised run overshoot the live estimator", () => {
        const samples = quantisedSteadyFlow(1.1, 0.1);
        const smoothed = retrospectiveFlowSeries(samples, 1);
        const causal = flowSeries(samples, 1);

        expect(smoothed).toHaveLength(11);
        expect(causal.length).toBeGreaterThan(0);
        expect(maxRateOf(smoothed)).toBeLessThanOrEqual(maxRateOf(causal) + 0.01);
        expect(maxRateOf(smoothed)).toBeLessThan(2.1);
    });

    it("does not flatten the retrospective endpoint zone into one plateau", () => {
        const samples = quantisedProfile(24, (at) =>
            at < 10_000 ? 0 : at < 22_000 ? 4 : 0);
        const smoothed = retrospectiveFlowSeries(samples, 1);
        const ending = smoothed
            .filter((point) => point.at >= 22_100 && point.at <= 24_000)
            .map((point) => Number(point.cup.toFixed(3)));
        const distinct = new Set(ending);

        expect(ending.length).toBeGreaterThan(10);
        expect(distinct.size).toBeGreaterThan(5);
        expect(ending[ending.length - 1]).toBeLessThan(0.5);
    });

    it("keeps a realistic ramp head at zero before the first drop and rising after it", () => {
        const smoothed = retrospectiveFlowSeries(realisticRampProfile(), 1);
        const deadHead = smoothed
            .filter((point) => point.at <= 400)
            .map((point) => point.cup);
        const earlyRamp = smoothed
            .filter((point) => point.at >= 2_000 && point.at <= 2_900)
            .map((point) => Number(point.cup.toFixed(3)));
        const atTwoSeconds = smoothed.find((point) => point.at === 2_000);
        const interior = smoothed.find((point) => point.at === 10_000);

        expect(deadHead).toHaveLength(4);
        expect(Math.max(...deadHead)).toBeLessThan(0.001);
        expect(atTwoSeconds).toBeDefined();
        expect(interior).toBeDefined();
        expect(atTwoSeconds!.cup).toBeLessThan(interior!.cup);
        expect(new Set(earlyRamp).size).toBeGreaterThan(8);
    });

    it("never reports a negative retrospective rate", () => {
        const smoothed = retrospectiveFlowSeries(realisticRampProfile(), 1);

        expect(smoothed.every((point) => point.cup >= 0 && point.water >= 0)).toBe(true);
    });

    it("fits a drawable two point retrospective run without raw spikes", () => {
        const samples: BrewSample[] = [
            {at: 0, water: 0, cup: 0, pour: 1},
            {at: 1000, water: 1, cup: 1, pour: 1},
            {at: 2000, water: 2, cup: 2, pour: 1}
        ];

        expect(retrospectiveFlowSeries(samples, 1)).toEqual([
            {at: 1000, cup: 1, water: 1},
            {at: 2000, cup: 1, water: 1}
        ]);
    });

    it("keeps short retrospective runs honest without raw fallback points", () => {
        const tooShort: BrewSample[] = [
            {at: 0, water: 0, cup: 0, pour: 1},
            {at: 500, water: 0.5, cup: 0.5, pour: 1},
            {at: 1000, water: 1, cup: 1, pour: 1}
        ];
        const exactlyThree: BrewSample[] = [
            {at: 0, water: 0, cup: 0, pour: 1},
            {at: 1000, water: 1, cup: 1, pour: 1},
            {at: 2000, water: 2, cup: 2, pour: 1},
            {at: 3000, water: 3, cup: 3, pour: 1}
        ];

        expect(retrospectiveFlowSeries(tooShort, 1)).toEqual([]);
        const threePoint = retrospectiveFlowSeries(exactlyThree, 1);
        expect(threePoint).toHaveLength(3);
        for (const point of threePoint) {
            expect(point.cup).toBeCloseTo(1, 12);
            expect(point.water).toBeCloseTo(1, 12);
        }
    });

    it("flattens noisy square-wave plateaus while keeping the real edges sharp", () => {
        const samples = noisySquareWave();
        const smoothed = retrospectiveFlowSeries(samples, 1);
        const raw = consecutiveRates(samples);

        const highPlateau = smoothed
            .filter((point) => point.at >= 14_000 && point.at <= 18_000)
            .map((point) => point.water);
        const rawHighPlateau = raw
            .filter((point) => point.at >= 14_000 && point.at <= 18_000)
            .map((point) => point.water);
        const beforeEdge = smoothed.find((point) => point.at === 8_900);
        const afterEdge = smoothed.find((point) => point.at === 11_100);
        const beforeStop = smoothed.find((point) => point.at === 20_900);
        const afterStop = smoothed.find((point) => point.at === 23_100);
        const moving = movingAverage(smoothed, 6000);
        const movingAfterEdge = moving.find((point) => point.at === 10_100);
        const movingAfterStop = moving.find((point) => point.at === 22_100);

        expect(highPlateau).toHaveLength(41);
        expect(populationSpread(highPlateau))
            .toBeLessThan(populationSpread(rawHighPlateau) * 0.65);
        expect(Math.min(...highPlateau)).toBeGreaterThan(3.6);
        expect(Math.max(...highPlateau)).toBeLessThan(4.4);
        expect(beforeEdge!.water).toBeLessThan(1);
        expect(afterEdge!.water).toBeGreaterThan(3);
        expect(beforeStop!.water).toBeGreaterThan(3);
        expect(afterStop!.water).toBeLessThan(1);
        expect(movingAfterEdge!.water).toBeLessThan(2.5);
        expect(movingAfterStop!.water).toBeGreaterThan(1.5);
    });

    it("does not smooth across a gap between drawable runs", () => {
        const first = ramp(8, 5);
        const second = ramp(8, 1, first[first.length - 1].water, 10_000);
        const smoothed = retrospectiveFlowSeries([...first, ...second], 1);
        const afterGap = smoothed.find((point) => point.at === 10_100);

        expect(afterGap).toBeDefined();
        expect(afterGap!.water).toBeCloseTo(1, 6);
        expect(afterGap!.cup).toBeCloseTo(1, 6);
    });

    it("leaves the full-support interior of a long run bit-for-bit unchanged", () => {
        const smoothed = retrospectiveFlowSeries(longCleanRun(), 1);
        const interior = smoothed
            .filter((point) => point.at >= 4_000 && point.at <= 8_000)
            .map((point) => [point.at, point.cup, point.water]);

        expect(interior).toMatchInlineSnapshot(`
[
  [
    4000,
    2.045277127244338,
    2.045277127244338,
  ],
  [
    4100,
    1.9241455959988891,
    1.9241455959988891,
  ],
  [
    4200,
    2.0532158403789404,
    2.0532158403789404,
  ],
  [
    4300,
    2.0532158403789404,
    2.0532158403789404,
  ],
  [
    4400,
    1.9241455959988891,
    1.9241455959988891,
  ],
  [
    4500,
    2.045277127244338,
    2.045277127244338,
  ],
  [
    4600,
    1.9241455959988891,
    1.9241455959988891,
  ],
  [
    4700,
    2.0532158403789404,
    2.0532158403789404,
  ],
  [
    4800,
    2.0532158403789404,
    2.0532158403789404,
  ],
  [
    4900,
    1.9241455959988891,
    1.9241455959988891,
  ],
  [
    5000,
    2.045277127244338,
    2.045277127244338,
  ],
  [
    5100,
    1.9241455959988891,
    1.9241455959988891,
  ],
  [
    5200,
    2.0532158403789404,
    2.0532158403789404,
  ],
  [
    5300,
    2.0532158403789404,
    2.0532158403789404,
  ],
  [
    5400,
    1.9241455959988891,
    1.9241455959988891,
  ],
  [
    5500,
    2.045277127244338,
    2.045277127244338,
  ],
  [
    5600,
    1.9241455959988891,
    1.9241455959988891,
  ],
  [
    5700,
    2.0532158403789404,
    2.0532158403789404,
  ],
  [
    5800,
    2.0532158403789404,
    2.0532158403789404,
  ],
  [
    5900,
    1.9241455959988891,
    1.9241455959988891,
  ],
  [
    6000,
    2.045277127244338,
    2.045277127244338,
  ],
  [
    6100,
    1.9241455959988891,
    1.9241455959988891,
  ],
  [
    6200,
    2.0532158403789404,
    2.0532158403789404,
  ],
  [
    6300,
    2.0532158403789404,
    2.0532158403789404,
  ],
  [
    6400,
    1.9241455959988891,
    1.9241455959988891,
  ],
  [
    6500,
    2.045277127244338,
    2.045277127244338,
  ],
  [
    6600,
    1.9241455959988891,
    1.9241455959988891,
  ],
  [
    6700,
    2.0532158403789404,
    2.0532158403789404,
  ],
  [
    6800,
    2.0532158403789404,
    2.0532158403789404,
  ],
  [
    6900,
    1.9241455959988891,
    1.9241455959988891,
  ],
  [
    7000,
    2.045277127244338,
    2.045277127244338,
  ],
  [
    7100,
    1.9241455959988891,
    1.9241455959988891,
  ],
  [
    7200,
    2.0532158403789404,
    2.0532158403789404,
  ],
  [
    7300,
    2.0532158403789404,
    2.0532158403789404,
  ],
  [
    7400,
    1.9241455959988891,
    1.9241455959988891,
  ],
  [
    7500,
    2.045277127244338,
    2.045277127244338,
  ],
  [
    7600,
    1.9241455959988891,
    1.9241455959988891,
  ],
  [
    7700,
    2.0532158403789404,
    2.0532158403789404,
  ],
  [
    7800,
    2.0532158403789404,
    2.0532158403789404,
  ],
  [
    7900,
    1.9241455959988891,
    1.9241455959988891,
  ],
  [
    8000,
    2.045277127244338,
    2.045277127244338,
  ],
]
`);
    });

    it("keeps the live tail on the causal estimator", () => {
        const samples = noisySquareWave();
        const tail = flowTail(samples, 1, 18, 12);
        const last = samples[samples.length - 1];
        const causalTail = bucketTailFromSeries(flowSeries(samples, 1), last.at, 18, 12);
        const retrospectiveTail = bucketTailFromSeries(
            retrospectiveFlowSeries(samples, 1),
            last.at,
            18,
            12
        );

        expect(tail).toEqual(causalTail);
        expect(retrospectiveTail.some((value, i) => Math.abs(value - tail[i]) > 0.2))
            .toBe(true);
    });
});

describe("flowTail", () => {
    it("gives a fixed number of buckets over the requested tail", () => {
        const tail = flowTail(ramp(60, 2), 1, 30, 24);
        expect(tail).toHaveLength(24);
        expect(tail[tail.length - 1]).toBeCloseTo(2, 1);
    });

    it("is empty when there is nothing to fit", () => {
        expect(flowTail([], 1, 30, 24)).toEqual([]);
    });

    it("is empty when asked for a non-positive time span", () => {
        const samples = ramp(60, 2);

        expect(flowTail(samples, 1, 0, 24)).toEqual([]);
        expect(flowTail(samples, 1, -1, 24)).toEqual([]);
    });

    it("can return more buckets than there are rate points", () => {
        const tail = flowTail(ramp(3, 2), 1, 30, 200);

        expect(tail).toHaveLength(200);
        expect(tail.every(Number.isFinite)).toBe(true);
    });

    it("borrows the previous value for an empty bucket", () => {
        const first = ramp(3, 1);
        const second = ramp(3, 3, 3, 7000).slice(1);
        const samples = [...first, ...second];

        const tail = flowTail(samples, 1, 10, 10);

        expect(tail).toHaveLength(10);
        expect(tail[4]).toBeCloseTo(tail[3], 6);
        expect(tail[5]).toBeCloseTo(tail[3], 6);
        expect(tail[9]).toBeGreaterThan(tail[3]);
    });

    it("ages out the tail while the stream is in bypass", () => {
        const brew = ramp(60, 2);
        const bypass = Array.from({length: 400}, (_, i) => ({
            at: 60_000 + (i + 1) * 100,
            water: 120 + (i + 1) * 1.5,
            cup: 120 + (i + 1) * 1.5,
            pour: 2
        }));

        expect(flowTail([...brew, ...bypass], 1, 30, 24)).toEqual([]);
    });
});

describe("maxRateOf", () => {
    it("is the largest rate in either channel", () => {
        expect(maxRateOf(flowSeries(ramp(10, 2), 1))).toBeCloseTo(2, 6);
    });

    it("is zero on an empty series", () => {
        expect(maxRateOf([])).toBe(0);
    });
});

describe("formatFlowRate", () => {
    it("keeps a tiny negative fit from printing as negative zero", () => {
        expect(formatFlowRate(-0.04)).toBe("0.0");
    });

    it("clamps a negative fit to zero rather than deleting the figure", () => {
        // Presence is flowNow's call, never the formatter's. A formatter that
        // could return null here would blink the row at the sample rate as a
        // noisy fit crossed the rounding boundary.
        expect(formatFlowRate(-0.06)).toBe("0.0");
        expect(formatFlowRate(-3)).toBe("0.0");
    });

    it("has no number to print for a non-finite rate", () => {
        expect(formatFlowRate(Number.NaN)).toBeNull();
        expect(formatFlowRate(Number.POSITIVE_INFINITY)).toBeNull();
    });

    it("prints a positive finite rate to one decimal place", () => {
        expect(formatFlowRate(2.44)).toBe("2.4");
    });
});

describe("cupAtDrawdownFrom", () => {
    it("reads the cup at the boundary, not at the end", () => {
        const samples = ramp(20, 2);
        expect(cupAtDrawdownFrom(samples, 1, 10_000)).toBeCloseTo(20, 6);
    });

    it("ignores bypass readings at the drawdown boundary", () => {
        const samples: BrewSample[] = [
            {at: 0, water: 0, cup: 0, pour: 1},
            {at: 10_000, water: 20, cup: 20, pour: 1},
            {at: 10_000, water: 60, cup: 60, pour: 2}
        ];

        expect(cupAtDrawdownFrom(samples, 1, 10_000)).toBeCloseTo(20, 6);
    });

    it("is null when nobody can say what the boundary cup reading was", () => {
        expect(cupAtDrawdownFrom(ramp(20, 2), 1, 0)).toBeNull();
        expect(cupAtDrawdownFrom([], 1, 10_000)).toBeNull();
    });
});

describe("drawdownRate", () => {
    it("returns the record clock and rate as one definition", () => {
        expect(drawdownFigures(record())).toEqual({seconds: 40, rate: 2});
    });

    it("averages the cup over the drawdown", () => {
        // 200 in the cup at the end, 120 at the boundary, 40 seconds between.
        expect(drawdownRate(record())).toBeCloseTo(2, 6);
    });

    it("takes the bypass out of the total first", () => {
        // The same brew with 40 ml of bypass on the same scale.
        const withBypass = record({
            cupTotal: 240,
            bypass: {volume: 40, temperature: 90, delivered: 40, startedAt: 110_000}
        });
        expect(drawdownRate(withBypass)).toBeCloseTo(2, 6);
    });

    it("drops rates above the displayable drawdown ceiling", () => {
        expect(drawdownRate(record({
            cupTotal: 200,
            cupAtDrawdown: 100,
            drawdownAt: 139_100
        }))).toBeNull();
    });

    it("is null, never 0, whenever a term is missing", () => {
        expect(drawdownRate(record({cupAtDrawdown: undefined}))).toBeNull();
        expect(drawdownRate(record({drawdownAt: 0}))).toBeNull();
        expect(drawdownRate(record({cupAtDrawdown: 0}))).toBeNull();
        // A cup that did not rise across the drawdown is not a rate of nothing.
        expect(drawdownRate(record({cupAtDrawdown: 200}))).toBeNull();
        // And neither is a boundary at the very last millisecond.
        expect(drawdownRate(record({drawdownAt: 140_000}))).toBeNull();
    });
});

describe("FLOW_WINDOW_MS", () => {
    it("is two seconds, which half of the arithmetic above assumes", () => {
        expect(FLOW_WINDOW_MS).toBe(2000);
    });
});

describe("FLOW_MIN_WINDOW_MS", () => {
    it("is one second, keeping a half millilitre tick below a quarter of a 2 g/s signal", () => {
        expect(FLOW_MIN_WINDOW_MS).toBe(1000);
    });
});

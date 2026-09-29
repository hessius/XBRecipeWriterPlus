import type {BrewRecord, BrewSample} from "@/library/brew/BrewRecord";
import {
    FLOW_MIN_WINDOW_MS,
    FLOW_WINDOW_MS,
    cupAtDrawdownFrom,
    drawdownRate,
    flowAt,
    flowNow,
    flowSeries,
    flowTail,
    maxRateOf
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

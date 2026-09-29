import type {BrewSample} from "@/library/brew/BrewRecord";
import {FLOW_WINDOW_MS, flowAt, flowNow, flowSeries, flowTail, maxRateOf}
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
        expect(series.every((point) => point.cup < 3)).toBe(true);
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
});

describe("maxRateOf", () => {
    it("is the largest rate in either channel", () => {
        expect(maxRateOf(flowSeries(ramp(10, 2), 1))).toBeCloseTo(2, 6);
    });

    it("is zero on an empty series", () => {
        expect(maxRateOf([])).toBe(0);
    });
});

describe("FLOW_WINDOW_MS", () => {
    it("is two seconds, which half of the arithmetic above assumes", () => {
        expect(FLOW_WINDOW_MS).toBe(2000);
    });
});

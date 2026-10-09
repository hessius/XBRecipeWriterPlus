import {
    OVERFLOW_CROSSING_MS,
    OVERFLOW_PAIR_MAX_SKEW_MS,
    OVERFLOW_PUBLISH_MS,
    OVERFLOW_READING_MAX_AGE_MS
} from "@/constants/overflow";
import {crossingAt, pairedRetained, type RetainedPair} from "../overflowPolicy";

const NOW = 10_000;
const reading = (grams: number, at = NOW) => ({grams, at});
const pair = (grams: number, at: number): RetainedPair => ({grams, at});
const NONE = {since: null, lastAt: null, sustained: false};

describe("overflow policy constants", () => {
    it("holds the agreed policy values", () => {
        expect(OVERFLOW_READING_MAX_AGE_MS).toBe(1000);
        expect(OVERFLOW_PAIR_MAX_SKEW_MS).toBe(250);
        expect(OVERFLOW_CROSSING_MS).toBe(500);
        expect(OVERFLOW_PUBLISH_MS).toBe(250);
    });
});

describe("pairedRetained", () => {
    it("subtracts the cup from the water at the same instant", () => {
        expect(pairedRetained(reading(200), reading(80), NOW)).toEqual({grams: 120, at: NOW});
    });

    it("floors a negative estimate at zero", () => {
        expect(pairedRetained(reading(80), reading(200), NOW)).toEqual({grams: 0, at: NOW});
    });

    it("returns null, never zero, when a channel is missing", () => {
        expect(pairedRetained(undefined, reading(80), NOW)).toBeNull();
        expect(pairedRetained(reading(200), undefined, NOW)).toBeNull();
        expect(pairedRetained(undefined, undefined, NOW)).toBeNull();
    });

    it("accepts exactly 1000 ms of age and rejects 1001", () => {
        expect(pairedRetained(reading(200, NOW - 1000), reading(80, NOW - 1000), NOW))
            .toEqual({grams: 120, at: NOW - 1000});
        expect(pairedRetained(reading(200, NOW - 1001), reading(80, NOW - 1001), NOW)).toBeNull();
    });

    it("accepts finite negative clocks while still bounding reading age", () => {
        const now = -1000;
        expect(pairedRetained(reading(200, -1250), reading(80, now), now))
            .toEqual({grams: 120, at: -1250});
        expect(pairedRetained(reading(200, now - 1000), reading(80, now - 1000), now))
            .toEqual({grams: 120, at: now - 1000});
        expect(pairedRetained(reading(200, now - 1001), reading(80, now - 1001), now)).toBeNull();
    });

    it("applies the age limit to each channel", () => {
        expect(pairedRetained(reading(200, NOW - 1001), reading(80, NOW - 900), NOW)).toBeNull();
        expect(pairedRetained(reading(200, NOW - 900), reading(80, NOW - 1001), NOW)).toBeNull();
    });

    it("accepts exactly 250 ms of skew and rejects 251", () => {
        expect(pairedRetained(reading(200, NOW - 250), reading(80, NOW), NOW))
            .toEqual({grams: 120, at: NOW - 250});
        expect(pairedRetained(reading(200, NOW - 251), reading(80, NOW), NOW)).toBeNull();
    });

    it("uses the older timestamp whichever channel arrived first", () => {
        const a = pairedRetained(reading(200, NOW - 200), reading(80, NOW - 50), NOW);
        const b = pairedRetained(reading(200, NOW - 50), reading(80, NOW - 200), NOW);
        expect(a).toEqual({grams: 120, at: NOW - 200});
        expect(b).toEqual({grams: 120, at: NOW - 200});
    });

    it("rejects negative grams on either channel", () => {
        expect(pairedRetained(reading(-1), reading(80), NOW)).toBeNull();
        expect(pairedRetained(reading(200), reading(-1), NOW)).toBeNull();
    });

    it("rejects nonfinite grams on either channel", () => {
        for (const bad of [NaN, Infinity, -Infinity]) {
            expect(pairedRetained(reading(bad), reading(80), NOW)).toBeNull();
            expect(pairedRetained(reading(200), reading(bad), NOW)).toBeNull();
        }
    });

    it("rejects nonfinite timestamps on either channel", () => {
        for (const bad of [NaN, Infinity, -Infinity]) {
            expect(pairedRetained(reading(200, bad), reading(80), NOW)).toBeNull();
            expect(pairedRetained(reading(200), reading(80, bad), NOW)).toBeNull();
        }
    });

    it("rejects future readings on either channel", () => {
        expect(pairedRetained(reading(200, NOW + 1), reading(80), NOW)).toBeNull();
        expect(pairedRetained(reading(200), reading(80, NOW + 1), NOW)).toBeNull();
    });

    it("rejects a nonfinite now", () => {
        for (const bad of [NaN, Infinity, -Infinity]) {
            expect(pairedRetained(reading(200), reading(80), bad)).toBeNull();
        }
    });

    it("never yields a nonfinite estimate from huge finite readings", () => {
        const huge = Number.MAX_VALUE;
        const result = pairedRetained(reading(huge), reading(0), NOW);
        expect(result === null || Number.isFinite(result.grams)).toBe(true);
        const other = pairedRetained(reading(0), reading(huge), NOW);
        expect(other === null || Number.isFinite(other.grams)).toBe(true);
    });

    it("rejects timestamps whose age arithmetic overflows", () => {
        expect(pairedRetained(reading(200, -Number.MAX_VALUE), reading(80, -Number.MAX_VALUE), Number.MAX_VALUE)).toBeNull();
    });
});

describe("crossingAt", () => {
    it("starts a span on the first hit and is not yet sustained", () => {
        expect(crossingAt(null, null, pair(120, 1000), 100, "above"))
            .toEqual({since: 1000, lastAt: 1000, sustained: false});
    });

    it("treats equality as a hit above the limit", () => {
        expect(crossingAt(null, null, pair(100, 1000), 100, "above").since).toBe(1000);
    });

    it("treats equality as no hit below the limit", () => {
        expect(crossingAt(null, null, pair(100, 1000), 100, "below")).toEqual(NONE);
        expect(crossingAt(null, null, pair(99, 1000), 100, "below").since).toBe(1000);
    });

    it("is sustained at exactly 500 ms and not at 499", () => {
        expect(crossingAt(1000, 1400, pair(120, 1499), 100, "above"))
            .toEqual({since: 1000, lastAt: 1499, sustained: false});
        expect(crossingAt(1000, 1400, pair(120, 1500), 100, "above"))
            .toEqual({since: 1000, lastAt: 1500, sustained: true});
    });

    it.each([100, 150])("sustains below at 500 ms, then resets on %i grams", (grams) => {
        let state = crossingAt(null, null, pair(99, 1000), 100, "below");
        expect(state).toEqual({since: 1000, lastAt: 1000, sustained: false});
        state = crossingAt(state.since, state.lastAt, pair(90, 1499), 100, "below");
        expect(state).toEqual({since: 1000, lastAt: 1499, sustained: false});
        state = crossingAt(state.since, state.lastAt, pair(99, 1500), 100, "below");
        expect(state).toEqual({since: 1000, lastAt: 1500, sustained: true});
        expect(crossingAt(state.since, state.lastAt, pair(grams, 1600), 100, "below"))
            .toEqual(NONE);
    });

    it("accepts finite negative clocks for crossing evidence in both directions", () => {
        for (const direction of ["above", "below"] as const) {
            const grams = direction === "above" ? 120 : 99;
            let state = crossingAt(null, null, pair(grams, -1000), 100, direction);
            expect(state).toEqual({since: -1000, lastAt: -1000, sustained: false});
            state = crossingAt(state.since, state.lastAt, pair(grams, -501), 100, direction);
            expect(state).toEqual({since: -1000, lastAt: -501, sustained: false});
            state = crossingAt(state.since, state.lastAt, pair(grams, -500), 100, direction);
            expect(state).toEqual({since: -1000, lastAt: -500, sustained: true});
        }
    });

    it("cannot become a crossing by polling one sample repeatedly", () => {
        let state = crossingAt(null, null, pair(120, 1000), 100, "above");
        for (let i = 0; i < 50; i++) {
            state = crossingAt(state.since, state.lastAt, pair(120, 1000), 100, "above");
        }
        expect(state).toEqual({since: 1000, lastAt: 1000, sustained: false});
    });

    it("debounces a low reading: one sample below the limit resets the span", () => {
        const held = crossingAt(1000, 1400, pair(120, 1500), 100, "above");
        expect(held.sustained).toBe(true);
        expect(crossingAt(held.since, held.lastAt, pair(50, 1600), 100, "above")).toEqual(NONE);
        expect(crossingAt(null, null, pair(120, 1700), 100, "above"))
            .toEqual({since: 1700, lastAt: 1700, sustained: false});
    });

    it("debounces a high reading when watching below", () => {
        expect(crossingAt(1000, 1400, pair(150, 1500), 100, "below")).toEqual(NONE);
    });

    it("resets on a null pair, such as a stale or missing reading", () => {
        expect(crossingAt(1000, 1400, null, 100, "above")).toEqual(NONE);
    });

    it("lets a long gap between distinct samples count as one continuous span", () => {
        expect(crossingAt(1000, 1100, pair(120, 5000), 100, "above"))
            .toEqual({since: 1000, lastAt: 5000, sustained: true});
    });

    it("ignores an out-of-order sample and keeps the previous span", () => {
        expect(crossingAt(1000, 1600, pair(120, 1300), 100, "above"))
            .toEqual({since: 1000, lastAt: 1600, sustained: true});
        expect(crossingAt(1000, 1300, pair(120, 1200), 100, "above"))
            .toEqual({since: 1000, lastAt: 1300, sustained: false});
    });

    it("keeps valid evidence when an out-of-order sample contradicts it", () => {
        expect(crossingAt(1000, 1600, pair(10, 1300), 100, "above"))
            .toEqual({since: 1000, lastAt: 1600, sustained: true});
        expect(crossingAt(1000, 1600, pair(200, 1300), 100, "below"))
            .toEqual({since: 1000, lastAt: 1600, sustained: true});
    });

    it("ignores a duplicate timestamp even when it contradicts", () => {
        expect(crossingAt(1000, 1600, pair(10, 1600), 100, "above"))
            .toEqual({since: 1000, lastAt: 1600, sustained: true});
    });

    it("keeps below-limit evidence when a duplicate timestamp contradicts it", () => {
        const held = crossingAt(1000, 1400, pair(99, 1500), 100, "below");
        expect(held).toEqual({since: 1000, lastAt: 1500, sustained: true});
        expect(crossingAt(held.since, held.lastAt, pair(100, 1500), 100, "below"))
            .toEqual(held);
        expect(crossingAt(held.since, held.lastAt, pair(150, 1500), 100, "below"))
            .toEqual(held);
    });

    it("treats malformed prior state as no evidence", () => {
        expect(crossingAt(1000, null, pair(120, 2000), 100, "above"))
            .toEqual({since: 2000, lastAt: 2000, sustained: false});
        expect(crossingAt(null, 1000, pair(120, 2000), 100, "above"))
            .toEqual({since: 2000, lastAt: 2000, sustained: false});
        expect(crossingAt(3000, 1000, pair(120, 2000), 100, "above"))
            .toEqual({since: 2000, lastAt: 2000, sustained: false});
        expect(crossingAt(NaN, 1000, pair(120, 2000), 100, "above"))
            .toEqual({since: 2000, lastAt: 2000, sustained: false});
    });

    it("fails closed on an invalid limit", () => {
        for (const bad of [NaN, Infinity, -Infinity, -1]) {
            expect(crossingAt(1000, 1400, pair(120, 1500), bad, "above")).toEqual(NONE);
            expect(crossingAt(1000, 1400, pair(120, 1500), bad, "below")).toEqual(NONE);
        }
    });

    it("fails closed on a nonfinite or negative pair", () => {
        for (const bad of [NaN, Infinity, -1]) {
            expect(crossingAt(1000, 1400, pair(bad, 1500), 100, "above")).toEqual(NONE);
        }
        for (const bad of [NaN, Infinity, -Infinity]) {
            expect(crossingAt(1000, 1400, pair(120, bad), 100, "above")).toEqual(NONE);
        }
    });

    it("fails closed when span arithmetic overflows", () => {
        const max = Number.MAX_VALUE;
        expect(crossingAt(-max, -max / 2, pair(120, max), 100, "above")).toEqual(NONE);
    });
});

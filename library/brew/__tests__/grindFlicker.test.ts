import {
    EDGE_EPSILON,
    flickerMsFor,
    FLICKER_BEATS_PER_TURN,
    grindEdgeElapsed,
    msToNextGrindEdge
} from "@/library/brew/grindFlicker";
import {traceAnimationFor} from "@/hooks/useTraceAnimation";

describe("the grinder's flicker", () => {
    it("beats three times per turn of the burr", () => {
        // 120 rpm is two turns a second, so a turn is 500 ms and a beat is a
        // third of that. Pins the rpm-to-ms conversion and the half-beat
        // (rather than whole-beat) result; the beat count itself is pinned
        // below, by the flash-rate test, so this does not also have to.
        expect(flickerMsFor(120) * 2).toBeCloseTo(500 / FLICKER_BEATS_PER_TURN, 5);
    });

    it("lopes at the slowest grind and buzzes at the fastest", () => {
        expect(flickerMsFor(60)).toBeGreaterThan(flickerMsFor(120));
    });

    it("is faster than the fixed period it replaces, at every speed", () => {
        // The whole point: 420 was judged too slow on hardware, so no setting
        // of the grinder may land back on or above it.
        for (let rpm = 60; rpm <= 120; rpm += 10) {
            expect(flickerMsFor(rpm)).toBeLessThan(420);
        }
    });

    it("falls back to the fastest burr for a speed that cannot be one", () => {
        // `Pour` and `Recipe` both use -1 as "never set", and a recipe read
        // off a damaged card can carry anything. A zero or negative period
        // would divide by zero in the square wave and freeze the flicker.
        for (const rpm of [0, -1, NaN]) {
            expect(flickerMsFor(rpm)).toBe(flickerMsFor(120));
        }
    });

    it("does not run away on a speed above the grinder's range", () => {
        // Clamped rather than trusted: the card's byte is not validated on
        // every path, and a 4 ms strobe is a photosensitivity problem, not a
        // fast grind.
        expect(flickerMsFor(9000)).toBe(flickerMsFor(120));
    });

    it("stays below a flash rate, however the beat is retuned", () => {
        // The fastest burr gives a 167 ms cycle, so about six flashes a second.
        // That is acceptable here for reasons that are worth writing down: it
        // is a thin trace stroke rather than a large area of the screen, and
        // both reduced motion and the animateBrewChart setting switch it off
        // entirely. Doubling the beat would put it at twelve, which is not.
        const flashesPerSecond = 1000 / (flickerMsFor(120) * 2);
        expect(flashesPerSecond).toBeLessThan(7);
    });
});

describe("scheduling the grind to its edges", () => {
    // Walk the self-correcting timer the hook runs, in exact arithmetic with no
    // sampler and no latency, and read the wave it drives through the real
    // `traceAnimationFor` rather than a second copy of the parity rule -- so a
    // test that the flips are evenly spaced is not just testing its own
    // reimplementation. From a fresh grind, re-arm to the next edge, publish
    // the snapped reading the way the hook does, and note every time the lit
    // half flips to dark or back.
    function flipsFor(rpm: number, edges: number): number[] {
        const half = flickerMsFor(rpm);
        const flips: number[] = [];
        let ms = 0;
        let lit = traceAnimationFor("grinding", grindEdgeElapsed(ms, half), true, rpm).warmth === 1;
        for (let i = 0; i < edges; i += 1) {
            ms += msToNextGrindEdge(ms, half);
            const nowLit = traceAnimationFor("grinding", grindEdgeElapsed(ms, half), true, rpm)
                .warmth === 1;
            if (nowLit !== lit) flips.push(ms);
            lit = nowLit;
        }
        return flips;
    }

    it("flips the wave at one constant interval, for every burr in range", () => {
        // The whole fix: the interval between successive flips has exactly one
        // value. The old frame sampler made it alternate between the floor and
        // the ceiling of a 16 ms grid, and which one drifted -- the beat the
        // user saw as speeding up then slowing down.
        for (const rpm of [60, 70, 80, 90, 100, 110, 120]) {
            const half = flickerMsFor(rpm);
            const flips = flipsFor(rpm, 300);
            const intervals = flips.slice(1).map((t, i) => t - flips[i]);
            const distinct = new Set(intervals.map((v) => v.toFixed(6)));
            expect(distinct.size).toBe(1);
            expect(intervals[0]).toBeCloseTo(half, 6);
        }
    });

    it("never drops a flip to a floating-point crumb on an exact multiple", () => {
        // `n * half` does not round-trip through `floor(x / half)` for most
        // burrs, so without the nudge about one edge in ten kept the same
        // parity as the last and the wave stalled for a beat. Three hundred
        // edges at 120 rpm cross that fault many times; every one must flip.
        const flips = flipsFor(120, 300);
        expect(flips.length).toBe(300);
    });

    it("aims at the next edge and never at zero, wherever it is asked from", () => {
        const half = flickerMsFor(120);
        // Exactly on an edge, the next is a whole half-beat away, not now: a
        // zero delay would spin the timer.
        expect(msToNextGrindEdge(0, half)).toBeCloseTo(half, 6);
        expect(msToNextGrindEdge(half, half)).toBeCloseTo(half, 6);
        // Partway through, only the remainder is left.
        expect(msToNextGrindEdge(half * 0.25, half)).toBeCloseTo(half * 0.75, 6);
        // An unset speed still yields the fastest burr's positive half-beat,
        // never a zero or negative interval.
        expect(msToNextGrindEdge(0, flickerMsFor(-1))).toBeGreaterThan(0);
    });

    it("holds the published reading on the multiple it last crossed", () => {
        const half = flickerMsFor(120);
        expect(grindEdgeElapsed(half * 0.9, half)).toBe(0);
        expect(grindEdgeElapsed(half * 1.5, half)).toBeCloseTo(half, 6);
        // The nudge is small enough not to move an honest mid-interval reading.
        expect(EDGE_EPSILON).toBeLessThan(1e-6);
    });
});

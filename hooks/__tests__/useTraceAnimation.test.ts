import {act, renderHook} from "@testing-library/react-native";

import {traceAnimationFor, useTraceAnimation} from "@/hooks/useTraceAnimation";
import {flickerMsFor} from "@/library/brew/grindFlicker";

let mockMotionOn = true;

// Not `requireActual`: the settings store opens SQLite on import, which a test
// about a timer has no business doing.
jest.mock("@/hooks/useSetting", () => ({
    useSetting: () => [mockMotionOn, jest.fn()]
}));
jest.mock("@/constants/motion", () => ({
    ...jest.requireActual("@/constants/motion"),
    useReducedMotion: () => false
}));

describe("traceAnimationFor", () => {
    it("breathes while the machine is waking", () => {
        const at = (t: number) => traceAnimationFor("waking", t, true, 120);
        // A 3.4 s cycle: opacity is not the same a second and a half in.
        expect(at(0).opacity).not.toBeCloseTo(at(1700).opacity, 2);
    });

    it("warms toward the accent at the peak of the breath", () => {
        const peak = traceAnimationFor("waking", 1700, true, 120);
        expect(peak.warmth).toBeGreaterThan(traceAnimationFor("waking", 0, true, 120).warmth);
    });

    it("travels a lit segment along the curve while sending", () => {
        const early = traceAnimationFor("sending", 200, true, 120);
        const later = traceAnimationFor("sending", 900, true, 120);
        expect(later.headAt).toBeGreaterThan(early.headAt);
    });

    it("keeps the travelling head inside the curve", () => {
        [0, 400, 1200, 5000].forEach((t) => {
            const {headAt} = traceAnimationFor("sending", t, true, 120);
            expect(headAt).toBeGreaterThanOrEqual(0);
            expect(headAt).toBeLessThanOrEqual(1);
        });
    });

    it("fuses the dashes once the recipe is in the machine", () => {
        expect(traceAnimationFor("readyToStart", 0, true, 120).dashed).toBe(false);
    });

    it("flickers rather than breathing while grinding", () => {
        // Intense, not pretty. Opacity is untouched; the colour is what moves.
        // The instants come from the period rather than being written out, so
        // this measures the shape of the wave -- one half lit, one half not --
        // and not a rate that has already changed once.
        const half = flickerMsFor(120);
        const a = traceAnimationFor("grinding", 0, true, 120);
        const b = traceAnimationFor("grinding", half, true, 120);
        expect(a.opacity).toBe(b.opacity);
        expect(a.warmth).not.toBeCloseTo(b.warmth, 2);
        // Halfway through a beat is still the same beat.
        expect(traceAnimationFor("grinding", half / 2, true, 120).warmth)
            .toBeCloseTo(a.warmth, 5);
    });

    it("holds an end state when motion is off", () => {
        // Not "no animation" — no status at all is worse than a still one.
        [0, 900, 1700, 3300].forEach((t) => {
            expect(traceAnimationFor("waking", t, false, 120).opacity).toBe(1);
            expect(traceAnimationFor("sending", t, false, 120).headAt).toBe(1);
            expect(traceAnimationFor("grinding", t, false, 120).warmth).toBe(1);
        });
    });

    it("leaves the plan alone once the water is running", () => {
        const still = traceAnimationFor("pouring", 1200, true, 120);
        expect(still).toEqual({opacity: 1, warmth: 0, headAt: 1, dashed: true});
    });

    it("flickers faster for a faster burr", () => {
        // Same instant, two grinders. At 120 rpm the half-period is 83 ms, so
        // 100 ms is into the dark half; at 60 rpm it is 167 ms, so 100 ms is
        // still lit. One number, read two ways, which is the whole feature.
        const fast = traceAnimationFor("grinding", 100, true, 120);
        const slow = traceAnimationFor("grinding", 100, true, 60);
        expect(fast.warmth).not.toBe(slow.warmth);
    });

    it("still lights the first instant of the grind whatever the speed", () => {
        // A grind that began dark would read as the animation not having
        // started.
        for (const rpm of [60, 90, 120]) {
            expect(traceAnimationFor("grinding", 0, true, rpm).warmth).toBe(1);
        }
    });

    it("holds the grind lit when motion is off, whatever the speed", () => {
        // Reduced motion keeps each phase's end state rather than dropping it.
        // Asserted as a value, not as two calls compared to each other: on this
        // path the speed is never read, so comparing them was one expression
        // written twice.
        expect(traceAnimationFor("grinding", 100, false, 60))
            .toEqual({opacity: 1, warmth: 1, headAt: 1, dashed: true});
    });
});

describe("useTraceAnimation", () => {
    // Counted rather than read off `jest.getTimerCount()`, which also counts
    // the timers React and the testing library keep for themselves.
    let started: number[];
    let stopped: number;
    let ticks: (() => void)[];

    beforeEach(() => {
        mockMotionOn = true;
        started = [];
        stopped = 0;
        ticks = [];
        jest.useFakeTimers();
        jest.spyOn(global, "setInterval").mockImplementation(((fn: () => void, ms: number) => {
            started.push(ms);
            ticks.push(fn);
            return {fn} as unknown as ReturnType<typeof setInterval>;
        }) as typeof setInterval);
        jest.spyOn(global, "clearInterval").mockImplementation(() => { stopped += 1; });
    });
    afterEach(() => {
        jest.restoreAllMocks();
        jest.useRealTimers();
    });

    it("runs no clock through the pour", async () => {
        // The longest phase of all, drawing the same thing at every
        // millisecond. A timer through it would repaint several hundred points
        // twenty times a second, for minutes, to no visible effect.
        await renderHook(() => useTraceAnimation("pouring", 120));
        expect(started).toEqual([]);
    });

    it("runs no clock when the user has turned the animation off", async () => {
        mockMotionOn = false;
        await renderHook(() => useTraceAnimation("waking", 120));
        expect(started).toEqual([]);
    });

    it("stops its clock when the screen goes away", async () => {
        const {unmount} = await renderHook(() => useTraceAnimation("waking", 120));
        expect(started).toEqual([50]);
        await act(async () => { unmount(); });
        expect(stopped).toBe(1);
    });

    it("schedules the grind to the wave's edges, not on a frame clock", async () => {
        // The grind is a square wave, and a square wave says nothing between
        // its edges. So no frame-rate sampler runs at all -- the old 16 ms
        // interval is gone -- and the reading is instead scheduled to flip at
        // the edge itself. Nothing changes for the first half-beat; the flip
        // lands once it is crossed.
        jest.restoreAllMocks();
        const {result} = await renderHook(() => useTraceAnimation("grinding", 120));
        const half = flickerMsFor(120);
        const before = result.current.warmth;
        await act(async () => { jest.advanceTimersByTime(Math.floor(half) - 1); });
        expect(result.current.warmth).toBe(before);
        await act(async () => { jest.advanceTimersByTime(2); });
        expect(result.current.warmth).not.toBe(before);
    });

    it("wakes the JS thread only at the wave's edges, not every frame", async () => {
        // Scheduling to the edges means the timer is re-armed about twelve
        // times a second at the fastest burr -- once per edge -- not sixty. The
        // old frame sampler woke the thread every 16 ms to redraw the same
        // thing while BLE weight notifications were being decoded. Counted as
        // re-arms rather than renders, because a sampler with the same bail-out
        // re-renders exactly as seldom -- it just wakes far more often to
        // decide not to.
        jest.restoreAllMocks();
        jest.useFakeTimers();
        await renderHook(() => useTraceAnimation("grinding", 120));
        const spy = jest.spyOn(global, "setTimeout");
        for (let t = 0; t < 1000; t += 1) {
            await act(async () => { jest.advanceTimersByTime(1); });
        }
        // Counted among the re-arms only -- delays at a half-beat and up, which
        // at the fastest burr is 83 ms. React's own scheduler fires a swarm of
        // zero-delay timers that are not ours. A 16 ms sampler would arm none
        // this long, and a reintroduced one uses `setInterval` and arms no
        // `setTimeout` at all.
        const arms = spy.mock.calls.filter((c) => Number(c[1]) >= 50).length;
        expect(arms).toBeGreaterThanOrEqual(10);
        expect(arms).toBeLessThanOrEqual(14);
    });

    it("flickers at one steady rate, not faster then slower on a loop", async () => {
        // The bug this pins: the grind reading was sampled on a 16 ms clock,
        // so each half of an 83 ms square wave was rounded to the nearest
        // frame -- 80 ms one time, 96 ms the next -- and which one you got
        // drifted, so the flicker sped up and slowed down on a beat. Driven
        // here through three seconds of a real fake clock and sampled once a
        // millisecond (so the measurement itself adds at most 1 ms of spread),
        // every lit and dark interval must be the same length.
        jest.restoreAllMocks();
        const {result} = await renderHook(() => useTraceAnimation("grinding", 120));
        const flips: number[] = [];
        let warm = result.current.warmth;
        for (let t = 1; t <= 3000; t += 1) {
            await act(async () => { jest.advanceTimersByTime(1); });
            if (result.current.warmth !== warm) {
                flips.push(t);
                warm = result.current.warmth;
            }
        }
        const intervals = flips.slice(1).map((t, i) => t - flips[i]);
        expect(intervals.length).toBeGreaterThan(20);
        expect(Math.max(...intervals) - Math.min(...intervals)).toBeLessThanOrEqual(2);
    });

    it("starts the new phase from nothing, not from where the last one got to", async () => {
        jest.restoreAllMocks();
        const {result, rerender} = await renderHook(
            ({p}: {p: string}) => useTraceAnimation(p, 120), {initialProps: {p: "waking"}});
        await act(async () => { jest.advanceTimersByTime(2500); });

        await act(async () => { rerender({p: "sending"}); });
        // A head opening at 0.78 because that is where the breath had got to
        // is the bug this pins.
        expect(result.current.headAt).toBe(0);
    });
});

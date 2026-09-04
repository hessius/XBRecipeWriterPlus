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

    it("samples the grind fast enough to draw its square wave", async () => {
        // At least two readings in each half of the wave. Sampled any slower,
        // the flicker aliases into a stutter -- uneven, but from the sampler
        // rather than from the grinder, which is the opposite of the point.
        await renderHook(() => useTraceAnimation("grinding", 120));
        expect(started[0]).toBeLessThanOrEqual(flickerMsFor(120) / 2);
    });

    it("tells React only when the flicker changes, not on every frame", async () => {
        // The grind is sampled at frame rate, but its output is a square wave
        // that changes about twelve times a second. Without the bail-out every
        // one of those frames would allocate a fresh reading and re-run the
        // whole brew screen to draw the same thing five times over -- on the
        // JS thread, for the twenty seconds of a grind, while BLE weight
        // notifications are being decoded.
        let renders = 0;
        await renderHook(() => {
            renders += 1;
            return useTraceAnimation("grinding", 120);
        });
        const before = renders;

        // Six frames is 96 ms, which crosses exactly one edge of an 83 ms
        // half-period: 16, 32, 48, 64, 80 all land in the same half; 96 is the
        // next one. That is two real state changes, so two renders -- plus one
        // more that measurement showed is unavoidable here: React's cheapest
        // bail-out (skipping the render call entirely) only applies when a
        // fiber has no update already in flight, so the update immediately
        // after a real change still calls the component once to discover it
        // changed nothing, even though it returns the previous object. Every
        // update after that one is free. Six renders -- one per frame, with no
        // bail-out at all -- is what the mutation below produces.
        for (let i = 0; i < 6; i += 1) {
            await act(async () => {
                jest.advanceTimersByTime(16);
                ticks[0]();
            });
        }

        expect(renders - before).toBeLessThanOrEqual(3);
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

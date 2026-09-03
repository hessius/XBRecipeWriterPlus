import {act, renderHook} from "@testing-library/react-native";

import {traceAnimationFor, useTraceAnimation} from "@/hooks/useTraceAnimation";

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
        const at = (t: number) => traceAnimationFor("waking", t, true);
        // A 3.4 s cycle: opacity is not the same a second and a half in.
        expect(at(0).opacity).not.toBeCloseTo(at(1700).opacity, 2);
    });

    it("warms toward the accent at the peak of the breath", () => {
        const peak = traceAnimationFor("waking", 1700, true);
        expect(peak.warmth).toBeGreaterThan(traceAnimationFor("waking", 0, true).warmth);
    });

    it("travels a lit segment along the curve while sending", () => {
        const early = traceAnimationFor("sending", 200, true);
        const later = traceAnimationFor("sending", 900, true);
        expect(later.headAt).toBeGreaterThan(early.headAt);
    });

    it("keeps the travelling head inside the curve", () => {
        [0, 400, 1200, 5000].forEach((t) => {
            const {headAt} = traceAnimationFor("sending", t, true);
            expect(headAt).toBeGreaterThanOrEqual(0);
            expect(headAt).toBeLessThanOrEqual(1);
        });
    });

    it("fuses the dashes once the recipe is in the machine", () => {
        expect(traceAnimationFor("readyToStart", 0, true).dashed).toBe(false);
    });

    it("flickers rather than breathing while grinding", () => {
        // Intense, not pretty. Opacity is untouched; the colour is what moves.
        const a = traceAnimationFor("grinding", 0, true);
        const b = traceAnimationFor("grinding", 420, true);
        expect(a.opacity).toBe(b.opacity);
        expect(a.warmth).not.toBeCloseTo(b.warmth, 2);
        // Halfway through a beat is still the same beat. Pinned because the
        // rate is the design, and a faster flicker is a different animation.
        expect(traceAnimationFor("grinding", 210, true).warmth).toBeCloseTo(a.warmth, 5);
    });

    it("holds an end state when motion is off", () => {
        // Not "no animation" — no status at all is worse than a still one.
        [0, 900, 1700, 3300].forEach((t) => {
            expect(traceAnimationFor("waking", t, false).opacity).toBe(1);
            expect(traceAnimationFor("sending", t, false).headAt).toBe(1);
            expect(traceAnimationFor("grinding", t, false).warmth).toBe(1);
        });
    });

    it("leaves the plan alone once the water is running", () => {
        const still = traceAnimationFor("pouring", 1200, true);
        expect(still).toEqual({opacity: 1, warmth: 0, headAt: 1, dashed: true});
    });
});

describe("useTraceAnimation", () => {
    // Counted rather than read off `jest.getTimerCount()`, which also counts
    // the timers React and the testing library keep for themselves.
    let started: number[];
    let stopped: number;

    beforeEach(() => {
        mockMotionOn = true;
        started = [];
        stopped = 0;
        jest.useFakeTimers();
        jest.spyOn(global, "setInterval").mockImplementation(((fn: () => void, ms: number) => {
            started.push(ms);
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
        await renderHook(() => useTraceAnimation("pouring"));
        expect(started).toEqual([]);
    });

    it("runs no clock when the user has turned the animation off", async () => {
        mockMotionOn = false;
        await renderHook(() => useTraceAnimation("waking"));
        expect(started).toEqual([]);
    });

    it("stops its clock when the screen goes away", async () => {
        const {unmount} = await renderHook(() => useTraceAnimation("waking"));
        expect(started).toEqual([50]);
        await act(async () => { unmount(); });
        expect(stopped).toBe(1);
    });

    it("starts the new phase from nothing, not from where the last one got to", async () => {
        jest.restoreAllMocks();
        const {result, rerender} = await renderHook(
            ({p}: {p: string}) => useTraceAnimation(p), {initialProps: {p: "waking"}});
        await act(async () => { jest.advanceTimersByTime(2500); });

        await act(async () => { rerender({p: "sending"}); });
        // A head opening at 0.78 because that is where the breath had got to
        // is the bug this pins.
        expect(result.current.headAt).toBe(0);
    });
});

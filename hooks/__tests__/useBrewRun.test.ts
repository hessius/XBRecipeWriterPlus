import {act, renderHook} from "@testing-library/react-native";

import {useBrewRun} from "@/hooks/useBrewRun";
import type {BrewRecord, BrewSample} from "@/library/brew/BrewRecord";
import type {BrewPhase} from "@/library/machine/Machine";
import type {Notification} from "@/library/machine/protocol";
import Pour from "@/library/Pour";
import Recipe from "@/library/Recipe";

jest.mock("@/hooks/useBrew", () => ({
    useBrew: () => global.__brewer
}));

declare global {
    var __brewer: Omit<ReturnType<typeof import("@/hooks/useBrew").useBrew>, "machine">
        & {machine: import("@/library/brew/BrewRecorder").RecorderMachine};
}

function recipe(): Recipe {
    const r = new Recipe();
    r.name = "Ethiopia Guji";
    // 40 ml at 4 ml/s = 10 s, then a 20 s pause; then 160 ml at 4 ml/s = 40 s.
    r.pours = [new Pour(1, 40, 93, 40, 0, 0, 20), new Pour(2, 160, 92, 40, 0, 0, 0)];
    return r;
}

/** A brewer and a machine the test drives by hand. */
function harness() {
    let notify: (n: Notification) => void = () => {};
    let phase: (p: BrewPhase) => void = () => {};
    const written: {record: BrewRecord; samples: BrewSample[]}[] = [];
    global.__brewer = {
        phase: {name: "idle"} as BrewPhase,
        error: null,
        brew: jest.fn(async () => {}),
        startBrew: jest.fn(async () => {}),
        cancelBrew: jest.fn(async () => {}),
        canOfferProMode: () => false,
        switchToProAndRetry: jest.fn(async () => {}),
        machine: {
            onNotification: (l: typeof notify) => { notify = l; return () => {}; },
            onPhase: (l: typeof phase) => { phase = l; return () => {}; }
        }
    };
    return {
        written,
        water: (grams: number) => act(async () => notify({kind: "waterWeight", grams})),
        cup: (grams: number) => act(async () => notify({kind: "cupWeight", grams})),
        setPhase: (p: BrewPhase) => act(async () => {
            global.__brewer.phase = p;
            phase(p);
        }),
        store: {insert: (record: BrewRecord, samples: BrewSample[]) =>
            written.push({record, samples})}
    };
}

describe("useBrewRun", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("has no samples before the machine pours", async () => {
        const h = harness();
        const {result} = await renderHook(() => useBrewRun(recipe(), h.store));
        expect(result.current.samples).toEqual([]);
    });

    it("publishes samples at 4 Hz", async () => {
        const h = harness();
        const {result} = await renderHook(() => useBrewRun(recipe(), h.store));
        await h.setPhase({name: "pouring", pour: 1, pours: 2});
        await h.water(10);
        await h.water(20);
        // Nothing is published until the tick: the buffer is the recorder's.
        expect(result.current.samples).toEqual([]);
        await act(async () => { jest.advanceTimersByTime(250); });
        expect(result.current.samples).toHaveLength(2);
    });

    it("reports the live stage, zero-based", async () => {
        const h = harness();
        const {result} = await renderHook(() => useBrewRun(recipe(), h.store));
        await h.setPhase({name: "pouring", pour: 2, pours: 2});
        expect(result.current.activeIndex).toBe(1);
    });

    it("reports no live stage before the first pour", async () => {
        const h = harness();
        const {result} = await renderHook(() => useBrewRun(recipe(), h.store));
        await h.setPhase({name: "grinding"});
        expect(result.current.activeIndex).toBeNull();
    });

    it("marks every stage done once the brew is over", async () => {
        // `pours.length` is the ladder's "all done", so history and the end of
        // a live brew show the same thing.
        const h = harness();
        const {result} = await renderHook(() => useBrewRun(recipe(), h.store));
        await h.setPhase({name: "pouring", pour: 2, pours: 2});
        await h.setPhase({name: "done"});
        expect(result.current.activeIndex).toBe(2);
    });

    it("is not holding while the stage is within its plan", async () => {
        // The clock runs off the samples, not off the wall: the trace and the
        // ladder must agree on one clock, and the stream is it. A held machine
        // still reports its weight ten times a second, so the samples keep
        // coming even when the water does not.
        const h = harness();
        const {result} = await renderHook(() => useBrewRun(recipe(), h.store));
        await h.setPhase({name: "pouring", pour: 1, pours: 2});
        await act(async () => { jest.advanceTimersByTime(20_000); });
        await h.water(40);
        await act(async () => { jest.advanceTimersByTime(250); });
        expect(result.current.holding).toBe(false);
    });

    it("is holding once the stage outruns its plan", async () => {
        // Stage 1 is 10 s of pour plus a 20 s pause. Past 30 s, the machine is
        // waiting for the bed to drain.
        const h = harness();
        const {result} = await renderHook(() => useBrewRun(recipe(), h.store));
        await h.setPhase({name: "pouring", pour: 1, pours: 2});
        await act(async () => { jest.advanceTimersByTime(34_000); });
        await h.water(40);
        await act(async () => { jest.advanceTimersByTime(250); });
        expect(result.current.holding).toBe(true);
    });

    it("writes the brew to history when it ends", async () => {
        const h = harness();
        await renderHook(() => useBrewRun(recipe(), h.store));
        await h.setPhase({name: "pouring", pour: 1, pours: 2});
        await h.water(40);
        await h.setPhase({name: "done"});
        expect(h.written).toHaveLength(1);
        expect(h.written[0].record.recipeName).toBe("Ethiopia Guji");
    });

    it("writes nothing for a brew that was refused before it began", async () => {
        const h = harness();
        await renderHook(() => useBrewRun(recipe(), h.store));
        await h.setPhase({name: "failed", reason: "blocked", detail: "The tank is low."});
        expect(h.written).toEqual([]);
    });

    it("stops the clock when the brew ends", async () => {
        const h = harness();
        const {result} = await renderHook(() => useBrewRun(recipe(), h.store));
        await h.setPhase({name: "pouring", pour: 1, pours: 2});
        await act(async () => { jest.advanceTimersByTime(10_000); });
        await h.water(40);
        await act(async () => { jest.advanceTimersByTime(250); });
        await h.setPhase({name: "done"});
        const stopped = result.current.elapsed;
        await act(async () => { jest.advanceTimersByTime(10_000); });
        expect(result.current.elapsed).toBe(stopped);
    });
});

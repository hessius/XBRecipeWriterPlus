import {act, renderHook} from "@testing-library/react-native";

import {stageWaterFrom, useBrewRun} from "@/hooks/useBrewRun";
import type {BrewRecord, BrewSample} from "@/library/brew/BrewRecord";
import type {BrewPhase} from "@/library/machine/Machine";
import type {Notification} from "@/library/machine/protocol";
import Pour from "@/library/Pour";
import {applyQuickEdit, quickEditRecordAdjustments} from "@/library/quickEdit";
import Recipe from "@/library/Recipe";

jest.mock("@/hooks/useBrew", () => ({
    useBrew: () => global.__brewer
}));

declare global {
    var __brewer: Omit<ReturnType<typeof import("@/hooks/useBrew").useBrew>, "machine">
        & {machine: import("@/library/brew/BrewRecorder").RecorderMachine
            & {phase: BrewPhase}
            & {info?: {grindSize: number} | null;
               askHowItIsDoing?: () => Promise<boolean>}};
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
    const notifyListeners: ((n: Notification) => void)[] = [];
    const phaseListeners: ((p: BrewPhase) => void)[] = [];
    const written: {record: BrewRecord; samples: BrewSample[]}[] = [];
    const dials: [string, number][] = [];
    // The machine answers by default, with a dial that has been turned since
    // the recipe went out. A test that wants silence sets `answers` to false.
    const vitals = {answers: true, asked: 0, grindSize: 52};
    global.__brewer = {
        phase: {name: "idle"} as BrewPhase,
        error: null,
        brew: jest.fn(async () => {}),
        startBrew: jest.fn(async () => {}),
        pauseBrew: jest.fn(async () => {}),
        resumeBrew: jest.fn(async () => {}),
        cancelBrew: jest.fn(async () => {}),
        canOfferProMode: () => false,
        switchToProAndRetry: jest.fn(async () => {}),
        machine: {
            phase: {name: "idle"} as BrewPhase,
            info: {get grindSize() { return vitals.grindSize; }},
            askHowItIsDoing: async () => {
                vitals.asked++;
                return vitals.answers;
            },
            readDial: () => vitals.grindSize,
            onNotification: (l: (n: Notification) => void) => {
                notifyListeners.push(l);
                return () => {
                    const i = notifyListeners.indexOf(l);
                    if (i !== -1) notifyListeners.splice(i, 1);
                };
            },
            onPhase: (l: (p: BrewPhase) => void) => {
                phaseListeners.push(l);
                return () => {
                    const i = phaseListeners.indexOf(l);
                    if (i !== -1) phaseListeners.splice(i, 1);
                };
            }
        }
    };
    return {
        written,
        water: (grams: number) => act(async () =>
            [...notifyListeners].forEach((l) => l({kind: "waterWeight", grams}))),
        cup: (grams: number) => act(async () =>
            [...notifyListeners].forEach((l) => l({kind: "cupWeight", grams}))),
        setPhase: (p: BrewPhase) => act(async () => {
            global.__brewer.phase = p;
            global.__brewer.machine.phase = p;
            [...phaseListeners].forEach((l) => l(p));
        }),
        vitals,
        dials,
        store: {
            insert: (record: BrewRecord, samples: BrewSample[]) =>
                written.push({record, samples}),
            recordDialAfter: (id: string, dial: number) => dials.push([id, dial])
        }
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

    describe("what a run publishes per stage", () => {
        it("reports the millilitres this stage has delivered, not the brew total", () => {
            const samples = [
                {at: 0, water: 0, cup: 0, pour: 1},
                {at: 5000, water: 48, cup: 40, pour: 1},
                {at: 12000, water: 60, cup: 52, pour: 2}
            ];

            expect(stageWaterFrom(samples, 2)).toBe(12);
        });

        it("reports nothing delivered for a stage that has not begun", () => {
            expect(stageWaterFrom([{at: 0, water: 0, cup: 0, pour: 1}], 3)).toBe(0);
        });
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

    it("keeps publishing the trace while the brew settles", async () => {
        // Settling is neither pouring nor over. The cup is still filling, so
        // the live trace has to keep publishing through it rather than freezing
        // at the last pour tick.
        const h = harness();
        const {result} = await renderHook(() => useBrewRun(recipe(), h.store));
        await h.setPhase({name: "pouring", pour: 1, pours: 2});
        await h.water(200);
        await act(async () => { jest.advanceTimersByTime(250); });
        await h.setPhase({name: "settling"});
        await h.water(210);
        await act(async () => { jest.advanceTimersByTime(250); });
        expect(result.current.phase.name).toBe("settling");
        expect(result.current.samples).toHaveLength(2);
    });

    it("keeps publishing live samples and elapsed time during bypass", async () => {
        const h = harness();
        const {result} = await renderHook(() => useBrewRun(recipe(), h.store));
        await h.setPhase({name: "pouring", pour: 2, pours: 2});
        await h.water(200);
        await act(async () => { jest.advanceTimersByTime(250); });
        await h.setPhase({name: "bypass"});
        await h.water(210);
        await act(async () => { jest.advanceTimersByTime(250); });

        expect(result.current.phase.name).toBe("bypass");
        expect(result.current.samples).toHaveLength(2);
        expect(result.current.samples[1].pour).toBe(3);
        expect(result.current.elapsed).toBeGreaterThan(result.current.samples[0].at / 1000);
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

    it("keeps every stage lit through settling, not faded to un-started", async () => {
        // Settling is neither pouring nor over, but every stage has physically
        // poured. Left as null, activeIndex drops the whole ladder to the
        // pending look for the length of the drawdown. It must read as done,
        // exactly like `over`: pours.length, not null.
        const h = harness();
        const {result} = await renderHook(() => useBrewRun(recipe(), h.store));
        await h.setPhase({name: "pouring", pour: 2, pours: 2});
        await h.setPhase({name: "settling"});
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

    it("is holding when the live stage has an open stall", async () => {
        // Two readings a few seconds apart with the water essentially still,
        // in a stage that still owes millilitres. 10 to 10.2 is inside the
        // noise floor, so this is flat water rather than a slow pour.
        const h = harness();
        const {result} = await renderHook(() => useBrewRun(recipe(), h.store));
        await h.setPhase({name: "pouring", pour: 1, pours: 2});
        await h.water(10);
        await act(async () => { jest.advanceTimersByTime(250); });
        await act(async () => { jest.advanceTimersByTime(5_000); });
        await h.water(10.2);
        await act(async () => { jest.advanceTimersByTime(250); });

        expect(result.current.holding).toBe(true);
        expect(result.current.heldSeconds).toBeGreaterThan(0);
    });

    it("is not holding while the water is still rising", async () => {
        const h = harness();
        const {result} = await renderHook(() => useBrewRun(recipe(), h.store));
        await h.setPhase({name: "pouring", pour: 1, pours: 2});
        await h.water(10);
        await act(async () => { jest.advanceTimersByTime(250); });
        await act(async () => { jest.advanceTimersByTime(3_000); });
        await h.water(30);
        await act(async () => { jest.advanceTimersByTime(250); });

        expect(result.current.holding).toBe(false);
    });

    it("stops holding once the water moves again, at a real pour's pace", async () => {
        // The device defect this rule was written for, in its second half.
        // A stall opens, then the machine resumes -- but water frames arrive
        // about ten times a second and a pour runs about 3.2 ml/s, so each
        // frame is ~0.32 ml apart. Comparing two adjacent samples against the
        // 0.5 ml noise floor calls that flat, so HOLDING latched on for the
        // rest of the stage while the machine was visibly pouring.
        const h = harness();
        const {result} = await renderHook(() => useBrewRun(recipe(), h.store));
        await h.setPhase({name: "pouring", pour: 1, pours: 2});
        await h.water(10);
        await act(async () => { jest.advanceTimersByTime(250); });
        await act(async () => { jest.advanceTimersByTime(5_000); });
        await h.water(10.2);
        await act(async () => { jest.advanceTimersByTime(250); });
        expect(result.current.holding).toBe(true);

        // Now pour, one realistic frame at a time.
        for (let i = 1; i <= 12; i++) {
            await act(async () => { jest.advanceTimersByTime(100); });
            await h.water(10.2 + i * 0.32);
            await act(async () => { jest.advanceTimersByTime(50); });
        }

        expect(result.current.holding).toBe(false);
    });

    it("does not call the planned rest a hold", async () => {
        // This is the device defect from #87. Stage 1 wants 40 ml and has had
        // them, so everything flat after that is the 20 s rest the recipe
        // asked for. The old rule reported HOLDING here and never took it
        // back.
        const h = harness();
        const {result} = await renderHook(() => useBrewRun(recipe(), h.store));
        await h.setPhase({name: "pouring", pour: 1, pours: 2});
        await h.water(10);
        await act(async () => { jest.advanceTimersByTime(250); });
        await h.water(50);
        await act(async () => { jest.advanceTimersByTime(250); });
        await act(async () => { jest.advanceTimersByTime(30_000); });
        await h.water(50.2);
        await act(async () => { jest.advanceTimersByTime(250); });

        expect(result.current.holding).toBe(false);
        expect(result.current.heldSeconds).toBe(0);
    });

    it("writes the brew to history when it ends", async () => {
        const h = harness();
        await renderHook(() => useBrewRun(recipe(), h.store));
        await h.setPhase({name: "pouring", pour: 1, pours: 2});
        await h.water(40);
        await h.setPhase({name: "done"});
        expect(h.written).toHaveLength(1);
        expect(h.written[0].record.recipeName).toBe("Ethiopia Guji");
        // A record with no samples is a chart with no line: the write has to
        // carry the brew, not just its name.
        expect(h.written[0].samples).toHaveLength(1);
        expect(h.written[0].samples[0].water).toBe(40);
    });

    it("writes no quick-edit keys when the brew was not adjusted", async () => {
        const h = harness();
        await renderHook(() => useBrewRun(recipe(), h.store));
        await h.setPhase({name: "pouring", pour: 1, pours: 2});
        await h.water(40);
        await h.setPhase({name: "done"});

        expect(h.written[0].record).not.toHaveProperty("adjustedFromDose");
        expect(h.written[0].record).not.toHaveProperty("adjustedFromRatio");
        expect(h.written[0].record).not.toHaveProperty("adjustedFromGrind");
        expect(h.written[0].record).not.toHaveProperty("adjustedTempOffset");
    });

    it("writes the saved values a quick edit moved away from", async () => {
        const h = harness();
        const saved = recipe();
        saved.dosage = 18;
        saved.ratio = 16;
        saved.grindSize = 62;
        const adjustments = {dose: 20, ratio: 18, grind: 68, tempOffset: 2};
        const brewed = applyQuickEdit(saved, adjustments);
        await renderHook(() =>
            useBrewRun(brewed, h.store, 0, quickEditRecordAdjustments(saved, adjustments))
        );
        await h.setPhase({name: "pouring", pour: 1, pours: 2});
        await h.water(40);
        await h.setPhase({name: "done"});

        expect(h.written[0].record).toMatchObject({
            dose: 20,
            ratio: 18,
            grindSize: 68,
            adjustedFromDose: 18,
            adjustedFromRatio: 16,
            adjustedFromGrind: 62,
            adjustedTempOffset: 2
        });
    });

    it("reads the machine's dial after the brew and keeps it", async () => {
        // The dial is an override the app is never told about, so the reading
        // that answers the question is the one taken after the grind. The
        // record is written first and this lands as an update to that row.
        const h = harness();
        await renderHook(() => useBrewRun(recipe(), h.store));
        await h.setPhase({name: "sending"});
        await h.setPhase({name: "pouring", pour: 1, pours: 2});
        await h.water(40);
        await h.setPhase({name: "done"});
        await act(async () => {});
        expect(h.dials).toEqual([[h.written[0].record.id, 52]]);
    });

    it("keeps no reading when the machine did not answer after the brew", async () => {
        // `info` still holds the pre-brew value, which is the number the whole
        // path exists to avoid recording.
        const h = harness();
        h.vitals.answers = false;
        await renderHook(() => useBrewRun(recipe(), h.store));
        await h.setPhase({name: "pouring", pour: 1, pours: 2});
        await h.water(40);
        await h.setPhase({name: "done"});
        await act(async () => {});
        expect(h.written).toHaveLength(1);
        expect(h.dials).toEqual([]);
    });

    it("does not beep a brew that never got past the grind", async () => {
        const h = harness();
        await renderHook(() => useBrewRun(recipe(), h.store));
        await h.setPhase({name: "sending"});
        await h.setPhase({name: "cancelled"});
        await act(async () => {});
        expect(h.written).toHaveLength(1);
        expect(h.vitals.asked).toBe(0);
        expect(h.dials).toEqual([]);
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

    it("uses the current recipe even if it changed before the brew started", async () => {
        // Guards against the stale-ref bug: without a ref-update effect,
        // recipeRef.current stays at the hook's initial value. A recipe change
        // followed by a machine reconnect (which restarts the recorder) would
        // make the recorder use a stale recipe and name the wrong brew.
        const h = harness();
        const first = recipe();
        first.name = "Old Recipe";
        const {rerender} = await renderHook(
            ({r}: {r: Recipe}) => useBrewRun(r, h.store),
            {initialProps: {r: first}}
        );

        // Recipe changes before any brew has started.
        const second = recipe();
        second.name = "New Recipe";
        await act(async () => { rerender({r: second}); });

        // Machine reconnects: calling harness() replaces global.__brewer with a
        // new machine object. On rerender, the hook sees a new machine identity
        // and restarts the recorder. The recorder must use the updated recipe.
        // (The store stays bound to h.store set on initial render.)
        const h2 = harness();
        await act(async () => { rerender({r: second}); });

        await h2.setPhase({name: "pouring", pour: 1, pours: 2});
        await h2.water(40);
        await h2.setPhase({name: "done"});
        expect(h.written).toHaveLength(1);
        expect(h.written[0].record.recipeName).toBe("New Recipe");
    });
    it("shows a run as waking until it hears a phase of its own", async () => {
        // The machine is sitting in the phase the *last* brew left it in. This
        // run is app-started, so nothing the machine said before it began
        // belongs to it -- a leftover non-terminal phase must not leak through.
        const h = harness();
        global.__brewer.machine.phase = {name: "grinding"};
        const {result} = await renderHook(() => useBrewRun(recipe(), h.store));

        expect(result.current.phase).toEqual({name: "waking"});
    });

    it("adopts the machine's phase for a brew it did not start", async () => {
        // Play pressed on the machine: there is no app-side send, and the
        // machine's phase is the only truth there is. The app joins in progress.
        const h = harness();
        global.__brewer.machine.phase = {name: "grinding"};
        const {result} = await renderHook(() => useBrewRun(null, h.store));

        expect(result.current.phase).toEqual({name: "grinding"});
    });

    it("publishes no bypass for a recipe without one", async () => {
        const h = harness();
        const {result} = await renderHook(() => useBrewRun(recipe(), h.store));
        expect(result.current.bypass).toBeUndefined();
    });

    it("publishes a pending bypass before the brew reaches it", async () => {
        const h = harness();
        const r = recipe();
        r.bypassEnabled = true;
        r.bypassVolume = 5;
        r.bypassTemp = 85;

        const {result} = await renderHook(() => useBrewRun(r, h.store));
        expect(result.current.bypass).toEqual({
            volume: 5, temperature: 85, delivered: 0,
            startedAt: null, state: "pending"
        });
    });

    it("forgets the old machine's phase when a new one arrives", async () => {
        // A reconnect hands us a fresh machine with a fresh recorder. The phase
        // the previous one was left in describes a brew that is no longer ours,
        // and taking it at face value would report a live stage against an
        // empty recorder.
        const h = harness();
        const {result, rerender} = await renderHook(() => useBrewRun(recipe(), h.store));
        await h.setPhase({name: "pouring", pour: 2, pours: 2});
        expect(result.current.activeIndex).toBe(1);

        harness();
        await act(async () => { rerender(undefined); });
        expect(result.current.activeIndex).toBeNull();
    });

});

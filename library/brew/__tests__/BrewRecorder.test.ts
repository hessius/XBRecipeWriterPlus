import BrewRecorder, {type RecorderMachine} from "@/library/brew/BrewRecorder";
import type {BrewRecord, BrewSample} from "@/library/brew/BrewRecord";
import type {BrewPhase} from "@/library/machine/Machine";
import type {Notification} from "@/library/machine/protocol";
import Pour from "@/library/Pour";
import Recipe from "@/library/Recipe";

/** A machine that says only what a test tells it to. */
function fakeMachine() {
    let notify: (n: Notification) => void = () => {};
    let phase: (p: BrewPhase) => void = () => {};
    const machine: RecorderMachine = {
        onNotification: (l) => { notify = l; return () => { notify = () => {}; }; },
        onPhase: (l) => { phase = l; return () => { phase = () => {}; }; }
    };
    return {
        machine,
        water: (grams: number) => notify({kind: "waterWeight", grams}),
        cup: (grams: number) => notify({kind: "cupWeight", grams}),
        phase: (p: BrewPhase) => phase(p)
    };
}

function recipe(): Recipe {
    const r = new Recipe();
    r.name = "Ethiopia Guji";
    r.pours = [new Pour(1, 40, 93, 40, 0, 0, 20), new Pour(2, 160, 92, 40, 0, 0, 0)];
    return r;
}

/** A clock the test advances by hand. */
function clock(start = 1_000_000) {
    let at = start;
    return {now: () => at, advance: (ms: number) => { at += ms; }};
}

function build(overrides: Partial<{onRecord: (r: BrewRecord, s: BrewSample[]) => void}> = {}) {
    const fake = fakeMachine();
    const time = clock();
    const records: {record: BrewRecord; samples: BrewSample[]}[] = [];
    const recorder = new BrewRecorder({
        machine: fake.machine,
        recipe: recipe(),
        now: time.now,
        newId: () => "brew-1",
        onRecord: overrides.onRecord ?? ((record, samples) => records.push({record, samples}))
    });
    recorder.start();
    built.push(recorder);
    return {fake, time, records, recorder};
}

/** Every recorder built in a test, so the settle cap timer cannot outlive it. */
const built: BrewRecorder[] = [];
afterEach(() => {
    built.splice(0).forEach((recorder) => recorder.stop());
});

describe("BrewRecorder", () => {
    it("ignores weights that arrive before the first pour", () => {
        // The machine chatters while it grinds. None of it belongs on a plan
        // whose axis starts at the first drop.
        const {fake, recorder} = build();
        fake.phase({name: "grinding"});
        fake.water(0);
        expect(recorder.samples).toHaveLength(0);
    });

    it("times samples from the first pour, not from the press", () => {
        const {fake, time, recorder} = build();
        time.advance(30_000);              // a long grind
        fake.phase({name: "pouring", pour: 1, pours: 2});
        time.advance(5_000);
        fake.cup(4);
        fake.water(20);
        expect(recorder.samples).toEqual([{at: 5000, water: 20, cup: 4, pour: 1}]);
    });

    it("samples on water and carries the last cup weight through", () => {
        // Both channels arrive at about 10 Hz. Sampling on both would double
        // the stream for a second copy of the same instant.
        const {fake, recorder} = build();
        fake.phase({name: "pouring", pour: 1, pours: 2});
        fake.cup(4);
        fake.water(20);
        fake.water(24);
        expect(recorder.samples.map((s) => [s.water, s.cup])).toEqual([[20, 4], [24, 4]]);
    });

    it("records the pour that was running", () => {
        const {fake, recorder} = build();
        fake.phase({name: "pouring", pour: 1, pours: 2});
        fake.water(40);
        fake.phase({name: "pouring", pour: 2, pours: 2});
        fake.water(90);
        expect(recorder.samples.map((s) => s.pour)).toEqual([1, 2]);
    });

    it("emits a record when the brew finishes", () => {
        const {fake, time, records} = build();
        fake.phase({name: "pouring", pour: 1, pours: 2});
        time.advance(200_000);
        fake.cup(244);
        fake.water(250);
        fake.phase({name: "done"});

        expect(records).toHaveLength(1);
        expect(records[0].record).toMatchObject({
            id: "brew-1",
            recipeName: "Ethiopia Guji",
            outcome: "done",
            failure: null,
            pours: 2,
            waterTotal: 250,
            cupTotal: 244
        });
        expect(records[0].samples).toHaveLength(1);
    });

    it("keeps sampling through settling instead of stopping at the pour's end", () => {
        // The heart of the change. `done` is still terminal — this proves the
        // *new* non-terminal phase in between keeps the recorder alive so the
        // drawdown is captured, where BREWER_STOP used to end it outright.
        const {fake, recorder} = build();
        fake.phase({name: "pouring", pour: 1, pours: 2});
        fake.water(200);
        fake.phase({name: "settling"});
        fake.water(205);
        expect(recorder.samples).toHaveLength(2);
        expect(recorder.samples[1]).toMatchObject({water: 205});
    });

    it("records the drawdown from the cup channel when the water stream has stopped", () => {
        // The hardware unknown: the machine may stop the water stream at
        // BREWER_STOP. If it does, the drawdown reaches the record only through
        // the cup channel. A recorder that sampled on water alone would show a
        // flat, empty settle that looked exactly like success — so cup frames
        // must advance the record too, carrying the last (static) water value.
        const {fake, recorder} = build();
        fake.phase({name: "pouring", pour: 1, pours: 2});
        fake.water(200);
        // Not one more water frame arrives; only the cup keeps reporting.
        fake.phase({name: "settling"});
        fake.cup(230);
        fake.cup(240);
        expect(recorder.samples).toHaveLength(3);
        expect(recorder.samples[2]).toMatchObject({water: 200, cup: 240});
    });

    it("ends settling when the cup line has been flat long enough", () => {
        const {fake, time, records} = build();
        fake.phase({name: "pouring", pour: 1, pours: 2});
        fake.water(200);
        fake.cup(240);
        fake.phase({name: "settling"});
        // A wobble under the noise floor is not a rise, and 3.9 s of flat is
        // not yet long enough.
        time.advance(3900);
        fake.cup(240.3);
        expect(records).toHaveLength(0);
        // Crossing 4000 ms (SETTLE_FLAT_MS) of no meaningful rise ends it. The
        // 4000 is pinned to the literal, not the constant, so mutating the
        // constant to zero cannot make this pass for the wrong reason.
        time.advance(100);
        fake.cup(240);
        expect(records).toHaveLength(1);
        expect(records[0].record.outcome).toBe("done");
    });

    it("keeps waiting while the cup is still filling", () => {
        // Each meaningful rise resets the flat window: a brew that drips slowly
        // for longer than SETTLE_FLAT_MS must not be cut short.
        const {fake, time, records} = build();
        fake.phase({name: "pouring", pour: 1, pours: 2});
        fake.water(200);
        fake.cup(240);
        fake.phase({name: "settling"});
        for (let i = 0; i < 6; i++) {
            time.advance(3000);
            fake.cup(241 + i);           // a 1 g rise each time, above 0.5
        }
        expect(records).toHaveLength(0);
    });

    it("does not read scale jitter on a plateau as the cup being lifted", () => {
        // The regression test for the ratcheting-peak bug. `settlePeak` is a
        // running maximum, so a plateau that jitters within ±0.3 g produces a
        // ~0.6 g peak-to-trough swing. Measured against the 0.5 ml noise floor
        // that ends the brew early and non-deterministically — the very
        // truncation settling exists to prevent. Against LIFT_DROP_G it does
        // not. The clock barely advances, so the flat window cannot end it
        // either: if the record appears, it is the lift misfiring.
        const {fake, time, records} = build();
        fake.phase({name: "pouring", pour: 1, pours: 2});
        fake.water(200);
        fake.cup(240);
        fake.phase({name: "settling"});
        const jitter = [240.3, 239.8, 240.2, 239.7, 240.3, 239.9, 240.1, 239.8, 240.2];
        for (const g of jitter) {
            time.advance(200);           // ~1.8 s total, well under SETTLE_FLAT_MS
            fake.cup(g);
        }
        expect(records).toHaveLength(0);
    });

    it("ends settling immediately when the cup is lifted off the scale", () => {
        const {fake, records} = build();
        fake.phase({name: "pouring", pour: 1, pours: 2});
        fake.water(200);
        fake.cup(240);
        fake.phase({name: "settling"});
        // A 9 g fall is still short of the lift threshold: nothing ends.
        fake.cup(231);
        expect(records).toHaveLength(0);
        // A fall of more than 10 g (LIFT_DROP_G) from the peak is the cup being
        // lifted. Pinned to the literal, not the constant.
        fake.cup(229);
        expect(records).toHaveLength(1);
        expect(records[0].record.outcome).toBe("done");
    });

    it("ends settling on ENJOY_2 (the done phase)", () => {
        const {fake, records} = build();
        fake.phase({name: "pouring", pour: 1, pours: 2});
        fake.water(200);
        fake.cup(240);
        fake.phase({name: "settling"});
        fake.water(210);
        fake.phase({name: "done"});
        expect(records).toHaveLength(1);
        expect(records[0].record).toMatchObject({outcome: "done", waterTotal: 210});
    });

    it("force-ends a settle that never flattens, even with no frames at all", () => {
        // The cap is the backstop for a machine that never sends another frame
        // after the pour. Fake timers so a broken cap fails fast rather than
        // hanging for real seconds.
        jest.useFakeTimers();
        try {
            const {fake, records} = build();
            fake.phase({name: "pouring", pour: 1, pours: 2});
            fake.water(200);
            fake.phase({name: "settling"});
            // Just short of the 90 000 ms cap: nothing has ended it.
            jest.advanceTimersByTime(89_999);
            expect(records).toHaveLength(0);
            jest.advanceTimersByTime(1);
            expect(records).toHaveLength(1);
            expect(records[0].record.outcome).toBe("done");
        } finally {
            jest.useRealTimers();
        }
    });

    it("stamps endedAt at the settle's end, not at BREWER_STOP", () => {
        const {fake, time, records} = build();
        fake.phase({name: "pouring", pour: 1, pours: 2});
        fake.water(200);
        time.advance(1000);
        fake.phase({name: "settling"});
        const enteredSettling = time.now();
        time.advance(5000);
        fake.phase({name: "done"});
        expect(records[0].record.endedAt).toBe(enteredSettling + 5000);
        expect(records[0].record.endedAt).toBeGreaterThan(enteredSettling);
    });

    it("marks where the samples' zero is, so the record can draw them", () => {
        const {fake, time, records} = build();
        // Waking and grinding: real time passes before a drop falls.
        time.advance(45_000);
        fake.phase({name: "pouring", pour: 1, pours: 2});
        const firstDrop = time.now();
        time.advance(200_000);
        fake.water(250);
        fake.phase({name: "done"});

        const {record} = records[0];
        expect(record.pouringAt).toBe(firstDrop);
        // And it is not the start: measuring the plan from there would carry
        // the 45 seconds of grinding into an axis the trace knows nothing of.
        expect(record.startedAt).toBeLessThan(firstDrop);
    });

    it("leaves the zero at nothing when the brew never poured", () => {
        const {fake, records} = build();
        fake.phase({name: "failed", reason: "noBeans"});
        expect(records[0].record.pouringAt).toBe(0);
    });

    it("keeps the reason on a failed brew", () => {
        const {fake, records} = build();
        fake.phase({name: "pouring", pour: 1, pours: 2});
        fake.water(40);
        fake.phase({name: "failed", reason: "noWater"});
        expect(records[0].record).toMatchObject({outcome: "failed", failure: "noWater"});
    });

    it("writes no record when the brew was refused before it began", () => {
        // Nothing was sent and no dose was spent. A row saying a brew happened
        // would be a lie, and it would sit at the top of the history.
        const {fake, records} = build();
        fake.phase({name: "failed", reason: "blocked", detail: "The tank is low."});
        expect(records).toHaveLength(0);
    });

    it("records a brew that lost contact, at the limit of what was seen", () => {
        const {fake, records} = build();
        fake.phase({name: "pouring", pour: 1, pours: 2});
        fake.water(40);
        fake.phase({name: "lostContact"});
        expect(records[0].record).toMatchObject({outcome: "lostContact", waterTotal: 40});
    });

    it("emits once, however many terminal phases arrive", () => {
        // `cancelled` is routinely followed by `idle`, and a machine that drops
        // mid-cancel can produce both. Two rows for one brew is a bug a user
        // would see.
        const {fake, records} = build();
        fake.phase({name: "pouring", pour: 1, pours: 2});
        fake.water(40);
        fake.phase({name: "cancelled"});
        fake.phase({name: "done"});
        expect(records).toHaveLength(1);
    });

    it("stops listening once stopped, and emits nothing", () => {
        const {fake, records, recorder} = build();
        recorder.stop();
        fake.phase({name: "pouring", pour: 1, pours: 2});
        fake.water(40);
        fake.phase({name: "done"});
        expect(recorder.samples).toHaveLength(0);
        expect(records).toHaveLength(0);
    });

    it("counts the overrun as held time", () => {
        // The plan is 70 s: 40 ml at 4 ml/s, a 20 s pause, then 160 ml at 4.
        const {fake, time, records} = build();
        fake.phase({name: "pouring", pour: 1, pours: 2});
        time.advance(84_000);
        fake.water(200);
        fake.phase({name: "done"});
        expect(records[0].record.heldSeconds).toBe(14);
    });

    it("starting twice does not wire the recorder twice", () => {
        // A fake that replaces its listener on each subscription cannot
        // reproduce the leak this test exists to catch: the second start()
        // would silently overwrite the first reference and the double call
        // would never be detectable. The accumulating fake below mirrors how a
        // real machine works — every onNotification/onPhase call appends a
        // listener, and emitting calls all of them.
        const notifyListeners: ((n: Notification) => void)[] = [];
        const phaseListeners: ((p: BrewPhase) => void)[] = [];
        const accumulatingMachine: RecorderMachine = {
            onNotification: (l) => {
                notifyListeners.push(l);
                return () => { const i = notifyListeners.indexOf(l); if (i !== -1) notifyListeners.splice(i, 1); };
            },
            onPhase: (l) => {
                phaseListeners.push(l);
                return () => { const i = phaseListeners.indexOf(l); if (i !== -1) phaseListeners.splice(i, 1); };
            }
        };
        const emitPhase = (p: BrewPhase) => [...phaseListeners].forEach((l) => l(p));
        const emitNotify = (n: Notification) => [...notifyListeners].forEach((l) => l(n));

        const time = clock();
        const recorder = new BrewRecorder({
            machine: accumulatingMachine,
            recipe: recipe(),
            now: time.now,
            newId: () => "brew-double",
            onRecord: () => {}
        });

        recorder.start();
        recorder.start(); // second start — must detach the first pair first

        emitPhase({name: "pouring", pour: 1, pours: 2});
        emitNotify({kind: "waterWeight", grams: 42});

        expect(recorder.samples).toHaveLength(1);
    });

    it("ignores telemetry that arrives after the record was emitted", () => {
        // Capture the notification listener before stop() wipes it, so we can
        // deliver a late notification directly to the originally-registered
        // handler even after the recorder has unsubscribed.
        let capturedNotify: (n: import("@/library/machine/protocol").Notification) => void = () => {};
        const fake = fakeMachine();
        const time = clock();
        const records: {record: BrewRecord; samples: BrewSample[]}[] = [];
        // Wrap onNotification so we keep the raw listener reference.
        const wrappedMachine: RecorderMachine = {
            onNotification: (l) => {
                capturedNotify = l;
                return fake.machine.onNotification(l);
            },
            onPhase: (l) => fake.machine.onPhase(l)
        };
        const recorder = new BrewRecorder({
            machine: wrappedMachine,
            recipe: recipe(),
            now: time.now,
            newId: () => "brew-2",
            onRecord: (record, samples) => records.push({record, samples})
        });
        recorder.start();

        fake.phase({name: "pouring", pour: 1, pours: 2});
        fake.water(40);
        // Terminal phase triggers emit + stop.
        fake.phase({name: "done"});

        const lengthAfterEmit = records[0].samples.length;

        // Deliver a notification directly through the captured listener —
        // stop() has already detached the machine's reference, so this tests
        // only the `emitted` guard inside receive().
        capturedNotify({kind: "waterWeight", grams: 999});

        expect(recorder.samples).toHaveLength(lengthAfterEmit);
    });
    it("does not let a failed write escape back into the machine's listeners", () => {
        // The recorder is one of several listeners the machine calls in turn.
        // A throw here would stop that loop, and the listeners behind it —
        // the ones that move the screen off "pouring" and clear its sampling
        // timer — would never hear that the brew had ended.
        const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
        const {fake} = build({
            onRecord: () => { throw new Error("database is locked"); }
        });

        fake.phase({name: "pouring", pour: 1, pours: 2});
        fake.water(40);

        expect(() => fake.phase({name: "done"})).not.toThrow();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it("keeps the plan it was started from", () => {
        const {fake, records} = build();
        fake.phase({name: "pouring", pour: 1, pours: 2});
        fake.water(40);
        fake.phase({name: "done"});

        const [{record}] = records;
        expect(record.plan).toHaveLength(2);
        expect(record.plan?.[0].volume).toBe(40);
        expect(record.plan?.[1].volume).toBe(160);
        // A structural copy, not the Pour objects: this goes through JSON.
        expect(record.plan?.[0]).not.toBeInstanceOf(Pour);
    });

    it("keeps what each stage actually poured", () => {
        const {fake, records} = build();
        fake.phase({name: "pouring", pour: 1, pours: 2});
        fake.water(40);
        fake.phase({name: "pouring", pour: 2, pours: 2});
        fake.water(150);
        fake.phase({name: "done"});

        // Cumulative in the stream, per stage on the record.
        expect(records[0].record.stageWater).toEqual([40, 110]);
    });

    it("gives a stage that never ran nothing at all", () => {
        // The failure this is for: a brew that stopped in stage 1 of 2 must
        // not say stage 2 poured.
        const {fake, records} = build();
        fake.phase({name: "pouring", pour: 1, pours: 2});
        fake.water(25);
        fake.phase({name: "failed", reason: "noWater"});

        // Two entries for two planned stages, so the ladder always gets a full
        // set -- the trailing 0 is the assertion, not the 25.
        expect(records[0].record.stageWater).toEqual([25, 0]);
    });
});

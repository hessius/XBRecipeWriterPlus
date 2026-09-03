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
    return {fake, time, records, recorder};
}

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
});

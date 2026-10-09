import {PAUSE_ACK_MS} from "@/constants/machine";
import type {BrewPhase} from "@/library/machine/Machine";
import {OverflowController, type OverflowSnapshot} from "../OverflowController";
import type {OverflowProtection} from "../overflowConfig";

const pouring: BrewPhase = {name: "pouring", pour: 1, pours: 2};
const paused: BrewPhase = {
    name: "paused", pour: 1, pours: 2, was: pouring, pauseKind: "overflow"
};

function deferred() {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    return {promise, resolve, reject};
}

function harness(config: OverflowProtection = {retainedGrams: 100, checkSeconds: 15}) {
    let now = 1000;
    const pause = jest.fn(async () => {});
    const resume = jest.fn(async () => {});
    const changes: OverflowSnapshot[] = [];
    const controller = new OverflowController({
        config, commands: {pause, resume}, now: () => now,
        onChange: snapshot => changes.push(snapshot)
    });
    controller.phase(pouring);
    const time = (at: number) => { now = at; };
    const pair = (at: number, water = 200, cup = 80, cupFirst = false) => {
        time(at);
        const readings = [
            {kind: "waterWeight", grams: water} as const,
            {kind: "cupWeight", grams: cup} as const
        ];
        if (cupFirst) readings.reverse();
        readings.forEach(reading => controller.notification(reading));
    };
    const request = () => { pair(1000); pair(1500); };
    const hold = () => { request(); time(1700); controller.phase(paused); };
    const low = () => { pair(16000, 200, 150); pair(16500, 200, 150); time(16700); };
    return {controller, pause, resume, changes, time, pair, request, hold, low};
}

describe("OverflowController", () => {
    it.each([false, true])("requests exactly one pause with either channel order (%s)", async cupFirst => {
        const h = harness();
        h.pair(1000, 200, 80, cupFirst);
        h.time(1499);
        h.controller.tick();
        expect(h.pause).not.toHaveBeenCalled();
        h.pair(1500, 200, 80, cupFirst);
        expect(h.controller.snapshot).toMatchObject({
            mode: "requesting", retainedGrams: 120, telemetryAvailable: true, nextCheckAt: null
        });
        expect(h.pause).toHaveBeenCalledTimes(1);
        await Promise.resolve();
        h.pair(1600);
        h.controller.tick();
        expect(h.pause).toHaveBeenCalledTimes(1);
        expect(h.controller.snapshot.mode).toBe("requesting");
    });

    it("waits for confirmation, then checks fresh sustained low at the fixed interval", async () => {
        const h = harness();
        h.hold();
        expect(h.controller.snapshot.nextCheckAt).toBe(16700);
        h.controller.phase(paused);
        expect(h.controller.snapshot.nextCheckAt).toBe(16700);
        h.low();
        h.resume.mockImplementationOnce(async () => {
            expect(h.controller.snapshot).toMatchObject({mode: "resuming", nextCheckAt: null});
        });
        h.controller.tick();
        expect(h.resume).toHaveBeenCalledTimes(1);
        await Promise.resolve();
        expect(h.controller.snapshot).toMatchObject({mode: "armed", nextCheckAt: null});
        h.controller.tick();
        expect(h.resume).toHaveBeenCalledTimes(1);
    });

    it("fails when a sent pause is never confirmed, without scheduling resume", () => {
        const h = harness();
        h.request();
        h.time(1500 + PAUSE_ACK_MS - 1);
        h.controller.tick();
        expect(h.controller.snapshot.mode).toBe("requesting");
        h.time(1500 + PAUSE_ACK_MS);
        h.controller.tick();
        expect(h.controller.snapshot).toMatchObject({
            mode: "error", nextCheckAt: null,
            error: "The machine did not confirm the protection pause."
        });
        h.controller.phase(paused);
        expect(h.controller.snapshot.mode).toBe("error");
        expect(h.resume).not.toHaveBeenCalled();
    });

    it.each(["requesting", "holding"] as const)("manual pause relinquishes %s before user action", async mode => {
        const h = harness();
        const pending = deferred();
        h.pause.mockReturnValueOnce(pending.promise);
        if (mode === "holding") h.hold(); else h.request();
        h.controller.manualPause();
        expect(h.controller.snapshot).toMatchObject({mode: "armed", nextCheckAt: null});
        h.time(1700);
        h.controller.phase(paused); // A late automatic ACK must not regain ownership.
        h.low();
        h.controller.tick();
        pending.reject(new Error("late write failure"));
        await Promise.resolve();
        expect(h.controller.snapshot.mode).toBe("armed");
        expect(h.resume).not.toHaveBeenCalled();
        h.pair(17000);
        h.pair(17500);
        expect(h.pause).toHaveBeenCalledTimes(1);
    });

    it("a pause without overflow provenance relinquishes a pending request", () => {
        const h = harness();
        h.request();
        h.controller.phase({...paused, pauseKind: undefined});
        expect(h.controller.snapshot).toMatchObject({mode: "armed", nextCheckAt: null});
        h.low();
        h.controller.tick();
        expect(h.resume).not.toHaveBeenCalled();
    });

    it("ordinary manual resume restores protection only after the pouring phase returns", () => {
        const h = harness();
        h.controller.manualPause();
        h.controller.phase({...paused, pauseKind: undefined});
        h.controller.manualResume();
        h.pair(2000);
        h.pair(2500);
        expect(h.pause).not.toHaveBeenCalled();
        h.controller.phase(pouring);
        h.pair(3000);
        h.pair(3500);
        expect(h.controller.snapshot.mode).toBe("requesting");
        expect(h.pause).toHaveBeenCalledTimes(1);
    });

    it.each(["requesting", "holding", "resuming"] as const)("manual resume disables automatic ownership in %s", async mode => {
        const h = harness();
        const pending = deferred();
        if (mode === "requesting") {
            h.pause.mockReturnValueOnce(pending.promise);
            h.request();
        } else {
            h.hold();
            if (mode === "resuming") {
                h.resume.mockReturnValueOnce(pending.promise);
                h.low();
                h.controller.tick();
            }
        }
        h.controller.manualResume();
        expect(h.controller.snapshot).toEqual({
            mode: "disabled", disabledReason: "manualOverride",
            retainedGrams: null, telemetryAvailable: false, nextCheckAt: null
        });
        const publications = h.changes.length;
        pending.resolve();
        await Promise.resolve();
        h.controller.phase(pouring);
        h.pair(18000);
        h.pair(18500);
        h.controller.tick();
        expect(h.changes).toHaveLength(publications);
        expect(h.pause).toHaveBeenCalledTimes(1);
        expect(h.controller.snapshot.mode).toBe("disabled");
    });

    it.each(["background", "lostContact"] as const)("disables permanently on %s and ignores late writes", async reason => {
        for (const operation of ["pause", "resume"] as const) {
            const h = harness();
            const pending = deferred();
            h[operation].mockReturnValueOnce(pending.promise);
            if (operation === "pause") h.request();
            else { h.hold(); h.low(); h.controller.tick(); }
            if (reason === "background") h.controller.background();
            else h.controller.phase({name: "lostContact"});
            expect(h.controller.snapshot).toEqual({
                mode: "disabled", disabledReason: reason,
                retainedGrams: null, telemetryAvailable: false, nextCheckAt: null
            });
            const publications = h.changes.length;
            pending.resolve();
            await Promise.resolve();
            h.controller.phase(pouring);
            h.request();
            h.controller.tick();
            h.controller.manualResume();
            expect(h.changes).toHaveLength(publications);
            expect(h.controller.snapshot.disabledReason).toBe(reason);
        }
    });

    it.each(["done", "cancelled", "failed", "cancel", "dispose"] as const)("ends on %s and invalidates all subsequent work", async ending => {
        const h = harness();
        const pending = deferred();
        h.resume.mockReturnValueOnce(pending.promise);
        h.hold();
        h.low();
        h.controller.tick();
        const before = h.changes.length;
        if (ending === "cancel") h.controller.cancel();
        else if (ending === "dispose") h.controller.dispose();
        else if (ending === "failed") h.controller.phase({name: "failed", reason: "noWater"});
        else h.controller.phase({name: ending});
        expect(h.controller.snapshot).toEqual({
            mode: "ended", retainedGrams: null, nextCheckAt: null, telemetryAvailable: false
        });
        if (ending === "dispose") expect(h.changes).toHaveLength(before);
        const publications = h.changes.length;
        pending.reject(new Error("late resume failure"));
        await Promise.resolve();
        h.controller.phase(pouring);
        h.request();
        h.controller.tick();
        h.controller.background();
        h.controller.manualPause();
        h.controller.manualResume();
        h.controller.cancel();
        h.controller.dispose();
        expect(h.changes).toHaveLength(publications);
        expect(h.pause).toHaveBeenCalledTimes(1);
        expect(h.resume).toHaveBeenCalledTimes(1);
    });

    it.each(["pause", "resume"] as const)("surfaces an actionable %s write failure and clears deadlines", async operation => {
        const h = harness();
        h[operation].mockRejectedValueOnce(new Error("transport refused"));
        if (operation === "pause") h.request();
        else { h.hold(); h.low(); h.controller.tick(); }
        await Promise.resolve();
        expect(h.controller.snapshot).toMatchObject({
            mode: "error", nextCheckAt: null,
            error: operation === "pause"
                ? "Could not pause the brew for protection. Pause the machine manually."
                : "Could not resume the brew after protection. Resume the machine manually."
        });
        h.controller.phase(pouring);
        h.pair(18000);
        h.pair(18500);
        h.controller.tick();
        expect(h[operation]).toHaveBeenCalledTimes(1);
    });

    it.each([{name: "bypass"}, {name: "settling"}, {name: "grinding"}] as const)(
        "invalidates a requested pause when the phase becomes $name", phase => {
            const h = harness();
            h.request();
            h.controller.phase(phase);
            h.controller.phase(paused);
            h.low();
            h.controller.tick();
            expect(h.controller.snapshot).toMatchObject({mode: "armed", nextCheckAt: null});
            expect(h.resume).not.toHaveBeenCalled();
        }
    );

    it.each([15, 30, 45] as const)("uses an immutable %i-second interval and explicit limit", seconds => {
        const config: OverflowProtection = {retainedGrams: 100, checkSeconds: seconds};
        const h = harness(config);
        config.retainedGrams = 999;
        config.checkSeconds = seconds === 15 ? 45 : 15;
        h.hold();
        const due = 1700 + seconds * 1000;
        expect(h.controller.snapshot.nextCheckAt).toBe(due);
        h.pair(due - 700, 200, 100); // Equality is not below.
        h.pair(due - 200, 200, 100);
        h.time(due + 100); // A delayed check starts one interval from now, not from the old deadline.
        h.controller.tick();
        expect(h.controller.snapshot).toMatchObject({mode: "holding", nextCheckAt: due + 100 + seconds * 1000});
        h.controller.tick();
        expect(h.pause).toHaveBeenCalledTimes(1);
        expect(h.resume).not.toHaveBeenCalled();
    });

    it.each(["high", "singleLow", "stale", "missing", "skew"] as const)("extends a due check with %s telemetry", condition => {
        const h = harness();
        h.hold();
        if (condition === "high") { h.pair(16000); h.pair(16500); }
        if (condition === "singleLow") h.pair(16500, 200, 150);
        if (condition === "stale") { h.pair(15199, 200, 150); h.pair(15699, 200, 150); }
        if (condition === "missing") {
            h.time(16500);
            h.controller.notification({kind: "waterWeight", grams: 200});
        }
        if (condition === "skew") {
            h.pair(16000, 200, 150);
            h.time(16500);
            h.controller.notification({kind: "cupWeight", grams: 150});
        }
        h.time(16700);
        h.controller.tick();
        expect(h.controller.snapshot).toMatchObject({mode: "holding", nextCheckAt: 31700});
        expect(h.resume).not.toHaveBeenCalled();
        expect(h.pause).toHaveBeenCalledTimes(1);
    });

    it("checks the latest high value even when its paired timestamp duplicates sustained low", () => {
        const h = harness();
        h.hold();
        h.pair(16000, 200, 150);
        h.pair(16500, 200, 150);
        h.time(16600);
        h.controller.notification({kind: "waterWeight", grams: 260}); // pair.at remains 16500.
        expect(h.controller.snapshot.retainedGrams).toBe(110);
        h.time(16700);
        h.controller.tick();
        expect(h.resume).not.toHaveBeenCalled();
        expect(h.controller.snapshot.nextCheckAt).toBe(31700);
    });

    it("a contradictory duplicate breaks low evidence before a newer low returns", () => {
        const h = harness();
        h.hold();
        h.pair(16000, 200, 150);
        h.pair(16500, 200, 150);
        h.time(16600);
        h.controller.notification({kind: "waterWeight", grams: 260});
        h.pair(16700, 200, 150);
        h.controller.tick();
        expect(h.resume).not.toHaveBeenCalled();
        expect(h.controller.snapshot.nextCheckAt).toBe(31700);
    });

    it("does not carry low evidence across an unobserved data gap", () => {
        const h = harness();
        h.hold();
        h.pair(14500, 200, 150);
        h.pair(15000, 200, 150);
        h.pair(16500, 200, 150);
        h.time(16700);
        h.controller.tick();
        expect(h.resume).not.toHaveBeenCalled();
    });

    it.each([false, true])("does not sustain high across a 1001ms gap (tick=%s)", tick => {
        const h = harness();
        h.pair(1000);
        h.time(2001);
        if (tick) h.controller.tick();
        h.pair(2001);
        expect(h.pause).not.toHaveBeenCalled();
        h.pair(2501);
        expect(h.pause).toHaveBeenCalledTimes(1);
    });

    it("accepts 1000ms freshness inclusively but never grows evidence by polling", () => {
        const h = harness();
        h.pair(1000);
        h.time(2000);
        h.controller.tick();
        expect(h.controller.snapshot.telemetryAvailable).toBe(true);
        expect(h.pause).not.toHaveBeenCalled();
        h.time(2001);
        h.controller.tick();
        expect(h.controller.snapshot).toMatchObject({retainedGrams: null, telemetryAvailable: false});
        h.pair(2001);
        expect(h.pause).not.toHaveBeenCalled();
        h.pair(2501, 200, 100); // Equality counts as high.
        expect(h.pause).toHaveBeenCalledTimes(1);
    });

    it.each([250, 251])("bounds intermediate paired skew at %ims in both channel orders", skew => {
        for (const cupFirst of [false, true]) {
            const h = harness();
            const first = cupFirst ? "cupWeight" : "waterWeight";
            const second = cupFirst ? "waterWeight" : "cupWeight";
            const grams = (kind: string) => kind === "cupWeight" ? 80 : 200;
            h.controller.notification({kind: first, grams: grams(first)});
            h.time(1000 + skew);
            h.controller.notification({kind: second, grams: grams(second)});
            expect(h.controller.snapshot.telemetryAvailable).toBe(skew === 250);
            h.time(1500);
            h.controller.notification({kind: first, grams: grams(first)});
            expect(h.pause).not.toHaveBeenCalled(); // This intermediate pair is not a new 500ms span.
            h.time(1500 + skew);
            h.controller.notification({kind: second, grams: grams(second)});
            expect(h.pause).toHaveBeenCalledTimes(skew === 250 ? 1 : 0);
        }
    });

    it.each([NaN, Infinity, -1])("resets evidence on invalid grams (%s)", grams => {
        const h = harness();
        h.pair(1000);
        h.time(1100);
        h.controller.notification({kind: "cupWeight", grams});
        expect(h.controller.snapshot.telemetryAvailable).toBe(false);
        h.pair(1500);
        expect(h.pause).not.toHaveBeenCalled();
        h.pair(2000);
        expect(h.pause).toHaveBeenCalledTimes(1);
    });

    it("a missing channel cannot initiate a pause", () => {
        const h = harness();
        h.controller.notification({kind: "waterWeight", grams: 200});
        h.time(1500);
        h.controller.notification({kind: "waterWeight", grams: 200});
        h.controller.tick();
        expect(h.controller.snapshot).toMatchObject({mode: "armed", retainedGrams: null, telemetryAvailable: false});
        expect(h.pause).not.toHaveBeenCalled();
    });

    it.each([
        {name: "bypass"}, {name: "settling"}, {name: "grinding"},
        {name: "pouring", pour: 0, pours: 2}, {name: "pouring", pour: 3, pours: 2}
    ] as const)("does not initiate in an ineligible phase ($name, $pour)", phase => {
        const h = harness();
        h.controller.phase(phase);
        h.pair(1000, 1000, 0);
        h.pair(1500, 1000, 0);
        h.controller.tick();
        expect(h.pause).not.toHaveBeenCalled();
        h.controller.phase(pouring);
        h.pair(1700);
        expect(h.pause).not.toHaveBeenCalled();
        h.pair(2200);
        expect(h.pause).toHaveBeenCalledTimes(1);
    });

    it("resets evidence between brew stages but not for duplicate phase notifications", () => {
        const h = harness();
        h.pair(1000);
        h.controller.phase({name: "pouring", pour: 2, pours: 2});
        h.pair(1500);
        expect(h.pause).not.toHaveBeenCalled();
        h.controller.phase({name: "pouring", pour: 2, pours: 2});
        h.pair(2000);
        expect(h.pause).toHaveBeenCalledTimes(1);
    });

    it("stops initiating once the final stage transitions to settling", () => {
        const h = harness();
        h.controller.phase({name: "pouring", pour: 2, pours: 2});
        h.pair(1000);
        h.controller.phase({name: "settling"});
        h.pair(1500);
        h.pair(2000);
        expect(h.pause).not.toHaveBeenCalled();
        expect(h.controller.snapshot.mode).toBe("armed"); // Settling is not terminal.
        h.controller.phase({name: "done"});
        expect(h.controller.snapshot.mode).toBe("ended");
    });

    it("does not accept a confirmation after the ACK deadline even without a tick", () => {
        const h = harness();
        h.request();
        h.time(1500 + PAUSE_ACK_MS);
        h.controller.phase(paused);
        expect(h.controller.snapshot).toMatchObject({
            mode: "error", nextCheckAt: null,
            error: "The machine did not confirm the protection pause."
        });
    });

    it("throttles telemetry publication to 250ms while publishing mode changes immediately", () => {
        const h = harness();
        h.pair(1000);
        const initial = h.changes.length;
        h.pair(1100, 200, 90);
        h.pair(1249, 200, 95);
        expect(h.changes).toHaveLength(initial);
        expect(h.controller.snapshot.retainedGrams).toBe(105);
        h.pair(1250, 200, 96);
        expect(h.changes).toHaveLength(initial + 1);
        h.controller.background();
        expect(h.changes.at(-1)?.mode).toBe("disabled");
        expect(h.changes).toHaveLength(initial + 2);
    });

    it("returns independent snapshots that cannot mutate the controller", () => {
        const h = harness();
        h.request();
        h.controller.snapshot.mode = "ended";
        h.changes.at(-1)!.mode = "ended";
        expect(h.controller.snapshot.mode).toBe("requesting");
    });

    it("does not count a duplicate paired timestamp as new evidence after a phase reset", () => {
        const h = harness();
        h.pair(1000);
        h.time(1100);
        h.controller.phase({name: "pouring", pour: 2, pours: 2});
        h.time(1200);
        h.controller.notification({kind: "waterWeight", grams: 200}); // Pair still belongs to 1000.
        h.pair(1500);
        expect(h.pause).not.toHaveBeenCalled();
        h.pair(2000);
        expect(h.pause).toHaveBeenCalledTimes(1);
    });

    it("never restores low evidence when a duplicate pair returns low after contradicting it", () => {
        const h = harness();
        h.hold();
        h.pair(16000, 200, 150);
        h.pair(16500, 200, 150);
        h.time(16600);
        h.controller.notification({kind: "waterWeight", grams: 260});
        h.time(16650);
        h.controller.notification({kind: "waterWeight", grams: 200}); // Pair.at is still 16500.
        h.pair(16700, 200, 150);
        h.controller.tick();
        expect(h.resume).not.toHaveBeenCalled();
    });

    it.each(["requesting", "resuming"] as const)("ignores a successful %s callback after cancel", async mode => {
        const h = harness();
        const pending = deferred();
        if (mode === "requesting") {
            h.pause.mockReturnValueOnce(pending.promise);
            h.request();
        } else {
            h.hold();
            h.resume.mockReturnValueOnce(pending.promise);
            h.low();
            h.controller.tick();
        }
        h.controller.cancel();
        const publications = h.changes.length;
        pending.resolve();
        await Promise.resolve();
        expect(h.controller.snapshot.mode).toBe("ended");
        expect(h.changes).toHaveLength(publications);
    });

    it("ignores a rejected pause after backgrounding", async () => {
        const h = harness();
        const pending = deferred();
        h.pause.mockReturnValueOnce(pending.promise);
        h.request();
        h.controller.background();
        const publications = h.changes.length;
        pending.reject(new Error("late failure"));
        await Promise.resolve();
        expect(h.controller.snapshot).toMatchObject({mode: "disabled", disabledReason: "background"});
        expect(h.changes).toHaveLength(publications);
    });

    it("manual pause invalidates an in-flight automatic resume", async () => {
        const h = harness();
        const pending = deferred();
        h.hold();
        h.resume.mockReturnValueOnce(pending.promise);
        h.low();
        h.controller.tick();
        h.controller.manualPause();
        pending.resolve();
        await Promise.resolve();
        expect(h.controller.snapshot).toMatchObject({mode: "armed", nextCheckAt: null});
        h.controller.phase(paused);
        h.pair(18000);
        h.pair(18500);
        expect(h.pause).toHaveBeenCalledTimes(1);
    });

    it("a stale callback cannot invalidate a newer automatic request", async () => {
        const h = harness();
        const old = deferred();
        h.pause.mockReturnValueOnce(old.promise);
        h.request();
        h.controller.manualPause();
        h.controller.phase({...paused, pauseKind: undefined});
        h.controller.manualResume();
        h.controller.phase(pouring);
        h.pair(2000);
        h.pair(2500);
        expect(h.pause).toHaveBeenCalledTimes(2);
        old.reject(new Error("obsolete request"));
        await Promise.resolve();
        expect(h.controller.snapshot.mode).toBe("requesting");
        h.time(2700);
        h.controller.phase(paused);
        expect(h.controller.snapshot).toMatchObject({mode: "holding", nextCheckAt: 17700});
    });

    it("releases automatic ownership when a holding machine unexpectedly resumes", () => {
        const h = harness();
        h.hold();
        h.controller.phase(pouring);
        expect(h.controller.snapshot).toMatchObject({
            mode: "disabled", disabledReason: "manualOverride", nextCheckAt: null
        });
        h.low();
        h.controller.tick();
        expect(h.resume).not.toHaveBeenCalled();
    });

    it("blocks a command if publication synchronously cancels the run", () => {
        const commands = {pause: jest.fn(async () => {}), resume: jest.fn(async () => {})};
        let now = 1000;
        const controller = new OverflowController({
            config: {retainedGrams: 100, checkSeconds: 15}, commands, now: () => now,
            onChange: snapshot => { if (snapshot.mode === "requesting") controller.cancel(); }
        });
        controller.phase(pouring);
        for (const at of [1000, 1500]) {
            now = at;
            controller.notification({kind: "waterWeight", grams: 200});
            controller.notification({kind: "cupWeight", grams: 80});
        }
        expect(commands.pause).not.toHaveBeenCalled();
        expect(controller.snapshot.mode).toBe("ended");
    });

    it.each(["pause", "resume"] as const)("surfaces a synchronous %s command throw", operation => {
        const h = harness();
        h[operation].mockImplementationOnce(() => { throw new Error("cannot send"); });
        if (operation === "pause") h.request();
        else { h.hold(); h.low(); h.controller.tick(); }
        expect(h.controller.snapshot).toMatchObject({mode: "error", nextCheckAt: null});
        expect(h.controller.snapshot.error).toContain(operation);
    });
});

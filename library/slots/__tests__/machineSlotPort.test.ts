import Machine from "@/library/machine/Machine";
import {readingOf} from "@/library/machine/frameLog";
import {FRAME_GAP_MS, SLOT_DISPATCH_MS, SLOT_RECEIPT_MS, SLOT_COMPLETION_MS} from "@/constants/machine";
import {buildType1, parseNotification} from "@/library/machine/protocol";
import {FakeTransport} from "@/library/machine/__tests__/FakeTransport";
import type {ConnectionScope} from "@/library/machine/Transport";
import {kermit, notification, status} from "@/library/machine/__tests__/protocolFixtures";
import {SlotDatabase} from "@/library/slots/SlotDatabase";
import {installMachineSlotPort} from "@/library/slots/machineSlotPort";
import {prepareSet, readSnapshot, snapshotRecipe} from "@/library/slots/slotModel";
import {recoverSlots, writeSlots} from "@/library/slots/slotWriter";
import {createTestDatabase} from "@/test-utils/sqlite";
import {coffee} from "./fixtures";

function receipt(marker = 0xC2) {
    const bytes = notification(0xF6, 0x2C, []);
    bytes[9] = marker;
    const crc = kermit(bytes.slice(0, -2));
    bytes[bytes.length - 2] = crc & 255;
    bytes[bytes.length - 1] = crc >> 8;
    return bytes;
}

class Radio extends FakeTransport {
    get connectedDeviceId() { return this.connectedTo; }
    behavior: "normal" | "missing" | "hang" | "duplicate" | "refused" | "noFinal" = "normal";
    slots: number[] = [];
    override async write(frame: Uint8Array) {
        await super.write(frame);
        if ((frame[3] | frame[4] << 8) !== 11510) return;
        this.slots.push(frame[10]);
        if (this.behavior === "missing") return;
        this.emit(receipt(this.behavior === "refused" ? 0xC1 : 0xC2));
        if (this.behavior === "duplicate") this.emit(receipt());
        if (frame[10] === 2 && this.behavior !== "noFinal") {
            this.emit(status(0x43));
            this.emit(status(0x25));
            this.emit(status(0x01));
        }
        if (this.behavior === "hang") await new Promise<void>(() => {});
    }
}

async function ready(gap = 0) {
    const sql = createTestDatabase();
    const store = new SlotDatabase(sql);
    for (const index of [0, 1, 2] as const) {
        store.assign("one", index, snapshotRecipe(coffee(String(index), 14 + index)));
    }
    const radio = new Radio();
    const machine = new Machine(radio, {frameGapMs: gap, infoWaitMs: 1});
    const port = installMachineSlotPort(machine, store);
    await machine.connect("one");
    return {sql, store, radio, machine, port};
}

const identity = {deviceId: "one", serial: "J15ABC123456"};
const flush = async () => { for (let n = 0; n < 30; n++) await Promise.resolve(); };

afterEach(() => jest.useRealTimers());

it("parses command receipts without inventing a slot identifier", () => {
    expect(parseNotification(Uint8Array.from(receipt()))).toEqual({
        kind: "receipt", code: 11510, status: 0xC2
    });
});

it("retains receipt status in the existing diagnostic log", () => {
    expect(readingOf(parseNotification(Uint8Array.from(receipt()))))
        .toBe("receipt 11510 status 0xc2");
});

it("uses real Machine receipts and buffers early ACK and final completion until native dispatch resolves", async () => {
    const {store, port, radio, machine} = await ready();
    await writeSlots(store, identity, port);
    expect(radio.slots).toEqual([0, 1, 2]);
    expect(store.read("one").journal).toBeNull();
    expect(store.read("one").written).not.toBeNull();
    await machine.send(buildType1(3500));
});

it.each(["missing", "hang", "duplicate", "refused", "noFinal"] as const)(
    "retains a durable reservation after %s rather than claiming success", async (behavior) => {
        const {store, port, radio, machine} = await ready();
        jest.useFakeTimers();
        radio.behavior = behavior;
        const result = writeSlots(store, identity, port).catch((error: Error) => error);
        await jest.advanceTimersByTimeAsync(50_000);
        expect(await result).toBeInstanceOf(Error);
        expect(store.read("one").journal).not.toBeNull();
        expect(store.read("one").written).toBeNull();
        await expect(machine.send(buildType1(3500))).rejects.toThrow(/Easy Mode/i);
        expect(jest.getTimerCount()).toBe(0);
    }
);

it.each(["readyToStart", "armed", "pressPlay", "settling", "paused"] as const)(
    "rejects held/active brew %s before journal creation", async (name) => {
        const {store, port, machine, radio} = await ready();
        machine.phase = name === "paused"
            ? {name, pour: 1, pours: 1, was: {name: "grinding"}} : {name};
        await expect(writeSlots(store, identity, port)).rejects.toThrow(/busy|brew/i);
        expect(store.read("one").journal).toBeNull();
        expect(radio.slots).toEqual([]);
    }
);

it("rejects all ordinary mutation paths before they change a held phase", async () => {
    const {port, machine} = await ready();
    const lease = await port.acquire(identity);
    const before = machine.phase;
    for (const act of [
        () => machine.brew(coffee()), () => machine.pauseBrew(), () => machine.resumeBrew(),
        () => machine.cancelBrew(), () => machine.startBrew(),
        () => machine.send(buildType1(3500)), () => machine.send(buildType1(8010)),
        () => machine.send(buildType1(8500)), () => machine.askHowItIsDoing()
    ]) await expect(act()).rejects.toThrow(/Easy Mode/i);
    expect(machine.phase).toBe(before);
    expect(() => machine.setAutoStart(false)).toThrow(/Easy Mode/i);
    lease.release(true);
});

it("checks actual connected identity and serial before any journal or traffic", async () => {
    const {store, port, radio} = await ready();
    await expect(port.acquire({...identity, deviceId: "remembered"})).rejects.toThrow(/connected/i);
    await expect(writeSlots(store, {...identity, serial: "other"}, port)).rejects.toThrow(/serial/i);
    await expect(writeSlots(store, {...identity, serial: null}, port)).rejects.toThrow(/serial/i);
    expect(store.read("one").journal).toBeNull();
    expect(radio.slots).toEqual([]);
});

it("invalidates a pending attempt synchronously on disconnect or background", async () => {
    const {store, port, radio, machine} = await ready();
    radio.behavior = "missing";
    const result = writeSlots(store, identity, port).catch((error: Error) => error);
    await flush();
    machine.setAppState("background");
    expect(await result).toBeInstanceOf(Error);
    radio.emit(receipt());
    radio.emit(status(0x25));
    expect(store.read("one").journal?.inFlight).toBe(0);
    await expect(port.acquire(identity)).rejects.toThrow(/background/i);
    machine.setAppState("active");
    await expect(recoverSlots(store, identity, port)).rejects.toThrow(/unknown/i);
});

it("installs restart reservation before connection probes and recovers only stored remaining frames", async () => {
    const {sql, store, machine} = await ready();
    await machine.disconnect();
    const slots = [0, 1, 2].map(() => snapshotRecipe(coffee()));
    const triple = [slots[0], slots[1], slots[2]] as const;
    store.begin("one", {
        id: "restart", serial: identity.serial, slots: [...triple], frames: prepareSet([...triple]),
        acknowledged: 0, inFlight: null, error: null
    });
    store.dispatching("one", "restart", 0);
    store.acknowledge("one", "restart", 0);
    const reopened = new SlotDatabase(sql);
    const radio = new Radio();
    const owner = new Machine(radio, {frameGapMs: 0});
    const port = installMachineSlotPort(owner, reopened);
    await owner.connect("one");
    await expect(owner.send(buildType1(3500))).rejects.toThrow(/Easy Mode/i);
    radio.emit(status(0x43));
    await recoverSlots(reopened, identity, port);
    expect(radio.slots).toEqual([1, 2]);
    await owner.send(buildType1(3500));
});

it("blocks public probes while a durable recovery journal exists, but permits reconnect probes", async () => {
    const {store, machine, port, radio} = await ready();
    radio.behavior = "refused";
    await expect(writeSlots(store, identity, port)).rejects.toThrow();
    await expect(machine.requestInfo()).rejects.toThrow(/Easy Mode/i);
    await expect(machine.askHowItIsDoing()).rejects.toThrow(/Easy Mode/i);
    await machine.disconnect();
    await machine.connect("one");
    expect(machine.slotIdentity).toEqual(identity);
    await expect(machine.send(buildType1(3500))).rejects.toThrow(/Easy Mode/i);
});

it("cancels the pacing gap immediately when background invalidates an attempt", async () => {
    const {store, port, radio, machine} = await ready();
    jest.useFakeTimers();
    // A separate owner uses production pacing, after an already connected transport.
    await machine.disconnect();
    const paced = new Machine(radio);
    const pacedPort = installMachineSlotPort(paced, store);
    const connection = paced.connect("one");
    await jest.advanceTimersByTimeAsync(2000);
    await connection;
    const result = writeSlots(store, identity, pacedPort).catch((error: Error) => error);
    await flush();
    expect(radio.slots).toEqual([0]);
    paced.setAppState("background");
    expect(await result).toBeInstanceOf(Error);
    expect(radio.slots).toEqual([0]);
    expect(jest.getTimerCount()).toBe(0);
    expect(port.available).toBe(true);
});

it("blocks a writer throughout a normal multi-frame upload, not just its native writes", async () => {
    const {store, radio, machine} = await ready();
    await machine.disconnect();
    jest.useFakeTimers();
    const owner = new Machine(radio);
    const port = installMachineSlotPort(owner, store);
    const connection = owner.connect("one");
    await jest.advanceTimersByTimeAsync(2000);
    await connection;
    const brewing = owner.brew(coffee());
    await flush();
    await expect(port.acquire(identity)).rejects.toThrow(/busy/i);
    await jest.advanceTimersByTimeAsync(20_000);
    await brewing;
    expect(store.read("one").journal).toBeNull();
    expect(radio.slots).toEqual([]);
    await owner.disconnect();
});

it("does not unlock before the durable journal has completed", async () => {
    const {store, port, machine} = await ready();
    const lease = await port.acquire(identity);
    const snapshots = store.read("one").drafts;
    store.begin("one", {
        id: "attempt", serial: identity.serial,
        slots: [readSnapshot(snapshots[0]), readSnapshot(snapshots[1]), readSnapshot(snapshots[2])],
        frames: prepareSet(snapshots), acknowledged: 0, inFlight: null, error: null
    });
    expect(() => lease.release(true)).toThrow(/durable|incomplete/i);
    lease.release(false);
    await expect(machine.send(buildType1(3500))).rejects.toThrow(/Easy Mode/i);
});

it("blocks mutation during a native reconnect before Machine.connect resumes", async () => {
    const {machine, port, radio, store} = await ready();
    radio.behavior = "refused";
    await expect(writeSlots(store, identity, port)).rejects.toThrow();
    await machine.disconnect();
    const connect = radio.connect.bind(radio);
    let release!: () => void;
    radio.connect = async (id) => {
        await connect(id);
        await new Promise<void>((resolve) => { release = resolve; });
    };
    const reconnecting = machine.connect("one");
    await flush();
    await expect(machine.send(buildType1(3500))).rejects.toThrow(/Easy Mode/i);
    release();
    await reconnecting;
});

it("checks the connection at durable promotion, not just inside confirmSaved", async () => {
    const {machine, port, store} = await ready();
    const guarded = {
        ...port,
        acquire: async (bound: typeof identity) => {
            const lease = await port.acquire(bound);
            const confirm = lease.confirmSaved.bind(lease);
            lease.confirmSaved = async () => {
                await confirm();
                machine.setAppState("background");
            };
            return lease;
        }
    };
    await expect(writeSlots(store, identity, guarded)).rejects.toThrow(/background/i);
    expect(store.read("one").journal?.acknowledged).toBe(3);
    expect(store.read("one").written).toBeNull();
});

it("ignores old owner callbacks and unrelated peripheral frames/disconnects after reconnect", async () => {
    class ScopedRadio extends Radio {
        connectionGeneration = 0;
        callbacks: ((frame: Uint8Array, source?: string, scope?: ConnectionScope) => void)[] = [];
        drops: ((scope?: ConnectionScope) => void)[] = [];
        override async connect(id: string) { ++this.connectionGeneration; await super.connect(id); }
        override onFrame(listener: (frame: Uint8Array, source?: string, scope?: ConnectionScope) => void) {
            this.callbacks.push(listener);
            return super.onFrame(listener);
        }
        override onDisconnect(listener: (scope?: ConnectionScope) => void) {
            this.drops.push(listener);
            return super.onDisconnect(listener);
        }
    }
    const radio = new ScopedRadio();
    const machine = new Machine(radio, {frameGapMs: 0});
    const store = new SlotDatabase(createTestDatabase());
    const port = installMachineSlotPort(machine, store);
    await machine.connect("one");
    const old = radio.callbacks[0];
    const oldDrop = radio.drops[0];
    await machine.disconnect();
    await machine.connect("one");
    const lease = await port.acquire(identity);
    old(Uint8Array.from(receipt()), undefined, {deviceId: "one", generation: 1});
    oldDrop({deviceId: "one", generation: 1});
    radio.callbacks[1](Uint8Array.from(receipt()), undefined, {deviceId: "other", generation: 2});
    radio.drops[1]({deviceId: "other", generation: 2});
    expect(machine.isConnected()).toBe(true);
    lease.release(true);
});

it("does not allow a new lease while a standalone native command is pending", async () => {
    const {machine, port, radio} = await ready();
    const original = radio.write.bind(radio);
    let release!: () => void;
    radio.write = async (frame) => {
        await original(frame);
        if (frame[3] === (3500 & 255)) {
            await new Promise<void>((resolve) => { release = resolve; });
        }
    };
    const grinding = machine.send(buildType1(3500));
    await flush();
    await expect(port.acquire(identity)).rejects.toThrow(/busy/i);
    release();
    await grinding;
    radio.emit(status(0x01));
    const lease = await port.acquire(identity);
    lease.release(true);
});

it("does not let a late old write mutate pause provenance or claim a send on a new connection", async () => {
    const {machine, radio, port} = await ready();
    const original = radio.write.bind(radio);
    let release!: () => void;
    radio.write = async (frame) => {
        await original(frame);
        if ((frame[3] | frame[4] << 8) === 40518) {
            await new Promise<void>((resolve) => { release = resolve; });
        }
    };
    const paused = machine.pauseBrew().catch((error: Error) => error);
    await flush();
    await machine.disconnect();
    await machine.connect("one");
    const lease = await port.acquire(identity);
    lease.release(true);
    release();
    expect(await paused).toBeInstanceOf(Error);
    expect(machine.frameHistory.some((entry) => entry.direction === "sent"
        && (entry.frame[3] | entry.frame[4] << 8) === 40518)).toBe(false);
});

it("refuses a stale session before creating a new journal rather than guessing that it is still authorised", async () => {
    const {store, port} = await ready();
    jest.useFakeTimers();
    await jest.advanceTimersByTimeAsync(20_001);
    await expect(writeSlots(store, identity, port)).rejects.toThrow(/session|reconnect/i);
    expect(store.read("one").journal).toBeNull();
});

it("will not clear a background invalidation until the app is active", async () => {
    const {machine, port} = await ready();
    machine.setAppState("background");
    machine.setAppState("inactive");
    await expect(port.acquire(identity)).rejects.toThrow(/background/i);
});

it("does not create a journal when the lease invalidates before the writer begins", async () => {
    const {store, port, machine} = await ready();
    const invalidated = {
        ...port,
        acquire: async (bound: typeof identity) => {
            const lease = await port.acquire(bound);
            machine.setAppState("background");
            return lease;
        }
    };
    await expect(writeSlots(store, identity, invalidated)).rejects.toThrow(/background/i);
    expect(store.read("one").journal).toBeNull();
    machine.setAppState("active");
    const lease = await port.acquire(identity);
    lease.release(true);
});

it.each([
    ["hang", SLOT_DISPATCH_MS], ["missing", SLOT_RECEIPT_MS], ["noFinal", SLOT_COMPLETION_MS]
] as const)("bounds %s at the explicit software timeout", async (behavior, budget) => {
    const {store, port, radio} = await ready();
    jest.useFakeTimers();
    radio.behavior = behavior;
    let settled = false;
    const result = writeSlots(store, identity, port).catch((error: Error) => {
        settled = true;
        return error;
    });
    await flush();
    await jest.advanceTimersByTimeAsync(budget - 1);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(await result).toBeInstanceOf(Error);
    expect(jest.getTimerCount()).toBe(0);
});

it("paces accepted native slot dispatches by the production two-second gap", async () => {
    const {store, radio, machine} = await ready();
    await machine.disconnect();
    jest.useFakeTimers();
    const owner = new Machine(radio);
    const port = installMachineSlotPort(owner, store);
    const connecting = owner.connect("one");
    await jest.advanceTimersByTimeAsync(FRAME_GAP_MS);
    await connecting;
    const times: number[] = [];
    const original = radio.write.bind(radio);
    radio.write = async (frame) => {
        if (frame[3] === 0xF6) times.push(Date.now());
        await original(frame);
    };
    const result = writeSlots(store, identity, port);
    await flush();
    expect(times).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(FRAME_GAP_MS - 1);
    expect(times).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(times).toHaveLength(2);
    await jest.advanceTimersByTimeAsync(FRAME_GAP_MS);
    await result;
    expect(times.slice(1).map((time, index) => time - times[index]))
        .toEqual([FRAME_GAP_MS, FRAME_GAP_MS]);
});

it("rejects an observable duplicate between slots and leaves the known boundary durable", async () => {
    const {store, port, radio} = await ready();
    const off = store.subscribe(() => {
        if (store.read("one").journal?.acknowledged === 1
            && store.read("one").journal?.inFlight === null) radio.emit(receipt());
    });
    await expect(writeSlots(store, identity, port)).rejects.toThrow(/duplicate/i);
    off();
    expect(radio.slots).toEqual([0]);
    expect(store.read("one").journal).toMatchObject({acknowledged: 1, inFlight: null});
});

it("makes a safe forget refusal explicit without deleting the recovery record", async () => {
    const {store, machine, port, radio} = await ready();
    radio.behavior = "refused";
    await expect(writeSlots(store, identity, port)).rejects.toThrow();
    expect(() => machine.assertCanForgetDevice("one")).toThrow(/Easy Mode/i);
    expect(store.read("one").journal).not.toBeNull();
    expect(() => machine.assertCanForgetDevice("other")).not.toThrow();
});

it("does not confuse native command acceptance with a finished standalone grind/water action", async () => {
    const {machine, port, radio} = await ready();
    await machine.send(buildType1(3500));
    await expect(port.acquire(identity)).rejects.toThrow(/busy/i);
    radio.emit(status(0x0A));
    await expect(port.acquire(identity)).rejects.toThrow(/busy/i);
    radio.emit(status(0x01));
    const lease = await port.acquire(identity);
    lease.release(true);
});

it("does not renew the current session with a late old handshake completion", async () => {
    const {machine, port, radio} = await ready();
    jest.useFakeTimers();
    await jest.advanceTimersByTimeAsync(20_001);
    const original = radio.write.bind(radio);
    let release!: () => void;
    let blocked = false;
    radio.write = async (frame) => {
        await original(frame);
        if ((frame[3] | frame[4] << 8) === 8100 && !blocked) {
            blocked = true;
            await new Promise<void>((resolve) => { release = resolve; });
        }
    };
    const oldQuery = machine.askHowItIsDoing().catch((error: Error) => error);
    await flush();
    await machine.disconnect();
    await machine.connect("one");
    await jest.advanceTimersByTimeAsync(20_001);
    release();
    expect(await oldQuery).toBeInstanceOf(Error);
    await expect(port.acquire(identity)).rejects.toThrow(/session|reconnect/i);
});

it("cannot use a saved status heard before the current attempt as final completion", async () => {
    const {store, port, radio} = await ready();
    radio.emit(status(0x25));
    // A terminal idle can make the machine available; it cannot prove this write.
    radio.emit(status(0x01));
    radio.behavior = "noFinal";
    jest.useFakeTimers();
    const result = writeSlots(store, identity, port).catch((error: Error) => error);
    await jest.advanceTimersByTimeAsync(SLOT_COMPLETION_MS);
    expect(await result).toBeInstanceOf(Error);
    expect(store.read("one").journal?.acknowledged).toBe(3);
    expect(store.read("one").written).toBeNull();
});

it.each([0x03, 0x1F, 0x23] as const)(
    "does not use a known journal as permission to interrupt external hardware activity %s", async (state) => {
        const {store, port, radio} = await ready();
        const snapshot = snapshotRecipe(coffee());
        const slots = [snapshot, snapshot, snapshot] as const;
        store.begin("one", {
            id: "known", serial: identity.serial, slots: [...slots], frames: prepareSet([...slots]),
            acknowledged: 0, inFlight: null, error: null
        });
        radio.emit(status(state));
        await expect(recoverSlots(store, identity, port)).rejects.toThrow(/busy/i);
        expect(radio.slots).toEqual([]);
    }
);

it("releases an initial database failure with no journal and no radio mutation", async () => {
    const {sql, store, port, radio} = await ready();
    sql.execSync("CREATE TRIGGER fail_update BEFORE INSERT ON easy_mode_slots BEGIN SELECT RAISE(ABORT, 'disk full'); END;");
    await expect(writeSlots(store, identity, port)).rejects.toThrow(/disk full/i);
    expect(store.read("one").journal).toBeNull();
    expect(radio.slots).toEqual([]);
    sql.execSync("DROP TRIGGER fail_update");
    await writeSlots(store, identity, port);
    expect(radio.slots).toEqual([0, 1, 2]);
});

it("keeps completion unconfirmed when atomic promotion cannot commit, even after fresh saved", async () => {
    const {sql, store, port, machine} = await ready();
    const off = store.subscribe(() => {
        if (store.read("one").journal?.acknowledged === 3) {
            sql.execSync("CREATE TRIGGER IF NOT EXISTS fail_update BEFORE INSERT ON easy_mode_slots BEGIN SELECT RAISE(ABORT, 'disk full'); END;");
        }
    });
    await expect(writeSlots(store, identity, port)).rejects.toThrow(/disk full/i);
    off();
    expect(new SlotDatabase(sql).read("one").journal).toMatchObject({acknowledged: 3, inFlight: null});
    expect(store.read("one").written).toBeNull();
    await expect(machine.send(buildType1(3500))).rejects.toThrow(/Easy Mode/i);
    await expect(recoverSlots(store, identity, port)).rejects.toThrow(/completion/i);
});

it("stops subsequent frames when durable acknowledgement fails", async () => {
    const {store, sql, radio, port, machine} = await ready();
    const original = radio.write.bind(radio);
    radio.write = async (frame) => {
        await original(frame);
        if (frame[3] === 0xF6) sql.execSync(
            "CREATE TRIGGER fail_update BEFORE INSERT ON easy_mode_slots BEGIN SELECT RAISE(ABORT, 'disk full'); END;"
        );
    };
    await expect(writeSlots(store, identity, port)).rejects.toThrow(/disk full/i);
    expect(radio.slots).toEqual([0]);
    expect(new SlotDatabase(sql).read("one").journal?.inFlight).toBe(0);
    await expect(machine.send(buildType1(3500))).rejects.toThrow(/Easy Mode/i);
});

it.each(["native", "budget"] as const)("retains uncertainty after a %s error", async (failure) => {
    const {store, port, radio} = await ready();
    if (failure === "native") radio.failWriteOf = {code: 11510, reason: "native refused"};
    else radio.frameBudget = 20;
    await expect(writeSlots(store, identity, port)).rejects.toThrow(/native refused|too narrow/i);
    expect(store.read("one").journal?.inFlight).toBe(0);
    expect(radio.slots).toEqual([]);
});

it("invalidates a native hang on radio loss without accepting later completion", async () => {
    const {store, port, radio, machine} = await ready();
    radio.behavior = "hang";
    const result = writeSlots(store, identity, port).catch((error: Error) => error);
    await flush();
    radio.drop();
    expect(await result).toBeInstanceOf(Error);
    await machine.connect("other");
    radio.emit(receipt());
    radio.emit(status(0x25));
    expect(store.read("one").journal?.inFlight).toBe(0);
    await machine.send(buildType1(3500));
    await machine.disconnect();
    await machine.connect("one");
    await expect(machine.send(buildType1(3500))).rejects.toThrow(/Easy Mode/i);
});

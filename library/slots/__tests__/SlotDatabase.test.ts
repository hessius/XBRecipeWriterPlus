import {createTestDatabase} from "@/test-utils/sqlite";
import {SlotDatabase} from "@/library/slots/SlotDatabase";
import {snapshotRecipe, prepareSet, type SlotJournal} from "@/library/slots/slotModel";
import {coffee} from "./fixtures";

export function batch(id = "attempt"): SlotJournal {
    const a = snapshotRecipe(coffee("A"));
    const slots: SlotJournal["slots"] = [a, a, a];
    return {
        id, serial: "serial", slots, frames: prepareSet(slots),
        acknowledged: 0, inFlight: null, error: null
    };
}

it("keeps drafts per machine and returns stable subscribed snapshots", () => {
    const store = new SlotDatabase(createTestDatabase());
    const listener = jest.fn();
    store.subscribe(listener);
    expect(store.read("one")).toBe(store.read("one"));
    store.assign("one", 0, snapshotRecipe(coffee()));
    expect(store.read("two").drafts).toEqual([null, null, null]);
    expect(store.read("one").drafts[0]?.name).toBe("Morning");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(() => store.assign("", 0, snapshotRecipe(coffee()))).toThrow(/machine/i);
});

it("persists uncertain boundaries through process recreation and locks assignments", () => {
    const sql = createTestDatabase();
    const store = new SlotDatabase(sql);
    store.begin("one", batch());
    store.dispatching("one", "attempt", 0);
    const reopened = new SlotDatabase(sql);
    expect(reopened.read("one").journal?.inFlight).toBe(0);
    expect(() => reopened.assign("one", 1, null)).toThrow(/incomplete/i);
    expect(() => reopened.begin("one", batch("other"))).toThrow(/incomplete/i);
    expect(() => reopened.acknowledge("one", "stale", 0)).toThrow(/attempt/i);
});

it("only promotes a complete receipt set, atomically", () => {
    const sql = createTestDatabase();
    const store = new SlotDatabase(sql);
    store.begin("one", batch());
    expect(() => store.complete("one", "attempt", 1)).toThrow(/receipt/i);
    for (const index of [0, 1, 2] as const) {
        store.dispatching("one", "attempt", index);
        store.acknowledge("one", "attempt", index);
    }
    store.complete("one", "attempt", 42);
    const reopened = new SlotDatabase(sql).read("one");
    expect(reopened.journal).toBeNull();
    expect(reopened.written?.at).toBe(42);
});

it("retains the last-written set and immutable recovery bytes on failure", () => {
    const store = new SlotDatabase(createTestDatabase());
    const journal = batch();
    store.begin("one", journal);
    journal.frames[0][0] = 0;
    store.dispatching("one", "attempt", 0);
    store.fail("one", "attempt", "Receipt unknown");
    expect(store.read("one").journal?.frames[0][0]).toBe(0x58);
    expect(store.read("one").journal?.error).toBe("Receipt unknown");
});

it("does not overwrite a prior written set when its replacement is incomplete", () => {
    const store = new SlotDatabase(createTestDatabase());
    store.begin("one", batch("first"));
    for (const index of [0, 1, 2] as const) {
        store.dispatching("one", "first", index);
        store.acknowledge("one", "first", index);
    }
    store.complete("one", "first", 10);
    const previous = store.read("one").written;
    store.begin("one", batch("replacement"));
    store.dispatching("one", "replacement", 0);
    store.fail("one", "replacement", "Link lost");
    expect(store.read("one").written).toEqual(previous);
});

it("rejects corrupted recovery frames instead of replaying them", () => {
    const sql = createTestDatabase();
    const store = new SlotDatabase(sql);
    store.begin("one", batch());
    const corrupt = JSON.parse(JSON.stringify(store.read("one")));
    corrupt.journal.frames[1] = corrupt.journal.frames[0];
    sql.runSync("UPDATE easy_mode_slots SET recordJSON = ? WHERE deviceId = ?",
        [JSON.stringify(corrupt), "one"]);
    expect(() => new SlotDatabase(sql).read("one")).toThrow(/frames disagree/i);
});

it("rejects malformed storage rather than presenting an empty successful set", () => {
    const sql = createTestDatabase();
    new SlotDatabase(sql);
    sql.runSync("INSERT INTO easy_mode_slots VALUES (?, ?)", ["one", "{}"]);
    expect(() => new SlotDatabase(sql).read("one")).toThrow(/storage/i);
});

it("rolls back persistence failures without publishing a changed snapshot", () => {
    const sql = createTestDatabase();
    const store = new SlotDatabase(sql);
    const before = store.read("one");
    sql.execSync("CREATE TRIGGER fail_slot BEFORE INSERT ON easy_mode_slots BEGIN SELECT RAISE(ABORT, 'disk full'); END;");
    expect(() => store.assign("one", 0, snapshotRecipe(coffee()))).toThrow(/disk full/i);
    expect(store.read("one")).toBe(before);
    expect(new SlotDatabase(sql).read("one").drafts).toEqual([null, null, null]);
});

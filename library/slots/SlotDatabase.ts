import {appDatabase} from "@/library/appDatabase";
import {
    emptySlotRecord, objectValue, prepareSet, readSnapshot, sameBytes,
    type SlotIndex, type SlotJournal, type SlotRecord, type SlotSnapshot, type Triple
} from "@/library/slots/slotModel";

type SlotSQL = {
    execSync: (sql: string) => void;
    runSync: (sql: string, params: string[]) => unknown;
    getFirstSync: (sql: string, params: string[]) => unknown;
    withTransactionSync: (task: () => void) => void;
};

function triple<T>(value: unknown, read: (item: unknown) => T): Triple<T> {
    if (!Array.isArray(value) || value.length !== 3) {
        throw new Error("Easy Mode storage must contain exactly three slots.");
    }
    return [read(value[0]), read(value[1]), read(value[2])];
}

function readJournal(value: unknown): SlotJournal | null {
    if (value === null) return null;
    if (!objectValue(value) || typeof value.id !== "string" || value.id === ""
        || (value.serial !== null && typeof value.serial !== "string")
        || typeof value.acknowledged !== "number" || !Number.isInteger(value.acknowledged)
        || value.acknowledged < 0 || value.acknowledged > 3
        || (value.inFlight !== null
            && (value.inFlight !== value.acknowledged || value.acknowledged === 3))
        || (value.error !== null && typeof value.error !== "string")) {
        throw new Error("The Easy Mode recovery journal is invalid.");
    }
    const slots = triple(value.slots, readSnapshot);
    const frames = prepareSet(slots);
    const saved = triple(value.frames, (bytes) => {
        if (!Array.isArray(bytes) || !bytes.every((byte: unknown) =>
            typeof byte === "number" && Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
            throw new Error("The Easy Mode recovery frame is invalid.");
        }
        return bytes;
    });
    if (!frames.every((frame, index) => sameBytes(frame, saved[index]))) {
        throw new Error("The Easy Mode recovery frames disagree with their snapshots.");
    }
    const inFlight = value.inFlight;
    if (inFlight !== null && inFlight !== 0 && inFlight !== 1 && inFlight !== 2) {
        throw new Error("The Easy Mode receipt boundary is invalid.");
    }
    return {
        id: value.id, serial: value.serial, slots, frames,
        acknowledged: value.acknowledged, inFlight, error: value.error
    };
}

function readRecord(json: string): SlotRecord {
    try {
        const value: unknown = JSON.parse(json);
        if (!objectValue(value) || value.version !== 1) {
            throw new Error("Unsupported Easy Mode record.");
        }
        const drafts = triple(value.drafts, (slot) => slot === null ? null : readSnapshot(slot));
        let written: SlotRecord["written"] = null;
        if (value.written !== null) {
            if (!objectValue(value.written) || typeof value.written.at !== "number"
                || !Number.isFinite(value.written.at) || value.written.at < 0) {
                throw new Error("Invalid last-written time.");
            }
            written = {at: value.written.at, slots: triple(value.written.slots, readSnapshot)};
        }
        return {version: 1, drafts, written, journal: readJournal(value.journal)};
    } catch (error) {
        throw new Error(`Easy Mode storage could not be read: ${error instanceof Error
            ? error.message : String(error)}`);
    }
}

function freeze(value: unknown): void {
    if (typeof value !== "object" || value === null) return;
    Object.values(value).forEach(freeze);
    Object.freeze(value);
}

export class SlotDatabase {
    private readonly records = new Map<string, SlotRecord>();
    private readonly listeners = new Set<() => void>();

    constructor(private readonly sql: SlotSQL = appDatabase()) {
        sql.execSync(`CREATE TABLE IF NOT EXISTS easy_mode_slots (
            deviceId TEXT PRIMARY KEY NOT NULL, recordJSON TEXT NOT NULL
        )`);
    }

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };

    private load(deviceId: string): SlotRecord {
        const row = this.sql.getFirstSync(
            "SELECT recordJSON FROM easy_mode_slots WHERE deviceId = ?", [deviceId]
        );
        if (row === null) return emptySlotRecord();
        if (!objectValue(row) || typeof row.recordJSON !== "string") {
            throw new Error("Easy Mode storage returned an invalid row.");
        }
        return readRecord(row.recordJSON);
    }

    read(deviceId: string): SlotRecord {
        let record = this.records.get(deviceId);
        if (record === undefined) {
            record = this.load(deviceId);
            freeze(record);
            this.records.set(deviceId, record);
        }
        return record;
    }

    private change(deviceId: string, edit: (record: SlotRecord) => void): void {
        if (deviceId.trim() === "") throw new Error("Choose a machine before assigning slots.");
        let committed: SlotRecord | undefined;
        this.sql.withTransactionSync(() => {
            const record = this.load(deviceId);
            edit(record);
            const json = JSON.stringify(record);
            committed = readRecord(json);
            this.sql.runSync(
                "INSERT OR REPLACE INTO easy_mode_slots (deviceId, recordJSON) VALUES (?, ?)",
                [deviceId, json]
            );
        });
        if (committed === undefined) throw new Error("Easy Mode storage did not commit.");
        freeze(committed);
        this.records.set(deviceId, committed);
        this.listeners.forEach((listener) => listener());
    }

    assign(deviceId: string, index: SlotIndex, snapshot: SlotSnapshot | null): void {
        this.change(deviceId, (record) => {
            if (record.journal !== null) throw new Error("Finish the incomplete write first.");
            record.drafts[index] = snapshot === null ? null : readSnapshot(snapshot);
        });
    }

    begin(deviceId: string, journal: SlotJournal): void {
        this.change(deviceId, (record) => {
            if (record.journal !== null) throw new Error("An incomplete write already exists.");
            if (journal.acknowledged !== 0 || journal.inFlight !== null) {
                throw new Error("A new write must begin before any receipt.");
            }
            record.journal = readJournal(journal);
        });
    }

    private updateJournal(deviceId: string, id: string, edit: (journal: SlotJournal) => void) {
        this.change(deviceId, (record) => {
            if (record.journal === null || record.journal.id !== id) {
                throw new Error("The Easy Mode write attempt no longer matches.");
            }
            edit(record.journal);
        });
    }

    dispatching(deviceId: string, id: string, index: SlotIndex): void {
        this.updateJournal(deviceId, id, (journal) => {
            if (journal.acknowledged !== index || journal.inFlight !== null) {
                throw new Error("The next slot receipt is uncertain.");
            }
            journal.inFlight = index;
            journal.error = null;
        });
    }

    acknowledge(deviceId: string, id: string, index: SlotIndex): void {
        this.updateJournal(deviceId, id, (journal) => {
            if (journal.inFlight !== index || journal.acknowledged !== index) {
                throw new Error("The slot receipt does not match this attempt.");
            }
            journal.acknowledged = index + 1;
            journal.inFlight = null;
        });
    }

    fail(deviceId: string, id: string, error: string): void {
        this.updateJournal(deviceId, id, (journal) => { journal.error = error; });
    }

    complete(deviceId: string, id: string, at: number): void {
        this.change(deviceId, (record) => {
            const journal = record.journal;
            if (journal === null || journal.id !== id) {
                throw new Error("The Easy Mode write attempt no longer matches.");
            }
            if (journal.acknowledged !== 3 || journal.inFlight !== null) {
                throw new Error("All three slot receipts are required.");
            }
            record.written = {at, slots: journal.slots};
            record.journal = null;
        });
    }
}

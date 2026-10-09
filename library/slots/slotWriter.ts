import uuid from "react-native-uuid";
import {SlotDatabase} from "@/library/slots/SlotDatabase";
import {
    prepareSet, readSnapshot, type SlotIndex, type SlotJournal
} from "@/library/slots/slotModel";

export type SlotIdentity = {readonly deviceId: string; readonly serial: string | null};
export interface SlotPort {
    available: boolean;
    acquire(identity: SlotIdentity): Promise<SlotLease>;
}
export interface SlotLease {
    /** Production checks again at the synchronous durable mutation boundary. */
    assertCurrent?(): void;
    /** Resolves on an unambiguous machine receipt, never native write completion. */
    sendAndConfirm(frame: Uint8Array, index: SlotIndex): Promise<void>;
    /** Subscribe before A; require a fresh SLOTS_SAVED from this attempt. */
    confirmSaved(): Promise<void>;
    /** False retains the machine owner's recovery reservation. */
    release(safeToRelease: boolean): void;
}

export const SLOT_INTEGRATION_BLOCK =
    "Writing is unavailable until the shared machine transport and operation exclusion are integrated.";

export const unavailableSlotPort: SlotPort = {
    available: false,
    acquire: async () => { throw new Error(SLOT_INTEGRATION_BLOCK); }
};

type WriterOptions = {id?: () => string; now?: () => number};

function checkPort(identity: SlotIdentity, port: SlotPort): void {
    if (identity.deviceId.trim() === "") throw new Error("Choose a machine before writing slots.");
    if (!port.available) throw new Error(SLOT_INTEGRATION_BLOCK);
}

function matchingSerial(journal: SlotJournal, identity: SlotIdentity): void {
    if (journal.serial !== null && journal.serial !== identity.serial) {
        throw new Error("This write belongs to a different machine. Its serial must match.");
    }
}

async function transmit(
    store: SlotDatabase, identity: SlotIdentity, port: SlotPort,
    journal: SlotJournal, isNew: boolean, now: () => number
): Promise<void> {
    const target = Object.freeze({...identity});
    const lease = await port.acquire(target);
    let begun = !isNew;
    let completed = false;
    try {
        lease.assertCurrent?.();
        if (isNew) {
            store.begin(target.deviceId, journal);
            begun = true;
        }
        for (const index of [0, 1, 2] as const) {
            if (index < journal.acknowledged) continue;
            lease.assertCurrent?.();
            store.dispatching(target.deviceId, journal.id, index);
            await lease.sendAndConfirm(Uint8Array.from(journal.frames[index]), index);
            lease.assertCurrent?.();
            store.acknowledge(target.deviceId, journal.id, index);
        }
        await lease.confirmSaved();
        lease.assertCurrent?.();
        store.complete(target.deviceId, journal.id, now());
        completed = true;
    } catch (error) {
        if (begun) {
            const message = error instanceof Error ? error.message : String(error);
            try {
                store.fail(target.deviceId, journal.id, message);
            } catch (storageError) {
                throw new Error(`Could not persist the incomplete Easy Mode write: ${
                    storageError instanceof Error ? storageError.message : String(storageError)
                }. Original failure: ${message}`);
            }
        }
        throw error;
    } finally {
        lease.release(!begun || completed);
    }
}

export async function writeSlots(
    store: SlotDatabase, identity: SlotIdentity, port: SlotPort = unavailableSlotPort,
    options: WriterOptions = {}
): Promise<void> {
    checkPort(identity, port);
    const record = store.read(identity.deviceId);
    if (record.journal !== null) throw new Error("Finish the incomplete write before starting another.");
    const frames = prepareSet(record.drafts);
    const slots: SlotJournal["slots"] = [
        readSnapshot(record.drafts[0]), readSnapshot(record.drafts[1]), readSnapshot(record.drafts[2])
    ];
    const journal: SlotJournal = {
        id: options.id?.() ?? String(uuid.v4()),
        serial: identity.serial, slots, frames,
        acknowledged: 0, inFlight: null, error: null
    };
    await transmit(store, identity, port, journal, true, options.now ?? Date.now);
}

export async function recoverSlots(
    store: SlotDatabase, identity: SlotIdentity, port: SlotPort = unavailableSlotPort,
    options: WriterOptions = {}
): Promise<void> {
    const journal = store.read(identity.deviceId).journal;
    if (journal === null) throw new Error("There is no incomplete Easy Mode write.");
    matchingSerial(journal, identity);
    if (journal.inFlight !== null) {
        throw new Error(`Slot ${["A", "B", "C"][journal.inFlight]}'s receipt is unknown. ${
            "Recovery requires verified machine evidence; it cannot be replayed safely yet."
        }`);
    }
    if (journal.acknowledged === 3) {
        throw new Error("Storage completion is unconfirmed. Verified recovery evidence is required.");
    }
    checkPort(identity, port);
    await transmit(store, identity, port, journal, false, options.now ?? Date.now);
}

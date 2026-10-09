import {SLOT_COMPLETION_MS, SLOT_DISPATCH_MS, SLOT_RECEIPT_MS} from "@/constants/machine";
import type Machine from "@/library/machine/Machine";
import type {SlotSession} from "@/library/machine/Machine";
import {MACHINE_STATE} from "@/library/machine/protocol";
import type {SlotDatabase} from "@/library/slots/SlotDatabase";
import type {SlotIndex} from "@/library/slots/slotModel";
import {sameBytes} from "@/library/slots/slotModel";
import type {SlotIdentity, SlotLease, SlotPort} from "@/library/slots/slotWriter";

class MachineSlotLease implements SlotLease {
    private failure: Error | null = null;
    private outstanding: SlotIndex | null = null;
    private received = false;
    private saved = false;
    private next: number;
    private released = false;
    private waiters = new Set<() => void>();
    private off: (() => void)[] = [];

    constructor(
        machine: Machine, private store: SlotDatabase, private identity: SlotIdentity,
        private session: SlotSession
    ) {
        this.next = store.read(identity.deviceId).journal?.acknowledged ?? 0;
        this.off.push(session.onInvalidated((error) => {
            this.failure = error;
            this.wake();
        }));
        this.off.push(machine.onNotification((parsed) => {
            if (this.failure !== null || this.released) return;
            if (parsed.kind === "receipt" && parsed.code === 11510) {
                if (parsed.status !== 0xC2) {
                    this.fail(new Error("The machine refused the Easy Mode slot command."));
                } else if (this.outstanding === null || this.received) {
                    this.fail(new Error("Unexpected or duplicate Easy Mode receipt. Receipt is unknown."));
                } else {
                    this.received = true;
                    this.wake();
                }
            }
            if (parsed.kind === "status" && parsed.state === MACHINE_STATE.SLOTS_SAVED) {
                if (this.saved || !(this.next === 3
                    || (this.outstanding === 2 && this.received))) {
                    this.fail(new Error("Unexpected Easy Mode storage completion. Receipt is unknown."));
                } else {
                    this.saved = true;
                    this.wake();
                }
            }
        }));
    }

    private wake(): void { this.waiters.forEach((wake) => wake()); }

    private fail(error: Error): void {
        if (this.failure !== null) return;
        this.failure = error;
        this.session.invalidate(error);
        this.wake();
    }

    private check(): void {
        if (this.failure !== null) throw this.failure;
        if (this.released) throw new Error("The Easy Mode attempt has been released.");
        this.session.check();
    }

    assertCurrent(): void { this.check(); }

    private bounded(task: Promise<void> | (() => boolean), ms: number, message: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const finish = (error?: Error) => {
                clearTimeout(timer);
                this.waiters.delete(wake);
                if (error !== undefined) reject(error);
                else resolve();
            };
            const wake = () => {
                if (this.failure !== null) finish(this.failure);
                else if (typeof task === "function" && task()) finish();
            };
            const timer = setTimeout(() => {
                const error = new Error(message);
                this.fail(error);
                finish(error);
            }, ms);
            timer.unref?.();
            this.waiters.add(wake);
            if (typeof task !== "function") {
                task.then(() => finish(this.failure ?? undefined), (error: unknown) => {
                    const failure = error instanceof Error ? error : new Error(String(error));
                    this.fail(failure);
                    finish(failure);
                });
            }
            wake();
        });
    }

    async sendAndConfirm(frame: Uint8Array, index: SlotIndex): Promise<void> {
        this.check();
        const journal = this.store.read(this.identity.deviceId).journal;
        if (index !== this.next || this.outstanding !== null || journal === null
            || journal.inFlight !== index || journal.acknowledged !== index
            || !sameBytes(Array.from(frame), journal.frames[index])) {
            const error = new Error("The Easy Mode frame does not match its durable dispatch boundary.");
            this.fail(error);
            throw error;
        }
        this.received = false;
        await this.bounded(this.session.send(frame.slice(), () => {
            this.check();
            this.outstanding = index;
        }), SLOT_DISPATCH_MS, "Easy Mode native dispatch timed out. Receipt is unknown.");
        this.check();
        await this.bounded(() => this.received, SLOT_RECEIPT_MS,
            "Easy Mode receipt timed out. Do not resend the uncertain slot.");
        this.check();
        this.outstanding = null;
        this.next = index + 1;
    }

    async confirmSaved(): Promise<void> {
        this.check();
        if (this.next !== 3 || this.outstanding !== null) {
            throw new Error("All three Easy Mode receipts are required before storage completion.");
        }
        await this.bounded(() => this.saved, SLOT_COMPLETION_MS,
            "Easy Mode storage completion is unconfirmed. Do not start another write.");
        this.check();
    }

    release(safe: boolean): void {
        if (this.released) return;
        this.session.release(safe);
        if (this.failure === null) {
            this.failure = new Error("The Easy Mode attempt has been released.");
            this.wake();
        }
        this.released = true;
        this.off.forEach((off) => off());
        this.off = [];
    }
}

export function installMachineSlotPort(machine: Machine, store: SlotDatabase): SlotPort {
    machine.installSlotDatabase(store);
    return {
        available: true,
        acquire: async (identity) => {
            // Synchronous exclusion and identity checks: never wait for a brew.
            const bound = Object.freeze({...identity});
            const session = machine.acquireSlotSession(bound);
            return new MachineSlotLease(machine, store, bound, session);
        }
    };
}

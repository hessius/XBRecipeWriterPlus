import {HANDSHAKE_WINDOW_MS} from "@/constants/machine";

import {
    buildType1,
    EVENT,
    parseNotification,
    type MachineInfo,
    type Notification
} from "./protocol";
import type {FoundMachine, MachineTransport} from "./Transport";

/** A subscriber to everything the machine says, decoded. The console uses it. */
export type FrameListener = (frame: Uint8Array, parsed: Notification) => void;

/**
 * One machine, one session.
 *
 * Takes a transport by constructor injection so the whole of this file can be
 * driven by a scripted fake — which matters, because the layer underneath it
 * cannot be tested at all.
 */
export default class Machine {
    public info: MachineInfo | null = null;
    public state: number | null = null;

    private transport: MachineTransport;
    private frameListeners = new Set<FrameListener>();
    private notificationListeners = new Set<(parsed: Notification) => void>();
    private unsubscribe: (() => void)[] = [];

    constructor(transport: MachineTransport) {
        this.transport = transport;
    }

    scan(): Promise<FoundMachine[]> {
        return this.transport.scan();
    }

    async connect(id: string): Promise<void> {
        try {
            await this.transport.connect(id);
        } catch {
            // The machine permits one link at a time and does not reject a
            // second one so much as ignore it, so a failure here is almost
            // always the official app holding the slot. Say that, rather than
            // implying the hardware is at fault.
            throw new Error("The machine is already in use by another app.");
        }

        this.unsubscribe.push(
            this.transport.onFrame((frame) => this.receive(frame)),
            this.transport.onDisconnect(() => this.forget())
        );

        // First write, before anything else is queued: the machine ignores
        // every command that follows if the handshake misses its window.
        await this.transport.write(buildType1(8100, [185, 1]));
        await this.requestInfo();
    }

    /**
     * Ask the machine to describe itself. The reply arrives as a frame.
     *
     * 40521 is documented as a *notification*, and no source records a command
     * that requests it — the machine may well send it unprompted after the
     * handshake. Sending it costs nothing if it is ignored, and step 2 of the
     * hardware checklist is what settles whether it was ever needed.
     */
    async requestInfo(): Promise<void> {
        await this.transport.write(buildType1(EVENT.MACHINE_INFO));
    }

    async disconnect(): Promise<void> {
        await this.transport.disconnect();
        this.forget();
    }

    isConnected(): boolean {
        return this.transport.isConnected();
    }

    /** Send an already-built frame. The brew path and the console both use it. */
    send(frame: Uint8Array): Promise<void> {
        this.frameListeners.forEach((listener) =>
            listener(frame, {kind: "unknown", raw: frame}));
        return this.transport.write(frame);
    }

    /** Every frame in either direction, for the console's log. */
    onFrame(listener: FrameListener): () => void {
        this.frameListeners.add(listener);
        return () => this.frameListeners.delete(listener);
    }

    /** Decoded notifications only. The brew state machine uses this. */
    onNotification(listener: (parsed: Notification) => void): () => void {
        this.notificationListeners.add(listener);
        return () => this.notificationListeners.delete(listener);
    }

    private receive(frame: Uint8Array): void {
        const parsed = parseNotification(frame);
        if (parsed.kind === "status") this.state = parsed.state;
        if (parsed.kind === "info") this.info = parsed;
        this.frameListeners.forEach((listener) => listener(frame, parsed));
        this.notificationListeners.forEach((listener) => listener(parsed));
    }

    private forget(): void {
        this.unsubscribe.forEach((off) => off());
        this.unsubscribe = [];
        // Not merely tidiness: a stale info blob would let the app claim the
        // tank is full and the mode is PRO about a machine it is no longer
        // talking to.
        this.info = null;
        this.state = null;
    }
}

/** Exported for the copy that explains the handshake budget. */
export {HANDSHAKE_WINDOW_MS};
